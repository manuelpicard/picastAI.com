"""Tests für Quittung, Zwischensätze und Vorstellung (rueckmeldung.py und die Haken im Client).

Alles läuft ohne Hardware, ohne echtes Warten und ohne Netzwerk:
- eine Fake-Uhr, die nur vorrückt, wenn gewartet oder abgespielt wird,
- ein Fake-Lautsprecher, der jede Wiedergabe mit Anfang und Ende auf dieser Uhr festhält,
- eine Fake-Anfrage, deren Antwort zu einer bestimmten Zeit "fertig" ist.
"""

import io
import json
import logging
import random
import tempfile
import threading
import unittest
import wave
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

from kunibert_client import (
    ApiError,
    ClientConfig,
    ClientState,
    GpioStatusLed,
    KunibertClient,
    encode_wav,
)
from rueckmeldung import (
    ALL_ANNOUNCEMENT_FILES,
    FILLER_FILES,
    INTRO_FILE,
    LONG_WAIT_FILE,
    STATUS_FILE,
    Ansagen,
    Feedback,
    FeedbackSettings,
    StatusStore,
    ThreadCall,
    build_feedback,
    make_tone_wav,
    wav_seconds,
)

RATE = 16_000
LOGGER = "kunibert.rueckmeldung"


def silence(seconds):
    return encode_wav(b"\x00\x00" * int(RATE * seconds), RATE, 1, 2)


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class FakeSpeaker:
    """Spielt nichts ab, hält aber Anfang und Ende jeder Wiedergabe auf der Fake-Uhr fest."""

    def __init__(self, clock):
        self.clock = clock
        self.plays = []  # (Anfang, Ende, WAV)
        self.observer = None

    def play_wav(self, wav_bytes):
        start = self.clock.now
        if self.observer:
            self.observer()
        self.clock.now += wav_seconds(wav_bytes)
        self.plays.append((start, self.clock.now, wav_bytes))


class FakeRecorder:
    def __init__(self, clock):
        self.clock = clock
        self.released_at = None

    def record_while_pressed(self, should_continue, max_seconds):
        self.released_at = self.clock.now  # in diesem Augenblick wird die Taste losgelassen
        return silence(0.5)


class PressedButtons:
    def __init__(self, speech=False, story=False, mic_off=False):
        self.speech_pressed = speech
        self.story_pressed = story
        self.mic_off = mic_off
        self.closed = False

    def close(self):
        self.closed = True


class CaptureLed:
    def __init__(self):
        self.modes = []
        self.closed = False

    def set(self, mode):
        self.modes.append(mode)

    def close(self):
        self.closed = True


class Latency:
    def __init__(self, seconds):
        self.seconds = seconds


class FakeApi:
    """Antwortet sofort mit dem Ergebnis; ob die Antwort "da" ist, entscheidet FakeCall über die Uhr."""

    def __init__(self, clock, answer):
        self.clock = clock
        self.answer = answer
        self.calls = []  # (Art, Zeit)
        self.error = None

    def health(self):
        return True

    def ask_question(self, wav):
        self.calls.append(("frage", self.clock.now))
        if self.error:
            raise self.error
        return self.answer

    def request_story(self):
        self.calls.append(("geschichte", self.clock.now))
        if self.error:
            raise self.error
        return self.answer


class FakeCall:
    def __init__(self, clock, ready_at, result, error):
        self.clock = clock
        self.ready_at = ready_at
        self._result = result
        self._error = error

    def done(self):
        return self.clock.now >= self.ready_at

    def result(self):
        if self._error:
            raise self._error
        return self._result


def fake_call_factory(clock, latency):
    def factory(function):
        started = clock.now
        try:
            result, error = function(), None
        except Exception as exc:  # genau wie ThreadCall: der Fehler kommt erst bei result()
            result, error = None, exc
        return FakeCall(clock, started + latency.seconds, result, error)

    return factory


class FirstChoice:
    """Statt Zufall immer der erste Kandidat, damit die Tests eindeutig sind."""

    def choice(self, items):
        return items[0]


