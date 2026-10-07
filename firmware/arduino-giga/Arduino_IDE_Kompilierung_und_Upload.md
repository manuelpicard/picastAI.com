# Arduino IDE – Kompilieren und Upload der Ritter-Kunibert-GIGA-Firmware

**Firmware:** `RitterKunibertAudio.ino` Version 0.3  
**Board:** Arduino GIGA R1 WiFi  
**Zweck:** Erwachsenen-Tischprototyp, noch kein fertiges Kinderprodukt.

## 1. Benötigte Hardware

- Arduino GIGA R1 WiFi
- USB-C-Datenkabel, kein reines Ladekabel
- Computer mit Windows, macOS oder Linux
- optional: Carrier-Platine und J1-Kabel
- für Audio: aktiver Kopfhörer oder aktiver Lautsprecher
- für den ersten Upload möglichst noch kein externes Mikrofon und keinen Lautsprecher anschließen

**Wichtig:** Der GIGA-DAC darf keinen passiven Lautsprecher direkt treiben.

## 2. Arduino IDE installieren

1. Die aktuelle [Arduino IDE 2](https://www.arduino.cc/en/software/) herunterladen.
2. Installieren und starten.
3. Die IDE darf während der Boardpaket- und Bibliotheksinstallation Internetzugriff benötigen.

## 3. Firmware öffnen

1. Die Datei [RitterKunibertAudio.ino](</home/ubuntu/picast/arduino_firmware/RitterKunibertAudio.ino>) herunterladen.
2. Einen Sketch-Ordner mit genau diesem Namen anlegen:

```text
RitterKunibertAudio/
└── RitterKunibertAudio.ino
```

3. Die `.ino`-Datei in Arduino IDE öffnen.
4. Falls die IDE nach dem Speichern eines Sketch-Ordners fragt, den vorgeschlagenen Ordner akzeptieren.

## 4. GIGA-Boardpaket installieren

1. Arduino GIGA mit einem USB-C-Datenkabel anschließen.
2. In Arduino IDE links das **Boards Manager**-Symbol öffnen.
3. Nach **Arduino Mbed OS GIGA Boards** suchen.
4. Das Paket installieren oder auf die aktuelle stabile Version aktualisieren.
5. In der Boardauswahl auswählen:

```text
Arduino Mbed OS GIGA Boards → Arduino GIGA R1 WiFi
```

Offizielle Referenz: [Getting Started with GIGA R1 WiFi](https://docs.arduino.cc/tutorials/giga-r1-wifi/giga-getting-started/).

## 5. Bibliotheken installieren

Im Menü **Sketch → Include Library → Manage Libraries…** suchen und installieren:

- **Arduino_AdvancedAnalog**

`WiFi.h` und `PDM.h` werden vom GIGA-Boardpaket bereitgestellt. Falls die IDE beim Kompilieren meldet, dass eine dieser Dateien fehlt, ist normalerweise das falsche Board ausgewählt oder das Boardpaket nicht korrekt installiert.

## 6. Konfiguration eintragen

Im oberen Bereich des Sketches stehen die lokalen Konfigurationswerte:

```cpp
#define PICAST_USE_TLS 1
const char WIFI_SSID[] = "DEIN_WLAN";
const char WIFI_PASSWORD[] = "DEIN_WLAN_PASSWORT";
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "DEVICE_TOKEN_NICHT_COMMITTEN";
```

Für den lokalen Mock-Server zunächst verwenden:

```cpp
#define PICAST_USE_TLS 0
const char PICAST_HOST[] = "192.168.1.100";
const uint16_t PICAST_PORT = 8787;
```

`192.168.1.100` durch die tatsächliche IP-Adresse des Rechners ersetzen, auf dem der Mock-Server läuft. **Nicht `127.0.0.1` verwenden.**

Für picastAI.com müssen Host, Port, API-Pfade und ein gültiger Geräte-Token vom Serverbetrieb bereitgestellt werden. Den Token nicht in Git, Screenshots oder öffentlichen Logs speichern.

## 7. Board und Port auswählen

1. In Arduino IDE oben auf **Select Board** klicken.
2. **Arduino GIGA R1 WiFi** auswählen.
3. Den seriellen Port auswählen, der beim Anschließen des Boards neu erscheint.
4. Falls mehrere Ports angezeigt werden, das USB-Kabel abziehen, die Liste beobachten, wieder anschließen und den neuen Port auswählen.

Der Port kann je nach Betriebssystem beispielsweise so aussehen:

- Windows: `COMx`
- Linux: `/dev/ttyACM0` oder `/dev/ttyUSB0`
- macOS: `/dev/cu.usbmodem...`

## 8. Kompilieren

1. Zuerst nur auf das Häkchen **Verify** klicken.
2. Warten, bis unten **Done compiling** erscheint.
3. Häufige Meldungen:

### `Arduino_AdvancedAnalog.h: No such file or directory`

Die Bibliothek `Arduino_AdvancedAnalog` ist nicht installiert oder die IDE verwendet eine andere Bibliotheksinstallation.

### `WiFi.h: No such file or directory` oder `PDM.h: No such file or directory`

Das GIGA-Boardpaket ist nicht installiert oder ein falsches Board ist ausgewählt.

### `WiFiSSLClient` unbekannt

Boardpaket aktualisieren und prüfen, ob tatsächlich **Arduino GIGA R1 WiFi** ausgewählt ist. Falls die Boardpaket-Version eine abweichende TLS-API verwendet, muss die WiFi-Library-Version an diese API angepasst werden.

### Speicher zu klein

Die Firmware hält maximal 15 Sekunden Mono-Audio im RAM. Falls eine ältere Boardpaket-Version oder eine andere Library ungewöhnlich viel Speicher belegt, zunächst alle nicht benötigten Bibliotheken entfernen und die aktuelle GIGA-Boarddefinition verwenden.

## 9. Upload

1. GIGA über USB-C angeschlossen lassen.
2. In Arduino IDE auf den Pfeil **Upload** klicken.
3. Die IDE kompiliert erneut und überträgt die Firmware.
4. Während des Uploads keine Taster drücken und das Kabel nicht abziehen.
5. Nach erfolgreichem Upload erscheint **Done uploading**.

Wenn der Upload fehlschlägt:

1. anderes USB-C-Datenkabel testen,
2. richtigen Port auswählen,
3. USB-Hub umgehen und direkt anschließen,
4. Board resetten und Upload erneut starten,
5. falls nötig den GIGA-Bootloader-/Recovery-Ablauf der offiziellen Arduino-Dokumentation verwenden.

## 10. Serielle Diagnose öffnen

1. **Tools → Serial Monitor** öffnen.
2. Baudrate auf **115200** stellen.
3. Reset-Taste am GIGA einmal drücken.
4. Erwartete Startmeldungen ähneln:

```text
Ritter Kunibert GIGA-Firmware 0.3
Erwachsenen-Prototyp; kein unbeaufsichtigter Kinderbetrieb.
API-Modus: TLS/HTTPS
API-Host: picastAI.com
D2=Sprechen, D3=Geschichte, D5=Mic OFF
```

Bei Mock-Betrieb muss stattdessen `API-Modus: HTTP/LAN-Mock` erscheinen.

## 11. Erster Funktionstest ohne Netzwerk

1. Board ohne Carrier-Peripherie booten.
2. Prüfen, dass die Startmeldung erscheint.
3. SW3/MIC OFF zunächst auf OFF stellen.
4. SW1 drücken: Es darf **keine** Aufnahme starten.
5. SW3 auf ON stellen.
6. SW1 drücken: Die Aufnahme-LED muss leuchten; im Monitor erscheint `Aufnahme gestartet.`
7. SW1 loslassen: LED geht aus; die Firmware versucht anschließend die API zu erreichen.

## 12. Test mit lokalem Mock-Server

Auf dem Mock-Server-Rechner:

```bash
cd /home/ubuntu/picast/mock_server
python3 picast_mock_server.py --host 0.0.0.0 --port 8787
```

Dann im Sketch:

```cpp
#define PICAST_USE_TLS 0
const char PICAST_HOST[] = "IP_DES_MOCK_RECHNERS";
const uint16_t PICAST_PORT = 8787;
```

Firewall und WLAN müssen TCP-Port 8787 aus dem GIGA-Netz zulassen. Der Mock-Server muss die in der Firmware verwendeten Endpunkte und eine `audio_url` liefern.

## 13. Test mit picastAI.com

Erst starten, wenn der lokale Mock-Test funktioniert:

```cpp
#define PICAST_USE_TLS 1
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "ECHTER_TESTTOKEN";
```

Der API-Dienst muss liefern:

- `POST /v1/device/question`
- `POST /v1/device/kunibert-story`
- Audio-GET auf der zurückgegebenen `audio_url`
- WAV: PCM, mono, 16 Bit, idealerweise 16 kHz
- HTTP-Authentifizierung über Bearer-Token

Die Firmware akzeptiert Audio-URLs nur, wenn sie relativ sind oder auf den konfigurierten Host zeigen.

## 14. Carrier- und Gehäusetest

Erst nach erfolgreichem Firmware- und Mock-Test:

1. J1 ohne Strom nach Pin-Tabelle anschließen.
2. Mit Ohmmeter prüfen: J1-1→D2, J1-2→D3, J1-3→D4, J1-4→D5.
3. GND, 3V3 und 5V auf Kurzschluss prüfen.
4. SW1 und SW2 jeweils gegen GND prüfen.
5. SW3 im OFF-Zustand auf D5→GND prüfen.
6. LED-Polarität und R1 prüfen.
7. Aktiven Lautsprecher erst zuletzt an J2 anschließen.
8. Mikrofon erst anschließen, wenn die Hardware-Abschaltung geprüft wurde.

## 15. Bekannte Grenzen der Firmware 0.3

- Ein echter GIGA-Kompilierungs- und Hardwaretest steht noch aus.
- TLS-Zertifikats-/CA-Konfiguration muss mit der installierten GIGA-WiFi-Library geprüft werden; der Produktionsbetrieb darf nicht auf einer ungeprüften Zertifikatsumgehung beruhen.
- Das Mikrofon-Aus-Signal D5 allein trennt die Mikrofonversorgung nicht. Dafür ist der externe DPST-/DPDT-Schalter aus dem Gehäuseplan erforderlich.
- Der WAV-Parser akzeptiert nur einfache Standard-Header ohne zusätzliche `LIST`-, `JUNK`- oder andere Chunks.
- Die Firmware ist für einen Erwachsenen-Prototyp und nicht für unbeaufsichtigte Kindernutzung freigegeben.

## Offizielle Referenzen

- [GIGA R1 WiFi – Getting Started](https://docs.arduino.cc/tutorials/giga-r1-wifi/giga-getting-started/)
- [GIGA R1 WiFi – Audio/DAC-Anleitung](https://docs.arduino.cc/tutorials/giga-r1-wifi/giga-audio)
- [Arduino IDE 2 – Boardpaket installieren](https://docs.arduino.cc/software/ide-v2/tutorials/ide-v2-board-manager)
- [Board und Port auswählen](https://support.arduino.cc/hc/en-us/articles/4406856349970-Select-board-and-port-in-Arduino-IDE)
- [Sketch hochladen](https://support.arduino.cc/hc/en-us/articles/4733418441116-Upload-a-sketch-in-Arduino-IDE)
- [Bibliotheken installieren](https://support.arduino.cc/hc/en-us/articles/5145457742236-Install-libraries-in-the-Arduino-IDE)
