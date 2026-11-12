#!/usr/bin/env python3
"""Ritter Kunibert client for Raspberry Pi (Pi 5 for the prototype; the final device is planned as ESP32-S3).

The client deliberately keeps device responsibilities small:
- buttons and microphone are handled locally;
- speech recognition, safety, curation, story generation and TTS stay on picastAI;
- generated audio is downloaded and played once, then removed locally.

Real hardware dependencies are optional at import time. This makes the state
machine usable in CI and with ``--dry-run`` on a normal computer.

Environment variables are documented in pi-client/README.md.
"""

from __future__ import annotations

import argparse
import array
import io
import json
import logging
import os
import secrets
import signal
import sys
import tempfile
import threading
import time
import wave
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Any, Callable, Optional, Protocol
from urllib.parse import urljoin, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

LOG = logging.getLogger("kunibert")


class ClientState(Enum):
    BOOT = auto()
    WIFI_CONNECTING = auto()
    READY = auto()
    RECORDING = auto()
    UPLOADING = auto()
    REQUESTING_STORY = auto()
    PLAYING = auto()
    MIC_OFF = auto()
    ERROR = auto()
    SHUTDOWN = auto()


@dataclass(frozen=True)
class ClientConfig:
    api_base_url: str = "https://picastAI.com"
    device_id: str = "prototype-001"
    device_token: str = ""
    locale: str = "de-DE"
    age_band: str = "6-10"
    sample_rate: int = 16_000
    channels: int = 1
    sample_width: int = 2
    max_record_seconds: float = 15.0
    min_record_seconds: float = 0.35
    audio_timeout_seconds: float = 45.0
    request_timeout_seconds: float = 30.0
    # Frage und Geschichte laufen auf dem Server durch Spracherkennung, Sprachmodell
    # und Sprachsynthese (gemeinsames Zeitbudget 120 s). Der Client muss länger
    # warten als der Server, sonst bricht er ab und wiederholt die ganze Kette.
    pipeline_timeout_seconds: float = 140.0
    # Höchstens ein Wiederholungsversuch, wie in der Firmware (kb_retry_decide). Mit zwei
    # Wiederholungen konnte ein Kind bei einem hängenden Server über sieben Minuten warten.
    retry_count: int = 1
    retry_backoff_seconds: float = 1.5
    # Pause zwischen zwei Versuchen, beim Start den Server zu erreichen (WLAN oder Router
    # sind nach einem Stromausfall oft später da als das Gerät).
    connect_retry_seconds: float = 10.0
    speech_button_gpio: int = 17
    story_button_gpio: int = 27
    mic_off_gpio: int = 22
    status_led_gpio: int = 23
    # Optionale Audiogeräte (sounddevice-Angabe: Nummer oder Namensteil, siehe
    # "python3 -m sounddevice"). None = Standardgerät von PortAudio/ALSA. Mit zwei
    # getrennten USB-Geräten (Mikrofon und Lautsprecher) getrennt setzen.
    input_device: Optional[int | str] = None
    output_device: Optional[int | str] = None
    poll_interval_seconds: float = 0.04
    cache_dir: Path = Path("/var/lib/kunibert/audio")
    dry_run: bool = False

    @classmethod
    def from_env(cls, dry_run: bool = False) -> "ClientConfig":
        def integer(name: str, default: int) -> int:
            try:
                return int(os.getenv(name, str(default)))
            except ValueError:
                return default

        def number(name: str, default: float) -> float:
            try:
                return float(os.getenv(name, str(default)))
            except ValueError:
                return default

        def device(name: str) -> Optional[int | str]:
            return parse_audio_device(os.getenv(name))

        return cls(
            api_base_url=os.getenv("PICASTAI_API_BASE_URL", "https://picastAI.com").rstrip("/"),
            device_id=os.getenv("PICASTAI_DEVICE_ID", "prototype-001"),
            device_token=os.getenv("PICASTAI_DEVICE_TOKEN", ""),
            locale=os.getenv("KUNIBERT_LOCALE", "de-DE"),
            age_band=os.getenv("KUNIBERT_AGE_BAND", "6-10"),
            sample_rate=integer("KUNIBERT_SAMPLE_RATE", 16_000),
            channels=integer("KUNIBERT_CHANNELS", 1),
            max_record_seconds=number("KUNIBERT_MAX_RECORD_SECONDS", 15.0),
            min_record_seconds=number("KUNIBERT_MIN_RECORD_SECONDS", 0.35),
            audio_timeout_seconds=number("KUNIBERT_AUDIO_TIMEOUT", 45.0),
            request_timeout_seconds=number("KUNIBERT_REQUEST_TIMEOUT", 30.0),
            pipeline_timeout_seconds=number("KUNIBERT_PIPELINE_TIMEOUT", 140.0),
            retry_count=integer("KUNIBERT_RETRY_COUNT", 1),
            retry_backoff_seconds=number("KUNIBERT_RETRY_BACKOFF", 1.5),
            connect_retry_seconds=number("KUNIBERT_CONNECT_RETRY", 10.0),
            speech_button_gpio=integer("KUNIBERT_SPEECH_BUTTON_GPIO", 17),
            story_button_gpio=integer("KUNIBERT_STORY_BUTTON_GPIO", 27),
            mic_off_gpio=integer("KUNIBERT_MIC_OFF_GPIO", 22),
            status_led_gpio=integer("KUNIBERT_STATUS_LED_GPIO", 23),
            input_device=device("KUNIBERT_INPUT_DEVICE"),
            output_device=device("KUNIBERT_OUTPUT_DEVICE"),
            cache_dir=Path(os.getenv("KUNIBERT_CACHE_DIR", "/var/lib/kunibert/audio")),
            dry_run=dry_run,
        )


