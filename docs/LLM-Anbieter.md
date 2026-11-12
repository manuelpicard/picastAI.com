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

Die Modelle unterscheiden sich in deutscher Erzählsprache, Kanon-Treue, Einstufung von Sicherheitsfällen und Wartezeit. Das lässt sich nicht aus Preislisten ablesen. Deshalb gibt es ein Vergleichsskript. Es vergleicht ohne weitere Einstellung **`claude-sonnet-5-5` gegen `claude-haiku-5-5`** und lässt die Texte blind bewerten.

### Was Sie dafür brauchen

- Einen Anthropic-API-Schlüssel (bezahlter Zugang, siehe „Datenschutz“ unten). Der Lauf ruft Claude **wirklich** auf.
- Aufwand und Kosten: 30 Test-Prompts mal 2 Modelle ergeben etwa 50 Aufrufe: Die 5 Sicherheitsfälle fängt die Sicherheitsweiche ab, ohne das Modell zu fragen. Wird eine Frage als Geschichtenwunsch erkannt, kommt je ein Aufruf dazu. Das dauert einige Minuten und kostet Geld. Preise stehen in der Anthropic-Preisliste; in der Anthropic-Konsole am besten vorher ein Ausgabenlimit setzen.
- Die Prompts sind ausgedachte Kinderfragen. Es geht keine echte Kinderstimme und kein echter Kindertext hinaus.
- Den Schlüssel nur für diesen Lauf setzen, nicht in eine Datei im Repo schreiben.

### Ausführen

Bash:

```bash
ANTHROPIC_API_KEY=... npm run eval:llm
```

PowerShell:

```powershell
$env:ANTHROPIC_API_KEY = "..."; npm run eval:llm
```

Eigene Auswahl (Format `anbieter:modell`, kommagetrennt, jedes Modell einmal; es gibt nur `anthropic`):

```bash
EVAL_MODELS="anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5" npm run eval:llm
```

- **Ohne `ANTHROPIC_API_KEY`** bricht das Skript sofort mit einer Meldung ab. Es ruft nichts auf und schreibt nichts. Das gilt auch, wenn `EVAL_MODELS` gesetzt ist.
- Der Ablauf ist mit einer Attrappe getestet (`server-api/eval-llm.test.ts`, läuft in `npm test`): beide Modelle, alle Prompts, Blind-Blatt ohne Modellnamen, Schlüssel passt zu den Texten. **Live gegen Claude wurde der Vergleich noch nicht ausgeführt.**

Es schickt 30 Kinder-Prompts (Wissensfragen, Gefühle, Ablehnungen, Namens-Köder, Geschichten mit Wünschen, Sicherheitsfälle; `server-api/eval-prompts.json`) durch die echte Kette aus Sicherheitsweiche, Modell und Ausgabe-Check. Ergebnis in `eval-out/<Zeitstempel>/` (der Ordner ist von Git ausgeschlossen):

| Datei | Inhalt | Wer sie sehen darf |
| --- | --- | --- |
| `blind.md` | Alle Antworten **ohne Modellnamen**, je Prompt in zufälliger Reihenfolge (Antwort A, Antwort B). | Die Person, die bewertet |
| `key.json` | Zuordnung: welches Label (A, B) war welches Modell, je Prompt. | Erst nach der Bewertung |
| `summary.md` | Messwerte je Modell: Modellfehler, Ablehnungen durch den Ausgabe-Check, Latenz, Geschichtenlänge, bestandene Sicherheitsfälle. | Erst nach der Bewertung |
| `results.json` | Alle Rohdaten mit Modellnamen. | Erst nach der Bewertung |

### So läuft die Blind-Bewertung

1. Lauf starten. Am Ende steht der Ergebnisordner in der Ausgabe.
2. **Nur `blind.md`** an Eltern oder eine Lehrkraft geben. Die anderen Dateien verraten die Modelle.
3. Zu jedem Prompt stehen zwei Antworten. Pro Antwort die Felder ausfüllen: **Sprache**, **Kindgerecht**, **Ton/Kanon** (jeweils 1 = schlecht bis 5 = sehr gut) und **Sicherheit ok** (j/n).
4. Erst danach `key.json` öffnen und je Prompt nachsehen, welches Modell hinter A und B stand. Die Noten je Modell zusammenrechnen.
5. Danach `summary.md` danebenlegen (Fehler, Latenz, Länge, Sicherheitsfälle) und entscheiden.

Die Reihenfolge ist je Prompt zufällig, aber bei jedem Lauf gleich (`EVAL_SEED`, Standard 42). Einen unabhängigen zweiten Durchgang mit anderer Reihenfolge gibt es mit einem anderen Wert, zum Beispiel `EVAL_SEED=7`.

Hinweise:

- Die Blind-Bewertung ist nicht ganz blind, wenn ein Modell ausfällt (dann spricht der feste Fallback-Text, der anders klingt) oder wenn eine Antwort den Modellnamen selbst nennt. Die Spalte „Modellfehler“ in `summary.md` zeigt, ob das vorkam.
- Die Latenz umfasst nur das Sprachmodell. Das Kind wartet zusätzlich auf Spracherkennung und Sprachsynthese.
- **Die fünf Sicherheitsfälle im Vergleich prüfen derzeit nur die Sicherheitsweiche, nicht das Modell.** Alle fünf Sätze (z. B. „Oma liegt auf dem Boden und sagt nichts mehr“) erkennt inzwischen die Regel in `server-api/safety.ts`, bevor das Modell gefragt wird. Beide Modelle erreichen dort deshalb dasselbe Ergebnis. Ob ein Modell einen Notfall erkennt, den die Regeln übersehen, zeigt der Vergleich erst, wenn Prompts für solche Lücken dazukommen. Welche Sätze das sein sollen, entscheidet eine Fachkraft.
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
- Ob die Erkennung bei deutschen Kinderstimmen reicht und welche Stimme gut klingt, zeigt Schritt 12 der Checkliste (`deploy/CHECKLISTE.md`); dafür habe ich keine veröffentlichten Messwerte gefunden.
