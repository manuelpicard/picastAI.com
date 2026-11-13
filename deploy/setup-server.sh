#!/usr/bin/env bash
# Richtet den Kunibert-Server auf einem frischen Debian 12 / Ubuntu 24.04 ein.
# Macht die Schritte 5, 6 und 8 aus deploy/EINRICHTUNG.md ("Nach der Bestellung")
# und bereitet Schritt 7 vor. Mehrfach ausführbar: Vorhandenes bleibt, wie es ist.
#
#   sudo bash setup-server.sh --hostname kunibert.example
#
# Das Repo ist privat. Deshalb zuerst nur diese eine Datei auf den Server kopieren
# (von deinem Rechner: scp deploy/setup-server.sh root@<IP>:), dann starten. Beim
# ersten Lauf zeigt das Skript einen Deploy-Key; den trägst du bei GitHub ein und
# startest das Skript noch einmal.
#
# Was das Skript NICHT tut (Absicht):
#   - Es kennt und setzt keinen ANTHROPIC_API_KEY. Den trägst du selbst ein:
#       sudoedit /etc/kunibert/kunibert.env
#   - Es gibt keine Tokens auf dem Bildschirm aus. Admin- und Geräte-Token werden
#     erzeugt und nur in /etc/kunibert/kunibert.env geschrieben (Rechte 600).
#   - Es bestellt nichts und ändert kein DNS und keine Hetzner-Firewall.
#
# Stand: auf keinem echten Server ausgeführt. Geprüft: bash -n, shellcheck und die
# Hilfsfunktionen mit deploy/setup-server.test.sh.
set -euo pipefail

APP_DIR=/opt/kunibert/app
ENV_FILE=/etc/kunibert/kunibert.env
REPO_SSH=git@github.com:manuelpicard/picastAI.com.git
DEPLOY_KEY=/root/.ssh/kunibert_deploy
# Feste Version statt latest-cpu, damit ein neuer Server dieselbe Version bekommt wie die Tests.
# Am 12.11.2026 in der Registry geprüft: latest-cpu und 0.8.3-cpu haben dieselbe Kennung
# (sha256:21e3df06d842…); neuere Tags (0.9.0-rc.1 bis rc.3) sind nur Vorabversionen.
# Eine andere Version: --speaches-image ghcr.io/speaches-ai/speaches:<Version>-cpu
SPEACHES_IMAGE=ghcr.io/speaches-ai/speaches:0.8.3-cpu
SPEACHES_URL=http://127.0.0.1:8000

HOSTNAME_ARG=""
GIT_REF=main
STT_MODEL=Systran/faster-whisper-small
TTS_MODEL=speaches-ai/piper-de_DE-thorsten-medium
TTS_VOICE=thorsten
SKIP_SPEACHES=0
SKIP_CADDY=0

say()  { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Aufruf: sudo bash deploy/setup-server.sh --hostname <name> [Optionen]

  --hostname <name>   Öffentlicher Hostname, z. B. kunibert.example (Pflicht)
  --ref <ref>         Git-Stand (Standard: main)
  --stt-model <name>  Erkennungsmodell (Standard: Systran/faster-whisper-small)
  --tts-model <name>  Stimmenmodell (Standard: speaches-ai/piper-de_DE-thorsten-medium)
  --tts-voice <name>  Stimme (Standard: thorsten)
  --speaches-image <name>  Image des Sprachservers (Standard: ghcr.io/speaches-ai/speaches:0.8.3-cpu)
  --skip-speaches     Sprachserver nicht einrichten
  --skip-caddy        Caddy nicht einrichten
  -h, --help          Diese Hilfe
EOF
}

# --- Hilfsfunktionen (in setup-server.test.sh getestet) ----------------------

# Prüft einen Hostnamen: nur Buchstaben, Ziffern, Punkt, Bindestrich; mit Punkt.
valid_hostname() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] && [[ "$1" == *.* ]] && [[ "$1" != *..* ]]
}

# Liest den Wert eines Schlüssels aus einer env-Datei (leer, wenn nicht gesetzt).
env_get() { # Datei Schlüssel
  local line
  line=$(grep -E "^$2=" "$1" | tail -n 1 || true)
  printf '%s' "${line#*=}"
}

