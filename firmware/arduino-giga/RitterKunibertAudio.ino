/*
 * Ritter Kunibert – Arduino GIGA R1 WiFi
 * Vollständige Prototyp-Firmware 0.3
 *
 * Funktionen:
 *   D2: Sprechtaste, gedrückt halten = aufnehmen
 *   D3: Erzähltaste, einmal drücken = Kunibert-Geschichte
 *   D4: Aufnahme-/Status-LED
 *   D5: Mikrofon-Aus-Sense, LOW = ausgeschaltet
 *   PDM: Monoaufnahme, 16 kHz, maximal 15 Sekunden
 *   DAC0/A12: PCM-WAV-Wiedergabe zu aktivem Audioausgang
 *   WLAN + HTTPS/HTTP-API zu picastAI.com bzw. lokalem Mock-Server
 *
 * Benötigte Bibliotheken:
 *   WiFi, PDM, Arduino_AdvancedAnalog
 *
 * Prototyp-Hinweis:
 *   Dies ist eine Firmware für erwachsene Labortests. Vor Kinderbetrieb sind
 *   Datenschutz, Hardware-Mikrofonabschaltung, Gehäuse, Audiopegel, TLS-
 *   Zertifikatsprüfung und Sicherheitsverhalten fachlich abzunehmen.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PDM.h>
#include <Arduino_AdvancedAnalog.h>

// --------------------------- Konfiguration --------------------------------

// Diese Werte lokal eintragen. Keine echten Tokens in Git, Screenshots oder
// öffentlichen Logs speichern. Für einen Mock im lokalen Netz TLS deaktivieren.
#define PICAST_USE_TLS 1
const char WIFI_SSID[] = "DEIN_WLAN";
const char WIFI_PASSWORD[] = "DEIN_WLAN_PASSWORT";
const char PICAST_HOST[] = "picastAI.com";
const uint16_t PICAST_PORT = 443;
const char PICAST_DEVICE_TOKEN[] = "DEVICE_TOKEN_NICHT_COMMITTEN";
const char DEVICE_ID[] = "prototype-001";

// Für TLS muss das Zertifikat/CA-Handling des verwendeten GIGA-WiFi-Stacks
// ergänzt werden. Für lokale Entwicklung: PICAST_USE_TLS auf 0 setzen und
// PICAST_HOST auf die IP des Mock-Servers setzen.
const char LOCALE[] = "de-DE";
const char AGE_BAND[] = "6-10";
const char STORY_LENGTH[] = "short";

constexpr uint8_t SPEECH_BUTTON_PIN = 2;
constexpr uint8_t STORY_BUTTON_PIN = 3;
constexpr uint8_t RECORDING_LED_PIN = 4;
constexpr uint8_t MIC_SWITCH_PIN = 5;

constexpr uint32_t SAMPLE_RATE = 16000;
constexpr uint16_t MAX_RECORDING_SECONDS = 15;
constexpr size_t MAX_SAMPLES = SAMPLE_RATE * MAX_RECORDING_SECONDS;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 40;
constexpr uint32_t WIFI_TIMEOUT_MS = 15000;
constexpr uint32_t HTTP_TIMEOUT_MS = 12000;
constexpr size_t MAX_JSON_BYTES = 4096;
constexpr size_t HTTP_AUDIO_CHUNK_BYTES = 512;

#if PICAST_USE_TLS
typedef WiFiSSLClient PicastClient;
#else
typedef WiFiClient PicastClient;
#endif

// --------------------------- Zustände -------------------------------------

enum DeviceState {
  READY,
  RECORDING,
  REQUESTING,
  PLAYING,
  ERROR_STATE
};

DeviceState state = READY;

// --------------------------- Audioaufnahme --------------------------------

volatile bool pdmDataAvailable = false;
volatile size_t pdmSamplesAvailable = 0;
int16_t recordingBuffer[MAX_SAMPLES];
size_t recordedSamples = 0;
uint32_t recordingStartedAt = 0;

void onPDMdata() {
  pdmSamplesAvailable = PDM.available() / sizeof(int16_t);
  pdmDataAvailable = true;
}

void drainPdmIntoRecordingBuffer() {
  if (state != RECORDING || !pdmDataAvailable) return;

  noInterrupts();
  size_t available = pdmSamplesAvailable;
  pdmDataAvailable = false;
  interrupts();

  if (available == 0) return;
  if (available > 256) available = 256;

  static int16_t pdmChunk[256];
  int bytesRead = PDM.read(pdmChunk, available * sizeof(int16_t));
  if (bytesRead <= 0) return;

  size_t samplesRead = size_t(bytesRead) / sizeof(int16_t);
  size_t room = MAX_SAMPLES - recordedSamples;
  if (samplesRead > room) samplesRead = room;
  memcpy(recordingBuffer + recordedSamples, pdmChunk,
         samplesRead * sizeof(int16_t));
  recordedSamples += samplesRead;
}

bool microphoneIsEnabled() {
  return digitalRead(MIC_SWITCH_PIN) == HIGH;
}

bool startRecording() {
  if (!microphoneIsEnabled()) {
    Serial.println(F("Mikrofon ist ausgeschaltet; Aufnahme blockiert."));
    return false;
  }

  recordedSamples = 0;
  pdmDataAvailable = false;
  pdmSamplesAvailable = 0;

  if (!PDM.begin(1, SAMPLE_RATE)) {
    Serial.println(F("PDM-Mikrofon konnte nicht gestartet werden."));
    return false;
  }
  PDM.onReceive(onPDMdata);
  recordingStartedAt = millis();
  digitalWrite(RECORDING_LED_PIN, HIGH);
  state = RECORDING;
  Serial.println(F("Aufnahme gestartet."));
  return true;
}

void stopRecording() {
  PDM.end();
  digitalWrite(RECORDING_LED_PIN, LOW);
  Serial.print(F("Aufnahme beendet; Samples: "));
  Serial.println(recordedSamples);
}

// --------------------------- WAV-Helfer -----------------------------------

void writeLE16(uint8_t *dst, uint16_t value) {
  dst[0] = uint8_t(value & 0xff);
  dst[1] = uint8_t((value >> 8) & 0xff);
}

void writeLE32(uint8_t *dst, uint32_t value) {
  dst[0] = uint8_t(value & 0xff);
  dst[1] = uint8_t((value >> 8) & 0xff);
  dst[2] = uint8_t((value >> 16) & 0xff);
  dst[3] = uint8_t((value >> 24) & 0xff);
}

uint16_t readLE16(const uint8_t *src) {
  return uint16_t(src[0]) | (uint16_t(src[1]) << 8);
}

uint32_t readLE32(const uint8_t *src) {
  return uint32_t(src[0]) |
         (uint32_t(src[1]) << 8) |
         (uint32_t(src[2]) << 16) |
         (uint32_t(src[3]) << 24);
}

size_t recordingWavLength() {
  return 44 + recordedSamples * sizeof(int16_t);
}

void buildRecordingWavHeader(uint8_t header[44]) {
  memset(header, 0, 44);
  memcpy(header + 0, "RIFF", 4);
  writeLE32(header + 4, uint32_t(36 + recordedSamples * sizeof(int16_t)));
  memcpy(header + 8, "WAVE", 4);
  memcpy(header + 12, "fmt ", 4);
  writeLE32(header + 16, 16);                 // fmt chunk length
  writeLE16(header + 20, 1);                  // PCM
  writeLE16(header + 22, 1);                  // mono
  writeLE32(header + 24, SAMPLE_RATE);
  writeLE32(header + 28, SAMPLE_RATE * sizeof(int16_t));
  writeLE16(header + 32, sizeof(int16_t));
  writeLE16(header + 34, 16);
  memcpy(header + 36, "data", 4);
  writeLE32(header + 40, uint32_t(recordedSamples * sizeof(int16_t)));
}

// --------------------------- WLAN/API-Helfer ------------------------------

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.print(F("Verbinde WLAN"));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("WLAN-Verbindung fehlgeschlagen."));
    return false;
  }
  Serial.print(F("WLAN-IP: "));
  Serial.println(WiFi.localIP());
  return true;
}

String makeSessionId() {
  String id = DEVICE_ID;
  id += '-';
  id += String(millis(), HEX);
  id += '-';
  id += String(random(0xffff), HEX);
  return id;
}

void printHttpRequestTarget(const char *method, const char *path) {
  Serial.print(method);
  Serial.print(' ');
  Serial.println(path);
}

void sendCommonHeaders(PicastClient &client, const char *method,
                       const char *path, const char *contentType,
                       size_t contentLength, const String &sessionId) {
  client.print(method);
  client.print(' ');
  client.print(path);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(PICAST_HOST);
  client.println(F("Connection: close"));
  client.print(F("Content-Type: "));
  client.println(contentType);
  client.print(F("Content-Length: "));
  client.println(contentLength);
  client.print(F("Authorization: Bearer "));
  client.println(PICAST_DEVICE_TOKEN);
  client.print(F("X-Device-ID: "));
  client.println(DEVICE_ID);
  client.print(F("X-Session-ID: "));
  client.println(sessionId);
  client.println();
}

bool waitForHeaders(PicastClient &client, int &statusCode) {
  uint32_t started = millis();
  while (!client.available() && millis() - started < HTTP_TIMEOUT_MS) delay(10);
  if (!client.available()) {
    Serial.println(F("HTTP-Timeout beim Warten auf Header."));
    return false;
  }

  String statusLine = client.readStringUntil('\n');
  Serial.print(F("HTTP: "));
  Serial.println(statusLine);
  statusCode = 0;
  int firstSpace = statusLine.indexOf(' ');
  if (firstSpace >= 0) statusCode = statusLine.substring(firstSpace + 1).toInt();

  uint32_t headerStarted = millis();
  while (millis() - headerStarted < HTTP_TIMEOUT_MS) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) return statusCode >= 200 && statusCode < 300;
  }
  return false;
}

bool readExact(PicastClient &client, uint8_t *buffer, size_t length) {
  size_t received = 0;
  uint32_t started = millis();
  while (received < length && millis() - started < HTTP_TIMEOUT_MS) {
    while (client.available() && received < length) {
      int value = client.read();
      if (value >= 0) buffer[received++] = uint8_t(value);
    }
    if (received < length) delay(2);
  }
  return received == length;
}

bool readJsonBody(PicastClient &client, String &body, int &statusCode) {
  if (!waitForHeaders(client, statusCode)) return false;
  uint32_t started = millis();
  while ((client.connected() || client.available()) &&
         millis() - started < HTTP_TIMEOUT_MS) {
    while (client.available()) {
      if (body.length() >= MAX_JSON_BYTES) {
        Serial.println(F("JSON-Antwort zu groß."));
        return false;
      }
      int value = client.read();
      if (value >= 0) body += char(value);
    }
    delay(5);
  }
  Serial.print(F("API-Antwort: "));
  Serial.println(body);
  return statusCode >= 200 && statusCode < 300;
}

String jsonString(const String &json, const char *key) {
  String marker = String("\"") + key + "\":\"";
  int start = json.indexOf(marker);
  if (start < 0) return String();
  start += marker.length();
  int end = json.indexOf('"', start);
  if (end < 0) return String();
  return json.substring(start, end);
}

bool responseHasSessionEnd(const String &json) {
  int start = json.indexOf(F("\"session_end\":"));
  if (start < 0) return false;
  return json.indexOf(F("true"), start) >= 0;
}

// Extract a request target from an absolute https:// URL. The prototype only
// follows audio URLs back to the configured API host.
String pathFromAudioUrl(const String &url) {
  if (url.startsWith(F("/"))) return url;
  int scheme = url.indexOf(F("://"));
  if (scheme < 0) return String();
  int slash = url.indexOf('/', scheme + 3);
  if (slash < 0) return String("/");
  String host = url.substring(scheme + 3, slash);
  int colon = host.indexOf(':');
  if (colon >= 0) host = host.substring(0, colon);
  if (host != String(PICAST_HOST)) {
    Serial.println(F("audio_url zeigt auf einen fremden Host; abgebrochen."));
    return String();
  }
  return url.substring(slash);
}

// --------------------------- GIGA-DAC-Wiedergabe --------------------------

AdvancedDAC dac0(A12);
bool dacStarted = false;
uint32_t dacSampleRate = 0;

bool beginDac(uint32_t sampleRate) {
  if (sampleRate < 8000 || sampleRate > 48000) return false;
  if (dacStarted && dacSampleRate == sampleRate) return true;
  if (dacStarted && dacSampleRate != sampleRate) {
    Serial.println(F("Unterschiedliche WAV-Samplerate; Wiedergabe abgebrochen."));
    return false;
  }
  // GIGA-Referenzbeispiel: DAC-Frequenz = sampleRate * 2.
  if (!dac0.begin(AN_RESOLUTION_12, sampleRate * 2, 256, 16)) {
    Serial.println(F("GIGA-DAC konnte nicht initialisiert werden."));
    return false;
  }
  dacStarted = true;
  dacSampleRate = sampleRate;
  return true;
}

bool playWavAtPath(const String &path) {
  if (!microphoneIsEnabled()) {
    // Während der Wiedergabe bleibt die Hardware-/Firmware-Sperre aktiv.
    Serial.println(F("Mikrofon ist OFF; Wiedergabe wird trotzdem fortgesetzt."));
  }

  PicastClient client;
  if (!client.connect(PICAST_HOST, PICAST_PORT)) {
    Serial.println(F("Audio-URL konnte nicht geöffnet werden."));
    return false;
  }
  client.print(F("GET "));
  client.print(path);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(PICAST_HOST);
  client.println(F("Connection: close"));
  client.print(F("Authorization: Bearer "));
  client.println(PICAST_DEVICE_TOKEN);
  client.println();

  int statusCode = 0;
  if (!waitForHeaders(client, statusCode)) {
    client.stop();
    return false;
  }

  uint8_t header[44];
  if (!readExact(client, header, sizeof(header))) {
    Serial.println(F("WAV-Header unvollständig."));
    client.stop();
    return false;
  }
  if (memcmp(header + 0, "RIFF", 4) != 0 ||
      memcmp(header + 8, "WAVE", 4) != 0 ||
      memcmp(header + 12, "fmt ", 4) != 0 ||
      memcmp(header + 36, "data", 4) != 0) {
    Serial.println(F("Nur einfache PCM-WAV-Header werden unterstützt."));
    client.stop();
    return false;
  }

  uint16_t format = readLE16(header + 20);
  uint16_t channels = readLE16(header + 22);
  uint32_t sampleRate = readLE32(header + 24);
  uint16_t bits = readLE16(header + 34);
  uint32_t bytesRemaining = readLE32(header + 40);
  if (format != 1 || channels != 1 || bits != 16 || !beginDac(sampleRate)) {
    Serial.println(F("WAV benötigt PCM mono 16-bit mit 8-48 kHz."));
    client.stop();
    return false;
  }

  state = PLAYING;
  uint8_t pcm[HTTP_AUDIO_CHUNK_BYTES];
  Serial.print(F("Wiedergabe gestartet; Bytes: "));
  Serial.println(bytesRemaining);

  while (bytesRemaining >= 2 && (client.connected() || client.available())) {
    if (!dac0.available()) {
      delay(1);
      continue;
    }

    size_t bytesToRead = bytesRemaining > sizeof(pcm) ? sizeof(pcm) : bytesRemaining;
    bytesToRead &= ~size_t(1);
    if (!readExact(client, pcm, bytesToRead)) {
      Serial.println(F("WAV-Daten unvollständig."));
      client.stop();
      state = READY;
      return false;
    }

    SampleBuffer buffer = dac0.dequeue();
    size_t sampleCount = bytesToRead / 2;
    size_t outputCount = buffer.size() < sampleCount ? buffer.size() : sampleCount;
    for (size_t i = 0; i < outputCount; ++i) {
      int16_t signedSample = int16_t(uint16_t(pcm[2*i]) |
                                     (uint16_t(pcm[2*i + 1]) << 8));
      buffer[i] = uint16_t((int32_t(signedSample) + 32768) >> 4) & 0x0fff;
    }
    dac0.write(buffer);
    bytesRemaining -= bytesToRead;
  }

  client.stop();
  state = READY;
  Serial.println(F("Wiedergabe beendet."));
  return bytesRemaining == 0;
}

// --------------------------- API-Aktionen ---------------------------------

bool playResponseAudio(const String &json) {
  String audioUrl = jsonString(json, "audio_url");
  if (audioUrl.length() == 0) {
    Serial.println(F("API-Antwort enthält keine audio_url."));
    return false;
  }
  String path = pathFromAudioUrl(audioUrl);
  if (path.length() == 0) return false;
  return playWavAtPath(path);
}

bool postQuestion() {
  PicastClient client;
  if (!client.connect(PICAST_HOST, PICAST_PORT)) {
    Serial.println(F("picastAI.com nicht erreichbar."));
    return false;
  }

  String sessionId = makeSessionId();
  const char boundary[] = "----RitterKunibertBoundary7MA4YWxkTrZu0gW";
  String prefix;
  prefix += "--"; prefix += boundary; prefix += "\r\n";
  prefix += "Content-Disposition: form-data; name=\"locale\"\r\n\r\n";
  prefix += LOCALE; prefix += "\r\n--"; prefix += boundary; prefix += "\r\n";
  prefix += "Content-Disposition: form-data; name=\"age_band\"\r\n\r\n";
  prefix += AGE_BAND; prefix += "\r\n--"; prefix += boundary; prefix += "\r\n";
  prefix += "Content-Disposition: form-data; name=\"session_id\"\r\n\r\n";
  prefix += sessionId; prefix += "\r\n--"; prefix += boundary; prefix += "\r\n";
  prefix += "Content-Disposition: form-data; name=\"audio\"; filename=\"question.wav\"\r\n";
  prefix += "Content-Type: audio/wav\r\n\r\n";
  String suffix = "\r\n--" + boundary + "--\r\n";
  size_t contentLength = prefix.length() + recordingWavLength() + suffix.length();

  sendCommonHeaders(client, "POST", "/v1/device/question",
                    (String("multipart/form-data; boundary=") + boundary).c_str(),
                    contentLength, sessionId);
  client.print(prefix);
  uint8_t header[44];
  buildRecordingWavHeader(header);
  client.write(header, sizeof(header));
  client.write(reinterpret_cast<const uint8_t *>(recordingBuffer),
               recordedSamples * sizeof(int16_t));
  client.print(suffix);

  String response;
  int statusCode = 0;
  bool ok = readJsonBody(client, response, statusCode);
  client.stop();
  if (!ok) return false;
  return playResponseAudio(response);
}

bool postStoryRequest() {
  PicastClient client;
  if (!client.connect(PICAST_HOST, PICAST_PORT)) {
    Serial.println(F("picastAI.com nicht erreichbar."));
    return false;
  }

  String sessionId = makeSessionId();
  String payload = "{\"locale\":\"" + String(LOCALE) +
                   "\",\"age_band\":\"" + String(AGE_BAND) +
                   "\",\"length\":\"" + String(STORY_LENGTH) +
                   "\",\"session_id\":\"" + sessionId + "\"}";
  sendCommonHeaders(client, "POST", "/v1/device/kunibert-story",
                    "application/json", payload.length(), sessionId);
  client.print(payload);

  String response;
  int statusCode = 0;
  bool ok = readJsonBody(client, response, statusCode);
  client.stop();
  if (!ok) return false;
  return playResponseAudio(response);
}

// --------------------------- Bedienung ------------------------------------

void enterErrorState(const __FlashStringHelper *message) {
  digitalWrite(RECORDING_LED_PIN, LOW);
  Serial.println(message);
  state = ERROR_STATE;
  delay(250);
  state = READY;
}

void finishRecordingRequest() {
  stopRecording();
  if (recordedSamples < SAMPLE_RATE / 4) {
    enterErrorState(F("Aufnahme zu kurz; bitte wiederholen."));
    return;
  }
  state = REQUESTING;
  if (!connectWifi() || !postQuestion()) {
    enterErrorState(F("Keine Verbindung oder keine gültige Antwort."));
  }
  state = READY;
}

void updateSpeechButton() {
  static bool lastRaw = HIGH;
  static bool stable = HIGH;
  static uint32_t changedAt = 0;
  bool raw = digitalRead(SPEECH_BUTTON_PIN);

  if (raw != lastRaw) changedAt = millis();
  if (millis() - changedAt >= BUTTON_DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable == LOW && state == READY) {
      startRecording();
    } else if (stable == HIGH && state == RECORDING) {
      finishRecordingRequest();
    }
  }
  lastRaw = raw;
}

void updateStoryButton() {
  static bool lastRaw = HIGH;
  static bool stable = HIGH;
  static uint32_t changedAt = 0;
  bool raw = digitalRead(STORY_BUTTON_PIN);

  if (raw != lastRaw) changedAt = millis();
  if (millis() - changedAt >= BUTTON_DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable == LOW && state == READY) {
      state = REQUESTING;
      if (!connectWifi() || !postStoryRequest()) {
        enterErrorState(F("Geschichte konnte nicht geladen werden."));
      }
      state = READY;
    }
  }
  lastRaw = raw;
}

void enforceRecordingLimit() {
  if (state != RECORDING) return;
  drainPdmIntoRecordingBuffer();
  if (recordedSamples >= MAX_SAMPLES ||
      millis() - recordingStartedAt >= uint32_t(MAX_RECORDING_SECONDS) * 1000UL) {
    Serial.println(F("Maximale Aufnahmezeit erreicht."));
    finishRecordingRequest();
  }
}

// --------------------------- Arduino-Lifecycle ----------------------------

void setup() {
  Serial.begin(115200);
  delay(500);
  randomSeed(analogRead(A0));

  pinMode(SPEECH_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STORY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(RECORDING_LED_PIN, OUTPUT);
  pinMode(MIC_SWITCH_PIN, INPUT_PULLUP);
  digitalWrite(RECORDING_LED_PIN, LOW);

  Serial.println(F("Ritter Kunibert GIGA-Firmware 0.3"));
  Serial.println(F("Erwachsenen-Prototyp; kein unbeaufsichtigter Kinderbetrieb."));
#if PICAST_USE_TLS
  Serial.println(F("API-Modus: TLS/HTTPS"));
#else
  Serial.println(F("API-Modus: HTTP/LAN-Mock"));
#endif
  Serial.print(F("API-Host: "));
  Serial.println(PICAST_HOST);
  Serial.println(F("D2=Sprechen, D3=Geschichte, D5=Mic OFF"));
}

void loop() {
  if (state == RECORDING) {
    enforceRecordingLimit();
  }
  if (state == READY || state == RECORDING) {
    updateSpeechButton();
    updateStoryButton();
  }
  delay(2);
}
