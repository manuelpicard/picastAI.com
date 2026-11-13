#!/usr/bin/env bash
# Tests für die Hilfsfunktionen in setup-server.sh. Ändert nichts am System.
#   bash deploy/setup-server.test.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/setup-server.sh
source "$here/setup-server.sh"
set +e

fails=0
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

# Aufruf ohne Hostname bricht ab, bevor etwas geändert wird.
quiet() { "$@" >/dev/null 2>&1; }
no  "ohne --hostname: Abbruch"     quiet bash "$here/setup-server.sh"
no  "ungültiger Hostname: Abbruch" quiet bash "$here/setup-server.sh" --hostname 'x;y'
no  "unbekannte Option: Abbruch"   quiet bash "$here/setup-server.sh" --hostname a.example --gibt-es-nicht

if [[ $fails -gt 0 ]]; then printf '\n%d Test(s) fehlgeschlagen\n' "$fails"; exit 1; fi
printf '\nalle Tests bestanden\n'