# Setzt KEY=VALUE in einer env-Datei. Ersetzt die erste Zeile "KEY=...", sonst hängt es an.
# Der Wert läuft nicht durch sed-Ersetzung (keine Probleme mit / & \).
env_set() { # Datei Schlüssel Wert
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  KEY="$key" VALUE="$value" awk '
    BEGIN { done = 0; key = ENVIRON["KEY"]; value = ENVIRON["VALUE"] }
    !done && index($0, key "=") == 1 { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$file" > "$tmp"
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  chown --reference="$file" "$tmp" 2>/dev/null || true
  mv "$tmp" "$file"
}

# Setzt KEY nur, wenn er fehlt oder leer ist. Rückgabe 0 = gesetzt, 1 = war schon da.
env_set_if_empty() { # Datei Schlüssel Wert
  if [[ -z "$(env_get "$1" "$2")" ]]; then env_set "$1" "$2" "$3"; return 0; fi
  return 1
}

# Schaltet die täglichen automatischen Updates von apt ein (wie dpkg-reconfigure unattended-upgrades).
write_auto_upgrades() { # Datei
  printf '%s\n' 'APT::Periodic::Update-Package-Lists "1";' 'APT::Periodic::Unattended-Upgrade "1";' > "$1"
}

# Schreibt das Caddyfile mit dem echten Hostnamen (Vorlage: deploy/Caddyfile).
render_caddyfile() { # Vorlage Hostname
  sed "s/kunibert\.example/$2/g" "$1"
}

# --- Schritte -----------------------------------------------------------------

install_packages() {
  say "Pakete: git, curl, openssl, Docker, Node.js 22, Caddy"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

  if ! command -v docker >/dev/null; then
    apt-get install -y -qq docker.io >/dev/null
  fi
  note "Docker: $(docker --version 2>/dev/null || echo fehlt)"

  # Sicherheitsupdates des Betriebssystems automatisch einspielen (Debian und Ubuntu:
  # Paket unattended-upgrades, Standard nur Sicherheitsquellen; kein automatischer Neustart).
  apt-get install -y -qq unattended-upgrades >/dev/null
  write_auto_upgrades /etc/apt/apt.conf.d/20auto-upgrades
  note "Automatische Sicherheitsupdates: an"

  local node_major=0
  if command -v node >/dev/null; then node_major=$(node -p 'process.versions.node.split(".")[0]'); fi
  if [[ "$node_major" != 22 ]]; then
    # Paketquelle von NodeSource, wie auf nodejs.org für Debian/Ubuntu beschrieben.
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  note "Node.js: $(node --version)"

  if [[ "$SKIP_CADDY" == 0 ]] && ! command -v caddy >/dev/null; then
    # Offizielle Paketquelle: https://caddyserver.com/docs/install#debian-ubuntu-raspbian
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  if [[ "$SKIP_CADDY" == 0 ]]; then note "Caddy: $(caddy version | cut -d' ' -f1)"; fi
}

create_user_and_dirs() {
  say "Benutzer und Ordner"
  id kunibert >/dev/null 2>&1 || useradd --system --home-dir /var/lib/kunibert --shell /usr/sbin/nologin kunibert
  install -d -o root -g root -m 755 /opt/kunibert
  install -d -o root -g root -m 700 /etc/kunibert
}

fetch_code() {
  say "Code holen ($GIT_REF)"
  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" fetch --quiet origin
    git -C "$APP_DIR" checkout --quiet "$GIT_REF"
    git -C "$APP_DIR" merge --quiet --ff-only "origin/$GIT_REF" 2>/dev/null || true
  else
    if [[ ! -f "$DEPLOY_KEY" ]]; then
      install -d -m 700 /root/.ssh
      ssh-keygen -q -t ed25519 -N '' -C "kunibert-server-deploy" -f "$DEPLOY_KEY"
    fi
    ssh-keyscan -t ed25519 github.com 2>/dev/null >> /root/.ssh/known_hosts
    sort -u -o /root/.ssh/known_hosts /root/.ssh/known_hosts
    if ! GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes" git clone --quiet "$REPO_SSH" "$APP_DIR" 2>/dev/null; then
      cat <<EOF

Das Repo ist privat. Trage diesen öffentlichen Schlüssel als Deploy-Key ein
(GitHub: Repo → Settings → Deploy keys → Add deploy key, OHNE Schreibrecht):

$(cat "$DEPLOY_KEY.pub")

Danach dieses Skript noch einmal genau so starten.
EOF
      exit 2
    fi
    git -C "$APP_DIR" config core.sshCommand "ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes"
    git -C "$APP_DIR" checkout --quiet "$GIT_REF"
  fi
  note "Stand: $(git -C "$APP_DIR" log --oneline -1)"
  say "Abhängigkeiten und Build (dauert ein paar Minuten)"
  (cd "$APP_DIR" && npm ci --silent && npm run build --silent)
}

write_env() {
  say "Konfiguration: $ENV_FILE"
  if [[ ! -f "$ENV_FILE" ]]; then
    install -o root -g root -m 600 "$APP_DIR/deploy/kunibert.env.example" "$ENV_FILE"
    note "aus der Vorlage angelegt"
  fi
  env_set "$ENV_FILE" NODE_ENV production
  env_set "$ENV_FILE" HOST 127.0.0.1
  env_set "$ENV_FILE" PICASTAI_PUBLIC_BASE_URL "https://$HOSTNAME_ARG"
  env_set "$ENV_FILE" PICASTAI_STT_MODEL "$STT_MODEL"
  env_set "$ENV_FILE" PICASTAI_TTS_MODEL "$TTS_MODEL"
  env_set "$ENV_FILE" PICASTAI_TTS_VOICE "$TTS_VOICE"
  if env_set_if_empty "$ENV_FILE" PICASTAI_ADMIN_TOKEN "$(openssl rand -hex 32)"; then note "Admin-Token erzeugt (steht nur in der Datei)"; fi
  if env_set_if_empty "$ENV_FILE" PICASTAI_DEVICE_TOKEN "$(openssl rand -hex 32)"; then note "Geräte-Token erzeugt (steht nur in der Datei)"; fi
  chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
}

setup_speaches() {
  say "Sprachserver (Speaches, nur lokal auf Port 8000)"
  if ! docker ps -a --format '{{.Names}}' | grep -qx speaches; then
    docker run --detach --name speaches --restart unless-stopped \
      --publish 127.0.0.1:8000:8000 \
      --volume hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
      "$SPEACHES_IMAGE" >/dev/null
  else
    docker start speaches >/dev/null
  fi
  note "warte auf den Sprachserver"
  local i
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "$SPEACHES_URL/v1/models" 2>/dev/null; then break; fi
    [[ $i == 90 ]] && die "Sprachserver antwortet nicht: docker logs speaches"
    sleep 2
  done
  local model
  for model in "$STT_MODEL" "$TTS_MODEL"; do
    note "lade Modell $model (kann einige Minuten dauern)"
    curl -fsS -X POST "$SPEACHES_URL/v1/models/$model" >/dev/null || die "Modell $model ließ sich nicht laden"
  done
  # Welche Version genau läuft (für ein späteres festes Image mit --speaches-image).
  SPEACHES_DIGEST=$(docker inspect --format '{{.Image}}' speaches 2>/dev/null || true)
  note "Sprachserver-Image: $SPEACHES_IMAGE (${SPEACHES_DIGEST:-Kennung unbekannt})"
}

start_service() {
  say "Dienst kunibert-server"
  install -o root -g root -m 644 "$APP_DIR/deploy/kunibert-server.service" /etc/systemd/system/kunibert-server.service
  systemctl daemon-reload
  systemctl enable --quiet kunibert-server
  systemctl restart kunibert-server
  local i
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/health 2>/dev/null; then note "/health antwortet"; return 0; fi
    sleep 1
  done
  die "Der Dienst antwortet nicht: sudo journalctl -u kunibert-server -n 100 --no-pager"
}

setup_caddy() {
  say "Caddy für $HOSTNAME_ARG"
  render_caddyfile "$APP_DIR/deploy/Caddyfile" "$HOSTNAME_ARG" > /etc/caddy/Caddyfile.neu
  caddy validate --config /etc/caddy/Caddyfile.neu --adapter caddyfile >/dev/null 2>&1 || die "Caddyfile ungültig: /etc/caddy/Caddyfile.neu"
  mv /etc/caddy/Caddyfile.neu /etc/caddy/Caddyfile

  # Ohne passenden DNS-Eintrag scheitert das Zertifikat; wiederholte Fehlversuche
  # laufen bei Let's Encrypt in Sperren. Deshalb erst prüfen, dann neu laden.
  local own_ip dns_ip
  # Eigene öffentliche IPv4 ohne fremden Dienst: die Absenderadresse der Standardroute.
  own_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
  dns_ip=$(getent ahostsv4 "$HOSTNAME_ARG" 2>/dev/null | awk 'NR==1 {print $1}' || true)
  if [[ -n "$own_ip" && "$own_ip" == "$dns_ip" ]]; then
    systemctl reload caddy || systemctl restart caddy
    note "DNS passt ($dns_ip). Caddy neu geladen; das Zertifikat kommt beim ersten Aufruf."
    CADDY_LIVE=1
  else
    systemctl stop caddy 2>/dev/null || true
    note "DNS passt noch nicht: $HOSTNAME_ARG zeigt auf '${dns_ip:-nichts}', dieser Server hat '${own_ip:-unbekannt}'."
    note "Caddy ist gestoppt. A-Eintrag setzen, warten, dann: sudo systemctl start caddy"
    CADDY_LIVE=0
  fi
}

summary() {
  say "Fertig. Was jetzt noch DU tust"
  if [[ -z "$(env_get "$ENV_FILE" ANTHROPIC_API_KEY)" ]]; then
    note "1. Schlüssel eintragen (nur hier, nie in Chat oder Git):"
    note "     sudoedit $ENV_FILE        # Zeile ANTHROPIC_API_KEY="
    note "     sudo systemctl restart kunibert-server"
    note "   Ohne Schlüssel antwortet Kunibert nur mit festen Ersatztexten."
  else
    note "1. ANTHROPIC_API_KEY ist gesetzt."
  fi
  note "2. Geräte-Token für Pi und Prüfskript in den Passwortmanager übernehmen:"
  note "     sudo grep ^PICASTAI_DEVICE_TOKEN= $ENV_FILE"
  if [[ "${CADDY_LIVE:-0}" == 0 && "$SKIP_CADDY" == 0 ]]; then
    note "3. DNS: A-Eintrag für $HOSTNAME_ARG setzen, dann: sudo systemctl start caddy"
  fi
  note "Danach von deinem Rechner: deploy/smoke-test.sh (EINRICHTUNG.md, Abschnitt 7)."
  note "Zeiten je Anfrage: sudo journalctl -u kunibert-server -n 200 --no-pager | grep Zeitmessung"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hostname) HOSTNAME_ARG=${2:-}; shift 2 ;;
      --ref) GIT_REF=${2:-}; shift 2 ;;
      --stt-model) STT_MODEL=${2:-}; shift 2 ;;
      --tts-model) TTS_MODEL=${2:-}; shift 2 ;;
      --tts-voice) TTS_VOICE=${2:-}; shift 2 ;;
      --speaches-image) SPEACHES_IMAGE=${2:-}; shift 2 ;;
      --skip-speaches) SKIP_SPEACHES=1; shift ;;
      --skip-caddy) SKIP_CADDY=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "Unbekannte Option: $1" ;;
    esac
  done
  [[ -n "$HOSTNAME_ARG" ]] || { usage >&2; die "--hostname fehlt"; }
  valid_hostname "$HOSTNAME_ARG" || die "Kein gültiger Hostname: $HOSTNAME_ARG"
  [[ $EUID -eq 0 ]] || die "Bitte mit sudo starten."
  command -v apt-get >/dev/null || die "Nur für Debian/Ubuntu (apt-get fehlt)."

  install_packages
  create_user_and_dirs
  fetch_code
  write_env
  if [[ "$SKIP_SPEACHES" == 0 ]]; then setup_speaches; fi
  start_service
  if [[ "$SKIP_CADDY" == 0 ]]; then setup_caddy; fi
  summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
