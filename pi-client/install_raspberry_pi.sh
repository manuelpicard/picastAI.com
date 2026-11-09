#!/usr/bin/env bash
# Install Ritter Kunibert Pi client on a fresh Raspberry Pi OS installation.
# Target: Raspberry Pi OS Lite on a Raspberry Pi 5 (prototype, USB audio; the final
# device is planned as ESP32-S3). Not yet run on real Pi hardware.
# Run as root: sudo bash pi-client/install_raspberry_pi.sh --api-token '...'

set -Eeuo pipefail
IFS=$'\n\t'

APP_NAME="kunibert"
APP_USER="kunibert"
APP_GROUP="audio"
INSTALL_DIR="/opt/kunibert"
VENV_DIR="${INSTALL_DIR}/.venv"
CONFIG_DIR="/etc/kunibert"
CONFIG_FILE="${CONFIG_DIR}/kunibert.env"
DATA_DIR="/var/lib/kunibert"
SERVICE_FILE="/etc/systemd/system/kunibert.service"
SOURCE_DIR=""
API_BASE_URL="https://picastAI.com"
DEVICE_ID="prototype-001"
DEVICE_TOKEN=""
DEVICE_NAME="picastAI Raspberry Pi"
AUDIO_CARD=""
CAPTURE_DEVICE=""
PLAYBACK_DEVICE=""
SAMPLE_RATE="16000"
DRY_RUN="0"
NON_INTERACTIVE="0"

log() { printf '[kunibert-install] %s\n' "$*"; }
warn() { printf '[kunibert-install] WARNUNG: %s\n' "$*" >&2; }
die() { printf '[kunibert-install] FEHLER: %s\n' "$*" >&2; exit 1; }
# Wert für die systemd-EnvironmentFile in Anführungszeichen (Leerzeichen bleiben erhalten).
env_quote() { local v="$1"; v="${v//\\/\\\\}"; v="${v//\"/\\\"}"; printf '"%s"' "$v"; }

