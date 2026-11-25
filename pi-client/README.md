# Raspberry-Pi-Client für Ritter Kunibert

Der Client läuft auf zwei Geräten, mit demselben Code:

- **Erster Aufbau: Raspberry Pi 5 (4 GB)** mit Raspberry Pi OS Lite, USB-Mikrofon und getrenntem USB-Lautsprecher, zwei Tastern und Status-LED. Siehe [Erster Aufbau](#erster-aufbau-pi-5-mit-usb-mikrofon-und-usb-lautsprecher).
- **Endgerät (Serie): ESP32-S3** (Entscheidung des Betreibers, 7. bis 9.11.2026). Dieser Python-Client läuft dort nicht; er dient als Vorlage für den Ablauf (`docs/picastAI-Pi-API.md`). Der Pi Zero 2 W mit Audio-HAT ist nicht mehr geplant; die Hinweise zu WM8960-/ReSpeaker-HATs unten bleiben für den Fall, dass jemand einen Pi mit HAT nutzt.

> **Stand:** Weder der Client noch das Installationsskript wurden bisher auf echter Pi-Hardware ausgeführt. Getestet sind die Python-Unit-Tests, der Client gegen einen lokalen Server und das Installationsskript in einem frischen Debian-13-Container ([`install_raspberry_pi.test.sh`](install_raspberry_pi.test.sh), in der CI als Job `pi-installer`; Einzelheiten unten). Was am echten Pi noch zu prüfen ist, steht am Ende des Abschnitts zum ersten Aufbau.

## Automatische Installation auf frischem Raspberry Pi OS

Das Skript `install_raspberry_pi.sh` installiert die Python-Laufzeit, GPIO-/Audio-Abhängigkeiten, ALSA-Grundpakete, ein Dienstkonto, eine geschützte Umgebungsdatei und einen systemd-Service. Es ist idempotent und kann nach einem abgebrochenen Lauf erneut ausgeführt werden.

**So kommt der Ordner auf den Pi:** am besten am Pi selbst mit `git clone`. Dann haben alle Dateien Linux-Zeilenenden (LF):

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/manuelpicard/picastAI.com.git
cd picastAI.com
```

Kopierst du den Ordner von einem Windows-Rechner (USB-Stick, `scp`), prüf vorher im Windows-Klon (PowerShell, im Repo-Ordner): `git ls-files --eol pi-client/install_raspberry_pi.sh` muss `w/lf` zeigen. Zeigt es `w/crlf`, den Ordner neu klonen. Seit dem 25.11.2026 legt `.gitattributes` fest, dass Git Skripte, Python-, systemd-, Umgebungs- und HTML-Dateien auch unter Windows mit LF auscheckt. Ein älterer Windows-Klon behält seine Windows-Zeilenenden aber auch nach `git pull`. Meldet der Installer `$'\r': command not found` oder `invalid option name`, hat die Kopie Windows-Zeilenenden: den Ordner am Pi mit `git clone` neu holen.

Dann im Ordner des Repos:

```bash
sudo bash pi-client/install_raspberry_pi.sh --device-id prototype-001
```

**Das Token** fragt der Installer verdeckt ab. So steht es nicht in der Befehlszeile, nicht in der Prozessliste und nicht im Shell-Verlauf. Eine Option, das Token direkt mitzugeben, gibt es deshalb nicht (`--api-token` lehnt der Installer ab). Erlaubt sind Buchstaben, Ziffern und `. _ ~ + / = : -` (zum Beispiel hex aus `openssl rand -hex 32`).

Für automatisierte Provisionierung ohne Eingabeaufforderung: `--non-interactive` und das Token aus einer Datei, die nur root lesen kann (erste Zeile). Die Datei ohne Shell-Verlauf anlegen und danach löschen:

```bash
sudo install -m 600 /dev/null /root/kunibert-token
sudoedit /root/kunibert-token          # Token in die erste Zeile, speichern
sudo bash pi-client/install_raspberry_pi.sh \
  --non-interactive \
  --device-id prototype-001 \
  --api-token-file /root/kunibert-token
sudo rm /root/kunibert-token
```

Gibt es weder ein Token noch eine vorhandene Konfiguration mit Token, schreibt der Installer ein leeres Token und warnt; der Dienst arbeitet dann erst nach `sudoedit /etc/kunibert/kunibert.env`.

**Ein zweiter Lauf** übernimmt aus der vorhandenen `/etc/kunibert/kunibert.env` alles, was beim Aufruf fehlt: Adresse, Geräte-ID, Token, Name, Abtastrate, Mikrofon, Lautsprecher und Zeilen, die du mit `sudoedit` geändert oder ergänzt hast. Er nennt die Namen der behaltenen Werte, nie die Werte. Fehlende Zeilen ergänzt er mit dem Standardwert. Neue Standardwerte einer späteren Fassung ersetzen vorhandene Zeilen also nicht. Ausnahmen setzt er immer neu, mit Warnung: `KUNIBERT_PIPELINE_TIMEOUT=140` (Zeitkette: Server 120 s, Caddy 130 s, Gerät 140 s) sowie `KUNIBERT_CACHE_DIR` und `KUNIBERT_ANNOUNCEMENTS_DIR` (müssen zur Dienstdatei passen). Kommentare übernimmt er nicht; Windows-Zeilenenden und Einrückung vor einem Namen fallen weg. Mit denselben Angaben ändert ein zweiter Lauf an `kunibert.env`, Dienstdatei, Rechten und Besitzern nichts. Bei jedem Lauf neu: Systempakete, `pip install --upgrade` und die Sicherung einer vorhandenen `/etc/asound.conf`. Ein neues Token: `--ask-token` (verdeckte Abfrage, auch wenn schon eines gespeichert ist) oder `--api-token-file`.

**Wer das Token lesen darf:** nur root und das Dienstkonto `kunibert`. Der Ordner `/etc/kunibert` (Rechte 0750) und `kunibert.env` (Rechte 0640) gehören root, Gruppe `kunibert`. In dieser Gruppe ist nur das Dienstkonto; findet der Installer dort weitere Konten, warnt er. Andere Nutzer, auch Mitglieder von `audio` wie der Standardnutzer, lesen die Datei nicht. systemd liest sie beim Start des Dienstes als root (Einschätzung; am Pi noch nicht geprüft). Werte ohne das Token ansehen: `sudo grep -v '^PICASTAI_DEVICE_TOKEN=' /etc/kunibert/kunibert.env`.

**Getestet** (nicht am Pi): [`install_raspberry_pi.test.sh`](install_raspberry_pi.test.sh) führt den Installer als root in einem frischen Debian 13 aus (wie Raspberry Pi OS „Trixie“), in der CI als Job `pi-installer`. Er prüft Dienstkonto, Ordner, `kunibert.env` (Werte, Rechte, Besitzer), die Dienstdatei (auch mit `systemd-analyze verify`), den zweiten Lauf, einen Lauf ohne Token, Änderungen von Hand, wer die Datei lesen darf, den Health-Aufruf aus „Manuell starten“, die verdeckte Abfrage an einem Pseudo-Terminal und dass das Token nie in einer Ausgabe und in keiner anderen Datei steht. `systemctl` ist dabei eine Attrappe (nur `enable` läuft echt): Ob der Dienst startet, zeigt erst der echte Pi. Selbst ausführen (ändert das System, deshalb nur im Wegwerf-Container; der Test bricht ab, wenn er keinen erkennt): `docker run --rm -e KUNIBERT_INSTALLER_TEST=1 -v "$PWD":/src:ro debian:trixie bash /src/pi-client/install_raspberry_pi.test.sh`.

Vor einer echten Installation kann die Auflösung der Quelle und Optionen geprüft werden:

```bash
sudo bash pi-client/install_raspberry_pi.sh --dry-run --non-interactive
```

Für einen WM8960-HAT (Zero 2 W) kann die erkannte ALSA-Karte explizit gesetzt werden:

```bash
aplay -l
arecord -l
sudo bash pi-client/install_raspberry_pi.sh \
  --device-id prototype-001 \
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
sudo bash pi-client/install_raspberry_pi.sh --device-id prototype-001   # fragt das Token verdeckt ab
/opt/kunibert/.venv/bin/python -m sounddevice     # Liste der Geräte, wie der Client sie sieht
```

Aus der Liste je einen eindeutigen Namensteil für Mikrofon und Lautsprecher nehmen und eintragen (Namen sind stabiler als Nummern, weil sich die Kartennummern von USB-Geräten ändern können):

```bash
sudo bash pi-client/install_raspberry_pi.sh --non-interactive \
  --capture-device 'NAMENSTEIL_MIKROFON' --playback-device 'NAMENSTEIL_LAUTSPRECHER'
```

Das schreibt `KUNIBERT_INPUT_DEVICE` und `KUNIBERT_OUTPUT_DEVICE` in `/etc/kunibert/kunibert.env`. Adresse, Geräte-ID und Token aus dem ersten Lauf bleiben (siehe „Ein zweiter Lauf“ oben). Nachträglich geht es mit `sudoedit /etc/kunibert/kunibert.env` und `sudo systemctl restart kunibert.service`. Trifft ein Namensteil auf mehrere Geräte zu, besser einen längeren Namensteil oder die Nummer nehmen (das Verhalten von `sounddevice` bei mehrdeutigen Namen wurde nicht geprüft).

**GPIO auf dem Pi 5:** gpiozero kann dort nur das Backend `lgpio` benutzen (gpiozero-Dokumentation, „Changing the pin factory“). Das Paket `python3-gpiozero` empfiehlt `python3-lgpio` nur (`Recommends`, Raspberry-Pi-OS-Archiv). Das Installationsskript lässt Empfehlungen aus und installiert `python3-lgpio` deshalb ausdrücklich, wenn die Paketquellen es kennen. Außerdem wird der Dienstnutzer in die Gruppe `gpio` aufgenommen, und der Dienst läuft in `/var/lib/kunibert` statt in `/opt/kunibert` (dort ist wegen `ProtectSystem=strict` nichts beschreibbar, und `lgpio` legt laut Dokumentation Hilfsdateien im Arbeitsverzeichnis an).

**Am echten Pi selbst prüfen (nicht aus Dokumentation oder Containertest ableitbar):**

1. `aplay -l`: Stehen auf dem Pi 5 die HDMI-Karten vor den USB-Karten? Dann zeigt `default` ohne Einstellung auf HDMI. Erst `test_alsa_audio.sh` (siehe unten) mit den USB-Geräten, dann den Client.
2. Spielt der USB-Lautsprecher die 16-kHz-Antworten ab? Der Client fordert 16 kHz an (`KUNIBERT_SAMPLE_RATE`). Viele USB-Geräte können nativ nur 44,1 oder 48 kHz; das klappt nur, wenn ALSA umrechnet. Bei Fehlern wie „Invalid sample rate“ in `journalctl -u kunibert.service` einen anderen Eintrag aus der `sounddevice`-Liste für dasselbe Gerät wählen (zum Beispiel `sysdefault:CARD=…` statt `hw:…`).
3. Haben `/dev/gpiochip*` die Gruppe `gpio` (`ls -l /dev/gpiochip*`), und startet der Dienst ohne GPIO-Fehler im Journal?
4. Funktionieren Taster und LED (Sprechtaste, Erzähltaste, Dauerlicht in `READY`)?
5. Reagiert der Client mit offenem GPIO 22 wie erwartet (kein Dauer-`MIC_OFF`)?
6. Ohne Sprachserver antwortet der Server mit Tönen statt Sprache (Glockenton bzw. Fanfare); damit lässt sich die Audiokette (Mikrofon, Server, Lautsprecher) schon vor dem Sprachserver prüfen.
7. Startet der Dienst mit `kunibert.env` (Rechte 0640, Gruppe `kunibert`)? Steht in `journalctl -u kunibert.service` „Failed to load environment files“, liest systemd die Datei nicht als root (anders als im Abschnitt „Wer das Token lesen darf“ eingeschätzt).
8. In welchen Gruppen ist der Standardnutzer (`id`)? Der Containertest nimmt an, dass er in `audio` ist, aber nicht in `kunibert`.

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

PLAYING ── neuer Druck auf eine Taste ──> Wiedergabe stoppt ──> (Tasten los) ──> READY

jeder Zustand ── MIC OFF ──> MIC_OFF ──> READY
jeder Netzwerk-/Audiofehler ──> ERROR ──> READY
SIGTERM/Ctrl+C ──> SHUTDOWN
```

Während Kunibert spricht, stoppt ein **neuer** Druck auf die Sprech- oder die Erzähltaste die Wiedergabe sofort (seit 12.11.2026). Eine Taste, die beim Beginn der Wiedergabe noch gedrückt war, zählt erst nach dem Loslassen. Der Stopp-Druck startet keine neue Frage und keine Geschichte: Erst wenn beide Tasten losgelassen sind (höchstens 10 s Warten), ist Kunibert wieder bereit. Die Firmware macht es genauso.

Seit 21.11.2026 (Punkt B2) meldet der Client den Stopp dem Server: die Kennung der Antwort (letzter Teil der `audio_url`) und die gespielten Sekunden, gezählt an den Samples, die er an die Soundkarte geschrieben hat (`POST /v1/device/playback-stopped`, siehe [`docs/picastAI-Pi-API.md`](../docs/picastAI-Pi-API.md)). Danach geht die Geschichte an dieser Stelle weiter: mit einer Idee über die Sprechtaste, mit „weiter“ oder mit der Erzähltaste. Die Meldung läuft im Hintergrund, ein Versuch, Zeitgrenze `KUNIBERT_STOP_REPORT_TIMEOUT` (Standard 3 Sekunden, je Netzschritt). Kunibert ist trotzdem gleich wieder bereit. Erst die nächste Frage oder Geschichte wartet auf die Meldung, höchstens die Zeitgrenze plus eine Sekunde; danach geht sie trotzdem los, und eine spätere Meldung gilt beim Server nicht mehr. Ist der Server nicht erreichbar, steht nur eine Warnung im Protokoll (ohne Kennung). Im Protokoll steht `Stopp gemeldet nach 12.4 s`. `KUNIBERT_STOP_REPORT=0` schaltet die Meldung ab; dann erzählt der Server wie vorher den nächsten Teil. Die Firmware meldet den Stopp noch nicht (Punkt N1121-0607-a der Arbeitsliste).

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

Kinder sollen nie still warten müssen. Dafür gibt es zwei Dinge: Quittung und Zwischensätze. Der Code steht in `rueckmeldung.py`.

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
| `KUNIBERT_FEEDBACK` | `1` | `0` schaltet Ton, Zwischensätze ab (der Client verhält sich dann wie vorher) |
| `KUNIBERT_ANNOUNCEMENTS_DIR` | `/var/lib/kunibert/ansagen` | Ordner mit den Sprachdateien |
| `KUNIBERT_FILLER_AFTER_SECONDS` | `2.5` | Sekunden bis zum ersten Zwischensatz |
| `KUNIBERT_LONG_WAIT_SECONDS` | `15` | Sekunden bis zum zweiten Satz |
| `KUNIBERT_ANSWER_PAUSE_SECONDS` | `0.3` | Pause zwischen Zwischensatz und Antwort |

### Was getestet ist

Die Abläufe sind mit einer Fake-Uhr und Fake-Audio in `test_rueckmeldung.py` getestet (Ton, Zwischensätze, Pausen, Reihenfolge, fehlende Dateien). Auf echter Hardware ist **nichts** getestet: weder, wie der Ton und die Sätze über den Lautsprecher klingen, noch das sanfte Pulsieren der LED (es braucht PWM über `gpiozero.PWMLED`; ohne PWM blinkt die LED langsam).

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
# Ton-Strom anfragen (nur wirksam mit PICASTAI_AUDIO_STREAM=1 am Server); 0 = immer ganze Datei
KUNIBERT_AUDIO_STREAM=1
# Stopp per Taste dem Server melden (Punkt B2); 0 = nicht melden. Zeitgrenze der Meldung in Sekunden
KUNIBERT_STOP_REPORT=1
KUNIBERT_STOP_REPORT_TIMEOUT=3
KUNIBERT_RETRY_COUNT=1
# Leer = Standardgerät; bei zwei USB-Geräten getrennt setzen (siehe "Erster Aufbau")
KUNIBERT_INPUT_DEVICE=
KUNIBERT_OUTPUT_DEVICE=
```

Zeitgrenzen in Sekunden: `KUNIBERT_REQUEST_TIMEOUT` gilt für den Health-Check, `KUNIBERT_PIPELINE_TIMEOUT` für Frage und Geschichte, `KUNIBERT_AUDIO_TIMEOUT` für den Abruf der WAV-Antwort. Frage und Geschichte laufen auf dem Server durch Spracherkennung, Sprachmodell und Sprachsynthese; der Server hält dafür ein gemeinsames Zeitbudget von 120 s ein. Der Client muss länger warten als diese Kette, sonst bricht er ab und schickt die Anfrage erneut, und der Server erzeugt die Antwort ein zweites Mal (bei der Geschichte rückt die Folge dabei weiter). Die abgestimmte Zeitkette mit dem Reverse Proxy steht in [`deploy/EINRICHTUNG.md`](../deploy/EINRICHTUNG.md).

Dienstkonto, Ordner und Rechte wie beim Installer (das Token lesen nur root und das Dienstkonto, siehe „Wer das Token lesen darf“ oben):

```bash
sudo groupadd --system kunibert
sudo useradd --system --gid kunibert --groups audio --home-dir /opt/kunibert --shell /usr/sbin/nologin kunibert
getent group gpio >/dev/null && sudo usermod -a -G gpio kunibert   # GPIO auf dem Pi 5 (siehe „Erster Aufbau“)
sudo install -d -o kunibert -g audio -m 0750 /opt/kunibert /var/lib/kunibert /var/lib/kunibert/audio /var/lib/kunibert/ansagen
sudo install -d -o root -g kunibert -m 0750 /etc/kunibert
sudoedit /etc/kunibert/kunibert.env
sudo chown root:kunibert /etc/kunibert/kunibert.env
sudo chmod 0640 /etc/kunibert/kunibert.env
```

## Manuell starten

Der Client läuft dabei wie im Dienst als Dienstkonto `kunibert`: Nur dieses Konto (und root) darf `kunibert.env` lesen. Vorher den Dienst anhalten, sonst greifen zwei Clients auf Taster und Ton zu:

```bash
sudo systemctl stop kunibert.service
sudo -u kunibert bash -c 'cd /var/lib/kunibert && set -a && . /etc/kunibert/kunibert.env && set +a && exec /opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py --debug'
```

Beim Start wartet der Client, bis der Server antwortet: Ist er nicht erreichbar (WLAN noch nicht da, Router startet noch), blinkt die LED schnell (Fehler), und der Client versucht es alle `KUNIBERT_CONNECT_RETRY` Sekunden (Standard 10) wieder. Er beendet sich dabei nicht.

Vorher prüft der Client Adresse, Geräte-ID und Token. Leerzeichen und Zeilenenden am Rand lässt er weg, zum Beispiel ein Windows-Zeilenende, wenn die Shell `kunibert.env` einliest. Erlaubt sind:

- Adresse: `http://` oder `https://` mit Rechnername, ohne Name und Passwort.
- Geräte-ID: sichtbare ASCII-Zeichen ohne Leerzeichen (keine Umlaute).
- Token: dieselben Zeichen wie beim Installer (siehe „Das Token“ oben).

Fehlt die Geräte-ID oder das Token oder passt ein Wert nicht, startet der Client nicht, auch nicht mit `--once`. Ausnahme: `--dry-run` braucht keine Geräte-ID und kein Token; ist eines gesetzt, muss es aber passen. Der Client meldet dann eine Zeile wie „Kunibert kann nicht starten: PICASTAI_DEVICE_TOKEN enthält Zeichen, …“, ohne den Wert und ohne Traceback. Abhilfe: mit `sudoedit /etc/kunibert/kunibert.env` die genannte Zeile prüfen (`PICASTAI_DEVICE_TOKEN=`, `PICASTAI_DEVICE_ID=` oder `PICASTAI_API_BASE_URL=`). Oder den Installer noch einmal laufen lassen: mit `--ask-token` für ein neues Token, mit `--device-id` für die Geräte-ID. Scheitert eine Anfrage trotzdem an einem Wert in einer Kopfzeile, nennt die Meldung nur die Art des Fehlers („Anfrage nicht gesendet: ungültige Adresse oder Kopfzeile“), nie den Kopf.

Nur Health prüfen (muss `OK` melden; prüft die Adresse aus `kunibert.env`, nicht die Standardadresse):

```bash
sudo -u kunibert bash -c 'cd /var/lib/kunibert && set -a && . /etc/kunibert/kunibert.env && set +a && exec /opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py --once health'
```

Genau diesen Aufruf führt der Containertest aus (`install_raspberry_pi.test.sh`, gegen einen kleinen Test-Server unter der Adresse aus `kunibert.env`). [`test_anleitung.py`](test_anleitung.py) prüft, dass derselbe Aufruf auch in Schritt 5 von „Später: der Pi im selben WLAN“, in `deploy/CHECKLISTE.md`, Teil B, und in `deploy/EINRICHTUNG.md`, Abschnitt 8, steht. `--once health` greift nicht auf Taster und Ton zu; der Dienst darf dabei laufen.

Ohne Pi-Hardware gibt es zwei Prüfungen:

### Probelauf am Rechner, ohne Pi (`--keyboard`)

Damit lässt sich die ganze Kette (Aufnahme, Server, Spracherkennung, Claude, Sprachausgabe, Abspielen) mit dem Mikrofon und dem Lautsprecher eines normalen Rechners ausprobieren, bevor der Pi da ist. Tastatur statt Taster: Eingabetaste beginnt die Aufnahme, noch einmal Eingabetaste sendet sie; `g` und Eingabetaste ist die Erzähltaste; `q` und Eingabetaste beendet. Stand: Aufnahme und Wiedergabe laufen in der CI gegen die echte Audio-Bibliothek (`sounddevice` mit PortAudio, ohne Soundkarte über ein ALSA-Nullgerät); **an keinem echten Mikrofon und Lautsprecher gelaufen**. Bis zum 12.11.2026 scheiterte jede Wiedergabe an der echten Bibliothek (sie verlangte NumPy); das ist behoben. Drückst du die Eingabetaste (oder `g` und Eingabetaste), während Kunibert spricht, hört er sofort auf, wie bei den Tastern am Pi; der Druck zählt nicht als neue Aufnahme. Tasten, die du drückst, während Kunibert noch arbeitet, zählen nicht. Nur Erwachsene als Tester.

In PowerShell auf deinem Rechner, im Ordner des Repos (Python 3.10 oder neuer):

```powershell
py -m pip install sounddevice
$env:PICASTAI_API_BASE_URL = "https://<Hostname des Servers>"
$env:PICASTAI_DEVICE_ID = "<Geräte-ID aus /etc/kunibert/kunibert.env>"
$env:PICASTAI_DEVICE_TOKEN = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Geräte-Token')).Password
py pi-client\kunibert_client.py --keyboard
```

Die Zeile mit `Read-Host -AsSecureString` fragt das Token verdeckt ab. So steht es nicht in der Befehlszeile: PowerShell speichert Befehlszeilen in einer Verlaufsdatei, auch nach dem Schließen des Fensters. Tokens und Schlüssel deshalb nie direkt hinter `=` eintippen. Jede Zeile mit `Read-Host` einzeln einfügen und mit der Eingabetaste abschicken, erst dann das Token eingeben; sonst liest die Abfrage die nächste eingefügte Zeile als Token. Hast du früher Tokens oder Schlüssel direkt eingetippt, zeigt `(Get-PSReadLineOption).HistorySavePath` die Datei; die Zeilen dort löschen. Mikrofon oder Lautsprecher wählen: `KUNIBERT_INPUT_DEVICE`, `KUNIBERT_OUTPUT_DEVICE` (Liste: `py -m sounddevice`). Die Wartezeit je Anfrage steht in der Zeile `Zeitmessung ... wartezeit_s=`. Meldet der Client „Die Aufnahme ist praktisch stumm“, kommt kein Ton vom Mikrofon an: anderes Gerät wählen oder unter Windows in den Einstellungen (Datenschutz, Mikrofon) den Zugriff für Desktop-Apps erlauben.

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

**1b. Kuniberts Stimme (Pocket TTS, eigenes PowerShell-Fenster):** Seit 13.11.2026 spricht Kunibert mit Pocket TTS und der freien Stimme `stuart_bell` (CC0). Piper bleibt der Rückfall. Mit `uv`:

```powershell
uvx --python 3.12 pocket-tts@4.0.1 serve --language german --default-voice stuart_bell --host 127.0.0.1 --port 8001
```

Der erste Start lädt Programm und Modell (einige hundert MB). Bereit ist der Dienst, wenn `curl.exe -fsS http://127.0.0.1:8001/health` antwortet. Im Server-Fenster (Schritt 2) dann zusätzlich:

```powershell
$env:PICASTAI_TTS_PROVIDER = "pocket"
$env:PICASTAI_POCKET_TTS_URL = "http://127.0.0.1:8001"
```

Tempo und Pausen lassen sich mit `PICASTAI_POCKET_TTS_TEMPO` (0.7 bis 1.3, Standard 0.92) und `PICASTAI_POCKET_TTS_PAUSE_MS` (0 bis 2000, Standard 450) einstellen.

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
$env:ANTHROPIC_API_KEY = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Anthropic-Schlüssel')).Password
$env:KUNIBERT_EINWILLIGUNG_PRUEFEN = "0"
npm run dev
```

`KUNIBERT_EINWILLIGUNG_PRUEFEN=0` schaltet für diesen Probelauf die Prüfung der Einwilligung der Eltern ab (seit 20.11.2026; ohne die Zeile antwortet Kunibert nur „… müssen mich deine Eltern einmal einrichten …“). Das geht nur ohne `NODE_ENV=production`. Ohne `NODE_ENV=production` gibt es den eingebauten Entwicklungs-Zugang (`prototype-1`, Token `test-token-kunibert-2026`). Er steht öffentlich im Repo; deshalb lauscht der Server hier nur auf `127.0.0.1`, also nur für deinen Rechner. Die Zeilen `Zeitmessung ...` in diesem Fenster zeigen, welche Stufe wie lange braucht (`docs/Zeitmessung.md`).

**3. Client (PowerShell-Fenster 2, im Ordner des Repos):**

```powershell
py -m pip install sounddevice
$env:PICASTAI_API_BASE_URL = "http://127.0.0.1:3000"
$env:PICASTAI_DEVICE_ID = "prototype-1"
$env:PICASTAI_DEVICE_TOKEN = "test-token-kunibert-2026"
py pi-client\kunibert_client.py --keyboard
```

Danach: Fenster 1 schließen (der Schlüssel steht bis dahin in seinen Einstellungen) und `docker stop speaches`. Kommt später der Pi, kann der Server im selben WLAN auf diesem Rechner bleiben (Abschnitt „Später: der Pi im selben WLAN“ weiter unten).

`--dry-run` startet den Zustandsautomaten mit Attrappen für Taster, Mikrofon, Lautsprecher und LED. Es sendet **keine** Anfrage an den Server (auch keinen Health-Check), und die Attrappen drücken nie eine Taste. Der Lauf zeigt nur, dass der Client startet und `READY` erreicht; Geräte-ID und Token braucht er nicht (sind sie gesetzt, prüft er ihre Zeichen wie unter „Manuell starten“):

```bash
python3 pi-client/kunibert_client.py --dry-run --debug
```

Gegen einen lokalen Server (zum Beispiel `PORT=3187 HOST=127.0.0.1 KUNIBERT_EINWILLIGUNG_PRUEFEN=0 npm start` im Repository, ohne `NODE_ENV=production`) prüfen `--once health` und `--once story` den echten HTTP-Weg ohne GPIO und Audio. Der eingebaute Entwicklungs-Zugang hat die Geräte-ID `prototype-1`, nicht die Client-Standard-ID `prototype-001`, die der Server mit HTTP 401 ablehnt:

```bash
PICASTAI_API_BASE_URL=http://127.0.0.1:3187 \
PICASTAI_DEVICE_ID=prototype-1 \
PICASTAI_DEVICE_TOKEN=test-token-kunibert-2026 \
python3 pi-client/kunibert_client.py --once story --debug
```

Ohne konfigurierten Sprachserver liefert der Server dabei kurze Töne statt Sprache (Glockenton, Fanfare).

#### Später: der Pi im selben WLAN, der Server bleibt auf deinem Rechner

Für den ersten Durchlauf mit dem Pi ohne gemieteten Server. Zum Abhaken: [`deploy/CHECKLISTE.md`](../deploy/CHECKLISTE.md), Teil A1 („Server auf dem eigenen Rechner“), danach Teil B bis D. Stand: **nicht getestet** (kein Pi da, nicht unter Windows); geschrieben nach dem Code (`server.ts`, `server-api/config.ts`, `server-api/devices.ts`, `server-api/http-utils.ts`). Nur Erwachsene als Tester.

Was anders ist als im Probelauf oben: Der Server läuft mit `NODE_ENV=production` (dann gibt es den öffentlich bekannten Entwicklungs-Zugang nicht), er lauscht im Heimnetz statt nur auf deinem Rechner, und der Pi bekommt ein eigenes Token.

**1. Zwei Tokens erzeugen (PowerShell, einmal):** die Zeile zweimal ausführen, einmal für den Pi (Geräte-Token) und einmal für dich (Betreiber-Token, für die Einwilligung in Schritt 3b). Die Tokens gibst du nur in die verdeckten Abfragen der Schritte 3 und 3b und am Pi ein; nicht in Chats, Dateien, Git oder direkt in eine Befehlszeile:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
```

**2. Adresse deines Rechners im WLAN:** `ipconfig`, Zeile „IPv4-Adresse“ des WLAN- oder LAN-Adapters, zum Beispiel `192.168.178.20`. Damit sie gleich bleibt, kannst du im Router (zum Beispiel FRITZ!Box: Heimnetz, Netzwerk, „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“) eine feste Adresse vergeben.

**3. Server (PowerShell-Fenster 1, im Ordner des Repos):** wie oben Schritt 2, aber so:

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
$env:PICASTAI_AUDIO_STREAM = "1"
$env:PICASTAI_DEVICE_ID = "prototype-001"
$env:PICASTAI_DEVICE_TOKEN = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Geräte-Token')).Password
$env:PICASTAI_ADMIN_TOKEN = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Betreiber-Token')).Password
$env:ANTHROPIC_API_KEY = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Anthropic-Schlüssel')).Password
# dazu dieselben Zeilen für Sprachserver und Stimme wie oben (PICASTAI_STT_…, PICASTAI_TTS_…, mit Pocket auch PICASTAI_POCKET_TTS_URL)
npm start
```

`PICASTAI_AUDIO_STREAM=1` schaltet den Ton-Strom ein: Schreibt Claude gerade einen Teil der Geschichte, liefert der Server ihn Absatz für Absatz, und der Pi spielt den ersten Absatz, während der Rest noch entsteht (`docs/picastAI-Pi-API.md`, „Ton-Strom“). Fragen, feste Texte und vorbereitete Teile kommen auch dann als ganze Datei. Erwartet im Fenster: `läuft auf http://0.0.0.0:3000`, kein „Hinweis: NODE_ENV ist nicht "production"“, keine Zeile mit ⚠️ außer „Eltern-Steuerung nur im Arbeitsspeicher …“ (hier erwartet, siehe Schritt 3b) und nach einigen Sekunden `Feste Sprechtexte vorbereitet (7 von 7)`. Steht dort „neuer Versuch in … s“, erreicht der Server die Stimme nicht (Schritt 1b prüfen). Die Zeilen mit `Read-Host` einzeln einfügen (siehe „Probelauf am Rechner“).

**3b. Einwilligung (PowerShell-Fenster 2, im Ordner des Repos, nach jedem Start des Servers):** Mit `NODE_ENV=production` antwortet Kunibert erst, wenn die Eltern eingewilligt haben. Solange der Pi den Kopplungscode noch nicht selbst spricht, erteilst du sie für den Test mit Erwachsenen so:

```powershell
$env:PICASTAI_ADMIN_TOKEN = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Betreiber-Token')).Password
$env:PICASTAI_DEVICE_ID = "prototype-001"
node deploy\eltern-einwilligung.mjs
```

Erwartet: `Einwilligung erteilt.` Auf dem eigenen Rechner liegt sie nur im Arbeitsspeicher des Servers und ist nach einem Neustart weg. Auf dem gemieteten Server übersteht sie den Neustart (Datei der Eltern-Steuerung, `deploy/EINRICHTUNG.md`, Abschnitt 3). Danach dieses Fenster schließen.

Ohne `PICASTAI_PUBLIC_BASE_URL` baut der Server die `audio_url` aus der Adresse, die der Pi aufruft; das passt im Heimnetz. Der Sprachserver bleibt auf `127.0.0.1:8000`, er ist nur für deinen Rechner da.

**4. Windows-Firewall:** Beim ersten Start fragt Windows, ob Node.js im Netzwerk erreichbar sein darf. Nur „Private Netzwerke“ erlauben, nicht „Öffentliche Netzwerke“. Dein WLAN muss in Windows als „Privates Netzwerk“ eingestellt sein (Einstellungen, Netzwerk und Internet, WLAN, Netzwerkprofiltyp). Kommt keine Frage, gibt es vielleicht schon eine Regel für Node.js: unter „Windows-Sicherheit“, „Firewall- und Netzwerkschutz“, „Zugriff von App durch Firewall zulassen“ nachsehen; Node.js darf nur bei „Privat“ angehakt sein, und eine Sperre für Node.js geht jeder Erlaubnis vor. Fehlt eine Regel, legt diese Zeile in einer PowerShell **als Administrator** sie an (nur Port 3000, nur aus dem eigenen Netz):

```powershell
New-NetFirewallRule -DisplayName "Kunibert-Server (Heimnetz)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet -Action Allow
```

**5. Am Pi:** Installation wie oben („Automatische Installation“) mit `--api-url http://192.168.178.20:3000 --device-id prototype-001` (deine Adresse); das Token fragt der Installer verdeckt ab. Ob der Rechner vom Pi aus erreichbar ist, zeigt `curl -fsS http://192.168.178.20:3000/health` am Pi (deine Adresse; Antwort mit `"status":"ok"`). Danach Health mit den Einstellungen aus `/etc/kunibert/kunibert.env` prüfen, als Dienstkonto wie in „Manuell starten“. Er muss `OK` melden. Ohne diese Einstellungen fehlt das Token, und der Client bricht ab; steht in der Shell ein Token, prüft er die Standardadresse `https://picastAI.com`, nicht deinen Rechner. Was eine andere Ausgabe bedeutet, steht in `deploy/CHECKLISTE.md`, Teil B.

```bash
sudo -u kunibert bash -c 'cd /var/lib/kunibert && set -a && . /etc/kunibert/kunibert.env && set +a && exec /opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py --once health'
```

Dann `deploy/CHECKLISTE.md`, Teil B bis D.

**Grenzen:** Zwischen Pi und Rechner läuft http, also unverschlüsselt im eigenen WLAN (das WLAN selbst ist verschlüsselt). Für Tests mit Erwachsenen im eigenen Netz in Ordnung (Einschätzung); für Geräte außerhalb deines WLANs braucht es HTTPS (Tailscale Funnel oder ein Server, siehe Projektliste, Punkt 65). Ohne Caddy ist im WLAN mehr erreichbar als hinter Caddy: die Betreiber-Routen (`/api/…`, nur mit Betreiber-Token) und die Entwicklungsseiten (`/`, `/hoerproben`; ohne Daten). Wie hinter Caddy sind auch die Eltern-Seite und die Eltern-Routen erreichbar (`/eltern`, `/v1/eltern/…`, nur mit Kopplungscode). Der Rechner muss laufen, solange der Pi arbeiten soll. Aufräumen: Fenster 1 und das Fenster der Stimme schließen, `docker stop speaches`; die Firewall-Regel entfernst du mit `Remove-NetFirewallRule -DisplayName "Kunibert-Server (Heimnetz)"` (als Administrator).

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
- Ohne Einwilligung der Eltern, im Schlafmodus und in den Ruhezeiten antwortet der Server nur mit einem festen Satz (siehe [`docs/picastAI-Pi-API.md`](../docs/picastAI-Pi-API.md)). Mit `NODE_ENV=production` vorher einwilligen (`deploy/eltern-einwilligung.mjs`); ohne Datei der Eltern-Steuerung (`KUNIBERT_ELTERN_DATEI`, `KUNIBERT_ELTERN_SCHLUESSEL`) nach jedem Neustart des Servers erneut. Im Probelauf am Rechner geht es auch ohne: `KUNIBERT_EINWILLIGUNG_PRUEFEN=0` am Server.
- Die Kopplung per Tastendruck (beide Tasten 5 s halten, Kunibert spricht den Code) ist im Client noch nicht umgesetzt (Punkt D1).
- Bei Server-/Audiofehlern bleibt der Client nicht in einer Endlosschleife, sondern wechselt kurz nach `ERROR` zurück nach `READY`.
- Ohne echte STT-Integration liefert `/v1/device/question` bei einer Aufnahme derzeit die sichere Fallback-Antwort des Backends.
