"""Gerätezugang und flüchtiger Audiospeicher."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

DEVICE_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class DeviceRegistry:
    """Pro Gerät ein eigenes, widerrufbares Token. Gespeichert wird nur der SHA-256-Hash."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.lock = threading.Lock()
        self._devices: dict[str, dict] = {}
        self._mtime = 0.0
        self.reload()

    def reload(self) -> None:
        if not self.path.exists():
            self._devices = {}
            return
        mtime = self.path.stat().st_mtime
        if mtime != self._mtime:
            self._devices = json.loads(self.path.read_text("utf-8")).get("devices", {})
            self._mtime = mtime

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"devices": self._devices}, indent=2), "utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(self.path)
        self._mtime = self.path.stat().st_mtime

    def add(self, device_id: str) -> str:
        if not DEVICE_ID.fullmatch(device_id):
            raise ValueError("Geräte-ID: nur Buchstaben, Ziffern, - und _ (max. 80)")
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.reload()
            self._devices[device_id] = {"token_sha256": _hash(token), "created": int(time.time()),
                                        "revoked": False}
            self._save()
        return token

    def revoke(self, device_id: str) -> bool:
        with self.lock:
            self.reload()
            if device_id not in self._devices:
                return False
            self._devices[device_id]["revoked"] = True
            self._save()
        return True

    def list(self) -> dict[str, dict]:
        with self.lock:
            self.reload()
            return {k: {"created": v["created"], "revoked": v["revoked"]} for k, v in self._devices.items()}

    def verify(self, device_id: str, token: str) -> bool:
        with self.lock:
            self.reload()
            entry = self._devices.get(device_id) if DEVICE_ID.fullmatch(device_id or "") else None
        expected = entry["token_sha256"] if entry else _hash("invalid-" + secrets.token_hex(8))
        ok = hmac.compare_digest(expected, _hash(token or ""))
        return bool(entry) and ok and not entry.get("revoked", False)


class RateLimiter:
    def __init__(self, max_turns: int, window_seconds: float):
        self.max_turns, self.window = max_turns, window_seconds
        self.events: dict[str, deque] = {}
        self.lock = threading.Lock()

    def allow(self, device_id: str) -> bool:
        now = time.monotonic()
        with self.lock:
            q = self.events.setdefault(device_id, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.max_turns:
                return False
            q.append(now)
            return True


@dataclass
class _Entry:
    device_id: str
    wav: bytes
    expires: float


class AudioStore:
    """Antwort-Audio nur im Arbeitsspeicher, nur für das erzeugende Gerät, einmal abrufbar, kurz gültig."""

    def __init__(self, ttl_seconds: float = 120, max_per_device: int = 3):
        self.ttl, self.max_per_device = ttl_seconds, max_per_device
        self._items: dict[str, _Entry] = {}
        self.lock = threading.Lock()

    def _purge(self, now: float) -> None:
        for key in [k for k, v in self._items.items() if v.expires < now]:
            del self._items[key]

    def put(self, device_id: str, wav: bytes) -> str:
        turn_id = "t_" + secrets.token_urlsafe(18)
        now = time.monotonic()
        with self.lock:
            self._purge(now)
            mine = sorted((v.expires, k) for k, v in self._items.items() if v.device_id == device_id)
            while len(mine) >= self.max_per_device:
                del self._items[mine.pop(0)[1]]
            self._items[turn_id] = _Entry(device_id, wav, now + self.ttl)
        return turn_id

    def take(self, device_id: str, turn_id: str) -> bytes | None:
        with self.lock:
            self._purge(time.monotonic())
            entry = self._items.get(turn_id)
            if entry is None or not hmac.compare_digest(entry.device_id, device_id):
                return None
            del self._items[turn_id]
            return entry.wav

    def __len__(self) -> int:
        with self.lock:
            return len(self._items)
