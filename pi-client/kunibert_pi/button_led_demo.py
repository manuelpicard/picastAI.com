"""Standalone hardware test: GPIO5 button drives GPIO17 status LED.

  python3 -m kunibert_pi.button_led_demo --seconds 3

This test records locally only; it does not contact the Kunibert server.
"""
from __future__ import annotations

import argparse
import signal
from typing import Callable, Protocol

from .gpio import DeviceState, StateLights
from .recorder import Recorder, RecordingError


class ButtonProtocol(Protocol):
    def when_pressed(self, callback: Callable[[], None]) -> None: ...
    def close(self) -> None: ...


class ButtonLEDRecorder:
    def __init__(self, button: ButtonProtocol, lights: StateLights,
                 record: Callable[[], bytes]):
        self.button = button
        self.lights = lights
        self.record = record
        self.busy = False
        button.when_pressed(self._pressed)
        lights.set(DeviceState.READY)

    def _pressed(self) -> None:
        if self.busy:
            return
        self.busy = True
        try:
            self.lights.set(DeviceState.RECORDING)
            audio = self.record()
            print(f"Aufnahme OK: {len(audio)} Bytes")
            self.lights.set(DeviceState.READY)
        except (RecordingError, OSError) as exc:
            print(f"Aufnahme fehlgeschlagen: {type(exc).__name__}")
            self.lights.set(DeviceState.ERROR)
        finally:
            self.busy = False
            self.lights.set(DeviceState.READY)

    def close(self) -> None:
        self.button.close()
        self.lights.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert: Aufnahmeknopf + LED testen")
    parser.add_argument("--button-pin", type=int, default=5, help="BCM-GPIO für Aufnahmeknopf, Standard: 5")
    parser.add_argument("--led-pin", type=int, default=17, help="BCM-GPIO für Status-LED, Standard: 17")
    parser.add_argument("--input", default=None, help="ALSA-Mikrofon, z. B. plughw:CARD=Device,DEV=0")
    parser.add_argument("--seconds", type=int, default=5, choices=range(1, 31),
                        help="maximale Aufnahmedauer pro Knopfdruck")
    args = parser.parse_args(argv)
    try:
        from gpiozero import Button, LED
    except ImportError as exc:
        parser.error("gpiozero fehlt: sudo apt install -y python3-gpiozero")
    button = Button(args.button_pin, pull_up=True, bounce_time=0.08)
    lights = StateLights(LED(args.led_pin))
    demo = ButtonLEDRecorder(button, lights, Recorder(device=args.input, max_seconds=args.seconds).record)
    print(f"Bereit. GPIO{args.button_pin} drücken; Ctrl-C beendet den Test.")
    stopped = {"value": False}
    def stop(*_):
        stopped["value"] = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        while not stopped["value"]:
            signal.pause()
    finally:
        demo.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
