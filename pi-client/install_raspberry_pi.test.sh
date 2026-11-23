#!/usr/bin/env bash
# Verhaltenstest für install_raspberry_pi.sh (Punkt N1117-2214-b der Arbeitsliste).
# Führt den Installer als root in einer frischen Debian-Umgebung aus und prüft: Dienstkonto,
# Ordner, kunibert.env (Werte, Rechte, Besitzer), Dienstdatei (auch mit systemd-analyze verify),
# Zeitgrenze 140 s, zweiten Lauf, Lauf ohne Token, Änderungen von Hand, wer das Token lesen darf,
# den Health-Aufruf aus pi-client/README.md („Manuell starten“), die verdeckte Abfrage an einem
# Pseudo-Terminal und dass das Token nie in einer Ausgabe oder einer anderen Datei steht.
#
# Der Test ÄNDERT DAS SYSTEM (Pakete, Nutzer, /etc, /opt, /var/lib). Nur in einem Wegwerf-Container:
#   docker run --rm -e KUNIBERT_INSTALLER_TEST=1 -v "$PWD":/src:ro debian:trixie \
#     bash /src/pi-client/install_raspberry_pi.test.sh
# In der CI: Job „pi-installer“ in .github/workflows/tests.yml (Debian 13 wie Raspberry Pi OS „Trixie“).
#
# Nicht prüfbar im Container: Audio, Taster, LED, GPIO-Gruppe, Gruppen des Standardnutzers am Pi,
# systemd als PID 1 (systemctl ist hier eine Attrappe, nur „enable“ läuft echt; ob systemd
# kunibert.env beim Start als root liest, zeigt erst der echte Pi).
set -uo pipefail

[[ "${KUNIBERT_INSTALLER_TEST:-}" == "1" ]] || {
  echo "Nur in einem Wegwerf-Container mit KUNIBERT_INSTALLER_TEST=1 (siehe Kopf der Datei)." >&2
  exit 2
}
[[ -f /.dockerenv || -f /run/.containerenv || "${GITHUB_ACTIONS:-}" == "true" ]] || {
  echo "Kein Container erkannt (/.dockerenv, /run/.containerenv oder GitHub Actions). Abbruch." >&2
  exit 2
}
[[ "${EUID}" -eq 0 ]] || { echo "Braucht root (wie der Installer)." >&2; exit 2; }

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
installer="$here/install_raspberry_pi.sh"
work=$(mktemp -d)
env_file=/etc/kunibert/kunibert.env
svc=/etc/systemd/system/kunibert.service
port=18080
fails=0

