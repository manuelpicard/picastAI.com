"""Application orchestration for the physical prototype."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from .api import ApiError, KunibertAPI
from .audio import PlaybackError, play_wav
from .gpio import DeviceState, KunibertGPIO
from .recorder import Recorder, RecordingError
from .__main__ import load_state, save_state

log = logging.getLogger("kunibert.device")


class DeviceApp:
    def __init__(self, api: KunibertAPI, recorder: Recorder, controls: KunibertGPIO,
                 *, state_file: Path | None = Path("/dev/shm/kunibert.json"),
                 play: Callable[[bytes], None] = play_wav,
                 offline_audio: bytes | None = None):
        self.api = api
        self.recorder = recorder
        self.controls = controls
        self.state_file = state_file
        self.play = play
        self.offline_audio = offline_audio
        self.controls.on_speak = self.handle_question
        self.controls.on_story = self.handle_story

    def handle_question(self) -> None:
        self._run(mode="frage", record=True)

    def handle_story(self) -> None:
        self._run(mode="geschichte", record=False)

    def _run(self, *, mode: str, record: bool) -> None:
        if self.controls.mute_input.is_active:
            self.controls.set_state(DeviceState.MUTED)
            return
        try:
            audio_path = None
            if record:
                self.controls.set_state(DeviceState.RECORDING)
                # Keep the recording transient and let the API read it once.
                import tempfile
                with tempfile.NamedTemporaryFile(prefix="kunibert-question-", suffix=".wav", dir="/dev/shm", delete=True) as handle:
                    handle.write(self.recorder.record())
                    handle.flush()
                    audio_path = Path(handle.name)
                    self.controls.set_state(DeviceState.PROCESSING)
                    turn = self.api.send_turn(audio_path, mode, load_state(self.state_file))
            else:
                self.controls.set_state(DeviceState.PROCESSING)
                turn = self.api.send_turn(None, mode, load_state(self.state_file))
            audio = self.api.fetch_audio(turn)
            save_state(self.state_file, turn.story_state)
            self.controls.set_state(DeviceState.PLAYING)
            self.play(audio)
        except (ApiError, PlaybackError, RecordingError, ValueError, OSError) as exc:
            log.warning("turn failed: %s", type(exc).__name__)
            self.controls.set_state(DeviceState.ERROR)
            if self.offline_audio:
                try:
                    self.play(self.offline_audio)
                except Exception:
                    log.warning("offline playback failed")
        except Exception as exc:
            # Keep the physical device recoverable even if a provider adapter fails unexpectedly.
            log.warning("unexpected turn failure: %s", type(exc).__name__)
            self.controls.set_state(DeviceState.ERROR)
            if self.offline_audio:
                try:
                    self.play(self.offline_audio)
                except Exception:
                    log.warning("offline playback failed")
        finally:
            if self.controls.mute_input.is_active:
                self.controls.set_state(DeviceState.MUTED)
            else:
                self.controls.set_state(DeviceState.READY)