class Setup:
    """Ein Client mit Fake-Uhr, Fake-Lautsprecher und Zwischensätzen aus einem Ordner."""

    def __init__(self, test, latency=1.0, files=True, settings=None, rng=None, buttons=None, state_dir=None):
        self.clock = FakeClock()
        self.latency = Latency(latency)
        self.speaker = FakeSpeaker(self.clock)
        self.recorder = FakeRecorder(self.clock)
        self.led = CaptureLed()
        self.buttons = buttons or PressedButtons(speech=True)
        self.answer = silence(1.7)
        self.api = FakeApi(self.clock, self.answer)
        self.folder = Path(test.tmp.name) / "ansagen"
        self.folder.mkdir(exist_ok=True)
        self.labels = {self.answer: "antwort"}
        if files:
            self.labels.update(write_announcements(self.folder))
        config = ClientConfig(dry_run=True, min_record_seconds=0.1, announcements_dir=self.folder,
                              state_dir=Path(state_dir) if state_dir else Path(test.tmp.name))
        ansagen = Ansagen(self.folder, RATE, 1, 2)
        ansagen.load()
        self.status = StatusStore(Path(state_dir) if state_dir else Path(test.tmp.name))
        self.feedback = Feedback(
            ansagen,
            self.status,
            settings or FeedbackSettings(),
            clock=self.clock,
            rng=rng or FirstChoice(),
            call_factory=fake_call_factory(self.clock, self.latency),
        )
        self.labels[self.feedback.tone] = "ton"
        self.client = KunibertClient(config, self.api, self.recorder, self.speaker, self.buttons, self.led,
                                     feedback=self.feedback)
        self.client.transition(ClientState.WIFI_CONNECTING)
        self.client.transition(ClientState.READY)

    def played(self):
        return [self.labels[wav] for _, _, wav in self.speaker.plays]

    def start_of(self, label):
        return next(start for start, _, wav in self.speaker.plays if self.labels[wav] == label)

    def end_of(self, label):
        return next(end for _, end, wav in self.speaker.plays if self.labels[wav] == label)


def write_announcements(folder):
    """Schreibt Testdateien mit unterschiedlichen Längen, damit jede Datei eindeutig erkennbar ist."""
    labels = {}
    files = {INTRO_FILE: ("vorstellung", 3.0), LONG_WAIT_FILE: ("lang", 2.0)}
    for number, name in enumerate(FILLER_FILES, start=1):
        files[name] = (f"satz{number}", 1.0 + 0.1 * (number - 1))
    for name, (label, seconds) in files.items():
        data = silence(seconds)
        (Path(folder) / name).write_bytes(data)
        labels[data] = label
    return labels


class TempDirCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def assertNoOverlap(self, speaker):
        previous_end = 0.0
        for start, end, _ in speaker.plays:
            self.assertGreaterEqual(start, previous_end - 1e-9, "zwei Wiedergaben überlappen sich")
            previous_end = end


