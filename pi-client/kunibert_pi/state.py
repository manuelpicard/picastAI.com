"""Flüchtiger Geschichtenstand des Pi-Clients."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

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
    """Atomar und nur für den Besitzer lesbar; /dev/shm ist flüchtiger Arbeitsspeicher."""
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
