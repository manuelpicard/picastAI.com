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
# shellcheck disable=SC2016
yes "Skript erzeugt den Schlüssel nur, wenn er fehlt" grep -qF 'env_set_if_empty "$ENV_FILE" KUNIBERT_ELTERN_SCHLUESSEL "$(openssl rand -hex 32)"' <<<"$write_env_body"
cp "$here/kunibert.env.example" "$f"
yes "Schlüssel wird gesetzt, wenn leer"     env_set_if_empty "$f" KUNIBERT_ELTERN_SCHLUESSEL erster-schluessel
no  "Schlüssel bleibt, wenn gesetzt"        env_set_if_empty "$f" KUNIBERT_ELTERN_SCHLUESSEL zweiter-schluessel
eq  "Schlüssel unverändert"                 "$(env_get "$f" KUNIBERT_ELTERN_SCHLUESSEL)" erster-schluessel

# Aufruf ohne Hostname bricht ab, bevor etwas geändert wird.
no  "ohne --hostname: Abbruch"     quiet bash "$here/setup-server.sh"
no  "ungültiger Hostname: Abbruch" quiet bash "$here/setup-server.sh" --hostname 'x;y'
no  "unbekannte Option: Abbruch"   quiet bash "$here/setup-server.sh" --hostname a.example --gibt-es-nicht

if [[ $fails -gt 0 ]]; then printf '\n%d Test(s) fehlgeschlagen\n' "$fails"; exit 1; fi
printf '\nalle Tests bestanden\n'
