# picastAI.com Geräte-Gegenstelle für Raspberry Pi

Die Node.js-Gegenstelle stellt die Prototyp-API für den Raspberry-Pi-Client bereit.

## Endpunkte

### `GET /health`

Öffentlicher Verbindungs- und Health-Test:

```json
{
  "status": "ok",
  "name": "Ritter Kunibert API",
  "time": 1720000000000
}
```

### `POST /v1/device/question`

Authentifizierung:

```http
Authorization: Bearer <device-token>
X-Device-ID: prototype-001
Content-Type: multipart/form-data
```

Formularfelder:

- `audio`: PCM-WAV, mono, 16 Bit, konfigurierte Abtastrate, maximal 2 MB
- `locale`: derzeit `de-DE`
- `age_band`: derzeit `6-10`
- `session_id`: temporäre Gerätekennung
- `transcript`: optionales Diagnosefeld für lokale Tests; fehlt es, nutzt der Server den konfigurierten STT-Provider

Die Gegenstelle validiert das WAV-Format. Wenn `OPENAI_API_KEY` und `PICASTAI_VOICE_PROVIDER=openai` gesetzt sind, wird die Aufnahme serverseitig über den OpenAI-kompatiblen STT-Endpunkt transkribiert. Der Transcript-Text wird anschließend durch die Sicherheitsweiche und den Erzählmotor verarbeitet.

Beispielantwort:

```json
{
  "type": "answer",
  "audio_url": "https://example.invalid/v1/device/audio/t_abc",
  "text": "...",
  "session_end": false
}
```

`text` wird standardmäßig nicht ausgegeben. Es erscheint nur außerhalb von `NODE_ENV=production`, wenn `KUNIBERT_DIAGNOSTIC_TEXT=1` ausdrücklich gesetzt ist.

### `POST /v1/device/kunibert-story`

Authentifizierung wie oben, JSON-Body:

```json
{
  "locale": "de-DE",
  "age_band": "6-10",
  "length": "short",
  "session_id": "prototype-001-1234"
}
```

Die Story-Session wird für die Gerät-ID ausschließlich flüchtig im RAM gehalten. Turntexte und Storyzustände werden von den Geräte- und Turn-Endpunkten nicht in Firestore gespeichert. Nach einem Serverneustart beginnt die Story-Session neu. Die Antwort enthält eine kurzlebige Audio-URL:

```json
{
  "type": "kunibert_story",
  "audio_url": "https://example.invalid/v1/device/audio/t_abc",
  "text": "...",
  "session_end": true
}
```

### `GET /v1/device/audio/:turn_id`

Erfordert wieder dieselben `Authorization`- und `X-Device-ID`-Header. Die WAV-Datei wird aus dem flüchtigen AudioStore geliefert und danach einmalig gelöscht. Die URL läuft ab, sobald die konfigurierte TTL erreicht ist.

## Konfiguration

In `.env` oder der vom Prozess geladenen Umgebung:

```ini
PORT=3000
HOST=0.0.0.0
PICASTAI_ADMIN_TOKEN=<mindestens-32-zufaellige-Zeichen>
PICASTAI_CORS_ORIGINS=https://dein-exakter-frontend-host.example
PICASTAI_DEVICE_ID=prototype-001
PICASTAI_DEVICE_TOKEN=ein-langer-nicht-oeffentlicher-token
PICASTAI_DEVICE_NAME=picastAI Raspberry-Pi-Prototyp
KUNIBERT_DIAGNOSTIC_TEXT=0
OPENAI_BASE_URL=https://api.openai.com/v1
PICASTAI_VOICE_PROVIDER=openai
PICASTAI_STT_MODEL=whisper-1
PICASTAI_TTS_MODEL=tts-1
PICASTAI_TTS_VOICE=alloy
PICASTAI_VOICE_TIMEOUT_MS=45000
```

Die Token-Datei beziehungsweise Prozessumgebung darf nur für den Serverdienst lesbar sein. Nicht in Git, Screenshots oder Logs eintragen.

`PICASTAI_ADMIN_TOKEN` schützt `GET/POST /api/devices`, `POST /api/devices/:id/revoke` sowie `GET /api/config` und `GET /api/status` per `Authorization: Bearer <admin-token>`. Fehlt das Token oder ist es kürzer als 32 Zeichen, antworten diese Routen geschlossen mit HTTP 503. Ein falsches oder fehlendes Token ergibt HTTP 401. Das Dashboard hält das eingegebene Token nur im Tab-Speicher; es muss ausschließlich über HTTPS verwendet werden.

