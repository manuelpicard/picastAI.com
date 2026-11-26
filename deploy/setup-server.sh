#!/usr/bin/env bash
# Richtet den Kunibert-Server auf einem frischen Debian 12 / Ubuntu 24.04 ein.
# Macht die Schritte 5, 6 und 8 aus deploy/EINRICHTUNG.md ("Nach der Bestellung")
# und bereitet Schritt 7 vor. Mehrfach ausführbar. Tokens, Schlüssel und ein eigener Wert für den Proxy
# bleiben. Bei jedem Lauf neu setzt es: die Zeilen für Betrieb, Hostname und Sprachmodelle in der env-Datei,
# nach einem erfolgreichen Start der Stimme auch die drei Zeilen für Pocket TTS (nicht mit --skip-pocket),
# und die eigene Datei für die Frist der Protokolle (eigene Werte: EINRICHTUNG.md, Betrieb).
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
#   - Es gibt keine Tokens auf dem Bildschirm aus. Admin- und Geräte-Token und der Schlüssel der
#     Eltern-Steuerung werden erzeugt und nur in /etc/kunibert/kunibert.env geschrieben (Rechte 600).
#   - Es bestellt nichts und ändert kein DNS und keine Hetzner-Firewall.
#
# Stand: auf keinem echten Server ausgeführt. Geprüft: bash -n, shellcheck und die
# Hilfsfunktionen mit deploy/setup-server.test.sh.
set -euo pipefail

APP_DIR=/opt/kunibert/app
ENV_FILE=/etc/kunibert/kunibert.env
# Datei der Eltern-Steuerung (Punkt E2). Muss im StateDirectory des Dienstes liegen (deploy/kunibert-server.service).
ELTERN_DATEI=/var/lib/kunibert/eltern.json
REPO_SSH=git@github.com:manuelpicard/picastAI.com.git
DEPLOY_KEY=/root/.ssh/kunibert_deploy
# Feste Version statt latest-cpu, damit ein neuer Server dieselbe Version bekommt wie die Tests.
# Am 12.11.2026 in der Registry geprüft: latest-cpu und 0.8.3-cpu haben dieselbe Kennung
# (sha256:21e3df06d842…); neuere Tags (0.9.0-rc.1 bis rc.3) sind nur Vorabversionen.
# Eine andere Version: --speaches-image ghcr.io/speaches-ai/speaches:<Version>-cpu
SPEACHES_IMAGE=ghcr.io/speaches-ai/speaches:0.8.3-cpu
SPEACHES_URL=http://127.0.0.1:8000

# Kuniberts Stimme (Pocket TTS von Kyutai, Stimme stuart_bell, seit 13.11.2026; Punkt N1124-1153-a).
# Eigener Dienst deploy/kunibert-tts.service mit eigenem Konto. Feste Version wie in deploy/CHECKLISTE.md, Teil A1.
POCKET_VERSION=4.0.1
POCKET_DIR=/opt/kunibert/pocket-tts            # Python-Umgebung; gehört root, der Dienst kann sie nicht ändern
POCKET_USER=kunibert-tts                        # wie User= in deploy/kunibert-tts.service
POCKET_SERVICE=kunibert-tts
POCKET_UNIT=/etc/systemd/system/kunibert-tts.service
POCKET_URL=http://127.0.0.1:8001                # wie --host und --port in deploy/kunibert-tts.service
POCKET_VOICE=stuart_bell                        # wie --default-voice in deploy/kunibert-tts.service
# PyTorch ohne Grafikkarte, aus der Paketquelle von pytorch.org (Seite „Get Started“, „CPU“). Von PyPI käme
# unter Linux auf x86 die Ausgabe mit CUDA (nach Einschätzung mehrere GB, nicht gemessen).
TORCH_INDEX=https://download.pytorch.org/whl/cpu
POCKET_WAIT_TRIES=120                           # je 5 Sekunden: höchstens 10 Minuten (erster Start lädt das Modell)

# Frist für Protokolle (vorläufig 14 Tage, Punkt E1 der Arbeitsliste; Einschätzung, keine
# Rechtsberatung). Sie gilt für das ganze Journal dieses Servers. Damit sie auch für den
# Sprachserver gilt, schreibt sein Container ins Journal statt in eine eigene Docker-Datei.
# Ist rsyslog installiert, bleiben Server, Sprachserver und Caddy aus /var/log/syslog heraus.
JOURNAL_RETENTION=14day
JOURNAL_RETENTION_TEXT="14 Tage"
JOURNALD_DROPIN=/etc/systemd/journald.conf.d/50-kunibert-frist.conf
RSYSLOG_FILTER=/etc/rsyslog.d/10-kunibert.conf
SERVER_LOG_ID=kunibert-server          # wie SyslogIdentifier= in deploy/kunibert-server.service
SPEACHES_LOG_ID=speaches
CADDY_LOG_ID=caddy                     # Kennung des Dienstes caddy.service (Name des Programms)
SPEACHES_LOG_OPTS=(--log-driver journald --log-opt "tag=$SPEACHES_LOG_ID")

