# picastAI.com Geräte-Gegenstelle für Arduino GIGA

Die Node.js-Gegenstelle stellt die Prototyp-API für Arduino GIGA und Raspberry-Pi-Geräte bereit.

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
- `transcript`: optionales Diagnosefeld für den Prototyp

Die aktuelle Gegenstelle validiert das WAV-Format. Eine echte Speech-to-Text-Provider-Anbindung ist bewusst als separater nächster Schritt gehalten. Ohne `transcript` antwortet der Erzählmotor mit seiner sicheren „nicht verstanden“-Ansage, statt den Inhalt der Audiodatei zu erfinden.

Beispielantwort:

```json
{
  "type": "answer",
  "audio_url": "https://example.invalid/v1/device/audio/t_abc",
  "text": "...",
  "session_end": false
}
```

`text` wird nur ausgegeben, wenn `KUNIBERT_DIAGNOSTIC_TEXT` nicht `0` ist.

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

Die Story-Session wird für die Gerät-ID flüchtig im RAM gehalten. Die Antwort enthält eine kurzlebige Audio-URL:

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
PICASTAI_DEVICE_ID=prototype-001
PICASTAI_DEVICE_TOKEN=ein-langer-nicht-oeffentlicher-token
PICASTAI_DEVICE_NAME=picastAI GIGA-Prototyp
KUNIBERT_DIAGNOSTIC_TEXT=0
```

Die Token-Datei beziehungsweise Prozessumgebung darf nur für den Serverdienst lesbar sein. Nicht in Git, Arduino-Quellcode-Repositories, Screenshots oder Logs eintragen.

Für eine Produktionsumgebung sollte der Token nicht als einzelne globale Umgebungsvariable, sondern über einen Secret-Manager provisioniert werden. Die Registry ist im aktuellen Prototyp flüchtig; ein Serverneustart entfernt die in-memory Geräte.

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

Die `audio_url` aus der Antwort mit denselben Authentifizierungsheadern abrufen. Da der AudioStore einmalig ausliefert, den Audioabruf nicht mehrfach wiederholen.

## Sicherheitsgrenzen des Prototyps

- Rate-Limit pro Gerät: standardmäßig 30 Anfragen pro 10 Minuten.
- Audio nur im flüchtigen RAM, TTL standardmäßig 120 Sekunden.
- Audio-URL benötigt erneut Geräteauthentifizierung.
- Geräte- und Story-State sind im aktuellen Prozessspeicher, nicht hochverfügbar.
- CORS ist für die bestehende Web-Demo offen und muss vor einer öffentlichen Produktion eingeschränkt werden.
- HTTPS muss durch Reverse Proxy oder TLS-fähige Node-Konfiguration bereitgestellt werden.
- Die Anfrage-Audio-STT-Anbindung fehlt noch; der nächste Schritt ist ein serverseitiger, datensparsamer STT-Provider mit Timeout und Fehlerfall.
