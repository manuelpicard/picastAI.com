# Ritter Kunibert – Raspberry-Pi-Audioclient (erster Durchstich)

**Umfang:** eine vorhandene Aufnahme an eine eigene API senden, WAV-Antwort herunterladen und über den Lautsprecher abspielen; den Geschichtenstand zwischen zwei Tastendrücken flüchtig merken. Der passende Server liegt im Nachbarordner `../server`. **Noch nicht enthalten:** Mikrofonaufnahme per Taste, GPIO-Tasten, Kindersicherheitsfreigabe. Der Client ist ein Testbaustein, **kein fertiges Kinderprodukt**. Es wurden keine Stimmen imitiert.

## Voraussetzung

- Raspberry Pi OS Lite, Python 3.11+ und USB-Lautsprecher; für die Wiedergabe `sudo apt update && sudo apt install -y alsa-utils`.
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

**Keine produktiven Schlüssel in der Shell-Historie, im Quellcode oder auf einem öffentlich erreichbaren Gerät speichern.** Für einen realen Prototypen ein nur für dieses Gerät gültiges, widerrufbares Token in einer root-lesbaren Konfiguration hinterlegen. Alle externen KI-Anbieter-Schlüssel bleiben serverseitig. Der hier gezeigte `export` ist nur ein lokales Testbeispiel.

Das Programm lädt das Audio in ein privates temporäres Verzeichnis, ruft `aplay` auf und löscht die Datei danach. Es sendet die Eingabe bewusst **nicht automatisch nochmals**, falls die Anfrage scheitert; die Antwort könnte serverseitig bereits erzeugt worden sein. Ton während der Ausgabe zu unterbrechen ist mit `Ctrl-C` möglich. Nach einem Fehler wird ein nicht-null Exit-Code zurückgegeben; der spätere Geräteprozess muss dann eine lokale Offline-Ansage ausgeben.

## API-Vertrag (umgesetzt in `../server`)

`POST /v1/turn`: `multipart/form-data` mit den Feldern `mode` (`frage`, `geschichte`, `weiter`), `story_state` (kleines JSON-Objekt), `audio` (WAV; bei `geschichte`/`weiter` optional). Header `Authorization: Bearer <Gerätetoken>` und `X-Device-Id`. Antwort `application/json`, beispielsweise:

```json
{"turn_id":"turn_a1b2","kind":"geschichte","story_state":{"chapter":1}}
```

`GET /v1/turn/turn_a1b2/audio`: dieselben Auth-Header; Antwort `Content-Type: audio/wav`, RIFF/WAVE PCM bis 8 MiB und 180 Sekunden. Nur das eigene Gerät darf sie abrufen; zeitlich befristet, danach löschen. **Keine Redirects**, keine fremden Download-URLs und keine privaten Kinderinformationen in Fehlern oder Logs. Der Client überprüft Origin, Status, MIME, Kennung, Größe und WAV-Format.

**Wichtige offene Punkte:** Für echte Nutzung müssen Authentifizierung und Token-Erneuerung, Audio-Aufbewahrungsfrist des Servers, Eltern-Einwilligung, kindgerechte Antwortprüfung, Ausfallansagen und sichere Updates umgesetzt und getestet werden. Ein gemanagter Server kann später unter einer kontrollierten Domain betrieben werden; ein Domainname allein ist kein KI-Dienst.
