import unittest
from unittest.mock import Mock, patch

from kunibert_pi import led_demo
from kunibert_pi.gpio import DeviceState


class LEDDemoTests(unittest.TestCase):
    def test_state_names_cover_all_user_visible_states(self):
        self.assertEqual(led_demo.STATE_NAMES["bereit"], DeviceState.READY)
        self.assertEqual(led_demo.STATE_NAMES["aufnahme"], DeviceState.RECORDING)
        self.assertEqual(led_demo.STATE_NAMES["wiedergabe"], DeviceState.PLAYING)
        self.assertEqual(led_demo.STATE_NAMES["mikrofon-aus"], DeviceState.MUTED)

    @patch("kunibert_pi.led_demo.real_led")
    def test_single_state_is_set_and_led_is_closed(self, real_led):
        led = Mock()
        real_led.return_value = led
        self.assertEqual(led_demo.main(["--state", "bereit", "--seconds", "0"]), 0)
        led.off.assert_called()
        led.close.assert_called_once()

    @patch("kunibert_pi.led_demo.real_led")
    def test_negative_duration_is_rejected_before_hardware_access(self, real_led):
        with self.assertRaises(SystemExit):
            led_demo.main(["--state", "bereit", "--seconds", "-1"])
        real_led.assert_not_called()


if __name__ == "__main__":
    unittest.main()
