/*
 * Ritter Kunibert – Connectivity Test 0.1
 *
 * Separater Diagnose-Sketch für den Arduino GIGA R1 WiFi.
 * Prüft:
 *   1. WLAN-Verbindung, lokale IP, Gateway/DNS und Signalstärke
 *   2. optionalen HTTP(S)-Health-Endpunkt
 *   3. authentifizierte API-Kommunikation mit
 *      POST /v1/device/kunibert-story
 *
 * Bedienung im Serial Monitor bei 115200 Baud:
 *   w = WLAN verbinden und Status anzeigen
 *   h = Health-Endpunkt testen
 *   a = picastAI-Story-API testen
 *   t = alle Tests ausführen
 *   r = WLAN trennen und neu verbinden
 *   m = Langzeitmonitor starten/stoppen
 *   s = Monitor-Zusammenfassung anzeigen
 *   p = Einzelmessung mit Health-Latenz
 *
 * Für den lokalen Mock:
 *   PICAST_USE_TLS = 0, Host-IP und Port 8787 eintragen.
 * Für picastAI.com:
 *   PICAST_USE_TLS = 1, Port 443 und gültigen Geräte-Token eintragen.
 *
 * Der Sketch ist nur ein Diagnosewerkzeug. Keine echten Tokens in Git,
 * Screenshots oder öffentlichen Logs speichern.
 */

#include <Arduino.h>
#include <WiFi.h>

#define PICAST_USE_TLS 1

const char WIFI_SSID[] = "DEIN_WLAN";
const char WIFI_PASSWORD[] = "DEIN_WLAN_PASSWORT";
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "DEVICE_TOKEN_NICHT_COMMITTEN";
const char DEVICE_ID[] = "prototype-001";
const char HEALTH_PATH[] = "/health";

const uint32_t WIFI_TIMEOUT_MS = 15000;
const uint32_t HTTP_TIMEOUT_MS = 12000;
const uint32_t MONITOR_INTERVAL_MS = 10000;
const size_t MAX_RESPONSE_BYTES = 4096;

#if PICAST_USE_TLS
typedef WiFiSSLClient TestClient;
#else
typedef WiFiClient TestClient;
#endif

bool monitorActive = false;
uint32_t monitorStartedAt = 0;
uint32_t lastMonitorSampleAt = 0;
uint32_t monitorSamples = 0;
uint32_t monitorDisconnects = 0;
uint32_t monitorReconnects = 0;
uint32_t monitorHealthOk = 0;
uint32_t monitorHealthErrors = 0;
uint32_t monitorLastDropAt = 0;
int32_t monitorMinRssi = 0;
int32_t monitorMaxRssi = 0;
int64_t monitorRssiSum = 0;

void printSeparator() {
  Serial.println(F("----------------------------------------"));
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("WLAN: bereits verbunden"));
    return true;
  }

  Serial.print(F("WLAN: verbinde mit "));
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.print(F("WLAN FEHLER, Statuscode: "));
    Serial.println(int(WiFi.status()));
    return false;
  }

  Serial.println(F("WLAN OK"));
  Serial.print(F("  IP:       "));
  Serial.println(WiFi.localIP());
  Serial.print(F("  Gateway:  "));
  Serial.println(WiFi.gatewayIP());
  Serial.print(F("  DNS:      "));
  Serial.println(WiFi.dnsIP());
  Serial.print(F("  RSSI:     "));
  Serial.print(WiFi.RSSI());
  Serial.println(F(" dBm"));
  return true;
}

void disconnectWifi() {
  WiFi.disconnect();
  Serial.println(F("WLAN getrennt."));
}

