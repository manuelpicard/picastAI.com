"""WAV-Hilfen. Gleiche Grenzen wie der Pi-Client, damit beide Seiten übereinstimmen."""
from __future__ import annotations

import io
import wave

import numpy as np

INPUT_RATE = 16000
MAX_INPUT_SECONDS = 30
MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_SECONDS = 175  # Client akzeptiert bis 180 s
MAX_OUTPUT_BYTES = 8 * 1024 * 1024


class AudioError(ValueError):
    pass


def decode_input_wav(data: bytes) -> np.ndarray:
    """16 kHz / mono / 16-bit PCM -> float32 [-1, 1]. Alles andere wird abgelehnt."""
    if not data or len(data) > MAX_INPUT_BYTES:
        raise AudioError("Aufnahme fehlt oder ist zu groß")
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise AudioError("Keine RIFF/WAVE-Datei")
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, INPUT_RATE):
                raise AudioError("Aufnahme muss 16 kHz, mono, 16-bit PCM sein")
            frames = wav.getnframes()
            if not 0 < frames <= MAX_INPUT_SECONDS * INPUT_RATE:
                raise AudioError("Aufnahme ist leer oder länger als 30 Sekunden")
            raw = wav.readframes(frames)
    except (wave.Error, EOFError) as exc:
        raise AudioError("Beschädigte WAV-Datei") from exc
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def is_near_silent(samples: np.ndarray, threshold: float = 0.004) -> bool:
    """Grobe Stilleerkennung, damit eine leere Aufnahme keinen KI-Aufruf auslöst."""
    if samples.size == 0:
        return True
    return float(np.sqrt(np.mean(samples.astype(np.float64) ** 2))) < threshold


def encode_wav(pcm16: bytes, rate: int, channels: int = 1) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm16)
    return out.getvalue()


def wav_duration(data: bytes) -> float:
    with wave.open(io.BytesIO(data), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def check_output_wav(data: bytes) -> None:
    if len(data) > MAX_OUTPUT_BYTES:
        raise AudioError("Antwort-Audio zu groß")
    duration = wav_duration(data)
    if not 0 < duration <= MAX_OUTPUT_SECONDS:
        raise AudioError("Antwort-Audio zu lang oder leer")
