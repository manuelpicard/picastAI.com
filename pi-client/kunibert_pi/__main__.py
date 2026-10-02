"""Run: python3 -m kunibert_pi --wav /path/to/question.wav --mode frage

Erzähltaste ohne Wunsch:  python3 -m kunibert_pi --mode geschichte --state-file /dev/shm/kunibert.json
Weitererzählen:           python3 -m kunibert_pi --mode weiter     --state-file /dev/shm/kunibert.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from .api import ApiError, KunibertAPI
from .audio import PlaybackError, play_wav

MAX_STATE_BYTES = 4096


def load_state(path: Path | None) -> dict:
    """Geschichtenstand lesen; Unlesbares wird verworfen (dann beginnt eine neue Folge)."""
    if path is None or not path.exists():
        return {}
    try:
        raw = path.read_bytes()
        state = json.loads(raw) if len(raw) <= MAX_STATE_BYTES else {}
    except (OSError, ValueError):
        return {}
    return state if isinstance(state, dict) else {}


def save_state(path: Path | None, state: dict) -> None:
    """Atomar und nur für den Besitzer lesbar. Empfohlen: /dev/shm (RAM, nach Neustart weg)."""
    if path is None:
        return
    fd, tmp = tempfile.mkstemp(prefix=".kunibert-state-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert: Aufnahme senden und Antwort vorlesen")
    parser.add_argument("--wav", type=Path, default=None,
                        help="16 kHz mono 16-bit PCM WAV (für --mode frage Pflicht)")
    parser.add_argument("--mode", choices=("frage", "geschichte", "weiter"), default="frage")
    parser.add_argument("--state-file", type=Path, default=None,
                        help="Geschichtenstand zwischen Aufrufen merken, z. B. /dev/shm/kunibert.json")
    parser.add_argument("--audio-device", default=None, help="optional: ALSA-Ausgabegerät, z. B. plughw:1,0")
    args = parser.parse_args(argv)
    if args.mode == "frage" and args.wav is None:
        parser.error("--wav ist für --mode frage erforderlich")
    token = os.environ.get("KUNIBERT_DEVICE_TOKEN", "")
    device_id = os.environ.get("KUNIBERT_DEVICE_ID", "")
    base = os.environ.get("KUNIBERT_API_BASE", "http://127.0.0.1:8000")
    if not token or not device_id:
        print("KUNIBERT_DEVICE_TOKEN und KUNIBERT_DEVICE_ID setzen", file=sys.stderr)
        return 2
    try:
        api = KunibertAPI(base, token, device_id)
        result = api.send_turn(args.wav, args.mode, load_state(args.state_file))
        audio = api.fetch_audio(result)
        # Stand erst nach erfolgreichem Abruf übernehmen, damit kein Teil übersprungen wird.
        save_state(args.state_file, result.story_state)
        play_wav(audio, device=args.audio_device)
        print(f"Antwort abgespielt ({result.kind}, Turn {result.turn_id}).")
        return 0
    except (ApiError, PlaybackError, ValueError, OSError) as exc:
        # Errors contain neither transcript nor keys.
        print(f"Kunibert konnte gerade nicht antworten: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
