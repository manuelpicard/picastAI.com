# Firmware für das Endgerät (ESP32-S3)

Das Seriengerät soll ein ESP32-S3 werden; der erste Aufbau läuft auf dem Raspberry Pi 5 (`pi-client/`). Diese Firmware entsteht in Stufen (M1 bis M6). Sie spricht dieselbe Schnittstelle wie der Pi-Client: [`docs/picastAI-Pi-API.md`](../../docs/picastAI-Pi-API.md).

> **Stand (11.11.2026): Entwurf der Stufen M1 bis M5. Auf keinem Gerät gelaufen.** Die CI baut die Firmware mit ESP-IDF v5.5 (`.github/workflows/firmware.yml`); das zeigt nur, dass der Code übersetzt. Ob Ton, Tasten und Zeiten am Gerät stimmen, ist offen. Die Logik ohne Hardware (Zustände, WAV-Kopf, Ursprung, Wiederholung) ist auf dem Rechner getestet. Ein Entwicklungsboard ist noch nicht gewählt.

## Stufen

| Stufe | Inhalt | Stand |
| --- | --- | --- |
| M1 | WLAN verbinden, Server über HTTPS erreichen (`GET /health`), Zertifikat prüfen | Entwurf, baut in der CI |
| M2 | Aufnahme vom Mikrofon, `POST /v1/device/question` | Entwurf, baut in der CI |
| M3 | Antwort abrufen und beim Laden abspielen | Entwurf, baut in der CI |
| M4 | Tasten, LED, Zustandsautomat wie im Pi-Client | Entwurf, baut in der CI |
| M5 | Fehler, Wiederholung, Zeitgrenzen | Entwurf, baut in der CI |
| M6 | WLAN-Einrichtung ohne Rechner, Updates mit Rückfall, Schutz des Tokens | begonnen: Einstellungen im Gerät und serielle Konsole (Entwurf); offen: Einrichtung ohne Kabel, Updates, Verschlüsselung |

**Aufbau, für den der Entwurf geschrieben ist (allgemein, Variante B):** ESP32-S3-Modul mit PSRAM, I2S-Mikrofon (z. B. INMP441), I2S-Verstärker (z. B. MAX98357A) mit Lautsprecher, zwei Taster gegen Masse, eine LED, optional ein Schalter für „Mikrofon aus“. Alle Pins stehen in `idf.py menuconfig` (Menü „Ritter Kunibert“ → „Anschlüsse“); die Vorgaben sind Platzhalter. Für das ESP32-S3-BOX-3 (Codec-Chips ES7210/ES8311) braucht `main/kb_audio.c` und `main/kb_board.c` eine eigene Fassung.

## Bauen und aufspielen

Voraussetzung: [ESP-IDF](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/index.html) 5.x ist installiert und die Umgebung geladen.

```bash
cd firmware/esp32-s3
idf.py set-target esp32s3
idf.py menuconfig        # Menü "Ritter Kunibert": WLAN, Adresse des Servers, Geräte-ID, Token, Pins
idf.py build
idf.py -p <Port> flash monitor
```

### Einrichten ohne neuen Build (serielle Konsole, Teil von M6)

WLAN, Adresse des Servers, Geräte-ID und Token lassen sich über das USB-Kabel setzen. Sie liegen dann im Speicher des Geräts (NVS) und haben Vorrang vor `sdkconfig`. In `idf.py monitor`:

```text
kunibert> zeige
kunibert> setze wlan "Mein WLAN"
kunibert> setze wlan-passwort "..."
kunibert> setze server https://kunibert.example
kunibert> setze geraet esp-001
kunibert> setze token <Gerätetoken vom Server>
kunibert> neustart
```

- Neue Werte gelten nach `neustart`. `setze <name>` ohne Wert löscht einen Eintrag, `loesche` löscht alle.
- `zeige` gibt Passwort und Token nie aus, nur „gesetzt“. Die Konsole merkt sich keine Befehle.
- **Grenzen:** Der Speicher ist noch **nicht verschlüsselt**. Wer das Gerät öffnet und den Flash ausliest, bekommt WLAN-Passwort und Token. Das behebt erst die Flash-Verschlüsselung (späterer Teil von M6). Das Token steht beim Eintippen im Fenster deines Rechners: Fenster danach schließen, nichts davon in Chats kopieren.
- Auf keinem Gerät gelaufen. Die Regeln für die Werte sind auf dem Rechner getestet (`test/test_logic.c`).

