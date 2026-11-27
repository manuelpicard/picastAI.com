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
no  "Hostname mit Umlaut"         valid_hostname kunibert.bücher.example
# Zeichenbereiche nur unter LC_ALL=C (Punkt N1126-1338-c): In de_DE.UTF-8 (und wohl auch en_US.UTF-8)
# träfe [A-Za-z0-9] in bash sonst auch Umlaute. Fehlen beide Sprachumgebungen, sagt der Test es.
utf8=""
for loc in de_DE.UTF-8 en_US.UTF-8; do
  if locale -a 2>/dev/null | grep -qiE "^${loc%%.*}\.utf-?8$"; then utf8=$loc; break; fi
done
if [[ -n "$utf8" ]]; then
  # shellcheck disable=SC2016
  no "Hostname mit Umlaut in $utf8" env LC_ALL="$utf8" bash -c 'source "$1"; valid_hostname kunibert.bücher.example' _ "$here/setup-server.sh"
  # shellcheck disable=SC2016
  no "Hostname mit ß in $utf8"      env LC_ALL="$utf8" bash -c 'source "$1"; valid_hostname straße.example' _ "$here/setup-server.sh"
  if env LC_ALL="$utf8" bash -c '[[ ü =~ ^[A-Za-z]$ ]]'; then
    ok "$utf8: [A-Za-z] trifft dort ü, die Prüfung unter LC_ALL=C ist nötig"
  else
    printf 'Hinweis: In %s trifft [A-Za-z] kein ü; der Test zeigt dort nur, dass kein Umlaut durchgeht.\n' "$utf8"
  fi
else
  printf 'OFFEN Hostname mit Umlaut in de_DE.UTF-8 oder en_US.UTF-8: keine der beiden Sprachumgebungen ist installiert (locale -a).\n'
fi

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

# env-Zeilen wie systemd (Punkt N1126-1338-c): Einrückung und Leerzeichen oder Tabs um „=“ zählen
# nicht, die letzte Zeile gilt. U+3000 vor „=“ macht keinen Namen (wie systemd). Mit mawk zeigt das wenig
# (mawk kennt kein UTF-8); der awk-Vergleich weiter unten prüft es auch mit gawk.
cp "$here/kunibert.env.example" "$f"; chmod 600 "$f"
sed -i 's/^NODE_ENV=.*/  NODE_ENV = development/' "$f"
printf 'PICASTAI_STT_MODEL\t=\tmodell-a\nPICASTAI_STT_MODEL = modell-b\n' >> "$f"
printf 'KUNIBERT_PROBE_U3000\xe3\x80\x80= wert\n' >> "$f"
eq "env_get: eingerückt, Leerzeichen um ="        "$(env_get "$f" NODE_ENV)" development
eq "env_get: Tab um =, die letzte Zeile gilt"     "$(env_get "$f" PICASTAI_STT_MODEL)" modell-b
eq "env_get: Anfang eines Namens zählt nicht"      "$(env_get "$f" NODE)" ""
eq "env_get: U+3000 vor = macht keinen Namen"     "$(LC_ALL=C.UTF-8 env_get "$f" KUNIBERT_PROBE_U3000)" ""
eq "env_get: fehlende Datei ist leer"             "$(env_get "$tmp/gibt-es-nicht.env" NODE_ENV)" ""
env_set "$f" NODE_ENV production
eq "env_set: Zeile mit Leerzeichen ersetzt"       "$(env_get "$f" NODE_ENV)" production
eq "env_set: genau eine Zeile NODE_ENV"           "$(grep -cE '^[[:space:]]*NODE_ENV[[:blank:]]*=' "$f")" 1
yes "env_set: als NAME=wert"                      grep -qx 'NODE_ENV=production' "$f"
env_set "$f" PICASTAI_STT_MODEL modell-c
eq "env_set: weitere Zeilen des Namens weg"       "$(grep -cE '^[[:space:]]*PICASTAI_STT_MODEL[[:blank:]]*=' "$f")" 1
eq "env_set: der neue Wert gilt"                  "$(env_get "$f" PICASTAI_STT_MODEL)" modell-c
yes "env_set: Kommentarzeile bleibt"              grep -q '^# PICASTAI_TTS_PROVIDER=google' "$f"
printf '  HOST = 0.0.0.0\nKEIN NAME = x\n' >> "$f"
cp "$f" "$tmp/vor-normalize.env"
yes "env_normalize: ändert Zeilen mit Leerzeichen" env_normalize "$f"
yes "env_normalize: als NAME=wert"                grep -qx 'HOST=0.0.0.0' "$f"
yes "env_normalize: Zeile ohne gültigen Namen bleibt" grep -qx 'KEIN NAME = x' "$f"
yes "env_normalize: U+3000-Zeile bleibt"          grep -qF $'KUNIBERT_PROBE_U3000\xe3\x80\x80= wert' "$f"
eq "env_normalize: Zeilenzahl gleich"             "$(wc -l < "$f")" "$(wc -l < "$tmp/vor-normalize.env")"
eq "env_normalize: Rechte bleiben 600"            "$(stat -c %a "$f")" 600
no "env_normalize: zweiter Lauf ändert nichts"    env_normalize "$f"