usage() {
  cat <<'EOF'
Installiert den Ritter-Kunibert-Raspberry-Pi-Client auf Raspberry Pi OS.

Aufruf:
  sudo bash pi-client/install_raspberry_pi.sh [Optionen]

Optionen:
  --source-dir DIR       Repository-/Installationsquelle (Standard: automatisch)
  --api-url URL          picastAI-API-Basis-URL
  --device-id ID         Geräte-ID
  --api-token TOKEN      Geräte-Token; nicht in Git speichern
  --device-name NAME     Anzeigename des Geräts
  --audio-card CARD      ALSA-Karte, z. B. hw:wm8960soundcard,0
  --capture-device DEV  Mikrofon für den Client (sounddevice-Name oder -Nummer,
                         siehe: python3 -m sounddevice). Für getrennte USB-Geräte.
  --playback-device DEV  Lautsprecher für den Client (wie oben)
  --sample-rate HZ       Audio-Abtastrate (Standard: 16000)
  --non-interactive      niemals nach einem Token fragen
  --dry-run              nur prüfen, keine Änderungen durchführen
  -h, --help             diese Hilfe

Beispiele:
  sudo bash pi-client/install_raspberry_pi.sh \
    --api-token 'TOKEN_AUS_SECRET_MANAGER'

  sudo bash pi-client/install_raspberry_pi.sh \
    --api-url http://192.168.1.20:3000 \
    --device-id pi-zero-001 \
    --api-token 'lokaler-test-token' \
    --audio-card hw:wm8960soundcard,0

Hinweis:
  Dieses Skript installiert ALSA-/PortAudio-Grundpakete und schreibt eine
  minimale /etc/asound.conf. Hersteller-Treiber für WM8960/ReSpeaker werden
  nicht ungeprüft aus externen Git-Repositories installiert. Diese müssen zur
  konkreten Raspberry-Pi-OS-/Kernel-Version passen und separat freigegeben werden.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-dir) [[ $# -ge 2 ]] || die "--source-dir benötigt einen Wert"; SOURCE_DIR="$2"; shift 2 ;;
    --api-url) [[ $# -ge 2 ]] || die "--api-url benötigt einen Wert"; API_BASE_URL="${2%/}"; shift 2 ;;
    --device-id) [[ $# -ge 2 ]] || die "--device-id benötigt einen Wert"; DEVICE_ID="$2"; shift 2 ;;
    --api-token) [[ $# -ge 2 ]] || die "--api-token benötigt einen Wert"; DEVICE_TOKEN="$2"; shift 2 ;;
    --device-name) [[ $# -ge 2 ]] || die "--device-name benötigt einen Wert"; DEVICE_NAME="$2"; shift 2 ;;
    --audio-card) [[ $# -ge 2 ]] || die "--audio-card benötigt einen Wert"; AUDIO_CARD="$2"; shift 2 ;;
    --capture-device) [[ $# -ge 2 ]] || die "--capture-device benötigt einen Wert"; CAPTURE_DEVICE="$2"; shift 2 ;;
    --playback-device) [[ $# -ge 2 ]] || die "--playback-device benötigt einen Wert"; PLAYBACK_DEVICE="$2"; shift 2 ;;
    --sample-rate) [[ $# -ge 2 ]] || die "--sample-rate benötigt einen Wert"; SAMPLE_RATE="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE="1"; shift ;;
    --dry-run) DRY_RUN="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

for _dev in "$CAPTURE_DEVICE" "$PLAYBACK_DEVICE"; do
  [[ "$_dev" != *$'\n'* ]] || die "Audiogeräte-Namen dürfen keinen Zeilenumbruch enthalten."
done

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo oder als root ausführen."
command -v apt-get >/dev/null || die "apt-get wurde nicht gefunden; dieses Skript erwartet Raspberry Pi OS."
command -v systemctl >/dev/null || die "systemctl wurde nicht gefunden; dieses Skript erwartet systemd."

if [[ -z "$SOURCE_DIR" ]]; then
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  SOURCE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
fi
CLIENT_SOURCE="${SOURCE_DIR}/pi-client/kunibert_client.py"
CLIENT_README="${SOURCE_DIR}/pi-client/README.md"
[[ -f "$CLIENT_SOURCE" ]] || die "Client nicht gefunden: $CLIENT_SOURCE"

if [[ -z "$DEVICE_TOKEN" && "$NON_INTERACTIVE" != "1" && "$DRY_RUN" != "1" && -t 0 ]]; then
  read -r -s -p "picastAI-Gerätetoken (Eingabe wird nicht angezeigt): " DEVICE_TOKEN
  printf '\n'
fi
if [[ -z "$DEVICE_TOKEN" ]]; then
  warn "Kein API-Token gesetzt. Der Dienst wird installiert, kann aber erst nach Token-Konfiguration arbeiten."
fi

if ! [[ "$SAMPLE_RATE" =~ ^[0-9]+$ ]] || (( SAMPLE_RATE < 8000 || SAMPLE_RATE > 96000 )); then
  die "Ungültige Abtastrate: $SAMPLE_RATE"
fi
if [[ "$DRY_RUN" == "1" ]]; then
  log "Dry-Run: keine Änderungen werden vorgenommen."
  printf 'Quelle: %s\nZiel: %s\nAPI: %s\nGerät: %s\nALSA-Karte: %s\nMikrofon: %s\nLautsprecher: %s\n' \
    "$SOURCE_DIR" "$INSTALL_DIR" "$API_BASE_URL" "$DEVICE_ID" "${AUDIO_CARD:-automatisch}" \
    "${CAPTURE_DEVICE:-Standard}" "${PLAYBACK_DEVICE:-Standard}"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
log "Installiere Systempakete …"
apt-get update
# python3-gpiozero empfiehlt python3-lgpio nur ("Recommends"), und --no-install-recommends
# lässt es weg. Auf dem Pi 5 geht GPIO aber nur mit lgpio. Das Paket gibt es im
# Raspberry-Pi-OS-Archiv, nicht im normalen Debian; daher nur installieren, wenn vorhanden.
OPTIONAL_PACKAGES=()
if apt-cache show python3-lgpio >/dev/null 2>&1; then
  OPTIONAL_PACKAGES+=(python3-lgpio)
else
  warn "python3-lgpio ist nicht in den Paketquellen (kein Raspberry Pi OS?). Auf dem Pi 5 funktioniert GPIO ohne lgpio nicht."
fi
apt-get install -y --no-install-recommends \
  python3 \
  python3-venv \
  python3-pip \
  python3-dev \
  python3-gpiozero \
  "${OPTIONAL_PACKAGES[@]}" \
  libportaudio2 \
  libsndfile1 \
  alsa-utils \
  libasound2-dev \
  ca-certificates \
  curl \
  rsync

log "Lege Dienstkonto und Verzeichnisse an …"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
usermod -a -G "$APP_GROUP" "$APP_USER" 2>/dev/null || true
# GPIO-Zugriff (Pi 5: /dev/gpiochip*) läuft über die Gruppe gpio, sofern es sie gibt.
if getent group gpio >/dev/null; then
  usermod -a -G gpio "$APP_USER" 2>/dev/null || true
fi
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/audio"
install -d -o root -g "$APP_GROUP" -m 0750 "$CONFIG_DIR"

log "Kopiere Client und richte virtuelle Python-Umgebung ein …"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$INSTALL_DIR/pi-client"
install -o "$APP_USER" -g "$APP_GROUP" -m 0644 "$CLIENT_SOURCE" "$INSTALL_DIR/pi-client/kunibert_client.py"
if [[ -f "$CLIENT_README" ]]; then
  install -o "$APP_USER" -g "$APP_GROUP" -m 0644 "$CLIENT_README" "$INSTALL_DIR/pi-client/README.md"
fi
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  python3 -m venv --system-site-packages "$VENV_DIR"
fi
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install --upgrade sounddevice
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR"

log "Konfiguriere ALSA und PortAudio …"
ASOUND_BACKUP=""
if [[ -f /etc/asound.conf ]]; then
  ASOUND_BACKUP="/etc/asound.conf.kunibert-backup.$(date +%Y%m%d%H%M%S)"
  cp -a /etc/asound.conf "$ASOUND_BACKUP"
  log "Bestehende /etc/asound.conf gesichert nach $ASOUND_BACKUP"
fi

# If no explicit card was supplied, leave ALSA's default selection untouched.
# This avoids breaking a HAT whose card name is provided by its kernel overlay.
if [[ -n "$AUDIO_CARD" ]]; then
  ALSA_CARD_NAME="${AUDIO_CARD#hw:}"
  ALSA_CARD_NAME="${ALSA_CARD_NAME%%,*}"
  cat > /etc/asound.conf <<EOF
# Managed by Ritter Kunibert installer.
# Verify the card with: aplay -L ; arecord -L
pcm.!default {
    type plug
    slave.pcm "$AUDIO_CARD"
}
ctl.!default {
    type hw
    card "$ALSA_CARD_NAME"
}
EOF
  chmod 0644 /etc/asound.conf
else
  log "Keine ALSA-Karte vorgegeben; bestehende Default-Karte bleibt unverändert."
fi

log "Schreibe geschützte Konfiguration …"
cat > "$CONFIG_FILE" <<EOF
# /etc/kunibert/kunibert.env – automatisch erzeugt; Secrets nicht committen.
PICASTAI_API_BASE_URL=$(printf '%q' "$API_BASE_URL")
PICASTAI_DEVICE_ID=$(printf '%q' "$DEVICE_ID")
PICASTAI_DEVICE_TOKEN=$(printf '%q' "$DEVICE_TOKEN")
PICASTAI_DEVICE_NAME=$(printf '%q' "$DEVICE_NAME")
KUNIBERT_SAMPLE_RATE=$(printf '%q' "$SAMPLE_RATE")
KUNIBERT_CACHE_DIR=$(printf '%q' "$DATA_DIR/audio")
KUNIBERT_MAX_RECORD_SECONDS=15
KUNIBERT_MIN_RECORD_SECONDS=0.35
KUNIBERT_REQUEST_TIMEOUT=30
KUNIBERT_PIPELINE_TIMEOUT=140
KUNIBERT_AUDIO_TIMEOUT=45
KUNIBERT_RETRY_COUNT=2
KUNIBERT_RETRY_BACKOFF=1.5
KUNIBERT_LOCALE=de-DE
KUNIBERT_AGE_BAND=6-10
KUNIBERT_SPEECH_BUTTON_GPIO=17
KUNIBERT_STORY_BUTTON_GPIO=27
KUNIBERT_MIC_OFF_GPIO=22
KUNIBERT_STATUS_LED_GPIO=23
# Leer = Standardgerät. Mit zwei USB-Geräten Mikrofon und Lautsprecher getrennt setzen.
KUNIBERT_INPUT_DEVICE=$(env_quote "$CAPTURE_DEVICE")
KUNIBERT_OUTPUT_DEVICE=$(env_quote "$PLAYBACK_DEVICE")
EOF
chmod 0640 "$CONFIG_FILE"
chown root:"$APP_GROUP" "$CONFIG_FILE"

log "Installiere systemd-Service …"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Ritter Kunibert Raspberry-Pi-Client
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
# Arbeitsverzeichnis beschreibbar: die GPIO-Bibliothek lgpio legt dort Hilfsdateien an.
WorkingDirectory=$DATA_DIR
EnvironmentFile=$CONFIG_FILE
ExecStart=$VENV_DIR/bin/python $INSTALL_DIR/pi-client/kunibert_client.py
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=120
StartLimitBurst=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
# Audio access comes from the audio group, GPIO access from the gpio group (see above).

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable kunibert.service

log "Prüfe lokale Python-Syntax …"
"$VENV_DIR/bin/python" -m py_compile "$INSTALL_DIR/pi-client/kunibert_client.py"

log "Prüfe ALSA-Geräte …"
if command -v aplay >/dev/null; then
  aplay -l || warn "Keine Wiedergabekarte erkannt; HAT-Treiber/Overlay prüfen."
fi
if command -v arecord >/dev/null; then
  arecord -l || warn "Keine Aufnahmequelle erkannt; Mikrofon/HAT-Treiber prüfen."
fi

if [[ "${KUNIBERT_INSTALL_START:-0}" == "1" ]]; then
  log "Starte kunibert.service …"
  systemctl restart kunibert.service
  systemctl --no-pager --full status kunibert.service || true
else
  log "Installation abgeschlossen; Dienst wurde aktiviert, aber nicht gestartet."
  log "Nach Verkabelung und Tokenprüfung starten mit: sudo systemctl start kunibert.service"
fi

cat <<EOF

Installation abgeschlossen.

Konfiguration: $CONFIG_FILE
Client:        $INSTALL_DIR/pi-client/kunibert_client.py
Service:       $SERVICE_FILE
Daten:         $DATA_DIR

Nächste Schritte:
  sudo systemctl start kunibert.service
  journalctl -u kunibert.service -f
  sudo systemctl status kunibert.service
  aplay -l
  arecord -l

Für einen lokalen Testdienst kann die Konfiguration angepasst werden:
  sudoedit $CONFIG_FILE
  sudo systemctl restart kunibert.service
EOF
