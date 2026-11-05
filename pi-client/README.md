# Raspberry-Pi-Client für Ritter Kunibert

Der Client ist für einen **Raspberry Pi Zero 2 W** mit Audio-HAT, Mikrofon, aktivem Lautsprecher, zwei Tastern, Status-LED und Mikrofon-Aus-Schalter ausgelegt.

## Automatische Installation auf frischem Raspberry Pi OS

Das Skript `install_raspberry_pi.sh` installiert die Python-Laufzeit, GPIO-/Audio-Abhängigkeiten, ALSA-Grundpakete, ein Dienstkonto, eine geschützte Umgebungsdatei und einen systemd-Service. Es ist idempotent und kann nach einem abgebrochenen Lauf erneut ausgeführt werden.

Auf dem Pi nach dem Kopieren oder Klonen des Repositories:

```bash
sudo bash pi-client/install_raspberry_pi.sh \
  --device-id pi-zero-001 \
  --api-token 'TOKEN_AUS_SECRET_MANAGER'
```

Für automatisierte Provisionierung ohne Eingabeaufforderung `--non-interactive` verwenden. Ohne `--api-token` wird dann absichtlich nur eine leere Konfiguration geschrieben:

```bash
sudo bash pi-client/install_raspberry_pi.sh \
  --non-interactive \
  --device-id pi-zero-001 \
  --api-token "$PICASTAI_DEVICE_TOKEN"
```

Vor einer echten Installation kann die Auflösung der Quelle und Optionen geprüft werden:

```bash
sudo bash pi-client/install_raspberry_pi.sh --dry-run --non-interactive
```

Für einen WM8960-HAT kann die erkannte ALSA-Karte explizit gesetzt werden:

```bash
aplay -l
arecord -l
sudo bash pi-client/install_raspberry_pi.sh \
  --device-id pi-zero-001 \
  --api-token 'TOKEN_AUS_SECRET_MANAGER' \
  --audio-card 'hw:wm8960soundcard,0'
```

Das Skript installiert bewusst **keine ungeprüften Drittanbieter-HAT-Treiber**. WM8960- und ReSpeaker-Treiber hängen von HAT-Modell, Raspberry-Pi-OS-Version und Kernel ab. Sie müssen vorab passend zum konkreten System installiert werden. Ohne `--audio-card` bleibt die vorhandene ALSA-Default-Konfiguration unverändert.

Der Dienst wird aktiviert, aber standardmäßig nicht gestartet, damit zuerst Mikrofon, Lautsprecher und HAT geprüft werden:

```bash
sudo systemctl start kunibert.service
journalctl -u kunibert.service -f
```

Die geheime Konfiguration liegt danach in `/etc/kunibert/kunibert.env` und wird nicht in Git gespeichert.

## Zustandsautomat

```text
BOOT
  ↓
WIFI_CONNECTING
  ↓
READY ←──────────────┐
  │                  │
  ├─ Sprechtaste     │
  │     ↓            │
  │  RECORDING       │
  │     ↓            │
  │  UPLOADING       │
  │     ↓            │
  └─ PLAYING ────────┘

READY ── Erzähltaste ──> REQUESTING_STORY ──> PLAYING

jeder Zustand ── MIC OFF ──> MIC_OFF ──> READY
jeder Netzwerk-/Audiofehler ──> ERROR ──> READY
SIGTERM/Ctrl+C ──> SHUTDOWN
```

Die API-Keys und Modellaufrufe bleiben auf `picastAI.com`. Der Pi nimmt nur auf, authentifiziert sich, lädt WAV-Audio herunter und spielt es ab.

## Hardware-/GPIO-Belegung

Die GPIO-Nummern sind BCM-Nummern und können über Umgebungsvariablen geändert werden.

| Funktion | BCM GPIO | Elektrische Logik |
|---|---:|---|
| Sprechtaste | 17 | Taster nach GND, `INPUT_PULLUP` |
| Erzähltaste | 27 | Taster nach GND, `INPUT_PULLUP` |
| Mikrofon-Aus-Sense | 22 | Schalter nach GND, `INPUT_PULLUP` |
| Status-LED | 23 | LED über Vorwiderstand nach GND |

### Tastenentprellung

