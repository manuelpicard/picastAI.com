import io
import unittest
import wave
from unittest.mock import patch

from kunibert_client import (
    ApiError,
    ClientConfig,
    ClientState,
    DryRunAudio,
    DryRunButtons,
    DryRunLed,
    GpioStatusLed,
    HardwareError,
    KunibertClient,
    PicastApi,
    encode_wav,
    multipart_form,
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


class CaptureAudioOutput:
    def __init__(self):
        self.played = []

    def play_wav(self, wav_bytes):
        self.played.append(wav_bytes)


class CaptureLed:
    def __init__(self):
        self.modes = []

    def set(self, mode):
        self.modes.append(mode)


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

    def test_api_requires_token_unless_dry_run(self):
        config = ClientConfig(api_base_url="http://127.0.0.1:1", device_token="", dry_run=False)
        with self.assertRaises(ApiError):
            PicastApi(config)


if __name__ == "__main__":
    unittest.main()
