#!/usr/bin/env bash
# Install Ritter Kunibert Pi client on a fresh Raspberry Pi OS installation.
# Target: Raspberry Pi OS Lite on a Raspberry Pi 5 (prototype, USB audio; the final
# device is planned as ESP32-S3). Not yet run on real Pi hardware.
# Run as root: sudo bash pi-client/install_raspberry_pi.sh (fragt das Geräte-Token verdeckt ab).
# Verhaltenstest im Debian-Container: pi-client/install_raspberry_pi.test.sh (CI-Job pi-installer).

set -Eeuo pipefail
IFS=$'\n\t'

APP_USER="kunibert"
APP_GROUP="audio"
# Eigene Gruppe des Dienstkontos: Nur sie (und root) darf kunibert.env mit dem Token lesen.
CONFIG_GROUP="kunibert"
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
TOKEN_FILE=""
ASK_TOKEN="0"
DEVICE_NAME="picastAI Raspberry Pi"
AUDIO_CARD=""
CAPTURE_DEVICE=""
PLAYBACK_DEVICE=""
SAMPLE_RATE="16000"
DRY_RUN="0"
NON_INTERACTIVE="0"
# Schlüssel in kunibert.env, deren Wert beim Aufruf angegeben wurde. Alle anderen Werte übernimmt
# ein neuer Lauf aus der vorhandenen Datei (siehe merge_config).
declare -A GIVEN=()
# Werte, die der Installer immer selbst setzt, auch wenn kunibert.env etwas anderes enthält:
# die Zeitkette (Server 120 s, Caddy 130 s, Gerät 140 s) und die Ordner, die zur Dienstdatei passen
# müssen (ReadWritePaths). Alle anderen Werte darf man mit sudoedit dauerhaft ändern.
FORCED_KEYS=(KUNIBERT_PIPELINE_TIMEOUT KUNIBERT_CACHE_DIR KUNIBERT_ANNOUNCEMENTS_DIR)
# Zeichen, die in einem Geräte-Token vorkommen dürfen (hex, Base64, Base64url).
TOKEN_PATTERN='^[A-Za-z0-9._~+/=:-]+$'
TMP_FILES=()
trap 'rm -f -- "${TMP_FILES[@]}"' EXIT

