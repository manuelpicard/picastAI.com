# Sprachmodell-Anbieter (Antworten und Geschichten)

Der Server erzeugt Antworten und Kunibert-Geschichten über einen austauschbaren Anbieter (`server-api/llm.ts`). Unterstützt sind **Gemini** und **Claude (Anthropic)**. Sprache-zu-Text und Text-zu-Sprache sind davon getrennt (OpenAI-kompatibel, siehe `docs/picastAI-Pi-API.md`).

## Auswahl

| Variable | Bedeutung |
| --- | --- |
| `PICASTAI_LLM_PROVIDER` | `gemini`, `anthropic` oder `none`. Ohne Angabe wählt der Server nach vorhandenem Key (Gemini zuerst, damit bestehende Installationen unverändert bleiben). |
| `GEMINI_API_KEY`, `PICASTAI_GEMINI_MODEL` | Standardmodell `gemini-3.8-flash` (Google empfiehlt für neue Projekte `gemini-3.5-flash-lite` oder `gemini-3.8-flash`; das frühere `gemini-2.5-flash` ist für neue Nutzer eingeschränkt). |
| `ANTHROPIC_API_KEY`, `PICASTAI_ANTHROPIC_MODEL` | Standardmodell `claude-sonnet-5-5`. Für kürzere Wartezeit und geringere Kosten ist `claude-haiku-5-5` eine Option. |
| `PICASTAI_LLM_TIMEOUT_MS` | Zeitlimit pro Aufruf bei Anthropic (Standard 30000). |

Schlägt ein Aufruf fehl oder verwirft der Ausgabe-Check den Text, spricht der feste Fallback. Das Dashboard und `GET /api/status` zeigen den aktiven Anbieter und das Modell.

## Welches Modell ist das beste? Messen statt raten

Die Modelle unterscheiden sich in deutscher Erzählsprache, Kanon-Treue, Einstufung von Sicherheitsfällen und Wartezeit. Das lässt sich nicht aus Preislisten ablesen. Deshalb gibt es ein Vergleichsskript:

```bash
GEMINI_API_KEY=... ANTHROPIC_API_KEY=... npm run eval:llm
# eigene Kandidaten:
EVAL_MODELS="gemini:gemini-3.8-flash,gemini:gemini-3.5-flash-lite,anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5" npm run eval:llm
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

- Nur bezahlte API-Zugänge mit Auftragsverarbeitungsvertrag verwenden. Bei Gemini nutzt der kostenlose Tarif Inhalte zur Produktverbesserung, der bezahlte nicht (laut Preisübersicht eines Drittanbieters; vor dem Einsatz in Googles eigenen Bedingungen prüfen).
- Jeder Anbieter ist ein weiterer Empfänger von Kindertext. Anbieter, Region und Aufbewahrung vor dem Kinderbetrieb rechtlich prüfen.
