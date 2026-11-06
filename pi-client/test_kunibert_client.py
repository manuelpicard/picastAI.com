import contextlib
import io
import os
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

from kunibert_client import (
    INTRO_MARKER_NAME,
    ApiError,
    ClientConfig,
    ClientState,
    DryRunAudio,
    DryRunButtons,
    DryRunLed,
    GpioButtons,
    GpioStatusLed,
    HardwareError,
    KunibertClient,
    NoRedirectHandler,
    PicastApi,
    encode_wav,
    main,
    multipart_form,
    parse_args,
    same_origin,
    validate_wav,
)


class FakeApi:
    def __init__(self, intro_error=None):
        self.questions = 0
        self.stories = 0
        self.intros = 0
        self.intro_error = intro_error

    def health(self):
        return True

    def fetch_intro(self):
        self.intros += 1
        if self.intro_error is not None:
            raise self.intro_error
        return "0123456789ab", encode_wav(b"\x00\x00" * 8000, 16000, 1, 2)

    def ask_question(self, wav):
        self.questions += 1
        return wav

    def request_story(self):
        self.stories += 1
        return encode_wav(b"\x00\x00" * 8000, 16000, 1, 2)


class PressedButtons(DryRunButtons):
    def __init__(self, speech=False, story=False, mic_off=False):
        self.speech_pressed = speech
        self.story_pressed = story
        self.mic_off = mic_off
        self.closed = False

    def close(self):
        self.closed = True


class MicOffDuringRecordingAudio:
    def __init__(self, buttons, wav_bytes):
        self.buttons = buttons
        self.wav_bytes = wav_bytes
        self.continued_before_switch = False
        self.continued_after_switch = True

    def record_while_pressed(self, should_continue, max_seconds):
        self.continued_before_switch = should_continue()
        self.buttons.mic_off = True
        self.continued_after_switch = should_continue()
        # Simuliert, dass der Audioadapter beim Umschalten noch einen letzten
        # bereits gepufferten Block zurückliefert. Der Client muss ihn verwerfen.
        return self.wav_bytes


class DisconnectDuringRecordingAudio:
    def __init__(self, buttons, switch_mic_off):
        self.buttons = buttons
        self.switch_mic_off = switch_mic_off
        self.continued_before_disconnect = False

    def record_while_pressed(self, should_continue, max_seconds):
        self.continued_before_disconnect = should_continue()
        if self.switch_mic_off:
            self.buttons.mic_off = True
        raise HardwareError("USB-Audiointerface während Aufnahme getrennt")


class StopRequestedDuringRecordingAudio:
    def __init__(self, wav_bytes):
        self.wav_bytes = wav_bytes
        self.client = None
        self.continued_before_stop = False
        self.continued_after_stop = True

    def record_while_pressed(self, should_continue, max_seconds):
        self.continued_before_stop = should_continue()
        self.client.stop_requested = True
        self.continued_after_stop = should_continue()
        # Der Stream kann beim Beenden noch einen letzten Block zurückgeben.
        return self.wav_bytes


class CaptureAudioOutput:
    def __init__(self):
        self.played = []

    def play_wav(self, wav_bytes):
        self.played.append(wav_bytes)


class CaptureLed:
    def __init__(self):
        self.modes = []
        self.closed = False

    def set(self, mode):
        self.modes.append(mode)

    def close(self):
        self.closed = True


class StopAfterPlaybackOutput(CaptureAudioOutput):
    """Beendet den Client nach der ersten Wiedergabe, damit run() in Tests zurückkehrt."""

    def __init__(self, fail_with=None):
        super().__init__()
        self.client = None
        self.fail_with = fail_with

    def play_wav(self, wav_bytes):
        if self.fail_with is not None:
            raise self.fail_with
        super().play_wav(wav_bytes)
        self.client.stop_requested = True


