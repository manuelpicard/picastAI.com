"""Bounded microphone recording through arecord; recordings stay in RAM-backed temp storage."""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from .api import MAX_INPUT_BYTES, validate_wav


class RecordingError(Exception):
    pass


class Recorder:
    def __init__(self, *, device: str | None = None, max_seconds: int = 20):
        if max_seconds < 1 or max_seconds > 30:
            raise ValueError("Aufnahmedauer muss zwischen 1 und 30 Sekunden liegen")
        self.device = device
        self.max_seconds = max_seconds

    def record(self) -> bytes:
        with tempfile.TemporaryDirectory(prefix="kunibert-record-", dir="/dev/shm" if os.path.isdir("/dev/shm") else None) as directory:
            path = Path(directory) / "frage.wav"
            command = ["arecord", "-q", "-f", "S16_LE", "-r", "16000", "-c", "1",
                       "-d", str(self.max_seconds)]
            if self.device:
                command.extend(["-D", self.device])
            command.append(str(path))
            try:
                completed = subprocess.run(command, stdout=subprocess.DEVNULL,
                                           stderr=subprocess.DEVNULL,
                                           timeout=self.max_seconds + 5,
                                           check=False)
            except FileNotFoundError as exc:
                raise RecordingError("arecord fehlt; alsa-utils installieren") from exc
            except subprocess.TimeoutExpired as exc:
                raise RecordingError("Aufnahme hat das Zeitlimit überschritten") from exc
            if completed.returncode != 0 or not path.exists():
                raise RecordingError("Mikrofonaufnahme fehlgeschlagen")
            data = path.read_bytes()
            if len(data) > MAX_INPUT_BYTES:
                raise RecordingError("Aufnahme ist zu groß")
            try:
                validate_wav(data, max_seconds=self.max_seconds, input_audio=True)
            except ValueError as exc:
                raise RecordingError("Mikrofon lieferte ein ungültiges Audioformat") from exc
            return data
