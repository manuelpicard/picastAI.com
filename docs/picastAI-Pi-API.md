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

Erlaubte Zeichen (seit 25.11.2026, Punkt N1123-1937-a): im Token Buchstaben, Ziffern und `. _ ~ + / = : -` (so prüfen Installer und Pi-Client; die Tokens des Servers, `tok_` mit Base64url, und `openssl rand -hex 32` passen). In der Geräte-ID sichtbare ASCII-Zeichen ohne Leerzeichen; neue Geräte legt der Server nur mit Buchstaben, Ziffern, `-` und `_` an (höchstens 80 Zeichen). Der Pi-Client prüft beides beim Start und nennt den Wert nie. Die Firmware lehnt bisher nur Steuerzeichen und Leerzeichen ab (Punkt N1125-1338-a).

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

Die Story-Session wird für die Gerät-ID ausschließlich flüchtig im RAM gehalten. Turntexte und Storyzustände werden von den Geräte- und Turn-Endpunkten nicht in Firestore gespeichert. Nach einem Serverneustart beginnt die Story-Session neu. Sie verfällt außerdem 24 Stunden nach der letzten Nutzung (vorläufig, Maßnahme M9 der Datenschutz-Folgenabschätzung, seit 20.11.2026): Dann beginnt die nächste Erzählung eine neue Folge, und auch das Gedächtnis der letzten Folgen ist weg. Abgelaufenes löscht der Server spätestens fünf Minuten später aus dem Arbeitsspeicher, auch bei Geräten, die sich nicht mehr melden. Sperrt der Betreiber ein Gerät (`POST /api/devices/:id/revoke`), löscht der Server sofort dessen Stand, den vorbereiteten nächsten Teil, die gemerkte Stelle nach einem Stopp per Taste, wartendes Audio und die Eltern-Steuerung (Einwilligung, Einstellungen, Kopplungscodes, Eltern-Tokens, auch in der Datei der Eltern-Steuerung), mit Firestore schon vor dem Speichern des Widerrufs. Anfragen, die beim Sperren noch laufen, geben danach nichts mehr an das Sprachmodell, legen weder Stand noch Audio ab und antworten mit 401 (seit 22.11.2026 auch `/v1/turn`, Punkt N1120-1610-b). Ein Ton-Strom, den das Gerät schon abspielt, läuft zu Ende; danach rückt die Geschichte nicht vor, und es wird nichts vorbereitet. Ein Aufruf an das Sprachmodell, der vor dem Sperren begann, läuft zu Ende (Abbrechen ist Punkt N1120-0939-c). Danach folgt kein weiterer Aufruf: keine Wiederholung bei 429 oder 5xx (`server-api/llm.ts`), kein Geschichtenaufruf nach der Einordnung, kein zweiter Versuch, auch nicht bei einer Vorbereitung im Hintergrund. Die Antwort enthält eine kurzlebige Audio-URL:

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

Zeitgrenzen im Strom (seit 26.11.2026, Punkt N1124-1153-b): Die Vertonung des ersten Absatzes bekommt höchstens den Rest des Zeitbudgets der Anfrage (120 s), mindestens 5 s. Läuft sie hinein, antwortet der Server wie ohne Strom mit 503 `voice_provider_failed` und `retryable: true`. So bleibt die Antwort auf den POST, der den Strom beginnt, in der Zeitkette (Server 120 s, Caddy 130 s, Gerät 140 s). Eine neue Anfrage desselben Geräts wartet, bis ein alter Strom fertig vertont ist (siehe unten), aber höchstens 30 s und nie so lange, dass weniger als 45 s vom Budget bleiben (seit 26.11.2026, Punkt N1126-1338-f). Ist der alte Strom dann nicht fertig, verwirft ihn der Server: Er vertont nichts mehr, und weder sein Stand noch eine gehörte Stelle werden gespeichert. Die neue Anfrage arbeitet mit dem Stand davor. Meldet das Gerät einen Stopp (`POST /v1/device/playback-stopped`) für einen Strom, der noch entsteht, vertont der Server den Rest gar nicht mehr; dann muss die nächste Anfrage nur noch warten, bis Claude den Teil fertig geschrieben hat. Spätere Absätze entstehen, während das Gerät schon spielt; für sie gilt nur die Grenze je Aufruf der Sprachausgabe (`PICASTAI_VOICE_TIMEOUT_MS`, Standard 90 s). Zwischen zwei Absätzen kann der Strom deshalb lange ohne neue Daten sein. Der Pi-Client hört nach 45 s ohne neue Daten auf zu lesen (`KUNIBERT_AUDIO_TIMEOUT`); was der Server danach noch liefert, hört das Kind nicht (offen: Punkt N1126-1338-e).

Schlägt der Ausgabe-Check mitten im Teil an (oder bricht Claude ab, nachdem schon ein Absatz gesprochen wurde), wird der betroffene Absatz nie gesprochen. Kunibert sagt „Kunibert muss kurz überlegen …“, und die Folge rückt nicht vor; der nächste Druck erzählt den Teil neu, und beim nächsten Ausfall greift wie bisher die Ersatzfolge. Trifft es schon den ersten Absatz, ist noch nichts gesprochen: Dann schreibt Claude den Teil ohne Strom ein zweites Mal.