- WLAN-Daten, Adresse, Geräte-ID und Token können für die Entwicklung auch in der Datei `sdkconfig` stehen (Menü „Ritter Kunibert“). Sie landen dann in der Datei `sdkconfig`. Sie steht in `.gitignore` und gehört **nicht** ins Repo.
- **Token:** Für die Entwicklung steht das Gerätetoken in `sdkconfig` und damit unverschlüsselt im Flash. Nur ein Test-Token verwenden. Stufe M6 legt es verschlüsselt ab.
- Die Adresse muss mit `https://` beginnen und ohne Schrägstrich enden, gleiche Schreibweise wie `PICASTAI_PUBLIC_BASE_URL` auf dem Server. `http://` lehnt die Firmware ab.

**Was die Firmware tut (wie der Pi-Client):**
- Start: WLAN, dann `/health`. Erst danach leuchtet die LED dauerhaft (bereit).
- Sprechtaste halten: Aufnahme (LED blinkt schnell), höchstens 15 s. Kürzer als 0,35 s: nichts senden.
- Schalter „Mikrofon aus“: Das Mikrofon wird nicht gelesen. Wird er während der Aufnahme umgelegt, wird die Aufnahme verworfen und nichts gesendet.
- Erzähltaste: nächster Teil der Geschichte.
- Antwort: Die `audio_url` muss zum eigenen Server gehören, sonst wird sie abgelehnt. Der Ton wird beim Laden abgespielt und nicht gespeichert. Erst wird der WAV-Kopf geprüft.
- Fehler: LED blinkt sehr schnell, nach 1 s zurück in den Ruhezustand. Höchstens ein Wiederholungsversuch, keiner nach 140 s, keiner bei 4xx.
- Im Log stehen nur Zustände und Statuscodes, keine Texte und keine Tokens.

**Abnahme am Gerät (offen):** die Punkte aus `deploy/CHECKLISTE.md`, die das Gerät betreffen, dazu: Lautstärke und Rauschen der Aufnahme (`KB_MIC_SHIFT`), Aussetzer beim Abspielen, Verhalten bei WLAN-Abbruch.

## Schon vorbereitet für M2 bis M5 (ohne Gerät testbar)

Diese Teile brauchen kein ESP-IDF und sind auf dem Rechner getestet. Die Firmware benutzt sie ab M2:

| Datei | Inhalt | Vorbild im Pi-Client |
| --- | --- | --- |
| `main/kb_state.c` | Zustände, erlaubte Wechsel, LED-Muster, Regel „Aufnahme senden?“ (mindestens 0,35 s, nie nach Mikrofon-Aus) | `ClientState`, `KunibertClient.transition`, `GpioStatusLed._PATTERNS` |
| `main/kb_wav.c` | WAV-Kopf schreiben (Aufnahme) und prüfen (Antwort: mono, 16 Bit, 16 kHz, nicht leer) | `encode_wav`, Prüfung der Antwort |
| `main/kb_url.c` | Server-Adresse prüfen; `audio_url` muss denselben Ursprung haben; Wiederholungsregeln | `same_origin`, `PicastApi._with_retries` |

Abweichung vom Pi-Client (vorläufig): höchstens **ein** Wiederholungsversuch statt zwei, und keiner nach 140 s.

## Test auf dem Rechner

```bash
cc -std=c11 -Wall -Wextra -Werror -pedantic -fsanitize=address,undefined -I main -o /tmp/kb_logic \
  test/test_logic.c main/kb_state.c main/kb_wav.c main/kb_url.c && /tmp/kb_logic
```


```bash
cc -Wall -Wextra -Werror -I main -o /tmp/kb_test test/test_base_url.c main/kb_url.c && /tmp/kb_test
```
