import tempfile
import unittest
import wave
from pathlib import Path

from kunibert_pi.audio_diag import tone_wav


class AudioDiagTests(unittest.TestCase):
    def test_tone_is_16khz_mono_pcm(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tone.wav"
            tone_wav(path, seconds=0.1)
            with wave.open(str(path), "rb") as wav:
                self.assertEqual(wav.getframerate(), 16000)
                self.assertEqual(wav.getnchannels(), 1)
                self.assertEqual(wav.getsampwidth(), 2)
                self.assertGreater(wav.getnframes(), 0)


if __name__ == "__main__":
    unittest.main()
