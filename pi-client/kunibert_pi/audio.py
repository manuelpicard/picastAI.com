"""Play validated WAV data through ALSA without keeping children's audio."""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from .api import validate_wav


class PlaybackError(Exception):
    pass


def play_wav(wav_data: bytes, *, device: str | None = None, timeout: int = 210) -> None:
    """Block until playback finishes; Ctrl-C stops it. Requires `alsa-utils` (aplay)."""
    validate_wav(wav_data, max_seconds=180, input_audio=False)
    with tempfile.TemporaryDirectory(prefix="kunibert-audio-") as directory:
        path = Path(directory) / "antwort.wav"
        path.write_bytes(wav_data)
        os.chmod(path, 0o600)
        command = ["aplay", "-q"]
        if device:
            # Device is a single argv element; it is never passed to a shell.
            command.extend(["-D", device])
        command.append(str(path))
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL)
            try:
                code = process.wait(timeout=timeout)
            except (KeyboardInterrupt, subprocess.TimeoutExpired):
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                raise
            if code != 0:
                raise PlaybackError("Wiedergabe fehlgeschlagen: ALSA-Gerät und Lautstärke prüfen")
        except FileNotFoundError as exc:
            raise PlaybackError("aplay fehlt; Paket alsa-utils installieren") from exc
        except subprocess.TimeoutExpired as exc:
            raise PlaybackError("Wiedergabe hat das Zeitlimit überschritten") from exc
