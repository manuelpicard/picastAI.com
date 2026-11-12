import io
import os
import sys
import unittest
import wave
from types import ModuleType
from unittest.mock import MagicMock, patch

from kunibert_client import (
    ApiError,
    ClientConfig,
    ClientState,
    DryRunAudio,
    DryRunButtons,
    DryRunLed,
    GpioButtons,
    GpioStatusLed,
    HardwareError,
    KeyboardButtons,
    ConsoleLed,
    KunibertClient,
    NoRedirectHandler,
    PicastApi,
    SILENT_PEAK,
    SoundDeviceAudio,
    encode_wav,
    multipart_form,
    parse_audio_device,
    pcm16_peak,
    same_origin,
    validate_wav,
)


class FakeApi:
    def __init__(self):
        self.questions = 0
        self.stories = 0

    def health(self):
        return True

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


class FakeClock:
    """Uhr, die nur vorgestellt wird, wenn der Test es sagt."""

    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class ClockedRecordingAudio(DryRunAudio):
    """Aufnahme, die `seconds` dauert (auf der Test-Uhr)."""

    def __init__(self, config, clock, seconds):
        super().__init__(config)
        self.clock = clock
        self.seconds = seconds

    def record_while_pressed(self, is_pressed, max_seconds):
        self.clock.advance(self.seconds)
        return super().record_while_pressed(is_pressed, max_seconds)


class SlowApi(FakeApi):
    """Server, der `seconds` für die Antwort braucht (auf der Test-Uhr)."""

    def __init__(self, clock, seconds, fail=False):
        super().__init__()
        self.clock = clock
        self.seconds = seconds
        self.fail = fail

    def ask_question(self, wav):
        self.clock.advance(self.seconds)
        if self.fail:
            raise ApiError("API-Fehler (HTTP 503)", status=503, retryable=True)
        return super().ask_question(wav)

    def request_story(self):
        self.clock.advance(self.seconds)
        return super().request_story()


class CaptureAudioOutput:
    def __init__(self, during_playback=None):
        self.played = []
        self.stop_checks = []
        # Wird während des Abspielens aufgerufen (zum Beispiel ein Tastendruck in dieser Zeit).
        self.during_playback = during_playback

    def play_wav(self, wav_bytes, should_stop=None):
        self.played.append(wav_bytes)
        if self.during_playback:
            self.during_playback()
        self.stop_checks.append(should_stop() if should_stop else None)


class KeyboardRecordingAudio(DryRunAudio):
    """Aufnahme wie am Rechner: Sie endet mit der zweiten Eingabetaste."""

    def __init__(self, config, keys):
        super().__init__(config)
        self.keys = keys

    def record_while_pressed(self, is_pressed, max_seconds):
        self.keys.handle_line("\n")  # zweite Eingabetaste: Aufnahme beenden und senden
        return super().record_while_pressed(is_pressed, max_seconds)


class CaptureLed:
    def __init__(self):
        self.modes = []
        self.closed = False

    def set(self, mode):
        self.modes.append(mode)

    def close(self):
        self.closed = True


class FlakyHealthApi(FakeApi):
    """Server, der beim Start erst nach einigen Versuchen erreichbar ist."""

    def __init__(self, outcomes):
        super().__init__()
        self.outcomes = list(outcomes)
        self.health_calls = 0

    def health(self):
        self.health_calls += 1
        outcome = self.outcomes.pop(0) if self.outcomes else True
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class StartupTests(unittest.TestCase):
    def client(self, api, buttons=None):
        config = ClientConfig(dry_run=False, device_token="t", connect_retry_seconds=1.0)
        led = CaptureLed()
        audio = DryRunAudio(config)
        client = KunibertClient(config, api, audio, audio, buttons or PressedButtons(), led)
        client.slept = []
        client.sleep = client.slept.append
        return client, led

    def test_startup_keeps_trying_until_the_server_answers(self):
        api = FlakyHealthApi([OSError("Temporary failure in name resolution"), False, TimeoutError("timed out"), True])
        client, led = self.client(api)
        client.transition(ClientState.WIFI_CONNECTING)
        self.assertTrue(client.wait_for_server())
        self.assertEqual(api.health_calls, 4)
        # Fehler-LED während des Wartens, kein Absturz, kein Ende des Programms.
        self.assertEqual(client.state, ClientState.ERROR)
        self.assertIn("error", led.modes)
        self.assertAlmostEqual(sum(client.slept), 3.0)
        client.transition(ClientState.READY)

    def test_startup_goes_straight_to_ready_when_server_is_up(self):
        api = FlakyHealthApi([True])
        client, led = self.client(api)
        client.transition(ClientState.WIFI_CONNECTING)
        self.assertTrue(client.wait_for_server())
        self.assertEqual(client.state, ClientState.WIFI_CONNECTING)
        self.assertEqual(client.slept, [])

    def test_startup_wait_ends_quickly_on_shutdown_request(self):
        api = FlakyHealthApi([OSError("kein Netz")] * 50)
        client, _led = self.client(api)

        def sleep_then_stop(seconds):
            client.stop_requested = True

        client.sleep = sleep_then_stop
        client.transition(ClientState.WIFI_CONNECTING)
        self.assertFalse(client.wait_for_server())
        self.assertEqual(api.health_calls, 1)

    def test_run_survives_unreachable_server_and_shuts_down_cleanly(self):
        api = FlakyHealthApi([OSError("kein Netz")] * 50)
        buttons = PressedButtons()
        client, led = self.client(api, buttons)

        def sleep_then_stop(seconds):
            client.stop_requested = True

        client.sleep = sleep_then_stop
        client.run()
        self.assertEqual(client.state, ClientState.SHUTDOWN)
        self.assertIsNone(client.last_error)
        self.assertTrue(buttons.closed)
        self.assertTrue(led.closed)


