#!/usr/bin/env bash
# Prüfskript für den echten Server (nach der Einrichtung, von deinem Rechner aus).
# Prüft von außen: /health, TLS-Zertifikat, HTTP->HTTPS, gesperrte Routen, falscher Token (401),
# zu große Datei (413). Es ruft weder Spracherkennung noch Sprachmodell auf und kostet nichts.
#
# Zugangsdaten nur aus der Umgebung, nie im Skript oder im Repo:
#   PICASTAI_API_BASE_URL   https://kunibert.example   (Pflicht, ohne Pfad)
#   PICASTAI_DEVICE_ID      Geräte-ID                  (für die Prüfungen mit Anmeldung)
#   PICASTAI_DEVICE_TOKEN   Geräte-Token               (für die Prüfungen mit Anmeldung)
#   KUNIBERT_CACERT         optional: Datei mit einer eigenen CA (nur für lokale Tests mit Caddy-Testzertifikat)
#
# Beispiel (Token nicht in die Shell-Historie tippen: aus dem Passwortmanager einfügen, Zeile mit Leerzeichen beginnen):
#   read -rs PICASTAI_DEVICE_TOKEN; export PICASTAI_DEVICE_TOKEN
#   PICASTAI_API_BASE_URL=https://kunibert.example PICASTAI_DEVICE_ID=pi-zero-001 ./deploy/smoke-test.sh
#
# Ausgang: 0 = alles bestanden, 1 = mindestens eine Prüfung fehlgeschlagen, 2 = Aufruf falsch.
# Fehlen Geräte-ID oder Token, werden die Prüfungen mit Anmeldung übersprungen (Ausgang dann 1).
set -u
umask 077

BASE="${PICASTAI_API_BASE_URL:-}"
DEVICE_ID="${PICASTAI_DEVICE_ID:-}"
DEVICE_TOKEN="${PICASTAI_DEVICE_TOKEN:-}"
CACERT="${KUNIBERT_CACERT:-}"

if [ -z "$BASE" ]; then
  echo "PICASTAI_API_BASE_URL fehlt (z. B. https://kunibert.example)" >&2
  exit 2
fi
BASE="${BASE%/}"
case "$BASE" in
  https://*) ;;
  *) echo "PICASTAI_API_BASE_URL muss mit https:// beginnen" >&2; exit 2 ;;
