import io
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
    KunibertClient,
    NoRedirectHandler,
    PicastApi,
    encode_wav,
    multipart_form,
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
