"""Server-Tests ohne Netz, ohne KI-Modelle, ohne Mikrofon."""
import io
import json
import random
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from kunibert_server import prompts, safety
from kunibert_server.app import create_app
from kunibert_server.brain import Brain, clean_state, trim_words
from kunibert_server.devices import AudioStore, DeviceRegistry, RateLimiter
from kunibert_server.providers import FakeLLM, FakeSTT, FakeTTS


def wav(seconds=1.0, rate=16000, channels=1, loud=True):
    n = int(seconds * rate)
    tone = (np.sin(2 * np.pi * 220 * np.arange(n) / rate) * (6000 if loud else 0)).astype("<i2")
    if channels == 2:
        tone = np.repeat(tone, 2)
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(tone.tobytes())
    return out.getvalue()


class Base(unittest.TestCase):
    rate_limit = 5

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.registry = DeviceRegistry(Path(self.tmp.name) / "devices.json")
        self.token = self.registry.add("kind-1")
        self.token2 = self.registry.add("kind-2")
        self.stt = FakeSTT("Warum ist der Himmel blau?")
        self.llm = FakeLLM()
        self.tts = FakeTTS()
        self.brain = Brain(self.stt, self.llm, self.tts, rng=random.Random(1))
        self.fixed = {"sicherheit": wav(0.5), "unklar": wav(0.4), "fehler": wav(0.3)}
        self.app = create_app(self.brain, self.registry, store=AudioStore(ttl_seconds=60),
                              limiter=RateLimiter(self.rate_limit, 600), fixed_audio=self.fixed)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.cleanup()

    def headers(self, device="kind-1", token=None):
        return {"Authorization": f"Bearer {token or self.token}", "X-Device-Id": device}

    def turn(self, mode="frage", state=None, audio=None, headers=None):
        files = {"audio": ("frage.wav", audio if audio is not None else wav(), "audio/wav")}
        if audio is False:
            files = None
        return self.client.post("/v1/turn", data={"mode": mode, "story_state": json.dumps(state or {})},
                                files=files, headers=headers or self.headers())


class AuthTests(Base):
    def test_health_reveals_nothing(self):
        r = self.client.get("/health")
        self.assertEqual(r.json(), {"status": "ok"})

    def test_missing_wrong_and_revoked_tokens(self):
        self.assertEqual(self.client.post("/v1/turn", data={"mode": "frage"}).status_code, 401)
        self.assertEqual(self.turn(headers=self.headers(token="falsch")).status_code, 401)
        self.assertEqual(self.turn(headers=self.headers(device="kind-2")).status_code, 401)  # fremdes Token
        self.registry.revoke("kind-1")
        self.assertEqual(self.turn().status_code, 401)
        self.assertEqual(self.stt.calls, 0)

    def test_token_stored_only_as_hash(self):
        raw = (Path(self.tmp.name) / "devices.json").read_text()
        self.assertNotIn(self.token, raw)


class TurnTests(Base):
    def test_question_roundtrip_and_one_time_audio(self):
        r = self.turn()
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["kind"], "frage")
        self.assertNotIn("text", body)  # kein Text, kein Transkript in der Antwort
        self.assertNotIn("Himmel", r.text)
        url = f"/v1/turn/{body['turn_id']}/audio"
        other = self.client.get(url, headers=self.headers("kind-2", self.token2))
        self.assertEqual(other.status_code, 404)  # anderes Gerät bekommt nichts
        audio = self.client.get(url, headers=self.headers())
        self.assertEqual(audio.status_code, 200)
        self.assertEqual(audio.headers["content-type"], "audio/wav")
        self.assertEqual(audio.content[:4], b"RIFF")
        self.assertEqual(self.client.get(url, headers=self.headers()).status_code, 404)  # nur einmal
        self.assertEqual(len(self.app.state.store), 0)

    def test_keyword_safety_bypasses_llm_and_uses_fixed_audio(self):
        self.stt.text = "Kunibert, mein Bruder haut mich immer"
        body = self.turn().json()
        self.assertEqual(body["kind"], "hinweis")
        self.assertEqual(self.llm.calls, [])
        audio = self.client.get(f"/v1/turn/{body['turn_id']}/audio", headers=self.headers())
        self.assertEqual(audio.content, self.fixed["sicherheit"])

    def test_model_flagged_safety_never_speaks_model_text(self):
        self.llm.answer = {"category": "sicherheit", "speech": "GENERIERTER TEXT"}
        self.stt.text = "Ich habe Angst, zu Hause ist es schlimm"
        body = self.turn().json()
        self.assertEqual(body["kind"], "hinweis")
        self.assertNotIn("GENERIERTER TEXT", self.tts.texts)

    def test_silence_needs_no_stt_or_llm(self):
        body = self.turn(audio=wav(1.0, loud=False)).json()
        self.assertEqual(body["kind"], "hinweis")
        self.assertEqual((self.stt.calls, self.llm.calls), (0, []))

    def test_provider_failure_gives_spoken_error(self):
        def boom(*_a, **_k):
            raise ConnectionError("down")
        self.llm.json_chat = boom
        body = self.turn().json()
        self.assertEqual(body["kind"], "hinweis")
        audio = self.client.get(f"/v1/turn/{body['turn_id']}/audio", headers=self.headers())
        self.assertEqual(audio.content, self.fixed["fehler"])

    def test_question_button_can_request_story(self):
        self.llm.answer = {"category": "geschichte", "speech": ""}
        self.stt.text = "Erzähl mir von Kunibert und dem Drachen"
        body = self.turn().json()
        self.assertEqual(body["kind"], "geschichte")
        self.assertEqual(body["story_state"]["part"], 1)
        self.assertIn("Wunsch des Kindes", self.llm.calls[-1][1])