log() { printf '[kunibert-install] %s\n' "$*"; }
warn() { printf '[kunibert-install] WARNUNG: %s\n' "$*" >&2; }
die() { printf '[kunibert-install] FEHLER: %s\n' "$*" >&2; exit 1; }
# Wert für die systemd-EnvironmentFile in Anführungszeichen (Leerzeichen bleiben erhalten).
env_quote() { local v="$1"; v="${v//\\/\\\\}"; v="${v//\"/\\\"}"; printf '"%s"' "$v"; }
# Leerzeichen am Anfang und Ende entfernen (kopierte Tokens).
trim() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"; printf '%s' "$v"; }
# 0, wenn die vorhandene kunibert.env ein nicht leeres Token enthält. Gibt den Wert nie aus.
existing_token_set() {
  [[ -f "$CONFIG_FILE" ]] || return 1
  local line value
  line="$(grep -E '^[[:space:]]*PICASTAI_DEVICE_TOKEN=' "$CONFIG_FILE" | tail -n 1)" || return 1
  value="${line#*PICASTAI_DEVICE_TOKEN=}"
  value="${value//\"/}"; value="${value//\'/}"; value="${value//[[:space:]]/}"
  [[ -n "$value" ]]
}
# Führt die neue Vorlage ($1) mit der vorhandenen kunibert.env ($2) zusammen und schreibt das
# Ergebnis auf stdout. Werte, die beim Aufruf nicht angegeben wurden, bleiben wie in der
# vorhandenen Datei (auch das Token und Änderungen mit sudoedit); Ausnahme: FORCED_KEYS.
# Schlüssel, die nur in der vorhandenen Datei stehen (von Hand ergänzt), kommen ans Ende.
# Kommentare kommen aus der Vorlage. Windows-Zeilenenden und Einrückung vor einem Schlüssel
# fallen weg. Namen behaltener Schlüssel, die von der Vorlage abweichen, schreibt awk nach $3,
# Namen fester Schlüssel, die zurückgesetzt werden, nach $4 (nur Namen, nie Werte).
merge_config() {
  local given=" " forced=" " key
  for key in "${!GIVEN[@]}"; do given+="$key "; done
  for key in "${FORCED_KEYS[@]}"; do forced+="$key "; done
  awk -v oldfile="$2" -v given="$given" -v forced="$forced" -v keptfile="$3" -v resetfile="$4" '
    function is_key(l) { return l ~ /^[A-Za-z_][A-Za-z0-9_]*=/ }
    function key_of(l) { return substr(l, 1, index(l, "=") - 1) }
    BEGIN {
      while ((getline line < oldfile) > 0) {
        sub(/\r$/, "", line)
        stripped = line
        sub(/^[[:space:]]+/, "", stripped)
        if (is_key(stripped)) {
          k = key_of(stripped)
          if (!(k in old)) order[++n] = k
          old[k] = stripped
        } else if (stripped !~ /^(#|$)/) {
          other[++m] = line
        }
      }
      close(oldfile)
    }
    {
      if (is_key($0)) {
        k = key_of($0)
        seen[k] = 1
        if (k in old) {
          if (index(forced, " " k " ") > 0) {
            if (old[k] != $0) print k > resetfile
          } else if (index(given, " " k " ") == 0) {
            if (old[k] != $0) print k > keptfile
            print old[k]
            next
          }
        }
      }
      print
    }
    END {
      header = 0
      for (i = 1; i <= n; i++) {
        if (order[i] in seen) continue
        if (!header++) print "# Von Hand ergänzt (ein neuer Lauf des Installers behält diese Zeilen):"
        print old[order[i]]
      }
      for (i = 1; i <= m; i++) {
        if (!header++) print "# Von Hand ergänzt (ein neuer Lauf des Installers behält diese Zeilen):"
        print other[i]
      }
    }
  ' "$1"
}

# Prüfungen mit Zeichenbereichen laufen in einer Unterschale mit LC_ALL=C: In einer deutschen
# Sprachumgebung (de_DE.UTF-8, unter sudo meist übernommen) trifft [A-Za-z] in bash auch ä, Ä, é
# und ß (am 26.11.2026 in Debian 13 nachgeprüft). Der Pi-Client (Python) lässt sie nie zu.
# Geräte-Token: dieselben Zeichen wie TOKEN_PATTERN im Pi-Client.
valid_token() ( LC_ALL=C; [[ "$1" =~ $TOKEN_PATTERN ]] )
# Geräte-ID: dieselben Zeichen wie beim Server (server-api/devices.ts). Der Pi-Client lässt bisher
# mehr zu; $, `, ", \ und ' könnte die Shell beim Handstart (set -a; . kunibert.env) aber ausführen.
valid_device_id() ( LC_ALL=C; [[ "$1" =~ ^[A-Za-z0-9_-]{1,80}$ ]] )
DEVICE_ID_RULE="nur Buchstaben A bis Z und a bis z, Ziffern, - und _, höchstens 80 Zeichen (wie beim Server)"
# Adresse wie _origin im Pi-Client: http:// oder https:// (groß oder klein), ein Rechnername oder
# eine IPv6-Adresse in [], kein Name und Passwort, Port nur aus Ziffern bis 65535. Strenger als der
# Client: keine Leerzeichen, keine Zeichen, die die Shell beim Einlesen deutet ($, `, ", \, '), kein
# ? oder # (die Basis-Adresse bekommt noch Pfade angehängt) und im Rechnernamen nur Buchstaben,
# Ziffern, Punkt, - und _.
URL_PATTERN='^[Hh][Tt][Tt][Pp][Ss]?://(\[[0-9A-Fa-f:.]+]|[A-Za-z0-9._-]+)(:([0-9]{0,5}))?(/[A-Za-z0-9._~%!&()*+,;=:@/-]*)?$'
valid_api_url() (
  LC_ALL=C
  [[ "$1" =~ $URL_PATTERN ]] || exit 1
  [[ -z "${BASH_REMATCH[3]}" ]] || (( 10#${BASH_REMATCH[3]} <= 65535 ))
)
# shellcheck disable=SC2016  # Die Zeichen $ und ` sind hier gemeint, nicht ausgewertet.
API_URL_RULE='http:// oder https:// und ein Rechnername, ohne Name und Passwort, Port nur aus Ziffern; keine Leerzeichen, keine Anführungszeichen, keines der Zeichen $ ` \ ? #'
# Wert eines Schlüssels in der vorhandenen kunibert.env auf stdout (die letzte Zeile gilt, wie bei
# systemd), ohne Leerzeichen am Rand und ohne ein Paar Anführungszeichen außen. Rückgabe 1, wenn
# Datei oder Schlüssel fehlen. Nur für Prüfungen in eine Variable lesen, nie ausgeben: Eine Adresse
# kann Zugangsdaten enthalten.
existing_value() {
  [[ -f "$CONFIG_FILE" ]] || return 1
  local line value
  line="$(grep -E "^[[:space:]]*$1[[:blank:]]*=" "$CONFIG_FILE" | tail -n 1)" || return 1
  value="$(trim "${line#*=}")"
  if [[ ${#value} -ge 2 && ( "$value" == \"*\" || "$value" == \'*\' ) ]]; then
    value="$(trim "${value:1:${#value}-2}")"
  fi
  printf '%s' "$value"
}

usage() {
  cat <<'EOF'
Installiert den Ritter-Kunibert-Raspberry-Pi-Client auf Raspberry Pi OS.

Aufruf:
  sudo bash pi-client/install_raspberry_pi.sh [Optionen]

Optionen:
  --source-dir DIR       Repository-/Installationsquelle (Standard: automatisch)
  --api-url URL          picastAI-API-Basis-URL (http:// oder https://, ohne Name
                         und Passwort)
  --device-id ID         Geräte-ID (Buchstaben A-Z und a-z, Ziffern, - und _;
                         höchstens 80 Zeichen, wie beim Server)
  --api-token-file DATEI Geräte-Token aus einer Datei (erste Zeile), zum Beispiel für
                         Skripte mit --non-interactive. Ohne diese Option fragt der
                         Installer verdeckt nach dem Token. Das Token gibt es bewusst
                         nicht als Option: Es stünde sonst in der Prozessliste und im
                         Shell-Verlauf.
  --ask-token            Token verdeckt neu abfragen, auch wenn schon eines gespeichert ist
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
  sudo bash pi-client/install_raspberry_pi.sh --device-id prototype-001

  sudo bash pi-client/install_raspberry_pi.sh \
    --api-url http://192.168.1.20:3000 \
    --device-id prototype-001 \
    --audio-card hw:wm8960soundcard,0

  sudo bash pi-client/install_raspberry_pi.sh --non-interactive \
    --device-id prototype-001 --api-token-file /root/kunibert-token

Zweiter Lauf:
  Werte, die beim Aufruf fehlen, übernimmt der Installer aus der vorhandenen
  /etc/kunibert/kunibert.env: Adresse, Geräte-ID, Token, Name, Abtastrate,
  Mikrofon, Lautsprecher und von Hand (sudoedit) geänderte oder ergänzte Zeilen.
  Kommentare übernimmt er nicht. Immer neu setzt er KUNIBERT_PIPELINE_TIMEOUT
  (Zeitkette), KUNIBERT_CACHE_DIR und KUNIBERT_ANNOUNCEMENTS_DIR (passen zur
  Dienstdatei). Mit denselben Angaben ändert ein zweiter Lauf an Datei, Dienst,
  Rechten und Besitzern nichts.

Rechte:
  /etc/kunibert (0750) und kunibert.env (0640) gehören root, Gruppe kunibert.
  Das Token lesen nur root und das Dienstkonto kunibert.

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
    --api-url) [[ $# -ge 2 ]] || die "--api-url benötigt einen Wert"; API_BASE_URL="${2%/}"; GIVEN[PICASTAI_API_BASE_URL]=1; shift 2 ;;
    --device-id) [[ $# -ge 2 ]] || die "--device-id benötigt einen Wert"; DEVICE_ID="$2"; GIVEN[PICASTAI_DEVICE_ID]=1; shift 2 ;;
    # Den Wert nie ausgeben: Er wäre das Token.
    --api-token|--api-token=*) die "--api-token gibt es nicht mehr: Das Token stünde sonst in der Prozessliste und im Shell-Verlauf. Ohne Option fragt der Installer verdeckt nach dem Token; für Skripte: --api-token-file DATEI." ;;
    --api-token-file)
      [[ $# -ge 2 ]] || die "--api-token-file benötigt einen Wert"
      [[ -n "$2" ]] || die "--api-token-file: leerer Dateiname (leere Variable beim Aufruf?)."
      TOKEN_FILE="$2"; shift 2 ;;
    --ask-token) ASK_TOKEN="1"; shift ;;
    --device-name) [[ $# -ge 2 ]] || die "--device-name benötigt einen Wert"; DEVICE_NAME="$2"; GIVEN[PICASTAI_DEVICE_NAME]=1; shift 2 ;;
    --audio-card) [[ $# -ge 2 ]] || die "--audio-card benötigt einen Wert"; AUDIO_CARD="$2"; shift 2 ;;
    --capture-device) [[ $# -ge 2 ]] || die "--capture-device benötigt einen Wert"; CAPTURE_DEVICE="$2"; GIVEN[KUNIBERT_INPUT_DEVICE]=1; shift 2 ;;
    --playback-device) [[ $# -ge 2 ]] || die "--playback-device benötigt einen Wert"; PLAYBACK_DEVICE="$2"; GIVEN[KUNIBERT_OUTPUT_DEVICE]=1; shift 2 ;;
    --sample-rate) [[ $# -ge 2 ]] || die "--sample-rate benötigt einen Wert"; SAMPLE_RATE="$2"; GIVEN[KUNIBERT_SAMPLE_RATE]=1; shift 2 ;;
    --non-interactive) NON_INTERACTIVE="1"; shift ;;
    --dry-run) DRY_RUN="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    # Nur der Teil vor „=“: Ein vertippter Name mit Wert könnte ein Token enthalten.
    -*) die "Unbekannte Option: ${1%%=*}" ;;
    # Ein Wert ohne Option ist oft ein Token an der falschen Stelle: nie ausgeben.
    *) die "Unerwartetes Argument (Wert nicht angezeigt). Das Token gibt es nur über die verdeckte Abfrage oder --api-token-file." ;;
  esac
done

for _dev in "$CAPTURE_DEVICE" "$PLAYBACK_DEVICE" "$API_BASE_URL" "$DEVICE_ID" "$DEVICE_TOKEN" "$DEVICE_NAME"; do
  [[ "$_dev" != *$'\n'* ]] || die "Werte für die Konfiguration dürfen keinen Zeilenumbruch enthalten."
done
# Geräte-ID und Adresse prüfen, bevor sich etwas ändert. Leerzeichen am Rand fallen weg (wie im
# Pi-Client). Die Meldungen nennen den Wert nie (eine Adresse kann Zugangsdaten enthalten).
DEVICE_ID="$(trim "$DEVICE_ID")"
API_BASE_URL="$(trim "$API_BASE_URL")"
API_BASE_URL="${API_BASE_URL%/}"
valid_device_id "$DEVICE_ID" || die "--device-id: Die Geräte-ID passt nicht. Erlaubt: $DEVICE_ID_RULE. Wert nicht angezeigt."
valid_api_url "$API_BASE_URL" || die "--api-url: keine gültige Adresse. Erwartet: $API_URL_RULE. Wert nicht angezeigt."

[[ "${EUID}" -eq 0 ]] || die "Bitte mit sudo oder als root ausführen."
command -v apt-get >/dev/null || die "apt-get wurde nicht gefunden; dieses Skript erwartet Raspberry Pi OS."
command -v systemctl >/dev/null || die "systemctl wurde nicht gefunden; dieses Skript erwartet systemd."

# Werte, die ein neuer Lauf aus kunibert.env übernimmt, genauso prüfen: Mit einer ungültigen
# Geräte-ID oder Adresse startet der Pi-Client nicht, und systemd startet ihn alle 5 Sekunden neu.
if [[ -z "${GIVEN[PICASTAI_DEVICE_ID]:-}" ]] && STORED_VALUE="$(existing_value PICASTAI_DEVICE_ID)"; then
  valid_device_id "$STORED_VALUE" || die "PICASTAI_DEVICE_ID in $CONFIG_FILE passt nicht. Erlaubt: $DEVICE_ID_RULE. Wert nicht angezeigt. Abhilfe: den Installer mit --device-id aufrufen oder die Zeile mit sudoedit $CONFIG_FILE berichtigen."
fi
if [[ -z "${GIVEN[PICASTAI_API_BASE_URL]:-}" ]] && STORED_VALUE="$(existing_value PICASTAI_API_BASE_URL)"; then
  valid_api_url "${STORED_VALUE%/}" || die "PICASTAI_API_BASE_URL in $CONFIG_FILE ist keine gültige Adresse. Erwartet: $API_URL_RULE. Wert nicht angezeigt. Abhilfe: den Installer mit --api-url aufrufen oder die Zeile mit sudoedit $CONFIG_FILE berichtigen."
fi
unset STORED_VALUE

if [[ -z "$SOURCE_DIR" ]]; then
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  SOURCE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
fi
CLIENT_SOURCE="${SOURCE_DIR}/pi-client/kunibert_client.py"
CLIENT_README="${SOURCE_DIR}/pi-client/README.md"
CLIENT_FEEDBACK="${SOURCE_DIR}/pi-client/rueckmeldung.py"
[[ -f "$CLIENT_SOURCE" ]] || die "Client nicht gefunden: $CLIENT_SOURCE"
[[ -f "$CLIENT_FEEDBACK" ]] || die "Modul für Rückmeldung und Vorstellung nicht gefunden: $CLIENT_FEEDBACK"

# Token: aus --api-token-file, sonst verdeckte Abfrage, sonst das bisherige aus kunibert.env.
if [[ -n "$TOKEN_FILE" ]]; then
  if [[ ! -r "$TOKEN_FILE" || -d "$TOKEN_FILE" ]]; then
    # Kein Pfad: vielleicht das Token selbst an der Stelle des Dateinamens. Dann nicht ausgeben.
    if [[ "$TOKEN_FILE" == */* || -e "$TOKEN_FILE" ]]; then die "Token-Datei nicht lesbar: $TOKEN_FILE"; fi
    die "Token-Datei nicht gefunden (Wert nicht angezeigt, kein Pfad; Token statt Dateiname angegeben?)."
  fi
  if [[ -f "$TOKEN_FILE" ]] && (( 8#$(stat -c %a "$TOKEN_FILE") & 8#077 )); then
    warn "Die Token-Datei können auch andere lesen. Nach der Installation löschen: sudo rm $TOKEN_FILE"
  fi
  IFS= read -r DEVICE_TOKEN < "$TOKEN_FILE" || true
  DEVICE_TOKEN="$(trim "$DEVICE_TOKEN")"
  [[ -n "$DEVICE_TOKEN" ]] || die "Token-Datei ist leer: $TOKEN_FILE"
  TOKEN_STATE="neu (aus Datei)"
fi
OLD_TOKEN="0"
if existing_token_set; then OLD_TOKEN="1"; fi
if [[ -z "$DEVICE_TOKEN" && "$DRY_RUN" != "1" ]] && [[ "$ASK_TOKEN" == "1" || "$OLD_TOKEN" != "1" ]]; then
  if [[ "$NON_INTERACTIVE" != "1" && -t 0 ]]; then
    TOKEN_PROMPT="picastAI-Gerätetoken (Eingabe wird nicht angezeigt): "
    if [[ "$OLD_TOKEN" == "1" ]]; then
      TOKEN_PROMPT="Neues picastAI-Gerätetoken (Eingabe wird nicht angezeigt; leer lassen = bisheriges behalten): "
    fi
    if ! IFS= read -r -s -p "$TOKEN_PROMPT" DEVICE_TOKEN; then
      printf '\n'
      die "Token-Abfrage abgebrochen. Nichts geändert."
    fi
    printf '\n'
    DEVICE_TOKEN="$(trim "$DEVICE_TOKEN")"
    TOKEN_STATE="neu (verdeckt eingegeben)"
  elif [[ "$ASK_TOKEN" == "1" ]]; then
    die "--ask-token braucht eine Eingabe am Terminal (ohne --non-interactive)."
  fi
fi
[[ "$DEVICE_TOKEN" != *$'\n'* ]] || die "Werte für die Konfiguration dürfen keinen Zeilenumbruch enthalten."
if [[ -n "$DEVICE_TOKEN" ]] && ! valid_token "$DEVICE_TOKEN"; then
  die "Das Token enthält Zeichen, die in einem Geräte-Token nicht vorkommen (zum Beispiel Leerzeichen, Anführungszeichen oder das Wort Bearer). Wert nicht angezeigt."
fi
if [[ -n "$DEVICE_TOKEN" ]]; then
  GIVEN[PICASTAI_DEVICE_TOKEN]=1
elif [[ "$OLD_TOKEN" == "1" ]]; then
  TOKEN_STATE="bisheriges bleibt"
  log "Kein neues Token angegeben: Das Token in $CONFIG_FILE bleibt."
else
  TOKEN_STATE="fehlt"
  warn "Kein API-Token gesetzt. Der Dienst wird installiert, kann aber erst nach Token-Konfiguration arbeiten."
fi

if ! [[ "$SAMPLE_RATE" =~ ^[0-9]+$ ]] || (( SAMPLE_RATE < 8000 || SAMPLE_RATE > 96000 )); then
  die "Ungültige Abtastrate: $SAMPLE_RATE"
fi
# Wert für den Probelauf: Fehlt die Angabe und steht der Schlüssel schon in kunibert.env, bleibt er.
shown() {
  if [[ -z "${GIVEN[$1]:-}" && -f "$CONFIG_FILE" ]] && grep -qE "^[[:space:]]*$1=" "$CONFIG_FILE"; then
    printf 'bleibt wie in kunibert.env'
  else
    printf '%s' "$2"
  fi
}
if [[ "$DRY_RUN" == "1" ]]; then
  log "Dry-Run: keine Änderungen werden vorgenommen."
  printf 'Quelle: %s\nZiel: %s\nAPI: %s\nGerät: %s\nToken: %s\nALSA-Karte: %s\nMikrofon: %s\nLautsprecher: %s\n' \
    "$SOURCE_DIR" "$INSTALL_DIR" "$(shown PICASTAI_API_BASE_URL "$API_BASE_URL")" "$(shown PICASTAI_DEVICE_ID "$DEVICE_ID")" \
    "${TOKEN_STATE:-fehlt}" "${AUDIO_CARD:-automatisch}" \
    "$(shown KUNIBERT_INPUT_DEVICE "${CAPTURE_DEVICE:-Standard}")" "$(shown KUNIBERT_OUTPUT_DEVICE "${PLAYBACK_DEVICE:-Standard}")"
  if [[ -f "$CONFIG_FILE" ]]; then
    printf 'Vorhandene Konfiguration: %s (Werte, die beim Aufruf fehlen, bleiben)\n' "$CONFIG_FILE"
  fi
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
if ! getent group "$CONFIG_GROUP" >/dev/null; then
  groupadd --system "$CONFIG_GROUP"
fi
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --gid "$CONFIG_GROUP" --create-home --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
# Ältere Installationen: Dienstkonto ohne eigene Gruppe.
if ! id -nG "$APP_USER" | tr ' ' '\n' | grep -qx "$CONFIG_GROUP"; then
  usermod -a -G "$CONFIG_GROUP" "$APP_USER"
fi
CONFIG_GID="$(getent group "$CONFIG_GROUP" | cut -d: -f3)"
OTHER_MEMBERS="$({ getent group "$CONFIG_GROUP" | cut -d: -f4 | tr ',' '\n'
  awk -F: -v g="$CONFIG_GID" '$4 == g { print $1 }' /etc/passwd; } | grep -vx -e "$APP_USER" -e '' | sort -u | paste -sd, -)" || true
if [[ -n "$OTHER_MEMBERS" ]]; then
  warn "In der Gruppe $CONFIG_GROUP sind außer $APP_USER weitere Konten ($OTHER_MEMBERS). Sie können das Token in $CONFIG_FILE lesen."
fi
usermod -a -G "$APP_GROUP" "$APP_USER" 2>/dev/null || true
# GPIO-Zugriff (Pi 5: /dev/gpiochip*) läuft über die Gruppe gpio, sofern es sie gibt.
if getent group gpio >/dev/null; then
  usermod -a -G gpio "$APP_USER" 2>/dev/null || true
fi
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/audio" "$DATA_DIR/ansagen"
install -d -o root -g "$CONFIG_GROUP" -m 0750 "$CONFIG_DIR"
# Auch einen vorhandenen Ordner angleichen (ältere Fassungen: Gruppe audio).
chown root:"$CONFIG_GROUP" "$CONFIG_DIR"
chmod 0750 "$CONFIG_DIR"

log "Kopiere Client und richte virtuelle Python-Umgebung ein …"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "$INSTALL_DIR/pi-client"
install -o "$APP_USER" -g "$APP_GROUP" -m 0644 "$CLIENT_SOURCE" "$INSTALL_DIR/pi-client/kunibert_client.py"
install -o "$APP_USER" -g "$APP_GROUP" -m 0644 "$CLIENT_FEEDBACK" "$INSTALL_DIR/pi-client/rueckmeldung.py"
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
# Erst in Dateien mit Rechten 0600 im geschützten Ordner, dann in einem Schritt ersetzen:
# Das Token liegt nie in einer Datei, die andere lesen können.
NEW_CONFIG="$(mktemp "${CONFIG_DIR}/.kunibert.env.vorlage.XXXXXX")"
MERGED_CONFIG="$(mktemp "${CONFIG_DIR}/.kunibert.env.neu.XXXXXX")"
KEPT_KEYS="$(mktemp)"
RESET_KEYS="$(mktemp)"
TMP_FILES+=("$NEW_CONFIG" "$MERGED_CONFIG" "$KEPT_KEYS" "$RESET_KEYS")
cat > "$NEW_CONFIG" <<EOF
# /etc/kunibert/kunibert.env – vom Installer erzeugt; Secrets nicht committen.
# Ein neuer Lauf des Installers behält die Werte hier, außer er bekommt sie beim Aufruf neu.
PICASTAI_API_BASE_URL=$(env_quote "$API_BASE_URL")
PICASTAI_DEVICE_ID=$(env_quote "$DEVICE_ID")
PICASTAI_DEVICE_TOKEN=$(env_quote "$DEVICE_TOKEN")
PICASTAI_DEVICE_NAME=$(env_quote "$DEVICE_NAME")
KUNIBERT_SAMPLE_RATE=$(env_quote "$SAMPLE_RATE")
KUNIBERT_CACHE_DIR=$(env_quote "$DATA_DIR/audio")
KUNIBERT_ANNOUNCEMENTS_DIR=$(env_quote "$DATA_DIR/ansagen")
KUNIBERT_MAX_RECORD_SECONDS=15
KUNIBERT_MIN_RECORD_SECONDS=0.35
KUNIBERT_REQUEST_TIMEOUT=30
KUNIBERT_PIPELINE_TIMEOUT=140
KUNIBERT_AUDIO_TIMEOUT=45
KUNIBERT_RETRY_COUNT=1
KUNIBERT_RETRY_BACKOFF=1.5
# Pause zwischen zwei Versuchen, beim Start den Server zu erreichen (Sekunden).
KUNIBERT_CONNECT_RETRY=10
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
if [[ -f "$CONFIG_FILE" ]]; then
  merge_config "$NEW_CONFIG" "$CONFIG_FILE" "$KEPT_KEYS" "$RESET_KEYS" > "$MERGED_CONFIG"
  if [[ -s "$KEPT_KEYS" ]]; then
    log "Aus $CONFIG_FILE behalten: $(paste -sd, "$KEPT_KEYS" | sed 's/,/, /g')"
  fi
  while IFS= read -r key; do
    warn "$key stand in $CONFIG_FILE anders. Der Installer setzt wieder den festen Wert $(grep -E "^${key}=" "$NEW_CONFIG" | cut -d= -f2-) (siehe pi-client/README.md, Abschnitt Ein zweiter Lauf)."
  done < "$RESET_KEYS"
else
  cat "$NEW_CONFIG" > "$MERGED_CONFIG"
fi
if [[ -f "$CONFIG_FILE" ]] && cmp -s "$MERGED_CONFIG" "$CONFIG_FILE"; then
  log "Konfiguration unverändert."
else
  chown root:"$CONFIG_GROUP" "$MERGED_CONFIG"
  chmod 0640 "$MERGED_CONFIG"
  mv -f -- "$MERGED_CONFIG" "$CONFIG_FILE"
fi
rm -f -- "$NEW_CONFIG" "$MERGED_CONFIG" "$KEPT_KEYS" "$RESET_KEYS"
# Auch eine vorhandene Datei angleichen (ältere Fassungen: Gruppe audio).
chown root:"$CONFIG_GROUP" "$CONFIG_FILE"
chmod 0640 "$CONFIG_FILE"

log "Installiere systemd-Service …"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Ritter Kunibert Raspberry-Pi-Client
After=network-online.target sound.target
Wants=network-online.target
# Nie endgültig aufgeben: ein Spielzeug soll nach einem Stromausfall von selbst wieder laufen.
# (Diese Einstellung gehört in [Unit]; in [Service] würde systemd sie ignorieren.)
StartLimitIntervalSec=0

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
"$VENV_DIR/bin/python" -m py_compile "$INSTALL_DIR/pi-client/kunibert_client.py" "$INSTALL_DIR/pi-client/rueckmeldung.py"

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
Ansagen:       $DATA_DIR/ansagen (noch leer: Sprachdateien siehe docs/Ansagen.md)

Nächste Schritte:
  sudo systemctl start kunibert.service
  journalctl -u kunibert.service -f
  sudo systemctl status kunibert.service
  aplay -l
  arecord -l

Für einen lokalen Testdienst kann die Konfiguration angepasst werden
(ein neuer Lauf des Installers behält die Änderungen):
  sudoedit $CONFIG_FILE
  sudo systemctl restart kunibert.service
EOF
