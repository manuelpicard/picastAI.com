# Raspberry-Pi-Client für Ritter Kunibert

Der Client läuft auf zwei Geräten, mit demselben Code:

- **Erster Aufbau: Raspberry Pi 5 (4 GB)** mit Raspberry Pi OS Lite, USB-Mikrofon und getrenntem USB-Lautsprecher, zwei Tastern und Status-LED. Siehe [Erster Aufbau](#erster-aufbau-pi-5-mit-usb-mikrofon-und-usb-lautsprecher).
- **Endgerät (Serie): ESP32-S3** (Entscheidung des Betreibers, 7. bis 9.11.2026). Dieser Python-Client läuft dort nicht; er dient als Vorlage für den Ablauf (`docs/picastAI-Pi-API.md`). Der Pi Zero 2 W mit Audio-HAT ist nicht mehr geplant; die Hinweise zu WM8960-/ReSpeaker-HATs unten bleiben für den Fall, dass jemand einen Pi mit HAT nutzt.

> **Stand:** Weder der Client noch das Installationsskript wurden bisher auf echter Pi-Hardware ausgeführt. Getestet sind die Python-Unit-Tests, der Client gegen einen lokalen Server und das Installationsskript in einem Debian-Container. Was am echten Pi noch zu prüfen ist, steht am Ende des Abschnitts zum ersten Aufbau.

## Automatische Installation auf frischem Raspberry Pi OS

Das Skript `install_raspberry_pi.sh` installiert die Python-Laufzeit, GPIO-/Audio-Abhängigkeiten, ALSA-Grundpakete, ein Dienstkonto, eine geschützte Umgebungsdatei und einen systemd-Service. Es ist idempotent und kann nach einem abgebrochenen Lauf erneut ausgeführt werden.

Auf dem Pi nach dem Kopieren oder Klonen des Repositories:

```bash
sudo bash pi-client/install_raspberry_pi.sh \
  --device-id pi5-001 \
  --api-token 'TOKEN_AUS_SECRET_MANAGER'
```

Für automatisierte Provisionierung ohne Eingabeaufforderung `--non-interactive` verwenden. Ohne `--api-token` wird dann absichtlich nur eine leere Konfiguration geschrieben:

```bash
sudo bash pi-client/install_raspberry_pi.sh \
  --non-interactive \
  --device-id pi5-001 \
  --api-token "$PICASTAI_DEVICE_TOKEN"
```

Vor einer echten Installation kann die Auflösung der Quelle und Optionen geprüft werden:

```bash
sudo bash pi-client/install_raspberry_pi.sh --dry-run --non-interactive
```

Für einen WM8960-HAT (Zero 2 W) kann die erkannte ALSA-Karte explizit gesetzt werden:

```bash
aplay -l
arecord -l
sudo bash pi-client/install_raspberry_pi.sh \
  --device-id pi5-001 \
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

## Erster Aufbau: Pi 5 mit USB-Mikrofon und USB-Lautsprecher

Teileliste und Begründung: [`docs/Ritter Kunibert_ Hardware für den ersten Audiogeräte-Prototyp.md`](<../docs/Ritter Kunibert_ Hardware für den ersten Audiogeräte-Prototyp.md>). Beim ersten Test sind Taster an GPIO 17 und 27 und die LED an GPIO 23 (über 330 Ω) angeschlossen. Den Mikrofon-Aus-Schalter an GPIO 22 gibt es noch nicht. Ohne Schalter liest der Eingang durch den internen Pull-up „nicht gedrückt“ (so im Code, `Button(..., pull_up=True)`); der Client läuft dann normal. Das ist nur für den Tischtest gedacht: **ohne Schalter gibt es keine Mikrofon-Abschaltung.**

**Mikrofon und Lautsprecher sind zwei getrennte USB-Geräte.** Der Client nimmt auf und spielt ab über `sounddevice` (PortAudio). Ohne Angabe nimmt PortAudio für beide Richtungen das ALSA-Gerät `default` (Quelle: PortAudio `pa_linux_alsa.c`, Auswahl des Standardgeräts). Das ist ein einziges Gerät. Damit Aufnahme und Wiedergabe auf verschiedenen USB-Geräten laufen, gibt es zwei Einstellungen:

| Einstellung | Bedeutung |
|---|---|
| `KUNIBERT_INPUT_DEVICE` | Mikrofon: Gerätenummer oder Namensteil wie in der `sounddevice`-Liste. Leer = Standardgerät. |
| `KUNIBERT_OUTPUT_DEVICE` | Lautsprecher, gleiche Schreibweise. Leer = Standardgerät. |

Vorgehen auf dem Pi:

```bash
arecord -l        # Aufnahmekarten
aplay -l          # Wiedergabekarten
sudo bash pi-client/install_raspberry_pi.sh --non-interactive --device-id pi5-001 --api-token "$PICASTAI_DEVICE_TOKEN"
/opt/kunibert/.venv/bin/python -m sounddevice     # Liste der Geräte, wie der Client sie sieht
```

Aus der Liste je einen eindeutigen Namensteil für Mikrofon und Lautsprecher nehmen und eintragen (Namen sind stabiler als Nummern, weil sich die Kartennummern von USB-Geräten ändern können):

```bash
sudo bash pi-client/install_raspberry_pi.sh --non-interactive --device-id pi5-001 \
  --api-token "$PICASTAI_DEVICE_TOKEN" \
  --capture-device 'NAMENSTEIL_MIKROFON' --playback-device 'NAMENSTEIL_LAUTSPRECHER'
```

Das schreibt `KUNIBERT_INPUT_DEVICE` und `KUNIBERT_OUTPUT_DEVICE` in `/etc/kunibert/kunibert.env`. Nachträglich geht es mit `sudoedit /etc/kunibert/kunibert.env` und `sudo systemctl restart kunibert.service`. Trifft ein Namensteil auf mehrere Geräte zu, besser einen längeren Namensteil oder die Nummer nehmen (das Verhalten von `sounddevice` bei mehrdeutigen Namen wurde nicht geprüft).

**GPIO auf dem Pi 5:** gpiozero kann dort nur das Backend `lgpio` benutzen (gpiozero-Dokumentation, „Changing the pin factory“). Das Paket `python3-gpiozero` empfiehlt `python3-lgpio` nur (`Recommends`, Raspberry-Pi-OS-Archiv). Das Installationsskript lässt Empfehlungen aus und installiert `python3-lgpio` deshalb ausdrücklich, wenn die Paketquellen es kennen. Außerdem wird der Dienstnutzer in die Gruppe `gpio` aufgenommen, und der Dienst läuft in `/var/lib/kunibert` statt in `/opt/kunibert` (dort ist wegen `ProtectSystem=strict` nichts beschreibbar, und `lgpio` legt laut Dokumentation Hilfsdateien im Arbeitsverzeichnis an).

**Am echten Pi selbst prüfen (nicht aus Dokumentation oder Containertest ableitbar):**

1. `aplay -l`: Stehen auf dem Pi 5 die HDMI-Karten vor den USB-Karten? Dann zeigt `default` ohne Einstellung auf HDMI. Erst `test_alsa_audio.sh` (siehe unten) mit den USB-Geräten, dann den Client.
2. Spielt der USB-Lautsprecher die 16-kHz-Antworten ab? Der Client fordert 16 kHz an (`KUNIBERT_SAMPLE_RATE`). Viele USB-Geräte können nativ nur 44,1 oder 48 kHz; das klappt nur, wenn ALSA umrechnet. Bei Fehlern wie „Invalid sample rate“ in `journalctl -u kunibert.service` einen anderen Eintrag aus der `sounddevice`-Liste für dasselbe Gerät wählen (zum Beispiel `sysdefault:CARD=…` statt `hw:…`).
3. Haben `/dev/gpiochip*` die Gruppe `gpio` (`ls -l /dev/gpiochip*`), und startet der Dienst ohne GPIO-Fehler im Journal?
4. Funktionieren Taster und LED (Sprechtaste, Erzähltaste, Dauerlicht in `READY`)?
5. Reagiert der Client mit offenem GPIO 22 wie erwartet (kein Dauer-`MIC_OFF`)?
6. Ohne Sprachserver antwortet der Server mit Tönen statt Sprache (Glockenton bzw. Fanfare); damit lässt sich die Audiokette (Mikrofon, Server, Lautsprecher) schon vor dem Sprachserver prüfen.

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
KUNIBERT_PIPELINE_TIMEOUT=140
KUNIBERT_AUDIO_TIMEOUT=45
KUNIBERT_RETRY_COUNT=1
# Leer = Standardgerät; bei zwei USB-Geräten getrennt setzen (siehe "Erster Aufbau")
KUNIBERT_INPUT_DEVICE=
KUNIBERT_OUTPUT_DEVICE=
```

Zeitgrenzen in Sekunden: `KUNIBERT_REQUEST_TIMEOUT` gilt für den Health-Check, `KUNIBERT_PIPELINE_TIMEOUT` für Frage und Geschichte, `KUNIBERT_AUDIO_TIMEOUT` für den Abruf der WAV-Antwort. Frage und Geschichte laufen auf dem Server durch Spracherkennung, Sprachmodell und Sprachsynthese; der Server hält dafür ein gemeinsames Zeitbudget von 120 s ein. Der Client muss länger warten als diese Kette, sonst bricht er ab und schickt die Anfrage erneut, und der Server erzeugt die Antwort ein zweites Mal (bei der Geschichte rückt die Folge dabei weiter). Die abgestimmte Zeitkette mit dem Reverse Proxy steht in [`deploy/EINRICHTUNG.md`](../deploy/EINRICHTUNG.md).

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

Beim Start wartet der Client, bis der Server antwortet: Ist er nicht erreichbar (WLAN noch nicht da, Router startet noch), blinkt die LED schnell (Fehler), und der Client versucht es alle `KUNIBERT_CONNECT_RETRY` Sekunden (Standard 10) wieder. Er beendet sich dabei nicht.

Nur Health prüfen:

```bash
/opt/kunibert/.venv/bin/python pi-client/kunibert_client.py --once health
```

Ohne Pi-Hardware gibt es zwei Prüfungen:

### Probelauf am Rechner, ohne Pi (`--keyboard`)

Damit lässt sich die ganze Kette (Aufnahme, Server, Spracherkennung, Claude, Sprachausgabe, Abspielen) mit dem Mikrofon und dem Lautsprecher eines normalen Rechners ausprobieren, bevor der Pi da ist. Tastatur statt Taster: Eingabetaste beginnt die Aufnahme, noch einmal Eingabetaste sendet sie; `g` und Eingabetaste ist die Erzähltaste; `q` und Eingabetaste beendet. Stand: Aufnahme und Wiedergabe laufen in der CI gegen die echte Audio-Bibliothek (`sounddevice` mit PortAudio, ohne Soundkarte über ein ALSA-Nullgerät); **an keinem echten Mikrofon und Lautsprecher gelaufen**. Bis zum 12.11.2026 scheiterte jede Wiedergabe an der echten Bibliothek (sie verlangte NumPy); das ist behoben. Tasten, die du drückst, während Kunibert arbeitet oder spricht, zählen nicht. Nur Erwachsene als Tester.

In PowerShell auf deinem Rechner, im Ordner des Repos (Python 3.10 oder neuer):

```powershell
py -m pip install sounddevice
$env:PICASTAI_API_BASE_URL = "https://<Hostname des Servers>"
$env:PICASTAI_DEVICE_ID = "<Geräte-ID aus /etc/kunibert/kunibert.env>"
$env:PICASTAI_DEVICE_TOKEN = "<Geräte-Token, nur hier eintippen>"
py pi-client\kunibert_client.py --keyboard
```

Das Token steht danach im Verlauf dieses PowerShell-Fensters: Fenster am Ende schließen. Mikrofon oder Lautsprecher wählen: `KUNIBERT_INPUT_DEVICE`, `KUNIBERT_OUTPUT_DEVICE` (Liste: `py -m sounddevice`). Die Wartezeit je Anfrage steht in der Zeile `Zeitmessung ... wartezeit_s=`. Meldet der Client „Die Aufnahme ist praktisch stumm“, kommt kein Ton vom Mikrofon an: anderes Gerät wählen oder unter Windows in den Einstellungen (Datenschutz, Mikrofon) den Zugriff für Desktop-Apps erlauben.

#### Ganz ohne gemieteten Server: alles auf deinem Rechner

Server, Sprachserver und Client laufen dann zusammen auf deinem Windows-Rechner. Das kostet nichts außer den Aufrufen an Claude. Stand: **nicht unter Windows getestet**; derselbe Ablauf mit Attrappen statt Sprachserver und Claude läuft in der CI (`npm run test:e2e`). Nur Erwachsene als Tester.

Einmal vorher installieren: Git, Node.js 22, Python 3.10 oder neuer und Docker Desktop (mit WSL 2). Docker Desktop ist laut seiner Lizenz für private Nutzung und für Firmen mit weniger als 250 Beschäftigten **und** unter 10 Mio. US-Dollar Jahresumsatz kostenlos (https://docs.docker.com/subscription/desktop-license/, Stand der Seite 28.9.2026). Einschätzung, nicht gemessen: 8 GB Arbeitsspeicher reichen; der erste Start lädt einige GB (Image und Modelle).

**1. Sprachserver (PowerShell, einmal):**

```powershell
docker run -d --name speaches --restart unless-stopped -p 127.0.0.1:8000:8000 -v hf-hub-cache:/home/ubuntu/.cache/huggingface/hub ghcr.io/speaches-ai/speaches:0.8.3-cpu
# warten, bis das ok liefert (kann eine Minute dauern):
curl.exe -fsS http://127.0.0.1:8000/health
curl.exe -fsS -X POST http://127.0.0.1:8000/v1/models/Systran/faster-whisper-small
curl.exe -fsS -X POST http://127.0.0.1:8000/v1/models/speaches-ai/piper-de_DE-thorsten-medium
```

`curl.exe` mit `.exe`: In Windows PowerShell ist `curl` ein anderer Befehl. Später genügt `docker start speaches`. Das Image ist bewusst eine feste Version (`0.8.3-cpu`, am 12.11.2026 dieselbe wie `latest-cpu`), damit dein Rechner und ein späterer Server gleich arbeiten. Hast du den Container schon mit `latest-cpu` angelegt, ist das derzeit dasselbe Image; nichts zu tun.

**2. Kunibert-Server (PowerShell-Fenster 1, im Ordner des Repos, Stand von `main`):**

```powershell
npm ci
$env:HOST = "127.0.0.1"
$env:PICASTAI_STT_URL = "http://127.0.0.1:8000/v1"
$env:PICASTAI_STT_MODEL = "Systran/faster-whisper-small"
$env:PICASTAI_STT_PROMPT = "Ritter Kunibert"
$env:PICASTAI_TTS_URL = "http://127.0.0.1:8000/v1"
$env:PICASTAI_TTS_MODEL = "speaches-ai/piper-de_DE-thorsten-medium"
$env:PICASTAI_TTS_VOICE = "thorsten"
$env:ANTHROPIC_API_KEY = "<dein Schlüssel, nur hier eintippen>"
npm run dev
```

Ohne `NODE_ENV=production` gibt es den eingebauten Entwicklungs-Zugang (`prototype-1`, Token `test-token-kunibert-2026`). Er steht öffentlich im Repo; deshalb lauscht der Server hier nur auf `127.0.0.1`, also nur für deinen Rechner. Die Zeilen `Zeitmessung ...` in diesem Fenster zeigen, welche Stufe wie lange braucht (`docs/Zeitmessung.md`).

**3. Client (PowerShell-Fenster 2, im Ordner des Repos):**

```powershell
py -m pip install sounddevice
$env:PICASTAI_API_BASE_URL = "http://127.0.0.1:3000"
$env:PICASTAI_DEVICE_ID = "prototype-1"
$env:PICASTAI_DEVICE_TOKEN = "test-token-kunibert-2026"
py pi-client\kunibert_client.py --keyboard
```

Danach: Fenster 1 schließen (der Schlüssel steht in seinem Verlauf) und `docker stop speaches`. Kommt später der Pi, kann der Server im selben WLAN auf diesem Rechner bleiben; dafür braucht es ein eigenes Token statt des Entwicklungs-Zugangs und eine Freigabe in der Windows-Firewall (Anleitung folgt, wenn der Pi da ist).

`--dry-run` startet den Zustandsautomaten mit Attrappen für Taster, Mikrofon, Lautsprecher und LED. Es sendet **keine** Anfrage an den Server (auch keinen Health-Check), und die Attrappen drücken nie eine Taste. Der Lauf zeigt nur, dass der Client startet und `READY` erreicht; Server-Adresse und Token spielen dabei keine Rolle:

```bash
python3 pi-client/kunibert_client.py --dry-run --debug
```

Gegen einen lokalen Server (zum Beispiel `PORT=3187 HOST=127.0.0.1 npm start` im Repository, ohne `NODE_ENV=production`) prüfen `--once health` und `--once story` den echten HTTP-Weg ohne GPIO und Audio. Der eingebaute Entwicklungs-Zugang hat die Geräte-ID `prototype-1`, nicht die Client-Standard-ID `prototype-001`, die der Server mit HTTP 401 ablehnt:

```bash
PICASTAI_API_BASE_URL=http://127.0.0.1:3187 \
PICASTAI_DEVICE_ID=prototype-1 \
PICASTAI_DEVICE_TOKEN=test-token-kunibert-2026 \
python3 pi-client/kunibert_client.py --once story --debug
```

Ohne konfigurierten Sprachserver liefert der Server dabei kurze Töne statt Sprache (Glockenton, Fanfare).

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
WorkingDirectory=/var/lib/kunibert
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

Meldet der Client beim Start „Kunibert kann nicht starten: Audio-Bibliothek startet nicht … PulseAudio_Initialize: Can't connect to server“, ist eine neuere PortAudio-Fassung (19.7) installiert, die ohne laufenden PulseAudio- oder PipeWire-Server nicht startet. So war es am 12.11.2026 auf dem CI-Rechner mit Ubuntu (`libportaudio2` 19.7.0+git20260206). Mit PortAudio 19.6 tritt das nicht auf.

Raspberry Pi OS bringt 19.6 mit (geprüft am 12.11.2026): Raspberry Pi OS „Trixie“ beruht auf Debian 13, und Debian 13 hat `libportaudio2` 19.6.0-1.2+b3 (Debian-Archiv, `https://api.ftp-master.debian.org/madison?package=libportaudio2`; erst Debian „testing“ hat 19.7.0-1+b1). Das Archiv von Raspberry Pi (`archive.raspberrypi.com/debian`, `trixie`, arm64) enthält kein eigenes PortAudio-Paket, also gilt das von Debian. Prüfen am Pi: `dpkg -l libportaudio2`. Steht dort einmal 19.7, hilft ein laufender PipeWire- oder PulseAudio-Server für den Benutzer `kunibert` (Anleitung folgt dann).

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