bool waitForHeaders(TestClient &client, int &statusCode) {
  uint32_t started = millis();
  while (!client.available() && millis() - started < HTTP_TIMEOUT_MS) delay(10);
  if (!client.available()) {
    Serial.println(F("HTTP FEHLER: Timeout auf Statuszeile."));
    return false;
  }

  String statusLine = client.readStringUntil('\n');
  Serial.print(F("  Statuszeile: "));
  Serial.println(statusLine);
  int space = statusLine.indexOf(' ');
  statusCode = space >= 0 ? statusLine.substring(space + 1).toInt() : 0;

  uint32_t headerStarted = millis();
  while (millis() - headerStarted < HTTP_TIMEOUT_MS) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) {
      return statusCode >= 200 && statusCode < 300;
    }
  }
  Serial.println(F("HTTP FEHLER: Header nicht beendet."));
  return false;
}

bool readResponseBody(TestClient &client, String &body) {
  uint32_t started = millis();
  while ((client.connected() || client.available()) &&
         millis() - started < HTTP_TIMEOUT_MS) {
    while (client.available()) {
      if (body.length() >= MAX_RESPONSE_BYTES) {
        Serial.println(F("HTTP FEHLER: Antwort ist zu groß."));
        return false;
      }
      int value = client.read();
      if (value >= 0) body += char(value);
    }
    delay(5);
  }
  return true;
}

void printBodySummary(const String &body) {
  Serial.print(F("  Antwortbytes: "));
  Serial.println(body.length());
  Serial.print(F("  Body: "));
  if (body.length() > 1200) {
    Serial.println(body.substring(0, 1200));
    Serial.println(F("  ... gekürzt"));
  } else {
    Serial.println(body);
  }
}

bool openClient(TestClient &client) {
  Serial.print(F("  Verbinde mit "));
  Serial.print(PICAST_HOST);
  Serial.print(':');
  Serial.println(PICAST_PORT);
  if (!client.connect(PICAST_HOST, PICAST_PORT)) {
    Serial.println(F("  TCP/TLS FEHLER: Verbindung fehlgeschlagen."));
    return false;
  }
  Serial.println(F("  TCP/TLS OK"));
  return true;
}

bool testHealthEndpoint() {
  printSeparator();
  Serial.println(F("TEST H: Health-Endpunkt"));
  if (!connectWifi()) return false;

  TestClient client;
  if (!openClient(client)) return false;
  client.print(F("GET "));
  client.print(HEALTH_PATH);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(PICAST_HOST);
  client.println(F("Connection: close"));
  client.println();

  int statusCode = 0;
  bool statusOk = waitForHeaders(client, statusCode);
  String body;
  bool bodyOk = readResponseBody(client, body);
  client.stop();
  printBodySummary(body);

  bool ok = statusOk && bodyOk;
  Serial.println(ok ? F("HEALTH TEST: OK") : F("HEALTH TEST: FEHLER"));
  return ok;
}

bool measureHealthLatency(uint32_t &latencyMs, int &statusCode) {
  latencyMs = 0;
  statusCode = 0;
  if (WiFi.status() != WL_CONNECTED) return false;

  TestClient client;
  uint32_t started = millis();
  if (!client.connect(PICAST_HOST, PICAST_PORT)) return false;
  client.print(F("GET "));
  client.print(HEALTH_PATH);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(PICAST_HOST);
  client.println(F("Connection: close"));
  client.println();

  bool ok = waitForHeaders(client, statusCode);
  latencyMs = millis() - started;
  String ignored;
  readResponseBody(client, ignored);
  client.stop();
  return ok;
}

void printMonitorSummary() {
  printSeparator();
  Serial.println(F("WLAN-MONITOR ZUSAMMENFASSUNG"));
  Serial.print(F("  Laufzeit:           "));
  Serial.print((millis() - monitorStartedAt) / 1000UL);
  Serial.println(F(" s"));
  Serial.print(F("  Messungen:          "));
  Serial.println(monitorSamples);
  Serial.print(F("  WLAN-Abbrüche:      "));
  Serial.println(monitorDisconnects);
  Serial.print(F("  Wiederverbindungen: "));
  Serial.println(monitorReconnects);
  Serial.print(F("  Health OK:          "));
  Serial.println(monitorHealthOk);
  Serial.print(F("  Health Fehler:      "));
  Serial.println(monitorHealthErrors);
  if (monitorSamples > 0) {
    Serial.print(F("  RSSI min/max/avg:   "));
    Serial.print(monitorMinRssi);
    Serial.print(F(" / "));
    Serial.print(monitorMaxRssi);
    Serial.print(F(" / "));
    Serial.print(float(monitorRssiSum) / float(monitorSamples), 1);
    Serial.println(F(" dBm"));
  }
  if (monitorLastDropAt != 0) {
    Serial.print(F("  Letzter Abbruch:    vor "));
    Serial.print((millis() - monitorLastDropAt) / 1000UL);
    Serial.println(F(" s"));
  }
  printSeparator();
}

