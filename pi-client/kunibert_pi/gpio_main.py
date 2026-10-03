"""Start the physical prototype: python3 -m kunibert_pi.gpio_main"""
from __future__ import annotations

import argparse
import logging
import os
import signal
from pathlib import Path

from .api import KunibertAPI
from .device import DeviceApp
from .gpio import Pins, build_real_gpio
from .recorder import Recorder


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert GPIO-Prototyp")
    parser.add_argument("--state-file", type=Path, default=Path("/dev/shm/kunibert.json"))
    parser.add_argument("--audio-input", default=None, help="ALSA-Mikrofon, z. B. plughw:1,0")
    parser.add_argument("--audio-output", default=None, help="ALSA-Lautsprecher, z. B. plughw:1,0")
    parser.add_argument("--max-seconds", type=int, default=20, choices=range(1, 31))
    args = parser.parse_args(argv)
    logging.basicConfig(level=os.environ.get("KUNIBERT_LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    token = os.environ.get("KUNIBERT_DEVICE_TOKEN", "")
    device_id = os.environ.get("KUNIBERT_DEVICE_ID", "")
    base = os.environ.get("KUNIBERT_API_BASE", "http://127.0.0.1:8000")
    if not token or not device_id:
        parser.error("KUNIBERT_DEVICE_TOKEN und KUNIBERT_DEVICE_ID setzen")
    api = KunibertAPI(base, token, device_id)
    recorder = Recorder(device=args.audio_input, max_seconds=args.max_seconds)
    # Callback-Referenzen werden von DeviceApp gesetzt, sobald die Hardware lebt.
    controls = build_real_gpio(Pins(), lambda: None, lambda: None)
    app = DeviceApp(api, recorder, controls,
                    state_file=args.state_file,
                    play=lambda audio: __import__("kunibert_pi.audio", fromlist=["play_wav"]).play_wav(
                        audio, device=args.audio_output))
    del app  # callbacks are held by controls; keeping the controls loop alive is sufficient
    stop = {"requested": False}
    def shutdown(*_):
        stop["requested"] = True
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        # gpiozero callbacks run in background threads; this loop keeps the process alive.
        while not stop["requested"]:
            signal.pause()
    finally:
        controls.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