Fragen, feste Texte, Ersatzgeschichten und vorbereitete Teile (`prefetch.ts`) kommen auch mit eingeschaltetem Strom als ganze Datei; `audio_stream` fehlt dann. Kommt eine neue Anfrage desselben Geräts, solange ein Strom noch im Hintergrund entsteht, wartet der Server auf dessen Stand (begrenzt, siehe „Zeitgrenzen im Strom“).

### `POST /v1/device/playback-stopped`

Seit 21.11.2026 (Punkt B2 der Arbeitsliste). Hält das Kind Kunibert per Taste an, meldet das Gerät, welche Antwort es war und wie lange es sie gespielt hat. Gleiche Anmeldung wie oben, JSON-Body:

```json
{ "turn_id": "t_abcdefghijklmnop", "heard_seconds": 12.4 }
```

- `turn_id`: der letzte Pfadteil der `audio_url` dieser Antwort (`t_` und 16 Zeichen).
- `heard_seconds`: gespielte Sekunden, von 0 bis 3600.
- Das Gerät schickt die Meldung sofort nach dem Stopp, vor der nächsten Anfrage. Kommt sie erst nach der nächsten Frage oder dem nächsten Druck auf die Erzähltaste an, kann sie für diese nicht mehr gelten.

Antworten: `204` ohne Inhalt, auch wenn der Server mit der Meldung nichts anfangen kann (zum Beispiel eine angehaltene Antwort auf eine Frage). Falsche Felder: `400 {"error":"bad_request"}`; kein gültiges JSON: `400 {"error":"bad_json"}`. Falsche Anmeldung oder gesperrtes Gerät: `401`. Mehr als 60 Meldungen eines Geräts in 10 Minuten: `429 {"error":"rate_limited"}`. Die Route ruft weder Sprachmodell noch Sprachausgabe auf und zählt nicht zum Rate-Limit der Anfragen. Ohne Einwilligung der Eltern merkt sich der Server nichts; im Schlafmodus und in den Ruhezeiten schon (ein vorher begonnener Teil kann noch laufen).

Was der Server damit macht:

- War es ein Geschichtenteil, schätzt der Server, bis zu welchem Satz das Kind ihn ganz gehört hat (`server-api/stopp.ts`). Mit Ton-Strom kennt er die Sekunden je Absatz genau, dazu die Pausen von 0,9 s; sonst verteilt er die Tonlänge nach der Länge des Texts. Satzgrenzen wie bei der Pocket-Stimme. Kommt die Meldung, solange der Ton-Strom noch entsteht, vertont der Server den Rest des Teils nicht mehr (seit 26.11.2026). Sie gilt, sobald Claude den Teil fertig geschrieben hat; die nicht vertonten Absätze liegen hinter der gehörten Stelle.
- Danach geht die Geschichte an dieser Stelle weiter: Eine Idee über die Sprechtaste, „weiter“ über die Sprechtaste und die Erzähltaste erzählen **denselben Teil** ab der gehörten Stelle weiter, eine Idee mit der Idee. Die Folge rückt dabei nicht vor. Vorher war es der nächste Teil, angesetzt am Ende des ganzen Teils, den das Kind nicht ganz gehört hatte (vorläufig entschieden am 21.11.2026 für Erzähltaste und „weiter“; Punkt B2 nannte nur die Idee).
- Der vorbereitete nächste Teil (`prefetch.ts`) passt dann nicht: Nach einem Stopp wartet das Kind auf der Erzähltaste mindestens so lange wie ohne Vorbereitung. Läuft die Vorbereitung noch, kann sie die Sprachausgabe zusätzlich aufhalten (Einschätzung, nicht gemessen; Punkt N1121-0607-b).
- Eine Frage dazwischen ändert nichts an der Stelle. Ein neuer Geschichtenwunsch beginnt wie bisher eine neue Folge.
- Stopp erst im Abschluss („Wenn du wissen willst …“) oder danach: Das Kind hat alles gehört, es bleibt alles wie bisher. Im letzten Teil einer Folge merkt sich der Server nichts; eine Idee danach ist wie bisher der Wunsch für die nächste Folge.
- Fällt Claude beim neu erzählten Teil aus, kommt wie sonst der Satz „Kunibert muss kurz überlegen …“. Die Stelle bleibt, und der nächste Druck versucht es noch einmal ab dort. Bricht ein neu erzählter Teil im Ton-Strom ab, nachdem schon Absätze gesprochen wurden, kommen diese Absätze zur Stelle dazu. Das Gerät spielt den Strom dann oft noch: Hält das Kind ihn danach an, gilt die Meldung zu diesem Strom, und es zählen nur die Sätze, die bis zum Stopp ganz gesprochen waren (seit 22.11.2026). Bricht ein anderer Teil im Ton-Strom ab, nachdem schon Ton beim Kind war, gilt die alte Stelle nicht mehr.
- Ohne Meldung bleibt alles wie bisher. Der Pi-Client meldet den Stopp seit 21.11.2026 (abschaltbar mit `KUNIBERT_STOP_REPORT=0`, siehe `pi-client/README.md`); die gespielten Sekunden zählt er an den Samples, die er an die Soundkarte geschrieben hat. Die Firmware meldet ihn noch nicht (Punkt N1121-0607-a). `/v1/turn` (Web-Simulator) kennt die Meldung nicht.

