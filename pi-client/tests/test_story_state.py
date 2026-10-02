import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from kunibert_pi.__main__ import load_state, save_state
from kunibert_pi.api import KunibertAPI

from test_client import FakeResponse, wav_bytes


class StoryStateTests(unittest.TestCase):
    def setUp(self):
        self.api = KunibertAPI("https://api.example.test", "token", "prototype-1")

    def test_question_requires_audio(self):
        with self.assertRaises(ValueError):
            self.api.send_turn(None, "frage")

    def test_story_without_audio_sends_no_audio_part(self):
        reply = FakeResponse(json.dumps({"turn_id": "t1", "kind": "geschichte",
                                         "story_state": {"v": 1, "part": 1}}).encode(), "application/json")
        with patch.object(self.api.opener, "open", return_value=reply) as request:
            turn = self.api.send_turn(None, "geschichte", {"v": 1})
        body = request.call_args.args[0].data
        self.assertNotIn(b'name="audio"', body)
        self.assertIn(b'{"v":1}', body)
        self.assertTrue(body.rstrip().endswith(b"--"))
        self.assertEqual(turn.story_state["part"], 1)

    def test_story_with_wish_still_sends_audio(self):
        reply = FakeResponse(b'{"turn_id":"t2","kind":"geschichte","story_state":{}}', "application/json")
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "wunsch.wav"
            path.write_bytes(wav_bytes())
            with patch.object(self.api.opener, "open", return_value=reply) as request:
                self.api.send_turn(path, "geschichte")
        self.assertIn(b'name="audio"', request.call_args.args[0].data)

    def test_state_file_roundtrip_and_permissions(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "k.json"
            self.assertEqual(load_state(path), {})
            save_state(path, {"v": 1, "summary": "Kunibert schläft."})
            self.assertEqual(load_state(path)["summary"], "Kunibert schläft.")
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            path.write_text("kaputt{")
            self.assertEqual(load_state(path), {})
            path.write_text("[1,2]")
            self.assertEqual(load_state(path), {})


if __name__ == "__main__":
    unittest.main()
