#!/usr/bin/env bash
# Tests für die Hilfsfunktionen in setup-server.sh. Ändert nichts am System.
#   bash deploy/setup-server.test.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/setup-server.sh
source "$here/setup-server.sh"
set +e

fails=0
quiet() { "$@" >/dev/null 2>&1; }
ok()   { printf 'ok   %s\n' "$1"; }
bad()  { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
eq()   { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1: erwartet '$3', war '$2'"; fi; }
yes()  { if "${@:2}"; then ok "$1"; else bad "$1"; fi; }
no()   { if "${@:2}"; then bad "$1"; else ok "$1"; fi; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
f="$tmp/kunibert.env"

yes "Hostname gültig"             valid_hostname kunibert.picastai.com
yes "Hostname mit Bindestrich"    valid_hostname a-b.example.org
no  "Hostname ohne Punkt"         valid_hostname localhost
no  "Hostname mit Schema"         valid_hostname https://x.example
no  "Hostname mit Leerzeichen"    valid_hostname "x .example"
no  "Hostname mit Semikolon"      valid_hostname "x.example;rm"
no  "Hostname mit Doppelpunkt"    valid_hostname x..example
no  "Hostname leer"               valid_hostname ""

cp "$here/kunibert.env.example" "$f"; chmod 600 "$f"
eq "Vorlage: NODE_ENV"            "$(env_get "$f" NODE_ENV)" production
eq "Vorlage: Schlüssel leer"      "$(env_get "$f" ANTHROPIC_API_KEY)" ""
eq "fehlender Schlüssel ist leer" "$(env_get "$f" GIBT_ES_NICHT)" ""

lines_before=$(wc -l < "$f")
env_set "$f" PICASTAI_PUBLIC_BASE_URL "https://kunibert.picastai.com"
eq "env_set ersetzt"              "$(env_get "$f" PICASTAI_PUBLIC_BASE_URL)" "https://kunibert.picastai.com"
eq "env_set: Zeilenzahl gleich"   "$(wc -l < "$f")" "$lines_before"
eq "env_set: genau eine Zeile"    "$(grep -c '^PICASTAI_PUBLIC_BASE_URL=' "$f")" 1
eq "env_set: Rechte bleiben 600"  "$(stat -c %a "$f")" 600

env_set "$f" PICASTAI_STT_MODEL "Systran/faster-whisper-small"
eq "Wert mit Schrägstrich"        "$(env_get "$f" PICASTAI_STT_MODEL)" "Systran/faster-whisper-small"
# shellcheck disable=SC2016
sonder='a&b\c|d$e\n'
env_set "$f" SONDER "$sonder"
eq "Sonderzeichen unverändert"    "$(env_get "$f" SONDER)" "$sonder"
eq "neuer Schlüssel angehängt"    "$(tail -n 1 "$f")" "SONDER=$sonder"

# Auskommentierte Zeilen bleiben, der Kommentar wird nicht als Wert gelesen.
yes "Kommentarzeile bleibt"       grep -q '^# PICASTAI_TTS_PROVIDER=google' "$f"
eq "Kommentar ist kein Wert"      "$(env_get "$f" PICASTAI_TTS_PROVIDER)" ""

yes "Token wird gesetzt, wenn leer"   env_set_if_empty "$f" PICASTAI_DEVICE_TOKEN erstes
no  "Token bleibt, wenn gesetzt"      env_set_if_empty "$f" PICASTAI_DEVICE_TOKEN zweites
eq "Token ist das erste"          "$(env_get "$f" PICASTAI_DEVICE_TOKEN)" erstes
eq "ANTHROPIC_API_KEY unberührt"  "$(env_get "$f" ANTHROPIC_API_KEY)" ""

out=$(render_caddyfile "$here/Caddyfile" kunibert.picastai.com)
yes "Caddyfile: Hostname eingesetzt"   grep -q '^kunibert.picastai.com {' <<<"$out"
no  "Caddyfile: kein Platzhalter mehr" grep -q 'kunibert\.example' <<<"$out"
yes "Caddyfile: Zeitgrenze bleibt"     grep -q 'response_header_timeout 130s' <<<"$out"
# Welche Pfade Caddy durchreicht (Punkt D2): Geräte-API, /health, Eltern-Seite und Eltern-Routen.
# Nie /api/* (Betreiber) und nie alles (die Weboberfläche bliebe sonst nicht gesperrt).
yes "Caddyfile: Geräte-API und /health"      grep -qx $'\t@api path /v1/device/\* /health' <<<"$out"
yes "Caddyfile: Eltern-Seite und -Routen"    grep -qx $'\t@eltern path /eltern /eltern/ /v1/eltern/\*' <<<"$out"
eq  "Caddyfile: nur diese zwei Freigaben"    "$(grep -cE '^\s*@[a-z]+ path ' <<<"$out")" 2
no  "Caddyfile: /api nie durchgereicht"      grep -qE '^\s*@[a-z]+ path .*/api' <<<"$out"
no  "Caddyfile: kein Pfad mit nur *"         grep -qE '^\s*@[a-z]+ path (.* )?/?\*( |$)' <<<"$out"
yes "Caddyfile: alles andere 404"            grep -qx $'\t\trespond 404' <<<"$out"
yes "Caddyfile: Eltern-Anfragen klein"       grep -qx $'\t\t\tmax_size 16KB' <<<"$out"
yes "Caddyfile: HSTS"                        grep -qx $'\theader Strict-Transport-Security "max-age=31536000"' <<<"$out"
# Protokoll (Punkt N1123-0037-c): Filter für die Fehlerzeilen im globalen Block, keine log-Direktive
# bei der Seite (sonst schriebe Caddy Zugriffsprotokolle). Echte Fehlerzeilen: deploy/caddy.test.sh.
vor() { [[ -n "$1" && -n "$2" && "$1" -lt "$2" ]]; }
eq  "Caddyfile: zuerst der globale Block"    "$(grep -vE '^[[:space:]]*(#|$)' <<<"$out" | head -n 1)" "{"
eq  "Caddyfile: genau eine log-Zeile"        "$(grep -cE '^[[:space:]]*log( |$)' <<<"$out")" 1
yes "Caddyfile: log im globalen Block"       vor "$(grep -n -m1 -x $'\tlog {' <<<"$out" | cut -d: -f1)" "$(grep -n -m1 '^kunibert.picastai.com {' <<<"$out" | cut -d: -f1)"
yes "Caddyfile: Fehlerzeilen als JSON"       grep -qx $'\t\t\twrap json' <<<"$out"
for filter in 'request>headers delete' 'request>remote_ip delete' 'request>remote_port delete' 'request>client_ip delete'; do
  yes "Caddyfile: Filter $filter"            grep -qxF $'\t\t\t\t'"$filter" <<<"$out"
done
# shellcheck disable=SC2016
yes "Caddyfile: Kennung der Antwort geschwärzt" grep -qxF $'\t\t\t\trequest>uri regexp `(?i)/v1/device/audio/[^?]*` /v1/device/audio/REDACTED' <<<"$out"
yes "Caddyfile: Adressen im Fehlertext weg"  grep -qE $'^\t\t\t\terror regexp `.+` REDACTED$' <<<"$out"

write_auto_upgrades "$tmp/20auto-upgrades"
yes "Automatische Updates: Paketlisten täglich"   grep -qx 'APT::Periodic::Update-Package-Lists "1";' "$tmp/20auto-upgrades"
yes "Automatische Updates: Sicherheitsupdates an" grep -qx 'APT::Periodic::Unattended-Upgrade "1";' "$tmp/20auto-upgrades"

# Frist für Protokolle (Punkt E1, vorläufig 14 Tage).
write_journald_retention "$tmp/journald.conf"
yes "Journal: Abschnitt [Journal]"          grep -qx '\[Journal\]' "$tmp/journald.conf"
yes "Journal: Frist 14 Tage"                grep -qx 'MaxRetentionSec=14day' "$tmp/journald.conf"
yes "Journal: jeden Tag eine neue Datei"    grep -qx 'MaxFileSec=1day' "$tmp/journald.conf"
eq  "Journal: nur diese zwei Werte"         "$(grep -c '^[A-Za-z]' "$tmp/journald.conf")" 2
eq  "Journal: Datei in journald.conf.d"     "$(dirname "$JOURNALD_DROPIN")" /etc/systemd/journald.conf.d
eq  "Journal: Text passt zum Wert"          "$JOURNAL_RETENTION_TEXT" "${JOURNAL_RETENTION%day} Tage"
write_rsyslog_filter "$tmp/rsyslog.conf"
yes "rsyslog: Server, Sprachserver, Caddy heraus" grep -qxF "if \$programname == 'kunibert-server' or \$programname == 'speaches' or \$programname == 'caddy' then stop" "$tmp/rsyslog.conf"
yes "rsyslog: Regel vor 50-default.conf"    [ "$(basename "$RSYSLOG_FILTER")" \< 50-default.conf ]
eq  "Kennung im Dienst passt zur Regel"     "$(sed -n 's/^SyslogIdentifier=//p' "$here/kunibert-server.service")" "$SERVER_LOG_ID"
eq  "Sprachserver: Journal und Kennung"     "${SPEACHES_LOG_OPTS[*]}" "--log-driver journald --log-opt tag=speaches"
docker_run=$(sed -n '/docker run --detach --name speaches/,/SPEACHES_IMAGE"/p' "$here/setup-server.sh")
# shellcheck disable=SC2016
yes "docker run nutzt diese Optionen"       grep -qF '"${SPEACHES_LOG_OPTS[@]}"' <<<"$docker_run"
main_body=$(sed -n '/^main() {/,/^}/p' "$here/setup-server.sh")
eq  "Frist vor den Paketen"                 "$(grep -oE '^  (setup_log_retention|install_packages)' <<<"$main_body" | head -n 1 | tr -d ' ')" setup_log_retention

yes "Hinweis: Container im Journal, still"  speaches_log_hint journald
eq  "Hinweis: kein Text bei journald"       "$(speaches_log_hint journald)" ""
no  "Hinweis: json-file meldet"             quiet speaches_log_hint json-file
yes "Hinweis: nennt den Treiber"            grep -q "nach 'json-file'" <<<"$(speaches_log_hint json-file)"
yes "Hinweis: leer heißt unbekannt"         grep -q "nach 'unbekannt'" <<<"$(speaches_log_hint '')"

printf 'a\n' > "$tmp/quelle"
yes "Kopieren: neue Datei"                  install_if_changed "$tmp/quelle" "$tmp/ziel"
eq  "Kopieren: Inhalt"                      "$(cat "$tmp/ziel")" a
eq  "Kopieren: Rechte 644"                  "$(stat -c %a "$tmp/ziel")" 644
no  "Kopieren: gleicher Inhalt, nichts tun" install_if_changed "$tmp/quelle" "$tmp/ziel"
printf 'b\n' > "$tmp/quelle"
yes "Kopieren: geänderter Inhalt"           install_if_changed "$tmp/quelle" "$tmp/ziel"
eq  "Kopieren: neuer Inhalt"                "$(cat "$tmp/ziel")" b
fehler=$( (install_if_changed "$tmp/quelle" "$tmp/gibt-es-nicht/ziel") 2>&1 )
yes "Kopieren: Fehler bricht ab"            grep -q '^FEHLER: Datei ließ sich nicht schreiben' <<<"$fehler"

# Der Schritt selbst, mit umgelenkten Pfaden und einer Attrappe für systemctl.
vorher=$fails
(
  JOURNALD_DROPIN="$tmp/sys/journald.conf.d/50-kunibert-frist.conf"
  RSYSLOG_FILTER="$tmp/sys/rsyslog.d/10-kunibert.conf"
  rsyslog_aktiv=0
  aufrufe="$tmp/systemctl.log"   # eigener Name: setup_log_retention hat ein lokales tmp
  systemctl() {
    if [[ "$1" == is-active ]]; then return "$rsyslog_aktiv"; fi
    printf '%s\n' "$*" >> "$aufrufe"
  }
  : > "$aufrufe"
  setup_log_retention >/dev/null
  eq  "Schritt: Journal-Datei angelegt"     "$(cat "$JOURNALD_DROPIN")" "$(write_journald_retention /dev/stdout)"
  eq  "Schritt: journald neu gestartet"     "$(cat "$aufrufe")" "restart systemd-journald"
  no  "Schritt: ohne rsyslog keine Regel"   test -e "$RSYSLOG_FILTER"
  : > "$aufrufe"
  setup_log_retention >/dev/null
  eq  "Schritt: zweiter Lauf startet nichts" "$(cat "$aufrufe")" ""
  mkdir -p "$(dirname "$RSYSLOG_FILTER")"
  setup_log_retention >/dev/null
  yes "Schritt: Regel angelegt"             grep -q 'then stop$' "$RSYSLOG_FILTER"
  eq  "Schritt: rsyslog läuft, Neustart"    "$(cat "$aufrufe")" "restart rsyslog"
  : > "$aufrufe"
  setup_log_retention >/dev/null
  eq  "Schritt: Regel da, kein Neustart"    "$(cat "$aufrufe")" ""
  : > "$aufrufe"; rm "$RSYSLOG_FILTER"; rsyslog_aktiv=3
  setup_log_retention >/dev/null
  yes "Schritt: Regel auch ohne laufendes rsyslog" test -s "$RSYSLOG_FILTER"
  eq  "Schritt: rsyslog aus, kein Neustart" "$(cat "$aufrufe")" ""
  [[ $fails -eq $vorher ]]
) || fails=$((fails + 1))

# Eltern-Steuerung (Punkt E2): Datei im StateDirectory des Dienstes (nur dort darf er schreiben),
# gleicher Pfad in Vorlage und Skript, Schlüssel in der Vorlage leer (kein Standardwert im Code).
state_dir=$(sed -n 's/^StateDirectory=//p' "$here/kunibert-server.service")
eq  "Eltern-Datei im StateDirectory"        "$(dirname "$ELTERN_DATEI")" "/var/lib/$state_dir"
eq  "Eltern-Datei: Vorlage wie Skript"      "$(env_get "$here/kunibert.env.example" KUNIBERT_ELTERN_DATEI)" "$ELTERN_DATEI"
yes "Eltern-Schlüssel steht leer in der Vorlage" grep -qx 'KUNIBERT_ELTERN_SCHLUESSEL=' "$here/kunibert.env.example"
eq  "Zustand nur für den Dienst lesbar"     "$(sed -n 's/^StateDirectoryMode=//p' "$here/kunibert-server.service")" 0700
write_env_body=$(sed -n '/^write_env() {/,/^}/p' "$here/setup-server.sh")
eq  "Vorlage: Proxy auf demselben Rechner"  "$(env_get "$here/kunibert.env.example" PICASTAI_TRUST_PROXY)" loopback
# shellcheck disable=SC2016
yes "Skript setzt den Proxy nur, wenn leer"  grep -qF 'env_set_if_empty "$ENV_FILE" PICASTAI_TRUST_PROXY loopback' <<<"$write_env_body"
# shellcheck disable=SC2016
yes "Skript erzeugt den Schlüssel nur, wenn er fehlt" grep -qF 'env_set_if_empty "$ENV_FILE" KUNIBERT_ELTERN_SCHLUESSEL "$(openssl rand -hex 32)"' <<<"$write_env_body"
cp "$here/kunibert.env.example" "$f"
yes "Schlüssel wird gesetzt, wenn leer"     env_set_if_empty "$f" KUNIBERT_ELTERN_SCHLUESSEL erster-schluessel
no  "Schlüssel bleibt, wenn gesetzt"        env_set_if_empty "$f" KUNIBERT_ELTERN_SCHLUESSEL zweiter-schluessel
eq  "Schlüssel unverändert"                 "$(env_get "$f" KUNIBERT_ELTERN_SCHLUESSEL)" erster-schluessel

# Kuniberts Stimme (Punkt N1124-1153-a): Dienstdatei, Skript, Server und Doku passen zusammen.
tts_unit="$here/kunibert-tts.service"
tts_exec=$(sed -n 's/^ExecStart=//p' "$tts_unit")
pocket_port=${POCKET_URL##*:}
eq  "Stimme: Dienst unter eigenem Konto"       "$(sed -n 's/^User=//p' "$tts_unit")" "$POCKET_USER"
eq  "Stimme: Gruppe wie Konto"                 "$(sed -n 's/^Group=//p' "$tts_unit")" "$POCKET_USER"
no  "Stimme: nicht das Konto des Servers"      test "$POCKET_USER" = "$(sed -n 's/^User=//p' "$here/kunibert-server.service")"
eq  "Stimme: Name der Dienstdatei"             "$(basename "$POCKET_UNIT")" "$POCKET_SERVICE.service"
eq  "Stimme: Dienstdatei im Repo heißt gleich" "$(basename "$tts_unit")" "$POCKET_SERVICE.service"
eq  "Stimme: Programm aus der eigenen Umgebung" "${tts_exec%% *}" "$POCKET_DIR/bin/pocket-tts"
yes "Stimme: nur 127.0.0.1"                    grep -qF -- '--host 127.0.0.1 ' <<<"$tts_exec "
yes "Stimme: Port wie PICASTAI_POCKET_TTS_URL"  grep -qF -- "--port $pocket_port " <<<"$tts_exec "
yes "Stimme: Standardstimme wie im Skript"     grep -qF -- "--default-voice $POCKET_VOICE " <<<"$tts_exec "
yes "Stimme: deutsches Modell"                 grep -qF -- '--language german ' <<<"$tts_exec "
no  "Stimme: nie auf allen Adressen"           grep -qE '0\.0\.0\.0|::' "$tts_unit"
eq  "Stimme: Adresse ohne Pfad"                "$POCKET_URL" "http://127.0.0.1:$pocket_port"
eq  "Stimme: Server kennt dieselbe Stimme"     "$(sed -n "s/^export const DEFAULT_POCKET_VOICE = '\(.*\)';/\1/p" "$here/../server-api/pocket-speech.ts")" "$POCKET_VOICE"
yes "Stimme: Version wie in der Checkliste"    grep -qF "pocket-tts@$POCKET_VERSION serve --language german --default-voice $POCKET_VOICE --host 127.0.0.1 --port $pocket_port" "$here/CHECKLISTE.md"
# Kein Protokoll ins Journal: Pocket TTS 4.0.1 schreibt bei langen Sätzen bis zu 50 Zeichen des Satzes in eine Warnung.
eq  "Stimme: Ausgabe nicht ins Journal"        "$(sed -n 's/^StandardOutput=//p' "$tts_unit")" null
eq  "Stimme: Fehlerausgabe nicht ins Journal"  "$(sed -n 's/^StandardError=//p' "$tts_unit")" null
eq  "Stimme: Zwischenspeicher im eigenen Ordner" "$(sed -n 's/^StateDirectory=//p' "$tts_unit")" "$POCKET_USER"
eq  "Stimme: Ordner nur für den Dienst"        "$(sed -n 's/^StateDirectoryMode=//p' "$tts_unit")" 0700
yes "Stimme: HOME im eigenen Ordner"           grep -qx "Environment=HOME=/var/lib/$POCKET_USER" "$tts_unit"
haertung() { grep -E '^(NoNewPrivileges|ProtectSystem|ProtectHome|PrivateTmp|ProtectKernelTunables|ProtectControlGroups|CapabilityBoundingSet|RestrictAddressFamilies)=' "$1"; }
eq  "Stimme: Härtung wie der Server"           "$(haertung "$tts_unit")" "$(haertung "$here/kunibert-server.service")"
eq  "Stimme: alle acht Zeilen der Härtung"     "$(haertung "$tts_unit" | wc -l)" 8
yes "Stimme: Speichergrenze"                   grep -qE '^MemoryMax=[0-9]+[MG]$' "$tts_unit"
yes "Hilfe nennt --skip-pocket"                grep -qF -- '--skip-pocket' <<<"$(usage)"

yes "Stimme: Startgrenze im Abschnitt [Unit]"   grep -qx 'StartLimitBurst=5' <<<"$(sed -n '/^\[Unit\]/,/^\[Service\]/p' "$tts_unit")"
yes "Stimme: Startgrenze zehn Minuten"         grep -qx 'StartLimitIntervalSec=10min' <<<"$(sed -n '/^\[Unit\]/,/^\[Service\]/p' "$tts_unit")"
install_body=$(sed -n '/^install_packages() {/,/^}/p' "$here/setup-server.sh")
# shellcheck disable=SC2016
eq  "Pakete: python3-venv nur ohne --skip-pocket" "$(grep -A1 '^  if \[\[ "\$SKIP_POCKET" == 0 \]\]; then$' <<<"$install_body" | tail -n 1)" '    apt-get install -y -qq python3 python3-venv >/dev/null'

cp "$here/kunibert.env.example" "$f"; chmod 600 "$f"
eq  "Vorlage: ohne Skript keine Pocket-Zeile"  "$(env_get "$f" PICASTAI_TTS_PROVIDER)" ""
eq  "Stimme: frische Datei, kein Hinweis"      "$(write_pocket_env "$f")" ""
eq  "Stimme: Anbieter pocket"                  "$(env_get "$f" PICASTAI_TTS_PROVIDER)" pocket
eq  "Stimme: Adresse gesetzt"                  "$(env_get "$f" PICASTAI_POCKET_TTS_URL)" "$POCKET_URL"
eq  "Stimme: Stimme gesetzt"                   "$(env_get "$f" PICASTAI_POCKET_TTS_VOICE)" "$POCKET_VOICE"
lines_before=$(wc -l < "$f")
eq  "Stimme: zweiter Lauf, kein Hinweis"       "$(write_pocket_env "$f")" ""
eq  "Stimme: zweiter Lauf, keine neue Zeile"   "$(wc -l < "$f")" "$lines_before"
for key in PICASTAI_TTS_PROVIDER PICASTAI_POCKET_TTS_URL PICASTAI_POCKET_TTS_VOICE; do
  eq "Stimme: genau eine Zeile $key"           "$(grep -c "^$key=" "$f")" 1
done
yes "Stimme: Kommentar der Vorlage bleibt"     grep -q '^# PICASTAI_TTS_PROVIDER=pocket' "$f"
eq  "Stimme: Rechte bleiben 600"               "$(stat -c %a "$f")" 600
# Eine andere Wahl wird ersetzt, aber das Skript sagt es (ohne Adressen zu nennen).
env_set "$f" PICASTAI_TTS_PROVIDER google
env_set "$f" PICASTAI_POCKET_TTS_VOICE 'hf://geheim/stimme.wav'
env_set "$f" PICASTAI_POCKET_TTS_URL 'http://127.0.0.1:9999'
hinweis=$(write_pocket_env "$f")
yes "Hinweis: Anbieter google ersetzt"         grep -qF "PICASTAI_TTS_PROVIDER war 'google', jetzt 'pocket'" <<<"$hinweis"
yes "Hinweis: Weg zur eigenen Wahl"            grep -qF -- '--skip-pocket' <<<"$hinweis"
yes "Hinweis: Stimme als Adresse"              grep -qF 'PICASTAI_POCKET_TTS_VOICE war eine Adresse' <<<"$hinweis"
yes "Hinweis: andere Adresse"                  grep -qF 'PICASTAI_POCKET_TTS_URL hatte einen anderen Wert' <<<"$hinweis"
no  "Hinweis: nennt keine Adressen"            grep -qE 'geheim|9999' <<<"$hinweis"
eq  "Hinweis: danach wieder pocket"            "$(env_get "$f" PICASTAI_TTS_PROVIDER)" pocket
env_set "$f" PICASTAI_TTS_PROVIDER 'x;y'
env_set "$f" PICASTAI_POCKET_TTS_VOICE anna
hinweis=$(write_pocket_env "$f")
yes "Hinweis: seltsamer Anbieter ohne Wert"    grep -qF 'PICASTAI_TTS_PROVIDER war ein anderer Wert' <<<"$hinweis"
yes "Hinweis: einfache Stimme mit Namen"       grep -qF "PICASTAI_POCKET_TTS_VOICE war 'anna'" <<<"$hinweis"

# write_env (mit umgelenkter Datei und Attrappen) fasst die drei Zeilen nie an: Das macht erst setup_pocket,
# wenn die Stimme antwortet. So behält ein Lauf mit --skip-pocket eine eigene Wahl.
vorher=$fails
(
  ENV_FILE="$tmp/env-write/kunibert.env"; mkdir -p "$tmp/env-write"
  APP_DIR="$here/.."; HOSTNAME_ARG=kunibert.picastai.com
  install() { cp "${@: -2:1}" "${@: -1}"; chmod 600 "${@: -1}"; }
  chown() { :; }
  openssl() { printf 'z%.0s' {1..64}; }
  write_env >/dev/null
  eq  "write_env: frische Datei ohne Pocket-Zeilen" "$(env_get "$ENV_FILE" PICASTAI_TTS_PROVIDER)" ""
  eq  "write_env: Token erzeugt"              "$(env_get "$ENV_FILE" PICASTAI_DEVICE_TOKEN | wc -c)" 64
  env_set "$ENV_FILE" PICASTAI_TTS_PROVIDER google
  write_env >/dev/null
  eq  "write_env: eigene Wahl google bleibt"  "$(env_get "$ENV_FILE" PICASTAI_TTS_PROVIDER)" google
  [[ $fails -eq $vorher ]]
) || fails=$((fails + 1))

no  "installiert: leere Umgebung"              pocket_installed "$tmp/venv" "$POCKET_VERSION"
mkdir -p "$tmp/venv/bin" "$tmp/venv/lib/python3.11/site-packages/pocket_tts-4.0.0.dist-info"
: > "$tmp/venv/lib/python3.11/site-packages/pocket_tts-4.0.0.dist-info/METADATA"
printf '#!/bin/sh\n' > "$tmp/venv/bin/python3"; chmod +x "$tmp/venv/bin/python3"
no  "installiert: andere Version zählt nicht"  pocket_installed "$tmp/venv" 4.0.1
mkdir -p "$tmp/venv/lib/python3.11/site-packages/pocket_tts-4.0.1.dist-info"
no  "installiert: Ordner ohne METADATA zählt nicht" pocket_installed "$tmp/venv" 4.0.1
: > "$tmp/venv/lib/python3.11/site-packages/pocket_tts-4.0.1.dist-info/METADATA"
yes "installiert: diese Version"               pocket_installed "$tmp/venv" 4.0.1
rm "$tmp/venv/bin/python3"; ln -s "$tmp/gibt-es-nicht/python3.11" "$tmp/venv/bin/python3"
no  "installiert: Python zeigt ins Leere"      pocket_installed "$tmp/venv" 4.0.1

# Trockenlauf des Schritts: umgelenkte Pfade, Attrappen für id, useradd, python3, pip, systemctl, curl und sleep.
vorher=$fails
(
  APP_DIR="$here/.."
  POCKET_DIR="$tmp/opt/pocket-tts"
  POCKET_UNIT="$tmp/sys/kunibert-tts.service"
  POCKET_WAIT_TRIES=3
  ENV_FILE="$tmp/pocket.env"
  mkdir -p "$tmp/sys"
  aufrufe="$tmp/pocket.log"
  curl_log="$tmp/curl.log"
  export PIP_LOG="$tmp/pip.log"
  aktiv=0; gesund=0; steigend=0
  printf '7' > "$tmp/nrestarts"   # alte Neustarts aus früheren Tagen zählen nicht
  # Zustand in Dateien: Die Läufe unten laufen in eigenen Subshells (ein Abbruch soll als FAIL sichtbar sein).
  id() { printf 'id %s\n' "$*" >> "$aufrufe"; [[ -e "$tmp/konto" ]]; }
  useradd() { printf 'useradd %s\n' "$*" >> "$aufrufe"; : > "$tmp/konto"; }
  lauf() { (setup_pocket >/dev/null 2>&1) || bad "Trockenlauf: Schritt brach ab ($1)"; }
  python3() {
    printf 'python3 %s\n' "$*" >> "$aufrufe"
    [[ "$1 $2" == "-m venv" ]] || return 99
    mkdir -p "$3/bin" "$3/lib/python3.12/site-packages"
    printf '#!/bin/sh\n' > "$3/bin/python3"; chmod +x "$3/bin/python3"
    # shellcheck disable=SC2016
    printf '%s\n' '#!/usr/bin/env bash' 'printf "pip %s\n" "$*" >> "$PIP_LOG"' \
      'for a in "$@"; do case "$a" in pocket-tts==*) d="$(dirname "$0")/../lib/python3.12/site-packages/pocket_tts-${a#pocket-tts==}.dist-info"; mkdir -p "$d"; : > "$d/METADATA";; esac; done' \
      > "$3/bin/pip"
    chmod +x "$3/bin/pip"
  }
  systemctl() {
    if [[ "$1" == is-active ]]; then return "$aktiv"; fi
    if [[ "$1" == show ]]; then
      local n; n=$(cat "$tmp/nrestarts"); printf '%s\n' "$n"
      if [[ "$steigend" == 1 ]]; then printf '%s' "$((n + 1))" > "$tmp/nrestarts"; fi
      return 0
    fi
    printf 'systemctl %s\n' "$*" >> "$aufrufe"
  }
  gesund_ab=0   # >0: erst ab diesem Aufruf antwortet /health (Dienst lädt noch)
  curl() {
    printf '%s\n' "$*" >> "$curl_log"
    if (( gesund_ab > 0 )); then gesund_ab=$((gesund_ab - 1)); (( gesund_ab == 0 )) || return 7; fi
    [[ "$gesund" == 1 && "$*" == *"$POCKET_URL/health"* ]]
  }
  sleep() { :; }
  start="systemctl reset-failed $POCKET_SERVICE;systemctl restart $POCKET_SERVICE;"
  cp "$here/kunibert.env.example" "$ENV_FILE"
  : > "$aufrufe"; : > "$PIP_LOG"; : > "$curl_log"; gesund=1
  lauf "erster Lauf"
  yes "Trockenlauf: Konto angelegt"            grep -qx "useradd --system --home-dir /var/lib/$POCKET_USER --shell /usr/sbin/nologin $POCKET_USER" "$aufrufe"
  yes "Trockenlauf: Umgebung angelegt"         grep -qx "python3 -m venv $POCKET_DIR" "$aufrufe"
  yes "Trockenlauf: PyTorch ohne Grafikkarte"  grep -qx "pip install --quiet --disable-pip-version-check --index-url $TORCH_INDEX torch>=2.5" "$PIP_LOG"
  yes "Trockenlauf: feste Version"             grep -qx "pip install --quiet --disable-pip-version-check pocket-tts==$POCKET_VERSION" "$PIP_LOG"
  eq  "Trockenlauf: PyTorch zuerst"            "$(head -n 1 "$PIP_LOG")" "pip install --quiet --disable-pip-version-check --index-url $TORCH_INDEX torch>=2.5"
  eq  "Trockenlauf: Dienstdatei eingetragen"   "$(cat "$POCKET_UNIT")" "$(cat "$tts_unit")"
  eq  "Trockenlauf: Dienst neu geladen, an, gestartet" "$(grep '^systemctl' "$aufrufe" | tr '\n' ';')" "systemctl daemon-reload;systemctl enable --quiet $POCKET_SERVICE;$start"
  yes "Trockenlauf: fragt /health mit Zeitgrenze" grep -qxF -- "-fsS --max-time 5 -o /dev/null $POCKET_URL/health" "$curl_log"
  eq  "Trockenlauf: setzt danach den Anbieter"  "$(env_get "$ENV_FILE" PICASTAI_TTS_PROVIDER)" pocket
  eq  "Trockenlauf: setzt danach die Adresse"   "$(env_get "$ENV_FILE" PICASTAI_POCKET_TTS_URL)" "$POCKET_URL"
  eq  "Trockenlauf: setzt danach die Stimme"    "$(env_get "$ENV_FILE" PICASTAI_POCKET_TTS_VOICE)" "$POCKET_VOICE"
  : > "$aufrufe"; : > "$PIP_LOG"; aktiv=0
  lauf "zweiter Lauf"
  no  "zweiter Lauf: kein neues Konto"         grep -q '^useradd' "$aufrufe"
  eq  "zweiter Lauf: nichts installiert"       "$(cat "$PIP_LOG")" ""
  no  "zweiter Lauf: Umgebung bleibt"          grep -q '^python3' "$aufrufe"
  eq  "zweiter Lauf: kein Neustart"            "$(grep '^systemctl' "$aufrufe" | tr '\n' ';')" "systemctl enable --quiet $POCKET_SERVICE;"
  : > "$aufrufe"; aktiv=3
  lauf "Dienst aus"
  eq  "Dienst läuft nicht: Neustart"           "$(grep '^systemctl' "$aufrufe" | tr '\n' ';')" "systemctl enable --quiet $POCKET_SERVICE;$start"
  : > "$aufrufe"; aktiv=0; printf '# alt\n' > "$POCKET_UNIT"
  lauf "Dienstdatei geändert"
  eq  "Dienstdatei geändert: neu laden und starten" "$(grep '^systemctl' "$aufrufe" | tr '\n' ';')" "systemctl daemon-reload;systemctl enable --quiet $POCKET_SERVICE;$start"
  : > "$aufrufe"; : > "$PIP_LOG"; rm -rf "$POCKET_DIR/lib/python3.12/site-packages/pocket_tts-$POCKET_VERSION.dist-info"; touch "$POCKET_DIR/rest"
  lauf "andere Version"
  no  "andere Version: alte Umgebung weg"      test -e "$POCKET_DIR/rest"
  yes "andere Version: neu installiert"        grep -q "pocket-tts==$POCKET_VERSION" "$PIP_LOG"
  yes "andere Version: Neustart"               grep -qx "systemctl restart $POCKET_SERVICE" "$aufrufe"
  eq  "andere Version: erst stoppen, dann löschen" "$(grep -m1 '^systemctl' "$aufrufe")" "systemctl stop $POCKET_SERVICE"
  # Scheitert der Schritt, bleibt die env-Datei, wie sie war (Kunibert spricht weiter mit der bisherigen Stimme).
  cp "$here/kunibert.env.example" "$ENV_FILE"; env_set "$ENV_FILE" PICASTAI_TTS_PROVIDER google; cp "$ENV_FILE" "$tmp/pocket.env.vorher"
  gesund=0
  ausgabe=$( (setup_pocket) 2>&1 )
  yes "keine Antwort: Abbruch mit Fehler"      grep -q '^FEHLER: Die Stimme antwortet nicht' <<<"$ausgabe"
  yes "keine Antwort: Befehl zur Fehlersuche"  grep -qF "sudo -u $POCKET_USER env HOME=/var/lib/$POCKET_USER $POCKET_DIR/bin/pocket-tts serve" <<<"$ausgabe"
  yes "keine Antwort: Hinweis, kein Gerät benutzen" grep -qF 'kein Gerät benutzen' <<<"$ausgabe"
  yes "keine Antwort: env-Datei unverändert"   cmp -s "$ENV_FILE" "$tmp/pocket.env.vorher"
  steigend=1; printf '0' > "$tmp/nrestarts"
  ausgabe=$( (setup_pocket) 2>&1 )
  yes "Neustarts: früher Abbruch"              grep -q '^FEHLER: Die Stimme bricht beim Start immer wieder ab (2 Neustarts)' <<<"$ausgabe"
  yes "Neustarts: env-Datei unverändert"       cmp -s "$ENV_FILE" "$tmp/pocket.env.vorher"
  steigend=0; gesund=1; aktiv=3; printf '7' > "$tmp/nrestarts"; gesund_ab=3
  hinweis=$(setup_pocket)
  yes "lädt noch, alte Neustarts: kein Abbruch" grep -qF 'Stimme antwortet' <<<"$hinweis"
  yes "danach Erfolg: Hinweis auf ersetztes google" grep -qF "PICASTAI_TTS_PROVIDER war 'google'" <<<"$hinweis"
  eq  "danach Erfolg: Anbieter pocket"         "$(env_get "$ENV_FILE" PICASTAI_TTS_PROVIDER)" pocket
  [[ $fails -eq $vorher ]]
) || fails=$((fails + 1))

# Aufruf ohne Hostname bricht ab, bevor etwas geändert wird.
no  "ohne --hostname: Abbruch"     quiet bash "$here/setup-server.sh"
no  "ungültiger Hostname: Abbruch" quiet bash "$here/setup-server.sh" --hostname 'x;y'
no  "unbekannte Option: Abbruch"   quiet bash "$here/setup-server.sh" --hostname a.example --gibt-es-nicht

if [[ $fails -gt 0 ]]; then printf '\n%d Test(s) fehlgeschlagen\n' "$fails"; exit 1; fi
printf '\nalle Tests bestanden\n'