def parse_audio_device(value: Optional[str]) -> Optional[int | str]:
    """Audiogerät aus der Umgebung: leer = Standard, nur Ziffern = Gerätenummer, sonst Namensteil."""
    text = (value or "").strip()
    if not text:
        return None
    return int(text) if text.isdigit() else text


class HardwareError(RuntimeError):
    pass


class ApiError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


class NoRedirectHandler(HTTPRedirectHandler):
    """Reject redirects so authenticated requests cannot leave their origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_DEFAULT_PORTS = {"http": 80, "https": 443}


def _origin(url: str) -> Optional[tuple[str, str, int]]:
    """Scheme, host and port of ``url`` in comparable form, or None if unusable.

    Host names are case-insensitive and a missing port means the scheme's default
    port, so ``https://picastAI.com`` and ``https://picastai.com:443`` are the same
    origin. URLs with credentials, other schemes or an invalid port yield None.
    """
    try:
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError:
        return None
    if scheme not in _DEFAULT_PORTS or not host or parsed.username or parsed.password:
        return None
    return scheme, host, port if port is not None else _DEFAULT_PORTS[scheme]


def same_origin(first: str, second: str) -> bool:
    origin = _origin(first)
    return origin is not None and origin == _origin(second)


class AudioInput(Protocol):
    def record_while_pressed(self, is_pressed: Callable[[], bool], max_seconds: float) -> bytes: ...


class AudioOutput(Protocol):
    def play_wav(self, wav_bytes: bytes, should_stop: Optional[Callable[[], bool]] = None) -> None: ...


class Buttons(Protocol):
    @property
    def speech_pressed(self) -> bool: ...

    @property
    def story_pressed(self) -> bool: ...

    @property
    def mic_off(self) -> bool: ...


class StatusLed(Protocol):
    def set(self, mode: str) -> None: ...


class GpioButtons:
    """Active-low GPIO buttons with internal pull-ups."""

    def __init__(self, config: ClientConfig):
        try:
            from gpiozero import Button
        except ImportError as exc:
            raise HardwareError("gpiozero fehlt; auf dem Pi installieren: sudo apt install python3-gpiozero") from exc
        self._speech = Button(config.speech_button_gpio, pull_up=True, bounce_time=0.05)
        self._story = Button(config.story_button_gpio, pull_up=True, bounce_time=0.05)
        self._mic_off = Button(config.mic_off_gpio, pull_up=True, bounce_time=0.05)

    @property
    def speech_pressed(self) -> bool:
        return self._speech.is_pressed

    @property
    def story_pressed(self) -> bool:
        return self._story.is_pressed

    @property
    def mic_off(self) -> bool:
        return self._mic_off.is_pressed

    def close(self) -> None:
        for item in (self._speech, self._story, self._mic_off):
            item.close()


class GpioStatusLed:
    """One LED, active-high. Modes: off, ready, recording, busy, error, mic_off."""

    _PATTERNS: dict[str, tuple[tuple[bool, float], ...]] = {
        "recording": ((True, 0.18), (False, 0.18)),
        "busy": ((True, 0.7), (False, 0.7)),
        "error": ((True, 0.08), (False, 0.08)),
        "mic_off": ((True, 0.08), (False, 0.12), (True, 0.08), (False, 1.2)),
    }

    def __init__(self, config: ClientConfig):
        try:
            from gpiozero import LED
        except ImportError as exc:
            raise HardwareError("gpiozero fehlt; auf dem Pi installieren: sudo apt install python3-gpiozero") from exc
        self._led = LED(config.status_led_gpio)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def set(self, mode: str) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=0.2)
        self._thread = None
        if mode == "off":
            self._led.off()
            return
        if mode == "ready":
            self._led.on()
            return
        pattern = self.pattern_for_mode(mode)
        if pattern:
            self._blink(pattern)
        else:
            self._led.off()

    @classmethod
    def pattern_for_mode(cls, mode: str) -> tuple[tuple[bool, float], ...]:
        return cls._PATTERNS.get(mode, ())

    def _blink(self, pattern: tuple[tuple[bool, float], ...]) -> None:
        self._stop = threading.Event()
        stop = self._stop
        self._led.off()

        def worker() -> None:
            while not stop.is_set():
                for is_on, duration in pattern:
                    if stop.is_set():
                        break
                    self._led.on() if is_on else self._led.off()
                    if stop.wait(duration):
                        break
            self._led.off()

        self._thread = threading.Thread(target=worker, name="kunibert-led", daemon=True)
        self._thread.start()

    def close(self) -> None:
        self.set("off")
        self._led.close()


class SoundDeviceAudio:
    """Audio adapter for sounddevice + stdlib wave; suitable for Pi ALSA devices."""

    def __init__(self, config: ClientConfig):
        try:
            import sounddevice as sd
        except ImportError as exc:
            raise HardwareError("sounddevice fehlt; siehe pi-client/README.md") from exc
        self.sd = sd
        self.config = config

    def record_while_pressed(self, is_pressed: Callable[[], bool], max_seconds: float) -> bytes:
        frames: list[bytes] = []
        block_frames = 1024
        started = time.monotonic()
        try:
            with self.sd.RawInputStream(
                samplerate=self.config.sample_rate,
                channels=self.config.channels,
                dtype="int16",
                blocksize=block_frames,
                device=self.config.input_device,
            ) as stream:
                while is_pressed() and time.monotonic() - started < max_seconds:
                    data, _overflowed = stream.read(block_frames)
                    frames.append(bytes(data))
        except Exception as exc:
            raise HardwareError(f"Mikrofonaufnahme fehlgeschlagen: {exc}") from exc
        pcm = b"".join(frames)
        return encode_wav(pcm, self.config.sample_rate, self.config.channels, self.config.sample_width)

    # Rohformat je Sample-Breite (WAV mit 8 Bit ist vorzeichenlos).
    _RAW_DTYPES = {1: "uint8", 2: "int16", 3: "int24", 4: "int32"}

    def play_wav(self, wav_bytes: bytes, should_stop: Optional[Callable[[], bool]] = None) -> None:
        """Spielt eine WAV-Antwort ab, ohne NumPy.

        Früher lief das über ``sd.play()``. Das braucht NumPy (ist auf dem Pi nicht
        installiert) und nimmt keine Bytes an: Mit sounddevice 0.5.6 scheiterte jede
        Wiedergabe („NumPy must be installed“, mit NumPy „Unsupported data type“).
        ``RawOutputStream`` nimmt die Bytes direkt. Geschrieben wird in Stücken von
        etwa 0,1 s, damit ``should_stop`` (zum Beispiel ein Beenden des Dienstes) die
        Wiedergabe abbrechen kann. Beim Verlassen des ``with``-Blocks wartet PortAudio,
        bis alles ausgespielt ist.
        """
        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
                channels = wav.getnchannels()
                rate = wav.getframerate()
                width = wav.getsampwidth()
                frames = wav.readframes(wav.getnframes())
            dtype = self._RAW_DTYPES.get(width)
            if dtype is None:
                raise HardwareError(f"WAV mit {width * 8} Bit wird nicht unterstützt")
            chunk_bytes = max(1, rate // 10) * channels * width
            with self.sd.RawOutputStream(
                samplerate=rate,
                channels=channels,
                dtype=dtype,
                device=self.config.output_device,
            ) as stream:
                for start in range(0, len(frames), chunk_bytes):
                    if should_stop is not None and should_stop():
                        # Sofort abbrechen statt die gepufferten Blöcke noch auszuspielen.
                        stream.abort()
                        return
                    stream.write(frames[start:start + chunk_bytes])
        except HardwareError:
            raise
        except Exception as exc:
            raise HardwareError(f"Audioausgabe fehlgeschlagen: {exc}") from exc


class DryRunButtons:
    """No hardware; useful for API/state-machine smoke tests."""

    speech_pressed = False
    story_pressed = False
    mic_off = False


class DryRunAudio:
    def __init__(self, config: ClientConfig):
        self.config = config

    def record_while_pressed(self, is_pressed: Callable[[], bool], max_seconds: float) -> bytes:
        pcm = b"\x00\x00" * int(self.config.sample_rate * 0.5)
        return encode_wav(pcm, self.config.sample_rate, self.config.channels, self.config.sample_width)

    def play_wav(self, wav_bytes: bytes, should_stop: Optional[Callable[[], bool]] = None) -> None:
        LOG.info("Dry-run: würde WAV mit %d Bytes abspielen", len(wav_bytes))


class DryRunLed:
    def set(self, mode: str) -> None:
        LOG.info("LED: %s", mode)


class KeyboardButtons:
    """Tastatur statt Taster: für einen Probelauf am Rechner ohne Pi (``--keyboard``).

    Eingabetaste: Aufnahme beginnen; noch einmal Eingabetaste: Aufnahme beenden und senden.
    ``g`` + Eingabetaste: Erzähltaste. ``q`` + Eingabetaste (oder Ende der Eingabe): beenden.
    Einen Mikrofon-Aus-Schalter gibt es hier nicht.
    """

    mic_off = False

    def __init__(self, lines: Optional[Any] = None, on_quit: Optional[Callable[[], None]] = None,
                 start_reader: bool = True):
        self.on_quit = on_quit
        self._lock = threading.Lock()
        self._speech = False
        self._story = False
        self._thread: Optional[threading.Thread] = None
        if start_reader:
            source = sys.stdin if lines is None else lines
            self._thread = threading.Thread(target=self._read, args=(source,), name="kunibert-tastatur", daemon=True)
            self._thread.start()

    def _read(self, source: Any) -> None:
        for line in source:
            self.handle_line(line)
        self._quit()

    def _quit(self) -> None:
        with self._lock:
            self._speech = False
        if self.on_quit:
            self.on_quit()

    def handle_line(self, line: str) -> None:
        command = line.strip().lower()
        if command in {"q", "quit", "ende"}:
            self._quit()
            return
        with self._lock:
            if command == "":
                self._speech = not self._speech
            elif command in {"g", "geschichte"}:
                self._story = True
            else:
                print("Eingabetaste = sprechen/senden, g = Geschichte, q = Ende", flush=True)

    @property
    def speech_pressed(self) -> bool:
        with self._lock:
            return self._speech

    @property
    def story_pressed(self) -> bool:
        # Ein Tastendruck gilt genau einmal.
        with self._lock:
            pressed, self._story = self._story, False
            return pressed

    def discard_pending(self) -> None:
        """Vergisst Tastendrücke, die während Warten oder Abspielen kamen.

        Sonst begann nach einer Antwort sofort eine neue Aufnahme, wenn jemand in der
        Zwischenzeit die Eingabetaste gedrückt hatte (oder eine Geschichte nach ``g``).
        """
        with self._lock:
            self._speech = False
            self._story = False


class ConsoleLed:
    """Zeigt den Zustand als Textzeile statt mit einer LED (Probelauf am Rechner)."""

    _TEXT = {
        "ready": "Bereit. Eingabetaste = sprechen, g = Geschichte, q = Ende",
        "recording": "Aufnahme läuft. Eingabetaste = fertig und senden",
        "busy": "Kunibert arbeitet ...",
        "error": "Fehler (siehe Meldung oben)",
    }

    def set(self, mode: str) -> None:
        text = self._TEXT.get(mode)
        if text:
            print(f"[{text}]", flush=True)


# Unter diesem Spitzenpegel (etwa -54 dBFS bei 16 Bit) ist eine Aufnahme praktisch stumm:
# Mikrofon aus, falsches Gerät oder (unter Windows) der Zugriff auf das Mikrofon gesperrt.
SILENT_PEAK = 64


def pcm16_peak(wav_bytes: bytes) -> Optional[int]:
    """Höchster Betrag der Samples einer 16-Bit-WAV-Datei; None, wenn das nicht auswertbar ist."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            if wav.getsampwidth() != 2:
                return None
            frames = wav.readframes(wav.getnframes())
    except wave.Error:
        return None
    samples = array.array("h")
    samples.frombytes(frames[: len(frames) - len(frames) % 2])
    if sys.byteorder == "big":
        samples.byteswap()
    return max((abs(value) for value in samples), default=0)


