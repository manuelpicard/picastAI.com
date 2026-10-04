"""Physical end-to-end test for the complete Kunibert device path.

Requires an actual Raspberry Pi, GPIO wiring, ALSA devices and --online:
  python3 -m kunibert_pi.e2e_test --online \
      --input 'plughw:CARD=Device,DEV=0' \
      --output 'plughw:CARD=Speaker,DEV=0'

The test waits for GPIO5 (question) or GPIO6 (new story). GPIO22 mutes input.
It uses the production API client and device state machine, but is still a
supervised prototype test: no automatic retries and no child unattended use.
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import signal
import time
from pathlib import Path

from .api import ApiError, KunibertAPI
from .audio import play_wav
from .device import DeviceApp
from .gpio import Pins, build_real_gpio
from .recorder import Recorder

log = logging.getLogger("kunibert.e2e")


def require_tools() -> None:
    missing = [name for name in ("arecord", "aplay") if shutil.which(name) is None]
    if missing:
        raise SystemExit("Fehlende ALSA-Programme: " + ", ".join(missing) +
                         ". Installieren mit: sudo apt install -y alsa-utils")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ritter Kunibert: kompletter Pi-End-to-End-Test")
    parser.add_argument("--online", action="store_true",
                        help="bewusst aktivieren: Audio wird an den konfigurierten Server gesendet")
    parser.add_argument("--input", required=True, help="ALSA-Mikrofon, z. B. plughw:CARD=Device,DEV=0")
    parser.add_argument("--output", required=True, help="ALSA-Lautsprecher, z. B. plughw:CARD=Speaker,DEV=0")
    parser.add_argument("--state-file", type=Path, default=Path("/dev/shm/kunibert.json"))
    parser.add_argument("--max-seconds", type=int, default=20, choices=range(1, 31))
    parser.add_argument("--speak-pin", type=int, default=5)
    parser.add_argument("--story-pin", type=int, default=6)
    parser.add_argument("--led-pin", type=int, default=17)
    parser.add_argument("--mute-pin", type=int, default=22)
    args = parser.parse_args(argv)
    if not args.online:
        parser.error("Dieser E2E-Test sendet Audio. Zum bewussten Start --online angeben.")
    require_tools()
    token = os.environ.get("KUNIBERT_DEVICE_TOKEN", "")
    device_id = os.environ.get("KUNIBERT_DEVICE_ID", "")
    base = os.environ.get("KUNIBERT_API_BASE", "http://127.0.0.1:8000")
    if not token or not device_id:
        parser.error("KUNIBERT_DEVICE_TOKEN und KUNIBERT_DEVICE_ID setzen")

    logging.basicConfig(level=os.environ.get("KUNIBERT_LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    api = KunibertAPI(base, token, device_id)
    try:
        api.check_health()
    except (ApiError, ValueError) as exc:
        raise SystemExit(f"Server-Healthcheck fehlgeschlagen: {exc}") from exc
    print(f"Server erreichbar: {base}")
    print("Testablauf: GPIO5 Frage, GPIO6 Geschichte, GPIO22 Mikrofon-Aus, Ctrl-C beendet.")

    pins = Pins(speak_button=args.speak_pin, story_button=args.story_pin,
                status_led=args.led_pin, microphone_mute=args.mute_pin)
    controls = build_real_gpio(pins, lambda: None, lambda: None)
    app = DeviceApp(api, Recorder(device=args.input, max_seconds=args.max_seconds), controls,
                    state_file=args.state_file,
                    play=lambda data: play_wav(data, device=args.output))
    stop = {"requested": False}
    def shutdown(*_):
        stop["requested"] = True
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    try:
        while not stop["requested"]:
            time.sleep(0.25)
    finally:
        controls.close()
        print("E2E-Test beendet; GPIO und LED wurden geschlossen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
