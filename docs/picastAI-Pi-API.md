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
- `transcript`: optionales Testfeld (Text statt Spracherkennung, höchstens 1000 Zeichen); fehlt es, nutzt der Server den konfigurierten Spracherkennungsdienst. Geräte senden es nicht. Seit 12.11.2026 wirkt es mit `NODE_ENV=production` nur, wenn auf dem Server `KUNIBERT_TEST_TRANSCRIPT=1` gesetzt ist (für Testtage mit Erwachsenen; beim Start erscheint dann eine Warnung). Ohne den Schalter überhört der Server das Feld und erkennt die Aufnahme. Ohne `NODE_ENV=production` (Probelauf am Rechner) wirkt es immer. Vor dem ersten Kind bleibt der Schalter weg

Die Gegenstelle validiert das WAV-Format. Wenn `PICASTAI_STT_URL` und `PICASTAI_STT_MODEL` gesetzt sind, wird die Aufnahme serverseitig über einen OpenAI-kompatiblen Spracherkennungsdienst transkribiert, in der Regel ein eigener Server. Die Sprachausgabe läuft entsprechend über `PICASTAI_TTS_URL`, `PICASTAI_TTS_MODEL` und `PICASTAI_TTS_VOICE`; ohne diese Angaben bleibt der Dienst aus (siehe `docs/LLM-Anbieter.md`). Alternativ lässt sich nur die Sprachausgabe auf Google Cloud Text-to-Speech umstellen (`PICASTAI_TTS_PROVIDER=google`, eingeführt mit PR #14); die Einstellungen dazu stehen in `docs/LLM-Anbieter.md` und sind hier nicht wiederholt. Der Transcript-Text wird anschließend durch die Sicherheitsweiche und den Erzählmotor verarbeitet. Liefert die Erkennung keinen Text (Stille, Rauschen), ist das kein Fehler: der Server antwortet mit dem festen Hinweis „Das habe ich leider nicht richtig verstanden“ (HTTP 200). Dasselbe gilt ohne Aufruf der Spracherkennung, wenn die Aufnahme praktisch stumm ist (Spitzenwert unter 32 von 32767, `isSilentPcm16` in `server-api/audio.ts`), und wenn die Erkennung nur aus dem Erkennungshinweis (`PICASTAI_STT_PROMPT`) oder einem bekannten Untertitel-Abspann von Whisper besteht (`isLikelySttArtifact` in `server-api/brain.ts`); die Sicherheitsweiche läuft vorher. Denselben Hinweis gibt es, wenn das Sprachmodell die Äußerung als unverständlich einstuft. Fehlt das Sprachmodell oder wird seine Antwort abgelehnt, spricht der Server einen festen Ersatztext; die Äußerung des Kindes wird dabei nie nachgesprochen.

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

Jeder Aufruf erzählt den **nächsten Teil der laufenden Folge** (eine Folge hat standardmäßig fünf Teile, `KUNIBERT_PARTS_PER_EPISODE`) und beginnt nur dann eine neue Folge, wenn keine läuft oder die letzte beendet wurde. So passt es zum Satz am Ende jedes Teils: „Wenn du wissen willst, wie es weitergeht, drück noch einmal die Erzähltaste.“ `session_end` ist `true`, sobald der letzte Teil einer Folge gesprochen wurde. `locale` und `age_band` nimmt der Vertrag entgegen; es gilt derzeit de-DE und die serverseitig konfigurierte Altersgruppe (`KUNIBERT_AGE`). Einen Kinderwunsch trägt die Taste nicht; Wünsche äußert das Kind über die Sprechtaste („Erzähl mir eine Geschichte mit einem Einhorn“). Sagt das Kind über die Sprechtaste während einer laufenden Folge, was passieren soll („Kunibert soll den Drachen kitzeln“), erzählt der Server den nächsten Teil derselben Folge mit dieser Idee (Antwort `kind: "weiter"`). Hat das Kind den letzten Teil per Taste angehalten und das Gerät es gemeldet (`POST /v1/device/playback-stopped`, unten), erzählen eine Idee, „weiter“ und die Erzähltaste stattdessen denselben Teil ab der gehörten Stelle weiter. Nach Teil 1 weist der Schlusssatz darauf hin. Fällt das Sprachmodell mitten in einer Folge aus, kommt einmal der feste Satz „Kunibert muss kurz überlegen …“, und die Folge rückt nicht weiter.

Die Story-Session wird für die Gerät-ID ausschließlich flüchtig im RAM gehalten. Turntexte und Storyzustände werden von den Geräte- und Turn-Endpunkten nicht in Firestore gespeichert. Nach einem Serverneustart beginnt die Story-Session neu. Sie verfällt außerdem 24 Stunden nach der letzten Nutzung (vorläufig, Maßnahme M9 der Datenschutz-Folgenabschätzung, seit 20.11.2026): Dann beginnt die nächste Erzählung eine neue Folge, und auch das Gedächtnis der letzten Folgen ist weg. Abgelaufenes löscht der Server spätestens fünf Minuten später aus dem Arbeitsspeicher, auch bei Geräten, die sich nicht mehr melden. Sperrt der Betreiber ein Gerät (`POST /api/devices/:id/revoke`), löscht der Server sofort dessen Stand, den vorbereiteten nächsten Teil, die gemerkte Stelle nach einem Stopp per Taste, wartendes Audio und die Eltern-Steuerung (Einwilligung, Einstellungen, Kopplungscodes, Eltern-Tokens). Anfragen, die beim Sperren noch laufen, legen danach weder Stand noch Audio ab und antworten mit 401. Ein Ton-Strom, den das Gerät schon abspielt, läuft zu Ende. Die Antwort enthält eine kurzlebige Audio-URL:

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

#### Ton-Strom (seit 14.11.2026, Punkt 71; Standard aus)

Damit eine Geschichte nicht erst nach der ganzen Vertonung beginnt, kann der Server sie Absatz für Absatz ausliefern. Beide Seiten müssen zustimmen:

- **Server:** `PICASTAI_AUDIO_STREAM=1` (Standard aus).
- **Gerät:** Kopf `X-Kunibert-Audio-Stream: 1` bei `POST /v1/device/question` und `POST /v1/device/kunibert-story`. Der Pi-Client schickt ihn standardmäßig (`KUNIBERT_AUDIO_STREAM=0` schaltet ab). Die ESP32-Firmware schickt ihn nicht und bekommt deshalb unverändert eine ganze Datei (offen: Strom auch in der Firmware).

Ablauf: Claude schreibt den Teil im Streaming. Jeder fertige Absatz geht durch den Ausgabe-Check und dann an die Sprachausgabe. Die Antwort auf den POST kommt, sobald der erste Absatz vertont ist, mit `"audio_stream": true`. `session_end` ist dann schon richtig gesetzt. Der GET auf die `audio_url` liefert `audio/wav` ohne `Content-Length` (chunked): einen 44-Byte-Kopf mit RIFF- und data-Länge `0xFFFFFFFF` („bis zum Ende“), dann PCM, sobald es entsteht, zwischen Absätzen 0,9 s Pause. Das Ende der Verbindung ist das Ende des Tons. Bricht die Sprachausgabe mittendrin ab, endet die Verbindung früher, und die Folge rückt nicht vor.

Schlägt der Ausgabe-Check mitten im Teil an (oder bricht Claude ab, nachdem schon ein Absatz gesprochen wurde), wird der betroffene Absatz nie gesprochen. Kunibert sagt „Kunibert muss kurz überlegen …“, und die Folge rückt nicht vor; der nächste Druck erzählt den Teil neu, und beim nächsten Ausfall greift wie bisher die Ersatzfolge. Trifft es schon den ersten Absatz, ist noch nichts gesprochen: Dann schreibt Claude den Teil ohne Strom ein zweites Mal.

Fragen, feste Texte, Ersatzgeschichten und vorbereitete Teile (`prefetch.ts`) kommen auch mit eingeschaltetem Strom als ganze Datei; `audio_stream` fehlt dann. Kommt eine neue Anfrage desselben Geräts, solange ein Strom noch im Hintergrund entsteht, wartet der Server auf dessen Stand.

### `POST /v1/device/playback-stopped`

Seit 21.11.2026 (Punkt B2 der Arbeitsliste, am Server). Hält das Kind Kunibert per Taste an, meldet das Gerät, welche Antwort es war und wie lange es sie gespielt hat. Gleiche Anmeldung wie oben, JSON-Body:

```json
{ "turn_id": "t_abcdefghijklmnop", "heard_seconds": 12.4 }
```

- `turn_id`: der letzte Pfadteil der `audio_url` dieser Antwort (`t_` und 16 Zeichen).
- `heard_seconds`: gespielte Sekunden, von 0 bis 3600.
- Das Gerät schickt die Meldung sofort nach dem Stopp, vor der nächsten Anfrage. Kommt sie erst nach der nächsten Frage oder dem nächsten Druck auf die Erzähltaste an, kann sie für diese nicht mehr gelten.

Antworten: `204` ohne Inhalt, auch wenn der Server mit der Meldung nichts anfangen kann (zum Beispiel eine angehaltene Antwort auf eine Frage). Falsche Felder: `400 {"error":"bad_request"}`; kein gültiges JSON: `400 {"error":"bad_json"}`. Falsche Anmeldung oder gesperrtes Gerät: `401`. Mehr als 60 Meldungen eines Geräts in 10 Minuten: `429 {"error":"rate_limited"}`. Die Route ruft weder Sprachmodell noch Sprachausgabe auf und zählt nicht zum Rate-Limit der Anfragen. Ohne Einwilligung der Eltern merkt sich der Server nichts; im Schlafmodus und in den Ruhezeiten schon (ein vorher begonnener Teil kann noch laufen).

Was der Server damit macht:

- War es ein Geschichtenteil, schätzt der Server, bis zu welchem Satz das Kind ihn ganz gehört hat (`server-api/stopp.ts`). Mit Ton-Strom kennt er die Sekunden je Absatz genau, dazu die Pausen von 0,9 s; sonst verteilt er die Tonlänge nach der Länge des Texts. Satzgrenzen wie bei der Pocket-Stimme. Kommt die Meldung, solange der Ton-Strom noch entsteht, gilt sie, sobald der Teil fertig ist.
- Danach geht die Geschichte an dieser Stelle weiter: Eine Idee über die Sprechtaste, „weiter“ über die Sprechtaste und die Erzähltaste erzählen **denselben Teil** ab der gehörten Stelle weiter, eine Idee mit der Idee. Die Folge rückt dabei nicht vor. Vorher war es der nächste Teil, angesetzt am Ende des ganzen Teils, den das Kind nicht ganz gehört hatte (vorläufig entschieden am 21.11.2026 für Erzähltaste und „weiter“; Punkt B2 nannte nur die Idee).
- Der vorbereitete nächste Teil (`prefetch.ts`) passt dann nicht: Nach einem Stopp wartet das Kind auf der Erzähltaste mindestens so lange wie ohne Vorbereitung. Läuft die Vorbereitung noch, kann sie die Sprachausgabe zusätzlich aufhalten (Einschätzung, nicht gemessen; Punkt N1121-0607-b).
- Eine Frage dazwischen ändert nichts an der Stelle. Ein neuer Geschichtenwunsch beginnt wie bisher eine neue Folge.
- Stopp erst im Abschluss („Wenn du wissen willst …“) oder danach: Das Kind hat alles gehört, es bleibt alles wie bisher. Im letzten Teil einer Folge merkt sich der Server nichts; eine Idee danach ist wie bisher der Wunsch für die nächste Folge.
- Fällt Claude beim neu erzählten Teil aus, kommt wie sonst der Satz „Kunibert muss kurz überlegen …“. Die Stelle bleibt, und der nächste Druck versucht es noch einmal ab dort. Bricht ein neu erzählter Teil im Ton-Strom ab, nachdem schon Absätze gesprochen wurden, kommen diese Absätze zur Stelle dazu. Bricht ein anderer Teil im Ton-Strom ab, nachdem schon Ton beim Kind war, gilt die alte Stelle nicht mehr.
- Ohne Meldung bleibt alles wie bisher. Der Pi-Client meldet den Stopp ab Teil 2 dieses Punkts; die Firmware noch nicht (eigener Punkt). `/v1/turn` (Web-Simulator) kennt die Meldung nicht.

Was der Server dafür im Arbeitsspeicher hält: den Text des zuletzt ausgelieferten Geschichtenteils (vom Server erzeugt), seine Tonlänge und den Stand der Geschichte vor diesem Teil. Dieser Stand enthält wie der gespeicherte Stand selbst den Wunsch des Kindes zur Folge (`wish`, höchstens 200 Zeichen). Den Text des Teils hält der Server 15 Minuten nach dem Ausliefern bereit; kam bis dahin keine Meldung, ist alles weg. Kam eine, bleiben nur die gehörten Sätze und der Stand davor, bis die Geschichte weitergeht, längstens 24 Stunden nach der Meldung. Abgelaufenes löscht der Server spätestens fünf Minuten nach der Frist aus dem Arbeitsspeicher. Gelöscht wird es außerdem mit dem Stand der Geschichte (Sperren, Widerruf, `POST /v1/eltern/geschichte-neu`, `DELETE /v1/eltern/daten`). An Claude geht zusätzlich nur der gehörte Text, den der Server selbst erzeugt hat. Das Protokoll bekommt je Meldung eine Zeile mit Zahlen, ohne Texte und Kennungen, zum Beispiel `Stopp per Taste: gemerkt teil=2/5 saetze=7/15`, `Stopp per Taste: ganz_gehoert teil=2/5` oder `Stopp per Taste: wartet` (Teil entsteht noch oder gehört nicht zur Geschichte).

### Einwilligung, Schlafmodus und Ruhezeiten (gilt für alle Geräte-Routen)

Seit 20.11.2026 (Punkt A1 der Arbeitsliste). Ohne Einwilligung der Eltern antworten `POST /v1/device/question`, `POST /v1/device/kunibert-story` und `POST /v1/turn` mit HTTP 200 und einem festen Hinweis („Bevor wir uns unterhalten, müssen mich deine Eltern einmal einrichten …“). Die Aufnahme geht dann nicht an die Spracherkennung, und nichts geht an das Sprachmodell. Dasselbe gilt im Schlafmodus und in den Ruhezeiten, dann mit dem Satz „Psst! Ritter Kunibert schläft gerade …“. Beide Sätze stehen in `server-api/eltern.ts`.

- Geräte-Routen: `{"type": …, "audio_url": …, "session_end": true}`, immer als ganze WAV-Datei (kein Ton-Strom); der Stand der Geschichte rückt nicht vor.
- `/v1/turn`: `kind: "hinweis"`, `fixed: "einwilligung"` oder `"schlaf"`; der mitgeschickte `story_state` kommt unverändert zurück.
- Geräte-Routen: Widerrufen die Eltern die Einwilligung oder beginnt der Schlafmodus, während eine Anfrage läuft, kommt statt der Antwort der feste Satz, und es bleibt kein Stand. Wird das Gerät dabei gesperrt: 401. Bei `/v1/device/question` prüft der Server das auch nach der Spracherkennung, vor dem Aufruf an das Sprachmodell. Ein Ton-Strom, den das Gerät schon abspielt, läuft zu Ende (Punkt N1120-0939-c). Ausnahme: `/v1/turn` prüft nur zu Beginn (Punkt N1120-1610-b der Arbeitsliste).
- Die Prüfung der Einwilligung ist standardmäßig an, mit `NODE_ENV=production` immer. Nur im Probelauf am Rechner (ohne `NODE_ENV=production`) lässt sie sich mit `KUNIBERT_EINWILLIGUNG_PRUEFEN=0` abschalten, zum Beispiel für den Web-Simulator.
- Ruhezeiten gelten in Berliner Zeit (vorläufig fest).

### `POST /v1/device/pairing-code`

Gleiche Anmeldung wie oben. Das Gerät ruft die Route auf, wenn beide Tasten 5 Sekunden gehalten werden (Pi-Client und Firmware: noch nicht umgesetzt, Punkt D1). Geht auch ohne Einwilligung und im Schlafmodus. Der Server erzeugt einen sechsstelligen Code (10 Minuten gültig, nur einmal einlösbar; ein neuer Code ersetzt den alten) und liefert ihn als Sprache (jede Ziffer als Wort, der Code zweimal, ohne Sprachmodell):

```json
{ "type": "pairing_code", "audio_url": "https://…/v1/device/audio/t_…", "expires_in": 600 }
```

Der Code steht nicht in der Antwort (auch nicht mit `KUNIBERT_DIAGNOSTIC_TEXT=1`) und nicht im Protokoll; das Gerät spielt die `audio_url` ab wie bei einer Antwort. Den Sprechtext mit dem Code bekommt die Sprachausgabe, mit `PICASTAI_TTS_PROVIDER=google` also Google. Die Route zählt zum Rate-Limit des Geräts.

## Eltern (Server-Teil der Eltern-App)

Die Eltern koppeln ihr Handy einmal mit dem Gerät. Danach hält ein Cookie `kb_eltern` das Eltern-Token (`HttpOnly`, `SameSite=Strict`, `Path=/v1/eltern`, 180 Tage; `Secure` mit `NODE_ENV=production` oder über HTTPS). Der Server speichert nur den SHA-256-Hash des Tokens, höchstens 5 je Gerät; das älteste fällt heraus. `POST` und `PUT` müssen `Content-Type: application/json` haben (sonst 415); `DELETE` braucht keinen Inhalt. Alle Antworten der angemeldeten Routen haben `Cache-Control: no-store`.

| Route | Wirkung |
| --- | --- |
| `POST /v1/eltern/koppeln` `{"code":"123456"}` | Code einlösen, Cookie setzen. Falscher oder abgelaufener Code: 400 `invalid_code`. Nach 10 Fehlversuchen je Absender oder 200 insgesamt in 10 Minuten: 429. |
| `GET /v1/eltern/status` | Aktueller Stand: `einwilligung {erteilt, zeitpunkt}`, `schlafmodus`, `ruhezeiten {von, bis}` oder `null` |
| `PUT /v1/eltern/einwilligung` | Einwilligung erteilen |
| `DELETE /v1/eltern/einwilligung` | Einwilligung widerrufen; Stand der Geschichte, Vorbereitung und wartendes Audio werden gelöscht |
| `PUT /v1/eltern/einstellungen` `{"schlafmodus":true, "ruhezeiten":{"von":"19:00","bis":"07:00"}}` | Schlafmodus und Ruhezeiten (Felder einzeln möglich; `ruhezeiten: null` löscht sie). Ungültige Werte und gleicher Beginn und gleiches Ende: 400 `invalid_settings` |
| `POST /v1/eltern/geschichte-neu` | Löscht den Stand der Geschichte samt Gedächtnis der letzten Folgen und den vorbereiteten Teil: Die nächste Erzählung beginnt eine neue Folge wie beim ersten Mal |
| `DELETE /v1/eltern/daten` | Alles löschen: Einwilligung, Einstellungen, alle Eltern-Tokens des Geräts, Kopplungscodes, Geschichte, wartendes Audio. Das Cookie wird gelöscht. Die Geräte-Anmeldung bleibt. |

Ohne gültiges Cookie oder für ein gesperrtes Gerät: 401. Es gibt keinen Verlauf, keine Mitschriften und keine Statistik je Kind. Vorläufig liegt alles nur im Arbeitsspeicher (dauerhaft: Punkt E2): Nach einem Neustart des Servers müssen die Eltern neu koppeln und neu einwilligen. Die Weboberfläche unter `/eltern` kommt später (Punkt D2). Hinter Caddy (`deploy/Caddyfile`) sind `/v1/eltern/*` und `/api/*` von außen gesperrt; bis D2 erreicht man sie nur auf dem Server selbst oder im eigenen WLAN.

Für Tests mit Erwachsenen, solange die Geräte den Code noch nicht sprechen: `POST /api/devices/:id/kopplungscode` (Betreiber-Token) gibt den Code als Text zurück: `{"code":"123456","expires_in":600}`. Das Skript `deploy/eltern-einwilligung.mjs` koppelt damit und willigt ein (nach jedem Neustart des Servers; Aufruf in `deploy/EINRICHTUNG.md`, Abschnitt 5, und in `pi-client/README.md`).

## Fehlerantworten

| Status | Body | Bedeutung für den Client |
| --- | --- | --- |
| 400 | `bad_audio`, `unsupported_audio_format`, `audio_required`, `bad_upload`, `bad_json`, `unsupported_length`, `bad_request` (z. B. ungültig kodierter Pfad) | Anfrage fehlerhaft, nicht wiederholen |
| 401 | `unauthorized` | Gerät unbekannt, widerrufen oder Token falsch |
| 413 | `audio_too_large`, `payload_too_large` | Aufnahme über 2 MB, nicht wiederholen |
| 429 | `rate_limited` | Rate-Limit pro Gerät erreicht |
| 503 | `voice_provider_failed` mit `retryable: true` | Sprachdienst vorübergehend gestört, Wiederholen sinnvoll; der Story-Zustand rückt nicht vor |
| 502 | `voice_provider_failed` mit `retryable: false` | Sprachdienst dauerhaft fehlerhaft (z. B. ungültiger Schlüssel); der Pi-Client wiederholt nicht |
| 500 | `internal_error` | Unerwarteter Fehler, ohne Fehlertext nach außen |

## Betrieb hinter einem Proxy

Terminiert ein Reverse Proxy (nginx, Caddy, Cloud Run) das HTTPS, sieht der Node-Server nur `http` und den Host des Proxys. Die `audio_url` in der Antwort würde dann mit `http://` oder einem internen Host beginnen, und der Pi-Client lehnt sie ab, weil Schema und Host nicht zu seiner API-Adresse passen. Zwei Wege:

- **`PICASTAI_PUBLIC_BASE_URL=https://kunibert.example`** (empfohlen): Der Server baut die `audio_url` aus diesem Ursprung, unabhängig von Headern. Pfad, Query und Zugangsdaten sind nicht erlaubt; Schreibweise und Port übernimmt der Server, wie sie dort stehen. Der Pi-Client vergleicht Schema, Host (ohne Beachtung der Groß-/Kleinschreibung) und effektiven Port, sodass `https://picastAI.com` und `https://picastai.com:443` als derselbe Ursprung gelten.
- **`PICASTAI_TRUST_PROXY=1`** (Anzahl der Proxy-Hops, oder `true`/`loopback`): Der Server glaubt `X-Forwarded-Proto`. Der Proxy muss dann den Host-Header mit durchreichen (nginx: `proxy_set_header Host $host;`).

Für den echten Betrieb außerdem `NODE_ENV=production` setzen (und vorher `npm run build` ausführen). Ohne diese Einstellung sind Entwicklungsgeräte mit bekannten Tokens aktiv; der Server warnt beim Start.

## Konfiguration

In `.env` oder der vom Prozess geladenen Umgebung:

```ini
PORT=3000
HOST=0.0.0.0
PICASTAI_PUBLIC_BASE_URL=https://dein-exakter-host.example
PICASTAI_ADMIN_TOKEN=<mindestens-32-zufaellige-Zeichen>
PICASTAI_CORS_ORIGINS=https://dein-exakter-frontend-host.example
PICASTAI_DEVICE_ID=prototype-001
PICASTAI_DEVICE_TOKEN=ein-langer-nicht-oeffentlicher-token
PICASTAI_DEVICE_NAME=picastAI Raspberry-Pi-Prototyp
KUNIBERT_DIAGNOSTIC_TEXT=0
# Sprachmodell für Antworten und Geschichten (Claude): docs/LLM-Anbieter.md
PICASTAI_LLM_PROVIDER=anthropic
# Spracherkennung und Sprachausgabe: eigener Sprachserver, Namen nach dem Herunterladen eintragen
PICASTAI_STT_URL=http://127.0.0.1:8000/v1
PICASTAI_STT_MODEL=
PICASTAI_TTS_URL=http://127.0.0.1:8000/v1
PICASTAI_TTS_MODEL=
PICASTAI_TTS_VOICE=
# Alternative Sprachausgabe: Google Cloud Text-to-Speech (PICASTAI_TTS_PROVIDER=google, PR #14), siehe docs/LLM-Anbieter.md
PICASTAI_VOICE_TIMEOUT_MS=90000
```

Die Token-Datei beziehungsweise Prozessumgebung darf nur für den Serverdienst lesbar sein. Nicht in Git, Screenshots oder Logs eintragen.

`PICASTAI_ADMIN_TOKEN` schützt `GET/POST /api/devices`, `POST /api/devices/:id/revoke`, `POST /api/devices/:id/kopplungscode` sowie `GET /api/config` und `GET /api/status` per `Authorization: Bearer <admin-token>`. Fehlt das Token oder ist es kürzer als 32 Zeichen, antworten diese Routen geschlossen mit HTTP 503. Ein falsches oder fehlendes Token ergibt HTTP 401. Das Dashboard hält das eingegebene Token nur im Tab-Speicher; es muss ausschließlich über HTTPS verwendet werden.

`PICASTAI_CORS_ORIGINS` enthält eine kommagetrennte Liste exakter Browser-Origin-Werte, zum Beispiel `https://kunibert.example,https://www.kunibert.example`. Leer bedeutet: keine Cross-Origin-Freigabe; Same-Origin-Aufrufe und Pi-/Server-zu-Server-Aufrufe benötigen keine CORS-Freigabe. Keine Wildcards für Produktionszugriffe eintragen.

Die Datei `firestore.rules` verweigert direkte Zugriffe aller Firebase-Clients. Das Server-Admin-SDK umgeht Firestore-Regeln; serverseitige API-Routen müssen deshalb separat authentifiziert sein.

Für eine Produktionsumgebung sollte der Token nicht als einzelne globale Umgebungsvariable, sondern über einen Secret-Manager provisioniert werden. Standardmäßig ist die Geräteregistry flüchtig; ein Serverneustart entfernt die über das Dashboard angelegten Geräte. Mit `PICASTAI_DEVICE_STORE=firestore` wird sie dauerhaft in der Firestore-Collection `devices` geführt (nur der SHA-256-Hash des Tokens, nie der Token selbst):

- Beim Start lädt der Server die Geräteliste. Ist Firestore dann nicht erreichbar, startet er nicht (fail-closed), damit widerrufene Geräte nicht wieder gültig werden.
- `POST /api/devices` speichert das Gerät, bevor es den Token ausgibt; schlägt das Speichern fehl, antwortet die API mit `503 {"error":"device_store_unavailable"}` und legt nichts an.
- `POST /api/devices/:id/revoke` wirkt sofort im Speicher und antwortet mit `{"success":true,"persisted":true|false}`. Bei `persisted:false` war Firestore nicht erreichbar; der Widerruf gilt bis zum nächsten Neustart und sollte dann wiederholt werden.
- Ein gespeicherter Widerruf gilt auch für per Umgebung provisionierte Geräte. Soll ein widerrufenes Gerät wieder zugelassen werden, ist eine neue Geräte-ID oder das Löschen des Firestore-Dokuments nötig. `POST /api/devices` mit einer widerrufenen ID antwortet deshalb mit HTTP 400 und lässt das Gerät nicht wieder zu.
- Das Admin-SDK benötigt Zugangsdaten (z. B. Application Default Credentials) mit Schreib-/Leserecht auf Firestore.

## Lokaler Test

```bash
npm install
export PICASTAI_DEVICE_ID=prototype-001
export PICASTAI_DEVICE_TOKEN=test-token-kunibert-2026
export KUNIBERT_DIAGNOSTIC_TEXT=1
# Ohne Kopplung (nur ohne NODE_ENV=production): sonst kommt nur der feste Hinweis zur Einwilligung
export KUNIBERT_EINWILLIGUNG_PRUEFEN=0
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

Die `audio_url` aus der Antwort mit denselben Authentifizierungsheadern abrufen. Da der AudioStore einmalig ausliefert, den Audioabruf nicht mehrfach wiederholen. Mit konfiguriertem TTS-Provider enthält die WAV-Antwort echte Sprachsynthese; ohne Provider wird für lokale Tests das deterministische Fallback-Signal ausgeliefert. Schlägt die Synthese bei konfiguriertem Provider fehl, liefert der Server kein Ersatzsignal, sondern `503 {"error":"voice_provider_failed","retryable":true}` (vorübergehender Fehler, der Client wiederholt) bzw. `502` mit `retryable:false`. Der Story-Zustand rückt in diesem Fall nicht vor.

**Zeitbudget:** Der Server hält für eine Anfrage (Erkennung, bis zu zwei Sprachmodell-Aufrufe, Sprachausgabe) ein gemeinsames Budget von 120 Sekunden ein. Das gilt auch, wenn eine Frage als Geschichtenwunsch erkannt wird und deshalb zwei Sprachmodell-Aufrufe nötig sind. Ist das Budget knapp, startet der Server keinen weiteren Sprachmodell-Aufruf mehr und spricht den festen Ersatztext; läuft die Sprachausgabe in die Frist, folgt `503 voice_provider_failed` mit `retryable: true` (siehe Fehlertabelle oben). Die Grenzen davor und danach (Caddy 130 s, Pi-Client 140 s) bleiben unverändert (`deploy/EINRICHTUNG.md`, „Zeitkette“). Die Sicherheitsweiche bleibt vom Budget unberührt.

## Sicherheitsgrenzen des Prototyps

- Rate-Limit pro Gerät: standardmäßig 30 Anfragen pro 10 Minuten.
- Feste Sprechtexte (Sicherheitshinweis, „nicht verstanden“, Fehlerhinweis, Pausensatz der Geschichte, die festen Ersatzantworten ohne Sprachmodell) werden nach der ersten Synthese im Speicher gehalten. In Produktion bereitet der Server sieben davon beim Start vor (die ersten vier, die allgemeine Ersatzantwort und die beiden Hinweise ohne Einwilligung und im Schlafmodus, `server.ts`) und versucht es gut sechs Minuten lang wieder, wenn der Sprachserver noch nicht bereit ist. Gespeichert werden nur diese festen Texte, nie Äußerungen von Kindern.
- Fehlermeldungen der Sprachdienste und von Anthropic kommen nur als HTTP-Status mit Fehlercode ins Protokoll (zum Beispiel `HTTP 422 (string_too_long)`), nie mit ihrem Fließtext: Der kann den gesendeten Text enthalten (`server-api/provider-errors.ts`).
- Audio nur im flüchtigen RAM, TTL standardmäßig 120 Sekunden.
- Audio-URL benötigt erneut Geräteauthentifizierung.
- Story-State, Rate-Limit und Audio sind im Prozessspeicher, nicht hochverfügbar. Die Geräteliste ist es nur ohne `PICASTAI_DEVICE_STORE=firestore`. Der Story-State verfällt 24 Stunden nach der letzten Nutzung, ebenso der zuletzt erzählte Teil für den Stopp per Taste; `GET /api/status` zeigt nur die Anzahl (`storyStates`, `storyPrefetches`, `storyStops`, `eltern`), keine Geräte-IDs und keine Inhalte.
- Einwilligung, Schlafmodus, Ruhezeiten, Kopplungscodes und Eltern-Tokens liegen vorläufig nur im Arbeitsspeicher (dauerhaft: Punkt E2 der Arbeitsliste). Nach einem Neustart hört jedes Gerät nur den festen Hinweis, bis die Eltern neu einwilligen.
- Geräteverwaltung, Status und sichere Konfigurationsübersicht benötigen ein starkes Admin-Bearer-Token.
- CORS akzeptiert nur exakt konfigurierte Browser-Ursprünge; ohne Allowlist gibt es keine Cross-Origin-Freigabe.
- Firestore-Regeln verweigern direkte Clientzugriffe; serverseitige Admin-SDK-Zugriffe sind hiervon nicht erfasst.
- HTTPS muss durch Reverse Proxy oder TLS-fähige Node-Konfiguration bereitgestellt werden.
- STT-/TTS-Audio wird nur zur Laufzeit an den konfigurierten Provider übertragen; Aufbewahrung und Anbieter-Datenfluss müssen vor Kinderbetrieb rechtlich und organisatorisch geprüft werden.