class KeyboardButtonsTests(unittest.TestCase):
    def test_enter_toggles_recording_and_g_presses_story_once(self):
        keys = KeyboardButtons(start_reader=False)
        self.assertFalse(keys.speech_pressed)
        keys.handle_line("\n")
        self.assertTrue(keys.speech_pressed)
        keys.handle_line("\n")
        self.assertFalse(keys.speech_pressed)
        keys.handle_line("g\n")
        self.assertTrue(keys.story_pressed)
        self.assertFalse(keys.story_pressed, "ein Tastendruck gilt nur einmal")
        self.assertFalse(keys.mic_off)

    def test_q_and_end_of_input_request_quit_and_stop_recording(self):
        quits = []
        keys = KeyboardButtons(start_reader=False, on_quit=lambda: quits.append(True))
        keys.handle_line("\n")
        keys.handle_line("q\n")
        self.assertEqual(quits, [True])
        self.assertFalse(keys.speech_pressed)

        done = []
        reader = KeyboardButtons(lines=["g\n"], on_quit=lambda: done.append(True))
        reader._thread.join(timeout=2)
        self.assertEqual(done, [True], "Ende der Eingabe beendet den Client")
        self.assertTrue(reader.story_pressed)

    def test_keyboard_run_question_then_story_then_quit(self):
        config = ClientConfig(dry_run=True, min_record_seconds=0.1)
        keys = KeyboardButtons(start_reader=False)
        api = FakeApi()
        out = CaptureAudioOutput()
        client = KunibertClient(config, api, KeyboardRecordingAudio(config, keys), out, keys, ConsoleLed())
        keys.on_quit = lambda: setattr(client, "stop_requested", True)
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)
        keys.handle_line("\n")   # Aufnahme an; die Attrappe drückt beim Aufnehmen die zweite Eingabetaste
        client.step()
        self.assertEqual(api.questions, 1)
        self.assertFalse(keys.speech_pressed)
        keys.handle_line("g\n")
        client.step()
        self.assertEqual(api.stories, 1)
        client.step()
        self.assertEqual(api.stories, 1)
        self.assertEqual(api.questions, 1)
        self.assertEqual(len(out.played), 2)
        keys.handle_line("q\n")
        self.assertTrue(client.stop_requested)

    def test_keys_pressed_while_kunibert_talks_are_ignored(self):
        # Früher begann nach der Antwort sofort eine neue Aufnahme (oder eine Geschichte),
        # wenn während des Wartens oder Abspielens eine Taste gedrückt wurde.
        config = ClientConfig(dry_run=True, min_record_seconds=0.1)
        keys = KeyboardButtons(start_reader=False)
        api = FakeApi()
        out = CaptureAudioOutput(during_playback=lambda: (keys.handle_line("\n"), keys.handle_line("g\n")))
        client = KunibertClient(config, api, KeyboardRecordingAudio(config, keys), out, keys, ConsoleLed())
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)
        keys.handle_line("\n")
        client.step()
        self.assertEqual(client.state, ClientState.READY)
        self.assertFalse(keys.speech_pressed)
        self.assertFalse(keys.story_pressed)
        client.step()
        client.step()
        self.assertEqual((api.questions, api.stories), (1, 0))

    def test_discard_pending_forgets_speech_and_story(self):
        keys = KeyboardButtons(start_reader=False)
        keys.handle_line("\n")
        keys.handle_line("g\n")
        keys.discard_pending()
        self.assertFalse(keys.speech_pressed)
        self.assertFalse(keys.story_pressed)