ok()  { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
eq()  { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1: erwartet '$3', war '$2'"; fi; }
has() { if grep -qF -- "$3" "$2"; then ok "$1"; else bad "$1: '$3' fehlt"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then bad "$1: '$3' steht drin"; else ok "$1"; fi; }
perm() { stat -c '%a %U %G' "$1" 2>/dev/null || echo fehlt; }
val() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2-; }
# Ausgabe zeigen, die Test-Tokens durch <TOKEN> ersetzt.
show() {
  local t args=()
  for t in "${tokens[@]}"; do args+=(-e "s/${t}/<TOKEN>/g"); done
  sed "${args[@]}" "$1" | tail -n 40
}
# Prüft, dass keines der Test-Tokens in der Datei steht. Nennt das Token selbst nie.
no_token() {
  if grep -qF "${tokens[@]/#/-e}" -- "$2"; then bad "$1: Token steht in der Ausgabe"; else ok "$1"; fi
}
token_is() {
  if [[ "$(val PICASTAI_DEVICE_TOKEN)" == "\"$2\"" ]]; then ok "$1"; else bad "$1: Token in kunibert.env ist ein anderes"; fi
}
# Installer ausführen; Ausgabe (stdout und stderr) in Datei $1, Rückgabe in $rc.
run() {
  local out="$1"; shift
  bash "$installer" "$@" < /dev/null > "$out" 2>&1
  rc=$?
}
# Wie run, aber an einem Pseudo-Terminal (verdeckte Abfrage). $2: Eingabezeile oder KEINE. Die
# Eingabe geht erst raus, wenn die Abfrage zu sehen ist; sonst zeigte das Terminal sie an, bevor
# read -s das Echo abschaltet.
run_tty() {
  local out="$1" input="$2" cmd pid fifo="$work/tty-eingabe"; shift 2
  rm -f "$fifo" "$out"
  mkfifo "$fifo"
  printf -v cmd '%q ' bash "$installer" "$@"
  timeout 180 script -qfec "$cmd" "$out" < "$fifo" > /dev/null 2>&1 &
  pid=$!
  exec 3> "$fifo"
  if [[ "$input" != KEINE ]]; then
    for _ in $(seq 1 1200); do grep -q 'Gerätetoken' "$out" 2>/dev/null && break; sleep 0.1; done
    sleep 1
    printf '%s\n' "$input" >&3
  fi
  wait "$pid"
  rc=$?
  exec 3>&-
  rm -f "$fifo"
}
snapshot() {
  stat -c '%n %a %U %G' /etc/kunibert "$env_file" "$svc"
  sha256sum "$env_file" "$svc"
  ls -A /etc/kunibert
}

echo "== Vorbereitung (systemd für systemd-analyze, sudo für den Aufruf aus der Anleitung)"
export DEBIAN_FRONTEND=noninteractive
if ! { apt-get update -qq && apt-get install -y -qq --no-install-recommends systemd sudo; } > "$work/vorbereitung.txt" 2>&1; then
  tail -n 20 "$work/vorbereitung.txt"
  echo "Vorbereitung gescheitert." >&2
  exit 1
fi
# Attrappe: Im Container läuft kein systemd als PID 1. /usr/local/sbin steht in PATH vor /usr/bin.
mkdir -p /usr/local/sbin
cat > /usr/local/sbin/systemctl <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> /tmp/systemctl-aufrufe.log
# „enable“ geht auch ohne laufendes systemd: Das echte Programm legt nur den Link an.
if [ "$1" = enable ]; then exec /usr/bin/systemctl "$@"; fi
EOF
chmod 0755 /usr/local/sbin/systemctl
hash -r
eq "systemctl ist die Attrappe" "$(command -v systemctl)" /usr/local/sbin/systemctl
rm -f /tmp/systemctl-aufrufe.log

token="testtoken-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
token2="testtoken2-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
token3="testtoken3-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
token4="testtoken4-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
tokens=("$token" "$token2" "$token3" "$token4")
printf '%s\n' "$token" > "$work/token"
printf '  %s  \r\n' "$token2" > "$work/token2"
chmod 0600 "$work/token" "$work/token2"

echo "== Lauf 1: frische Installation, Token aus Datei"
run "$work/lauf1.txt" --non-interactive --api-url "http://127.0.0.1:$port/" --device-id test-geraet-1 \
  --api-token-file "$work/token" --capture-device 'USB Mikro'
eq "Lauf 1: Rückgabe 0" "$rc" 0
[[ "$rc" -eq 0 ]] || show "$work/lauf1.txt"
no_token "Lauf 1: Token nicht in der Ausgabe" "$work/lauf1.txt"
hasnt "Lauf 1: keine Warnung zum Token" "$work/lauf1.txt" "Kein API-Token gesetzt"

echo "== Dienstkonto"
eq "Dienstkonto: Shell" "$(getent passwd kunibert | cut -d: -f7)" /usr/sbin/nologin
eq "Dienstkonto: Home" "$(getent passwd kunibert | cut -d: -f6)" /opt/kunibert
if (( $(id -u kunibert) < 1000 )); then ok "Dienstkonto: Systemkonto (UID unter 1000)"; else bad "Dienstkonto: UID $(id -u kunibert)"; fi
eq "Dienstkonto: Hauptgruppe" "$(id -gn kunibert)" kunibert
if [[ " $(id -nG kunibert) " == *" audio "* ]]; then ok "Dienstkonto: in Gruppe audio"; else bad "Dienstkonto: nicht in audio ($(id -nG kunibert))"; fi
kgid=$(getent group kunibert | cut -d: -f3)
eq "Gruppe kunibert: keine weiteren Mitglieder" "$(getent group kunibert | cut -d: -f4)" ""
eq "Gruppe kunibert: nur Hauptgruppe des Dienstkontos" "$(awk -F: -v g="$kgid" '$4 == g { print $1 }' /etc/passwd)" kunibert

echo "== Ordner und Dateien"
eq "Ordner /etc/kunibert" "$(perm /etc/kunibert)" "750 root kunibert"
eq "kunibert.env: Rechte und Besitzer" "$(perm "$env_file")" "640 root kunibert"
eq "Ordner /opt/kunibert" "$(perm /opt/kunibert)" "750 kunibert audio"
eq "Ordner /var/lib/kunibert" "$(perm /var/lib/kunibert)" "750 kunibert audio"
eq "Ordner /var/lib/kunibert/audio" "$(perm /var/lib/kunibert/audio)" "750 kunibert audio"
eq "Ordner /var/lib/kunibert/ansagen" "$(perm /var/lib/kunibert/ansagen)" "750 kunibert audio"
eq "Client installiert" "$(perm /opt/kunibert/pi-client/kunibert_client.py)" "644 kunibert audio"
eq "Rückmeldung installiert" "$(perm /opt/kunibert/pi-client/rueckmeldung.py)" "644 kunibert audio"
eq "Dienstdatei: Rechte und Besitzer" "$(perm "$svc")" "644 root root"
eq "keine Hilfsdateien in /etc/kunibert" "$(ls -A /etc/kunibert)" "kunibert.env"
if /opt/kunibert/.venv/bin/python -c 'import importlib.util as u, sys; sys.exit(0 if u.find_spec("sounddevice") and u.find_spec("gpiozero") else 1)'; then
  ok "venv: sounddevice und gpiozero (Systempaket) auffindbar"
else
  bad "venv: sounddevice oder gpiozero fehlt"
fi

echo "== kunibert.env: Werte"
eq "Adresse (ohne Schrägstrich am Ende)" "$(val PICASTAI_API_BASE_URL)" "\"http://127.0.0.1:$port\""
eq "Geräte-ID" "$(val PICASTAI_DEVICE_ID)" '"test-geraet-1"'
token_is "Token aus der Token-Datei" "$token"
eq "Zeitgrenze Gerät 140 s (Server 120, Caddy 130)" "$(val KUNIBERT_PIPELINE_TIMEOUT)" 140
eq "Mikrofon" "$(val KUNIBERT_INPUT_DEVICE)" '"USB Mikro"'
eq "Lautsprecher leer (Standardgerät)" "$(val KUNIBERT_OUTPUT_DEVICE)" '""'
eq "Ablage Ton" "$(val KUNIBERT_CACHE_DIR)" '"/var/lib/kunibert/audio"'
eq "Ansagen" "$(val KUNIBERT_ANNOUNCEMENTS_DIR)" '"/var/lib/kunibert/ansagen"'
eq "jeder Schlüssel genau einmal" "$(grep -E '^[A-Z_]+=' "$env_file" | cut -d= -f1 | sort | uniq -d)" ""
# Die Anleitung liest die Datei mit der Shell ein (set -a; . kunibert.env): Anführungszeichen müssen passen.
eq "Shell liest Mikrofon mit Leerzeichen" "$(bash -c "set -a; . '$env_file'; printf '%s' \"\$KUNIBERT_INPUT_DEVICE\"")" "USB Mikro"