HOSTNAME_ARG=""
GIT_REF=main
STT_MODEL=Systran/faster-whisper-small
TTS_MODEL=speaches-ai/piper-de_DE-thorsten-medium
TTS_VOICE=thorsten
SKIP_SPEACHES=0
SKIP_POCKET=0
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
  --skip-pocket       Kuniberts Stimme (Pocket TTS) nicht einrichten. Dann setzt das Skript
                      PICASTAI_TTS_PROVIDER, PICASTAI_POCKET_TTS_URL und PICASTAI_POCKET_TTS_VOICE
                      nicht; so bleibt eine eigene Wahl (zum Beispiel Google) erhalten. Ohne die
                      Option stellt jeder Lauf diese drei Zeilen auf Pocket TTS
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

# Frist für das Journal. journald löscht nur ganze Dateien; mit MaxFileSec=1day beginnt
# jeden Tag eine neue Datei, so weicht die Frist höchstens etwa einen Tag ab.
write_journald_retention() { # Datei
  printf '%s\n' \
    '# Ritter Kunibert (deploy/setup-server.sh): Frist für alle Einträge im Journal dieses Servers.' \
    '# Vorläufig 14 Tage (Punkt E1). journald löscht nur ganze Dateien, deshalb jeden Tag eine neue.' \
    '[Journal]' \
    "MaxRetentionSec=$JOURNAL_RETENTION" \
    'MaxFileSec=1day' > "$1"
}

# Regel für rsyslog: Zeilen von Server, Sprachserver und Caddy nicht zusätzlich in /var/log/syslog
# (dort gelten die Fristen von logrotate, nicht die des Journals).
write_rsyslog_filter() { # Datei
  printf '%s\n' \
    '# Ritter Kunibert (deploy/setup-server.sh): Server, Sprachserver und Caddy nur ins Journal, dort gilt die Frist.' \
    "if \$programname == '$SERVER_LOG_ID' or \$programname == '$SPEACHES_LOG_ID' or \$programname == '$CADDY_LOG_ID' then stop" > "$1"
}

# Kopiert eine Datei nur, wenn sich der Inhalt ändert. Rückgabe 0 = geändert, 1 = war schon gleich.
install_if_changed() { # Quelle Ziel
  if [[ -f "$2" ]] && cmp -s "$1" "$2"; then return 1; fi
  install -m 644 "$1" "$2" || die "Datei ließ sich nicht schreiben: $2"
}

# Ist Pocket TTS in genau dieser Version in der Python-Umgebung? Prüft nur Dateien, führt nichts aus.
# Auch das Python der Umgebung muss da sein: Nach einem Wechsel der Debian-Version zeigt es ins Leere.
pocket_installed() { # Umgebung Version
  [[ -x "$1/bin/python3" ]] \
    && [[ -n "$(compgen -G "$1/lib/python3*/site-packages/pocket_tts-$2.dist-info/METADATA" || true)" ]]
}

# Die drei Zeilen für Kuniberts Stimme in der env-Datei (Werte wie in deploy/kunibert-tts.service).
# Ersetzt sie eine andere Wahl, sagt es das. Werte nennt es nur, wenn sie einfache Namen sind
# (eine Adresse könnte ein Token enthalten).
write_pocket_env() { # Datei
  local alt
  alt=$(env_get "$1" PICASTAI_TTS_PROVIDER)
  if [[ -n "$alt" && "$alt" != pocket ]]; then
    if [[ "$alt" =~ ^[a-z-]{1,30}$ ]]; then alt="'$alt'"; else alt="ein anderer Wert"; fi
    note "PICASTAI_TTS_PROVIDER war $alt, jetzt 'pocket'. Eigene Wahl behalten: Zeile zurückstellen, Skript nur mit --skip-pocket."
  fi
  alt=$(env_get "$1" PICASTAI_POCKET_TTS_VOICE)
  if [[ -n "$alt" && "$alt" != "$POCKET_VOICE" ]]; then
    if [[ "$alt" =~ ^[a-z][a-z0-9_]{0,39}$ ]]; then alt="'$alt'"; else alt="eine Adresse"; fi
    note "PICASTAI_POCKET_TTS_VOICE war $alt, jetzt '$POCKET_VOICE'. Eigene Stimme behalten: Zeile zurückstellen, Skript nur mit --skip-pocket."
  fi
  alt=$(env_get "$1" PICASTAI_POCKET_TTS_URL)
  if [[ -n "$alt" && "$alt" != "$POCKET_URL" ]]; then
    note "PICASTAI_POCKET_TTS_URL hatte einen anderen Wert, jetzt $POCKET_URL (der Dienst $POCKET_SERVICE)."
  fi
  env_set "$1" PICASTAI_TTS_PROVIDER pocket
  env_set "$1" PICASTAI_POCKET_TTS_URL "$POCKET_URL"
  env_set "$1" PICASTAI_POCKET_TTS_VOICE "$POCKET_VOICE"
}

