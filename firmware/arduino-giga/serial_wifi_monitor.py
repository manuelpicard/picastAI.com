#!/usr/bin/env python3
"""Log and plot Ritter-Kunibert GIGA WLAN stability monitor output.

Expected serial lines, emitted by RitterKunibertConnectivityTest.ino:
  MONITOR #12 RSSI=-57dBm Health=OK status=200 latency=184ms
  MONITOR: WLAN getrennt; Wiederverbindung...
  MONITOR: Wiederverbindung OK.

Examples:
  python3 serial_wifi_monitor.py --port /dev/ttyACM0 --duration 3600
  python3 serial_wifi_monitor.py --input wifi_log.csv --plot wifi_stability.png
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

MONITOR_RE = re.compile(
    r"MONITOR\s+#(?P<sample>\d+)\s+"
    r"RSSI=(?P<rssi>-?\d+(?:\.\d+)?)dBm\s+"
    r"Health=(?P<health>OK|FEHLER)\s+"
    r"status=(?P<status>\d+)\s+"
    r"latency=(?P<latency>\d+)ms",
    re.IGNORECASE,
)

@dataclass
class Sample:
    timestamp: str
    epoch: float
    elapsed_s: float
    sample: int
    rssi_dbm: float
    health: str
    http_status: int
    latency_ms: int


def parse_monitor_line(line: str, timestamp: Optional[datetime] = None,
                       start_epoch: Optional[float] = None) -> Optional[Sample]:
    match = MONITOR_RE.search(line)
    if not match:
        return None
    now = timestamp or datetime.now(timezone.utc)
    epoch = now.timestamp()
    start = epoch if start_epoch is None else start_epoch
    return Sample(
        timestamp=now.isoformat(timespec="seconds"),
        epoch=epoch,
        elapsed_s=epoch - start,
        sample=int(match.group("sample")),
        rssi_dbm=float(match.group("rssi")),
        health=match.group("health").upper(),
        http_status=int(match.group("status")),
        latency_ms=int(match.group("latency")),
    )


def log_serial(port: str, baud: int, duration: Optional[float], raw_path: Path,
               csv_path: Path) -> list[Sample]:
    try:
        import serial  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "pyserial fehlt. Installieren mit: python3 -m pip install pyserial"
        ) from exc

    samples: list[Sample] = []
    reconnects = 0
    drops = 0
    started = time.time()
    start_epoch: Optional[float] = None
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Öffne seriellen Port {port} mit {baud} Baud …")
    try:
        ser = serial.Serial(port, baudrate=baud, timeout=1)
    except Exception as exc:
        raise SystemExit(f"Serieller Port konnte nicht geöffnet werden: {exc}") from exc

    with ser, raw_path.open("a", encoding="utf-8") as raw_file:
        writer = csv.DictWriter(raw_file, fieldnames=["timestamp", "line"])
        if raw_file.tell() == 0:
            writer.writeheader()
        print("Logging läuft. Mit Ctrl+C beenden.")
        while duration is None or time.time() - started < duration:
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            now = datetime.now(timezone.utc)
            writer.writerow({"timestamp": now.isoformat(timespec="seconds"), "line": line})
            raw_file.flush()
            print(line)

            if "WLAN getrennt" in line:
                drops += 1
            if "Wiederverbindung OK" in line:
                reconnects += 1
            sample = parse_monitor_line(line, timestamp=now, start_epoch=start_epoch)
            if sample:
                if start_epoch is None:
                    start_epoch = sample.epoch
                    sample.elapsed_s = 0.0
                samples.append(sample)
                append_sample_csv(csv_path, sample)

    print(f"Aufzeichnung beendet: {len(samples)} Messpunkte, {drops} Abbrüche, {reconnects} Wiederverbindungen")
    return samples


def append_sample_csv(path: Path, sample: Sample) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists() and path.stat().st_size > 0
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(asdict(sample).keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(asdict(sample))


def read_samples_csv(path: Path) -> list[Sample]:
    samples: list[Sample] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            samples.append(Sample(
                timestamp=row["timestamp"],
                epoch=float(row["epoch"]),
                elapsed_s=float(row["elapsed_s"]),
                sample=int(row["sample"]),
                rssi_dbm=float(row["rssi_dbm"]),
                health=row["health"],
                http_status=int(row["http_status"]),
                latency_ms=int(row["latency_ms"]),
            ))
    return samples


def print_summary(samples: list[Sample]) -> None:
    if not samples:
        print("Keine Monitor-Messpunkte gefunden.")
        return
    rssi = [s.rssi_dbm for s in samples]
    latency = [s.latency_ms for s in samples]
    health_errors = sum(s.health != "OK" for s in samples)
    print("\nAuswertung")
    print("---------")
    print(f"Messpunkte:          {len(samples)}")
    print(f"Dauer:               {samples[-1].elapsed_s:.0f} s")
    print(f"RSSI min/max/Ø:      {min(rssi):.1f} / {max(rssi):.1f} / {sum(rssi)/len(rssi):.1f} dBm")
    print(f"Latenz min/max/Ø:    {min(latency)} / {max(latency)} / {sum(latency)/len(latency):.1f} ms")
    print(f"Health-Fehler:       {health_errors} ({health_errors/len(samples)*100:.1f} %)" )
    print(f"HTTP-Statuscodes:    {sorted(set(s.http_status for s in samples))}")


def plot_samples(samples: list[Sample], output: Path, title: str) -> None:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "matplotlib fehlt. Installieren mit: python3 -m pip install matplotlib"
        ) from exc
    if not samples:
        raise SystemExit("Keine Daten für die Grafik vorhanden.")

    x = [s.elapsed_s / 60.0 for s in samples]
    rssi = [s.rssi_dbm for s in samples]
    latency = [s.latency_ms for s in samples]
    good = [s.health == "OK" for s in samples]

    fig, axes = plt.subplots(3, 1, figsize=(12, 9), sharex=True,
                             gridspec_kw={"height_ratios": [1.25, 1.0, 0.7]})
    fig.suptitle(title)

    ax = axes[0]
    ax.plot(x, rssi, color="#1769aa", marker=".", linewidth=1, label="RSSI")
    ax.axhline(-70, color="#c62828", linestyle="--", linewidth=1, label="-70 dBm Orientierung")
    ax.set_ylabel("RSSI (dBm)")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="best")

    ax = axes[1]
    ax.plot(x, latency, color="#6a1b9a", marker=".", linewidth=1, label="Health-Latenz")
    failed_x = [xx for xx, ok in zip(x, good) if not ok]
    failed_y = [yy for yy, ok in zip(latency, good) if not ok]
    if failed_x:
        ax.scatter(failed_x, failed_y, color="#d32f2f", marker="x", s=45, label="Health-Fehler")
    ax.set_ylabel("Latenz (ms)")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="best")

    ax = axes[2]
    ax.step(x, [1 if ok else 0 for ok in good], where="post", color="#2e7d32")
    ax.set_yticks([0, 1], ["Fehler", "OK"])
    ax.set_ylabel("Health")
    ax.set_xlabel("Zeit seit Start (Minuten)")
    ax.grid(True, alpha=0.3)

    fig.tight_layout()
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=160)
    print(f"Grafik gespeichert: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description="WLAN-Stabilitätsdaten des GIGA loggen und plotten")
    parser.add_argument("--port", help="Serieller Port, z. B. /dev/ttyACM0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--duration", type=float, help="Aufzeichnungsdauer in Sekunden; Standard: bis Ctrl+C")
    parser.add_argument("--input", type=Path, help="Vorhandene Mess-CSV analysieren, ohne seriellen Port")
    parser.add_argument("--csv", type=Path, default=Path("wifi_stability_samples.csv"), help="Messdaten-CSV")
    parser.add_argument("--raw", type=Path, default=Path("wifi_serial_raw.csv"), help="Rohlog-CSV")
    parser.add_argument("--plot", type=Path, default=Path("wifi_stability.png"), help="Ausgabedatei für Grafik")
    args = parser.parse_args()

    if args.input:
        samples = read_samples_csv(args.input)
    else:
        if not args.port:
            parser.error("--port ist erforderlich, wenn --input nicht verwendet wird")
        try:
            samples = log_serial(args.port, args.baud, args.duration, args.raw, args.csv)
        except KeyboardInterrupt:
            print("\nLogging durch Benutzer beendet.")
            samples = read_samples_csv(args.csv) if args.csv.exists() else []

    print_summary(samples)
    if samples:
        plot_samples(samples, args.plot, "Ritter Kunibert – WLAN-Stabilität")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