echo "== Dienstdatei"
has "Dienst: User" "$svc" "User=kunibert"
has "Dienst: Group" "$svc" "Group=audio"
has "Dienst: EnvironmentFile" "$svc" "EnvironmentFile=$env_file"
has "Dienst: ExecStart" "$svc" "ExecStart=/opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py"
has "Dienst: WorkingDirectory" "$svc" "WorkingDirectory=/var/lib/kunibert"
has "Dienst: ReadWritePaths" "$svc" "ReadWritePaths=/var/lib/kunibert"
if systemd-analyze verify "$svc" > "$work/verify.txt" 2>&1 && ! grep -q 'kunibert\.service' "$work/verify.txt"; then
  ok "systemd-analyze verify: keine Befunde zur Dienstdatei"
else
  bad "systemd-analyze verify: $(tail -n 5 "$work/verify.txt")"
fi
has "systemctl daemon-reload" /tmp/systemctl-aufrufe.log "daemon-reload"
has "systemctl enable" /tmp/systemctl-aufrufe.log "enable kunibert.service"
eq "Dienst aktiviert (Link in multi-user.target.wants)" "$(readlink /etc/systemd/system/multi-user.target.wants/kunibert.service)" "$svc"
no_token "Dienstdatei enthält kein Token" "$svc"
if grep -Eq '(^| )(re)?start( |$)' /tmp/systemctl-aufrufe.log; then bad "Dienst wurde gestartet"; else ok "Dienst nur aktiviert, nicht gestartet"; fi

