"""Rückmeldung beim Warten und Vorstellung für den Ritter-Kunibert-Pi-Client.

Das Modul braucht keine Hardware und importiert nichts aus kunibert_client.py. Alles, was Zeit
braucht, läuft über eine austauschbare Uhr. So lassen sich die Abläufe in Tests ohne echtes
Warten prüfen.

Es enthält:
- einen kurzen Ton, der im Code erzeugt wird (Quittung beim Loslassen der Sprechtaste),
- die Wiedergabe-Reihenfolge beim Warten: Zwischensätze, dann die Antwort. Es spielt immer nur
  eines nach dem anderen, nichts überlappt und nichts wird abgeschnitten,
- das Laden der festen Ansagen aus einem Ordner (fehlende Dateien sind kein Fehler),
- die Statusdatei für die Vorstellung beim ersten Einschalten (ohne persönliche Daten).

Gesprochene Texte, Antworten und Aufnahmen werden hier nie geloggt.
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import random
import struct
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional, Protocol

LOG = logging.getLogger("kunibert.rueckmeldung")

# Feste Dateinamen. Der Server erzeugt genau diese Dateien mit "npm run ansagen -- <Ordner>"
# (siehe docs/Ansagen.md), der Pi erwartet sie in KUNIBERT_ANNOUNCEMENTS_DIR.
INTRO_FILE = "willkommen.wav"
FILLER_FILES = tuple(f"zwischen-{number}.wav" for number in range(1, 7))
LONG_WAIT_FILE = "zwischen-lang.wav"
ALL_ANNOUNCEMENT_FILES = (INTRO_FILE, *FILLER_FILES, LONG_WAIT_FILE)

STATUS_FILE = "status.json"
STATUS_VERSION = 1


class Clock(Protocol):
    def monotonic(self) -> float: ...

    def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


def _wav_bytes(pcm: bytes, sample_rate: int, channels: int, sample_width: int) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sample_width)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return out.getvalue()


def make_tone_wav(sample_rate: int = 16_000, channels: int = 1) -> bytes:
    """Zwei kurze, helle Töne hintereinander (zusammen 0,2 s), im Code erzeugt.

    Der Ton ist selbst gebaut: keine fremde Aufnahme, keine Datei im Repo. Er ist 16 Bit und
    wird leise und mit weichem An- und Ausklang erzeugt, damit er nicht erschreckt.
    """
    notes = ((880.0, 0.08), (1318.5, 0.12))  # Hz, Sekunden
    amplitude = 0.35 * 32767
    fade = max(1, int(sample_rate * 0.012))
    pcm = bytearray()
    for frequency, duration in notes:
        count = int(sample_rate * duration)
        for index in range(count):
            envelope = min(1.0, index / fade, (count - 1 - index) / fade)
            sample = int(amplitude * envelope * math.sin(2 * math.pi * frequency * index / sample_rate))
            pcm += struct.pack("<h", sample) * channels
    return _wav_bytes(bytes(pcm), sample_rate, channels, 2)


def wav_seconds(wav_bytes: bytes) -> float:
    """Länge einer WAV-Datei in Sekunden (0.0, wenn sie nicht lesbar ist)."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            return wav.getnframes() / max(1, wav.getframerate())
    except (wave.Error, EOFError):
        return 0.0


