#!/usr/bin/env bash
# Alle Prüfungen aus CLAUDE.md mit kurzer Ausgabe (Wochen-Autopilot, siehe README.md).
#
# Aufruf im Repo-Ordner:  bash docs/autopilot/pruefen.sh [--schnell]
#   --schnell       nur npm test und npm run lint (zum Zwischenprüfen)
#   AP_PR=<Nummer>  setzt vorher und nachher das Lebenszeichen in der Status-Zeile des PRs
#
# Je Prüfung eine Zeile „OK“ oder „FEHLER“; bei FEHLER die letzten 40 Zeilen.
# Die vollen Protokolle liegen in $AP_PROTOKOLLE (Standard: /tmp/ap-pruefen).
# Rückgabe: 0 alles grün, 1 mindestens eine Prüfung rot.
set -uo pipefail

wurzel="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Kein Git-Repo." >&2; exit 2; }
cd "$wurzel" || exit 2
protokolle="${AP_PROTOKOLLE:-/tmp/ap-pruefen}"
mkdir -p "$protokolle"
fehler=0

lebenszeichen() {
  if [ -n "${AP_PR:-}" ]; then
    python3 docs/autopilot/ap.py status "$AP_PR" in-arbeit >/dev/null 2>&1 \
      || echo "Hinweis: Lebenszeichen für #$AP_PR nicht gesetzt."
  fi
}

pruefe() {
  local name="$1"
  shift
  local datei="$protokolle/$name.log"
  local start=$SECONDS
  if "$@" >"$datei" 2>&1; then
    printf 'OK      %-16s %4ss\n' "$name" "$((SECONDS - start))"
  else
    printf 'FEHLER  %-16s %4ss  (Protokoll: %s)\n' "$name" "$((SECONDS - start))" "$datei"
    tail -n 40 "$datei" | sed 's/^/    /'
    fehler=$((fehler + 1))
  fi
}

# In einer Unter-Shell, damit das cd die anderen Prüfungen nicht verschiebt.
firmware_logik() (
  cd firmware/esp32-s3 \
    && cc -std=c11 -Wall -Wextra -Werror -pedantic -fsanitize=address,undefined -I main \
      -o /tmp/kb_logic test/test_logic.c main/kb_state.c main/kb_wav.c main/kb_url.c main/kb_settings_rules.c \
    && /tmp/kb_logic
)

pi_installer() {
  local ca=()
  if [ -n "${PIP_CERT:-}" ] && [ -f "$PIP_CERT" ]; then
    ca=(-e PIP_CERT=/ca.crt -v "$PIP_CERT:/ca.crt:ro")
  fi
  docker run --rm -e KUNIBERT_INSTALLER_TEST=1 "${ca[@]}" -v "$PWD:/src:ro" debian:trixie \
    bash /src/pi-client/install_raspberry_pi.test.sh
}

lebenszeichen
pruefe npm-test npm test
pruefe lint npm run lint
if [ "${1:-}" != "--schnell" ]; then
  pruefe build npm run build
  pruefe e2e npm run test:e2e
  pruefe pi-client python3 -m unittest discover -s pi-client -p "test_*.py"
  pruefe autopilot python3 -m unittest discover -s docs/autopilot -p "test_*.py"
  pruefe setup-server bash deploy/setup-server.test.sh
  # Fehlerzeilen von Caddy (Punkt N1123-0037-c). Nur mit Caddy (Debian/Ubuntu: Paket caddy).
  if command -v caddy >/dev/null 2>&1; then
    pruefe caddy bash deploy/caddy.test.sh
  else
    echo "OFFEN   caddy            (Caddy nicht installiert; die CI prüft es, Job caddy)"
  fi
  if command -v shellcheck >/dev/null 2>&1; then
    pruefe shellcheck shellcheck -S warning deploy/*.sh pi-client/*.sh docs/autopilot/*.sh
  else
    echo "OFFEN   shellcheck       (nicht installiert; die CI prüft es)"
  fi
  # Pi-Installer als root in einem Wegwerf-Container (ändert sonst das System). Nur mit laufendem
  # Docker. Hinter einem Proxy mit eigener Zertifizierungsstelle: PIP_CERT=<Datei> setzen.
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    pruefe pi-installer pi_installer
  else
    echo "OFFEN   pi-installer     (kein laufendes Docker; die CI prüft es, Job pi-installer)"
  fi
  if command -v cc >/dev/null 2>&1; then
    pruefe firmware-logik firmware_logik
  else
    echo "OFFEN   firmware-logik   (kein C-Compiler; die CI prüft die Firmware)"
  fi
  lebenszeichen
fi
if [ "$fehler" -eq 0 ]; then
  echo "Alle Prüfungen grün."
  exit 0
fi
echo "$fehler Prüfung(en) rot. Volle Protokolle in $protokolle."
exit 1
