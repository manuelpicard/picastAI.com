import unittest
from unittest.mock import Mock

from kunibert_pi.button_led_demo import ButtonLEDRecorder
from kunibert_pi.gpio import DeviceState, StateLights
from kunibert_pi.recorder import RecordingError


class FakeButton:
    def __init__(self): self.callback = None; self.closed = False
    def when_pressed(self, callback): self.callback = callback
    def press(self): self.callback()
    def close(self): self.closed = True


class FakeLED:
    def __init__(self): self.calls = []; self.closed = False
    def on(self): self.calls.append("on")
    def off(self): self.calls.append("off")
    def blink(self, on_time=.5, off_time=.5): self.calls.append(("blink", on_time, off_time))
    def close(self): self.closed = True


class ButtonLEDTests(unittest.TestCase):
    def make(self, record):
        button, led = FakeButton(), FakeLED()
        demo = ButtonLEDRecorder(button, StateLights(led), record)
        return demo, button, led

    def test_press_records_with_fast_blink_then_ready(self):
        demo, button, led = self.make(lambda: b"wav")
        button.press()
        self.assertEqual(led.calls[0], "off")
        self.assertEqual(led.calls[1], ("blink", .15, .15))
        self.assertEqual(led.calls[2], "off")
        self.assertFalse(demo.busy)

    def test_recording_error_shows_error_pattern_and_recovers(self):
        demo, button, led = self.make(lambda: (_ for _ in ()).throw(RecordingError("no mic")))
        button.press()
        self.assertEqual(led.calls[-2], ("blink", .08, .08))
        self.assertEqual(led.calls[-1], "off")
        self.assertFalse(demo.busy)

    def test_busy_press_is_ignored(self):
        calls = []
        demo, button, led = self.make(lambda: calls.append("record"))
        demo.busy = True
        button.press()
        self.assertEqual(calls, [])

    def test_close_releases_button_and_led(self):
        demo, button, led = self.make(lambda: b"wav")
        demo.close()
        self.assertTrue(button.closed and led.closed)


if __name__ == "__main__": unittest.main()