class KunibertClientTests(unittest.TestCase):
    def config(self):
        return ClientConfig(dry_run=True, min_record_seconds=0.1)

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

    def _timed_client(self, clock, recording_seconds=3.0, api_seconds=7.4, fail=False, speech=True, story=False):
        config = ClientConfig(dry_run=True, min_record_seconds=0.1, device_token="geheim-token-0815")
        buttons = PressedButtons(speech=speech, story=story)
        client = KunibertClient(
            config,
            SlowApi(clock, api_seconds, fail=fail),
            ClockedRecordingAudio(config, clock, recording_seconds),
            CaptureAudioOutput(),
            buttons,
            DryRunLed(),
            clock=clock,
        )
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)
        return client

    def test_question_logs_wait_from_end_of_recording_to_start_of_playback(self):
        clock = FakeClock()
        client = self._timed_client(clock, recording_seconds=3.0, api_seconds=7.4)

        with self.assertLogs("kunibert", level="INFO") as logs:
            client.handle_question()

        timing = [line for line in logs.output if "Zeitmessung" in line]
        # Die 3,0 s Aufnahme zählen nicht mit; gemessen wird erst ab dem Loslassen der Taste.
        self.assertEqual(timing, ["INFO:kunibert:Zeitmessung modus=frage wartezeit_s=7.4"])
        self.assertEqual(client.state, ClientState.READY)
        self.assertEqual(len(client.audio_out.played), 1)

    def test_story_button_logs_wait_from_button_press_to_start_of_playback(self):
        clock = FakeClock()
        client = self._timed_client(clock, api_seconds=18.2, speech=False, story=True)

        with self.assertLogs("kunibert", level="INFO") as logs:
            client.handle_story()

        timing = [line for line in logs.output if "Zeitmessung" in line]
        self.assertEqual(timing, ["INFO:kunibert:Zeitmessung modus=erzaehltaste wartezeit_s=18.2"])

    def test_timing_line_contains_only_keyword_and_number_never_content_or_token(self):
        clock = FakeClock()
        client = self._timed_client(clock)

        with self.assertLogs("kunibert", level="DEBUG") as logs:
            client.handle_question()

        timing = [line for line in logs.output if "Zeitmessung" in line]
        self.assertEqual(len(timing), 1)
        self.assertRegex(timing[0], r"^INFO:kunibert:Zeitmessung modus=(frage|erzaehltaste) wartezeit_s=\d+\.\d$")
        everything = "\n".join(logs.output)
        self.assertNotIn("geheim-token-0815", everything)
        self.assertNotIn(client.config.device_id, timing[0])
        self.assertNotIn("http", timing[0].lower())

    def test_no_timing_line_when_request_fails_or_recording_is_too_short(self):
        clock = FakeClock()
        failing = self._timed_client(clock, fail=True)
        with self.assertLogs("kunibert", level="INFO") as logs, patch("kunibert_client.time.sleep"):
            failing.handle_question()
        self.assertEqual([line for line in logs.output if "Zeitmessung" in line], [])
        self.assertIn(ClientState.ERROR, failing.state_history)

        short = self._timed_client(clock)
        short.config = ClientConfig(dry_run=True, min_record_seconds=5.0)
        with self.assertLogs("kunibert", level="INFO") as logs:
            short.handle_question()
        self.assertEqual([line for line in logs.output if "Zeitmessung" in line], [])
        self.assertEqual(short.api.questions, 0)

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

    def test_silent_recording_is_sent_but_logged_as_hint_with_only_a_number(self):
        config = self.config()
        out = CaptureAudioOutput()
        client = KunibertClient(config, FakeApi(), DryRunAudio(config), out, PressedButtons(speech=True), CaptureLed())
        client.state = ClientState.READY
        with self.assertLogs("kunibert", level="WARNING") as logs:
            client.handle_question()
        self.assertEqual(len(out.played), 1, "die Anfrage geht trotzdem an den Server")
        hint = [line for line in logs.output if "praktisch stumm" in line]
        self.assertEqual(len(hint), 1)
        self.assertIn("Spitzenwert 0 von 32767", hint[0])

    def test_pcm16_peak(self):
        loud = encode_wav((1000).to_bytes(2, "little", signed=True) + (-2000).to_bytes(2, "little", signed=True), 16000, 1, 2)
        self.assertEqual(pcm16_peak(loud), 2000)
        self.assertEqual(pcm16_peak(encode_wav(b"\x00\x00" * 10, 16000, 1, 2)), 0)
        self.assertIsNone(pcm16_peak(b"kein wav"))
        self.assertGreater(2000, SILENT_PEAK)

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

    def test_default_is_at_most_one_retry_like_the_firmware(self):
        config = ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token")
        self.assertEqual(config.retry_count, 1)
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(ClientConfig.from_env().retry_count, 1)
        api = PicastApi(config)
        with patch.object(api, "_request", return_value=(503, {}, b"{}")) as request, patch("kunibert_client.time.sleep"):
            with self.assertRaises(ApiError):
                api._with_retries("POST", "/v1/device/question", b"", {}, timeout=140.0)
        self.assertEqual(request.call_count, 2)

    def test_no_retry_after_the_whole_time_limit_was_used(self):
        # Ein hängender Server: Die erste Anfrage braucht die ganzen 140 s. Ein zweiter
        # Versuch hieße noch einmal 140 s Warten für das Kind (Regel wie kb_retry_decide).
        api = self._retry_api()
        clock = FakeClock()
        api.clock = clock

        def hang(*_args, **_kwargs):
            clock.advance(140.0)
            raise TimeoutError("timed out")

        with patch.object(api, "_request", side_effect=hang) as request, patch("kunibert_client.time.sleep"):
            with self.assertRaises(TimeoutError):
                api._with_retries("POST", "/v1/device/kunibert-story", b"", {}, timeout=140.0)
        self.assertEqual(request.call_count, 1)

    def test_fast_network_error_is_retried_once(self):
        api = PicastApi(ClientConfig(api_base_url="https://picastAI.com", device_token="device-test-token"))
        responses = [OSError("Connection refused"), (200, {}, b'{"audio_url":"/v1/device/audio/x"}')]
        with patch.object(api, "_request", side_effect=responses) as request, patch("kunibert_client.time.sleep"):
            result = api._with_retries("POST", "/v1/device/question", b"", {}, timeout=140.0)
        self.assertEqual(result["audio_url"], "/v1/device/audio/x")
        self.assertEqual(request.call_count, 2)

    def test_does_not_retry_client_errors_413_and_401(self):
        for status in (401, 413):
            api = self._retry_api()
            with patch.object(api, "_request", return_value=(status, {}, b"{}")) as request, patch("kunibert_client.time.sleep"):
                with self.assertRaises(ApiError):
                    api._with_retries("POST", "/v1/device/question", b"", {})
            self.assertEqual(request.call_count, 1, status)


