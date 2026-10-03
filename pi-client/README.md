# Ritter Kunibert – Raspberry-Pi-Audioclient

Der Pi ist das Gerät/der **Client**: Er nimmt Sprache auf, sendet sie an den Schweizer Quantencomputer-Server und spielt die Antwort ab. Sprachmodelle und Anbieter-Schlüssel bleiben serverseitig. Der vorbereitete Client unterstützt WAV-Testdateien sowie einen GPIO-Taster-Prototyp für Aufnahme und Geschichten. **Noch kein fertiges Kinderprodukt**: nur begleitet am Tisch testen; Serverbetrieb, Kinderschutz, Eltern-Einwilligung und Offline-Verhalten müssen vor realer Nutzung geprüft werden.

## Hardware und erster Aufbau

Einkaufsliste, Amazon-Empfehlung, Tasterbelegung und Schritt-für-Schritt-Anleitung: [`PROTOTYP.md`](PROTOTYP.md).

- Raspberry Pi 5 (4 GB reichen für den Client; 8 GB sind ebenfalls geeignet), passendes 5-V-/5-A-Netzteil und Kühlung.
- USB-Mikrofon; der Pi 5 hat keinen eingebauten 3,5-mm-Audioausgang. Für einen Aktivlautsprecher HDMI-Audio oder einen USB-Audioadapter verwenden.
- Zwei Schließer-Taster: GPIO17 (BCM, physischer Pin 11) als Sprechtaste und GPIO27 (BCM, Pin 13) als Erzähltaste; Taster jeweils nur zwischen GPIO und GND. Niemals 5 V an GPIO.

## Installation auf Raspberry Pi OS

```bash
sudo apt update
sudo apt install -y alsa-utils python3-gpiozero
```

Den Ordner `pi-client/` auf den Pi übertragen. Der Code nutzt Python-Standardbibliotheken und `gpiozero` aus Raspberry Pi OS; kein Pi-seitiger KI-Schlüssel und kein OpenAI-Paket.

### Hardware-Tastermodus

Server-URL und Gerätezugang zuerst in einer nur für den Benutzer lesbaren Konfigurationsdatei hinterlegen (siehe `PROTOTYP.md`), danach aus `pi-client/`:

```bash
set -a
. ~/.config/kunibert/device.env
set +a
python3 -m kunibert_pi.buttons
```

GPIO17: gedrückt halten und sprechen; beim Loslassen wird die Aufnahme gesendet. GPIO27: einmal drücken, um eine Folge zu starten oder fortzusetzen. GPIO-Pins sind standardmäßig BCM 17/27; mit `--question-pin` und `--story-pin` änderbar. Aufnahme ist auf 30 Sekunden begrenzt. Audio und Geschichtenstand werden flüchtig unter `/dev/shm` verarbeitet.

### WAV-Datei manuell senden

```bash
python3 -m kunibert_pi --wav frage.wav --mode frage
python3 -m kunibert_pi --mode geschichte --state-file /dev/shm/kunibert.json
python3 -m kunibert_pi --mode weiter --state-file /dev/shm/kunibert.json
```

Frage-WAV: 16 kHz, mono, 16-bit PCM, höchstens 30 Sekunden/2 MiB. Beispielaufnahme mit angeschlossenem USB-Mikrofon:

```bash
arecord -f S16_LE -r 16000 -c 1 -d 5 frage.wav
```

Bei mehreren ALSA-Geräten `arecord -l` bzw. `aplay -l` prüfen und bei Bedarf `KUNIBERT_MIC_DEVICE` bzw. `KUNIBERT_AUDIO_DEVICE` setzen.

## API und Privatsphäre

- `POST /v1/turn`: Multipart mit `mode`, `story_state` und bei Fragen `audio`; Authentifizierung per `Authorization: Bearer …` plus `X-Device-Id`.
- `GET /v1/turn/{turn_id}/audio`: begrenzte, kurzlebige WAV-Antwort. Der Client folgt keinen Redirects und sendet Auth-Daten nur an die konfigurierte Origin.
- Außer localhost muss die API-Adresse `https://` verwenden. `api.picast.com` ist in der Konfiguration vorgesehen, aber kein live bestätigter Dienst; vor End-to-End-Nutzung muss der Schweizer Server bereitstehen.
- Geräteschlüssel nie in Git, Chatnachrichten oder Screenshots speichern. Bei Verlust auf dem Server widerrufen und neu ausstellen.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

Die Tests benötigen weder Raspberry-Pi-Hardware noch Netzwerk noch echte KI-Modelle. Sie prüfen WAV-Validierung, API-Protokoll, Geschichtenstand und die neue Taster-Modus-/Aufnahmebefehlslogik.