echo "== Wer das Token lesen darf"
useradd --create-home --groups audio pitest   # wie der Standardnutzer am Pi: in der Gruppe audio
if runuser -u pitest -- cat "$env_file" > /dev/null 2>&1; then bad "Mitglied von audio liest kunibert.env"; else ok "Mitglied von audio liest kunibert.env nicht"; fi
if runuser -u kunibert -- test -r "$env_file"; then ok "Dienstkonto liest kunibert.env"; else bad "Dienstkonto liest kunibert.env nicht"; fi

echo "== Health-Aufruf aus der Anleitung (pi-client/README.md, Abschnitt Manuell starten)"
python3 - "$port" "$work/health-aufrufe.log" > /dev/null 2>&1 <<'EOF' &
import http.server
import sys

port, log = int(sys.argv[1]), sys.argv[2]


class Health(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        with open(log, "a", encoding="utf-8") as f:
            f.write(self.path + "\n")
        body = b'{"status":"ok"}'
        self.send_response(200 if self.path == "/health" else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


http.server.HTTPServer(("127.0.0.1", port), Health).serve_forever()
EOF
server_pid=$!
for _ in $(seq 1 50); do
  curl -sS -o /dev/null "http://127.0.0.1:$port/bereit" 2>/dev/null && break
  sleep 0.1
done
: > "$work/health-aufrufe.log"
# Genau der Aufruf aus der Anleitung, aus einem Ordner, den das Dienstkonto nicht lesen darf.
(cd /root && sudo -u kunibert bash -c 'cd /var/lib/kunibert && set -a && . /etc/kunibert/kunibert.env && set +a && exec /opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py --once health') > "$work/health.txt" 2>&1
eq "Health als Dienstkonto meldet OK" "$(tail -n 1 "$work/health.txt")" OK
[[ "$(tail -n 1 "$work/health.txt")" == OK ]] || show "$work/health.txt"
eq "Health ging an die Adresse aus kunibert.env" "$(cat "$work/health-aufrufe.log")" "/health"
no_token "Health: Token nicht in der Ausgabe" "$work/health.txt"
kill "$server_pid" 2>/dev/null
wait "$server_pid" 2>/dev/null

echo "== Lauf 2: dieselben Angaben"
snapshot > "$work/stand1.txt"
run "$work/lauf2.txt" --non-interactive --api-url "http://127.0.0.1:$port/" --device-id test-geraet-1 \
  --api-token-file "$work/token" --capture-device 'USB Mikro'
eq "Lauf 2: Rückgabe 0" "$rc" 0
no_token "Lauf 2: Token nicht in der Ausgabe" "$work/lauf2.txt"
if snapshot | cmp -s - "$work/stand1.txt"; then ok "Lauf 2 ändert nichts (Datei, Dienst, Rechte, Besitzer)"; else bad "Lauf 2 hat etwas geändert: $(snapshot | diff "$work/stand1.txt" - | tail -n 6)"; fi
has "Lauf 2: meldet unveränderte Konfiguration" "$work/lauf2.txt" "Konfiguration unverändert."

echo "== Lauf 3: ohne Token und ohne Angaben"
run "$work/lauf3.txt" --non-interactive
eq "Lauf 3: Rückgabe 0" "$rc" 0
no_token "Lauf 3: Token nicht in der Ausgabe" "$work/lauf3.txt"
if snapshot | cmp -s - "$work/stand1.txt"; then ok "Lauf 3 ändert nichts (Token, Adresse, Geräte-ID, Mikrofon bleiben)"; else bad "Lauf 3 hat etwas geändert: $(snapshot | diff "$work/stand1.txt" - | tail -n 6)"; fi
hasnt "Lauf 3: keine Warnung zum Token" "$work/lauf3.txt" "Kein API-Token gesetzt"
has "Lauf 3: sagt, dass das Token bleibt" "$work/lauf3.txt" "Das Token in $env_file bleibt."

echo "== Lauf 4: Änderungen von Hand (wie mit sudoedit) und eine neue Angabe"
sed -i 's/^KUNIBERT_REQUEST_TIMEOUT=.*/KUNIBERT_REQUEST_TIMEOUT=60/' "$env_file"
printf 'KUNIBERT_AUDIO_STREAM=1\n' >> "$env_file"
run "$work/lauf4.txt" --non-interactive --playback-device 'USB Lautsprecher'
eq "Lauf 4: Rückgabe 0" "$rc" 0
no_token "Lauf 4: Token nicht in der Ausgabe" "$work/lauf4.txt"
eq "Lauf 4: neuer Lautsprecher" "$(val KUNIBERT_OUTPUT_DEVICE)" '"USB Lautsprecher"'
eq "Lauf 4: Mikrofon bleibt" "$(val KUNIBERT_INPUT_DEVICE)" '"USB Mikro"'
eq "Lauf 4: Adresse bleibt" "$(val PICASTAI_API_BASE_URL)" "\"http://127.0.0.1:$port\""
eq "Lauf 4: Geräte-ID bleibt" "$(val PICASTAI_DEVICE_ID)" '"test-geraet-1"'
token_is "Lauf 4: Token bleibt" "$token"
eq "Lauf 4: von Hand geänderter Wert bleibt" "$(val KUNIBERT_REQUEST_TIMEOUT)" 60
eq "Lauf 4: von Hand ergänzte Zeile bleibt" "$(val KUNIBERT_AUDIO_STREAM)" 1
eq "Lauf 4: jeder Schlüssel genau einmal" "$(grep -E '^[A-Z_]+=' "$env_file" | cut -d= -f1 | sort | uniq -d)" ""
eq "Lauf 4: Rechte bleiben" "$(perm "$env_file")" "640 root kunibert"
snapshot > "$work/stand4.txt"
run "$work/lauf4b.txt" --non-interactive
eq "Lauf 4b: Rückgabe 0" "$rc" 0
has "Lauf 4b: nennt behaltene Werte (nur Namen)" "$work/lauf4b.txt" "behalten: "
no_token "Lauf 4b: Token nicht in der Ausgabe" "$work/lauf4b.txt"
if snapshot | cmp -s - "$work/stand4.txt"; then ok "Lauf 4b ändert nichts (auch mit ergänzten Zeilen)"; else bad "Lauf 4b hat etwas geändert: $(snapshot | diff "$work/stand4.txt" - | tail -n 6)"; fi

echo "== Lauf 5: ältere oder von Hand verdorbene Datei"
chgrp audio /etc/kunibert "$env_file"
sed -i '/^KUNIBERT_CONNECT_RETRY=/d' "$env_file"
sed -i 's/^KUNIBERT_PIPELINE_TIMEOUT=.*/KUNIBERT_PIPELINE_TIMEOUT=60/' "$env_file"
sed -i 's/^PICASTAI_DEVICE_TOKEN=/  PICASTAI_DEVICE_TOKEN=/' "$env_file"   # eingerückt
sed -i 's/$/\r/' "$env_file"                                              # Windows-Zeilenenden
run "$work/lauf5.txt" --non-interactive
eq "Lauf 5: Rückgabe 0" "$rc" 0
no_token "Lauf 5: Token nicht in der Ausgabe" "$work/lauf5.txt"
eq "Lauf 5: Ordner angeglichen" "$(perm /etc/kunibert)" "750 root kunibert"
eq "Lauf 5: Datei angeglichen" "$(perm "$env_file")" "640 root kunibert"
eq "Lauf 5: fehlende Zeile mit Standardwert ergänzt" "$(val KUNIBERT_CONNECT_RETRY)" 10
eq "Lauf 5: Zeitkette wieder 140 s" "$(val KUNIBERT_PIPELINE_TIMEOUT)" 140
has "Lauf 5: warnt wegen der Zeitkette" "$work/lauf5.txt" "KUNIBERT_PIPELINE_TIMEOUT stand in"
eq "Lauf 5: keine Windows-Zeilenenden mehr" "$(grep -c $'\r' "$env_file")" 0
token_is "Lauf 5: eingerücktes Token erkannt und behalten" "$token"
hasnt "Lauf 5: keine Warnung zum Token" "$work/lauf5.txt" "Kein API-Token gesetzt"
eq "Lauf 5: jeder Schlüssel genau einmal" "$(grep -E '^[A-Z_]+=' "$env_file" | cut -d= -f1 | sort | uniq -d)" ""
eq "Lauf 5: von Hand ergänzte Zeile bleibt" "$(val KUNIBERT_AUDIO_STREAM)" 1

echo "== Gruppe kunibert mit einem fremden Konto"
useradd --no-create-home --groups kunibert fremd
run "$work/lauf5b.txt" --non-interactive
eq "Lauf 5b: Rückgabe 0" "$rc" 0
has "Lauf 5b: warnt vor weiteren Mitgliedern" "$work/lauf5b.txt" "weitere Konten (fremd)"
userdel fremd

echo "== Token nie auf der Befehlszeile"
snapshot > "$work/stand5.txt"
run "$work/lauf6.txt" --non-interactive --api-token "$token2"
if [[ "$rc" -ne 0 ]]; then ok "--api-token wird abgelehnt"; else bad "--api-token wurde angenommen"; fi
has "--api-token: Hinweis auf die verdeckte Abfrage" "$work/lauf6.txt" "--api-token-file"
no_token "--api-token: Token nicht in der Ausgabe" "$work/lauf6.txt"
run "$work/lauf6b.txt" --non-interactive "--api-token=$token2"
if [[ "$rc" -ne 0 ]]; then ok "--api-token=… wird abgelehnt"; else bad "--api-token=… wurde angenommen"; fi
no_token "--api-token=…: Token nicht in der Ausgabe" "$work/lauf6b.txt"
run "$work/lauf6c.txt" --non-interactive "--api-tokn=$token2"
if [[ "$rc" -ne 0 ]]; then ok "vertippte Option wird abgelehnt"; else bad "vertippte Option wurde angenommen"; fi
no_token "vertippte Option: Wert nicht in der Ausgabe" "$work/lauf6c.txt"
run "$work/lauf6d.txt" --non-interactive --api-token-file "$token2"
if [[ "$rc" -ne 0 ]]; then ok "Token statt Dateiname wird abgelehnt"; else bad "Token statt Dateiname wurde angenommen"; fi
no_token "Token statt Dateiname: Token nicht in der Ausgabe" "$work/lauf6d.txt"
run "$work/lauf6e.txt" --non-interactive "$token2"
if [[ "$rc" -ne 0 ]]; then ok "Token als loses Argument wird abgelehnt"; else bad "Token als loses Argument wurde angenommen"; fi
no_token "Token als loses Argument: Token nicht in der Ausgabe" "$work/lauf6e.txt"
run "$work/lauf6f.txt" --non-interactive --api-token-file ""
if [[ "$rc" -ne 0 ]]; then ok "leerer Dateiname wird abgelehnt"; else bad "leerer Dateiname wurde angenommen"; fi
has "leerer Dateiname: Meldung" "$work/lauf6f.txt" "leerer Dateiname"
printf 'Bearer %s\n' "$token2" > "$work/token-bearer"
run "$work/lauf6g.txt" --non-interactive --api-token-file "$work/token-bearer"
if [[ "$rc" -ne 0 ]]; then ok "Token mit Leerzeichen (Bearer …) wird abgelehnt"; else bad "Token mit Leerzeichen wurde angenommen"; fi
no_token "Token mit Leerzeichen: Token nicht in der Ausgabe" "$work/lauf6g.txt"
if snapshot | cmp -s - "$work/stand5.txt"; then ok "abgelehnte Aufrufe ändern nichts"; else bad "abgelehnter Aufruf hat etwas geändert"; fi

echo "== Neues Token aus Datei (mit Leerzeichen und Windows-Zeilenende, für andere lesbar)"
chmod 0644 "$work/token2"
run "$work/lauf7.txt" --non-interactive --api-token-file "$work/token2"
eq "Lauf 7: Rückgabe 0" "$rc" 0
token_is "Lauf 7: neues Token gespeichert (bereinigt)" "$token2"
no_token "Lauf 7: Token nicht in der Ausgabe" "$work/lauf7.txt"
has "Lauf 7: warnt, dass andere die Token-Datei lesen können" "$work/lauf7.txt" "Die Token-Datei können auch andere lesen"
: > "$work/leer"
run "$work/lauf7b.txt" --non-interactive --api-token-file "$work/leer"
if [[ "$rc" -ne 0 ]]; then ok "leere Token-Datei wird abgelehnt"; else bad "leere Token-Datei wurde angenommen"; fi
token_is "leere Token-Datei: Token bleibt" "$token2"
snapshot > "$work/stand7.txt"
run "$work/lauf7c.txt" --non-interactive --ask-token
if [[ "$rc" -ne 0 ]]; then ok "--ask-token ohne Terminal wird abgelehnt"; else bad "--ask-token ohne Terminal wurde angenommen"; fi
has "--ask-token ohne Terminal: Meldung" "$work/lauf7c.txt" "--ask-token braucht eine Eingabe am Terminal"
if snapshot | cmp -s - "$work/stand7.txt"; then ok "--ask-token ohne Terminal ändert nichts"; else bad "--ask-token ohne Terminal hat etwas geändert"; fi
run "$work/lauf8.txt" --dry-run --non-interactive
eq "Probelauf: Rückgabe 0" "$rc" 0
has "Probelauf: nennt den Zustand des Tokens" "$work/lauf8.txt" "Token: bisheriges bleibt"
has "Probelauf: zeigt, dass die Adresse bleibt" "$work/lauf8.txt" "API: bleibt wie in kunibert.env"
no_token "Probelauf: Token nicht in der Ausgabe" "$work/lauf8.txt"

echo "== Verdeckte Abfrage am Terminal"
sed -i 's/^PICASTAI_DEVICE_TOKEN=.*/PICASTAI_DEVICE_TOKEN=""/' "$env_file"
run_tty "$work/tty1.txt" "$token3"
eq "Abfrage: Rückgabe 0" "$rc" 0
has "Abfrage erscheint ohne gespeichertes Token" "$work/tty1.txt" "picastAI-Gerätetoken (Eingabe wird nicht angezeigt)"
token_is "Abfrage: eingegebenes Token gespeichert" "$token3"
no_token "Abfrage: Token nicht am Bildschirm" "$work/tty1.txt"
run_tty "$work/tty2.txt" KEINE
eq "zweiter Lauf am Terminal: Rückgabe 0 (fragt nicht, wartet nicht)" "$rc" 0
hasnt "zweiter Lauf am Terminal: keine Abfrage" "$work/tty2.txt" "Gerätetoken"
token_is "zweiter Lauf am Terminal: Token bleibt" "$token3"
run_tty "$work/tty3.txt" "" --ask-token
eq "--ask-token, leere Eingabe: Rückgabe 0" "$rc" 0
has "--ask-token: Abfrage nennt leer lassen" "$work/tty3.txt" "leer lassen = bisheriges behalten"
token_is "--ask-token, leere Eingabe: Token bleibt" "$token3"
run_tty "$work/tty4.txt" "$token4" --ask-token
eq "--ask-token, neues Token: Rückgabe 0" "$rc" 0
token_is "--ask-token: neues Token gespeichert" "$token4"
no_token "--ask-token: Token nicht am Bildschirm" "$work/tty4.txt"

echo "== Token in keiner anderen Datei"
leaks="$(grep -rlsF "${tokens[@]/#/-e}" /etc /opt /var/lib /tmp /root 2>/dev/null | grep -v -e "^$work/" -e "^${env_file}\$")"
eq "Token nur in kunibert.env (gesucht in /etc, /opt, /var/lib, /tmp, /root)" "$leaks" ""

echo "== Neuinstallation ohne Token"
rm -f "$env_file"
run "$work/lauf9.txt" --non-interactive
eq "ohne Token: Rückgabe 0" "$rc" 0
has "ohne Token: Warnung" "$work/lauf9.txt" "Kein API-Token gesetzt"
eq "ohne Token: leeres Token in kunibert.env" "$(val PICASTAI_DEVICE_TOKEN)" '""'
eq "ohne Token: Rechte" "$(perm "$env_file")" "640 root kunibert"

echo
if (( fails > 0 )); then
  echo "$fails Prüfungen fehlgeschlagen."
  exit 1
fi
echo "Alle Prüfungen bestanden."
