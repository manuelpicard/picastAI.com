# Sprachmodell-Anbieter (Antworten und Geschichten)

Der Server erzeugt Antworten und Kunibert-Geschichten über einen austauschbaren Anbieter (`server-api/llm.ts`). Unterstützt sind **Gemini** und **Claude (Anthropic)**. Sprache-zu-Text und Text-zu-Sprache sind davon getrennt (siehe Abschnitt „Sprachdienste“ unten und `docs/picastAI-Pi-API.md`).

## Auswahl

| Variable | Bedeutung |
| --- | --- |
| `PICASTAI_LLM_PROVIDER` | `gemini`, `anthropic` oder `none`. Ohne Angabe wählt der Server nach vorhandenem Key (Gemini zuerst, damit bestehende Installationen unverändert bleiben). |
| `GEMINI_API_KEY`, `PICASTAI_GEMINI_MODEL` | Standardmodell `gemini-3.8-flash` (Google empfiehlt für neue Projekte `gemini-3.5-flash-lite` oder `gemini-3.8-flash`; das frühere `gemini-2.5-flash` ist für neue Nutzer eingeschränkt). |
| `ANTHROPIC_API_KEY`, `PICASTAI_ANTHROPIC_MODEL` | Standardmodell `claude-sonnet-5-5`. Für kürzere Wartezeit und geringere Kosten ist `claude-haiku-5-5` eine Option. |
| `PICASTAI_LLM_TIMEOUT_MS` | Zeitlimit pro Aufruf, für Gemini und Anthropic (Standard 30000). |

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

## Sprachdienste (Stand 5.11.2026)

OpenAI hat angekündigt, `tts-1`, `tts-1-hd` und `gpt-4o-mini-tts` am **6.1.2027** sowie `whisper-1` und `gpt-4o-transcribe` am **26.2.2027** abzuschalten ([Deprecations](https://developers.openai.com/api/docs/deprecations)). Der genannte Ersatz für die Sprachausgabe, `gpt-realtime-2.1-mini`, läuft nur über die Realtime-API und nicht über `/audio/speech`. Deshalb:

| Dienst | Voreinstellung | Variablen |
| --- | --- | --- |
| Spracherkennung | OpenAI `gpt-transcribe` (Endpunkt `/audio/transcriptions`) | `OPENAI_API_KEY`, `PICASTAI_STT_MODEL`, optional `PICASTAI_STT_PROMPT` |
| Sprachausgabe | Gemini `gemini-3.8-flash-tts`, Stimme `Sulafat`, wenn `GEMINI_API_KEY` gesetzt ist; sonst OpenAI | `PICASTAI_TTS_PROVIDER` (`gemini`, `openai`, `none`), `PICASTAI_TTS_MODEL`, `PICASTAI_TTS_VOICE`, `PICASTAI_TTS_STYLE` |

- `PICASTAI_VOICE_PROVIDER=none` schaltet Spracherkennung und -ausgabe ab; `openai` bedeutet wie früher OpenAI für beides.
- Die Sprechweise der Gemini-Stimme kommt als Anweisung in natürlicher Sprache (`PICASTAI_TTS_STYLE`, Standard: ruhig, warm, wie ein Märchenerzähler). Zum Hören bieten sich auch `Vindemiatrix` (sanft) und `Gacrux` (reif) an.
- Beim Start warnt der Server, wenn noch ein zur Abschaltung angekündigtes Modell eingestellt ist.
- `gpt-transcribe` bekommt keinen `language`-Parameter, weil er für dieses Modell nicht dokumentiert ist. Ob kurze Kinderäußerungen zuverlässig als Deutsch erkannt werden, prüft Schritt 11 der Checkliste (`deploy/CHECKLISTE.md`); als Rückfall bleibt `PICASTAI_STT_MODEL=gpt-4o-transcribe` bis zum 26.2.2027.
- Preise (Stand 11/2026, laut Anbieter-Preisseiten): Gemini-TTS ca. 0,0135 US-Dollar pro Sprechminute bis Ende 2026, ab 2027 das Doppelte; `gpt-transcribe` 0,0045 US-Dollar pro Minute Aufnahme.
- Die Antwort von Gemini wird als WAV gelesen und wie bisher auf 16 kHz Mono umgerechnet.