# Windows-Zeilenenden, Leerzeichen am Ende, „=“ im Wert, eingerückte Kommentare und leere Werte in
# Anführungszeichen (Prüfung von PR #132, Befunde 2 und 4). systemd liest "" und '' als leer.
printf 'A=eins\r\nB =  zwei \t\r\nC = ab = cd==\r\nD=\r\nE = ""\r\nF='"''"'\r\nG=" "\r\nH="x"\r\n' > "$f"
printf '  # I=kommentar\r\n\t; J=kommentar\r\nK="\r\n' >> "$f"
eq "env_get: CR am Zeilenende gehört nicht zum Wert"  "$(env_get "$f" A)" eins
eq "env_get: Leerzeichen und Tab am Ende zählen nicht" "$(env_get "$f" B)" zwei
eq "env_get: = im Wert bleibt"                         "$(env_get "$f" C)" "ab = cd=="
eq "env_get: nur CR ist leer"                          "$(env_get "$f" D)" ""
eq "env_get: Anführungszeichen bleiben stehen"         "$(env_get "$f" E)" '""'
eq "env_get: eingerückter #-Kommentar ist kein Wert"   "$(env_get "$f" I)" ""
eq "env_get: eingerückter ;-Kommentar ist kein Wert"   "$(env_get "$f" J)" ""
yes "env_empty: nichts"                    env_empty ""
yes 'env_empty: ""'                        env_empty '""'
yes "env_empty: ''"                        env_empty "''"
yes 'env_empty: " " (der Server schneidet Leerzeichen ab)' env_empty '" "'
no  "env_empty: Wert"                      env_empty x
no  'env_empty: "x"'                       env_empty '"x"'
no  "env_empty: ein Anführungszeichen"     env_empty '"'
no  "env_empty: '\"'"                      env_empty "'\"'"
yes 'env_set_if_empty: "" gilt als leer'   env_set_if_empty "$f" E neu-e
yes "env_set_if_empty: '' gilt als leer"   env_set_if_empty "$f" F neu-f
yes "env_set_if_empty: nur CR gilt als leer" env_set_if_empty "$f" D neu-d
no  'env_set_if_empty: "x" bleibt'         env_set_if_empty "$f" H neu-h
no  "env_set_if_empty: ein Anführungszeichen bleibt" env_set_if_empty "$f" K neu-k
eq "env_set_if_empty: neuer Wert für E"    "$(env_get "$f" E)" neu-e
eq "env_set_if_empty: eine Zeile für D, E und F" "$(grep -cE '^(D|E|F)[[:blank:]]*=' "$f")" 3
eq "env_set_if_empty: H unverändert"       "$(env_get "$f" H)" '"x"'
yes "env_normalize: mit CRLF"              env_normalize "$f"
yes "env_normalize: CR am Ende bleibt"     grep -qx $'B=zwei \t\r' "$f"
yes "env_normalize: = im Wert bleibt"      grep -qx $'C=ab = cd==\r' "$f"
yes "env_normalize: Kommentare bleiben"    grep -qx $'  # I=kommentar\r' "$f"

