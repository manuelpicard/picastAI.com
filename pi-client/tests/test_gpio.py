import unittest
from unittest.mock import Mock, patch

from kunibert_pi.api import Turn
from kunibert_pi.device import DeviceApp
from kunibert_pi.gpio import DeviceState, KunibertGPIO, StateLights
from kunibert_pi.recorder import Recorder, RecordingError
from kunibert_pi import gpio_main


class FakeButton:
    def __init__(self): self.callback = None; self.closed = False
    def when_pressed(self, callback): self.callback = callback
    def press(self): self.callback()
    def close(self): self.closed = True


class FakeMute:
    def __init__(self, active=False): self.is_active = active; self.callback = None; self.closed = False
    def when_activated(self, callback): self.callback = callback
    def activate(self): self.is_active = True; self.callback()
    def close(self): self.closed = True


class FakeLED:
    def __init__(self): self.calls = []; self.closed = False
    def on(self): self.calls.append("on")
    def off(self): self.calls.append("off")
    def blink(self, on_time=.5, off_time=.5): self.calls.append(("blink", on_time, off_time))
    def close(self): self.closed = True


class GPIOTests(unittest.TestCase):
    def setUp(self):
        self.speak, self.story, self.mute, self.led = FakeButton(), FakeButton(), FakeMute(), FakeLED()
        self.controls = KunibertGPIO(self.speak, self.story, self.mute, StateLights(self.led), Mock(), Mock())

    def test_buttons_are_wired_and_initially_ready(self):
        self.assertEqual(self.controls.state, DeviceState.READY)
        self.speak.press(); self.story.press()
        self.assertEqual(self.controls.on_speak.call_count, 1)
        self.assertEqual(self.controls.on_story.call_count, 1)

    def test_busy_state_blocks_duplicate_press(self):
        self.controls.set_state(DeviceState.PROCESSING)
        self.speak.press(); self.story.press()
        self.assertFalse(self.controls.on_speak.called)
        self.assertFalse(self.controls.on_story.called)

    def test_mute_blocks_and_turns_light_off(self):
        self.mute.activate(); self.speak.press(); self.story.press()
        self.assertEqual(self.controls.state, DeviceState.MUTED)
        self.assertFalse(self.controls.on_speak.called)
        self.assertFalse(self.controls.on_story.called)
        self.assertEqual(self.led.calls[-1], "off")

    def test_lights_have_distinct_recording_and_processing_patterns(self):
        self.controls.set_state(DeviceState.RECORDING)
        self.assertEqual(self.led.calls[-1], ("blink", .15, .15))
        self.controls.set_state(DeviceState.PROCESSING)
        self.assertEqual(self.led.calls[-1], ("blink", .7, .7))

    def test_close_closes_all_components(self):
        self.controls.close()
        self.assertTrue(self.speak.closed and self.story.closed and self.mute.closed and self.led.closed)


class AppTests(unittest.TestCase):
    def controls(self):
        speak, story, mute, led = FakeButton(), FakeButton(), FakeMute(), FakeLED()
        return KunibertGPIO(speak, story, mute, StateLights(led), Mock(), Mock())

    def test_question_runs_record_api_play_and_returns_ready(self):
        controls = self.controls()
        api = Mock()
        api.send_turn.return_value = Turn("t1", "frage", {"v": 1})
        api.fetch_audio.return_value = b"wav"
        recorder = Mock(); recorder.record.return_value = b"question"
        play = Mock()
        app = DeviceApp(api, recorder, controls, state_file=None, play=play)
        with patch("tempfile.NamedTemporaryFile") as temp:
            handle = temp.return_value.__enter__.return_value
            handle.name = "/dev/shm/q.wav"
            app.handle_question()
        recorder.record.assert_called_once()
        api.send_turn.assert_called_once()
        play.assert_called_once_with(b"wav")
        self.assertEqual(controls.state, DeviceState.READY)

    def test_story_does_not_record(self):
        controls = self.controls(); api = Mock()
        api.send_turn.return_value = Turn("t2", "geschichte", {"v": 1})
        api.fetch_audio.return_value = b"wav"
        recorder = Mock(); play = Mock()
        DeviceApp(api, recorder, controls, state_file=None, play=play).handle_story()
        recorder.record.assert_not_called()
        api.send_turn.assert_called_once()
        self.assertIsNone(api.send_turn.call_args.args[0])
        self.assertEqual(controls.state, DeviceState.READY)

    def test_error_plays_fallback_and_returns_ready(self):
        controls = self.controls(); api = Mock()
        api.send_turn.side_effect = RuntimeError("network")
        play = Mock()
        DeviceApp(api, Mock(), controls, state_file=None, play=play, offline_audio=b"offline").handle_story()
        play.assert_called_once_with(b"offline")
        self.assertEqual(controls.state, DeviceState.READY)


class RecorderTests(unittest.TestCase):
    def test_duration_is_bounded(self):
        with self.assertRaises(ValueError): Recorder(max_seconds=31)

    @patch("kunibert_pi.recorder.subprocess.run")
    def test_arecord_failure_is_reported(self, run):
        run.return_value.returncode = 1
        with self.assertRaises(RecordingError): Recorder(max_seconds=1).record()
        self.assertEqual(run.call_args.args[0][0], "arecord")


class MainTests(unittest.TestCase):
    @patch.dict("os.environ", {"KUNIBERT_API_BASE": "http://127.0.0.1:8000",
                                "KUNIBERT_DEVICE_ID": "prototype-1",
                                "KUNIBERT_DEVICE_TOKEN": "test-token"})
    @patch("kunibert_pi.gpio_main.signal.pause", side_effect=KeyboardInterrupt)
    @patch("kunibert_pi.gpio_main.build_real_gpio")
    @patch("kunibert_pi.gpio_main.DeviceApp")
    @patch("kunibert_pi.gpio_main.Recorder")
    @patch("kunibert_pi.gpio_main.KunibertAPI")
    def test_gpio_main_closes_controls(self, api, recorder, app, build, pause):
        controls = Mock()
        build.return_value = controls
        with self.assertRaises(KeyboardInterrupt):
            gpio_main.main([])
        controls.close.assert_called_once()


if __name__ == "__main__": unittest.main()
