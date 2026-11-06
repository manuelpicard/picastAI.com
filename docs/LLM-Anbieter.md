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
  | `PICASTAI_GOOGLE_TTS_VOICE` | Stimmenname, Standard `de-DE-Chirp3-HD-Algieba` (männliche Erzählerstimme; im Hörtest vom 6.11.2026 unter allen 16 männlichen Chirp-3-HD-Stimmen gewählt). Format `Sprache-Land-Rest`. |
  | `PICASTAI_GOOGLE_TTS_RATE` | Optional: Tempo von 0.25 bis 2.0, Standard 0.9 (im Hörtest die passende Erzählgeschwindigkeit). |
  | `PICASTAI_GOOGLE_TTS_PITCH` | Optional: Tonlage in Halbtönen von -6 bis 6, Standard -2 (im Hörtest „die tiefere Version“; Algieba klang etwas zu hoch). `0` lässt die Stimme unverändert. |
  | `PICASTAI_GOOGLE_TTS_PAUSE_MS` | Optional: Grundpause nach einem Satz in Millisekunden (0 bis 2000), Standard 500. `0` schaltet die Pausen aus. |

  Ungültige Werte für Tempo, Tonlage und Pause werden ignoriert (es gelten die Standardwerte); der Server warnt beim Start.

  **Erzählstimme.** Mit den Standardwerten schickt der Server SSML: `<prosody pitch="-2st" rate="90%">` um den ganzen Text und nach jedem Satz eine Pause (`<break>`). Damit es nicht abgehackt klingt, ist die Pause nicht überall gleich lang: nach sehr kurzen Sätzen (bis 3 Wörter, z. B. „Wer ist da?“) 60 %, nach langen (ab 15 Wörtern) 120 % der Grundpause, bei Absätzen 180 %. Wörtliche Rede („Wer ist da?“, rief er.) wird nicht mitten im Satz geteilt. Der Text wird für XML maskiert, ein Text mit `<` kann also kein eigenes SSML einschleusen. Mit Tonlage `0` und Pause `0` geht stattdessen einfacher Text mit `speakingRate` hinaus.

  Die Adresse ist fest `https://eu-texttospeech.googleapis.com/v1/text:synthesize` (EU-Mehrfachstandort). Längere Texte teilt der Server bevorzugt an Absätzen, dann an Satzgrenzen (Google nimmt höchstens 5000 Bytes je Anfrage; der Server bleibt bei 4000 Bytes Text bzw. 4800 Bytes SSML), und setzt die Teile mit einer Stille in Länge der Grundpause zu einem WAV zusammen. Preis laut Google-Preisseite: 1 Mio. Zeichen im Monat gratis, danach 30 US-Dollar je Mio. Zeichen; in der Console ein Budget mit Alarm anlegen.

  Was live geprüft ist (Hörtests vom 6.11.2026 mit eigenem Schlüssel, per PowerShell): Der API-Schlüssel wird akzeptiert, der EU-Endpunkt antwortet mit Chirp 3 HD, LINEAR16 kommt als WAV mit 24 kHz Mono, und SSML-`prosody pitch="-2st"` wirkt hörbar und messbar (Grundfrequenz etwa 89 Hz statt 102–109 Hz). Nicht live geprüft: der Serverweg selbst (Aufteilung langer Texte, Stille zwischen Teilen, die satzlängenabhängigen Pausen); die Tests laufen mit ersetzten Netzwerkaufrufen. Ob die Pausen „menschlich“ statt abgehackt klingen, ist eine Annahme, die erst ein Hörtest mit der echten Ausgabe bestätigt: Länge mit `PICASTAI_GOOGLE_TTS_PAUSE_MS` einstellen.

  **Rechtlich vor dem Kinderbetrieb klären (keine Rechtsberatung, Stand 6.11.2026).** In den Cloud-Dienstbedingungen (Abschnitt 20 d) sind „Generative AI Services“ für Anwendungen ausgeschlossen, die sich an unter 18-Jährige richten oder von ihnen voraussichtlich genutzt werden. Text-to-Speech steht dort bei den „Pre-Trained APIs“, nicht bei den Generative-AI-Diensten, und Chirp 3 HD wird nicht ausdrücklich genannt; ob Google die Stimme als Generative AI einordnet, ist nicht bestätigt. Eine Anfrage an Google ist am 6.11.2026 abgeschickt, die Antwort steht aus. Nicht gelesen oder geklärt: die Bedingungen nach Abschnitt 20 e, Rechte am erzeugten Audio, Vertrag zur Auftragsverarbeitung, Aufbewahrung der Texte. Google schreibt in der Dokumentation, dass es Text und Audio von Cloud Text-to-Speech nicht protokolliert. Bis zur Klärung nur mit Erwachsenen testen. Ausweichen ließe sich auf eine Neural2-Stimme (`de-DE-Neural2-…`), die klassisch und nicht generativ ist; sie klingt weniger natürlich und wurde nicht angehört. Als Beleg sinnvoll: Dienstliste und Abschnitt 20 d als datiertes PDF speichern.