# write_env mit Werten in der Schreibweise NAME = wert (mit umgelenkter Datei und Attrappen): Tokens und
# Schlüssel bleiben, kein zweites Token wird angehängt, keines steht in der Ausgabe.
vorher=$fails
(
  ENV_FILE="$tmp/env-leerzeichen/kunibert.env"; mkdir -p "$tmp/env-leerzeichen"
  APP_DIR="$here/.."; HOSTNAME_ARG=kunibert.picastai.com
  install() { cp "${@: -2:1}" "${@: -1}"; chmod 600 "${@: -1}"; }
  chown() { :; }
  openssl() { printf 'neutoken%.0s' {1..8}; }
  cp "$here/kunibert.env.example" "$ENV_FILE"; chmod 600 "$ENV_FILE"
  sed -i 's/^PICASTAI_DEVICE_TOKEN=.*/PICASTAI_DEVICE_TOKEN = "alt-geraete-token"/' "$ENV_FILE"
  sed -i 's/^PICASTAI_ADMIN_TOKEN=.*/\tPICASTAI_ADMIN_TOKEN\t=\talt-admin-token/' "$ENV_FILE"
  sed -i 's/^KUNIBERT_ELTERN_SCHLUESSEL=.*/KUNIBERT_ELTERN_SCHLUESSEL = alt-eltern-schluessel/' "$ENV_FILE"
  ausgabe=$(write_env 2>&1)
  eq  "write_env: genau eine Zeile für das Geräte-Token" "$(grep -cE '^[[:space:]]*PICASTAI_DEVICE_TOKEN[[:blank:]]*=' "$ENV_FILE")" 1
  yes "write_env: altes Geräte-Token bleibt, als NAME=wert" grep -qx 'PICASTAI_DEVICE_TOKEN="alt-geraete-token"' "$ENV_FILE"
  eq  "write_env: genau eine Zeile für das Admin-Token" "$(grep -cE '^[[:space:]]*PICASTAI_ADMIN_TOKEN[[:blank:]]*=' "$ENV_FILE")" 1
  eq  "write_env: altes Admin-Token bleibt"   "$(env_get "$ENV_FILE" PICASTAI_ADMIN_TOKEN)" alt-admin-token
  eq  "write_env: alter Eltern-Schlüssel bleibt" "$(env_get "$ENV_FILE" KUNIBERT_ELTERN_SCHLUESSEL)" alt-eltern-schluessel
  no  "write_env: kein neues Token erzeugt"   grep -qE 'erzeugt|neutoken' <<<"$ausgabe"
  no  "write_env: kein Token in der Ausgabe"  grep -qE 'alt-geraete-token|alt-admin-token|alt-eltern-schluessel|neutoken' <<<"$ausgabe"
  yes "write_env: meldet das Angleichen"      grep -qF 'Schreibweise der Zeilen angeglichen' <<<"$ausgabe"
  eq  "write_env: keine Zeile mit Leerzeichen vor = mehr" "$(grep -cE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:blank:]]+=' "$ENV_FILE")" 0
  ausgabe=$(write_env 2>&1)
  no  "write_env: zweiter Lauf gleicht nichts mehr an" grep -qF 'Schreibweise der Zeilen angeglichen' <<<"$ausgabe"
  yes "write_env: zweiter Lauf, Token bleibt" grep -qx 'PICASTAI_DEVICE_TOKEN="alt-geraete-token"' "$ENV_FILE"
  [[ $fails -eq $vorher ]]
) || fails=$((fails + 1))