class AcknowledgementTests(TempDirCase):
    def test_tone_is_short_valid_and_not_silent(self):
        tone = make_tone_wav(RATE)
        with wave.open(io.BytesIO(tone), "rb") as wav:
            self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate()), (1, 2, RATE))
            frames = wav.readframes(wav.getnframes())
        seconds = wav_seconds(tone)
        self.assertGreater(seconds, 0.05)
        self.assertLess(seconds, 0.5)
        samples = [int.from_bytes(frames[i:i + 2], "little", signed=True) for i in range(0, len(frames), 2)]
        self.assertGreater(max(abs(sample) for sample in samples), 3000, "der Ton darf nicht stumm sein")
        self.assertLess(max(abs(sample) for sample in samples), 20000, "der Ton darf nicht übersteuern")
        self.assertLess(abs(samples[0]), 200, "weicher Anfang, kein Knacken")
        self.assertLess(abs(samples[-1]), 200, "weiches Ende, kein Knacken")

    def test_tone_plays_within_half_a_second_after_release_and_led_thinks(self):
        s = Setup(self, latency=1.0)
        s.client.handle_question()
        released = s.recorder.released_at
        self.assertLessEqual(s.start_of("ton") - released, 0.5)
        self.assertIn("thinking", s.led.modes)
        self.assertEqual(s.played()[0], "ton")
        self.assertLess(s.end_of("ton") - s.start_of("ton"), 0.5)

    def test_upload_starts_before_the_tone_not_after(self):
        s = Setup(self, latency=1.0)
        s.client.handle_question()
        upload_started = s.api.calls[0][1]
        self.assertLessEqual(upload_started, s.start_of("ton"))
        self.assertEqual(upload_started, s.recorder.released_at, "der Upload beginnt sofort beim Loslassen")

    def test_quick_answer_has_no_filler_and_no_extra_pause(self):
        s = Setup(self, latency=1.0)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "antwort"])
        self.assertEqual(s.client.state, ClientState.READY)
        self.assertNoOverlap(s.speaker)

    def test_too_short_recording_gives_no_tone_and_no_request(self):
        s = Setup(self, latency=1.0)
        s.recorder.record_while_pressed = lambda should_continue, max_seconds: silence(0.01)
        s.client.handle_question()
        self.assertEqual(s.played(), [])
        self.assertEqual(s.api.calls, [])
        self.assertEqual(s.client.state, ClientState.READY)

    def test_a_failing_speaker_never_blocks_the_request(self):
        s = Setup(self, latency=1.0)
        original = s.speaker.play_wav

        def failing_first(wav):
            if wav == s.feedback.tone:
                raise RuntimeError("Lautsprecher kaputt")
            return original(wav)

        s.speaker.play_wav = failing_first
        with self.assertLogs(LOGGER, level="WARNING"):
            s.client.handle_question()
        self.assertEqual(s.played(), ["antwort"])
        self.assertEqual(s.client.state, ClientState.READY)

    def test_upload_runs_while_the_tone_plays_with_a_real_thread(self):
        """Mit echtem Hintergrund-Thread: Der Ton darf den Upload nicht aufhalten."""
        api_started = threading.Event()
        release_api = threading.Event()
        tone_saw_upload = []

        class BlockingApi:
            def health(self):
                return True

            def ask_question(self, wav):
                api_started.set()
                release_api.wait(5)
                return silence(0.2)

        class Speaker:
            def __init__(self):
                self.played = []

            def play_wav(self, wav):
                if not self.played:  # der erste Ton ist die Quittung
                    tone_saw_upload.append(api_started.wait(2))  # schlägt fehl, wenn der Upload erst danach beginnt
                    release_api.set()
                self.played.append(wav)

        speaker = Speaker()
        ansagen = Ansagen(Path(self.tmp.name) / "leer", RATE, 1, 2)
        feedback = Feedback(ansagen, StatusStore(None), FeedbackSettings(first_filler_after=30, poll_interval=0.01))
        config = ClientConfig(dry_run=True, min_record_seconds=0.1)
        client = KunibertClient(config, BlockingApi(), FakeRecorder(FakeClock()), speaker, PressedButtons(speech=True),
                                CaptureLed(), feedback=feedback)
        client.transition(ClientState.WIFI_CONNECTING)
        client.transition(ClientState.READY)
        client.handle_question()
        self.assertEqual(tone_saw_upload, [True], "der Upload muss schon laufen, während der Ton spielt")
        self.assertEqual(len(speaker.played), 2)
        self.assertEqual(client.state, ClientState.READY)


