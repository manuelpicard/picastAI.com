import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from kunibert_pi.buttons import recording_command, record_while_held, story_mode


class ButtonModeTests(unittest.TestCase):
    def test_fresh_or_invalid_state_starts_episode(self):
        self.assertEqual(story_mode({}), "geschichte")
        self.assertEqual(story_mode({"part": "broken"}), "geschichte")

    def test_active_episode_continues(self):
        self.assertEqual(story_mode({"v": 1, "part": 2, "done": False}), "weiter")

    def test_finished_episode_starts_new_one(self):
        self.assertEqual(story_mode({"v": 1, "part": 5, "done": True}), "geschichte")

    def test_recorder_matches_api_wav_contract(self):
        command = recording_command(Path("/dev/shm/question.wav"), "plughw:2,0")
        self.assertEqual(command[:4], ["arecord", "-q", "-D", "plughw:2,0"])
        self.assertIn("S16_LE", command)
        self.assertIn("16000", command)
        self.assertIn("-c", command)
        self.assertIn("1", command)
        self.assertEqual(command[-1], "/dev/shm/question.wav")

    def test_short_press_is_discarded(self):
        button = Mock(is_pressed=False)
        process = Mock()
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "audio.wav"
            path.write_bytes(b"not needed for tap")
            with patch("kunibert_pi.buttons.subprocess.Popen", return_value=process):
                with patch("kunibert_pi.buttons.time.monotonic", side_effect=[0.0, 0.1]):
                    self.assertFalse(record_while_held(button, path))
        process.send_signal.assert_called_once()
        process.wait.assert_called_once()
        self.assertFalse(path.exists())

    def test_invalid_recording_limits_fail_before_starting_arecord(self):
        with patch("kunibert_pi.buttons.subprocess.Popen") as popen:
            with self.assertRaises(ValueError):
                record_while_held(Mock(is_pressed=False), Path("/tmp/x.wav"),
                                  max_seconds=1, min_seconds=1)
            popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