esac
HOSTPORT="${BASE#https://}"
case "$HOSTPORT" in */*) echo "PICASTAI_API_BASE_URL darf keinen Pfad enthalten" >&2; exit 2 ;; esac
HOST="${HOSTPORT%%:*}"
PORT=443
case "$HOSTPORT" in *:*) PORT="${HOSTPORT##*:}" ;; esac

for tool in curl openssl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool wird gebraucht, ist aber nicht installiert" >&2; exit 2; }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CURL=(curl -sS --max-time 30 -o "$WORK/body" -D "$WORK/headers")
[ -n "$CACERT" ] && CURL+=(--cacert "$CACERT")

PASS=0; FAIL=0; SKIP=0
ok()   { echo "OK       $1"; PASS=$((PASS + 1)); }
bad()  { echo "FEHLER   $1"; FAIL=$((FAIL + 1)); }
skip() { echo "ÜBERSPRUNGEN  $1"; SKIP=$((SKIP + 1)); }

# status <Beschreibung> <erwarteter Code> <curl-Argumente ...>
status() {
  local what="$1" want="$2"; shift 2
  local code
  code="$("${CURL[@]}" -w '%{http_code}' "$@" 2>"$WORK/err")" || {
    bad "$what: keine Verbindung ($(tr -d '\n' < "$WORK/err"))"; return 1; }
  if [ "$code" = "$want" ]; then ok "$what -> $code"; else bad "$what -> $code (erwartet $want)"; return 1; fi
}

echo "Prüfe $BASE"
echo

# 1. Gesundheit ---------------------------------------------------------------
if status "GET /health" 200 "$BASE/health"; then
  grep -q '"status":"ok"' "$WORK/body" 2>/dev/null && ok '/health meldet status "ok"' || bad '/health: Antwort enthält nicht status "ok"'
  if grep -qi '^server:' "$WORK/headers"; then bad "Antwort verrät die Server-Software (Header Server)"; else ok "kein Server-Header"; fi
  if grep -qi '^x-powered-by:' "$WORK/headers"; then bad "Antwort enthält X-Powered-By"; else ok "kein X-Powered-By-Header"; fi
fi

# 2. TLS-Zertifikat -----------------------------------------------------------
SCLIENT=(openssl s_client -connect "$HOST:$PORT" -servername "$HOST" -verify_hostname "$HOST" -verify_return_error)
[ -n "$CACERT" ] && SCLIENT+=(-CAfile "$CACERT")
if "${SCLIENT[@]}" </dev/null >"$WORK/tls" 2>&1 && grep -q "Verify return code: 0" "$WORK/tls"; then
  ok "TLS: Zertifikat gültig und passt zu $HOST"
else
  bad "TLS: Zertifikat ungültig, abgelaufen oder passt nicht zu $HOST (Details: $(grep -E 'Verify return code|verify error' "$WORK/tls" | head -1))"
fi
if openssl s_client -connect "$HOST:$PORT" -servername "$HOST" ${CACERT:+-CAfile "$CACERT"} </dev/null 2>/dev/null \
    | openssl x509 -noout -checkend $((14 * 86400)) >/dev/null 2>&1; then
  ok "TLS: Zertifikat gilt noch mindestens 14 Tage"
else
  bad "TLS: Zertifikat läuft in weniger als 14 Tagen ab (oder ließ sich nicht lesen)"
fi

# 3. HTTP leitet auf HTTPS ----------------------------------------------------
if [ "$PORT" = "443" ]; then
  code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST/health" 2>/dev/null || true)"
  case "$code" in
    30[1278]\ https://*) ok "http://$HOST/health leitet auf HTTPS weiter ($code)" ;;
    *) bad "http://$HOST/health leitet nicht auf HTTPS weiter (Antwort: ${code:-keine})" ;;
  esac
else
  skip "HTTP-Weiterleitung (nur bei Standardport 443 geprüft)"
fi

# 4. Nicht öffentliche Routen -------------------------------------------------
status "GET / (Weboberfläche nicht erreichbar)" 404 "$BASE/"
status "GET /api/status (Admin-Route nicht erreichbar)" 404 "$BASE/api/status"
status "GET /api/devices (Admin-Route nicht erreichbar)" 404 "$BASE/api/devices"
status "POST /v1/turn (Route der Weboberfläche nicht erreichbar)" 404 "$BASE/v1/turn" -X POST

# 5. Anmeldung: falscher oder fehlender Token -> 401 --------------------------
# Das Gerät wird vor dem Hochladen geprüft: unbekannte Absender erreichen weder Spracherkennung noch Sprachmodell.
WRONG="falscher-token-$$-$(date +%s)"
status "POST /v1/device/question ohne Anmeldung" 401 -X POST "$BASE/v1/device/question"
status "POST /v1/device/question mit falschem Token" 401 -X POST \
  -H "Authorization: Bearer $WRONG" -H "X-Device-ID: ${DEVICE_ID:-pi-zero-001}" "$BASE/v1/device/question"
status "GET /v1/device/audio/x mit falschem Token" 401 \
  -H "Authorization: Bearer $WRONG" -H "X-Device-ID: ${DEVICE_ID:-pi-zero-001}" "$BASE/v1/device/audio/x"

# 6. Mit echtem Token: Anmeldung klappt, zu große Datei -> 413 ----------------
if [ -z "$DEVICE_ID" ] || [ -z "$DEVICE_TOKEN" ]; then
  skip "Prüfungen mit Gerätetoken (PICASTAI_DEVICE_ID und PICASTAI_DEVICE_TOKEN nicht gesetzt)"
else
  # Token in eine Datei (Modus 600), nicht in die Argumentliste: so steht er nicht in der Prozessliste.
  printf 'Authorization: Bearer %s\nX-Device-ID: %s\n' "$DEVICE_TOKEN" "$DEVICE_ID" > "$WORK/auth"

  # Nur die Anmeldung prüfen, ohne Sprachdienste: unbekannte Audio-Nummer -> 404 (nicht 401).
  status "GET /v1/device/audio/gibt-es-nicht mit echtem Token (Anmeldung ok)" 404 \
    -H @"$WORK/auth" "$BASE/v1/device/audio/gibt-es-nicht"

  # 2,5 MB: über der Grenze des Servers (2 MiB), unter der von Caddy (3 MB). Der Server lehnt ab.
  head -c 2621440 /dev/zero > "$WORK/gross-server.wav"
  status "POST /v1/device/question mit 2,5-MB-Datei (Grenze des Servers)" 413 -X POST \
    -H @"$WORK/auth" -F "audio=@$WORK/gross-server.wav;type=audio/wav" "$BASE/v1/device/question"
  grep -q audio_too_large "$WORK/body" 2>/dev/null && ok "Antwort ist audio_too_large" || bad "Antwort enthält nicht audio_too_large"

  # 4 MB: über der Grenze von Caddy (3 MB). Schon Caddy lehnt ab; der Server sieht die Datei nicht.
  head -c 4194304 /dev/zero > "$WORK/gross-caddy.wav"
  status "POST /v1/device/question mit 4-MB-Datei (Grenze von Caddy)" 413 -X POST \
    -H @"$WORK/auth" -F "audio=@$WORK/gross-caddy.wav;type=audio/wav" "$BASE/v1/device/question"
fi

echo
echo "Ergebnis: $PASS bestanden, $FAIL fehlgeschlagen, $SKIP übersprungen"
if [ "$FAIL" -gt 0 ] || [ "$SKIP" -gt 0 ]; then exit 1; fi
exit 0