Was der Server dafür im Arbeitsspeicher hält: den Text des zuletzt ausgelieferten Geschichtenteils (vom Server erzeugt), seine Tonlänge und den Stand der Geschichte vor diesem Teil. Dieser Stand enthält wie der gespeicherte Stand selbst den Wunsch des Kindes zur Folge (`wish`, höchstens 200 Zeichen). Den Text des Teils hält der Server 15 Minuten nach dem Ausliefern bereit; kam bis dahin keine Meldung, ist alles weg. Kam eine, bleiben nur die gehörten Sätze und der Stand davor, bis die Geschichte weitergeht, längstens 24 Stunden nach der letzten Meldung (oder nach dem Abbruch eines neu erzählten Teils). Abgelaufenes löscht der Server spätestens fünf Minuten nach der Frist aus dem Arbeitsspeicher. Gelöscht wird es außerdem mit dem Stand der Geschichte (Sperren, Widerruf, `POST /v1/eltern/geschichte-neu`, `DELETE /v1/eltern/daten`). An Claude geht zusätzlich nur der gehörte Text, den der Server selbst erzeugt hat. Das Protokoll bekommt je Meldung eine Zeile mit Zahlen, ohne Texte und Kennungen, zum Beispiel `Stopp per Taste: gemerkt teil=2/5 saetze=7/15`, `Stopp per Taste: ganz_gehoert teil=2/5` oder `Stopp per Taste: wartet` (Teil entsteht noch oder gehört nicht zur Geschichte).

### Einwilligung, Schlafmodus und Ruhezeiten (gilt für alle Geräte-Routen)

Seit 20.11.2026 (Punkt A1 der Arbeitsliste). Ohne Einwilligung der Eltern antworten `POST /v1/device/question`, `POST /v1/device/kunibert-story` und `POST /v1/turn` mit HTTP 200 und einem festen Hinweis („Bevor wir uns unterhalten, müssen mich deine Eltern einmal einrichten …“). Die Aufnahme geht dann nicht an die Spracherkennung, und nichts geht an das Sprachmodell. Dasselbe gilt im Schlafmodus und in den Ruhezeiten, dann mit dem Satz „Psst! Ritter Kunibert schläft gerade …“. Beide Sätze stehen in `server-api/eltern.ts`.

- Geräte-Routen: `{"type": …, "audio_url": …, "session_end": true}`, immer als ganze WAV-Datei (kein Ton-Strom); der Stand der Geschichte rückt nicht vor.
- `/v1/turn`: `kind: "hinweis"`, `fixed: "einwilligung"` oder `"schlaf"`; der mitgeschickte `story_state` kommt unverändert zurück.
- Alle drei Routen: Widerrufen die Eltern die Einwilligung oder beginnt der Schlafmodus, während eine Anfrage läuft, kommt statt der Antwort der feste Satz, und es bleibt kein Stand. Wird das Gerät dabei gesperrt: 401. Der Server prüft das vor jedem Aufruf an das Sprachmodell: nach der Spracherkennung, an der Erzähltaste nach dem Warten auf eine Vorbereitung, zwischen Einordnung und Geschichte, vor einem zweiten Versuch und vor einer Wiederholung (seit 22.11.2026, auch bei `/v1/turn`, Punkt N1120-1610-b). Ein Aufruf, der schon läuft, läuft zu Ende. Ein Ton-Strom, den das Gerät schon abspielt, läuft zu Ende (Punkt N1120-0939-c). Danach gilt: ohne Einwilligung kein Stand; im Schlafmodus rückt die Geschichte vor (das Kind hat den Teil gehört), aber der nächste Teil wird nicht vorbereitet. Beginnt der Schlafmodus, während der Server einen Teil vorbereitet, verwirft er die Vorbereitung.
- Die Prüfung der Einwilligung ist standardmäßig an, mit `NODE_ENV=production` immer. Nur im Probelauf am Rechner (ohne `NODE_ENV=production`) lässt sie sich mit `KUNIBERT_EINWILLIGUNG_PRUEFEN=0` abschalten, zum Beispiel für den Web-Simulator.
- Ruhezeiten gelten in Berliner Zeit (vorläufig fest).

### `POST /v1/device/pairing-code`

Gleiche Anmeldung wie oben. Das Gerät ruft die Route auf, wenn beide Tasten 5 Sekunden gehalten werden (Pi-Client und Firmware: noch nicht umgesetzt, Punkt D1). Geht auch ohne Einwilligung und im Schlafmodus. Der Server erzeugt einen sechsstelligen Code (10 Minuten gültig, nur einmal einlösbar; ein neuer Code ersetzt den alten) und liefert ihn als Sprache (jede Ziffer als Wort, der Code zweimal, ohne Sprachmodell):

```json
{ "type": "pairing_code", "audio_url": "https://…/v1/device/audio/t_…", "expires_in": 600 }
```