# Wie oft systemd den Dienst der Stimme neu gestartet hat (0, wenn unbekannt).
pocket_restarts() {
  local n
  n=$(systemctl show -p NRestarts --value "$POCKET_SERVICE" 2>/dev/null || true)
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  printf '%s' "$n"
}

# Befehl für die Fehlersuche: Pocket TTS im Vordergrund, Meldungen nur im Terminal (nicht im Journal).
pocket_debug_hint() {
  note "Fehlersuche (Meldungen nur im Terminal, nicht im Journal). Währenddessen kein Gerät benutzen:"
  note "  sonst können Satzanfänge der Antworten im Terminal stehen."
  note "  sudo systemctl stop $POCKET_SERVICE"
  note "  sudo -u $POCKET_USER env HOME=/var/lib/$POCKET_USER $POCKET_DIR/bin/pocket-tts serve --language german --default-voice $POCKET_VOICE --host 127.0.0.1 --port ${POCKET_URL##*:}"
  note "  danach Strg+C und: sudo systemctl reset-failed $POCKET_SERVICE; sudo systemctl start $POCKET_SERVICE"
}

# Hinweis, wenn der Container des Sprachservers nicht ins Journal schreibt (dort gilt die Frist nicht).
speaches_log_hint() { # Log-Treiber des Containers
  [[ "$1" == journald ]] && return 0
  note "Achtung: Der Container speaches schreibt sein Protokoll nach '${1:-unbekannt}', nicht ins Journal; die Frist gilt dort nicht."
  note "Einmal neu anlegen: sudo docker rm -f speaches, dann dieses Skript noch einmal (die Modelle bleiben im Volume hf-hub-cache)."
  return 1
}

# --- Schritte -----------------------------------------------------------------