# write_env mit Windows-Zeilenenden und einem leeren Wert in Anführungszeichen: Tokens und Schlüssel werden
# erzeugt (systemd läse sonst leere Werte), je genau eine Zeile, der Schlüssel für Claude bleibt leer.
vorher=$fails
(
  ENV_FILE="$tmp/env-crlf/kunibert.env"; mkdir -p "$tmp/env-crlf"
  APP_DIR="$here/.."; HOSTNAME_ARG=kunibert.picastai.com
  install() { cp "${@: -2:1}" "${@: -1}"; chmod 600 "${@: -1}"; }
  chown() { :; }
  openssl() { printf 'neutoken%.0s' {1..8}; }
  awk '{ printf "%s\r\n", $0 }' "$here/kunibert.env.example" > "$ENV_FILE"; chmod 600 "$ENV_FILE"
  awk '/^PICASTAI_ADMIN_TOKEN=/ { printf "PICASTAI_ADMIN_TOKEN = \"\"\r\n"; next } { print }' "$ENV_FILE" > "$ENV_FILE.neu"
  mv "$ENV_FILE.neu" "$ENV_FILE"
  ausgabe=$(write_env 2>&1)
  for k in PICASTAI_ADMIN_TOKEN PICASTAI_DEVICE_TOKEN KUNIBERT_ELTERN_SCHLUESSEL; do
    eq "write_env (CRLF): genau eine Zeile $k" "$(grep -cE "^[[:space:]]*${k}[[:blank:]]*=" "$ENV_FILE")" 1
    eq "write_env (CRLF): $k erzeugt"          "$(env_get "$ENV_FILE" "$k")" "$(openssl)"
  done
  eq  "write_env (CRLF): Schlüssel für Claude bleibt leer" "$(env_get "$ENV_FILE" ANTHROPIC_API_KEY)" ""
  yes "write_env (CRLF): meldet das Geräte-Token"   grep -qF 'Geräte-Token erzeugt' <<<"$ausgabe"
  no  "write_env (CRLF): kein Token in der Ausgabe" grep -q neutoken <<<"$ausgabe"
  [[ $fails -eq $vorher ]]
) || fails=$((fails + 1))

# Schreibfehler (Platte voll, keine Zwischendatei): Das Skript bricht ab, und die env-Datei bleibt Byte für
# Byte, wie sie war, auch wenn die Funktion in einem if läuft (dort greift set -e nicht; Prüfung von
# PR #132, Befund 1). „attrappe“: awk gibt eine halbe Zeile aus und scheitert, auch beim Lesen (dann darf
# env_set_if_empty kein Token ersetzen); „voll“: ulimit -f 0, das echte awk scheitert beim Schreiben;
# „mktemp“: keine Zwischendatei. Ausgabe: Meldungen, zuletzt „weiter“, wenn die Funktion nicht abbrach.
schreibfehler() { # Art Befehl …
  local art=$1; shift
  (
    case $art in
      attrappe) awk() { printf 'HALB'; return 2; } ;;
      voll) ulimit -f 0 ;;
      mktemp) mktemp() { return 1; } ;;
    esac
    if "$@"; then :; fi
    echo weiter
  ) 2>&1
}
cp "$here/kunibert.env.example" "$f"; chmod 600 "$f"
printf 'PICASTAI_ADMIN_TOKEN = geheim-alt\nPICASTAI_DEVICE_TOKEN=""\n' >> "$f"
cp "$f" "$tmp/vor-fehler.env"
for art in attrappe voll mktemp; do
  for befehl in "env_normalize $f" "env_set_if_empty $f PICASTAI_DEVICE_TOKEN neu-geheim" \
      "env_set_if_empty $f KUNIBERT_ELTERN_SCHLUESSEL neu-geheim" "env_set $f NODE_ENV production"; do
    read -r -a teile <<<"$befehl"   # Pfade ohne Leerzeichen
    name=${teile[0]}
    if [[ $name == env_set_if_empty ]]; then name+=" ${teile[2]}"; fi
    meldung=$(schreibfehler "$art" "${teile[@]}")
    yes "Schreibfehler ($art, $name): Datei unverändert" cmp -s "$f" "$tmp/vor-fehler.env"
    no  "Schreibfehler ($art, $name): bricht ab"         grep -qx weiter <<<"$meldung"
    yes "Schreibfehler ($art, $name): sagt es"           grep -qF '(sie ist unverändert)' <<<"$meldung"
    no  "Schreibfehler ($art, $name): kein Wert in der Meldung" grep -qE 'geheim|neu-geheim' <<<"$meldung"
    eq  "Schreibfehler ($art, $name): keine Zwischendatei bleibt" "$(compgen -G "$f.??????" || true)" ""
    cp "$tmp/vor-fehler.env" "$f"
  done