Der Code steht nicht in der Antwort (auch nicht mit `KUNIBERT_DIAGNOSTIC_TEXT=1`) und nicht im Protokoll; das Gerät spielt die `audio_url` ab wie bei einer Antwort. Den Sprechtext mit dem Code bekommt die Sprachausgabe, mit `PICASTAI_TTS_PROVIDER=google` also Google. Die Route zählt zum Rate-Limit des Geräts.

## Eltern (Server-Teil der Eltern-App)

Die Eltern koppeln ihr Handy einmal mit dem Gerät. Danach hält ein Cookie `kb_eltern` das Eltern-Token (`HttpOnly`, `SameSite=Strict`, `Path=/v1/eltern`, 180 Tage; `Secure`, wenn die Anfrage über HTTPS kam (direkt oder laut `X-Forwarded-Proto`) und im Betrieb (`NODE_ENV=production`) bei jeder Verbindung von diesem Rechner, also hinter Caddy immer. Im Betrieb fehlt `Secure` nur bei `http` direkt von einem anderen Rechner, für den Test im eigenen WLAN: Sonst behielte der Browser das Cookie nicht. Ohne `NODE_ENV=production` fehlt es bei jedem `http` ohne `X-Forwarded-Proto: https`. Seit 23.11.2026, vorläufig, Punkt D2, `parentCookieSecure` in `server-api/http-utils.ts`). Der Server speichert nur den SHA-256-Hash des Tokens, höchstens 5 je Gerät; das älteste fällt heraus. `POST` und `PUT` müssen `Content-Type: application/json` haben (sonst 415); `DELETE` braucht keinen Inhalt. Alle Antworten der angemeldeten Routen haben `Cache-Control: no-store`.

| Route | Wirkung |
| --- | --- |
| `POST /v1/eltern/koppeln` `{"code":"123456"}` | Code einlösen, Cookie setzen. Falscher oder abgelaufener Code: 400 `invalid_code`. Zu viele Fehlversuche: 429 `{"error":"rate_limited","warten_sekunden":8,"grund":"absender"}` und Kopf `Retry-After` (Sekunden); in dieser Zeit prüft der Server keinen Code, auch keinen richtigen. Regeln unten („Schutz vor dem Raten“). |
| `GET /v1/eltern/status` | Aktueller Stand: `einwilligung {erteilt, zeitpunkt, elterntextVersion, weg}`, `schlafmodus`, `ruhezeiten {von, bis}` oder `null`. Bei der Einwilligung steht nur der letzte Stand: `erteilt` sagt, ob sie gerade gilt (`false`, solange alle Einwilligungen ruhen, Abschnitt „Dauerhaft“ unten); `zeitpunkt` ist der Zeitpunkt der letzten Änderung (Erteilung oder Widerruf), `elterntextVersion` die Version des Elterntexts in diesem Moment (`"0"`: noch kein Elterntext, nur Tests mit Erwachsenen; `ELTERNTEXT_VERSION` in `server-api/eltern.ts`), `weg` wer die letzte Änderung gemacht hat: `"geraet"` (ein Handy, dessen Kopplungscode das Gerät sprach), `"betreiber"` (ein Handy mit Code über die Betreiber-Route, unten) oder `"server"` (der Server hat beim Start alle Einwilligungen widerrufen, unten). Nie entschieden: alles `null`, `erteilt: false`. |
| `PUT /v1/eltern/einwilligung` | Einwilligung erteilen |
| `DELETE /v1/eltern/einwilligung` | Einwilligung widerrufen; Stand der Geschichte, Vorbereitung und wartendes Audio werden gelöscht. Der Widerruf bleibt als letzter Stand stehen (mit Zeitpunkt). |
| `PUT /v1/eltern/einstellungen` `{"schlafmodus":true, "ruhezeiten":{"von":"19:00","bis":"07:00"}}` | Schlafmodus und Ruhezeiten (Felder einzeln möglich; `ruhezeiten: null` löscht sie). Ungültige Werte und gleicher Beginn und gleiches Ende: 400 `invalid_settings` |
| `POST /v1/eltern/geschichte-neu` | Löscht den Stand der Geschichte samt Gedächtnis der letzten Folgen und den vorbereiteten Teil: Die nächste Erzählung beginnt eine neue Folge wie beim ersten Mal |
| `DELETE /v1/eltern/daten` | Alles löschen: Einwilligung, Einstellungen, alle Eltern-Tokens des Geräts, Kopplungscodes, Geschichte, wartendes Audio, auch in der Datei der Eltern-Steuerung (unten). Das Cookie wird gelöscht. Die Geräte-Anmeldung bleibt. |

### Schutz vor dem Raten von Kopplungscodes

Seit 23.11.2026 (vorläufig, Punkt D2, `server-api/kopplungsschutz.ts`):

