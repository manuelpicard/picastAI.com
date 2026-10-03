# Ritter Kunibert – Raspberry-Pi-Audioclient (erster Durchstich)

**Umfang:** eine vorhandene Aufnahme an eine eigene API senden, WAV-Antwort herunterladen und über den Lautsprecher abspielen; den Geschichtenstand zwischen zwei Tastendrücken flüchtig merken. Zusätzlich enthält der Client jetzt den hardware-neutral getesteten GPIO-Zustandsautomaten und die begrenzte `arecord`-Aufnahme. Der passende Server liegt im Nachbarordner `../server`. **Noch nicht enthalten:** fachliche Kinderfreigabe und Produktionstauglichkeit. Der Client ist ein Testbaustein, **kein fertiges Kinderprodukt**. Es wurden keine Stimmen imitiert.

## Voraussetzung

- Raspberry Pi OS Lite, Python 3.11+ und USB-Lautsprecher; für die Wiedergabe `sudo apt update && sudo apt install -y alsa-utils`.
- Für die GPIO-Version zusätzlich `sudo apt install -y python3-gpiozero`.
- Ein von dir kontrollierter Server mit dem unten beschriebenen API-Vertrag, zum Beispiel `../server` (siehe dort). Die Domain `picast.com` stellt momentan keinen solchen Dienst bereit. Für lokale Tests ist `http://127.0.0.1:8000` zulässig, über das Netzwerk **nur HTTPS**.
- Eine Aufnahme als WAV: 16 kHz, 16-bit PCM, mono, höchstens 30 Sekunden/2 MiB. Zum Testen mit einem bereits angeschlossenen USB-Mikrofon: `arecord -f S16_LE -r 16000 -c 1 -d 5 frage.wav` (je nach Gerät `-D plughw:X,Y` ergänzen).

## Start

Aus dem Projektverzeichnis:

```bash
export KUNIBERT_API_BASE='http://127.0.0.1:8000'  # später: eigene HTTPS-Adresse
export KUNIBERT_DEVICE_ID='prototype-1'
export KUNIBERT_DEVICE_TOKEN='ein-eigens-vergebener-test-token'  # niemals ins Git committen
python3 -m kunibert_pi --wav frage.wav --mode frage
python3 -m kunibert_pi --wav wunsch.wav --mode geschichte --state-file /dev/shm/kunibert.json  # mit Wunsch
python3 -m kunibert_pi --mode geschichte --state-file /dev/shm/kunibert.json                 # ohne Wunsch
python3 -m kunibert_pi --mode weiter     --state-file /dev/shm/kunibert.json                 # nächster Teil
python3 -m unittest discover -s tests -v
```

`--state-file` hält den kleinen Geschichtenstand (Teil, Kurzfassung, offene Fäden) zwischen zwei Aufrufen fest. Er wird erst nach erfolgreichem Audioabruf geschrieben, damit kein Teil übersprungen wird. Datei-Rechte `0600`. Empfohlen ist `/dev/shm`: liegt im Arbeitsspeicher und ist nach einem Neustart weg. Für `--mode frage` ist `--wav` Pflicht, für `geschichte` und `weiter` optional.

## GPIO-Version (Durchstich 3)

Die Pins sind standardmäßig BCM **GPIO5 = Sprechtaste**, **GPIO6 = Erzähltaste**, **GPIO17 = Status-LED** und **GPIO22 = Mikrofon-Aus-Schalter**. Taster und Schalter werden jeweils zwischen GPIO und GND angeschlossen; die Software verwendet die internen Pull-ups. Die LED bekommt einen passenden Vorwiderstand. Für das erste Brett bitte nur unter Aufsicht verdrahten und prüfen, dass der Mikrofon-Aus-Schalter die Mikrofonversorgung bzw. den Mikrofonpfad wirklich trennt.

Die LED-Zustände sind: **aus = bereit**, schnelles Blinken = Aufnahme, langsames Blinken = Verarbeitung/Netzwerk, dauerhaft an = Wiedergabe, sehr schnelles Blinken = Fehler. Bei Mikrofon-Aus bleibt sie aus; neue Tastendrücke werden verworfen. Sobald der Schalter wieder freigibt, kehrt das Gerät automatisch zu **bereit** zurück. Der Zustand ist bewusst eindeutig und nicht als geheimes Zuhörsignal interpretierbar.

`kunibert_pi/gpio.py` enthält die Hardware-Abstraktion und `build_real_gpio(...)` für gpiozero. `kunibert_pi/recorder.py` nimmt maximal 20 Sekunden, 16 kHz, mono, 16-bit PCM über `arecord` auf und legt die Datei nur unter `/dev/shm` an. `kunibert_pi/device.py` verbindet Tasten, Aufnahme, API und Wiedergabe; im Fehlerfall kann eine vorab gespeicherte Offline-Ansage abgespielt werden.