class WaitingTests(TempDirCase):
    def test_first_filler_comes_after_2_5_seconds(self):
        s = Setup(self, latency=6.0)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "antwort"])
        self.assertGreaterEqual(s.start_of("satz1"), 2.5)
        self.assertLess(s.start_of("satz1"), 2.6)
        self.assertGreaterEqual(s.start_of("antwort"), 6.0)
        self.assertNoOverlap(s.speaker)

    def test_no_filler_before_2_5_seconds(self):
        s = Setup(self, latency=2.4)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "antwort"])

    def test_answer_during_a_filler_waits_for_it_to_finish_then_300_ms(self):
        s = Setup(self, latency=3.0)  # Antwort kommt mitten im Zwischensatz (2,5 s bis 3,5 s)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "antwort"])
        filler_end = s.end_of("satz1")
        self.assertAlmostEqual(s.start_of("antwort") - filler_end, 0.3, places=6)
        self.assertEqual(s.speaker.plays[1][2], silence(1.0), "der Zwischensatz wurde nicht abgeschnitten")
        self.assertNoOverlap(s.speaker)

    def test_answer_after_a_filler_needs_no_extra_pause(self):
        s = Setup(self, latency=5.0)  # Zwischensatz ist längst vorbei, wenn die Antwort kommt
        s.client.handle_question()
        self.assertLess(s.start_of("antwort") - 5.0, 0.1)

    def test_second_sentence_after_15_seconds(self):
        s = Setup(self, latency=20.0)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "lang", "antwort"])
        self.assertGreaterEqual(s.start_of("lang"), 15.0)
        self.assertLess(s.start_of("lang"), 15.1)
        self.assertGreaterEqual(s.start_of("antwort"), 20.0)
        self.assertNoOverlap(s.speaker)

    def test_answer_during_the_second_sentence_waits_then_300_ms(self):
        s = Setup(self, latency=16.0)  # zweiter Satz läuft von 15,0 s bis 17,0 s
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "lang", "antwort"])
        self.assertAlmostEqual(s.start_of("antwort") - s.end_of("lang"), 0.3, places=6)
        self.assertNoOverlap(s.speaker)

    def test_never_more_than_two_sentences(self):
        s = Setup(self, latency=120.0)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "lang", "antwort"])

    def test_filler_is_never_the_same_twice_in_a_row(self):
        s = Setup(self, latency=3.0, rng=random.Random(7))
        sequence = []
        for _ in range(60):
            s.speaker.plays.clear()
            s.client.state = ClientState.READY
            s.client.handle_question()
            sequence += [label for label in s.played() if label.startswith("satz")]
        self.assertEqual(len(sequence), 60)
        for first, second in zip(sequence, sequence[1:]):
            self.assertNotEqual(first, second)
        self.assertGreaterEqual(len(set(sequence)), 4, "der Zufall soll mehrere Sätze verwenden")

    def test_the_times_are_configurable(self):
        settings = FeedbackSettings(first_filler_after=1.0, long_wait_after=4.0, answer_pause=0.1)
        s = Setup(self, latency=9.0, settings=settings)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "satz1", "lang", "antwort"])
        self.assertGreaterEqual(s.start_of("satz1"), 1.0)
        self.assertLess(s.start_of("satz1"), 1.1)
        self.assertGreaterEqual(s.start_of("lang"), 4.0)
        self.assertLess(s.start_of("lang"), 4.1)

    def test_story_button_thinks_and_waits_like_a_question_but_has_no_release_tone(self):
        s = Setup(self, latency=4.0, buttons=PressedButtons(story=True))
        s.client.handle_story()
        self.assertEqual(s.played(), ["satz1", "antwort"])
        self.assertIn("thinking", s.led.modes)
        self.assertEqual(s.api.calls[0][0], "geschichte")
        self.assertNoOverlap(s.speaker)

    def test_led_goes_from_thinking_to_busy_while_playing_to_ready(self):
        s = Setup(self, latency=1.0)
        s.client.handle_question()
        self.assertEqual(s.led.modes[-3:], ["thinking", "busy", "ready"])

    def test_an_error_from_the_server_goes_to_error_state_without_playing_the_answer(self):
        s = Setup(self, latency=1.0)
        s.api.error = ApiError("API-Fehler (HTTP 502)", status=502)
        with patch("kunibert_client.time.sleep"):
            s.client.handle_question()
        self.assertEqual(s.played(), ["ton"])
        self.assertIn(ClientState.ERROR, s.client.state_history)
        self.assertEqual(s.client.state, ClientState.READY)
        self.assertIsNotNone(s.client.last_error)

    def test_shutdown_while_waiting_ends_the_wait(self):
        s = Setup(self, latency=500.0)
        s.speaker.observer = lambda: setattr(s.client, "stop_requested", True)
        with patch("kunibert_client.time.sleep"):
            s.client.handle_question()
        self.assertEqual(s.played(), ["ton"])
        self.assertLess(s.clock.now, 1.0, "es darf nicht bis zur Antwort gewartet werden")

    def test_without_feedback_the_client_behaves_as_before(self):
        s = Setup(self, latency=20.0)
        s.client.feedback = None
        s.client.handle_question()
        self.assertEqual(s.played(), ["antwort"])
        self.assertNotIn("thinking", s.led.modes)