- **Alternative Sprachausgabe: Pocket TTS (Kyutai) auf dem eigenen Server.** Ein kleines Sprachmodell (100 Mio. Parameter), das auf der CPU läuft. Der Antworttext geht nur an den eigenen Server, an keinen Dritten; damit entfallen die offenen Fragen zu Google (Bedingungen für Kinder, Auftragsverarbeitung, Rechte am Audio) und die Kosten je Zeichen. Der Server startet mit `pocket-tts serve --language german` (Einrichtung: `deploy/EINRICHTUNG.md`, Abschnitt 4).

  | Variable | Bedeutung |
  | --- | --- |
  | `PICASTAI_TTS_PROVIDER` | `pocket` schaltet um. Dann gelten `PICASTAI_TTS_URL`, `_MODEL` und `_VOICE` nicht. |
  | `PICASTAI_POCKET_TTS_URL` | Adresse des Pocket-Servers ohne Pfad, z. B. `http://127.0.0.1:8003`. Ohne Adresse bleibt die Sprachausgabe aus. Außerhalb des eigenen Rechners nur `https`; der Start warnt vor `http`. |
  | `PICASTAI_POCKET_TTS_VOICE` | Stimme, Standard `juergen` (eingebaute deutsche Stimme). Auch `hf://…` oder `https://…` auf eine eigene Stimmprobe (WAV) ist möglich. |
  | `PICASTAI_POCKET_TTS_TEMPO` | Optional: Tempo-Faktor von 0.7 bis 1.3, Standard 0.9 (zehn Prozent langsamer; im Hörtest war die Stimme „bisschen zu schnell“). 1 = unverändert. |
  | `PICASTAI_POCKET_TTS_PAUSE_MS` | Optional: Grundpause nach einem Satz in Millisekunden (0 bis 2000), Standard 500. `0` schaltet die Pausen aus. |

  Ungültige Werte für Tempo und Pause werden ignoriert (es gelten die Standardwerte); der Start warnt davor.

  **Wie der Server mit Pocket TTS arbeitet.** Pocket TTS hat weder Tempo-Regler noch Pausen. Der Server spricht deshalb Satz für Satz (`POST {Adresse}/tts` mit den Formularfeldern `text` und `voice_url`), verlangsamt jeden Satz ohne Änderung der Tonhöhe (Zeitdehnung, WSOLA) und setzt dazwischen Stille: nach sehr kurzen Sätzen 60 %, nach langen (ab 15 Wörtern) 120 %, bei Absätzen 180 % der Grundpause. Sehr kurze Sätze („Es blieb still.“) werden mit dem Nachbarn zusammen gesprochen, wörtliche Rede wird nicht zerschnitten. Die Antwort kommt als WAV-Datenstrom (24 kHz) und wird auf 16 kHz Mono umgerechnet. Bei einem Fehler in einem Satz bricht die ganze Ausgabe ab (kein halber Text).

  **Anhören der echten Ausgabe:** `PICASTAI_TTS_PROVIDER=pocket PICASTAI_POCKET_TTS_URL=http://127.0.0.1:8003 npm run sprachprobe -- probe.wav` spricht eine Beispielgeschichte durch dieselbe Kette wie der Server und schreibt die WAV-Datei (eigener Text mit `--text "…"` oder `--datei text.txt`). Dasselbe geht mit `google` und dem OpenAI-kompatiblen Dienst.

  **Rechtlich vor dem Kinderbetrieb klären (keine Rechtsberatung, Stand 6.11.2026).** Der Code steht unter MIT-Lizenz, das Modell laut Hugging Face unter CC BY 4.0 (erlaubt grundsätzlich auch kommerzielle Nutzung, verlangt aber Namensnennung; der Zugriff auf die Modelldateien setzt die Zustimmung zu Bedingungen auf Hugging Face voraus). Verboten sind u. a. das Nachahmen oder Klonen einer Stimme ohne ausdrückliche und rechtmäßige Einwilligung sowie Täuschung. Einschränkungen für Produkte für Kinder habe ich nicht gefunden. **Offen: Herkunft und Lizenz der Stimme `juergen`.** Kyutai nennt sie nirgends (sie fehlt im Stimmenkatalog, die Datei liegt auf einem Nebenzweig des Projekts); ob ein echter Sprecher dahintersteht und eingewilligt hat, ist unklar. Anfrage an Kyutai stellen oder eine eigene Stimmprobe mit schriftlicher Einwilligung des Sprechers verwenden. Die Namensnennung für das Modell (CC BY 4.0) gehört in die Elterninformation bzw. das Impressum.

  **Stand der Prüfung.** Gehört wurde nur die Stimme selbst („klingt echt gut, bisschen zu schnell“, Betreiber, 6.11.2026), nicht die Zeitdehnung und nicht die gestaffelten Pausen. Der Anschluss wurde gegen einen nachgebauten Server geprüft (Formular, Datenstrom mit unbekannter Länge im WAV-Kopf), nicht gegen einen echten Pocket-Server; Feldnamen und Antwortform stammen aus dem Quelltext von `pocket-tts` (6.11.2026). Laut Entwickler erzeugt Pocket TTS auf einem Rechner mit 4 Kernen das 2,3- bis 2,5-Fache der Sprechdauer (eine 40-Sekunden-Geschichte also in etwa 17 Sekunden); die größere Variante `german_24l` klingt besser, ist aber langsamer. Die Server-Variante ohne Grafikkarte läuft nur auf der CPU.
- Die Dienste sind unabhängig: Erkennung und Sprachausgabe können auf verschiedenen Servern laufen, jeweils mit eigener Adresse und eigenem Schlüssel.
- Ob die Erkennung bei deutschen Kinderstimmen reicht und welche Stimme gut klingt, zeigt Schritt 11 der Checkliste (`deploy/CHECKLISTE.md`); dafür habe ich keine veröffentlichten Messwerte gefunden.