install_packages() {
  say "Pakete: git, curl, openssl, Docker, Python, Node.js 22, Caddy"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

  if ! command -v docker >/dev/null; then
    apt-get install -y -qq docker.io >/dev/null
  fi
  note "Docker: $(docker --version 2>/dev/null || echo fehlt)"

  # Für Kuniberts Stimme: eigene Python-Umgebung (Pocket TTS braucht Python 3.10 bis 3.14).
  if [[ "$SKIP_POCKET" == 0 ]]; then
    apt-get install -y -qq python3 python3-venv >/dev/null
    note "Python: $(python3 --version 2>/dev/null || echo fehlt)"
  fi

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

setup_log_retention() {
  say "Frist für Protokolle: $JOURNAL_RETENTION_TEXT (vorläufig)"
  local tmp
  tmp=$(mktemp)
  install -d -m 755 "$(dirname "$JOURNALD_DROPIN")"
  write_journald_retention "$tmp"
  if install_if_changed "$tmp" "$JOURNALD_DROPIN"; then
    systemctl restart systemd-journald
    note "journald: Frist gesetzt ($JOURNALD_DROPIN)"
  else
    note "journald: Frist war schon gesetzt"
  fi
  if [[ -d "$(dirname "$RSYSLOG_FILTER")" ]]; then
    write_rsyslog_filter "$tmp"
    if install_if_changed "$tmp" "$RSYSLOG_FILTER"; then
      if systemctl is-active --quiet rsyslog; then systemctl restart rsyslog; fi
      note "rsyslog: Server, Sprachserver und Caddy nicht in /var/log/syslog ($RSYSLOG_FILTER)"
    fi
  else
    note "rsyslog ist nicht installiert. Wird es später installiert: dieses Skript noch einmal starten."
  fi
  rm -f "$tmp"
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
  # Caddy auf demselben Rechner (Punkt D2): echte Adressen der Eltern beim Koppeln. Ein eigener Wert bleibt.
  env_set_if_empty "$ENV_FILE" PICASTAI_TRUST_PROXY loopback || true
  env_set "$ENV_FILE" PICASTAI_STT_MODEL "$STT_MODEL"
  env_set "$ENV_FILE" PICASTAI_TTS_MODEL "$TTS_MODEL"
  env_set "$ENV_FILE" PICASTAI_TTS_VOICE "$TTS_VOICE"
  # Die drei Zeilen für Kuniberts Stimme setzt erst setup_pocket, wenn der Dienst antwortet. Die Piper-Zeilen
  # darüber bleiben für einen Rückfall von Hand: Zeile PICASTAI_TTS_PROVIDER löschen, Skript nur mit --skip-pocket.
  if env_set_if_empty "$ENV_FILE" PICASTAI_ADMIN_TOKEN "$(openssl rand -hex 32)"; then note "Admin-Token erzeugt (steht nur in der Datei)"; fi
  if env_set_if_empty "$ENV_FILE" PICASTAI_DEVICE_TOKEN "$(openssl rand -hex 32)"; then note "Geräte-Token erzeugt (steht nur in der Datei)"; fi
  # Eltern-Steuerung dauerhaft (Punkt E2). Einen vorhandenen Schlüssel nie überschreiben: Mit einem
  # neuen Schlüssel passt kein Eintrag der Datei mehr, und der Server startet nicht.
  env_set_if_empty "$ENV_FILE" KUNIBERT_ELTERN_DATEI "$ELTERN_DATEI" || true
  if env_set_if_empty "$ENV_FILE" KUNIBERT_ELTERN_SCHLUESSEL "$(openssl rand -hex 32)"; then note "Schlüssel der Eltern-Steuerung erzeugt (steht nur in der Datei)"; fi
  chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
}

setup_speaches() {
  say "Sprachserver (Speaches, nur lokal auf Port 8000)"
  if ! docker ps -a --format '{{.Names}}' | grep -qx speaches; then
    docker run --detach --name speaches --restart unless-stopped \
      --publish 127.0.0.1:8000:8000 \
      --volume hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
      "${SPEACHES_LOG_OPTS[@]}" \
      "$SPEACHES_IMAGE" >/dev/null
  else
    docker start speaches >/dev/null
  fi
  # Ein älterer Container schreibt sein Protokoll vielleicht noch in eine Docker-Datei; dort gilt die Frist nicht.
  local log_driver
  log_driver=$(docker inspect --format '{{.HostConfig.LogConfig.Type}}' speaches 2>/dev/null || true)
  speaches_log_hint "$log_driver" || SPEACHES_LOG_DRIVER=$log_driver
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

setup_pocket() {
  say "Kuniberts Stimme (Pocket TTS $POCKET_VERSION, Dienst $POCKET_SERVICE, nur lokal auf Port ${POCKET_URL##*:})"
  local changed=0
  id "$POCKET_USER" >/dev/null 2>&1 || useradd --system --home-dir "/var/lib/$POCKET_USER" --shell /usr/sbin/nologin "$POCKET_USER"
  if pocket_installed "$POCKET_DIR" "$POCKET_VERSION"; then
    note "Pocket TTS $POCKET_VERSION ist schon installiert ($POCKET_DIR)"
  else
    # Neu aufbauen: Eine Python-Umgebung lässt sich nicht verschieben, und ein abgebrochener Lauf
    # hinterlässt sonst Reste. Die Umgebung gehört root; der Dienst darf sie nur lesen.
    [[ -n "$POCKET_DIR" && "$POCKET_DIR" != / ]] || die "POCKET_DIR ist leer"
    note "installiere Pocket TTS $POCKET_VERSION und PyTorch ohne Grafikkarte (dauert einige Minuten)"
    # Ein laufender Dienst soll nicht aus einer halb gelöschten Umgebung weiterlesen.
    if [[ -d "$POCKET_DIR" ]]; then systemctl stop "$POCKET_SERVICE" 2>/dev/null || true; fi
    rm -rf "$POCKET_DIR"
    python3 -m venv "$POCKET_DIR" || die "Python-Umgebung ließ sich nicht anlegen: $POCKET_DIR"
    "$POCKET_DIR/bin/pip" install --quiet --disable-pip-version-check --index-url "$TORCH_INDEX" 'torch>=2.5' \
      || die "PyTorch ließ sich nicht installieren (Quelle $TORCH_INDEX)"
    "$POCKET_DIR/bin/pip" install --quiet --disable-pip-version-check "pocket-tts==$POCKET_VERSION" \
      || die "Pocket TTS $POCKET_VERSION ließ sich nicht installieren"
    pocket_installed "$POCKET_DIR" "$POCKET_VERSION" || die "Pocket TTS $POCKET_VERSION fehlt nach der Installation ($POCKET_DIR)"
    changed=1
  fi
  if install_if_changed "$APP_DIR/deploy/kunibert-tts.service" "$POCKET_UNIT"; then
    systemctl daemon-reload
    changed=1
  fi
  systemctl enable --quiet "$POCKET_SERVICE"
  # Neu starten nur, wenn sich etwas geändert hat oder der Dienst nicht läuft: Jeder Start lädt das Modell neu.
  # reset-failed: Hat der Dienst die Startgrenze erreicht (StartLimitBurst in kunibert-tts.service), startet er sonst nicht.
  if [[ "$changed" == 1 ]] || ! systemctl is-active --quiet "$POCKET_SERVICE"; then
    systemctl reset-failed "$POCKET_SERVICE" 2>/dev/null || true
    systemctl restart "$POCKET_SERVICE"
  fi
  note "warte auf die Stimme (der erste Start lädt Modell und Stimme, einige hundert MB)"
  local i neustarts basis
  basis=$(pocket_restarts)
  for i in $(seq 1 "$POCKET_WAIT_TRIES"); do
    if curl -fsS --max-time 5 -o /dev/null "$POCKET_URL/health" 2>/dev/null; then
      note "Stimme antwortet ($POCKET_URL/health). Ihr Protokoll geht absichtlich nicht ins Journal."
      # Erst jetzt auf Pocket TTS umstellen: Scheitert der Schritt, bleibt die bisherige Stimme eingestellt.
      write_pocket_env "$ENV_FILE"
      return 0
    fi
    # Bricht der Dienst immer wieder ab, nicht die vollen 10 Minuten warten (der Grund steht nicht im Journal).
    neustarts=$(pocket_restarts)
    if (( neustarts - basis >= 2 )); then
      pocket_debug_hint
      die "Die Stimme bricht beim Start immer wieder ab ($((neustarts - basis)) Neustarts). Befehle zur Fehlersuche stehen oben."
    fi
    sleep 5
  done
  pocket_debug_hint
  die "Die Stimme antwortet nicht ($POCKET_URL/health). Befehle zur Fehlersuche stehen oben."
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
  if [[ "$SKIP_POCKET" == 0 ]]; then
    note "Stimme: Dienst $POCKET_SERVICE (Pocket TTS $POCKET_VERSION, $POCKET_VOICE). Im Journal stehen von ihm nur Start und Ende,"
    note "  denn seine eigenen Meldungen könnten Teile der Antworttexte enthalten. Fehlersuche: EINRICHTUNG.md, Abschnitt 4."
  fi
  note "Protokolle bleiben etwa $JOURNAL_RETENTION_TEXT (vorläufig), wenn kein eigener Wert gesetzt ist. Prüfen: systemd-analyze cat-config systemd/journald.conf | grep -E '^(MaxRetentionSec|MaxFileSec)='"
  if [[ -n "${SPEACHES_LOG_DRIVER+x}" ]]; then speaches_log_hint "$SPEACHES_LOG_DRIVER" || true; fi
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
      --skip-pocket) SKIP_POCKET=1; shift ;;
      --skip-caddy) SKIP_CADDY=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "Unbekannte Option: $1" ;;
    esac
  done
  [[ -n "$HOSTNAME_ARG" ]] || { usage >&2; die "--hostname fehlt"; }
  valid_hostname "$HOSTNAME_ARG" || die "Kein gültiger Hostname: $HOSTNAME_ARG"
  [[ $EUID -eq 0 ]] || die "Bitte mit sudo starten."
  command -v apt-get >/dev/null || die "Nur für Debian/Ubuntu (apt-get fehlt)."

  setup_log_retention   # zuerst: Caddy und Docker schreiben schon beim Installieren ins Protokoll
  install_packages
  create_user_and_dirs
  fetch_code
  write_env
  if [[ "$SKIP_SPEACHES" == 0 ]]; then setup_speaches; fi
  if [[ "$SKIP_POCKET" == 0 ]]; then setup_pocket; fi
  start_service
  if [[ "$SKIP_CADDY" == 0 ]]; then setup_caddy; fi
  summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