class MissingFilesTests(TempDirCase):
    def test_missing_files_keep_the_tone_and_led_and_warn(self):
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            s = Setup(self, latency=20.0, files=False)
        self.assertTrue(any("Ansagen fehlen (8 von 8)" in line for line in logs.output), logs.output)
        s.client.handle_question()
        self.assertEqual(s.played(), ["ton", "antwort"])
        self.assertIn("thinking", s.led.modes)
        self.assertEqual(s.client.state, ClientState.READY)

    def test_missing_folder_warns_once_and_works(self):
        ansagen = Ansagen(Path(self.tmp.name) / "gibt-es-nicht", RATE, 1, 2)
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            ansagen.load()
        self.assertEqual(len(logs.output), 1)
        self.assertEqual((ansagen.intro, ansagen.fillers, ansagen.long_wait), (None, [], None))

    def test_only_some_files_missing_still_plays_the_rest(self):
        folder = Path(self.tmp.name) / "teil"
        folder.mkdir()
        for name in (FILLER_FILES[2], LONG_WAIT_FILE):
            (folder / name).write_bytes(silence(1.0))
        ansagen = Ansagen(folder, RATE, 1, 2)
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            ansagen.load()
        self.assertIn("6 von 8", logs.output[0])
        self.assertEqual(len(ansagen.fillers), 1)
        self.assertIsNotNone(ansagen.long_wait)
        self.assertIsNone(ansagen.intro)

    def test_unusable_file_is_skipped_with_a_warning(self):
        folder = Path(self.tmp.name) / "kaputt"
        folder.mkdir()
        write_announcements(folder)
        (folder / FILLER_FILES[0]).write_bytes(encode_wav(b"\x00\x00" * 800, 8_000, 1, 2))  # falsche Abtastrate
        (folder / FILLER_FILES[1]).write_bytes(b"keine WAV-Datei")
        ansagen = Ansagen(folder, RATE, 1, 2)
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            ansagen.load()
        joined = " ".join(logs.output)
        self.assertIn("falsche Abtastrate", joined)
        self.assertIn("keine gültige WAV-Datei", joined)
        self.assertEqual(len(ansagen.fillers), 4)

    def test_log_names_files_only_never_spoken_text(self):
        folder = Path(self.tmp.name) / "leer"
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            Ansagen(folder, RATE, 1, 2).load()
        for line in logs.output:
            self.assertNotIn("Kunibert", line)
            self.assertNotIn("Computer-Ritter", line)

    def test_the_file_names_are_the_contract_with_the_server_script(self):
        # Dieselbe Liste steht im Test des Server-Skripts (npm run ansagen). Ändert sich ein Name,
        # müssen beide Seiten gleichzeitig angepasst werden.
        self.assertEqual(
            ALL_ANNOUNCEMENT_FILES,
            ("willkommen.wav", "zwischen-1.wav", "zwischen-2.wav", "zwischen-3.wav", "zwischen-4.wav",
             "zwischen-5.wav", "zwischen-6.wav", "zwischen-lang.wav"),
        )


