"""Ende-zu-Ende: echter Pi-Client  <-HTTP->  echter Server (uvicorn), KI-Bausteine als Fakes."""
import io
import json
import random
import socket
import sys
import tempfile
import threading
import time
import unittest
import wave
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import uvicorn

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pi-client"))

from kunibert_pi import __main__ as pi_cli  # noqa: E402
from kunibert_pi.api import ApiError, KunibertAPI  # noqa: E402
from kunibert_pi.audio import play_wav  # noqa: E402

from kunibert_server.app import create_app  # noqa: E402
from kunibert_server.brain import Brain  # noqa: E402
from kunibert_server.devices import AudioStore, DeviceRegistry, RateLimiter  # noqa: E402
from kunibert_server.providers import FakeLLM, FakeSTT, FakeTTS  # noqa: E402


def question_wav():
    n = 16000
    tone = (np.sin(2 * np.pi * 300 * np.arange(n) / 16000) * 5000).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(tone.tobytes())
    return out.getvalue()


class PiClientEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.registry = DeviceRegistry(Path(cls.tmp.name) / "devices.json")
        cls.token = cls.registry.add("prototype-1")
        cls.stt, cls.llm, cls.tts = FakeSTT("Wie weit ist der Mond?"), FakeLLM(), FakeTTS()
        brain = Brain(cls.stt, cls.llm, cls.tts, rng=random.Random(3))
        app = create_app(brain, cls.registry, store=AudioStore(60), limiter=RateLimiter(50, 600),
                         fixed_audio={"sicherheit": FakeTTS().synthesize("sicher")})
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            cls.port = s.getsockname()[1]
        cls.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=cls.port, log_level="warning"))
        cls.thread = threading.Thread(target=cls.server.run, daemon=True)
        cls.thread.start()
        deadline = time.time() + 10
        while not cls.server.started and time.time() < deadline:
            time.sleep(0.05)
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.wav_path = Path(cls.tmp.name) / "frage.wav"
        cls.wav_path.write_bytes(question_wav())

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        cls.tmp.cleanup()

    def api(self, token=None):
        return KunibertAPI(self.base, token or self.token, "prototype-1")

    def test_question_with_unmodified_client_api(self):
        turn = self.api().send_turn(self.wav_path, "frage")
        self.assertEqual(turn.kind, "frage")
        audio = self.api().fetch_audio(turn)
        proc = Mock()
        proc.wait.return_value = 0
        with patch("kunibert_pi.audio.subprocess.Popen", return_value=proc) as popen:
            play_wav(audio)
        self.assertEqual(popen.call_args.args[0][:2], ["aplay", "-q"])
        with self.assertRaises(ApiError):  # zweiter Abruf: schon gelöscht
            self.api().fetch_audio(turn)

    def test_story_buttons_via_cli_with_state_file(self):
        state_file = Path(self.tmp.name) / "kunibert.json"
        env = {"KUNIBERT_API_BASE": self.base, "KUNIBERT_DEVICE_ID": "prototype-1",
               "KUNIBERT_DEVICE_TOKEN": self.token}
        proc = Mock()
        proc.wait.return_value = 0
        parts = []
        with patch.dict("os.environ", env), patch("kunibert_pi.audio.subprocess.Popen", return_value=proc):
            for mode in ("geschichte", "weiter", "weiter"):
                self.assertEqual(pi_cli.main(["--mode", mode, "--state-file", str(state_file)]), 0)
                parts.append(json.loads(state_file.read_text())["part"])
        self.assertEqual(parts, [1, 2, 3])
        self.assertEqual(state_file.stat().st_mode & 0o777, 0o600)

    def test_safety_reaches_device_as_hint(self):
        self.stt.text = "Ich habe mich verlaufen und es ist dunkel"
        try:
            turn = self.api().send_turn(self.wav_path, "frage")
        finally:
            self.stt.text = "Wie weit ist der Mond?"
        self.assertEqual(turn.kind, "hinweis")
        self.assertEqual(self.api().fetch_audio(turn)[:4], b"RIFF")

    def test_wrong_token_is_refused(self):
        with self.assertRaises(ApiError) as ctx:
            self.api(token="falsch").send_turn(self.wav_path, "frage")
        self.assertIn("401", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