done

# Dieselben Ergebnisse mit mawk und gawk (Debian und Ubuntu bringen je nach Bild das eine oder das andere
# mit). Läuft unter C.UTF-8, damit gawk dort Zeichen wie U+3000 als Leerzeichen kennen würde.
awk_probe() {
  local d; d=$(mktemp -d "$tmp/awk.XXXXXX")
  printf '%s\n' '  A = 1' $'B\t=\t2 ' 'C = ab = cd==' $'D=\r' 'E = ""' '  # F=x' $'\t; G=x' \
    $'H\xe3\x80\x80= u' $'\vI=x' 'B = 3' 'K=ä ö ü ß' > "$d/e.env"
  local k
  for k in A B C D E F G H I K; do printf '%s|' "$(env_get "$d/e.env" "$k")"; done
  printf '\n'
  env_normalize "$d/e.env" || true
  env_set "$d/e.env" B 4
  cat "$d/e.env"
}
awk_erwartet=$(printf '%s\n' '1|3|ab = cd==||""|||||ä ö ü ß|' 'A=1' 'B=4' 'C=ab = cd==' $'D=\r' 'E=""' '  # F=x' \
  $'\t; G=x' $'H\xe3\x80\x80= u' $'\vI=x' 'K=ä ö ü ß')
utf8_c=C
if locale -a 2>/dev/null | grep -qiE '^c\.utf-?8$'; then utf8_c=C.UTF-8; fi
eq "awk-Vergleich: $(readlink -f "$(command -v awk)") ($utf8_c)" "$(LC_ALL=$utf8_c awk_probe)" "$awk_erwartet"
for impl in mawk gawk; do
  if ! pfad=$(command -v "$impl"); then printf 'OFFEN awk-Vergleich: %s nicht installiert\n' "$impl"; continue; fi
  mkdir -p "$tmp/awk-$impl"; ln -sf "$pfad" "$tmp/awk-$impl/awk"
  eq "awk-Vergleich: $impl ($utf8_c)" "$(PATH="$tmp/awk-$impl:$PATH"; hash -r; LC_ALL=$utf8_c awk_probe)" "$awk_erwartet"
done

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