class IntroTests(TempDirCase):
    def run_client(self, s):
        s.client.stop_requested = True  # nur der Start, keine Schleife
        s.client.run()

    def test_first_start_plays_the_intro_before_the_child_can_ask(self):
        s = Setup(self)
        states = []
        s.speaker.observer = lambda: states.append(s.client.state)
        s.client.state = ClientState.BOOT
        s.client.state_history.clear()
        self.run_client(s)
        self.assertEqual(s.played(), ["vorstellung"])
        self.assertEqual(states, [ClientState.WIFI_CONNECTING], "die Vorstellung kommt vor dem Zustand READY")
        self.assertLess(s.client.state_history.index(ClientState.WIFI_CONNECTING),
                        s.client.state_history.index(ClientState.READY))

    def test_second_start_does_not_play_it_again(self):
        first = Setup(self)
        first.client.state = ClientState.BOOT
        self.run_client(first)
        self.assertEqual(first.played(), ["vorstellung"])
        second = Setup(self)
        second.client.state = ClientState.BOOT
        self.run_client(second)
        self.assertEqual(second.played(), [])

    def test_status_file_holds_no_personal_data(self):
        s = Setup(self)
        s.client.state = ClientState.BOOT
        self.run_client(s)
        raw = (Path(self.tmp.name) / STATUS_FILE).read_text(encoding="utf-8")
        self.assertEqual(json.loads(raw), {"version": 1, "vorstellung_gespielt": True})
        self.assertNotIn(s.client.config.device_id, raw)
        self.assertLess(len(raw), 100)

    def test_missing_intro_file_warns_continues_and_is_not_marked_as_played(self):
        with self.assertLogs(LOGGER, level="WARNING"):
            s = Setup(self, files=False)
        s.client.state = ClientState.BOOT
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            self.run_client(s)
        self.assertTrue(any("Vorstellung" in line for line in logs.output))
        self.assertEqual(s.client.state, ClientState.SHUTDOWN)
        self.assertIn(ClientState.READY, s.client.state_history, "der Client läuft normal weiter")
        self.assertFalse((Path(self.tmp.name) / STATUS_FILE).exists(), "ohne Ansage gilt das Kind nicht als vorgestellt")
        self.assertTrue(s.feedback.needs_intro())

    def test_unwritable_status_file_warns_and_still_plays_only_once_per_run(self):
        blocker = Path(self.tmp.name) / "datei"
        blocker.write_text("x")
        store = StatusStore(blocker)  # "datei/status.json" lässt sich nicht anlegen
        with self.assertLogs(LOGGER, level="WARNING") as logs:
            store.mark_intro_played()
        self.assertIn("nicht schreibbar", logs.output[0])
        self.assertTrue(store.intro_played(), "im selben Lauf wird nicht erneut vorgestellt")
        self.assertFalse(StatusStore(blocker).intro_played(), "beim nächsten Start dagegen schon")

    def test_corrupt_status_file_counts_as_not_introduced(self):
        (Path(self.tmp.name) / STATUS_FILE).write_text("{kaputt", encoding="utf-8")
        self.assertFalse(StatusStore(Path(self.tmp.name)).intro_played())

    def test_parent_combination_repeats_the_intro_only_with_mic_off_and_both_buttons_held(self):
        buttons = PressedButtons(speech=True, story=True, mic_off=True)
        s = Setup(self, buttons=buttons)
        s.client.transition(ClientState.MIC_OFF)

        def hold(seconds):
            for _ in range(int(seconds * 10)):
                s.client.step()
                s.clock.sleep(0.1)

        hold(4.5)
        self.assertEqual(s.played(), [], "nach 4,5 Sekunden noch nicht")
        hold(1.0)
        self.assertEqual(s.played(), ["vorstellung"])
        self.assertGreaterEqual(s.start_of("vorstellung"), 5.0)
        hold(8.0)
        self.assertEqual(s.played(), ["vorstellung"], "dauerhaftes Halten wiederholt sie nicht")
        self.assertEqual(s.led.modes[-1], "mic_off")
        self.assertEqual(s.client.state, ClientState.MIC_OFF)

        buttons.speech_pressed = buttons.story_pressed = False
        hold(0.3)
        buttons.speech_pressed = buttons.story_pressed = True
        hold(5.5)
        self.assertEqual(s.played(), ["vorstellung", "vorstellung"], "nach dem Loslassen geht es wieder")

    def test_one_button_alone_or_a_short_press_does_not_trigger_the_repeat(self):
        buttons = PressedButtons(speech=True, story=False, mic_off=True)
        s = Setup(self, buttons=buttons)
        s.client.transition(ClientState.MIC_OFF)
        for _ in range(100):
            s.client.step()
            s.clock.sleep(0.1)
        self.assertEqual(s.played(), [])
        buttons.story_pressed = True
        for _ in range(30):  # nur 3 Sekunden beide
            s.client.step()
            s.clock.sleep(0.1)
        buttons.speech_pressed = buttons.story_pressed = False
        for _ in range(5):
            s.client.step()
            s.clock.sleep(0.1)
        self.assertEqual(s.played(), [])

    def test_both_buttons_with_the_mic_on_never_play_the_intro(self):
        buttons = PressedButtons(speech=True, story=True, mic_off=False)
        s = Setup(self, latency=1.0, buttons=buttons)
        s.client.step()  # Sprechtaste hat Vorrang: Aufnahme und Frage, wie bisher
        self.assertEqual(s.played(), ["ton", "antwort"])
        self.assertNotIn("vorstellung", s.played())

    def test_the_repeat_is_off_without_feedback(self):
        buttons = PressedButtons(speech=True, story=True, mic_off=True)
        s = Setup(self, buttons=buttons)
        s.client.feedback = None
        s.client.transition(ClientState.MIC_OFF)
        for _ in range(80):
            s.client.step()
            s.clock.sleep(0.1)
        self.assertEqual(s.played(), [])

    def test_dry_run_keeps_the_status_only_in_memory(self):
        config = ClientConfig(dry_run=True, announcements_dir=Path(self.tmp.name) / "a", state_dir=Path(self.tmp.name) / "s")
        (Path(self.tmp.name) / "s").mkdir()
        (Path(self.tmp.name) / "a").mkdir()
        write_announcements(Path(self.tmp.name) / "a")
        feedback = build_feedback(config)
        speaker = FakeSpeaker(FakeClock())
        self.assertTrue(feedback.play_intro(speaker))
        self.assertFalse((Path(self.tmp.name) / "s" / STATUS_FILE).exists())
        self.assertFalse(feedback.needs_intro())