Der Client konfiguriert `gpiozero.Button` für die Sprechtaste, Erzähltaste und den MIC-OFF-Sense-Eingang mit `bounce_time=0.05` (50 ms). Damit werden kurze Kontaktpreller softwareseitig gefiltert. Das kann die Erkennung eines Zustandswechsels um bis zu etwa 50 ms verzögern; die physische Mikrofonabschaltung muss deshalb direkt im Mikrofonpfad wirken und darf nicht allein von der GPIO-Erkennung abhängen.

### Status-LED

| Zustand | Signal |
|---|---|
| Bereit | Dauerlicht |
| Aufnahme | schnelles Blinken (180 ms an, 180 ms aus) |
| Verarbeitung/Wiedergabe | langsames Blinken (700 ms an, 700 ms aus) |
| Fehler | sehr schnelles Blinken (80 ms an, 80 ms aus) |
| Mikrofon ausgeschaltet | zwei kurze Blitze (je 80 ms), dann Pause |

Die LED signalisiert den Softwarezustand; sie beweist nicht, dass die Mikrofonversorgung elektrisch getrennt ist. Die Muster sind für eine einzelne, aktive-high angeschlossene LED vorgesehen.

### Mikrofon-Aus-Schalter

BCM GPIO 22 ist ein active-low **Sense-Eingang** mit `INPUT_PULLUP`: In der OFF-Stellung zieht ein Schaltkontakt den Eingang nach GND; in der ON-Stellung bleibt der Eingang durch den internen Pull-up high. Der Eingang dient nur der Erkennung und darf nicht mit der Versorgung des Mikrofons verbunden werden.

Der Softwareablauf bei OFF ist:

1. Im Bereitschaftszustand startet keine neue Aufnahme und keine Geräteaktion.
2. Wird OFF während einer Aufnahme betätigt, liefert die Aufnahmebedingung sofort „nicht weiter aufnehmen“. Der Audiostream endet spätestens nach dem gerade laufenden Audio-Block.
3. Ein möglicherweise noch vom Audioadapter zurückgegebener letzter Puffer wird vollständig verworfen. Er wird weder als WAV weiterverarbeitet noch hochgeladen; eine Serverantwort wird nicht abgespielt. Der Client wechselt in `MIC_OFF` und zeigt das Doppelblitz-Muster.
4. Wird der Schalter wieder auf ON gestellt, kehrt der Client in den Zustand `READY` zurück; die LED leuchtet dauerhaft.

**Wichtig für den Hardwareaufbau:** GPIO 22 allein schaltet ein Mikrofon nicht elektrisch ab. Für einen echten Datenschutz-Schalter muss ein separater Schaltkontakt die Mikrofonversorgung bzw. den passenden Mikrofonpfad des konkreten Audio-HATs/USB-Geräts physisch unterbrechen; ein weiterer Kontakt kann GPIO 22 nach GND ziehen. Die geeignete Schaltung hängt vom ausgewählten Audiointerface ab und muss anhand dessen Dokumentation geplant und am Gerät geprüft werden. Keine 5-V-Signale an den GPIO legen. Vor dem Softwaretest die elektrische Abschaltung separat prüfen und danach mit `arecord -l` sowie einer Testaufnahme kontrollieren, dass OFF tatsächlich keine Aufnahme zulässt.

Die softwareseitige Abbruch- und Verwerfungslogik ist mit `python3 -m unittest -v` testbar; der Unit-Test ersetzt keine Prüfung der tatsächlichen elektrischen Abschaltung am Pi.

## Installation auf Raspberry Pi OS Lite

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip python3-gpiozero \
  libportaudio2 libsndfile1 alsa-utils