void resetMonitorCounters() {
  monitorStartedAt = millis();
  lastMonitorSampleAt = 0;
  monitorSamples = 0;
  monitorDisconnects = 0;
  monitorReconnects = 0;
  monitorHealthOk = 0;
  monitorHealthErrors = 0;
  monitorLastDropAt = 0;
  monitorMinRssi = 0;
  monitorMaxRssi = 0;
  monitorRssiSum = 0;
}

void startMonitor() {
  if (monitorActive) {
    monitorActive = false;
    Serial.println(F("WLAN-Monitor gestoppt."));
    printMonitorSummary();
    return;
  }
  resetMonitorCounters();
  monitorActive = true;
  Serial.println(F("WLAN-Monitor gestartet; Messung alle 10 Sekunden."));
  Serial.println(F("Mit m stoppen, mit s Zusammenfassung anzeigen."));
}

void monitorSample() {
  if (!monitorActive || millis() - lastMonitorSampleAt < MONITOR_INTERVAL_MS) return;
  lastMonitorSampleAt = millis();
  monitorSamples++;

  if (WiFi.status() != WL_CONNECTED) {
    monitorDisconnects++;
    monitorLastDropAt = millis();
    Serial.println(F("MONITOR: WLAN getrennt; Wiederverbindung..."));
    if (connectWifi()) {
      monitorReconnects++;
      Serial.println(F("MONITOR: Wiederverbindung OK."));
    } else {
      Serial.println(F("MONITOR: Wiederverbindung fehlgeschlagen."));
    }
    return;
  }

  int32_t rssi = WiFi.RSSI();
  if (monitorSamples == 1) {
    monitorMinRssi = rssi;
    monitorMaxRssi = rssi;
  } else {
    if (rssi < monitorMinRssi) monitorMinRssi = rssi;
    if (rssi > monitorMaxRssi) monitorMaxRssi = rssi;
  }
  monitorRssiSum += rssi;

  uint32_t latency = 0;
  int statusCode = 0;
  bool healthOk = measureHealthLatency(latency, statusCode);
  if (healthOk) monitorHealthOk++;
  else monitorHealthErrors++;

  Serial.print(F("MONITOR #"));
  Serial.print(monitorSamples);
  Serial.print(F(" RSSI="));
  Serial.print(rssi);
  Serial.print(F("dBm Health="));
  Serial.print(healthOk ? F("OK") : F("FEHLER"));
  Serial.print(F(" status="));
  Serial.print(statusCode);
  Serial.print(F(" latency="));
  Serial.print(latency);
  Serial.println(F("ms"));
}

String makeSessionId() {
  String id = DEVICE_ID;
  id += '-';
  id += String(millis(), HEX);
  return id;
}