class LedAndConfigTests(unittest.TestCase):
    def test_thinking_pattern_is_a_slow_smooth_pulse_distinct_from_busy(self):
        thinking = GpioStatusLed.pattern_for_mode("thinking")
        busy = GpioStatusLed.pattern_for_mode("busy")
        self.assertTrue(thinking)
        self.assertNotEqual(thinking, busy)
        levels = [level for level, _ in thinking]
        self.assertTrue(all(0.0 <= level <= 1.0 for level in levels))
        self.assertEqual(max(levels), 1.0)
        self.assertEqual(min(levels), 0.0)
        self.assertGreaterEqual(sum(duration for _, duration in thinking), 2.0, "langsam: mindestens 2 Sekunden je Durchlauf")
        self.assertLessEqual(max(abs(b - a) for a, b in zip(levels, levels[1:])), 0.2, "sanfte Schritte")

    def test_dimmable_led_gets_the_level_and_a_plain_led_falls_back_to_on_off(self):
        led = MagicMock()
        for dimmable, level, expected in ((True, 0.5, ("value", 0.5)), (False, 0.7, ("on",)), (False, 0.2, ("off",))):
            led.reset_mock()
            instance = GpioStatusLed.__new__(GpioStatusLed)
            instance._led = led
            instance._dimmable = dimmable
            instance._apply(level)
            if expected[0] == "value":
                self.assertEqual(led.value, 0.5)
            else:
                getattr(led, expected[0]).assert_called_once_with()

    def test_the_led_uses_pwm_when_gpiozero_offers_it(self):
        created = []

        class FakeLed:
            def __init__(self, pin):
                created.append(("LED", pin))

        class FakePwmLed:
            def __init__(self, pin):
                created.append(("PWMLED", pin))

        stub = ModuleType("gpiozero")
        stub.LED = FakeLed
        stub.PWMLED = FakePwmLed
        with patch.dict("sys.modules", {"gpiozero": stub}):
            led = GpioStatusLed(ClientConfig(status_led_gpio=23))
        self.assertEqual(created, [("PWMLED", 23)])
        self.assertTrue(led._dimmable)

    def test_the_led_falls_back_to_a_plain_led_without_pwm(self):
        created = []

        class FakeLed:
            def __init__(self, pin):
                created.append(("LED", pin))

        stub = ModuleType("gpiozero")
        stub.LED = FakeLed
        with patch.dict("sys.modules", {"gpiozero": stub}):
            led = GpioStatusLed(ClientConfig(status_led_gpio=23))
        self.assertEqual(created, [("LED", 23)])
        self.assertFalse(led._dimmable)

    def test_new_settings_have_defaults_and_can_be_set_by_environment(self):
        config = ClientConfig.from_env()
        self.assertTrue(config.feedback_enabled)
        self.assertEqual(
            (config.filler_after_seconds, config.long_wait_seconds, config.answer_pause_seconds, config.intro_hold_seconds),
            (2.5, 15.0, 0.3, 5.0),
        )
        env = {
            "KUNIBERT_FEEDBACK": "0",
            "KUNIBERT_FILLER_AFTER_SECONDS": "1.5",
            "KUNIBERT_LONG_WAIT_SECONDS": "10",
            "KUNIBERT_ANSWER_PAUSE_SECONDS": "0.5",
            "KUNIBERT_INTRO_HOLD_SECONDS": "8",
            "KUNIBERT_ANNOUNCEMENTS_DIR": "/tmp/a",
            "KUNIBERT_STATE_DIR": "/tmp/s",
        }
        with patch.dict("os.environ", env):
            config = ClientConfig.from_env()
        self.assertFalse(config.feedback_enabled)
        self.assertEqual(
            (config.filler_after_seconds, config.long_wait_seconds, config.answer_pause_seconds, config.intro_hold_seconds),
            (1.5, 10.0, 0.5, 8.0),
        )
        self.assertEqual((config.announcements_dir, config.state_dir), (Path("/tmp/a"), Path("/tmp/s")))


