#!/usr/bin/env bash
# Direkter ALSA-Test für Ritter Kunibert.
# Prüft Aufnahme und Wiedergabe ohne Python, sounddevice oder picastAI.
# Aufruf: sudo bash test_alsa_audio.sh [Optionen]

set -Eeuo pipefail
IFS=$'\n\t'

OUT_DIR="/tmp/kunibert-alsa-test"
DURATION=3
RATE=16000
CHANNELS=1
FORMAT="S16_LE"
PLAYBACK_DEVICE="default"
CAPTURE_DEVICE="default"
MODE="all"
KEEP=0

log() { printf '[kunibert-alsa] %s\n' "$*"; }
warn() { printf '[kunibert-alsa] WARNUNG: %s\n' "$*" >&2; }
die() { printf '[kunibert-alsa] FEHLER: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Direkter ALSA-Aufnahme-/Wiedergabetest für Raspberry Pi OS.

Aufruf:
  bash test_alsa_audio.sh [Optionen]

Optionen:
  --capture-device NAME  Aufnahmegerät, Standard: default
  --playback-device NAME Wiedergabegerät, Standard: default
  --duration SEKUNDEN    Aufnahmedauer, Standard: 3
  --rate HZ              Abtastrate, Standard: 16000
  --channels N           Kanäle, Standard: 1
  --format FORMAT        ALSA-Format, Standard: S16_LE
  --out-dir DIR          temporäres Ausgabeverzeichnis
  --mode MODE            all|list|capture|playback|roundtrip
  --keep                 Testdateien behalten
  -h, --help             Hilfe

Beispiele:
  bash test_alsa_audio.sh
  bash test_alsa_audio.sh --mode capture --capture-device hw:wm8960soundcard,0
  bash test_alsa_audio.sh --mode playback --playback-device default
  bash test_alsa_audio.sh --mode roundtrip --duration 5

Hinweis:
  Bei einer durch das Installationsskript gesetzten /etc/asound.conf ist
  "default" der bevorzugte Gerätename. Mit aplay -L und arecord -L können
  verfügbare ALSA-Namen angezeigt werden.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --capture-device) [[ $# -ge 2 ]] || die "--capture-device benötigt einen Wert"; CAPTURE_DEVICE="$2"; shift 2 ;;
    --playback-device) [[ $# -ge 2 ]] || die "--playback-device benötigt einen Wert"; PLAYBACK_DEVICE="$2"; shift 2 ;;
    --duration) [[ $# -ge 2 ]] || die "--duration benötigt einen Wert"; DURATION="$2"; shift 2 ;;
    --rate) [[ $# -ge 2 ]] || die "--rate benötigt einen Wert"; RATE="$2"; shift 2 ;;
    --channels) [[ $# -ge 2 ]] || die "--channels benötigt einen Wert"; CHANNELS="$2"; shift 2 ;;
    --format) [[ $# -ge 2 ]] || die "--format benötigt einen Wert"; FORMAT="$2"; shift 2 ;;
    --out-dir) [[ $# -ge 2 ]] || die "--out-dir benötigt einen Wert"; OUT_DIR="$2"; shift 2 ;;
    --mode) [[ $# -ge 2 ]] || die "--mode benötigt einen Wert"; MODE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

command -v arecord >/dev/null || die "arecord fehlt. Installieren mit: sudo apt install alsa-utils"
command -v aplay >/dev/null || die "aplay fehlt. Installieren mit: sudo apt install alsa-utils"
command -v file >/dev/null || die "file fehlt. Installieren mit: sudo apt install file"

[[ "$MODE" =~ ^(all|list|capture|playback|roundtrip)$ ]] || die "Ungültiger Modus: $MODE"
[[ "$DURATION" =~ ^[1-9][0-9]*(\.[0-9]+)?$ ]] || die "Ungültige Dauer: $DURATION"
[[ "$RATE" =~ ^[0-9]+$ ]] || die "Ungültige Abtastrate: $RATE"
[[ "$CHANNELS" =~ ^[1-9][0-9]*$ ]] || die "Ungültige Kanalzahl: $CHANNELS"

mkdir -p "$OUT_DIR"
CAPTURE_FILE="$OUT_DIR/kunibert-capture.wav"
TONE_FILE="$OUT_DIR/kunibert-tone.wav"
ROUNDTRIP_FILE="$OUT_DIR/kunibert-roundtrip.wav"

cleanup() {
  if [[ "$KEEP" != "1" ]]; then
    rm -f "$CAPTURE_FILE" "$TONE_FILE" "$ROUNDTRIP_FILE"
    rmdir "$OUT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

list_devices() {
  log "ALSA-Wiedergabegeräte (aplay -l):"
  aplay -l || warn "Keine Hardware-Wiedergabegeräte erkannt."
  printf '\n'
  log "ALSA-Aufnahmegeräte (arecord -l):"
  arecord -l || warn "Keine Hardware-Aufnahmegeräte erkannt."
  printf '\n'
  log "ALSA-Wiedergabenamen (aplay -L, Auswahl):"
  aplay -L | sed -n '1,80p'
  printf '\n'
  log "ALSA-Aufnahmenamen (arecord -L, Auswahl):"
  arecord -L | sed -n '1,80p'
}

check_capture() {
  log "Aufnahmetest: Gerät=$CAPTURE_DEVICE, Dauer=${DURATION}s, Format=$FORMAT, Rate=${RATE}Hz, Kanäle=$CHANNELS"
  rm -f "$CAPTURE_FILE"
  if ! arecord \
    --quiet \
    --device="$CAPTURE_DEVICE" \
    --format="$FORMAT" \
    --rate="$RATE" \
    --channels="$CHANNELS" \
    --duration="$DURATION" \
    "$CAPTURE_FILE"; then
    die "Aufnahme fehlgeschlagen. Prüfe arecord -l, HAT-Treiber, Mikrofon und --capture-device."
  fi
  [[ -s "$CAPTURE_FILE" ]] || die "Aufnahme erzeugte eine leere Datei."
  log "Aufnahme erfolgreich: $CAPTURE_FILE ($(stat -c '%s Bytes' "$CAPTURE_FILE"))"
  file "$CAPTURE_FILE"
  command -v sox >/dev/null && sox --info "$CAPTURE_FILE" 2>/dev/null || true
}

make_tone() {
  # Erzeuge einen kurzen 440-Hz-Sinus als PCM-WAV mit Python nur als Testsignal.
  # Aufnahme und Wiedergabe bleiben vollständig ALSA-basiert.
  python3 - "$TONE_FILE" "$RATE" <<'PY'
import math
import struct
import sys
import wave

path, rate_text = sys.argv[1:]
rate = int(rate_text)
seconds = 2
frequency = 440
frames = bytearray()
for i in range(rate * seconds):
    value = int(0.28 * 32767 * math.sin(2 * math.pi * frequency * i / rate))
    frames.extend(struct.pack('<h', value))
with wave.open(path, 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(rate)
    out.writeframes(frames)
PY
}

check_playback() {
  log "Wiedergabetest: Gerät=$PLAYBACK_DEVICE"
  make_tone
  if ! aplay --quiet --device="$PLAYBACK_DEVICE" "$TONE_FILE"; then
    die "Wiedergabe fehlgeschlagen. Prüfe aplay -l, Lautsprecher, HAT-Treiber und --playback-device."
  fi
  log "Wiedergabe erfolgreich. Es sollte ein 440-Hz-Ton hörbar gewesen sein."
}

check_roundtrip() {
  log "Roundtrip-Test: Aufnahme und danach direkte Wiedergabe"
  check_capture
  if ! aplay --quiet --device="$PLAYBACK_DEVICE" "$CAPTURE_FILE"; then
    die "Roundtrip-Wiedergabe fehlgeschlagen."
  fi
  cp "$CAPTURE_FILE" "$ROUNDTRIP_FILE"
  log "Roundtrip erfolgreich: Aufnahme wurde wiedergegeben."
}

log "Verwende ALSA-Aufnahmegerät: $CAPTURE_DEVICE"
log "Verwende ALSA-Wiedergabegerät: $PLAYBACK_DEVICE"

case "$MODE" in
  list)
    list_devices
    ;;
  capture)
    check_capture
    ;;
  playback)
    check_playback
    ;;
  roundtrip)
    check_roundtrip
    ;;
  all)
    list_devices
    printf '\n'
    check_capture
    printf '\n'
    check_playback
    printf '\n'
    log "Gesamter ALSA-Test erfolgreich."
    ;;
esac

if [[ "$KEEP" == "1" ]]; then
  log "Testdateien bleiben erhalten unter: $OUT_DIR"
fi
