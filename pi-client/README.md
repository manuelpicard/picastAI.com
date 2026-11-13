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
  ↓  (nur beim ersten Start: PLAYING mit der KI-Ansage, siehe unten)
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

## KI-Ansage beim ersten Einschalten

Kunibert sagt dem Kind beim ersten Einschalten selbst, dass er ein Computer-Ritter und kein Mensch ist und sich irren kann (Hinweispflicht nach Art. 50 KI-Verordnung). Der Ablauf:

1. Beim Start prüft der Client, ob `intro-played` im Zustandsordner liegt (`KUNIBERT_STATE_DIR`, Standard `/var/lib/kunibert/state`).
2. Fehlt die Datei, holt er die Ansage mit `GET /v1/device/intro` vom Server und spielt sie ab. Währenddessen zeigt die LED „Wiedergabe“, und die Tasten haben keine Wirkung.
3. Erst nach vollständiger Wiedergabe schreibt er die Datei (mit der Kennung der Textfassung) und geht auf `READY`.

Der Text steht fest im Server (`server-api/ansage.ts`), kommt also nie vom Sprachmodell, und wird in Kuniberts Stimme gesprochen. Der Server bereitet ihn beim Start vor, die Ansage kommt dann ohne Wartezeit.

**Das Gerät wird nicht freigegeben, wenn die Ansage fehlschlägt** (Server oder Sprachausgabe nicht erreichbar, Lautsprecher defekt): Der Client meldet Fehler und beendet sich, systemd startet ihn neu (`Restart=on-failure`). Beim vom Installationsskript angelegten Dienst gibt systemd nach fünf Fehlversuchen in zwei Minuten auf; das Gerät bleibt dann stumm, bis jemand `sudo systemctl restart kunibert.service` ausführt. Ein Kind kann so nie mit einem Gerät sprechen, das sich nicht vorgestellt hat. Lässt sich nur die Merkdatei nicht schreiben, läuft der Client weiter und spielt die Ansage bei jedem Start (zu oft ist besser als zu selten).

Wiederholen (zum Beispiel für die Eltern oder nach einer Textänderung):

```bash
# einmalig beim nächsten Start
sudo -u kunibert rm /var/lib/kunibert/state/intro-played
sudo systemctl restart kunibert.service

# oder von Hand, ohne die Merkdatei zu ändern (Dienst vorher stoppen)
set -a; . /etc/kunibert/kunibert.env; set +a
/opt/kunibert/.venv/bin/python pi-client/kunibert_client.py --ansage
```

Nur prüfen, ob der Server die Ansage liefert, ohne sie abzuspielen: `kunibert_client.py --once ansage` (zeigt Größe und Fassung).

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
| Kunibert denkt nach (nach dem Loslassen der Sprechtaste, bis die Antwort da ist) | langsames Pulsieren, etwa 3 Sekunden je Durchlauf |
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

## Rückmeldung beim Warten

