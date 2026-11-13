#!/usr/bin/env bash
# Misst auf dem Server, wie lange die Spracherkennung je Modell braucht.
# Zweck: Die Wartezeit auf der CCX13 ist offen (deploy/dryrun/ERGEBNIS.md). Dieses
# Skript beantwortet in ein paar Minuten, welches Erkennungsmodell dort schnell genug ist.
#
#   bash deploy/stt-messung.sh                 # tiny, base, small
#   bash deploy/stt-messung.sh Systran/faster-whisper-small Systran/faster-whisper-medium
#
# Braucht den laufenden Sprachserver (Speaches) auf 127.0.0.1:8000 und ein geladenes
# Stimmenmodell (Standard: Piper thorsten), um die Testsätze zu erzeugen. Es geht nichts
# nach außen außer dem Laden der Modelle durch Speaches. Keine Schlüssel nötig.
#
# Stand: nicht auf einem echten Server gelaufen (shellcheck und bash -n geprüft).
set -euo pipefail

URL=${SPEACHES_BASE_URL:-http://127.0.0.1:8000}
TTS_MODEL=${PICASTAI_TTS_MODEL:-speaches-ai/piper-de_DE-thorsten-medium}
TTS_VOICE=${PICASTAI_TTS_VOICE:-thorsten}
RUNS=${RUNS:-3}
if [[ $# -gt 0 ]]; then MODELS=("$@"); else
  MODELS=(Systran/faster-whisper-tiny Systran/faster-whisper-base Systran/faster-whisper-small)
fi

# Kurze und lange Äußerung, wie Kinder sie sagen; dazu ein Satz für die Sicherheitsweiche.
SAETZE=(
  "Hallo Kunibert, erzähl mir eine Geschichte vom Drachen."
  "Warum ist der Himmel blau und warum wird es abends dunkel?"
  "Ich habe Angst, weil mir jemand weh getan hat."
)

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsS -o /dev/null "$URL/v1/models" || { echo "Sprachserver nicht erreichbar: $URL" >&2; exit 1; }
curl -fsS -X POST "$URL/v1/models/$TTS_MODEL" >/dev/null

json_string() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

echo "Testsätze erzeugen (Piper) ..."
for i in "${!SAETZE[@]}"; do
  curl -fsS "$URL/v1/audio/speech" -H 'Content-Type: application/json' --output "$tmp/satz$i.wav" \
    --data "{\"model\":\"$TTS_MODEL\",\"voice\":\"$TTS_VOICE\",\"input\":$(json_string "${SAETZE[$i]}"),\"response_format\":\"wav\"}"
done

echo "Kerne: $(nproc), Läufe je Satz: $RUNS"
printf '\n%-34s %-6s %-9s %s\n' "Modell" "Satz" "Sekunden" "Erkannt"
for model in "${MODELS[@]}"; do
  curl -fsS -X POST "$URL/v1/models/$model" >/dev/null
  # Ein Lauf vorab, damit das Laden des Modells nicht mitgemessen wird.
  curl -fsS "$URL/v1/audio/transcriptions" -F "file=@$tmp/satz0.wav" -F "model=$model" -F language=de -o /dev/null
  for i in "${!SAETZE[@]}"; do
    best=""
    for _ in $(seq 1 "$RUNS"); do
      t=$(curl -fsS -o "$tmp/out.json" -w '%{time_total}' "$URL/v1/audio/transcriptions" \
        -F "file=@$tmp/satz$i.wav" -F "model=$model" -F language=de -F "prompt=Ritter Kunibert")
      if [[ -z "$best" ]] || awk "BEGIN{exit !($t < $best)}"; then best=$t; fi
    done
    text=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("text","").strip())' "$tmp/out.json")
    printf '%-34s %-6s %-9s %s\n' "$model" "$((i + 1))" "$best" "$text"
  done
done

cat <<'EOF2'

Lesen: "Sekunden" ist der schnellste von mehreren Läufen je Satz, nur die Erkennung.
Dazu kommen Sprachmodell und Sprachausgabe (siehe docs/Zeitmessung.md). Ziel für die
ganze Anfrage: unter 20 s. Die Sätze sind mit einer Erwachsenen-Kunststimme gesprochen;
Kinderstimmen erkennt jedes Modell schlechter. Erst die Güte prüfen (stimmt "Erkannt"?),
dann das schnellste Modell wählen, das alle Sätze richtig erkennt:
  sudoedit /etc/kunibert/kunibert.env     # PICASTAI_STT_MODEL=...
  sudo systemctl restart kunibert-server
EOF2