class SoundDeviceSelectionTests(unittest.TestCase):
    """Zwei getrennte USB-Geräte: Aufnahme und Wiedergabe wählen ihr Gerät einzeln."""

    @staticmethod
    def _fake_sd():
        # spec: Nur was es in sounddevice wirklich gibt. Ohne spec hätte die Attrappe auch
        # sd.play mit Bytes angenommen, was die echte Bibliothek ablehnt (Fehler bis 12.11.2026).
        sd = MagicMock(spec=["RawInputStream", "RawOutputStream", "play", "query_devices"])
        stream = MagicMock()
        stream.read.return_value = (b"\x00\x00" * 1024, False)
        sd.RawInputStream.return_value.__enter__.return_value = stream
        out = MagicMock()
        sd.RawOutputStream.return_value.__enter__.return_value = out
        return sd

    def _audio(self, **config_values):
        sd = self._fake_sd()
        with patch.dict(sys.modules, {"sounddevice": sd}):
            audio = SoundDeviceAudio(ClientConfig(**config_values))
        return audio, sd

    def test_without_settings_both_directions_use_the_default_device(self):
        audio, sd = self._audio()
        audio.record_while_pressed(iter([True, False]).__next__, 1.0)
        audio.play_wav(encode_wav(b"\x00\x00" * 160, 16000, 1, 2))
        self.assertIsNone(sd.RawInputStream.call_args.kwargs["device"])
        self.assertIsNone(sd.RawOutputStream.call_args.kwargs["device"])

    def test_input_and_output_device_are_passed_separately(self):
        audio, sd = self._audio(input_device="USB Mini Microphone", output_device=3)
        audio.record_while_pressed(iter([True, False]).__next__, 1.0)
        audio.play_wav(encode_wav(b"\x00\x00" * 160, 16000, 1, 2))
        self.assertEqual(sd.RawInputStream.call_args.kwargs["device"], "USB Mini Microphone")
        self.assertEqual(sd.RawOutputStream.call_args.kwargs["device"], 3)

    def test_playback_writes_raw_bytes_without_numpy_and_without_sd_play(self):
        # 0,25 s bei 16 kHz: drei Stücke zu höchstens 0,1 s, zusammen genau die PCM-Daten.
        pcm = bytes(range(256)) * 31 + bytes(64)
        audio, sd = self._audio()
        audio.play_wav(encode_wav(pcm[: 4000 * 2], 16000, 1, 2))
        sd.play.assert_not_called()
        kwargs = sd.RawOutputStream.call_args.kwargs
        self.assertEqual((kwargs["samplerate"], kwargs["channels"], kwargs["dtype"]), (16000, 1, "int16"))
        stream = sd.RawOutputStream.return_value.__enter__.return_value
        written = [call.args[0] for call in stream.write.call_args_list]
        self.assertEqual(len(written), 3)
        self.assertTrue(all(len(chunk) <= 1600 * 2 for chunk in written))
        self.assertEqual(b"".join(written), pcm[: 4000 * 2])
        stream.abort.assert_not_called()

    def test_playback_stops_when_asked(self):
        audio, sd = self._audio()
        checks = iter([False, True])
        audio.play_wav(encode_wav(b"\x00\x00" * 8000, 16000, 1, 2), should_stop=lambda: next(checks))
        stream = sd.RawOutputStream.return_value.__enter__.return_value
        self.assertEqual(stream.write.call_count, 1)
        stream.abort.assert_called_once()

    def test_playback_errors_become_hardware_errors(self):
        audio, sd = self._audio()
        sd.RawOutputStream.side_effect = RuntimeError("Invalid sample rate")
        with self.assertRaises(HardwareError) as caught:
            audio.play_wav(encode_wav(b"\x00\x00" * 160, 16000, 1, 2))
        self.assertIn("Invalid sample rate", str(caught.exception))

    def test_parse_audio_device(self):
        self.assertIsNone(parse_audio_device(None))
        self.assertIsNone(parse_audio_device("  "))
        self.assertEqual(parse_audio_device("2"), 2)
        self.assertEqual(parse_audio_device(" sysdefault:CARD=Device "), "sysdefault:CARD=Device")

    def test_devices_from_environment(self):
        with patch.dict("os.environ", {"KUNIBERT_INPUT_DEVICE": "1", "KUNIBERT_OUTPUT_DEVICE": "Speaker"}):
            config = ClientConfig.from_env()
        self.assertEqual(config.input_device, 1)
        self.assertEqual(config.output_device, "Speaker")
        with patch.dict("os.environ", {}, clear=True):
            config = ClientConfig.from_env()
        self.assertIsNone(config.input_device)
        self.assertIsNone(config.output_device)


