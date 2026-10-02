"""Austauschbare Anbieter für Spracherkennung (STT), Sprachmodell (LLM) und Stimme (TTS).

Standard ist datensparsam: STT (faster-whisper) und TTS (Piper) laufen lokal
auf dem eigenen Server; nur der bereits erkannte Text geht an das Sprachmodell.
Die Fake-Anbieter dienen Tests ohne Netz und ohne Modelle.
"""
from __future__ import annotations

import json
import math
import re
import threading
from typing import Protocol

import numpy as np

from .audio import encode_wav


# ---------------------------------------------------------------- Protokolle
class SpeechToText(Protocol):
    def transcribe(self, samples: np.ndarray) -> str: ...


class TextToSpeech(Protocol):
    def synthesize(self, text: str) -> bytes: ...  # vollständige WAV-Datei


class LanguageModel(Protocol):
    def json_chat(self, system: str, user: str, schema: dict, name: str,
                  max_output_tokens: int) -> dict: ...


# ---------------------------------------------------------------- STT
class WhisperSTT:
    """Lokale Spracherkennung mit faster-whisper (kein Audio verlässt den Server)."""

    def __init__(self, model_size: str = "small", compute_type: str = "int8",
                 hint: str = "Ritter Kunibert, Drache, Hexe, Gasthaus, Kutscher, Dachzimmer."):
        from faster_whisper import WhisperModel  # erst hier importieren: schwere Abhängigkeit

        self.model = WhisperModel(model_size, device="cpu", compute_type=compute_type)
        self.hint = hint
        self.lock = threading.Lock()

    def transcribe(self, samples: np.ndarray) -> str:
        with self.lock:
            segments, _info = self.model.transcribe(
                samples, language="de", beam_size=1, vad_filter=True,
                initial_prompt=self.hint, condition_on_previous_text=False)
            parts = [s.text.strip() for s in segments if s.no_speech_prob < 0.8]
        return " ".join(p for p in parts if p).strip()


class FakeSTT:
    def __init__(self, text: str = ""):
        self.text = text
        self.calls = 0

    def transcribe(self, samples: np.ndarray) -> str:
        self.calls += 1
        return self.text


# ---------------------------------------------------------------- TTS
def speakable(text: str) -> str:
    """Entfernt Zeichen, die eine Sprachsynthese stolpern lassen (Markdown, Emojis)."""
    text = re.sub(r"[*_#`>\[\]{}|~]", " ", text)
    text = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


class PiperTTS:
    """Lokale deutsche Stimme (Piper). Standard: thorsten-medium, schnell genug für den Pi-Takt."""

    def __init__(self, model_path: str, length_scale: float = 1.12, sentence_pause: float = 0.35):
        from piper import PiperVoice, SynthesisConfig

        self.voice = PiperVoice.load(model_path)
        self.config = SynthesisConfig(length_scale=length_scale, noise_scale=0.6, noise_w_scale=0.7)
        self.rate = self.voice.config.sample_rate
        self.pause = np.zeros(int(self.rate * sentence_pause), dtype=np.int16).tobytes()
        self.lock = threading.Lock()

    def synthesize(self, text: str) -> bytes:
        chunks: list[bytes] = []
        with self.lock:
            for chunk in self.voice.synthesize(speakable(text), syn_config=self.config):
                chunks.append(chunk.audio_int16_bytes)
                chunks.append(self.pause)
        return encode_wav(b"".join(chunks), self.rate)


class FakeTTS:
    """Erzeugt einen leisen Ton, dessen Länge grob der Textlänge entspricht."""

    def __init__(self, rate: int = 16000):
        self.rate = rate
        self.texts: list[str] = []

    def synthesize(self, text: str) -> bytes:
        self.texts.append(text)
        seconds = min(5.0, 0.2 + len(text) / 200)
        n = int(self.rate * seconds)
        tone = (np.sin(2 * math.pi * 440 * np.arange(n) / self.rate) * 800).astype("<i2")
        return encode_wav(tone.tobytes(), self.rate)


# ---------------------------------------------------------------- LLM
class OpenAICompatibleLLM:
    """Jede OpenAI-kompatible Chat-Schnittstelle. Schlüssel nur per Umgebungsvariable, nie im Code."""

    def __init__(self, model: str, reasoning_effort: str | None = "low", timeout: float = 60):
        from openai import OpenAI

        self.client = OpenAI(timeout=timeout, max_retries=1)
        self.model = model
        self.reasoning_effort = reasoning_effort

    def json_chat(self, system: str, user: str, schema: dict, name: str,
                  max_output_tokens: int) -> dict:
        kwargs: dict = {}
        if self.model.startswith("gpt-5") and self.reasoning_effort:
            # Offizieller Chat-Completions-Parameter; funktioniert bei OpenAI und am Manus-Proxy.
            kwargs["reasoning_effort"] = self.reasoning_effort
            kwargs["max_completion_tokens"] = max_output_tokens + 4000
        else:
            kwargs["max_tokens"] = max_output_tokens + 4000
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema",
                             "json_schema": {"name": name, "strict": True, "schema": schema}},
            **kwargs,
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("Leere Modellantwort")
        return json.loads(content)


class FakeLLM:
    """Gibt vorbereitete Antworten zurück und merkt sich die Aufrufe."""

    def __init__(self, answer: dict | None = None, story: dict | None = None):
        self.answer = answer or {"category": "frage", "speech": "Der Himmel ist blau, weil die Luft blaues Licht stärker streut."}
        self.story = story or {"text": ("Ritter Kunibert erwachte im Dachzimmer des Gasthauses. Über ihm hing der "
                                        "schiefe Balken, und durch das kleine Fenster sah er ganz hinten den Berg "
                                        "mit dem dunklen Fleck."),
                               "summary": "Kunibert ist aufgewacht.", "next_hook": "Er geht zur Brücke.",
                               "episode_finished": False}
        self.calls: list[tuple[str, str]] = []

    def json_chat(self, system: str, user: str, schema: dict, name: str,
                  max_output_tokens: int) -> dict:
        self.calls.append((name, user))
        return dict(self.answer if name == "antwort" else self.story)
