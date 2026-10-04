import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from kunibert_pi.api import ApiError, KunibertAPI, Turn
from kunibert_pi.audio import PlaybackError, play_wav


def wav_bytes(seconds=0.1):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * int(seconds * 16000))
    return output.getvalue()


class FakeResponse:
    def __init__(self, payload, mime):
        self.payload = io.BytesIO(payload)
        self.headers = {"Content-Type": mime}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.payload.close()

    def read(self, n):
        return self.payload.read(n)


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.api = KunibertAPI("https://api.example.test", "top-secret", "prototype-1")

    def test_nonlocal_http_refused(self):
        with self.assertRaises(ValueError):
            KunibertAPI("http://api.example.test", "token", "device")

    def test_turn_and_audio(self):
        with tempfile.TemporaryDirectory() as td:
            question = Path(td) / "question.wav"
            question.write_bytes(wav_bytes())
            result = {"turn_id": "abc_123", "kind": "frage", "story_state": {"chapter": 1}}
            replies = [FakeResponse(json.dumps(result).encode(), "application/json; charset=utf-8"),
                       FakeResponse(wav_bytes(), "audio/wav")]
            with patch.object(self.api.opener, "open", side_effect=replies) as request:
                turn = self.api.send_turn(question)
                audio = self.api.fetch_audio(turn)
            self.assertEqual(turn.turn_id, "abc_123")
            self.assertEqual(turn.story_state, {"chapter": 1})
            self.assertEqual(audio, wav_bytes())
            self.assertEqual(request.call_count, 2)
            first = request.call_args_list[0].args[0]
            second = request.call_args_list[1].args[0]
            self.assertEqual(first.get_header("Authorization"), "Bearer top-secret")
            self.assertEqual(first.get_method(), "POST")
            self.assertEqual(second.full_url, "https://api.example.test/v1/turn/abc_123/audio")

    def test_server_cannot_redirect_device_token(self):
        from kunibert_pi.api import NoRedirect
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "moved", {}, "https://elsewhere.test"))

    def test_invalid_turn_id_rejected(self):
        with patch.object(self.api.opener, "open", return_value=FakeResponse(
            b'{"turn_id":"../secret","kind":"frage"}', "application/json")):
            with tempfile.TemporaryDirectory() as td:
                path = Path(td) / "q.wav"
                path.write_bytes(wav_bytes())
                with self.assertRaises(ApiError):
                    self.api.send_turn(path)

    def test_http_error_does_not_leak_body(self):
        err = HTTPError("https://api.example.test/v1/turn", 401, "unauthorized", {},
                        io.BytesIO(b"sensitive transcript"))
        with patch.object(self.api.opener, "open", side_effect=err):
            with self.assertRaises(ApiError) as ctx:
                self.api.fetch_audio(Turn("valid", "frage", {}))
            self.assertNotIn("sensitive transcript", str(ctx.exception))

    def test_healthcheck_accepts_only_status_ok(self):
        with patch.object(self.api.opener, "open", return_value=FakeResponse(
                b'{"status":"ok"}', "application/json")):
            self.assertTrue(self.api.check_health())

    def test_healthcheck_rejects_not_ready_server(self):
        with patch.object(self.api.opener, "open", return_value=FakeResponse(
                b'{"status":"starting"}', "application/json")):
            with self.assertRaises(ApiError):
                self.api.check_health()

    def test_playback_invokes_aplay_and_removes_temp_file(self):
        proc = Mock()
        proc.wait.return_value = 0
        with patch("kunibert_pi.audio.subprocess.Popen", return_value=proc) as popen:
            play_wav(wav_bytes(), device="plughw:1,0")
            args = popen.call_args.args[0]
            self.assertEqual(args[:4], ["aplay", "-q", "-D", "plughw:1,0"])
            self.assertFalse(Path(args[-1]).exists())

    def test_playback_rejects_invalid_data(self):
        with self.assertRaises(ValueError):
            play_wav(b"not audio")


if __name__ == "__main__":
    unittest.main()