Kinder sollen nie still warten müssen. Dafür gibt es zwei Dinge (Quittung und Zwischensätze) und eine Tastenkombination für Eltern. Der Code steht in `rueckmeldung.py`. Die KI-Ansage beim ersten Einschalten kommt aus dem Server und ist [oben](#ki-ansage-beim-ersten-einschalten) beschrieben.

### Quittung: „Ich habe dich gehört“

Lässt das Kind die Sprechtaste los, passiert sofort, innerhalb einer halben Sekunde, Folgendes:

- Der Pi spielt einen kurzen, leisen Ton (zusammen 0,2 Sekunden). Der Ton wird im Code erzeugt. Es gibt keine Tondatei.
- Die LED pulsiert langsam („Kunibert denkt nach“).
- Der Upload startet im selben Augenblick. Er wartet nicht auf den Ton.

Zu kurze Aufnahmen (ein kurzes Antippen) bekommen keinen Ton und keine Anfrage. Die Erzähltaste hat kein „Loslassen“, deshalb gibt es dort keinen Ton. Die LED pulsiert aber auch dort, und die Zwischensätze gelten genauso.

### Zwischensätze

Dauert die Antwort länger, spricht Kunibert kurz dazwischen:

- Nach **2,5 Sekunden** ohne Antwort spielt der Pi einen zufälligen Zwischensatz („Ich höre dir zu. Einen Moment.“ und ähnliche). Es gibt sechs davon, die Sätze sind absichtlich neutral. Derselbe Satz kommt nie zweimal hintereinander.
- Nach **15 Sekunden** ohne Antwort folgt ein zweiter Satz („Das dauert heute etwas länger.“).
- Mehr als diese zwei Sätze gibt es pro Frage nicht.
- Es spielt immer nur eines nach dem anderen. Ein Satz wird nie abgeschnitten und nichts überlappt. Kommt die Antwort während eines Satzes, spielt der Satz zu Ende, dann folgen 300 Millisekunden Pause und danach die Antwort.

### KI-Ansage wiederholen (Eltern)

Die KI-Ansage kommt beim allerersten Start (siehe [oben](#ki-ansage-beim-ersten-einschalten)). Eltern können sie auch ohne Rechner noch einmal abspielen:

1. Mikrofon-Schalter auf „aus“ stellen (die LED zeigt die zwei Blitze).
2. **Beide Tasten** (Sprechtaste und Erzähltaste) **5 Sekunden lang gedrückt halten.**
3. Der Pi holt die Ansage vom Server und spielt sie ab. Zum nächsten Mal beide Tasten erst loslassen.

Die Merkdatei `intro-played` bleibt dabei unberührt. Klappt der Abruf nicht (kein Netz), steht nur eine Warnung im Log.

Warum diese Kombination: Bei ausgeschaltetem Mikrofon startet ein Tastendruck nie eine Aufnahme. Ohne den Schalter würde schon das Drücken der Sprechtaste die Aufnahme starten. Außerdem braucht es drei bewusste Handgriffe (Schalter, beide Tasten, 5 Sekunden). Ein Kind löst das nicht aus Versehen aus. Die Zeit ist mit `KUNIBERT_INTRO_HOLD_SECONDS` einstellbar.
### Die Sprachdateien

Die Zwischensätze sind WAV-Dateien (16 kHz, Mono, 16 Bit) im Ordner `KUNIBERT_ANNOUNCEMENTS_DIR` (Standard `/var/lib/kunibert/ansagen`). Die Dateinamen sind fest:

| Datei | Wofür |
|---|---|
| `zwischen-1.wav` bis `zwischen-6.wav` | sechs Zwischensätze nach 2,5 Sekunden |
| `zwischen-lang.wav` | zweiter Satz nach 15 Sekunden |

Der Server erzeugt die Dateien mit `npm run ansagen -- <Zielordner>` (siehe [`docs/Ansagen.md`](../docs/Ansagen.md)). Es sind keine Dateien im Repo, weil die Stimme noch nicht festgelegt ist.

**Fehlen Dateien**, läuft der Pi normal weiter: mit Ton und LED, aber ohne die fehlenden Sätze. Beim Start steht eine Warnung im Log, welche Dateien fehlen. Eine Datei mit falschem Format (andere Abtastrate, Stereo, keine WAV-Datei) wird übersprungen und ebenfalls gemeldet. Im Log stehen nur Dateinamen, nie die gesprochenen Texte.

### Einstellungen

Alle Werte sind optional und stehen in `/etc/kunibert/kunibert.env`.

| Variable | Standard | Bedeutung |
|---|---:|---|
| `KUNIBERT_FEEDBACK` | `1` | `0` schaltet Ton, Zwischensätze und die Elternkombination ab (der Client verhält sich dann wie vorher; die KI-Ansage beim ersten Start bleibt) |
| `KUNIBERT_ANNOUNCEMENTS_DIR` | `/var/lib/kunibert/ansagen` | Ordner mit den Sprachdateien |
| `KUNIBERT_FILLER_AFTER_SECONDS` | `2.5` | Sekunden bis zum ersten Zwischensatz |
| `KUNIBERT_LONG_WAIT_SECONDS` | `15` | Sekunden bis zum zweiten Satz |
| `KUNIBERT_ANSWER_PAUSE_SECONDS` | `0.3` | Pause zwischen Zwischensatz und Antwort |
| `KUNIBERT_INTRO_HOLD_SECONDS` | `5` | Sekunden, die die Eltern beide Tasten halten, um die KI-Ansage zu wiederholen |

### Was getestet ist

Die Abläufe sind mit einer Fake-Uhr und Fake-Audio in `test_rueckmeldung.py` getestet (Ton, Zwischensätze, Pausen, Reihenfolge, Elternkombination, fehlende Dateien). Auf echter Hardware ist **nichts** getestet: weder, wie der Ton und die Sätze über den Lautsprecher klingen, noch das sanfte Pulsieren der LED (es braucht PWM über `gpiozero.PWMLED`; ohne PWM blinkt die LED langsam).

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
KUNIBERT_STATE_DIR=/var/lib/kunibert/state
KUNIBERT_SAMPLE_RATE=16000
KUNIBERT_MAX_RECORD_SECONDS=15
KUNIBERT_REQUEST_TIMEOUT=30
KUNIBERT_PIPELINE_TIMEOUT=140
KUNIBERT_AUDIO_TIMEOUT=45
KUNIBERT_RETRY_COUNT=2
```

Zeitgrenzen in Sekunden: `KUNIBERT_REQUEST_TIMEOUT` gilt für den Health-Check, `KUNIBERT_PIPELINE_TIMEOUT` für Frage und Geschichte, `KUNIBERT_AUDIO_TIMEOUT` für den Abruf der WAV-Antwort. Frage und Geschichte laufen auf dem Server durch Spracherkennung, Sprachmodell und Sprachsynthese (Standardgrenzen 45 + 30 + 45 s). Der Client muss länger warten als diese Kette, sonst bricht er ab und schickt die Anfrage erneut, und der Server erzeugt die Antwort ein zweites Mal (bei der Geschichte rückt die Folge dabei weiter). Die abgestimmte Zeitkette mit dem Reverse Proxy steht in [`deploy/EINRICHTUNG.md`](../deploy/EINRICHTUNG.md).

```bash
sudo install -d -m 0750 /etc/kunibert /var/lib/kunibert/audio /var/lib/kunibert/state
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
