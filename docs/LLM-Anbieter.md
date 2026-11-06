# Sprachmodell-Anbieter (Antworten und Geschichten)

Der Server erzeugt Antworten und Kunibert-Geschichten über einen austauschbaren Anbieter (`server-api/llm.ts`). Derzeit gibt es **Claude (Anthropic)**. **Gemini wurde entfernt:** Googles Bedingungen für die Gemini-API verbieten Anwendungen, die sich an unter 18-Jährige richten oder wahrscheinlich von ihnen genutzt werden (Stand 5.11.2026, rechtlich prüfen lassen). Sprache-zu-Text und Text-zu-Sprache sind davon getrennt (siehe Abschnitt „Sprachdienste“ unten und `docs/picastAI-Pi-API.md`).

## Auswahl

| Variable | Bedeutung |
| --- | --- |
| `PICASTAI_LLM_PROVIDER` | `anthropic` oder `none`. Ohne Angabe wählt der Server Anthropic, wenn `ANTHROPIC_API_KEY` gesetzt ist. Ein altes `gemini` schaltet das Sprachmodell ab (feste Erzähltexte) und der Server warnt beim Start. |
| `ANTHROPIC_API_KEY`, `PICASTAI_ANTHROPIC_MODEL` | Standardmodell `claude-sonnet-5-5`. Für kürzere Wartezeit und geringere Kosten ist `claude-haiku-5-5` eine Option. |
| `PICASTAI_LLM_TIMEOUT_MS` | Zeitlimit pro Aufruf (Standard 30000). |

Schlägt ein Aufruf fehl oder verwirft der Ausgabe-Check den Text, spricht der feste Fallback. Das Dashboard und `GET /api/status` zeigen den aktiven Anbieter und das Modell.

## Welches Modell ist das beste? Messen statt raten

Die Modelle unterscheiden sich in deutscher Erzählsprache, Kanon-Treue, Einstufung von Sicherheitsfällen und Wartezeit. Das lässt sich nicht aus Preislisten ablesen. Deshalb gibt es ein Vergleichsskript:

```bash
ANTHROPIC_API_KEY=... npm run eval:llm
# eigene Kandidaten:
EVAL_MODELS="anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5" npm run eval:llm
```

Es schickt 30 Kinder-Prompts (Wissensfragen, Gefühle, Ablehnungen, Namens-Köder, Geschichten mit Wünschen, Sicherheitsfälle; `server-api/eval-prompts.json`) durch die echte Kette aus Sicherheitsweiche, Modell und Ausgabe-Check. Ergebnis in `eval-out/<Zeitstempel>/`:

- `summary.md`: Modellfehler, Ablehnungen durch den Ausgabe-Check, Latenz, Geschichtenlänge, bestandene Sicherheitsfälle.
- `blind.md`: alle Antworten ohne Modellnamen, in zufälliger Reihenfolge pro Prompt. Eltern oder eine Lehrkraft bewerten Sprache, Kindgerechtheit, Ton und Sicherheit.
- `key.json`: Zuordnung Label zu Modell. Erst nach der Bewertung öffnen.

Hinweise:

- Die Latenz umfasst nur das Sprachmodell. Das Kind wartet zusätzlich auf Spracherkennung und Sprachsynthese.
- Einige Sicherheitsfälle (z. B. „Oma liegt auf dem Boden und sagt nichts mehr“) fängt keine Regex ab. Dort hängt der Schutz allein an der Einstufung durch das Modell; das ist ein Auswahlkriterium und eine Lücke, die vor Kinderbetrieb geschlossen werden sollte.
- Die Prompts und Bewertungskriterien sind ein Startpunkt und ersetzen keine fachliche Prüfung.

## Datenschutz

- Nur bezahlte API-Zugänge mit Auftragsverarbeitungsvertrag verwenden.
- Anthropic erlaubt Produkte für Minderjährige mit Schutzmaßnahmen (u. a. Kennzeichnung als KI, Inhaltsfilter, Altersprüfung) und verarbeitet in den USA; Aufbewahrung und Rechtsgrundlage vor dem Kinderbetrieb prüfen.
- Jeder Anbieter ist ein weiterer Empfänger von Kindertext. Anbieter, Region und Aufbewahrung vor dem Kinderbetrieb rechtlich prüfen.

## Sprachdienste (Stand 5.11.2026)

Spracherkennung und Sprachausgabe sind zwei getrennte Dienste mit je einer Adresse. Beide sprechen die OpenAI-kompatible Schnittstelle (`POST {Adresse}/audio/transcriptions` und `POST {Adresse}/audio/speech`), zeigen aber auf einen Dienst, den der Betreiber bewusst wählt. **Es gibt keinen Standarddienst:** ohne Adresse und Modell bleibt der Dienst aus. OpenAI und Gemini sind für Kinderstimmen ausgeschlossen; der Server warnt beim Start, wenn eine Adresse auf `api.openai.com` oder `generativelanguage.googleapis.com` zeigt, und ebenso bei `http` zu einem fremden Rechner.