- Je Absender: Nach dem dritten Fehlversuch wartet ein Absender 2 Sekunden, nach jedem weiteren doppelt so lange, höchstens 10 Minuten (`grund: "absender"`). Es gibt keine harte Sperre; ein Absender bremst nur sich selbst. Je 10 Minuten ohne Fehlversuch zählt einer weniger: Wer sich einmal vertippt, ist nach 10 Minuten vergessen; wer rät und Pause macht, fängt nicht wieder bei null an (höchstens rund 160 Versuche am Tag, `server-api/kopplungsschutz.test.ts`).
- Absender ist die IPv4-Adresse oder bei IPv6 das Netz aus den ersten 56 Bit (oft ein Anschluss). Im Mobilfunk und hinter Carrier-NAT (zum Beispiel DS-Lite) teilen sich auch fremde Kunden einen Absender und damit die Wartezeit. Hinter Caddy stimmt die Adresse nur mit `PICASTAI_TRUST_PROXY=loopback` (Abschnitt „Betrieb hinter einem Proxy“).
- Insgesamt: höchstens 200 Fehlversuche aller Absender in 10 Minuten (`grund: "insgesamt"`). Darüber darf ein Absender nur noch den Code eines Geräts einlösen, das in den letzten 10 Minuten aus seinem Netz einen Code geholt hat (`POST /v1/device/pairing-code`). Ein anderer Code, auch ein gültiger, zählt dann wie ein falscher (400) und bleibt gültig. So sperrt ein Angriff mit vielen Adressen die Eltern im WLAN des Geräts nicht aus, und ein eigenes Gerät in vielen Netzen hilft nicht beim Raten fremder Codes. Die Ausnahme greift nur, wenn Handy und Gerät nach außen dieselbe IPv4-Adresse oder dasselbe IPv6-Netz zeigen: nicht, wenn das Handy über IPv6 kommt und das Gerät über IPv4 (möglich, sobald der Server einen AAAA-Eintrag hat) oder das Handy über Mobilfunk. Über die Betreiber-Route gibt es sie nicht.
- Im Arbeitsspeicher liegen keine Adressen, nur Pseudonyme (HMAC-SHA-256 mit einem zufälligen Schlüssel, der bei jedem Start neu ist), die Zahl der Fehlversuche und der Zeitpunkt des letzten, für die Netze der Geräte dazu die Geräte-ID (bis 10 Minuten nach dem letzten Code, den das Gerät aus diesem Netz geholt hat, dazu bis zu 5 Minuten bis zum Aufräumen). Mit dem Schlüssel ließen sich die Pseudonyme durch Ausprobieren zurückrechnen: Es ist Pseudonymisierung, keine Anonymisierung. Ein Absender bleibt höchstens so viele mal 10 Minuten im Speicher, wie er Fehlversuche hat (bei einem Rater gut zwei Stunden), dazu bis zu 5 Minuten bis zum Aufräumen. Nichts davon kommt ins Protokoll; `GET /api/status` zeigt unter `kopplungsschutz` nur Zahlen.

Ohne gültiges Cookie oder für ein gesperrtes Gerät: 401. Es gibt keinen Verlauf, keine Mitschriften und keine Statistik je Kind.

### Seite für Eltern: `GET /eltern`

Seit 24.11.2026 (vorläufig, Punkt D2, Teil 2 von 3; `server-api/eltern-seite.html`, `server-api/eltern-seite.ts`). Eine Seite für das Handy: mit dem Code koppeln, Einwilligung erteilen und widerrufen, den Stand sehen (Einwilligung, Schlafmodus, Ruhezeiten). Schlafmodus und Ruhezeiten ändern, „Geschichte neu“, „alles löschen“ und eine Infoseite kommen mit Teil 3; bis dahin gehen sie nur über die Routen oben. Bei `429` zeigt die Seite die Wartezeit (`warten_sekunden`, sonst `Retry-After`) und sperrt den Knopf so lange; bei `grund: "insgesamt"` rät sie, das Handy ins WLAN des Geräts zu bringen und einen neuen Code sagen zu lassen, und sagt, dass das nicht immer hilft. Ist die aktuelle Version des Elterntexts `"0"` (`ELTERNTEXT_VERSION` in `server-api/eltern.ts`), zeigt sie den Hinweis auf den Testbetrieb (nur Erwachsene).

Die Seite ist eine Datei ohne fremde Dienste, ohne externe Schriften und ohne Bilder. Sie ruft nur `/v1/eltern/*` auf diesem Server auf; der Code geht nur im JSON-Inhalt mit, nie in der Adresse. Sie speichert nichts im Browser außer dem Cookie oben. Kopfzeilen: `Content-Security-Policy` mit `default-src 'none'`, Skript und Stil nur mit ihrem SHA-256-Hash (beim Start des Servers berechnet), `connect-src 'self'`, `form-action 'none'`, `frame-ancestors 'none'`; dazu `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache`. Die Seite setzt kein Cookie. Fehlt die Datei, startet der Server nicht.

Hinter Caddy (`deploy/Caddyfile`) sind `/eltern` und `/v1/eltern/*` seit 24.11.2026 von außen erreichbar (Anfragen höchstens 16 KB); `/api/*` und die Weboberfläche bleiben gesperrt.