class BuildClientTests(TempDirCase):
    def test_the_normal_start_path_has_feedback_unless_it_is_switched_off(self):
        from kunibert_client import build_client

        with self.assertLogs(LOGGER, level="WARNING"):  # Ordner ohne Dateien: Warnung, kein Fehler
            client = build_client(ClientConfig(dry_run=True, announcements_dir=Path(self.tmp.name) / "leer"))
        self.assertIsNotNone(client.feedback)
        client = build_client(ClientConfig(dry_run=True, feedback_enabled=False))
        self.assertIsNone(client.feedback)


class ThreadCallTests(unittest.TestCase):
    def test_result_is_returned_when_done(self):
        release = threading.Event()
        call = ThreadCall(lambda: (release.wait(2), "ergebnis")[1])
        self.assertFalse(call.done())
        release.set()
        self.assertEqual(call.result(), "ergebnis")
        self.assertTrue(call.done())

    def test_an_exception_is_raised_to_the_caller(self):
        def failing():
            raise ApiError("kaputt", status=503, retryable=True)

        call = ThreadCall(failing)
        with self.assertRaises(ApiError) as caught:
            call.result()
        self.assertEqual(caught.exception.status, 503)
        self.assertTrue(call.done())


if __name__ == "__main__":
    unittest.main()
