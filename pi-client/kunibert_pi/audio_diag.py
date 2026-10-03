"""ALSA diagnosis for the Raspberry Pi prototype.

Examples:
  python3 -m kunibert_pi.audio_diag
  python3 -m kunibert_pi.audio_diag --record-test --input plughw:1,0
  python3 -m kunibert_pi.audio_diag --play-test --output plughw:2,0
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from .audio import play_wav
from .recorder import Recorder


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run_listing(command: list[str]) -> tuple[int, str]:
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    return result.returncode, (result.stdout + result.stderr).strip()


def tone_wav(path: Path, seconds: float = 1.0) -> None:
    # A quiet 440 Hz mono PCM tone, generated without extra dependencies.
    import math
    frames = bytearray()
    for n in range(int(16000 * seconds)):
        sample = int(5000 * math.sin(2 * math.pi * 440 * n / 16000))
        frames.extend(sample.to_bytes(2, "little", signed=True))
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(frames)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ALSA-Diagnose für Ritter Kunibert")
    parser.add_argument("--input", default=os.environ.get("KUNIBERT_AUDIO_INPUT"),
                        help="Aufnahmegerät, z. B. plughw:1,0")
    parser.add_argument("--output", default=os.environ.get("KUNIBERT_AUDIO_OUTPUT"),
                        help="Ausgabegerät, z. B. plughw:2,0")
    parser.add_argument("--record-test", action="store_true", help="3-Sekunden-Mikrofontest")
    parser.add_argument("--play-test", action="store_true", help="Testton abspielen")
    args = parser.parse_args(argv)
    if not command_exists("arecord") or not command_exists("aplay"):
        print("FEHLER: alsa-utils fehlt: sudo apt install -y alsa-utils")
        return 2

    print("=== erkannte ALSA-Hardware ===")
    for label, command in (("Wiedergabe", ["aplay", "-l"]),
                           ("Aufnahme", ["arecord", "-l"]),
                           ("Gerätenamen", ["aplay", "-L"])):
        code, output = run_listing(command)
        print(f"\n--- {label} (exit {code}) ---\n{output or '(keine Ausgabe)'}")
    print("\n=== Empfehlung ===")
    print("Verwende für USB-Geräte stabile Namen wie plughw:CARD=<name>,DEV=0, nicht nur Indizes wie plughw:1,0.")
    if not args.input or not args.output:
        print("Setze --input und --output anhand der Listen oben; es wurde kein Test gestartet.")
        return 0

    if args.record_test:
        print(f"\n=== Aufnahmeprüfung: {args.input} ===")
        try:
            data = Recorder(device=args.input, max_seconds=3).record()
            print(f"OK: {len(data)} Bytes gültiges 16-kHz-Mono-WAV aufgenommen.")
        except Exception as exc:
            print(f"FEHLER: Aufnahme über {args.input} nicht möglich ({type(exc).__name__}).")
            return 1
    if args.play_test:
        print(f"\n=== Wiedergabeprüfung: {args.output} ===")
        with tempfile.TemporaryDirectory(prefix="kunibert-tone-", dir="/dev/shm" if os.path.isdir("/dev/shm") else None) as directory:
            path = Path(directory) / "tone.wav"
            tone_wav(path)
            try:
                play_wav(path.read_bytes(), device=args.output, timeout=10)
                print("OK: Testton abgespielt.")
            except Exception as exc:
                print(f"FEHLER: Wiedergabe über {args.output} nicht möglich ({type(exc).__name__}).")
                return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