python3 -m venv --system-site-packages /opt/kunibert/.venv
/opt/kunibert/.venv/bin/pip install sounddevice
```

Projektdateien nach `/opt/kunibert` kopieren und eine Konfigurationsdatei anlegen:

```ini
# /etc/kunibert/kunibert.env
PICASTAI_API_BASE_URL=https://picastAI.com
PICASTAI_DEVICE_ID=prototype-001
PICASTAI_DEVICE_TOKEN=NICHT_IN_GIT_EINTRAGEN
KUNIBERT_CACHE_DIR=/var/lib/kunibert/audio
KUNIBERT_SAMPLE_RATE=16000
KUNIBERT_MAX_RECORD_SECONDS=15
KUNIBERT_REQUEST_TIMEOUT=30
KUNIBERT_RETRY_COUNT=2
```

```bash
sudo install -d -m 0750 /etc/kunibert /var/lib/kunibert/audio
sudo chmod 600 /etc/kunibert/kunibert.env
```

## Manuell starten

```bash
set -a
. /etc/kunibert/kunibert.env
set +a
/opt/kunibert/.venv/bin/python pi-client/kunibert_client.py --debug
```

Nur Health prüfen:

```bash
/opt/kunibert/.venv/bin/python pi-client/kunibert_client.py --once health
```

Ohne Pi-Hardware im Dry-Run starten:

```bash
PICASTAI_API_BASE_URL=http://127.0.0.1:3187 \
PICASTAI_DEVICE_TOKEN=test-token-kunibert-2026 \
/opt/kunibert/.venv/bin/python pi-client/kunibert_client.py --dry-run --debug
```

## systemd

Beispiel `/etc/systemd/system/kunibert.service`:

```ini
[Unit]
Description=Ritter Kunibert Raspberry-Pi-Client
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=kunibert
Group=audio
WorkingDirectory=/opt/kunibert
EnvironmentFile=/etc/kunibert/kunibert.env
ExecStart=/opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/kunibert

[Install]
WantedBy=multi-user.target
```

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kunibert.service
journalctl -u kunibert.service -f
```

## ALSA-/Audio-Diagnose

Vor dem Clienttest:

```bash
arecord -l
aplay -l
arecord -d 3 -f S16_LE -r 16000 -c 1 /tmp/mic.wav
aplay /tmp/mic.wav
```

Wenn die HAT-Treiber nicht geladen sind, muss zuerst die Dokumentation des konkreten WM8960- oder ReSpeaker-HATs befolgt werden. Der Client setzt ein funktionierendes ALSA-/PortAudio-Gerät voraus.

### Direkter ALSA-Test ohne Python-Client

Mit `test_alsa_audio.sh` lassen sich HAT, Mikrofon und Lautsprecher unabhängig vom Kunibert-Client prüfen:

```bash
chmod +x pi-client/test_alsa_audio.sh
bash pi-client/test_alsa_audio.sh --mode list
bash pi-client/test_alsa_audio.sh --mode all --duration 3
```

Der vollständige Test führt aus:

1. Auflistung der ALSA-Geräte mit `aplay -l`, `arecord -l`, `aplay -L` und `arecord -L`
2. Mikrofonaufnahme mit 16 kHz, mono, 16 Bit
3. Wiedergabe eines 440-Hz-Testtons

Für eine Aufnahme mit anschließender Wiedergabe:

```bash
bash pi-client/test_alsa_audio.sh \
  --mode roundtrip \
  --capture-device default \
  --playback-device default \
  --duration 5 \
  --keep
```

Mit einer expliziten WM8960-Karte:

```bash
bash pi-client/test_alsa_audio.sh \
  --mode roundtrip \
  --capture-device 'hw:wm8960soundcard,0' \
  --playback-device 'hw:wm8960soundcard,0'
```

`default` ist zu bevorzugen, wenn `/etc/asound.conf` durch das Installationsskript konfiguriert wurde. Das Skript löscht seine Testdateien standardmäßig aus `/tmp`; mit `--keep` bleiben sie zur weiteren Untersuchung erhalten.

## Designgrenzen

- Die Aufnahme wird nur im RAM gehalten, bis die API-Anfrage abgeschlossen ist.
- Die heruntergeladene Antwort wird nicht dauerhaft gespeichert.
- Audio-URLs müssen denselben Origin (Schema, Host und Port) wie die API verwenden; der Host wird ohne Beachtung der Groß-/Kleinschreibung verglichen, ein fehlender Port gilt als Standardport (80/443), Zugangsdaten in der URL werden abgelehnt, HTTP-Downgrades ebenfalls. HTTP-Redirects werden nicht verfolgt.
- HTTP 400, 401, 413, 415 und 429 werden nicht automatisch wiederholt.
- Temporäre Netzwerk- und Serverfehler werden begrenzt wiederholt.
- Bei Server-/Audiofehlern bleibt der Client nicht in einer Endlosschleife, sondern wechselt kurz nach `ERROR` zurück nach `READY`.
- Ohne echte STT-Integration liefert `/v1/device/question` bei einer Aufnahme derzeit die sichere Fallback-Antwort des Backends.