def encode_wav(pcm: bytes, sample_rate: int, channels: int, sample_width: int) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sample_width)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return out.getvalue()


def validate_wav(wav_bytes: bytes, config: ClientConfig) -> None:
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            if wav.getnchannels() != config.channels:
                raise ApiError("Unerwartete WAV-Kanalzahl")
            if wav.getsampwidth() != config.sample_width:
                raise ApiError("Unerwartete WAV-Bittiefe")
            if wav.getframerate() != config.sample_rate:
                raise ApiError("Unerwartete WAV-Abtastrate")
            if wav.getnframes() <= 0:
                raise ApiError("WAV enthält keine Audiodaten")
    except wave.Error as exc:
        raise ApiError("Ungültige WAV-Antwort") from exc


class PicastApi:
    def __init__(self, config: ClientConfig):
        if not config.device_token and not config.dry_run:
            raise ApiError("PICASTAI_DEVICE_TOKEN ist nicht gesetzt")
        self.config = config
        self.session_id = secrets.token_urlsafe(12)
        # Uhr für die Wiederholungsregel (Tests setzen eine eigene).
        self.clock: Callable[[], float] = time.monotonic

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.device_token}",
            "X-Device-ID": self.config.device_id,
            "Accept": "application/json",
            "User-Agent": "ritter-kunibert-pi/0.1",
        }

    def health(self) -> bool:
        if self.config.dry_run:
            return True
        status, _headers, body = self._request("GET", "/health", accept_json=True)
        return status == 200 and body.get("status") == "ok"

    def ask_question(self, wav_bytes: bytes) -> bytes:
        validate_wav(wav_bytes, self.config)
        fields = {
            "locale": self.config.locale,
            "age_band": self.config.age_band,
            "session_id": self.session_id,
        }
        body, content_type = multipart_form(fields, "audio", "question.wav", wav_bytes, "audio/wav")
        response = self._with_retries("POST", "/v1/device/question", body, {
            **self._headers,
            "Content-Type": content_type,
        }, timeout=self.config.pipeline_timeout_seconds)
        return self._download_audio(response)

    def request_story(self) -> bytes:
        payload = json.dumps({
            "locale": self.config.locale,
            "age_band": self.config.age_band,
            "length": "short",
            "session_id": self.session_id,
        }).encode("utf-8")
        response = self._with_retries("POST", "/v1/device/kunibert-story", payload, {
            **self._headers,
            "Content-Type": "application/json",
        }, timeout=self.config.pipeline_timeout_seconds)
        return self._download_audio(response)

    def _download_audio(self, response: dict[str, Any]) -> bytes:
        audio_url = response.get("audio_url")
        if not isinstance(audio_url, str) or not audio_url:
            raise ApiError("API-Antwort enthält keine audio_url")
        try:
            absolute_url = urlparse(urljoin(self.config.api_base_url + "/", audio_url)).geturl()
        except ValueError as exc:
            raise ApiError("audio_url ist keine gültige Adresse") from exc
        if not same_origin(absolute_url, self.config.api_base_url):
            raise ApiError("audio_url verweist nicht auf denselben Origin wie die API")
        status, headers, data = self._request_absolute(
            "GET", absolute_url, None, self._headers, timeout=self.config.audio_timeout_seconds
        )
        if status != 200 or not data:
            raise ApiError(f"Audioabruf fehlgeschlagen (HTTP {status})", status=status, retryable=status >= 500)
        content_type = next((value for key, value in headers.items() if key.lower() == "content-type"), "")
        if content_type.split(";")[0].lower() != "audio/wav":
            raise ApiError("Server lieferte kein WAV-Audio")
        validate_wav(data, self.config)
        return data

    def _with_retries(self, method: str, path: str, body: bytes, headers: dict[str, str],
                      timeout: Optional[float] = None) -> dict[str, Any]:
        """Anfrage mit höchstens ``retry_count`` Wiederholungen (Standard 1, wie die Firmware).

        Nicht wiederholt wird, wenn der Server es ausschließt (400, 401, 413, 415, 429 oder
        ``"retryable": false``) und wenn die erste Anfrage schon die ganze Zeitgrenze
        gebraucht hat: Dann hängt der Server oder das Netz, und ein Kind würde noch einmal
        so lange warten (Regel aus ``kb_retry_decide`` der Firmware).
        """
        last_error: Optional[Exception] = None
        started = self.clock()
        limit = self.config.request_timeout_seconds if timeout is None else timeout
        for attempt in range(self.config.retry_count + 1):
            try:
                status, _response_headers, payload = self._request(method, path, body, headers, timeout=timeout)
                if status in (401, 400, 413, 415, 429):
                    raise ApiError(f"API-Anfrage abgelehnt (HTTP {status})", status=status, retryable=False)
                if status < 200 or status >= 300:
                    retryable = status >= 500 and not self._server_says_not_retryable(payload)
                    raise ApiError(f"API-Fehler (HTTP {status})", status=status, retryable=retryable)
                try:
                    return json.loads(payload.decode("utf-8"))
                except json.JSONDecodeError as exc:
                    raise ApiError("API lieferte ungültiges JSON") from exc
            except (TimeoutError, OSError, ApiError) as exc:
                last_error = exc
                retryable = not isinstance(exc, ApiError) or exc.retryable
                time_used_up = self.clock() - started >= limit
                if attempt >= self.config.retry_count or not retryable or time_used_up:
                    raise
                delay = self.config.retry_backoff_seconds * (attempt + 1)
                LOG.warning("API-Versuch %d fehlgeschlagen (%s), neuer Versuch in %.1fs", attempt + 1, exc, delay)
                time.sleep(delay)
        raise last_error or ApiError("Unbekannter API-Fehler")

    @staticmethod
    def _server_says_not_retryable(payload: Any) -> bool:
        """True, wenn der Server mit ``"retryable": false`` meldet, dass ein neuer Versuch nichts ändert.

        Beispiel: HTTP 502 bei einem dauerhaften Fehler des Sprachdienstes. Jeder weitere
        Versuch würde dort erneut Modell- und Sprachsynthese-Kosten verursachen.
        """
        if not isinstance(payload, (bytes, bytearray)):
            return False
        try:
            data = json.loads(bytes(payload).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False
        return isinstance(data, dict) and data.get("retryable") is False

    def _request(self, method: str, path: str, body: Optional[bytes] = None,
                 headers: Optional[dict[str, str]] = None, accept_json: bool = False,
                 timeout: Optional[float] = None) -> tuple[int, dict[str, str], bytes | dict[str, Any]]:
        if accept_json:
            status, response_headers, raw = self._request_absolute(method, urljoin(self.config.api_base_url + "/", path.lstrip("/")), body, headers or {}, timeout=timeout)
            try:
                return status, response_headers, json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                return status, response_headers, {}
        return self._request_absolute(method, urljoin(self.config.api_base_url + "/", path.lstrip("/")), body, headers or {}, timeout=timeout)

    def _request_absolute(self, method: str, url: str, body: Optional[bytes], headers: dict[str, str],
                          timeout: Optional[float] = None) -> tuple[int, dict[str, str], bytes]:
        request = Request(url, data=body, headers=headers, method=method)
        try:
            opener = build_opener(NoRedirectHandler())
            effective_timeout = self.config.request_timeout_seconds if timeout is None else timeout
            with opener.open(request, timeout=effective_timeout) as response:
                return response.status, dict(response.headers.items()), response.read()
        except TimeoutError:
            raise
        except HTTPError as exc:
            return exc.code, dict(exc.headers.items()), exc.read()
        except URLError as exc:
            raise OSError(str(exc.reason)) from exc
        except OSError as exc:
            raise


def multipart_form(fields: dict[str, str], file_field: str, filename: str,
                  content: bytes, content_type: str) -> tuple[bytes, str]:
    boundary = "----Kunibert" + secrets.token_hex(12)
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks += [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode("utf-8"), b"\r\n",
        ]
    chunks += [
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        content, b"\r\n", f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


@dataclass
class KunibertClient:
    config: ClientConfig
    api: PicastApi
    audio_in: AudioInput
    audio_out: AudioOutput
    buttons: Buttons
    led: StatusLed
    state: ClientState = ClientState.BOOT
    stop_requested: bool = False
    last_error: Optional[str] = None
    state_history: list[ClientState] = field(default_factory=list)
    # Uhr für die Zeitmessung (Tests setzen eine eigene).
    clock: Callable[[], float] = time.monotonic
    # Warten zwischen Verbindungsversuchen (Tests setzen eine eigene Funktion).
    sleep: Callable[[float], None] = time.sleep

    def transition(self, new_state: ClientState) -> None:
        allowed = {
            ClientState.BOOT: {ClientState.WIFI_CONNECTING, ClientState.MIC_OFF, ClientState.SHUTDOWN},
            ClientState.WIFI_CONNECTING: {ClientState.READY, ClientState.ERROR, ClientState.MIC_OFF, ClientState.SHUTDOWN},
            ClientState.READY: {ClientState.RECORDING, ClientState.REQUESTING_STORY, ClientState.MIC_OFF, ClientState.ERROR, ClientState.SHUTDOWN},
            ClientState.RECORDING: {ClientState.UPLOADING, ClientState.READY, ClientState.MIC_OFF, ClientState.ERROR, ClientState.SHUTDOWN},
            ClientState.UPLOADING: {ClientState.PLAYING, ClientState.READY, ClientState.ERROR, ClientState.SHUTDOWN},
            ClientState.REQUESTING_STORY: {ClientState.PLAYING, ClientState.READY, ClientState.ERROR, ClientState.SHUTDOWN},
            ClientState.PLAYING: {ClientState.READY, ClientState.MIC_OFF, ClientState.ERROR, ClientState.SHUTDOWN},
            ClientState.MIC_OFF: {ClientState.READY, ClientState.SHUTDOWN},
            ClientState.ERROR: {ClientState.READY, ClientState.MIC_OFF, ClientState.SHUTDOWN},
            ClientState.SHUTDOWN: set(),
        }
        if new_state not in allowed[self.state]:
            raise RuntimeError(f"Ungültiger Zustandswechsel {self.state.name} -> {new_state.name}")
        LOG.info("Zustand: %s -> %s", self.state.name, new_state.name)
        self.state = new_state
        self.state_history.append(new_state)
        self.led.set(self._led_mode(new_state))

    @staticmethod
    def _led_mode(state: ClientState) -> str:
        if state == ClientState.READY:
            return "ready"
        if state == ClientState.RECORDING:
            return "recording"
        if state in {ClientState.UPLOADING, ClientState.REQUESTING_STORY, ClientState.PLAYING, ClientState.WIFI_CONNECTING}:
            return "busy"
        if state == ClientState.MIC_OFF:
            return "mic_off"
        if state == ClientState.ERROR:
            return "error"
        return "off"

    def run(self) -> None:
        try:
            self.transition(ClientState.WIFI_CONNECTING)
            if not self.wait_for_server():
                return
            self.transition(ClientState.MIC_OFF if self.buttons.mic_off else ClientState.READY)
            LOG.info("Kunibert bereit. Sprechtaste gedrückt halten oder Erzähltaste drücken.")
            while not self.stop_requested:
                self.step()
                time.sleep(self.config.poll_interval_seconds)
        except KeyboardInterrupt:
            LOG.info("Beendet durch Benutzer")
        except Exception as exc:
            self.last_error = str(exc)
            LOG.exception("Clientfehler")
            if self.state != ClientState.SHUTDOWN:
                try:
                    self.transition(ClientState.ERROR)
                except RuntimeError:
                    pass
        finally:
            self.shutdown()

    def wait_for_server(self) -> bool:
        """Wartet beim Start, bis der Server antwortet. False nur, wenn das Beenden verlangt wurde.

        Früher beendete sich der Client, wenn der Server beim Start nicht erreichbar war
        (WLAN noch nicht da, Router startet noch). Jetzt zeigt die LED den Fehler, und der
        Client versucht es alle ``connect_retry_seconds`` wieder, ohne Neustart des Dienstes.
        """
        if self.config.dry_run:
            return True
        while not self.stop_requested:
            try:
                if self.api.health():
                    return True
                reason = "Health-Endpunkt meldet nicht ok"
            except (ApiError, OSError) as exc:
                reason = str(exc)
            LOG.warning("Server nicht erreichbar (%s); neuer Versuch in %.0f s",
                        reason, self.config.connect_retry_seconds)
            if self.state != ClientState.ERROR:
                self.transition(ClientState.ERROR)
            # In kleinen Schritten warten, damit ein Beenden (SIGTERM) schnell greift.
            waited = 0.0
            while waited < self.config.connect_retry_seconds and not self.stop_requested:
                step = min(0.5, self.config.connect_retry_seconds - waited)
                self.sleep(step)
                waited += step
        return False

    def step(self) -> None:
        if self.buttons.mic_off:
            if self.state not in {ClientState.MIC_OFF, ClientState.SHUTDOWN}:
                self.transition(ClientState.MIC_OFF)
            return
        if self.state == ClientState.MIC_OFF:
            self.transition(ClientState.READY)
        if self.state != ClientState.READY:
            return
        if self.buttons.speech_pressed:
            self.handle_question()
        elif self.buttons.story_pressed:
            self.handle_story()

    def handle_question(self) -> None:
        self.transition(ClientState.RECORDING)
        try:
            wav_bytes = self.audio_in.record_while_pressed(
                lambda: self.buttons.speech_pressed and not self.buttons.mic_off and not self.stop_requested,
                self.config.max_record_seconds,
            )
            recording_ended = self.clock()
        except HardwareError as exc:
            if self.stop_requested:
                LOG.info("Shutdown während der Aufnahme; Audiopuffer verworfen")
                self.transition(ClientState.SHUTDOWN)
                return
            if self.buttons.mic_off:
                LOG.info("Mikrofon-Aus während der Aufnahme; Audiogerät getrennt, Anfrage verworfen")
                self.transition(ClientState.MIC_OFF)
                return
            self.handle_error(exc)
            return
        if self.stop_requested:
            wav_bytes = b""
            LOG.info("Shutdown während der Aufnahme; Audiopuffer verworfen")
            self.transition(ClientState.SHUTDOWN)
            return
        if self.buttons.mic_off:
            # Der Adapter kann nach dem Schalterwechsel noch einen bereits
            # gepufferten Block zurückgeben. Die gesamte Aufnahme verwerfen.
            wav_bytes = b""
            LOG.info("Mikrofon während der Aufnahme ausgeschaltet; Audio verworfen")
            self.transition(ClientState.MIC_OFF)
            return
        if not self._has_audio(wav_bytes):
            LOG.info("Aufnahme zu kurz; keine Anfrage gesendet")
            self.transition(ClientState.READY)
            return
        self._warn_if_silent(wav_bytes)
        self.transition(ClientState.UPLOADING)
        try:
            response_wav = self.api.ask_question(wav_bytes)
            self.transition(ClientState.PLAYING)
            self._log_wait("frage", recording_ended)
            self._play(response_wav)
        except Exception as exc:
            self.handle_error(exc)

    def handle_story(self) -> None:
        button_pressed = self.clock()
        self.transition(ClientState.REQUESTING_STORY)
        try:
            response_wav = self.api.request_story()
            self.transition(ClientState.PLAYING)
            self._log_wait("erzaehltaste", button_pressed)
            self._play(response_wav)
        except Exception as exc:
            self.handle_error(exc)

    def _play(self, response_wav: bytes) -> None:
        """Spielt die Antwort; ein Beenden des Dienstes bricht die Wiedergabe ab."""
        self.audio_out.play_wav(response_wav, should_stop=lambda: self.stop_requested)
        if self.stop_requested:
            self.transition(ClientState.SHUTDOWN)
            return
        self._discard_pending_presses()
        self.transition(ClientState.MIC_OFF if self.buttons.mic_off else ClientState.READY)

    def _discard_pending_presses(self) -> None:
        # Nur die Tastatur im Probelauf merkt sich Drücke; echte Taster melden ihren Zustand.
        discard = getattr(self.buttons, "discard_pending", None)
        if callable(discard):
            discard()

    @staticmethod
    def _warn_if_silent(wav_bytes: bytes) -> None:
        """Hinweis im Protokoll, wenn die Aufnahme praktisch stumm ist. Gesendet wird trotzdem:
        Der Server antwortet dann mit „nicht verstanden“. Die Zeile enthält nur eine Zahl."""
        peak = pcm16_peak(wav_bytes)
        if peak is not None and peak < SILENT_PEAK:
            LOG.warning(
                "Die Aufnahme ist praktisch stumm (Spitzenwert %d von 32767). Mikrofon prüfen: "
                "richtiges Gerät (KUNIBERT_INPUT_DEVICE), Pegel, unter Windows auch "
                "Einstellungen > Datenschutz > Mikrofon.", peak)

    def _log_wait(self, mode: str, since: float) -> None:
        """Loggt, wie lange das Kind gewartet hat: bei einer Frage vom Ende der Aufnahme, bei der
        Erzähltaste vom Tastendruck, jeweils bis unmittelbar vor dem Abspielen. Die Zeile enthält
        nur ein Schlüsselwort und eine Zahl, nie Text, Adresse oder Token (siehe docs/Zeitmessung.md)."""
        LOG.info("Zeitmessung modus=%s wartezeit_s=%.1f", mode, max(0.0, self.clock() - since))

    def handle_error(self, exc: Exception) -> None:
        self.last_error = str(exc)
        LOG.error("Aktion fehlgeschlagen: %s", exc)
        if self.state != ClientState.ERROR:
            self.transition(ClientState.ERROR)
        # Kein automatischer Dauer-Retry: bei der nächsten Schleife zurück auf READY.
        time.sleep(1.0)
        if not self.stop_requested:
            self._discard_pending_presses()
            self.transition(ClientState.MIC_OFF if self.buttons.mic_off else ClientState.READY)

    def _has_audio(self, wav_bytes: bytes) -> bool:
        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
                return wav.getnframes() / max(1, wav.getframerate()) >= self.config.min_record_seconds
        except wave.Error:
            return False

    def shutdown(self) -> None:
        if self.state != ClientState.SHUTDOWN:
            try:
                self.transition(ClientState.SHUTDOWN)
            except RuntimeError:
                self.state = ClientState.SHUTDOWN
                self.led.set("off")
        for component in (self.buttons, self.led):
            close = getattr(component, "close", None)
            if callable(close):
                close()


def build_client(config: ClientConfig, keyboard: bool = False) -> KunibertClient:
    if keyboard:
        # Probelauf am Rechner: echtes Mikrofon und echter Lautsprecher, Tastatur statt GPIO.
        keys = KeyboardButtons()
        sound = SoundDeviceAudio(config)
        client = KunibertClient(config, PicastApi(config), sound, sound, keys, ConsoleLed())
        keys.on_quit = lambda: setattr(client, "stop_requested", True)
        return client
    if config.dry_run:
        buttons: Buttons = DryRunButtons()
        audio_in: AudioInput = DryRunAudio(config)
        audio_out: AudioOutput = audio_in  # type: ignore[assignment]
        led: StatusLed = DryRunLed()
    else:
        buttons = GpioButtons(config)
        audio = SoundDeviceAudio(config)
        audio_in = audio
        audio_out = audio
        led = GpioStatusLed(config)
    return KunibertClient(config, PicastApi(config), audio_in, audio_out, buttons, led)


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ritter Kunibert Raspberry-Pi-Client")
    parser.add_argument("--dry-run", action="store_true", help="ohne GPIO/Audio-Hardware starten")
    parser.add_argument("--keyboard", action="store_true",
                        help="Probelauf am Rechner: Tastatur statt Taster, Mikrofon und Lautsprecher des Rechners")
    parser.add_argument("--debug", action="store_true", help="Debug-Logging aktivieren")
    parser.add_argument("--once", choices=["health", "story"], help="einmaliger Diagnose-/Story-Test")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = ClientConfig.from_env(dry_run=args.dry_run)
    if args.once:
        api = PicastApi(config)
        if args.once == "health":
            print("OK" if api.health() else "FEHLER")
            return 0
        if args.once == "story":
            wav = api.request_story()
            print(f"Story-Audio empfangen: {len(wav)} Bytes")
            return 0
    client = build_client(config, keyboard=args.keyboard)
    signal.signal(signal.SIGTERM, lambda _signum, _frame: setattr(client, "stop_requested", True))
    client.run()
    return 0 if client.last_error is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