class InputValidationTests(Base):
    def test_rejects_bad_audio(self):
        self.assertEqual(self.turn(audio=b"RIFF....WAVEnope").status_code, 400)
        self.assertEqual(self.turn(audio=wav(rate=44100)).status_code, 400)
        self.assertEqual(self.turn(audio=wav(channels=2)).status_code, 400)
        self.assertEqual(self.turn(audio=wav(seconds=31)).status_code, 400)
        self.assertEqual(self.turn(audio=False).status_code, 400)  # Frage ohne Aufnahme
        self.assertEqual(self.turn(mode="hack").status_code, 400)

    def test_rejects_oversized_body_before_parsing(self):
        r = self.client.post("/v1/turn", content=b"x" * (3 * 1024 * 1024),
                             headers={**self.headers(), "Content-Type": "application/octet-stream"})
        self.assertEqual(r.status_code, 413)

    def test_rate_limit(self):
        codes = [self.turn().status_code for _ in range(6)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5], 429)

    def test_tampered_story_state_is_sanitized(self):
        self.assertEqual(clean_state({"v": 1, "part": 999}), {})
        self.assertEqual(clean_state({"v": 2}), {})
        self.assertEqual(clean_state("kaputt"), {})
        state = clean_state({"v": 1, "ep": 1, "part": 2, "target": 5, "summary": "x" * 5000, "evil": 1})
        self.assertNotIn("evil", state)
        self.assertEqual(len(state["summary"]), 700)


class StoryTests(Base):
    rate_limit = 20

    def test_full_episode_arc(self):
        state, kinds, hints = {}, [], []
        for i in range(5):
            mode = "geschichte" if i == 0 else "weiter"
            self.llm.story = {**self.llm.story, "text": f"Teil {i + 1}. " + "Kunibert ritt weiter. " * 15,
                              "open_threads": "Der Helm ist verschwunden.", "episode_finished": False}
            body = self.turn(mode=mode, state=state, audio=False).json()
            kinds.append(body["kind"])
            state = body["story_state"]
            hints.append(self.llm.calls[-1][1])
            self.client.get(f"/v1/turn/{body['turn_id']}/audio", headers=self.headers())
        self.assertEqual(kinds, ["geschichte", "weiter", "weiter", "weiter", "weiter"])
        self.assertTrue(state["done"])
        self.assertEqual(state["part"], 5)
        self.assertIn(prompts.PHASE_HINTS["start"], hints[0])
        self.assertIn(prompts.PHASE_HINTS["trick"], hints[3])
        self.assertIn(prompts.PHASE_HINTS["finale"], hints[4])
        self.assertIn("Offene Fäden: Der Helm ist verschwunden.", hints[4])  # Faden reist mit
        self.assertEqual(state["threads"], "")  # nach dem Finale aufgeräumt
        self.assertTrue(self.tts.texts[-1].endswith(prompts.EPISODE_CLOSING))
        self.assertTrue(self.tts.texts[0].endswith(prompts.STORY_CLOSING))
        self.assertLessEqual(len(json.dumps(state).encode()), 4096)
        # Nach dem Ende startet "weiter" eine neue Folge
        body = self.turn(mode="weiter", state=state, audio=False).json()
        self.assertEqual((body["story_state"]["ep"], body["story_state"]["part"]), (2, 1))


class SafetyScreenTests(unittest.TestCase):
    def test_positive(self):
        for text in ["Ich will nicht mehr leben", "Mein Papa schlägt mich", "Er hat mich angefasst und ich soll es niemandem sagen",
                     "Hilfe, es brennt", "Ich habe mich verlaufen", "Ich kriege keine Luft", "Mama wacht nicht auf",
                     "Ich habe Tabletten genommen"]:
            self.assertTrue(safety.screen(text), text)

    def test_negative(self):
        for text in ["Der Drache soll sterben", "Erzähl vom Drachen und der Hexe", "Warum ist der Himmel blau?",
                     "Kunibert haut den Drachen", "Wie weit ist der Mond weg?", ""]:
            self.assertFalse(safety.screen(text), text)

    def test_trim_words_ends_on_sentence(self):
        text = "Eins zwei drei. " * 40
        self.assertTrue(trim_words(text, 50).endswith("."))
        self.assertEqual(trim_words("Kurz.", 50), "Kurz.")


if __name__ == "__main__":
    unittest.main()
