"""No external service or physical Raspberry Pi required."""
import io
import json
import tempfile
import threading
import unittest
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock, patch

from kunibert_pi.api import KunibertAPI
from kunibert_pi.audio import play_wav


def silence():
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 1600)
    return output.getvalue()


class TestServer(BaseHTTPRequestHandler):
    calls = []

    def log_message(self, *_):
        pass

    def do_POST(self):
        if self.path != "/v1/turn" or self.headers.get("Authorization") != "Bearer test-token":
            self.send_error(401)
            return
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.calls.append(("POST", self.path, self.headers.get("X-Device-Id")))
        assert b'name="mode"' in body
        assert b'name="audio"' in body
        assert silence() in body
        reply = json.dumps({"turn_id": "t1", "kind": "frage", "story_state": {}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

    def do_GET(self):
        if self.path != "/v1/turn/t1/audio" or self.headers.get("Authorization") != "Bearer test-token":
            self.send_error(401)
            return
        self.calls.append(("GET", self.path, self.headers.get("X-Device-Id")))
        audio = silence()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)


class IntegrationTest(unittest.TestCase):
    def test_local_api_and_playback(self):
        TestServer.calls = []
        server = ThreadingHTTPServer(("127.0.0.1", 0), TestServer)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "frage.wav"
                path.write_bytes(silence())
                api = KunibertAPI(f"http://127.0.0.1:{server.server_port}",
                                  "test-token", "prototype-1")
                turn = api.send_turn(path)
                data = api.fetch_audio(turn)
                proc = Mock()
                proc.wait.return_value = 0
                with patch("kunibert_pi.audio.subprocess.Popen", return_value=proc):
                    play_wav(data)
                self.assertEqual(TestServer.calls, [
                    ("POST", "/v1/turn", "prototype-1"),
                    ("GET", "/v1/turn/t1/audio", "prototype-1")])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
