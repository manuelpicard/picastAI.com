"""Send one recorded WAV to the FastAPI server and save its WAV response.

  python3 -m kunibert_pi.api_send --wav frage.wav --output /dev/shm/antwort.wav
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .api import ApiError, KunibertAPI
from .__main__ import load_state, save_state


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert: WAV an FastAPI senden")
    parser.add_argument("--wav", type=Path, required=True, help="16-kHz-mono-16-bit-Aufnahme")
    parser.add_argument("--output", type=Path, required=True, help="Ziel für die WAV-Antwort")
    parser.add_argument("--mode", choices=("frage", "geschichte", "weiter"), default="frage")
    parser.add_argument("--state-file", type=Path, default=None)
    args = parser.parse_args(argv)
    token = os.environ.get("KUNIBERT_DEVICE_TOKEN", "")
    device_id = os.environ.get("KUNIBERT_DEVICE_ID", "")
    base = os.environ.get("KUNIBERT_API_BASE", "http://127.0.0.1:8000")
    if not token or not device_id:
        print("KUNIBERT_DEVICE_TOKEN und KUNIBERT_DEVICE_ID setzen", file=sys.stderr)
        return 2
    try:
        api = KunibertAPI(base, token, device_id)
        turn = api.send_turn(args.wav, args.mode, load_state(args.state_file))
        audio = api.fetch_audio(turn)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(audio)
        save_state(args.state_file, turn.story_state)
        print(f"Gesendet: {turn.kind}; Antwort gespeichert: {args.output}")
        return 0
    except (ApiError, ValueError, OSError) as exc:
        print(f"API-Aufruf fehlgeschlagen: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