# Rückfall-Stimme Piper (Punkt N1126-1600-a): ohne Schalter keine Stimme im Sprachserver (Risiko L1,
# docs/recherche/lizenzen-sprachbausteine.md). Optionen ohne main: Als root würde main wirklich einrichten.
optionen() { (parse_args "$@"; printf '%s|%s' "$TTS_MODEL" "$TTS_VOICE"); }
tts_paar() { (TTS_MODEL=$1; TTS_VOICE=$2; check_tts_options); }
eq  "Rückfall: Standard ohne Stimme im Sprachserver" "$TTS_MODEL|$TTS_VOICE" "|"
eq  "Rückfall: Piper-Modell wie bisher"        "$PIPER_MODEL|$PIPER_VOICE" "speaches-ai/piper-de_DE-thorsten-medium|thorsten"
eq  "Optionen: ohne Schalter keine Stimme"     "$(optionen --hostname kunibert.picastai.com)" "|"
eq  "Optionen: --piper-fallback lädt Piper"    "$(optionen --hostname kunibert.picastai.com --piper-fallback)" "$PIPER_MODEL|$PIPER_VOICE"
eq  "Optionen: eigenes Modell"                 "$(optionen --tts-model hexgrad/Kokoro-82M --tts-voice af_heart)" "hexgrad/Kokoro-82M|af_heart"
eq  "Optionen: das Letzte gilt"                "$(optionen --piper-fallback --tts-model m --tts-voice v)" "m|v"
eq  "Optionen: andere Optionen ändern nichts"  "$(optionen --skip-pocket --skip-caddy --stt-model x)" "|"
yes "Optionen: Paar leer passt"                quiet tts_paar "" ""
yes "Optionen: Piper-Paar passt"               quiet tts_paar "$PIPER_MODEL" "$PIPER_VOICE"
no  "Optionen: Modell ohne Stimme bricht ab"   quiet tts_paar m ""
no  "Optionen: Stimme ohne Modell bricht ab"   quiet tts_paar "" v
yes "Optionen: Meldung zum fehlenden Namen"    grep -qF -- '--tts-voice fehlt (zu --tts-model m)' <<<"$(tts_paar m "" 2>&1)"
yes "Optionen: Meldung zum fehlenden Modell"   grep -qF -- '--tts-model fehlt (zu --tts-voice v)' <<<"$(tts_paar "" v 2>&1)"
yes "Hilfe nennt --piper-fallback"             grep -qF -- '--piper-fallback' <<<"$(usage)"
yes "Hilfe nennt die Lizenzlage"               grep -qF 'docs/recherche/lizenzen-sprachbausteine.md' <<<"$(usage)"
yes "Recherche zur Lizenz liegt im Repo"       test -f "$here/../docs/recherche/lizenzen-sprachbausteine.md"
main_args=$(grep -n -m1 'parse_args "\$@"' <<<"$main_body" | cut -d: -f1)
main_check=$(grep -n -m1 '^  check_tts_options$' <<<"$main_body" | cut -d: -f1)
main_root=$(grep -n -m1 'EUID' <<<"$main_body" | cut -d: -f1)
yes "main: erst Optionen, dann Prüfung"        vor "$main_args" "$main_check"
yes "main: Stimme geprüft, bevor etwas passiert" vor "$main_check" "$main_root"
yes "Warnung: Piper nennt das Risiko"          grep -qF 'Risiko L1' <<<"$(piper_warning "$PIPER_MODEL")"
yes "Warnung: Piper nennt die Recherche"       grep -qF 'docs/recherche/lizenzen-sprachbausteine.md' <<<"$(piper_warning "$PIPER_MODEL")"
yes "Warnung: nicht für ein verkauftes Gerät"  grep -qF 'Nicht für ein verkauftes Gerät' <<<"$(piper_warning "$PIPER_MODEL")"
yes "Warnung: auch andere Piper-Stimmen"       grep -qF 'Risiko L1' <<<"$(piper_warning speaches-ai/piper-de_DE-kerstin-low)"
yes "Warnung: Schreibweise egal"               grep -qF 'Risiko L1' <<<"$(piper_warning Speaches-AI/PIPER-de_DE-x)"
eq  "Warnung: anderes Modell still"            "$(piper_warning hexgrad/Kokoro-82M)" ""
yes "Warnung: anderes Modell, Rückgabe 0"      piper_warning hexgrad/Kokoro-82M

