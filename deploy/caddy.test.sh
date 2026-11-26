#!/usr/bin/env bash
# Fehlerzeilen von Caddy mit der Vorlage deploy/Caddyfile (Punkt N1123-0037-c).
#
# Runde 1: Caddy läuft vor einem Kunibert-Server, der nicht da ist, und antwortet mit 502. Je
# Anfrage schreibt Caddy eine Fehlerzeile. Die Zeilen müssen da sein und Methode, Pfad und Status
# nennen, aber keine Geräte-ID, kein Token, kein Cookie, keine Adresse des Absenders, keine
# Kopfzeilen und keine Kennung im Pfad einer Antwort.
# Runde 2: Eine Attrappe schickt den Anfang einer Antwort und bricht dann hart ab. Caddy schreibt
# den Fehlertext mit den Adressen der Verbindung; die Adressen müssen dort fehlen.
#
# Braucht Caddy (Programm caddy oder CADDY=<Pfad>), curl und python3. Ohne Caddy wird der Test
# übersprungen, außer mit KUNIBERT_CADDY_TEST_PFLICHT=1 (so in der CI, Job caddy).
# Ändert nichts am System: Caddy läuft als eigener Prozess nur auf 127.0.0.1, ohne
# Admin-Schnittstelle, mit allen Dateien in einem Ordner unter /tmp, und wird am Ende beendet.
#   bash deploy/caddy.test.sh
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
caddy_bin=${CADDY:-caddy}

if ! command -v "$caddy_bin" >/dev/null 2>&1; then
  if [[ "${KUNIBERT_CADDY_TEST_PFLICHT:-0}" == 1 ]]; then
    echo "FAIL Caddy fehlt ($caddy_bin)"
    exit 1
  fi
  echo "übersprungen: Caddy fehlt (die CI prüft es, Job caddy)"
  exit 0
fi
for prog in curl python3; do
  command -v "$prog" >/dev/null 2>&1 || { echo "FAIL $prog fehlt"; exit 1; }
done
echo "Caddy $("$caddy_bin" version | cut -d' ' -f1)"

fails=0
ok()  { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
eq()  { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1: erwartet '$3', war '$2'"; fi; }

tmp=$(mktemp -d)
pids=()
rot=()   # Protokolldateien der Runden mit Fehlern
aufraeumen() {
  local p
  for p in ${pids[@]+"${pids[@]}"}; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$tmp"
}
trap aufraeumen EXIT

# Werte, die nie im Protokoll stehen dürfen (nur für diesen Test erfunden).
geraet='geraet-pruefwert-4711'
token='token-pruefwert-4711'
cookie='eltern-pruefwert-4711'
turn='t_turn-pruefwert-4711'
agent='browser-pruefwert-4711'
fremd='198.51.100.77'   # Adressbereich für Beispiele (RFC 5737)

read -r p1 p2 p_tot p_attrappe < <(python3 - <<'PY'
import socket
socks = []
for _ in range(4):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    socks.append(s)
print(" ".join(str(s.getsockname()[1]) for s in socks))
PY
)

# Vorlage für den Test: eigene Adresse statt des Hostnamens (nur HTTP, keine Zertifikate), der
# Kunibert-Server auf einem anderen Port und keine Admin-Schnittstelle. Der Block mit den globalen
# Optionen (dort steht der Filter) bleibt sonst, wie er ist.
vorlage() { # Port von Caddy, Port des Kunibert-Servers, Zieldatei
  sed -e "s|^kunibert\.example {|http://127.0.0.1:$1 {|" -e "s|127\.0\.0\.1:3000|127.0.0.1:$2|g" "$here/Caddyfile" \
    | awk 'BEGIN { drin = 0 } !drin && $0 == "{" { print; print "\tadmin off"; drin = 1; next } { print }' > "$3"
}

starte_caddy() { # Caddyfile, Protokolldatei, Port
  XDG_CONFIG_HOME="$tmp/config" XDG_DATA_HOME="$tmp/data" \
    "$caddy_bin" run --config "$1" --adapter caddyfile >/dev/null 2>"$2" &
  pids+=("$!")
  local i
  for i in $(seq 1 50); do
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$3/gibt-es-nicht")" == 404 ]]; then return 0; fi
    sleep 0.2
  done
  echo "FAIL Caddy startet nicht (Versuche: $i)"
  tail -n 20 "$2"
  exit 1
}

