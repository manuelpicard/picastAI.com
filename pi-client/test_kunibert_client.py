import io
import unittest
import wave

from kunibert_client import (
    ApiError,
    ClientConfig,
    ClientState,
    DryRunAudio,
    DryRunButtons,
    DryRunLed,
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