class KunibertClientTests(unittest.TestCase):
    def setUp(self):
        # Standard in den Tests: Das Gerät hat sich schon vorgestellt (Merkdatei vorhanden),
        # damit die KI-Ansage die übrigen Tests nicht stört. Die Ansage testen die Tests unten.
        self._state = tempfile.TemporaryDirectory()
        self.addCleanup(self._state.cleanup)
        self.state_dir = Path(self._state.name)
        (self.state_dir / INTRO_MARKER_NAME).write_text("test\n", encoding="utf-8")

    def config(self, **overrides):
        settings = dict(dry_run=True, min_record_seconds=0.1, state_dir=self.state_dir)
        settings.update(overrides)
        return ClientConfig(**settings)

    def test_valid_state_path_for_story(self):
        buttons = PressedButtons(story=True)
        client = KunibertClient(
            self.config(), FakeApi(), DryRunAudio(self.config()), DryRunAudio(self.config()), buttons, DryRunLed()
        )
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)
        client.handle_story()
        self.assertEqual(client.state, ClientState.READY)
        self.assertEqual(client.api.stories, 1)
        self.assertIn(ClientState.REQUESTING_STORY, client.state_history)
        self.assertIn(ClientState.PLAYING, client.state_history)

    def test_mic_off_blocks_actions(self):
        buttons = PressedButtons(story=True, mic_off=True)
        client = KunibertClient(
            self.config(), FakeApi(), DryRunAudio(self.config()), DryRunAudio(self.config()), buttons, DryRunLed()
        )
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.MIC_OFF)
        client.step()
        self.assertEqual(client.state, ClientState.MIC_OFF)
        self.assertEqual(client.api.stories, 0)

    def test_gpio_buttons_use_50ms_bounce_filter_for_all_inputs(self):
        created = []

        class FakeButton:
            def __init__(self, pin, **options):
                self.pin = pin
                self.options = options
                self.closed = False
                created.append(self)

            def close(self):
                self.closed = True

        gpiozero_stub = ModuleType("gpiozero")
        gpiozero_stub.Button = FakeButton
        config = ClientConfig(speech_button_gpio=17, story_button_gpio=27, mic_off_gpio=22)

        with patch.dict(sys.modules, {"gpiozero": gpiozero_stub}):
            buttons = GpioButtons(config)

        self.assertEqual(
            [(button.pin, button.options) for button in created],
            [
                (17, {"pull_up": True, "bounce_time": 0.05}),
                (27, {"pull_up": True, "bounce_time": 0.05}),
                (22, {"pull_up": True, "bounce_time": 0.05}),
            ],
        )
        buttons.close()
        self.assertTrue(all(button.closed for button in created))

    def test_simultaneous_speech_and_story_buttons_prioritize_speech(self):
        config = self.config()
        buttons = PressedButtons(speech=True, story=True)
        api = FakeApi()
        client = KunibertClient(
            config,
            api,
            DryRunAudio(config),
            CaptureAudioOutput(),
            buttons,
            CaptureLed(),
        )
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)

        client.step()

        self.assertEqual(api.questions, 1)
        self.assertEqual(api.stories, 0)
        self.assertIn(ClientState.RECORDING, client.state_history)
        self.assertNotIn(ClientState.REQUESTING_STORY, client.state_history)
        self.assertEqual(client.state, ClientState.READY)

    def test_mic_off_during_recording_aborts_and_discards_audio(self):
        config = self.config()
        buttons = PressedButtons(speech=True)
        audio = MicOffDuringRecordingAudio(
            buttons,
            encode_wav(b"\x00\x00" * 8000, config.sample_rate, config.channels, config.sample_width),
        )
        api = FakeApi()
        output = CaptureAudioOutput()
        led = CaptureLed()
        client = KunibertClient(config, api, audio, output, buttons, led)
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)

        client.handle_question()

        self.assertTrue(audio.continued_before_switch)
        self.assertFalse(audio.continued_after_switch)
        self.assertEqual(api.questions, 0, "bei Mikrofon-Aus darf kein Audiopuffer hochgeladen werden")
        self.assertEqual(output.played, [], "nach Abbruch darf keine Audioantwort abgespielt werden")
        self.assertEqual(client.state, ClientState.MIC_OFF)
        self.assertEqual(led.modes[-1], "mic_off")

    def test_usb_disconnect_during_recording_with_mic_off_enters_mic_off(self):
        config = self.config()
        buttons = PressedButtons(speech=True)
        audio = DisconnectDuringRecordingAudio(buttons, switch_mic_off=True)
        api = FakeApi()
        output = CaptureAudioOutput()
        led = CaptureLed()
        client = KunibertClient(config, api, audio, output, buttons, led)
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)

        client.handle_question()

        self.assertTrue(audio.continued_before_disconnect)
        self.assertEqual(client.state, ClientState.MIC_OFF)
        self.assertEqual(api.questions, 0)
        self.assertEqual(output.played, [])
        self.assertEqual(led.modes[-1], "mic_off")

    def test_unexpected_usb_disconnect_during_recording_recovers_to_ready(self):
        config = self.config()
        buttons = PressedButtons(speech=True)
        audio = DisconnectDuringRecordingAudio(buttons, switch_mic_off=False)
        api = FakeApi()
        output = CaptureAudioOutput()
        led = CaptureLed()
        client = KunibertClient(config, api, audio, output, buttons, led)
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)

        with patch("kunibert_client.time.sleep") as sleep:
            client.handle_question()

        self.assertTrue(audio.continued_before_disconnect)
        self.assertEqual(client.state, ClientState.READY)
        self.assertIn(ClientState.ERROR, client.state_history)
        self.assertIsNotNone(client.last_error)
        self.assertEqual(api.questions, 0)
        self.assertEqual(output.played, [])
        self.assertEqual(led.modes[-1], "ready")
        sleep.assert_called_once_with(1.0)

    def test_shutdown_during_recording_discards_audio_and_closes_hardware(self):
        config = self.config()
        buttons = PressedButtons(speech=True)
        audio = StopRequestedDuringRecordingAudio(
            encode_wav(b"\x00\x00" * 8000, config.sample_rate, config.channels, config.sample_width)
        )
        api = FakeApi()
        output = CaptureAudioOutput()
        led = CaptureLed()
        client = KunibertClient(config, api, audio, output, buttons, led)
        audio.client = client

        with patch("kunibert_client.time.sleep"):
            client.run()

        self.assertTrue(audio.continued_before_stop)
        self.assertFalse(audio.continued_after_stop)
        self.assertEqual(client.state, ClientState.SHUTDOWN)
        self.assertEqual(api.questions, 0, "beim Shutdown darf kein Audio hochgeladen werden")
        self.assertEqual(output.played, [])
        self.assertEqual(led.modes[-1], "off")
        self.assertTrue(buttons.closed)
        self.assertTrue(led.closed)

    # --- KI-Ansage beim ersten Einschalten (Art. 50 KI-Verordnung) ---

    def _intro_client(self, config, api=None, output=None, buttons=None):
        api = api or FakeApi()
        output = output or StopAfterPlaybackOutput()
        led = CaptureLed()
        client = KunibertClient(config, api, DryRunAudio(config), output, buttons or PressedButtons(), led)
        if hasattr(output, "client"):
            output.client = client
        return client, api, output, led

    def _forget_intro(self):
        marker = self.state_dir / INTRO_MARKER_NAME
        marker.unlink()
        return marker

    def test_first_start_plays_intro_before_ready_and_remembers_it(self):
        marker = self._forget_intro()
        client, api, output, led = self._intro_client(self.config(), buttons=PressedButtons(speech=True))

        with patch("kunibert_client.time.sleep"):
            client.run()

        self.assertEqual(api.intros, 1)
        self.assertEqual(len(output.played), 1)
        self.assertEqual(
            client.state_history,
            [ClientState.WIFI_CONNECTING, ClientState.PLAYING, ClientState.READY, ClientState.SHUTDOWN],
        )
        self.assertEqual(led.modes, ["busy", "busy", "ready", "off"])
        self.assertEqual(marker.read_text(encoding="utf-8").strip(), "0123456789ab")
        self.assertEqual(api.questions, 0, "eine gedrückte Sprechtaste darf während der Ansage nichts auslösen")
        self.assertIsNone(client.last_error)

    def test_intro_is_skipped_when_the_device_already_introduced_itself(self):
        client, api, output, _led = self._intro_client(self.config())
        client.stop_requested = True  # Schleife nicht betreten; nur der Start interessiert

        client.run()

        self.assertEqual(api.intros, 0, "kein Serveraufruf, wenn die Merkdatei da ist")
        self.assertEqual(output.played, [])
        self.assertEqual(
            client.state_history, [ClientState.WIFI_CONNECTING, ClientState.READY, ClientState.SHUTDOWN]
        )

    def test_replay_intro_plays_again_even_with_marker(self):
        client, api, output, _led = self._intro_client(self.config(replay_intro=True))

        client.run()

        self.assertEqual(api.intros, 1)
        self.assertEqual(len(output.played), 1)
        self.assertIn(ClientState.PLAYING, client.state_history)

    def test_device_is_not_released_when_the_intro_cannot_be_fetched(self):
        marker = self._forget_intro()
        client, api, output, _led = self._intro_client(
            self.config(), api=FakeApi(intro_error=ApiError("Server nicht erreichbar", retryable=True))
        )

        client.run()

        self.assertEqual(output.played, [])
        self.assertNotIn(ClientState.READY, client.state_history)
        self.assertIn(ClientState.ERROR, client.state_history)
        self.assertEqual(client.state, ClientState.SHUTDOWN)
        self.assertIn("Server nicht erreichbar", client.last_error)
        self.assertFalse(marker.exists())

    def test_device_is_not_released_and_marker_not_written_when_playback_fails(self):
        marker = self._forget_intro()
        client, api, output, _led = self._intro_client(
            self.config(), output=StopAfterPlaybackOutput(fail_with=HardwareError("Lautsprecher getrennt"))
        )

        client.run()

        self.assertEqual(api.intros, 1)
        self.assertNotIn(ClientState.READY, client.state_history)
        self.assertIn(ClientState.ERROR, client.state_history)
        self.assertIn("Lautsprecher getrennt", client.last_error)
        self.assertFalse(marker.exists(), "ohne vollständige Wiedergabe gilt die Ansage nicht als gespielt")

    def test_unwritable_marker_does_not_stop_the_client(self):
        blocker = self.state_dir / "blocker"
        blocker.write_text("keine Ordner hier", encoding="utf-8")
        client, api, output, _led = self._intro_client(self.config(state_dir=blocker / "state"))

        with self.assertLogs("kunibert", level="WARNING") as logs:
            client.run()

        self.assertEqual(len(output.played), 1)
        self.assertIn(ClientState.READY, client.state_history)
        self.assertTrue(any("Merkdatei" in line for line in logs.output), logs.output)

    def test_intro_plays_even_when_the_microphone_switch_is_off(self):
        self._forget_intro()
        client, _api, output, _led = self._intro_client(self.config(), buttons=PressedButtons(mic_off=True))

        client.run()

        self.assertEqual(len(output.played), 1)
        self.assertEqual(
            client.state_history,
            [ClientState.WIFI_CONNECTING, ClientState.PLAYING, ClientState.MIC_OFF, ClientState.SHUTDOWN],
        )

    def test_fetch_intro_requests_the_intro_path_and_returns_version_and_audio(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        audio = encode_wav(b"\x00\x00" * 200, config.sample_rate, config.channels, config.sample_width)
        answer = {"type": "intro", "audio_url": "/v1/device/audio/i", "version": "abc123def456"}

        with patch.object(api, "_with_retries", return_value=answer) as retries, patch.object(
            api, "_download_audio", return_value=audio
        ) as download:
            version, wav = api.fetch_intro()

        self.assertEqual((version, wav), ("abc123def456", audio))
        self.assertEqual(retries.call_args.args[:3], ("GET", "/v1/device/intro", None))
        self.assertEqual(retries.call_args.kwargs["timeout"], config.pipeline_timeout_seconds)
        self.assertEqual(retries.call_args.args[3]["Authorization"], "Bearer device-test-token")
        download.assert_called_once_with(answer)

    def test_fetch_intro_cleans_up_the_version_before_it_reaches_the_marker_file(self):
        api = PicastApi(ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token"))
        for raw, expected in (("../etc/pass\nwd", "..etcpasswd"), ("", "unbekannt"), (None, "unbekannt"), ("a" * 100, "a" * 64)):
            answer = {"audio_url": "/v1/device/audio/i"}
            if raw is not None:
                answer["version"] = raw
            with patch.object(api, "_with_retries", return_value=answer), patch.object(api, "_download_audio", return_value=b"x"):
                self.assertEqual(api.fetch_intro()[0], expected, repr(raw))

    def test_fetch_intro_is_not_retried_when_the_server_has_no_voice_configured(self):
        api = self._retry_api()
        body = b'{"error":"tts_not_configured","retryable":false}'
        with patch.object(api, "_request", return_value=(503, {}, body)) as request, patch("kunibert_client.time.sleep"):
            with self.assertRaises(ApiError) as caught:
                api.fetch_intro()
        self.assertEqual(request.call_count, 1)
        self.assertFalse(caught.exception.retryable)

    def test_state_dir_comes_from_the_environment_with_a_default(self):
        self.assertEqual(ClientConfig().state_dir, Path("/var/lib/kunibert/state"))
        with patch.dict(os.environ, {"KUNIBERT_STATE_DIR": "/tmp/kunibert-state"}):
            self.assertEqual(ClientConfig.from_env().state_dir, Path("/tmp/kunibert-state"))
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("KUNIBERT_STATE_DIR", None)
            self.assertEqual(ClientConfig.from_env().state_dir, Path("/var/lib/kunibert/state"))

    def test_command_line_flag_ansage_replays_the_intro(self):
        self.assertFalse(parse_args([]).ansage)
        self.assertTrue(parse_args(["--ansage"]).ansage)
        fake_client = MagicMock(last_error=None)
        with patch.dict(os.environ, {"PICASTAI_DEVICE_TOKEN": "device-test-token"}), patch(
            "kunibert_client.build_client", return_value=fake_client
        ) as build, patch("kunibert_client.signal.signal"):
            self.assertEqual(main(["--ansage"]), 0)
            self.assertTrue(build.call_args.args[0].replay_intro)
            self.assertEqual(main([]), 0)
            self.assertFalse(build.call_args.args[0].replay_intro)

    def test_once_ansage_prints_version_and_size_without_playing(self):
        out = io.StringIO()
        with patch.dict(os.environ, {"PICASTAI_DEVICE_TOKEN": "device-test-token"}), patch(
            "kunibert_client.PicastApi.fetch_intro", return_value=("abc123def456", b"x" * 1234)
        ), contextlib.redirect_stdout(out):
            self.assertEqual(main(["--once", "ansage"]), 0)
        self.assertIn("1234 Bytes", out.getvalue())
        self.assertIn("abc123def456", out.getvalue())

    def test_led_modes_have_distinct_patterns(self):
        recording = GpioStatusLed.pattern_for_mode("recording")
        busy = GpioStatusLed.pattern_for_mode("busy")
        error = GpioStatusLed.pattern_for_mode("error")
        mic_off = GpioStatusLed.pattern_for_mode("mic_off")

        self.assertTrue(recording)
        self.assertTrue(busy)
        self.assertTrue(error)
        self.assertTrue(mic_off)
        self.assertEqual(len({recording, busy, error, mic_off}), 4)
        self.assertEqual(sum(1 for is_on, _ in mic_off if is_on), 2)
        self.assertEqual(GpioStatusLed.pattern_for_mode("ready"), ())

    def test_multipart_contains_audio_and_fields(self):
        payload, content_type = multipart_form(
            {"locale": "de-DE", "age_band": "6-10"}, "audio", "question.wav", b"RIFF", "audio/wav"
        )
        self.assertIn(b'name="locale"', payload)
        self.assertIn(b'name="age_band"', payload)
        self.assertIn(b'filename="question.wav"', payload)
        self.assertIn(b"RIFF", payload)
        self.assertTrue(content_type.startswith("multipart/form-data; boundary="))

    def test_encode_wav_has_expected_format(self):
        data = encode_wav(b"\x00\x00" * 100, 16000, 1, 2)
        with wave.open(io.BytesIO(data), "rb") as wav:
            self.assertEqual(wav.getframerate(), 16000)
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getsampwidth(), 2)
            self.assertEqual(wav.getnframes(), 100)

    def test_validate_wav_accepts_configured_format(self):
        config = self.config()
        data = encode_wav(b"\x00\x00" * 200, config.sample_rate, config.channels, config.sample_width)

        self.assertIsNone(validate_wav(data, config))

    def test_validate_wav_rejects_wrong_rate_channels_and_sample_width(self):
        config = self.config()
        invalid_wavs = {
            "rate": encode_wav(b"\x00\x00" * 200, 8_000, 1, 2),
            "channels": encode_wav(b"\x00\x00\x00\x00" * 200, 16_000, 2, 2),
            "sample_width": encode_wav(b"\x00" * 200, 16_000, 1, 1),
        }

        for field, data in invalid_wavs.items():
            with self.subTest(field=field), self.assertRaises(ApiError):
                validate_wav(data, config)

    def test_validate_wav_rejects_malformed_header(self):
        with self.assertRaises(ApiError):
            validate_wav(b"not a WAV file", self.config())

    def test_validate_wav_rejects_empty_audio(self):
        empty_wav = encode_wav(b"", 16_000, 1, 2)

        with self.assertRaises(ApiError):
            validate_wav(empty_wav, self.config())

    def test_api_requires_token_unless_dry_run(self):
        config = ClientConfig(api_base_url="http://127.0.0.1:1", device_token="", dry_run=False)
        with self.assertRaises(ApiError):
            PicastApi(config)

    def test_download_audio_accepts_valid_same_origin_wav(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        audio = encode_wav(b"\x00\x00" * 200, config.sample_rate, config.channels, config.sample_width)

        with patch.object(
            api,
            "_request_absolute",
            return_value=(200, {"Content-Type": "audio/wav"}, audio),
        ) as request:
            result = api._download_audio({"audio_url": "/v1/device/audio/test-id"})

        self.assertEqual(result, audio)
        request.assert_called_once()
        self.assertEqual(request.call_args.args[0], "GET")
        self.assertEqual(request.call_args.args[1], "https://picastAI.com/v1/device/audio/test-id")
        self.assertEqual(request.call_args.args[3]["Authorization"], "Bearer device-test-token")

    def test_download_audio_rejects_foreign_host_and_https_downgrade(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        disallowed_urls = (
            "https://attacker.invalid/audio.wav",
            "http://picastAI.com/audio.wav",
        )

        for audio_url in disallowed_urls:
            with self.subTest(audio_url=audio_url):
                with patch.object(api, "_request_absolute") as request:
                    with self.assertRaises(ApiError):
                        api._download_audio({"audio_url": audio_url})
                    request.assert_not_called()

    def test_download_audio_ignores_host_case_and_default_port(self):
        # Der Pi-Standard "https://picastAI.com" hat Großbuchstaben; ein Server, der
        # den Host kleinschreibt oder :443 anhängt, bleibt derselbe Origin.
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        audio = encode_wav(b"\x00\x00" * 200, config.sample_rate, config.channels, config.sample_width)

        for audio_url in (
            "https://picastai.com/v1/device/audio/x",
            "https://PICASTAI.COM:443/v1/device/audio/x",
            "HTTPS://picastAI.com/v1/device/audio/x",
        ):
            with self.subTest(audio_url=audio_url):
                with patch.object(
                    api,
                    "_request_absolute",
                    return_value=(200, {"Content-Type": "audio/wav"}, audio),
                ) as request:
                    self.assertEqual(api._download_audio({"audio_url": audio_url}), audio)
                request.assert_called_once()

    def test_download_audio_rejects_other_port_userinfo_and_lookalike_hosts(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        for audio_url in (
            "https://picastai.com:8443/v1/device/audio/x",
            "https://user:pw@picastai.com/v1/device/audio/x",
            "https://picastai.com.attacker.invalid/v1/device/audio/x",
            "https://attacker.invalid/https://picastai.com/",
            "https://picastai.com:notaport/v1/device/audio/x",
            "https://[picastai.com/v1/device/audio/x",
            "ftp://picastai.com/v1/device/audio/x",
        ):
            with self.subTest(audio_url=audio_url):
                with patch.object(api, "_request_absolute") as request:
                    with self.assertRaises(ApiError):
                        api._download_audio({"audio_url": audio_url})
                    request.assert_not_called()

    def test_same_origin_compares_scheme_host_and_effective_port(self):
        self.assertTrue(same_origin("https://picastAI.com/a", "https://picastai.com"))
        self.assertTrue(same_origin("https://picastai.com:443/a", "https://picastai.com"))
        self.assertTrue(same_origin("http://192.168.1.20:3000/a", "http://192.168.1.20:3000"))
        self.assertFalse(same_origin("http://picastai.com", "https://picastai.com"))
        self.assertFalse(same_origin("https://picastai.com:444", "https://picastai.com"))
        self.assertFalse(same_origin("https://a.example", "https://b.example"))
        self.assertFalse(same_origin("https://u@picastai.com", "https://picastai.com"))
        self.assertFalse(same_origin("", ""))
        self.assertFalse(same_origin("kein-url", "kein-url"))

    def test_request_absolute_uses_handler_that_rejects_redirects(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers.items.return_value = [("Content-Type", "application/json")]
        response.read.return_value = b"{}"
        opener = MagicMock()
        opener.open.return_value = response

        with patch("kunibert_client.build_opener", return_value=opener) as build_opener:
            result = api._request_absolute("GET", "https://picastAI.com/health", None, {})

        self.assertEqual(result, (200, {"Content-Type": "application/json"}, b"{}"))
        handler = build_opener.call_args.args[0]
        self.assertIsInstance(handler, NoRedirectHandler)
        self.assertIsNone(
            handler.redirect_request(None, None, 302, "Found", {}, "https://attacker.invalid/audio.wav")
        )

    def test_pipeline_requests_wait_longer_than_the_server_chain(self):
        # Frage und Geschichte dürfen nicht nach 30 s abbrechen: der Server braucht im
        # schlechtesten Fall Spracherkennung + Sprachmodell + Sprachsynthese.
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        self.assertGreater(config.pipeline_timeout_seconds, 45 + 30 + 45)
        api = PicastApi(config)
        audio = encode_wav(b"\x00\x00" * 200, config.sample_rate, config.channels, config.sample_width)
        responses = [
            (200, {}, b'{"audio_url":"/v1/device/audio/x"}'),
            (200, {"Content-Type": "audio/wav"}, audio),
        ]
        with patch.object(api, "_request_absolute", side_effect=responses) as request:
            self.assertEqual(api.request_story(), audio)

        post_call, get_call = request.call_args_list
        self.assertEqual(post_call.args[0], "POST")
        self.assertEqual(post_call.kwargs["timeout"], config.pipeline_timeout_seconds)
        self.assertEqual(get_call.args[0], "GET")
        self.assertEqual(get_call.kwargs["timeout"], config.audio_timeout_seconds)

    def test_question_uses_pipeline_timeout(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        wav = encode_wav(b"\x00\x00" * 8000, config.sample_rate, config.channels, config.sample_width)
        with patch.object(api, "_with_retries", return_value={"audio_url": "/v1/device/audio/x"}) as retries, \
                patch.object(api, "_download_audio", return_value=b"wav"):
            api.ask_question(wav)
        self.assertEqual(retries.call_args.kwargs["timeout"], config.pipeline_timeout_seconds)

    def test_timeouts_from_environment(self):
        with patch.dict("os.environ", {"KUNIBERT_PIPELINE_TIMEOUT": "200", "KUNIBERT_REQUEST_TIMEOUT": "20"}):
            config = ClientConfig.from_env()
        self.assertEqual(config.pipeline_timeout_seconds, 200.0)
        self.assertEqual(config.request_timeout_seconds, 20.0)

    def test_request_absolute_passes_timeout_to_socket(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        api = PicastApi(config)
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers.items.return_value = []
        response.read.return_value = b"{}"
        opener = MagicMock()
        opener.open.return_value = response
        with patch("kunibert_client.build_opener", return_value=opener):
            api._request_absolute("GET", "https://picastAI.com/health", None, {})
            api._request_absolute("POST", "https://picastAI.com/v1/device/kunibert-story", b"{}", {}, timeout=140.0)
        self.assertEqual(opener.open.call_args_list[0].kwargs["timeout"], config.request_timeout_seconds)
        self.assertEqual(opener.open.call_args_list[1].kwargs["timeout"], 140.0)

    def _retry_api(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token", retry_count=2)
        return PicastApi(config)

    def test_retries_503_until_success(self):
        api = self._retry_api()
        responses = [
            (503, {}, b'{"error":"voice_provider_failed","retryable":true}'),
            (200, {}, b'{"audio_url":"/v1/device/audio/x"}'),
        ]
        with patch.object(api, "_request", side_effect=responses) as request, patch("kunibert_client.time.sleep"):
            result = api._with_retries("POST", "/v1/device/question", b"", {})
        self.assertEqual(result, {"audio_url": "/v1/device/audio/x"})
        self.assertEqual(request.call_count, 2)

    def test_does_not_retry_when_server_says_not_retryable(self):
        api = self._retry_api()
        body = b'{"error":"voice_provider_failed","retryable":false}'
        with patch.object(api, "_request", return_value=(502, {}, body)) as request, patch("kunibert_client.time.sleep"):
            with self.assertRaises(ApiError) as caught:
                api._with_retries("POST", "/v1/device/question", b"", {})
        self.assertEqual(request.call_count, 1)
        self.assertFalse(caught.exception.retryable)
        self.assertEqual(caught.exception.status, 502)

    def test_retries_5xx_without_json_body_and_gives_up_after_retry_count(self):
        api = self._retry_api()
        with patch.object(api, "_request", return_value=(500, {}, b"<html>boom</html>")) as request, patch(
            "kunibert_client.time.sleep"
        ):
            with self.assertRaises(ApiError):
                api._with_retries("POST", "/v1/device/question", b"", {})
        self.assertEqual(request.call_count, 3)

    def test_does_not_retry_client_errors_413_and_401(self):
        for status in (401, 413):
            api = self._retry_api()
            with patch.object(api, "_request", return_value=(status, {}, b"{}")) as request, patch("kunibert_client.time.sleep"):
                with self.assertRaises(ApiError):
                    api._with_retries("POST", "/v1/device/question", b"", {})
            self.assertEqual(request.call_count, 1, status)


if __name__ == "__main__":
    unittest.main()
