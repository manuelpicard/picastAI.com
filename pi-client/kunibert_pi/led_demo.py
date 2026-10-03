"""Standalone LED state demo for the Kunibert prototype.

On a Raspberry Pi:
  python3 -m kunibert_pi.led_demo --state bereit
  python3 -m kunibert_pi.led_demo --state aufnahme --seconds 10
  python3 -m kunibert_pi.led_demo --cycle

The default pin uses BCM GPIO17. Connect an LED through a suitable resistor
(and never connect an LED directly between 5V and a GPIO pin).
"""
from __future__ import annotations

import argparse
import signal
import time

from .gpio import DeviceState, StateLights


STATE_NAMES = {
    "bereit": DeviceState.READY,
    "aufnahme": DeviceState.RECORDING,
    "verarbeitung": DeviceState.PROCESSING,
    "wiedergabe": DeviceState.PLAYING,
    "fehler": DeviceState.ERROR,
    "mikrofon-aus": DeviceState.MUTED,
}


def real_led(pin: int):
    try:
        from gpiozero import LED
    except ImportError as exc:
        raise SystemExit("gpiozero fehlt: sudo apt install -y python3-gpiozero") from exc
    return LED(pin)


def hold(lights: StateLights, state: DeviceState, seconds: float | None) -> None:
    lights.set(state)
    if seconds is None:
        stop = {"value": False}
        def request_stop(*_):
            stop["value"] = True
        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGTERM, request_stop)
        while not stop["value"]:
            signal.pause()
    else:
        time.sleep(seconds)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert: LED-Zustände testen")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--state", choices=sorted(STATE_NAMES), help="einen Zustand anzeigen")
    group.add_argument("--cycle", action="store_true", help="alle Zustände nacheinander zeigen")
    parser.add_argument("--pin", type=int, default=17, help="BCM-GPIO-Pin, Standard: 17")
    parser.add_argument("--seconds", type=float, default=None,
                        help="Dauer für --state; ohne Angabe bis Ctrl-C")
    args = parser.parse_args(argv)
    if args.seconds is not None and args.seconds < 0:
        parser.error("--seconds darf nicht negativ sein")
    led = real_led(args.pin)
    lights = StateLights(led)
    try:
        if args.cycle:
            for state in (DeviceState.READY, DeviceState.RECORDING,
                          DeviceState.PROCESSING, DeviceState.PLAYING,
                          DeviceState.ERROR, DeviceState.MUTED):
                print(f"{state.value} …")
                hold(lights, state, 3)
        else:
            state = STATE_NAMES[args.state]
            print(f"{state.value} – Ctrl-C zum Beenden")
            hold(lights, state, args.seconds)
    finally:
        lights.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
