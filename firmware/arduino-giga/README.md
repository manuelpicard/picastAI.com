# Ritter-Kunibert-GIGA-Firmware 0.3

Datei: `RitterKunibertAudio.ino`  
Zielboard: **Arduino GIGA R1 WiFi**  
Status: vollständige Erwachsenen-Prototyp-Firmware für Taster, Aufnahme, WLAN/API und DAC-WAV-Wiedergabe.

## Funktionen

- **D2 / SW1:** Sprechtaste; gedrückt halten nimmt auf.
- **D3 / SW2:** kurze Kunibert-Geschichte anfordern.
- **D4 / D1:** Aufnahme-LED.
- **D5 / SW3:** Mikrofon-Aus-Sense; LOW blockiert neue Aufnahmen.
- PDM-Aufnahme mit 16 kHz, mono, 16 Bit.
- harte Begrenzung auf 15 Sekunden.
- Multipart-Upload an `POST /v1/device/question`.
- JSON-Anfrage an `POST /v1/device/kunibert-story`.
- Bearer-Token und Geräte-ID in den API-Headern.
- JSON-Antwort mit `audio_url` prüfen.
- Audio-URL nur vom konfigurierten Host akzeptieren.
- WAV-Stream laden und über `AdvancedDAC dac0(A12)` wiedergeben.
- Wiedergabe nur mit PCM, mono, 16 Bit und 8–48 kHz.
- keine lokale Daueraufzeichnung.
- keine automatische nächste Geschichte.
- Entprellung und Sperre gegen parallele Tasteraktionen.

## Bibliotheken

Über die Arduino IDE installieren:

1. Boardpaket für Arduino GIGA R1 WiFi
2. `Arduino_AdvancedAnalog`
3. Die GIGA-kompatiblen WiFi- und PDM-Bibliotheken sind Teil des Boardpakets beziehungsweise der Arduino-Umgebung.

## Konfiguration

Am Anfang des Sketches stehen die Prototyp-Platzhalter:

```cpp
#define PICAST_USE_TLS 1
const char WIFI_SSID[] = "DEIN_WLAN";
const char WIFI_PASSWORD[] = "DEIN_WLAN_PASSWORT";
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "DEVICE_TOKEN_NICHT_COMMITTEN";
```

Für einen lokalen Mock-Test:

```cpp
#define PICAST_USE_TLS 0
const char PICAST_HOST[] = "192.168.1.100";
const uint16_t PICAST_PORT = 8787;
```

`127.0.0.1` ist auf dem Arduino falsch, wenn der Mock-Server auf einem anderen Computer läuft. Die IP des Rechners im selben WLAN verwenden.

Für den Produktionsbetrieb darf der Token nicht in ein öffentliches Repository, in Screenshots oder in serielle Logs gelangen. Die aktuelle Firmware verwendet compile-time-Konstanten, weil der Prototyp noch keine sichere Geräteschlüsselablage besitzt. Für eine Produktversion muss der Schlüssel in einem geeigneten sicheren Speicher beziehungsweise Provisioning-Prozess liegen.

## API-Vertrag

### Frage

```http
POST /v1/device/question
Content-Type: multipart/form-data
Authorization: Bearer <device-token>
```

Felder:

- `audio`: `question.wav`, PCM WAV, mono, 16 Bit, 16 kHz
- `locale`: `de-DE`
- `age_band`: `6-10`
- `session_id`: temporäre Sitzungskennung

### Geschichte

```http
POST /v1/device/kunibert-story
Content-Type: application/json
Authorization: Bearer <device-token>
```

```json
{
  "locale": "de-DE",
  "age_band": "6-10",
  "length": "short",
  "session_id": "..."
}
```

Erwartete Antwort:

```json
{
  "type": "kunibert_story",
  "audio_url": "/media/story.wav",
  "text": "optional im Erwachsenen-Testmodus",
  "session_end": true
}
```

`audio_url` darf relativ sein oder absolut auf denselben konfigurierten Host zeigen. Fremde Audio-Hosts werden abgewiesen.

## Audioausgabe

Die Firmware erwartet einen einfachen 44-Byte-PCM-WAV-Header:

- RIFF/WAVE
- `fmt ` direkt an der Standardposition
- `data` direkt an der Standardposition
- PCM (`format = 1`)
- mono
- 16 Bit
- 8–48 kHz

An J2/DAC0 nur einen **aktiven Lautsprecher oder aktive Kopfhörer** anschließen. Ein passiver Lautsprecher kann den GIGA-DAC beziehungsweise das Board beschädigen.

## Mikrofon-Abschaltung

D5 ist in Carrier v0.1 ein Sense-Eingang. SW3 zieht D5 bei „MIC OFF“ nach GND. Für echte Hardware-Stummschaltung muss die Mikrofonversorgung zusätzlich über den im Gehäuseplan vorgesehenen DPST-/DPDT-Schalter unterbrochen werden. Software allein ist keine Datenschutzgarantie.

Während `PLAYING` werden keine Tasteraktionen und keine Aufnahme verarbeitet. Die Firmware startet keine automatische Folgegeschichte.

## Testablauf

1. Firmware lokal konfigurieren.
2. Kompilieren und auf den GIGA laden.
3. Serielle Konsole mit 115200 Baud öffnen.
4. Ohne Mikrofon zunächst booten und die Tasterzustände prüfen.
5. Lokalen Mock-Server mit HTTP testen.
6. Mit aktivem Lautsprecher/Kopfhörer eine kurze WAV-Antwort testen.
7. Danach erst HTTPS mit einem echten Entwicklungsendpunkt von picastAI.com testen.
8. Netzwerk während Anfrage und Wiedergabe trennen; Firmware darf keine erfundene Geschichte abspielen.
9. SW3 aktivieren; eine Aufnahme muss blockiert werden.

## Validierungsstatus

Die Datei wurde strukturell auf ausgeglichene Klammern, zentrale Pins, API-Pfade, Multipart-Upload, WAV-Parser und DAC-Aufruf geprüft. Ein echter Board-Kompilierungs- und Hardwaretest ist noch offen, weil in der Sandbox kein Arduino GIGA und kein `arduino-cli` verfügbar ist. Vor dem Bestellen oder Kinderbetrieb müssen mindestens Kompilierung mit dem aktuellen GIGA-Boardpaket, TLS-Zertifikatsprüfung, Audiopegel und echte Mikrofonabschaltung geprüft werden.