`PICASTAI_CORS_ORIGINS` enthält eine kommagetrennte Liste exakter Browser-Origin-Werte, zum Beispiel `https://kunibert.example,https://www.kunibert.example`. Leer bedeutet: keine Cross-Origin-Freigabe; Same-Origin-Aufrufe und Pi-/Server-zu-Server-Aufrufe benötigen keine CORS-Freigabe. Keine Wildcards für Produktionszugriffe eintragen.

Die Datei `firestore.rules` verweigert direkte Zugriffe aller Firebase-Clients. Das Server-Admin-SDK umgeht Firestore-Regeln; serverseitige API-Routen müssen deshalb separat authentifiziert sein.

Für eine Produktionsumgebung sollte der Token nicht als einzelne globale Umgebungsvariable, sondern über einen Secret-Manager provisioniert werden. Standardmäßig ist die Geräteregistry flüchtig; ein Serverneustart entfernt die über das Dashboard angelegten Geräte. Mit `PICASTAI_DEVICE_STORE=firestore` wird sie dauerhaft in der Firestore-Collection `devices` geführt (nur der SHA-256-Hash des Tokens, nie der Token selbst):

- Beim Start lädt der Server die Geräteliste. Ist Firestore dann nicht erreichbar, startet er nicht (fail-closed), damit widerrufene Geräte nicht wieder gültig werden.
- `POST /api/devices` speichert das Gerät, bevor es den Token ausgibt; schlägt das Speichern fehl, antwortet die API mit `503 {"error":"device_store_unavailable"}` und legt nichts an.
- `POST /api/devices/:id/revoke` wirkt sofort im Speicher und antwortet mit `{"success":true,"persisted":true|false}`. Bei `persisted:false` war Firestore nicht erreichbar; der Widerruf gilt bis zum nächsten Neustart und sollte dann wiederholt werden.
- Ein gespeicherter Widerruf gilt auch für per Umgebung provisionierte Geräte. Soll ein widerrufenes Gerät wieder zugelassen werden, ist eine neue Geräte-ID oder das Löschen des Firestore-Dokuments nötig.
- Das Admin-SDK benötigt Zugangsdaten (z. B. Application Default Credentials) mit Schreib-/Leserecht auf Firestore.

## Lokaler Test

```bash
npm install
export PICASTAI_DEVICE_ID=prototype-001
export PICASTAI_DEVICE_TOKEN=test-token-kunibert-2026
export KUNIBERT_DIAGNOSTIC_TEXT=1
npm run dev
```

Health:

```bash
curl -fsS http://127.0.0.1:3000/health
```

Story:

```bash
curl -fsS -X POST http://127.0.0.1:3000/v1/device/kunibert-story \
  -H 'Authorization: Bearer test-token-kunibert-2026' \
  -H 'X-Device-ID: prototype-001' \
  -H 'Content-Type: application/json' \
  -d '{"locale":"de-DE","age_band":"6-10","length":"short","session_id":"curl-test"}'
```

Die `audio_url` aus der Antwort mit denselben Authentifizierungsheadern abrufen. Da der AudioStore einmalig ausliefert, den Audioabruf nicht mehrfach wiederholen. Mit konfiguriertem TTS-Provider enthält die WAV-Antwort echte Sprachsynthese; ohne Provider wird für lokale Tests das deterministische Fallback-Signal ausgeliefert.

## Sicherheitsgrenzen des Prototyps

- Rate-Limit pro Gerät: standardmäßig 30 Anfragen pro 10 Minuten.
- Audio nur im flüchtigen RAM, TTL standardmäßig 120 Sekunden.
- Audio-URL benötigt erneut Geräteauthentifizierung.
- Story-State, Rate-Limit und Audio sind im Prozessspeicher, nicht hochverfügbar. Die Geräteliste ist es nur ohne `PICASTAI_DEVICE_STORE=firestore`.
- Geräteverwaltung, Status und sichere Konfigurationsübersicht benötigen ein starkes Admin-Bearer-Token.
- CORS akzeptiert nur exakt konfigurierte Browser-Ursprünge; ohne Allowlist gibt es keine Cross-Origin-Freigabe.
- Firestore-Regeln verweigern direkte Clientzugriffe; serverseitige Admin-SDK-Zugriffe sind hiervon nicht erfasst.
- HTTPS muss durch Reverse Proxy oder TLS-fähige Node-Konfiguration bereitgestellt werden.
- STT-/TTS-Audio wird nur zur Laufzeit an den konfigurierten Provider übertragen; Aufbewahrung und Anbieter-Datenfluss müssen vor Kinderbetrieb rechtlich und organisatorisch geprüft werden.
