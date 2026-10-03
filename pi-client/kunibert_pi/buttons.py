"""Physischer Pi-Prototyp: Sprechtaste halten, Erzähltaste drücken.

Verdrahtung: Taster zwischen GPIO und GND; interne Pull-ups, keine externe Spannung.
GPIO Zero wird erst in main() importiert, sodass Unit-Tests ohne Pi laufen.
"""
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Protocol

from .api import ApiError, KunibertAPI
from .audio import PlaybackError, play_wav
from .state import load_state, save_state

SAMPLE_RATE = 16_000
MAX_RECORD_SECONDS = 30
MIN_RECORD_SECONDS = 0.45


class PressButton(Protocol):
    @property
    def is_pressed(self) -> bool: ...


def story_mode(state: dict) -> str:
    """Beim ersten Druck Folge starten; danach bis zum Ende weitererzählen."""
    try:
        active = int(state.get("part", 0)) > 0 and not bool(state.get("done", False))
    except (TypeError, ValueError):
        active = False
    return "weiter" if active else "geschichte"


def recording_command(path: Path, device: str = "default") -> list[str]:
    """Befehl für eine Client-Aufnahme im Server-API-Format."""
    return ["arecord", "-q", "-D", device, "-f", "S16_LE", "-r", str(SAMPLE_RATE),
            "-c", "1", "-t", "wav", str(path)]


def record_while_held(button: PressButton, path: Path, *, device: str = "default",
                      max_seconds: float = MAX_RECORD_SECONDS,
                      min_seconds: float = MIN_RECORD_SECONDS) -> bool:
    """Nimmt auf, solange der Taster gedrückt ist; True bei brauchbarer Aufnahme.

    SIGINT beendet arecord geordnet, damit es den WAV-Header fertigschreiben kann.
    Die Datei liegt im privaten temporären Verzeichnis und wird vom Aufrufer gelöscht.
    """
    if max_seconds <= 0 or min_seconds < 0 or min_seconds >= max_seconds:
        raise ValueError("Ungültige Aufnahmedauer")
    process = subprocess.Popen(recording_command(path, device),
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = time.monotonic()
    try:
        while button.is_pressed and time.monotonic() - started < max_seconds:
            time.sleep(0.025)
    except BaseException:
        process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise
    duration = time.monotonic() - started
    process.send_signal(signal.SIGINT)
    try:
        code = process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        raise RuntimeError("Mikrofonaufnahme ließ sich nicht beenden")
    if duration < min_seconds:
        path.unlink(missing_ok=True)
        return False
    if code not in (0, -signal.SIGINT, 128 + signal.SIGINT) or not path.exists() or path.stat().st_size < 44:
        path.unlink(missing_ok=True)
        raise RuntimeError("Mikrofonaufnahme fehlgeschlagen; Mikrofon prüfen")
    os.chmod(path, 0o600)
    return True


def play_turn(api: KunibertAPI, *, mode: str, wav_path: Path | None,
              state_file: Path, audio_device: str | None = None) -> None:
    """Ein Turn; Antwortdatei bleibt ausschließlich flüchtig im RAM."""
    result = api.send_turn(wav_path, mode, load_state(state_file))
    audio = api.fetch_audio(result)
    save_state(state_file, result.story_state)
    play_wav(audio, device=audio_device)
    print(f"Antwort abgespielt ({result.kind}).")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert – Taster-Prototyp")
    parser.add_argument("--question-pin", type=int, default=17,
                        help="BCM-GPIO für Sprechtaste (Standard: GPIO17 / Pin 11)")
    parser.add_argument("--story-pin", type=int, default=27,
                        help="BCM-GPIO für Erzähltaste (Standard: GPIO27 / Pin 13)")
    parser.add_argument("--mic-device", default=os.environ.get("KUNIBERT_MIC_DEVICE", "default"),
                        help="ALSA-Aufnahmegerät; siehe arecord -l")
    parser.add_argument("--audio-device", default=os.environ.get("KUNIBERT_AUDIO_DEVICE"),
                        help="ALSA-Ausgabegerät; siehe aplay -l")
    parser.add_argument("--state-file", type=Path, default=Path("/dev/shm/kunibert.json"))
    args = parser.parse_args(argv)

    token = os.environ.get("KUNIBERT_DEVICE_TOKEN", "")
    device_id = os.environ.get("KUNIBERT_DEVICE_ID", "")
    base = os.environ.get("KUNIBERT_API_BASE", "")
    if not token or not device_id or not base:
        print("KUNIBERT_API_BASE, KUNIBERT_DEVICE_ID und KUNIBERT_DEVICE_TOKEN müssen gesetzt sein",
              file=sys.stderr)
        return 2
    if args.question_pin == args.story_pin:
        parser.error("Die beiden Taster müssen verschiedene GPIO-Pins verwenden")

    try:
        from gpiozero import Button
    except ImportError:
        print("GPIO Zero fehlt; installieren mit: sudo apt install python3-gpiozero", file=sys.stderr)
        return 2

    try:
        api = KunibertAPI(base, token, device_id)
        with Button(args.question_pin, pull_up=True, bounce_time=0.05) as question, \
                Button(args.story_pin, pull_up=True, bounce_time=0.05) as story:
            print("Bereit. Sprechtaste halten und sprechen; Erzähltaste einmal drücken. Ctrl-C beendet.")
            while True:
                if question.is_pressed:
                    with tempfile.TemporaryDirectory(prefix="kunibert-in-", dir="/dev/shm") as tmp:
                        recording = Path(tmp) / "frage.wav"
                        try:
                            if record_while_held(question, recording, device=args.mic_device):
                                play_turn(api, mode="frage", wav_path=recording,
                                          state_file=args.state_file, audio_device=args.audio_device)
                        except (ApiError, PlaybackError, OSError, RuntimeError, ValueError) as exc:
                            print(f"Kunibert konnte gerade nicht antworten: {exc}", file=sys.stderr)
                    while question.is_pressed:
                        time.sleep(0.025)
                elif story.is_pressed:
                    while story.is_pressed:
                        time.sleep(0.025)
                    try:
                        play_turn(api, mode=story_mode(load_state(args.state_file)), wav_path=None,
                                  state_file=args.state_file, audio_device=args.audio_device)
                    except (ApiError, PlaybackError, OSError, RuntimeError, ValueError) as exc:
                        print(f"Kunibert konnte gerade nicht antworten: {exc}", file=sys.stderr)
                else:
                    time.sleep(0.025)
    except KeyboardInterrupt:
        print("\nPrototyp beendet.")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Prototyp konnte nicht starten: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