Für Tests mit Erwachsenen, solange die Geräte den Code noch nicht sprechen: `POST /api/devices/:id/kopplungscode` (Betreiber-Token) gibt den Code als Text zurück: `{"code":"123456","expires_in":600}`. Das Skript `deploy/eltern-einwilligung.mjs` koppelt damit und willigt ein (einmal; ohne Datei der Eltern-Steuerung nach jedem Neustart des Servers; Aufruf in `deploy/EINRICHTUNG.md`, Abschnitt 5, und in `pi-client/README.md`). Eine so erteilte Einwilligung hat `weg: "betreiber"`.

### Dauerhaft: Datei der Eltern-Steuerung (Datenschutz)

Seit 23.11.2026 (Punkt E2 der Arbeitsliste). Mit `KUNIBERT_ELTERN_DATEI` (Pfad, im Betrieb `/var/lib/kunibert/eltern.json`) und `KUNIBERT_ELTERN_SCHLUESSEL` (mindestens 32 Zeichen, zum Beispiel `openssl rand -hex 32`) übersteht die Eltern-Steuerung einen Neustart des Servers. Fehlt eins von beiden, liegt alles nur im Arbeitsspeicher wie vor dem 23.11.2026: Nach einem Neustart müssen die Eltern neu koppeln und neu einwilligen, und bis dahin hört das Gerät nur den festen Hinweis. Im Betrieb (`NODE_ENV=production`) startet der Server dann trotzdem, warnt aber beim Start laut (`Eltern-Steuerung nur im Arbeitsspeicher …`). `GET /api/status` zeigt `eltern.dauerhaft` (`true` oder `false`) und `eltern.ungespeichert` (eine Änderung wartet auf das Speichern), nie Pfad oder Schlüssel.

In der Datei steht je Gerät genau das, und nur das:

- ein Pseudonym statt der Geräte-ID: HMAC-SHA-256 der Geräte-ID mit dem Schlüssel aus `KUNIBERT_ELTERN_SCHLUESSEL`. Ein einfacher Hash ließe sich bei frei gewählten Kennungen wie `prototype-001` leicht zurückrechnen. Der Schlüssel steht nur in der Umgebung des Servers, nie im Code und nie in der Datei;
- die Einwilligung: erteilt oder widerrufen, Zeitpunkt der letzten Änderung, Version des Elterntexts, Weg (`geraet`, `betreiber` oder `server`, siehe unten). Kein Verlauf: Ein Widerruf ersetzt die Erteilung;
- Schlafmodus und Ruhezeiten;
- je gekoppeltem Handy der SHA-256-Hash des Eltern-Tokens, Zeitpunkt und Weg der Kopplung (höchstens 5).

Nicht in der Datei: Namen, E-Mail-Adressen, Aufnahmen, erkannte Sätze, Antworttexte, Geschichten, Kopplungscodes, IP-Adressen, Tokens im Klartext. Einschätzung (keine Rechtsberatung): Auch das Pseudonym bleibt ein Personenbezug; wer den Schlüssel hat, kann es einer Geräte-ID zuordnen.

Wie lange: Ein Eintrag bleibt, bis die Eltern alles löschen (`DELETE /v1/eltern/daten`), der Betreiber das Gerät sperrt (`POST /api/devices/:id/revoke`) oder das Gerät beim Start nicht mehr angemeldet ist. Auch ein Widerruf bleibt so lange stehen. Eltern-Tokens laufen am Server noch nicht ab (Punkt N1122-1751-b); ein Handy fällt erst heraus, wenn ein sechstes gekoppelt wird. Backups des Servers enthalten die Datei; für sie gelten diese Regeln nicht. Eine beiseitegelegte kaputte Datei (`deploy/EINRICHTUNG.md`, „Betrieb“) löscht nur der Betreiber.

Beim Start übernimmt der Server nur Einträge, deren Pseudonym zu einem angemeldeten, nicht gesperrten Gerät passt; die übrigen löscht er aus der Datei (das Protokoll nennt nur ihre Anzahl). Passt gar kein Eintrag, ist wohl der Schlüssel oder die Geräte-ID falsch eingetragen: Dann startet der Server nicht und lässt die Datei, wie sie ist (`Kein Eintrag der Datei passt zu einem angemeldeten Gerät`). Die Einträge zu behalten und später wieder gelten zu lassen, wäre gefährlich: Ein Widerruf in der Zwischenzeit träfe sie nicht. Ein neuer Schlüssel oder ein ersetztes Gerät heißt deshalb: Datei beiseitelegen, dann müssen alle Eltern neu koppeln und einwilligen.

Geschrieben wird die ganze Datei auf einmal (Rechte 600, erst eine neue Datei, dann umbenennen). Ist sie da, aber nicht lesbar oder ungültig, startet der Server nicht (fail-closed): Sonst gingen Widerrufe und Ruhezeiten verloren, und das nächste Speichern überschriebe den Nachweis. Die Meldung nennt nur einen Fehlercode, nie den Inhalt. Lässt sich eine Änderung nicht speichern, antwortet die Eltern-Route mit `503 {"error":"parent_store_unavailable","wirksam":true|false}`:

- `wirksam: false` bei `PUT /v1/eltern/einwilligung` und `POST /v1/eltern/koppeln`: Einwilligung und Kopplung gelten nur, wenn sie gespeichert sind; der Kopplungscode bleibt gültig.
- `wirksam: true` bei Widerruf, Einstellungen und „alles löschen“: Die Änderung gilt sofort. Der Server versucht das Speichern alle fünf Minuten erneut und noch einmal beim Beenden (SIGTERM, SIGINT). Damit ein Neustart vorher sie nicht still zurücknimmt, legt er neben die Datei eine leere Markierung (`…/eltern.json.offen`). Liegt sie beim Start da, gelten alle Einwilligungen als widerrufen (`weg: "server"`), weil der Server nicht mehr weiß, welche Änderung fehlte; die Eltern müssen neu einwilligen. Beim Sperren durch den Betreiber gilt dasselbe; die Antwort zeigt den Fehler nicht, das Protokoll schon.
- Ist die Datei schon beim Start nicht beschreibbar, ruhen alle Einwilligungen, bis das Speichern wieder klappt: Das Gerät sagt nur den festen Hinweis. Sonst könnte in dieser Zeit ein Widerruf verloren gehen.
- Restrisiko (Punkt N1123-0637-b): Lässt sich im Betrieb weder die Datei schreiben noch die Markierung anlegen (zum Beispiel falsche Rechte am Ordner), klappt auch das Speichern beim Beenden nicht, und ist das Problem beim nächsten Start behoben, gilt wieder der alte Stand aus der Datei. Deshalb nach dem Beheben warten, bis `GET /api/status` `eltern.ungespeichert: false` zeigt (spätestens fünf Minuten), erst dann stoppen oder neu starten.

## Fehlerantworten

| Status | Body | Bedeutung für den Client |
| --- | --- | --- |
| 400 | `bad_audio`, `unsupported_audio_format`, `audio_required`, `bad_upload`, `bad_json`, `unsupported_length`, `bad_request` (z. B. ungültig kodierter Pfad) | Anfrage fehlerhaft, nicht wiederholen |
| 401 | `unauthorized` | Gerät unbekannt, widerrufen oder Token falsch |
| 413 | `audio_too_large`, `payload_too_large` | Aufnahme über 2 MB, nicht wiederholen |
| 429 | `rate_limited` | Rate-Limit pro Gerät erreicht (beim Koppeln: Wartezeit in `Retry-After`, Abschnitt „Eltern“) |
| 503 | `voice_provider_failed` mit `retryable: true` | Sprachdienst vorübergehend gestört, Wiederholen sinnvoll; der Story-Zustand rückt nicht vor |
| 502 | `voice_provider_failed` mit `retryable: false` | Sprachdienst dauerhaft fehlerhaft (z. B. ungültiger Schlüssel); der Pi-Client wiederholt nicht |
| 500 | `internal_error` | Unerwarteter Fehler, ohne Fehlertext nach außen |

## Betrieb hinter einem Proxy

Terminiert ein Reverse Proxy (nginx, Caddy, Cloud Run) das HTTPS, sieht der Node-Server nur `http` und den Host des Proxys. Die `audio_url` in der Antwort würde dann mit `http://` oder einem internen Host beginnen, und der Pi-Client lehnt sie ab, weil Schema und Host nicht zu seiner API-Adresse passen. Zwei Wege:

- **`PICASTAI_PUBLIC_BASE_URL=https://kunibert.example`** (empfohlen): Der Server baut die `audio_url` aus diesem Ursprung, unabhängig von Headern. Pfad, Query und Zugangsdaten sind nicht erlaubt; Schreibweise und Port übernimmt der Server, wie sie dort stehen. Der Pi-Client vergleicht Schema, Host (ohne Beachtung der Groß-/Kleinschreibung) und effektiven Port, sodass `https://picastAI.com` und `https://picastai.com:443` als derselbe Ursprung gelten.
- **`PICASTAI_TRUST_PROXY=1`** (Anzahl der Proxy-Hops, oder `true`/`loopback`): Der Server glaubt `X-Forwarded-Proto` und `X-Forwarded-For`. Der Proxy muss dann den Host-Header mit durchreichen (nginx: `proxy_set_header Host $host;`).

Für Caddy auf demselben Rechner (`deploy/Caddyfile`) gilt seit 23.11.2026 `PICASTAI_TRUST_PROXY=loopback` (in `deploy/kunibert.env.example`, `deploy/setup-server.sh` setzt es, wenn der Wert fehlt). Dann sieht der Server die echte Adresse der Eltern beim Koppeln (Schutz vor dem Raten je Absender, Abschnitt „Eltern“) und erkennt HTTPS. Ohne die Einstellung sieht jede Anfrage über Caddy aus, als käme sie von `127.0.0.1`: Dann warten alle Eltern zusammen, wenn irgendwer falsch rät. Der Server warnt einmal, wenn eine Anfrage mit `X-Forwarded-For` von diesem Rechner kommt und die Einstellung fehlt (ohne Adresse). Steht noch ein Proxy vor Caddy (zum Beispiel ein CDN), braucht es zwei Änderungen, sonst zählt seine Adresse als Absender: im Caddyfile `trusted_proxies` mit seinen Adressbereichen (globale Option `servers`; ohne sie übernimmt Caddy fremde `X-Forwarded-*`-Köpfe nicht) und dieselben Bereiche zusätzlich in `PICASTAI_TRUST_PROXY` (zum Beispiel `loopback, 192.0.2.0/24`). Das ist nicht getestet. `Secure` am Eltern-Cookie hängt nicht an der Einstellung (Abschnitt „Eltern“).

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
- `POST /api/devices/:id/revoke` wirkt sofort im Speicher (Gerät gesperrt, Geschichte und Eltern-Steuerung vergessen, noch bevor Firestore schreibt) und antwortet mit `{"success":true,"persisted":true|false}`. Bei `persisted:false` war Firestore nicht erreichbar; der Widerruf gilt bis zum nächsten Neustart und sollte dann wiederholt werden.
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