bool testStoryApi() {
  printSeparator();
  Serial.println(F("TEST A: picastAI Story-API"));
  if (!connectWifi()) return false;

  TestClient client;
  if (!openClient(client)) return false;

  String sessionId = makeSessionId();
  String payload = "{\"locale\":\"de-DE\",\"age_band\":\"6-10\",\"length\":\"short\",\"session_id\":\"";
  payload += sessionId;
  payload += "\"}";

  client.println(F("POST /v1/device/kunibert-story HTTP/1.1"));
  client.print(F("Host: "));
  client.println(PICAST_HOST);
  client.println(F("Connection: close"));
  client.println(F("Content-Type: application/json"));
  client.print(F("Content-Length: "));
  client.println(payload.length());
  client.print(F("Authorization: Bearer "));
  client.println(PICAST_DEVICE_TOKEN);
  client.print(F("X-Device-ID: "));
  client.println(DEVICE_ID);
  client.print(F("X-Session-ID: "));
  client.println(sessionId);
  client.println();
  client.print(payload);

  int statusCode = 0;
  bool statusOk = waitForHeaders(client, statusCode);
  String body;
  bool bodyOk = readResponseBody(client, body);
  client.stop();
  printBodySummary(body);

  bool hasAudioUrl = body.indexOf(F("\"audio_url\"")) >= 0;
  bool ok = statusOk && bodyOk && hasAudioUrl;
  if (!hasAudioUrl) Serial.println(F("  Hinweis: audio_url fehlt."));
  Serial.println(ok ? F("API TEST: OK") : F("API TEST: FEHLER"));
  return ok;
}

void runAllTests() {
  bool wifiOk = connectWifi();
  bool healthOk = wifiOk ? testHealthEndpoint() : false;
  bool apiOk = wifiOk ? testStoryApi() : false;
  printSeparator();
  Serial.println(F("TESTERGEBNIS"));
  Serial.print(F("  WLAN:  "));
  Serial.println(wifiOk ? F("OK") : F("FEHLER"));
  Serial.print(F("  Health:"));
  Serial.println(healthOk ? F("OK") : F("FEHLER/optional"));
  Serial.print(F("  API:   "));
  Serial.println(apiOk ? F("OK") : F("FEHLER"));
  printSeparator();
}

void printHelp() {
  printSeparator();
  Serial.println(F("w = WLAN-Test"));
  Serial.println(F("h = Health-Endpunkt testen"));
  Serial.println(F("a = Story-API testen"));
  Serial.println(F("t = alle Tests"));
  Serial.println(F("r = WLAN trennen und neu verbinden"));
  Serial.println(F("m = Langzeitmonitor starten/stoppen"));
  Serial.println(F("s = Monitor-Zusammenfassung anzeigen"));
  Serial.println(F("p = Einzelmessung mit Health-Latenz"));
  Serial.println(F("? = Hilfe"));
  printSeparator();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  randomSeed(analogRead(A0));
  Serial.println(F("Ritter Kunibert Connectivity Test 0.1"));
#if PICAST_USE_TLS
  Serial.println(F("Modus: TLS/HTTPS"));
#else
  Serial.println(F("Modus: HTTP/LAN-Mock"));
#endif
  Serial.print(F("Host: "));
  Serial.print(PICAST_HOST);
  Serial.print(':');
  Serial.println(PICAST_PORT);
  printHelp();
}

void loop() {
  if (!Serial.available()) {
    monitorSample();
    delay(10);
    return;
  }

  char command = char(Serial.read());
  if (command == 'w') connectWifi();
  else if (command == 'h') testHealthEndpoint();
  else if (command == 'a') testStoryApi();
  else if (command == 't') runAllTests();
  else if (command == 'm') startMonitor();
  else if (command == 's') printMonitorSummary();
  else if (command == 'p') {
    uint32_t latency = 0;
    int statusCode = 0;
    bool ok = connectWifi() && measureHealthLatency(latency, statusCode);
    Serial.print(F("Einzelmessung: "));
    Serial.print(ok ? F("OK") : F("FEHLER"));
    Serial.print(F(" status="));
    Serial.print(statusCode);
    Serial.print(F(" latency="));
    Serial.print(latency);
    Serial.println(F("ms"));
  }
  else if (command == 'r') {
    disconnectWifi();
    delay(300);
    connectWifi();
  } else if (command == '?' || command == '\n' || command == '\r') {
    if (command == '?') printHelp();
  } else {
    Serial.println(F("Unbekannter Befehl; ? für Hilfe."));
  }
  monitorSample();
}
