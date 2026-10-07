# Connectivity-Test für WLAN und picastAI.com

Sketch: `RitterKunibertConnectivityTest.ino`  
Board: Arduino GIGA R1 WiFi  
Serial Monitor: **115200 Baud**

## Zweck

Dieser Sketch testet die Netzwerkstrecke unabhängig von Mikrofon, Tastern und DAC:

1. WLAN-Verbindung und lokale Netzwerkinformationen
2. DNS/TCP/TLS-Verbindung zum konfigurierten Host
3. optionaler `GET /health`-Endpunkt
4. authentifizierter `POST /v1/device/kunibert-story`
5. Vorhandensein einer `audio_url` in der API-Antwort
6. kontinuierliche WLAN-Stabilität mit RSSI, Abbruchzählern und Health-Latenz

Er testet bewusst keine WAV-Aufnahme und keine DAC-Wiedergabe.

## Konfiguration

```cpp
#define PICAST_USE_TLS 1
const char WIFI_SSID[] = "DEIN_WLAN";
const char WIFI_PASSWORD[] = "DEIN_WLAN_PASSWORT";
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "DEVICE_TOKEN_NICHT_COMMITTEN";
```

Für den lokalen Mock-Server:

```cpp
#define PICAST_USE_TLS 0
const char PICAST_HOST[] = "IP_DES_MOCK_RECHNERS";
const uint16_t PICAST_PORT = 8787;
```

`/health` ist optional. Wenn picastAI.com keinen solchen Endpunkt veröffentlicht, kann der Health-Test mit `h` fehlschlagen, während der API-Test mit `a` trotzdem erfolgreich ist.

## Arduino-IDE-Ablauf

1. `RitterKunibertConnectivityTest.ino` in einen gleichnamigen Sketch-Ordner kopieren.
2. Board **Arduino GIGA R1 WiFi** auswählen.
3. GIGA-Boardpaket installieren, falls noch nicht vorhanden.
4. Sketch kompilieren und hochladen.
5. Serial Monitor mit 115200 Baud öffnen.

## Befehle

| Taste | Test |
|---|---|
| `w` | WLAN verbinden und IP, Gateway, DNS und RSSI anzeigen |
| `h` | `GET /health` testen |
| `a` | Story-API testen |
| `t` | WLAN, Health und API nacheinander testen |
| `r` | WLAN trennen und neu verbinden |
| `m` | Langzeitmonitor starten oder stoppen |
| `s` | Monitor-Zusammenfassung anzeigen |
| `p` | Einzelmessung mit Health-Latenz |
| `?` | Hilfe anzeigen |

## Langzeitmonitor

Mit `m` startet beziehungsweise stoppt der Sketch den Monitor. Während er läuft,
wird alle **10 Sekunden**:

- der WLAN-Verbindungsstatus geprüft,
- bei einem Abbruch automatisch eine Wiederverbindung versucht,
- RSSI in dBm aufgezeichnet,
- der konfigurierte Health-Endpunkt abgefragt,
- die Antwortlatenz in Millisekunden ausgegeben.

Beispiel:

```text
MONITOR #12 RSSI=-57dBm Health=OK status=200 latency=184ms
MONITOR: WLAN getrennt; Wiederverbindung...
MONITOR: Wiederverbindung OK.
```

Mit `s` kann die Zwischenbilanz jederzeit angezeigt werden. Beim Stoppen mit
`m` wird sie ebenfalls ausgegeben. Die Bilanz enthält Laufzeit, Anzahl der
Messungen, WLAN-Abbrüche, Wiederverbindungen, erfolgreiche/fehlgeschlagene
Health-Anfragen sowie minimale, maximale und durchschnittliche RSSI-Werte.

Für eine aussagekräftige Prüfung den GIGA mehrere Stunden oder über Nacht
laufen lassen. Dabei den Serial Monitor geöffnet lassen oder die Ausgaben in
eine Datei protokollieren. Ein RSSI-Wert von etwa -30 dBm ist sehr stark; Werte
unter ungefähr -70 dBm können je nach Umgebung instabil werden. Entscheidend
sind aber vor allem Abbrüche, Wiederverbindungen und Health-Fehler.

Der Monitor fragt standardmäßig den Health-Endpunkt ab und ist damit auch ein
Anwendungstest. Wenn `/health` auf picastAI.com nicht existiert, können die
Health-Zähler fehlschlagen, während die reine WLAN-Verbindung trotzdem stabil
ist. In diesem Fall den Test mit `w` oder die RSSI-Ausgaben separat bewerten.

## Erwartetes Ergebnis

```text
WLAN OK
  IP:       192.168.x.x
  Gateway:  192.168.x.1
  DNS:      192.168.x.1
  RSSI:     -55 dBm

TCP/TLS OK
HTTP: HTTP/1.1 200 OK
API TEST: OK
```

Der API-Test gilt nur dann als erfolgreich, wenn:

- WLAN verbunden ist,
- TCP/TLS-Verbindung hergestellt wird,
- der HTTP-Status 2xx ist,
- die Antwort eine `audio_url` enthält.

## Fehlersuche

### WLAN FEHLER

- SSID und Passwort prüfen.
- 2,4-GHz-WLAN und Router-Reichweite testen.
- GIGA neu starten.
- zunächst ohne Carrier-Platine testen.

### TCP/TLS FEHLER

- Hostname und Port prüfen.
- bei Mock-Betrieb `PICAST_USE_TLS` auf `0` setzen.
- IP-Adresse des Mock-Rechners statt `127.0.0.1` eintragen.
- Firewall für TCP 8787 prüfen.

### HTTP 401/403

Der Geräte-Token fehlt, ist abgelaufen oder hat keine Berechtigung für den Story-Endpunkt.

### HTTP 404

API-Pfad oder Health-Pfad stimmt nicht. Die Firmware erwartet:

```text
POST /v1/device/kunibert-story
GET  /health   (optional)
```

### API 2xx, aber keine `audio_url`

Die Antwort entspricht nicht dem vereinbarten API-Vertrag oder der Server befindet sich in einem Text-/Debugmodus. Erwartet wird zum Beispiel:

```json
{
  "type": "kunibert_story",
  "audio_url": "/media/story.wav",
  "session_end": true
}
```

## TLS-Hinweis

Der Sketch prüft, ob `WiFiSSLClient` eine TLS-Verbindung aufbauen kann. Je nach GIGA-Boardpaket und WiFi-Library muss die CA-/Zertifikatsprüfung zusätzlich explizit konfiguriert werden. Für einen Produktionsbetrieb darf keine Zertifikatsprüfung deaktiviert oder umgangen werden.

## Datenschutz

Der Sketch sendet beim Story-Test keine Kinderstimme, aber Geräte-ID, Sitzungs-ID und den API-Token. Tokens gehören nicht in öffentliche Repositories, Screenshots oder Logs.