# write_env und setup_speaches mit Schalter und ohne (umgelenkte Datei, Attrappen für docker und curl).
vorher=$fails
(
  ENV_FILE="$tmp/env-piper/kunibert.env"; mkdir -p "$tmp/env-piper"
  APP_DIR="$here/.."; HOSTNAME_ARG=kunibert.picastai.com
  install() { cp "${@: -2:1}" "${@: -1}"; chmod 600 "${@: -1}"; }
  chown() { :; }
  openssl() { printf 'z%.0s' {1..64}; }
  # Ein Server von vor dem 28.11.2026: Ein früherer Lauf hat die Piper-Stimme eingetragen.
  cp "$here/kunibert.env.example" "$ENV_FILE"
  env_set "$ENV_FILE" PICASTAI_TTS_MODEL "$PIPER_MODEL"
  env_set "$ENV_FILE" PICASTAI_TTS_VOICE "$PIPER_VOICE"
  write_env >/dev/null
  eq  "write_env: ohne Schalter kein Stimmenmodell" "$(env_get "$ENV_FILE" PICASTAI_TTS_MODEL)" ""
  eq  "write_env: ohne Schalter keine Stimme"  "$(env_get "$ENV_FILE" PICASTAI_TTS_VOICE)" ""
  eq  "write_env: genau eine Zeile PICASTAI_TTS_MODEL" "$(grep -c '^PICASTAI_TTS_MODEL=' "$ENV_FILE")" 1
  eq  "write_env: Adresse des Sprachservers bleibt" "$(env_get "$ENV_FILE" PICASTAI_TTS_URL)" "http://127.0.0.1:8000/v1"
  TTS_MODEL=$PIPER_MODEL; TTS_VOICE=$PIPER_VOICE
  write_env >/dev/null
  eq  "write_env: mit Schalter Piper eingetragen" "$(env_get "$ENV_FILE" PICASTAI_TTS_MODEL)" "$PIPER_MODEL"
  eq  "write_env: mit Schalter Stimme thorsten" "$(env_get "$ENV_FILE" PICASTAI_TTS_VOICE)" "$PIPER_VOICE"

  aufrufe="$tmp/speaches.log"
  docker() {
    case "$1" in
      ps) printf 'speaches\n' ;;
      inspect) if [[ "$3" == *LogConfig* ]]; then printf 'journald\n'; else printf 'sha256:attrappe\n'; fi ;;
      *) : ;;
    esac
  }
  curl() { printf '%s\n' "${*: -1}" >> "$aufrufe"; }
  sleep() { :; }
  : > "$aufrufe"; TTS_MODEL=""; TTS_VOICE=""
  ausgabe=$(setup_speaches 2>&1)
  eq  "Sprachserver: ohne Schalter nur die Erkennung" "$(grep -c '/v1/models/' "$aufrufe")" 1
  yes "Sprachserver: lädt die Erkennung"        grep -qx "$SPEACHES_URL/v1/models/$STT_MODEL" "$aufrufe"
  no  "Sprachserver: ohne Schalter kein Piper"  grep -qi piper "$aufrufe"
  no  "Sprachserver: ohne Schalter keine Meldung zu Piper" grep -qi piper <<<"$ausgabe"
  : > "$aufrufe"; TTS_MODEL=$PIPER_MODEL; TTS_VOICE=$PIPER_VOICE
  setup_speaches >/dev/null 2>&1
  yes "Sprachserver: mit Schalter lädt Piper"   grep -qx "$SPEACHES_URL/v1/models/$PIPER_MODEL" "$aufrufe"
  yes "Sprachserver: mit Schalter auch die Erkennung" grep -qx "$SPEACHES_URL/v1/models/$STT_MODEL" "$aufrufe"

  # Zusammenfassung: Piper mit Warnung; ohne Pocket und ohne eigene Wahl der Hinweis auf keine Stimme.
  SKIP_POCKET=0
  zusammen=$(voice_summary)
  yes "Zusammenfassung: nennt die Piper-Stimme" grep -qF "Rückfall-Stimme im Sprachserver: $PIPER_MODEL" <<<"$zusammen"
  yes "Zusammenfassung: mit Warnung"            grep -qF 'Risiko L1' <<<"$zusammen"
  TTS_MODEL=""; TTS_VOICE=""
  eq  "Zusammenfassung: Pocket, keine Zeile"    "$(voice_summary)" ""
  SKIP_POCKET=1
  env_set "$ENV_FILE" PICASTAI_TTS_PROVIDER ""
  yes "Zusammenfassung: ohne Stimme sagt es"    grep -qF 'keine Stimme eingerichtet' <<<"$(voice_summary)"
  env_set "$ENV_FILE" PICASTAI_TTS_PROVIDER google
  eq  "Zusammenfassung: eigene Wahl google still" "$(voice_summary)" ""
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

# deploy/stt-messung.sh (Punkt N1126-1600-a): Testsätze von Kuniberts Stimme (Pocket TTS), Piper nur
# ausdrücklich. Eine Attrappe für curl im PATH schreibt jeden Aufruf mit; es geht nichts hinaus.
mkdir -p "$tmp/fakebin"
cat > "$tmp/fakebin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STT_LOG"
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output) out=$2; shift 2 ;;
    -w) printf '0.5'; shift 2 ;;
    *) shift ;;
  esac
