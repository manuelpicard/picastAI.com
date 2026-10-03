import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from kunibert_pi.api import Turn
from kunibert_pi import api_send


class APISendTests(unittest.TestCase):
    @patch.dict("os.environ", {"KUNIBERT_API_BASE": "http://127.0.0.1:8000",
                                "KUNIBERT_DEVICE_ID": "prototype-1",
                                "KUNIBERT_DEVICE_TOKEN": "test-token"})
    @patch("kunibert_pi.api_send.KunibertAPI")
    def test_sends_wav_and_saves_response(self, api_class):
        api = api_class.return_value
        api.send_turn.return_value = Turn("t1", "frage", {"v": 1})
        api.fetch_audio.return_value = b"RIFF-response"
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "question.wav"
            target = Path(directory) / "out" / "answer.wav"
            source.write_bytes(b"RIFF-question")
            self.assertEqual(api_send.main(["--wav", str(source), "--output", str(target)]), 0)
            self.assertEqual(target.read_bytes(), b"RIFF-response")
            api.send_turn.assert_called_once()
            api.fetch_audio.assert_called_once()

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_credentials_returns_2(self):
        self.assertEqual(api_send.main(["--wav", "q.wav", "--output", "a.wav"]), 2)


if __name__ == "__main__": unittest.main()