**Zeitbudget:** Der Server hält für eine Anfrage (Erkennung, bis zu zwei Sprachmodell-Aufrufe, Sprachausgabe) ein gemeinsames Budget von 120 Sekunden ein. Das gilt auch, wenn eine Frage als Geschichtenwunsch erkannt wird und deshalb zwei Sprachmodell-Aufrufe nötig sind. Ist das Budget knapp, startet der Server keinen weiteren Sprachmodell-Aufruf mehr und spricht den festen Ersatztext; läuft die Sprachausgabe in die Frist, folgt `503 voice_provider_failed` mit `retryable: true` (siehe Fehlertabelle oben). Mit Ton-Strom gilt die Frist nur für den ersten Absatz; spätere Absätze haben die Grenze je Aufruf (Abschnitt „Ton-Strom“, „Zeitgrenzen im Strom“). Die Grenzen davor und danach (Caddy 130 s, Pi-Client 140 s) bleiben unverändert (`deploy/EINRICHTUNG.md`, „Zeitkette“). Die Sicherheitsweiche bleibt vom Budget unberührt.

## Sicherheitsgrenzen des Prototyps

- Rate-Limit pro Gerät: standardmäßig 30 Anfragen pro 10 Minuten.
- Feste Sprechtexte (Sicherheitshinweis, „nicht verstanden“, Fehlerhinweis, Pausensatz der Geschichte, die festen Ersatzantworten ohne Sprachmodell) werden nach der ersten Synthese im Speicher gehalten. In Produktion bereitet der Server sieben davon beim Start vor (die ersten vier, die allgemeine Ersatzantwort und die beiden Hinweise ohne Einwilligung und im Schlafmodus, `server.ts`) und versucht es gut sechs Minuten lang wieder, wenn der Sprachserver noch nicht bereit ist. Gespeichert werden nur diese festen Texte, nie Äußerungen von Kindern.
- Fehlermeldungen der Sprachdienste und von Anthropic kommen nur als HTTP-Status mit Fehlercode ins Protokoll (zum Beispiel `HTTP 422 (string_too_long)`), nie mit ihrem Fließtext: Der kann den gesendeten Text enthalten (`server-api/provider-errors.ts`).
- Audio nur im flüchtigen RAM, TTL standardmäßig 120 Sekunden.
- Audio-URL benötigt erneut Geräteauthentifizierung.
- Story-State, Rate-Limit und Audio sind im Prozessspeicher, nicht hochverfügbar. Die Geräteliste ist es nur ohne `PICASTAI_DEVICE_STORE=firestore`. Der Story-State verfällt 24 Stunden nach der letzten Nutzung. Für den Stopp per Taste hält der Server den Text des zuletzt erzählten Teils 15 Minuten bereit und eine gemerkte Stelle längstens 24 Stunden nach der letzten Meldung oder dem Abbruch eines neu erzählten Teils (Abschnitt `POST /v1/device/playback-stopped`); `GET /api/status` zeigt nur die Anzahl (`storyStates`, `storyPrefetches`, `storyStops`, `eltern`), keine Geräte-IDs und keine Inhalte.
- Kopplungscodes liegen nur im Arbeitsspeicher, ebenso die Pseudonyme der Absender beim Schutz vor dem Raten (Abschnitt „Eltern“). Einwilligung, Schlafmodus, Ruhezeiten und die Hashes der Eltern-Tokens überstehen einen Neustart nur mit der Datei der Eltern-Steuerung (Abschnitt „Dauerhaft: Datei der Eltern-Steuerung“, seit 23.11.2026); ohne sie hört nach einem Neustart jedes Gerät nur den festen Hinweis, bis die Eltern neu koppeln und einwilligen.
- Geräteverwaltung, Status und sichere Konfigurationsübersicht benötigen ein starkes Admin-Bearer-Token.
- CORS akzeptiert nur exakt konfigurierte Browser-Ursprünge; ohne Allowlist gibt es keine Cross-Origin-Freigabe.
- Firestore-Regeln verweigern direkte Clientzugriffe; serverseitige Admin-SDK-Zugriffe sind hiervon nicht erfasst.
- HTTPS muss durch Reverse Proxy oder TLS-fähige Node-Konfiguration bereitgestellt werden.
- STT-/TTS-Audio wird nur zur Laufzeit an den konfigurierten Provider übertragen; Aufbewahrung und Anbieter-Datenfluss müssen vor Kinderbetrieb rechtlich und organisatorisch geprüft werden.