done
if [[ -n "$out" && "$out" != /dev/null ]]; then printf '{"text":"Hallo Kunibert"}' > "$out"; fi
EOF
chmod +x "$tmp/fakebin/curl"
stt_messung() { # Umgebung … (dann misst das Skript ein Modell mit einem Lauf je Satz)
  : > "$tmp/stt.log"
  env -u PICASTAI_TTS_MODEL -u PICASTAI_TTS_VOICE -u PICASTAI_POCKET_TTS_URL -u PICASTAI_POCKET_TTS_VOICE \
    PATH="$tmp/fakebin:$PATH" STT_LOG="$tmp/stt.log" RUNS=1 "$@" bash "$here/stt-messung.sh" Systran/faster-whisper-small
}
ausgabe=$(stt_messung 2>&1); rc=$?
eq  "Messung: läuft ohne Piper"                "$rc" 0
eq  "Messung: drei Sätze von Kuniberts Stimme" "$(grep -c '^-fsS http://127.0.0.1:8001/tts ' "$tmp/stt.log")" 3
yes "Messung: mit der Stimme stuart_bell"      grep -qF 'voice_url=stuart_bell' "$tmp/stt.log"
no  "Messung: lädt kein Piper"                 grep -qi piper "$tmp/stt.log"
no  "Messung: keine Stimme im Sprachserver"    grep -qF '/v1/audio/speech' "$tmp/stt.log"
yes "Messung: misst die Erkennung"             grep -qF '/v1/audio/transcriptions' "$tmp/stt.log"
no  "Messung: keine Warnung ohne Piper"        grep -qF 'Risiko L1' <<<"$ausgabe"
ausgabe=$(stt_messung PICASTAI_TTS_MODEL="$PIPER_MODEL" PICASTAI_TTS_VOICE="$PIPER_VOICE" 2>&1); rc=$?
eq  "Messung: Piper ausdrücklich geht"         "$rc" 0
yes "Messung: Piper ausdrücklich mit Warnung"  grep -qF 'Risiko L1' <<<"$ausgabe"
yes "Messung: Piper ausdrücklich geladen"      grep -qF "/v1/models/$PIPER_MODEL" "$tmp/stt.log"
no  "Messung: dann nicht Pocket"               grep -qF '8001' "$tmp/stt.log"
ausgabe=$(stt_messung PICASTAI_TTS_MODEL=hexgrad/Kokoro-82M PICASTAI_TTS_VOICE=af_heart 2>&1)
no  "Messung: andere Stimme ohne Warnung"      grep -qF 'Risiko L1' <<<"$ausgabe"
stt_messung PICASTAI_TTS_MODEL=m >/dev/null 2>&1; rc=$?
eq  "Messung: Modell ohne Stimme bricht ab"    "$rc" 2
eq  "Messung: dann kein Aufruf"                "$(wc -l < "$tmp/stt.log")" 0
stt_messung PICASTAI_POCKET_TTS_URL=http://127.0.0.1:9001 PICASTAI_POCKET_TTS_VOICE=anna >/dev/null 2>&1
eq  "Messung: Adresse und Stimme aus der Umgebung" "$(grep -c '^-fsS http://127.0.0.1:9001/tts .*voice_url=anna' "$tmp/stt.log")" 3

# Aufruf ohne Hostname bricht ab, bevor etwas geändert wird.
no  "ohne --hostname: Abbruch"     quiet bash "$here/setup-server.sh"
no  "ungültiger Hostname: Abbruch" quiet bash "$here/setup-server.sh" --hostname 'x;y'
no  "unbekannte Option: Abbruch"   quiet bash "$here/setup-server.sh" --hostname a.example --gibt-es-nicht

if [[ $fails -gt 0 ]]; then printf '\n%d Test(s) fehlgeschlagen\n' "$fails"; exit 1; fi
printf '\nalle Tests bestanden\n'
