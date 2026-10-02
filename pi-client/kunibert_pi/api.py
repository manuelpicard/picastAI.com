"""Client for a future Kunibert backend. No external AI keys belong on the Pi."""
from __future__ import annotations

import json
import re
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_INPUT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_JSON_BYTES = 32 * 1024
TURN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


class ApiError(Exception):
    """Network or protocol failure; never include children's spoken content."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class Turn:
    turn_id: str
    kind: str
    story_state: dict


class KunibertAPI:
    def __init__(self, base_url: str, token: str, device_id: str, *, timeout: float = 90):
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Ungültige API-Adresse")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("HTTP ist nur für lokale Tests erlaubt; sonst HTTPS verwenden")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("Die API-Adresse muss nur Origin und optional / enthalten")
        if not token or not device_id or len(token) > 1024 or not TURN_ID.fullmatch(device_id):
            raise ValueError("Gerätekennung und Zugriffstoken müssen gesetzt sein")
        if timeout <= 0:
            raise ValueError("Timeout muss positiv sein")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.device_id = device_id
        self.timeout = timeout
        self.opener = build_opener(NoRedirect)

    def _request(self, path: str, *, data: bytes | None = None,
                 content_type: str | None = None, max_bytes: int = MAX_JSON_BYTES,
                 timeout: float | None = None) -> tuple[bytes, str]:
        headers = {"Authorization": f"Bearer {self.token}",
                   "X-Device-Id": self.device_id,
                   "Accept": "application/json" if max_bytes == MAX_JSON_BYTES else "audio/wav"}
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(self.base_url + path, data=data, headers=headers,
                          method="POST" if data is not None else "GET")
        try:
            with self.opener.open(request, timeout=timeout or self.timeout) as response:
                payload = response.read(max_bytes + 1)
                if len(payload) > max_bytes:
                    raise ApiError("Serverantwort überschreitet die Größenbegrenzung")
                return payload, response.headers.get("Content-Type", "").split(";")[0].lower()
        except HTTPError as exc:
            # Do not log returned bodies: a server error could contain private speech.
            raise ApiError(f"API-Fehler HTTP {exc.code}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise ApiError("API nicht erreichbar oder Anfrage abgebrochen") from exc

    def send_turn(self, wav_path: Path | None, mode: str = "frage",
                  story_state: dict | None = None) -> Turn:
        if mode not in {"frage", "geschichte", "weiter"}:
            raise ValueError("Unbekannter Modus")
        # Für "geschichte"/"weiter" ist eine Aufnahme optional (Erzähltaste ohne Wunsch).
        audio = None
        if wav_path is not None:
            audio = Path(wav_path).read_bytes()
            if not audio or len(audio) > MAX_INPUT_BYTES:
                raise ValueError("WAV-Datei fehlt oder ist größer als 2 MiB")
            validate_wav(audio, max_seconds=30, input_audio=True)
        elif mode == "frage":
            raise ValueError("Für eine Frage wird eine Aufnahme benötigt")
        state = json.dumps(story_state or {}, ensure_ascii=False, separators=(",", ":"))
        if len(state.encode("utf-8")) > 4096:
            raise ValueError("Geschichtenstand ist zu groß")
        boundary = "Kunibert" + uuid.uuid4().hex
        parts = []
        for name, value in (("mode", mode), ("story_state", state)):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        if audio is not None:
            parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; '
                          'filename="frage.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode())
            parts.extend((audio, b"\r\n"))
        parts.append(f"--{boundary}--\r\n".encode())
        body, mime = self._request("/v1/turn", data=b"".join(parts),
                                   content_type=f"multipart/form-data; boundary={boundary}")
        if mime != "application/json":
            raise ApiError("Server lieferte kein JSON")
        try:
            result = json.loads(body)
            turn_id = result["turn_id"]
            kind = result["kind"]
            new_state = result.get("story_state", {})
            if not isinstance(turn_id, str) or not TURN_ID.fullmatch(turn_id):
                raise ValueError("invalid turn id")
            if kind not in {"frage", "geschichte", "weiter", "hinweis"} or not isinstance(new_state, dict):
                raise ValueError("invalid result fields")
            if len(json.dumps(new_state).encode()) > 4096:
                raise ValueError("story state too large")
            return Turn(turn_id, kind, new_state)
        except (KeyError, ValueError, TypeError, UnicodeDecodeError) as exc:
            raise ApiError("Ungültiges Antwortformat des Servers") from exc

    def fetch_audio(self, turn: Turn) -> bytes:
        if not TURN_ID.fullmatch(turn.turn_id):
            raise ValueError("Ungültige Turn-ID")
        # Never follow a URL supplied by the server; keep the token on the configured origin.
        body, mime = self._request(f"/v1/turn/{turn.turn_id}/audio",
                                   max_bytes=MAX_OUTPUT_BYTES, timeout=30)
        if mime not in {"audio/wav", "audio/x-wav", "audio/wave"}:
            raise ApiError("Server lieferte kein WAV-Audio")
        try:
            validate_wav(body, max_seconds=180, input_audio=False)
        except ValueError as exc:
            raise ApiError("Server lieferte ungültiges Audio") from exc
        return body


def validate_wav(data: bytes, *, max_seconds: float, input_audio: bool) -> None:
    import io
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("Keine gültige RIFF/WAVE-Datei")
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            channels, rate, width = wav.getnchannels(), wav.getframerate(), wav.getsampwidth()
            duration = wav.getnframes() / rate if rate else 0
            if not (0 < duration <= max_seconds and channels in {1, 2} and
                    width in {1, 2, 3, 4} and 8000 <= rate <= 48000):
                raise ValueError("Nicht unterstütztes WAV-Format oder Dauer")
            if input_audio and (channels != 1 or width != 2 or rate != 16000):
                raise ValueError("Aufnahme muss 16 kHz, mono, 16-bit PCM sein")
    except (wave.Error, EOFError) as exc:
        raise ValueError("Beschädigtes WAV-Audio") from exc