Die reale Event-Schleife sollte der Pi-Anwendung noch als nächster Integrationsschritt hinzugefügt werden; die Kernkomponenten sind ohne Hardware getestet. Die GPIO- und Audio-Tests laufen mit Mocks und starten keine echte Aufnahme.

### Start auf dem Pi

Nach der Verdrahtung und dem Setzen der drei Umgebungsvariablen:

```bash
python3 -m kunibert_pi.gpio_main --audio-input plughw:1,0 --audio-output plughw:2,0
```

`gpio_main` hält den Prozess offen, bindet die vier Standardpins und beendet sich sauber bei `Ctrl-C` oder SIGTERM. Für eine systemd-Unit sollte der Dienst unter einem eigenen Benutzer laufen, keine Geheimnisse ins Unit-File schreiben und bei Fehlern neu starten. Die reale Aufnahme läuft derzeit bis zur konfigurierten Obergrenze (Standard 20 Sekunden); eine Aufnahme-Stopp-Taste bzw. Push-to-talk-Loslassen ist ein anschließendes Komfort-Upgrade.

## ALSA und `plughw` prüfen

Auf dem echten Pi zuerst beide USB-Geräte einstecken und ausführen:

```bash
python3 -m kunibert_pi.audio_diag
```

Das Programm listet `aplay -l`, `arecord -l` und die ausführlichen ALSA-Namen. Danach die angezeigten Gerätenamen testen, zum Beispiel:

```bash
python3 -m kunibert_pi.audio_diag \
  --input 'plughw:CARD=Device,DEV=0' \
  --output 'plughw:CARD=Speaker,DEV=0' \
  --record-test --play-test
```

`plughw` ist für den Prototyp die robuste Wahl, weil ALSA Format-/Sampleraten-Konvertierung übernehmen kann; `hw` ist strenger und nützlich, wenn man die Hardwarefähigkeiten exakt testen will. Bevorzugt werden stabile `CARD=...`-Namen statt `plughw:1,0`, weil sich USB-Kartenindizes nach Neustarts ändern können. Wenn der Lautsprecher als Ausgabe- und das Mikrofon als Aufnahmegerät getrennt erscheinen, ist das in Ordnung: `--audio-input` und `--audio-output` dürfen verschiedene ALSA-Geräte sein.

Die Diagnose erzeugt nur einen kurzen Testton und legt Aufnahmen unter `/dev/shm` an, wenn dieses Verzeichnis vorhanden ist. Sie sendet nichts an den Kunibert-Server. Bei Problemen bitte die komplette Ausgabe von `audio_diag` sichern, aber keine Aufnahmen oder Tokens teilen.

**Keine produktiven Schlüssel in der Shell-Historie, im Quellcode oder auf einem öffentlich erreichbaren Gerät speichern.** Für einen realen Prototypen ein nur für dieses Gerät gültiges, widerrufbares Token in einer root-lesbaren Konfiguration hinterlegen. Alle externen KI-Anbieter-Schlüssel bleiben serverseitig. Der hier gezeigte `export` ist nur ein lokales Testbeispiel.

Das Programm lädt das Audio in ein privates temporäres Verzeichnis, ruft `aplay` auf und löscht die Datei danach. Es sendet die Eingabe bewusst **nicht automatisch nochmals**, falls die Anfrage scheitert; die Antwort könnte serverseitig bereits erzeugt worden sein. Ton während der Ausgabe zu unterbrechen ist mit `Ctrl-C` möglich. Nach einem Fehler wird ein nicht-null Exit-Code zurückgegeben; der spätere Geräteprozess muss dann eine lokale Offline-Ansage ausgeben.

## API-Vertrag (umgesetzt in `../server`)

`POST /v1/turn`: `multipart/form-data` mit den Feldern `mode` (`frage`, `geschichte`, `weiter`), `story_state` (kleines JSON-Objekt), `audio` (WAV; bei `geschichte`/`weiter` optional). Header `Authorization: Bearer <Gerätetoken>` und `X-Device-Id`. Antwort `application/json`, beispielsweise:

```json
{"turn_id":"turn_a1b2","kind":"geschichte","story_state":{"chapter":1}}
```

`GET /v1/turn/turn_a1b2/audio`: dieselben Auth-Header; Antwort `Content-Type: audio/wav`, RIFF/WAVE PCM bis 8 MiB und 180 Sekunden. Nur das eigene Gerät darf sie abrufen; zeitlich befristet, danach löschen. **Keine Redirects**, keine fremden Download-URLs und keine privaten Kinderinformationen in Fehlern oder Logs. Der Client überprüft Origin, Status, MIME, Kennung, Größe und WAV-Format.

**Wichtige offene Punkte:** Für echte Nutzung müssen Authentifizierung und Token-Erneuerung, Audio-Aufbewahrungsfrist des Servers, Eltern-Einwilligung, kindgerechte Antwortprüfung, Ausfallansagen und sichere Updates umgesetzt und getestet werden. Ein gemanagter Server kann später unter einer kontrollierten Domain betrieben werden; ein Domainname allein ist kein KI-Dienst.