class Ansagen:
    """Die festen Sprachdateien: Vorstellung, sechs Zwischensätze und ein zweiter Satz für lange Wartezeiten.

    Fehlende oder unbrauchbare Dateien sind kein Fehler. Der Client läuft dann ohne diese Sätze
    weiter (mit Ton und LED), und ``load`` schreibt eine Warnung ins Log.
    """

    def __init__(self, folder: Optional[Path], sample_rate: int = 16_000, channels: int = 1, sample_width: int = 2):
        self.folder = Path(folder) if folder is not None else None
        self.sample_rate = sample_rate
        self.channels = channels
        self.sample_width = sample_width
        self.intro: Optional[bytes] = None
        self.fillers: list[bytes] = []
        self.long_wait: Optional[bytes] = None

    def load(self) -> None:
        self.intro, self.fillers, self.long_wait = None, [], None
        if self.folder is None or not self.folder.is_dir():
            LOG.warning("Ansagen-Ordner %s fehlt; der Client läuft ohne gesprochene Ansagen und Zwischensätze", self.folder)
            return
        missing: list[str] = []
        loaded: dict[str, bytes] = {}
        for name in ALL_ANNOUNCEMENT_FILES:
            path = self.folder / name
            try:
                data = path.read_bytes()
            except FileNotFoundError:
                missing.append(name)
                continue
            except OSError as exc:
                LOG.warning("Ansage %s nicht lesbar (%s); sie wird übersprungen", name, exc.strerror or type(exc).__name__)
                continue
            problem = self._problem(data)
            if problem:
                LOG.warning("Ansage %s unbrauchbar (%s); sie wird übersprungen", name, problem)
                continue
            loaded[name] = data
        if missing:
            LOG.warning("Ansagen fehlen (%d von %d): %s. Der Client läuft ohne diese Sätze weiter",
                        len(missing), len(ALL_ANNOUNCEMENT_FILES), ", ".join(missing))
        self.intro = loaded.get(INTRO_FILE)
        self.fillers = [loaded[name] for name in FILLER_FILES if name in loaded]
        self.long_wait = loaded.get(LONG_WAIT_FILE)

    def _problem(self, data: bytes) -> Optional[str]:
        try:
            with wave.open(io.BytesIO(data), "rb") as wav:
                if wav.getnchannels() != self.channels:
                    return "falsche Kanalzahl"
                if wav.getsampwidth() != self.sample_width:
                    return "falsche Bittiefe"
                if wav.getframerate() != self.sample_rate:
                    return "falsche Abtastrate"
                if wav.getnframes() <= 0:
                    return "leer"
        except (wave.Error, EOFError):
            return "keine gültige WAV-Datei"
        return None


class StatusStore:
    """Merkt sich in einer kleinen Datei, ob die Vorstellung schon gespielt wurde.

    Die Datei enthält nur zwei Werte (Version und ja/nein), keine Namen, Geräte-IDs oder Zeiten.
    Ohne Ordner (Dry-Run) bleibt der Stand nur im Speicher.
    """

    def __init__(self, folder: Optional[Path]):
        self._path = Path(folder) / STATUS_FILE if folder is not None else None
        self._played_in_memory = False

    def intro_played(self) -> bool:
        if self._played_in_memory:
            return True
        if self._path is None:
            return False
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        return isinstance(data, dict) and data.get("vorstellung_gespielt") is True

    def mark_intro_played(self) -> None:
        self._played_in_memory = True
        if self._path is None:
            return
        temp = self._path.with_name(self._path.name + ".tmp")
        try:
            temp.write_text(json.dumps({"version": STATUS_VERSION, "vorstellung_gespielt": True}), encoding="utf-8")
            os.replace(temp, self._path)
        except OSError as exc:
            LOG.warning("Statusdatei %s nicht schreibbar (%s); die Vorstellung läuft beim nächsten Start erneut",
                        self._path, exc.strerror or type(exc).__name__)


class ThreadCall:
    """Führt eine Funktion im Hintergrund aus. Der Aufrufer fragt nur den Fortschritt ab.

    So beginnt der Upload sofort, während der Hauptfaden den Ton und die Zwischensätze abspielt.
    """

    def __init__(self, function: Callable[[], Any]):
        self._finished = threading.Event()
        self._result: Any = None
        self._error: Optional[BaseException] = None
        self._thread = threading.Thread(target=self._run, args=(function,), name="kunibert-request", daemon=True)
        self._thread.start()

    def _run(self, function: Callable[[], Any]) -> None:
        try:
            self._result = function()
        except Exception as exc:  # wird in result() an den Aufrufer weitergegeben
            self._error = exc
        finally:
            self._finished.set()

    def done(self) -> bool:
        return self._finished.is_set()

    def result(self) -> Any:
        self._finished.wait()
        if self._error is not None:
            raise self._error
        return self._result


class Playback(Protocol):
    def play_wav(self, wav_bytes: bytes) -> None: ...


@dataclass(frozen=True)
class FeedbackSettings:
    """Zeiten in Sekunden. Alle sind über Umgebungsvariablen einstellbar (siehe README)."""

    first_filler_after: float = 2.5   # erster Zwischensatz, wenn bis dahin keine Antwort da ist
    long_wait_after: float = 15.0     # zweiter Satz, wenn es immer noch nicht weitergeht
    answer_pause: float = 0.3         # Pause zwischen einem Zwischensatz und der Antwort
    poll_interval: float = 0.05       # wie oft nachgesehen wird, ob die Antwort da ist
    intro_hold: float = 5.0           # so lange beide Tasten halten, um die Vorstellung zu wiederholen