stoppe_caddy() {
  local p=${pids[-1]}
  kill "$p" 2>/dev/null || true
  wait "$p" 2>/dev/null || true
}

anfrage() { # curl-Optionen …; gibt den Status aus
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || true
}

geraet_koepfe=(-H "Authorization: Bearer $token" -H "X-Device-ID: $geraet" -H 'X-Kunibert-Audio-Stream: 1' -H "User-Agent: $agent")

# Prüft die Zeilen einer Protokolldatei (JSON, eine Zeile je Eintrag).
pruefe() { # Runde, Protokolldatei
  python3 - "$@" "$geraet" "$token" "$cookie" "$turn" "$agent" "$fremd" <<'PY'
import json
import re
import sys

runde, datei, *geheim = sys.argv[1:]
text = open(datei, encoding="utf-8", errors="replace").read()
zeilen, kaputt = [], 0
for roh in text.splitlines():
    try:
        zeilen.append(json.loads(roh))
    except ValueError:
        kaputt += 1
fehler = 0


def melde(gut, text):
    global fehler
    print(("ok   " if gut else "FAIL ") + f"{runde}: {text}")
    if not gut:
        fehler += 1


melde(kaputt == 0 and zeilen, f"jede Zeile ist JSON ({len(zeilen)} Zeilen, {kaputt} anders)")
for wert in geheim:
    melde(wert not in text, f"nicht im Protokoll: {wert}")
melde("x-device-id" not in text.lower(), "keine Kopfzeile X-Device-ID")


def anfragen(obj):
    """Alle Objekte unter einem Schlüssel „request“, auch verschachtelt."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "request" and isinstance(v, dict):
                yield v
            yield from anfragen(v)


verboten = ("headers", "remote_ip", "remote_port", "client_ip")
reste = sorted({k for z in zeilen for a in anfragen(z) for k in verboten if k in a})
melde(not reste, "keine Kopfzeilen und keine Adresse des Absenders" + (f" (gefunden: {', '.join(reste)})" if reste else ""))
adresse = re.compile(r"\d+\.\d+\.\d+\.\d+|\[[0-9A-Za-z.%]*:[0-9A-Za-z:.%]*\]")
mit_adresse = [z["error"] for z in zeilen if adresse.search(str(z.get("error", "")))]
melde(not mit_adresse, "keine Adresse im Fehlertext (error)" + (f": {mit_adresse[0]}" if mit_adresse else ""))

if runde == "Runde 1":
    fz = [z for z in zeilen if z.get("logger") == "http.log.error"]
    melde(len(fz) == 5, f"fünf Fehlerzeilen (http.log.error), eine je Anfrage (gefunden: {len(fz)})")
    melde(all(z.get("status") == 502 for z in fz), "Status 502 in jeder Fehlerzeile")
    gesehen = sorted((z.get("request", {}).get("method", ""), z.get("request", {}).get("uri", "")) for z in fz)
    erwartet = sorted([
        ("POST", "/v1/device/question"),
        ("GET", "/v1/device/audio/REDACTED"),
        ("GET", "/v1/device/audio/REDACTED"),
        ("GET", "/health"),
        ("POST", "/v1/eltern/koppeln"),
    ])
    melde(gesehen == erwartet, f"Methode und Pfad bleiben, Kennung im Pfad einer Antwort geschwärzt: {gesehen}")
    melde(all(z.get("msg") and "duration" in z for z in fz), "Nachricht und Dauer bleiben")
else:
    abbruch = [z for z in zeilen if z.get("msg") == "aborting with incomplete response"]
    melde(bool(abbruch), "Zeile „aborting with incomplete response“ da")
    # „reading from backend“ schreibt Caddy 2.6.2; neuere Fassungen nur mit verbose_logs, dort steht
    # der Lesefehler im Fehlertext der Abbruchzeile („reading: …“).
    texte = [str(z.get("error", "")) for z in zeilen if z.get("msg") in ("reading from backend", "aborting with incomplete response")]
    melde(any("REDACTED" in t for t in texte), "Adressen im Fehlertext geschwärzt")
    for t in texte:
        print(f"info {runde}: Fehlertext: {t}")
    mit_anfrage = sum(1 for z in abbruch if isinstance(z.get("request"), dict))
    print(f"info {runde}: Abbruchzeilen mit Anfrage: {mit_anfrage} von {len(abbruch)} (neuere Fassungen hängen sie an)")
sys.exit(1 if fehler else 0)
PY
}

# Runde 1: Kunibert-Server läuft nicht, jede Anfrage endet mit 502.
vorlage "$p1" "$p_tot" "$tmp/Caddyfile1"
eq "Vorlage: Hostname ersetzt"            "$(grep -c "^http://127.0.0.1:$p1 {" "$tmp/Caddyfile1")" 1
eq "Vorlage: kein Port 3000 mehr"         "$(grep -c '127\.0\.0\.1:3000' "$tmp/Caddyfile1" || true)" 0
eq "Vorlage: Admin aus, im globalen Block" "$(sed -n '/^{$/{n;p;q}' "$tmp/Caddyfile1")" $'\tadmin off'
if XDG_CONFIG_HOME="$tmp/config" XDG_DATA_HOME="$tmp/data" \
  "$caddy_bin" validate --config "$tmp/Caddyfile1" --adapter caddyfile >"$tmp/validate.log" 2>&1; then
  ok "caddy validate"
else
  bad "caddy validate"
  tail -n 20 "$tmp/validate.log"
fi
if grep -q 'not formatted' "$tmp/validate.log"; then bad "Vorlage ist nicht im Format von caddy fmt"; else ok "Vorlage im Format von caddy fmt"; fi

starte_caddy "$tmp/Caddyfile1" "$tmp/caddy1.log" "$p1"
basis="http://127.0.0.1:$p1"
eq "Frage: 502"            "$(anfrage -X POST "${geraet_koepfe[@]}" -F locale=de-DE "$basis/v1/device/question")" 502
eq "Antwort holen: 502"    "$(anfrage "${geraet_koepfe[@]}" "$basis/v1/device/audio/$turn")" 502
eq "Großschreibung: 502"   "$(anfrage "${geraet_koepfe[@]}" "$basis/V1/DEVICE/AUDIO/$turn")" 502
eq "/health: 502"          "$(anfrage -H "X-Forwarded-For: $fremd" "$basis/health")" 502
eq "Eltern koppeln: 502"   "$(anfrage -X POST -H 'Content-Type: application/json' -H "Cookie: kb_eltern=$cookie" -H "User-Agent: $agent" --data '{"code":"123456"}' "$basis/v1/eltern/koppeln")" 502
stoppe_caddy
pruefe "Runde 1" "$tmp/caddy1.log" || rot+=("$tmp/caddy1.log")

# Runde 2: Attrappe schickt Kopf und ein Stück Ton, dann bricht sie die Verbindung hart ab (RST).
python3 - "$p_attrappe" >/dev/null 2>&1 <<'PY' &
import socket
import struct
import sys
import time

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", int(sys.argv[1])))
srv.listen(8)
while True:
    conn, _ = srv.accept()
    conn.settimeout(5)
    daten = b""
    try:
        while b"\r\n\r\n" not in daten:
            stueck = conn.recv(65536)
            if not stueck:
                break
            daten += stueck
        conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: audio/wav\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nRIFF\r\n")
        time.sleep(0.3)
    except OSError:
        pass
    conn.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    conn.close()
PY
pids+=("$!")
vorlage "$p2" "$p_attrappe" "$tmp/Caddyfile2"
starte_caddy "$tmp/Caddyfile2" "$tmp/caddy2.log" "$p2"
anfrage "${geraet_koepfe[@]}" "http://127.0.0.1:$p2/v1/device/audio/$turn" >/dev/null
sleep 0.5
stoppe_caddy
pruefe "Runde 2" "$tmp/caddy2.log" || rot+=("$tmp/caddy2.log")

for datei in ${rot[@]+"${rot[@]}"}; do
  echo "Protokoll $(basename "$datei") (gekürzt):"
  cut -c1-400 "$datei" | tail -n 12
done
if [[ "$fails" -ne 0 || ${#rot[@]} -ne 0 ]]; then
  echo "Rot: $fails Prüfung(en) außerhalb der Runden, ${#rot[@]} Runde(n) mit Fehlern."
  exit 1
fi
echo "Alle Prüfungen bestanden."