def _real_sounddevice():
    """Die echte Bibliothek samt PortAudio, oder None (dann werden die Tests übersprungen)."""
    try:
        import sounddevice  # noqa: F401
    except (ImportError, OSError):
        return None
    try:
        sounddevice.query_devices(kind="output")
        sounddevice.query_devices(kind="input")
    except Exception:
        return None
    return sounddevice


@unittest.skipIf(_real_sounddevice() is None, "sounddevice mit PortAudio und Audiogerät nicht vorhanden")
class RealSoundDeviceTests(unittest.TestCase):
    """Gegen die echte Bibliothek, ohne NumPy. In der CI über ein ALSA-Nullgerät (.github/workflows/tests.yml).

    Die Attrappen oben hätten den Fehler vom 12.11.2026 nicht gefunden: sd.play() mit Bytes
    scheitert erst in der echten Bibliothek.
    """

    def test_play_and_record_with_the_real_library(self):
        audio = SoundDeviceAudio(ClientConfig())
        audio.play_wav(encode_wav(b"\x00\x00" * 3200, 16000, 1, 2))  # 0,2 s Stille
        presses = iter([True, True, False])
        wav_bytes = audio.record_while_pressed(lambda: next(presses), 1.0)
        validate_wav(wav_bytes, ClientConfig())

    def test_stop_request_ends_playback_early(self):
        audio = SoundDeviceAudio(ClientConfig())
        audio.play_wav(encode_wav(b"\x00\x00" * 16000 * 30, 16000, 1, 2), should_stop=lambda: True)


class RealSoundDeviceRequiredTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("KUNIBERT_REQUIRE_REAL_AUDIO") == "1", "nur in der CI verlangt")
    def test_real_library_is_available(self):
        # Damit die Tests oben in der CI nicht unbemerkt übersprungen werden.
        self.assertIsNotNone(_real_sounddevice(), "sounddevice mit PortAudio fehlt in der CI")


if __name__ == "__main__":
    unittest.main()