class Feedback:
    """Ton, Zwischensätze und Vorstellung. Wird dem Client übergeben; ohne Feedback verhält er sich wie bisher."""

    def __init__(
        self,
        ansagen: Ansagen,
        status: StatusStore,
        settings: FeedbackSettings = FeedbackSettings(),
        *,
        clock: Optional[Clock] = None,
        rng: Optional[random.Random] = None,
        call_factory: Callable[[Callable[[], Any]], Any] = ThreadCall,
        tone: Optional[bytes] = None,
    ):
        self.ansagen = ansagen
        self.status = status
        self.settings = settings
        self.clock: Clock = clock or SystemClock()
        self._rng = rng or random.Random()
        self._call_factory = call_factory
        self.tone = tone if tone is not None else make_tone_wav(ansagen.sample_rate, ansagen.channels)
        self._last_filler: Optional[int] = None

    # -- Anfrage im Hintergrund -------------------------------------------------------------

    def start(self, function: Callable[[], Any]) -> Any:
        """Startet die Anfrage sofort im Hintergrund."""
        return self._call_factory(function)

    # -- Quittung ---------------------------------------------------------------------------

    def acknowledge(self, audio_out: Playback) -> None:
        """Spielt den kurzen Ton. Ein Fehler dabei darf die Anfrage nie aufhalten."""
        self._play(audio_out, self.tone, "Quittungston")

    # -- Warten -----------------------------------------------------------------------------

    def wait_for_answer(
        self,
        call: Any,
        audio_out: Playback,
        started: Optional[float] = None,
        should_stop: Optional[Callable[[], bool]] = None,
    ) -> None:
        """Wartet, bis ``call`` fertig ist, und spielt dabei höchstens zwei Zwischensätze.

        Es wird immer nur eines nach dem anderen abgespielt. Kommt die Antwort während eines
        Zwischensatzes, spielt er zu Ende, danach folgt die Pause ``answer_pause``. Die Antwort
        selbst spielt der Aufrufer, sobald diese Methode zurückkehrt.
        """
        s = self.settings
        begin = self.clock.monotonic() if started is None else started
        first_pending = True
        long_pending = True
        while not call.done():
            if should_stop is not None and should_stop():
                return
            waited = self.clock.monotonic() - begin
            if first_pending and waited >= s.first_filler_after:
                first_pending = False
                sentence = self._next_filler()
            elif long_pending and waited >= s.long_wait_after:
                long_pending = False
                sentence = self.ansagen.long_wait
            else:
                self.clock.sleep(s.poll_interval)
                continue
            if sentence is None:
                continue  # Datei fehlt (Warnung kam beim Laden): einfach weiter warten
            self._play(audio_out, sentence, "Zwischensatz")
            if call.done():
                self.clock.sleep(s.answer_pause)
                return

    def _next_filler(self) -> Optional[bytes]:
        count = len(self.ansagen.fillers)
        if count == 0:
            return None
        candidates = [index for index in range(count) if index != self._last_filler] or [0]
        choice = self._rng.choice(candidates)
        self._last_filler = choice
        return self.ansagen.fillers[choice]

    # -- Vorstellung ------------------------------------------------------------------------

    def needs_intro(self) -> bool:
        return not self.status.intro_played()

    def play_intro(self, audio_out: Playback) -> bool:
        """Spielt die Vorstellung. Nur wenn sie wirklich gespielt wurde, merkt sich der Pi das."""
        if self.ansagen.intro is None:
            LOG.warning("Die Vorstellung kann nicht gespielt werden (Datei %s fehlt oder ist unbrauchbar)", INTRO_FILE)
            return False
        if not self._play(audio_out, self.ansagen.intro, "Vorstellung"):
            return False
        self.status.mark_intro_played()
        return True

    # -- gemeinsam --------------------------------------------------------------------------

    @staticmethod
    def _play(audio_out: Playback, wav_bytes: bytes, what: str) -> bool:
        try:
            audio_out.play_wav(wav_bytes)
        except Exception as exc:
            LOG.warning("%s konnte nicht abgespielt werden: %s", what, exc)
            return False
        return True


def build_feedback(config: Any) -> Feedback:
    """Baut Feedback aus der Client-Konfiguration (ClientConfig, nur über Attribute gelesen)."""
    ansagen = Ansagen(config.announcements_dir, config.sample_rate, config.channels, config.sample_width)
    ansagen.load()
    status = StatusStore(None if config.dry_run else config.state_dir)
    settings = FeedbackSettings(
        first_filler_after=config.filler_after_seconds,
        long_wait_after=config.long_wait_seconds,
        answer_pause=config.answer_pause_seconds,
        intro_hold=config.intro_hold_seconds,
    )
    return Feedback(ansagen, status, settings)
