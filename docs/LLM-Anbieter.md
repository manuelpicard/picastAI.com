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
- **Alternative Sprachausgabe: Azure AI Speech.** Klingt eine freie Stimme nicht gut genug, lässt sich nur die Sprachausgabe auf Azure umstellen; die Spracherkennung bleibt auf dem eigenen Server, die Kinderstimme verlässt ihn nie. Es geht nur der Antworttext hinaus (er kann trotzdem Wörter des Kindes enthalten, etwa einen Namen: vor dem Kinderbetrieb rechtlich prüfen).

  | Variable | Bedeutung |
  | --- | --- |
  | `PICASTAI_TTS_PROVIDER` | `azure` schaltet um (Standard: `openai-compatible`). Dann gelten `PICASTAI_TTS_URL`, `_MODEL` und `_VOICE` nicht. |
  | `PICASTAI_AZURE_TTS_REGION` | Kurzname der Region, **in der EU wählen**, z. B. `germanywestcentral` oder `westeurope`. Bei anderen Regionen warnt der Server beim Start. |
  | `PICASTAI_AZURE_TTS_KEY` | Schlüssel der Speech-Ressource, nur serverseitig. |
  | `PICASTAI_AZURE_TTS_VOICE` | Stimmenname, z. B. `de-de-Florian:DragonHDLatestNeural` (Dragon HD, männlich) oder `de-DE-ConradNeural`. |
  | `PICASTAI_AZURE_TTS_PITCH`, `PICASTAI_AZURE_TTS_RATE` | Optional: Tonlage und Tempo als SSML-Wert (`-10%`, `+2st`, `low`; Tempo `-5%`, `slow`, `0.9`). Ungültige Werte werden ignoriert, der Server warnt. |

  Nicht live getestet: Azure-Anfrage (SSML, Rohformat 16 kHz, Schlüssel im Header `Ocp-Apim-Subscription-Key`) stammt aus der Microsoft-Dokumentation. Ob `pitch` bei den Dragon-HD-Stimmen wirkt, ist dort nicht bestätigt (für `rate` gibt es ein Beispiel); das zeigt der Hörtest. Ob Dragon HD in der gewählten EU-Region verfügbar ist, zeigt die Regionsliste von Azure. Preis, Aufbewahrung der Texte und Vertrag zur Auftragsverarbeitung vor dem Kinderbetrieb prüfen.
- Die Dienste sind unabhängig: Erkennung und Sprachausgabe können auf verschiedenen Servern laufen, jeweils mit eigener Adresse und eigenem Schlüssel.
- Ob die Erkennung bei deutschen Kinderstimmen reicht und welche Stimme gut klingt, zeigt Schritt 11 der Checkliste (`deploy/CHECKLISTE.md`); dafür habe ich keine veröffentlichten Messwerte gefunden.