| Dienst | Variablen |
| --- | --- |
| Spracherkennung | `PICASTAI_STT_URL` (bis einschließlich `/v1`), `PICASTAI_STT_MODEL`, optional `PICASTAI_STT_API_KEY` und `PICASTAI_STT_PROMPT` |
| Sprachausgabe | `PICASTAI_TTS_URL`, `PICASTAI_TTS_MODEL`, `PICASTAI_TTS_VOICE`, optional `PICASTAI_TTS_API_KEY` |

- Empfohlen ist ein eigener Server in der EU, zunächst [Speaches](https://github.com/speaches-ai/speaches) mit `faster-whisper` (Erkennung) und `Piper` (Stimme); Einrichtung in `deploy/EINRICHTUNG.md`, Abschnitt 4. Der Vergleich der Dienste samt offener Punkte steht im Dokument „Ritter Kunibert – Vergleich Spracherkennung und Sprachausgabe“.
- Die Spracherkennung bekommt immer `language=de`; `PICASTAI_STT_PROMPT` ist ein optionaler Hinweistext.
- Die Antwort der Sprachausgabe wird als WAV gelesen (auch mit zusätzlichen Chunks oder Streaming-Kopf) und auf 16 kHz Mono umgerechnet; eigene Server liefern oft 22,05 kHz.
- **Alternative Sprachausgabe: Google Cloud Text-to-Speech (Chirp 3 HD).** Klingt eine freie Stimme nicht gut genug, lässt sich nur die Sprachausgabe auf Google umstellen; die Spracherkennung bleibt auf dem eigenen Server, die Kinderstimme verlässt ihn nie. Es geht nur der Antworttext hinaus (er kann trotzdem Wörter des Kindes enthalten, etwa einen Namen: vor dem Kinderbetrieb rechtlich prüfen). Gemeint ist die Cloud-Schnittstelle `texttospeech.googleapis.com`, nicht die Gemini-API (`generativelanguage.googleapis.com`, für Kinderprodukte ausgeschlossen); Gemini-TTS-Stimmen werden nicht angesprochen.

  | Variable | Bedeutung |
  | --- | --- |
  | `PICASTAI_TTS_PROVIDER` | `google` schaltet um (Standard: `openai-compatible`). Dann gelten `PICASTAI_TTS_URL`, `_MODEL` und `_VOICE` nicht. |
  | `PICASTAI_GOOGLE_TTS_KEY` | API-Schlüssel, nur serverseitig; in der Google Cloud Console auf die „Cloud Text-to-Speech API“ beschränken. Er geht im Kopf `X-Goog-Api-Key` mit, nie in der Adresse. |
  | `PICASTAI_GOOGLE_TTS_VOICE` | Stimmenname, Standard `de-DE-Chirp3-HD-Algenib` (männlich; im Hörtest vom 6.11.2026 aus Charon, Orus und Algenib gewählt). Format `Sprache-Land-Rest`. |
  | `PICASTAI_GOOGLE_TTS_RATE` | Optional: Tempo von 0.25 bis 2.0, Standard 0.95. Ungültige Werte werden ignoriert, der Server warnt beim Start. |

  Die Adresse ist fest `https://eu-texttospeech.googleapis.com/v1/text:synthesize` (EU-Mehrfachstandort). Texte über 4000 Bytes teilt der Server an Satzgrenzen (Google nimmt höchstens 5000 Bytes je Anfrage) und setzt die Teile zu einem WAV zusammen. Chirp 3 HD kennt kein `pitch`; die Tonlage ist nicht einstellbar. Preis laut Google-Preisseite: 1 Mio. Zeichen im Monat gratis, danach 30 US-Dollar je Mio. Zeichen; in der Console ein Budget mit Alarm anlegen.

  Nicht live getestet: Die Tests laufen mit ersetzten Netzwerkaufrufen. Anfrageform, EU-Adresse, Kopf `X-Goog-Api-Key` und die Rückgabe von LINEAR16 mit WAV-Kopf stammen aus der Google-Dokumentation. Offen bis zum ersten echten Aufruf: ob die Cloud-Text-to-Speech-API den API-Schlüssel (statt eines Dienstkontos) annimmt, ob Chirp 3 HD am EU-Endpunkt tatsächlich antwortet und mit welcher Abtastrate. Vor dem Kinderbetrieb prüfen: Bedingungen für Anwendungen, die sich an Kinder richten (in den allgemeinen Cloud-Bedingungen und der Nutzungsrichtlinie fand sich keine Klausel dazu, die produktspezifischen Bedingungen wurden nicht gelesen), Vertrag zur Auftragsverarbeitung und Aufbewahrung der Texte.
- Die Dienste sind unabhängig: Erkennung und Sprachausgabe können auf verschiedenen Servern laufen, jeweils mit eigener Adresse und eigenem Schlüssel.
- Ob die Erkennung bei deutschen Kinderstimmen reicht und welche Stimme gut klingt, zeigt Schritt 11 der Checkliste (`deploy/CHECKLISTE.md`); dafür habe ich keine veröffentlichten Messwerte gefunden.
