# Erzähler-Engine (Stand 14.11.2026)

So entsteht ein Teil einer Kunibert-Folge. Code: `server-api/brain.ts` (Ablauf, Zustand), `server-api/prompts.ts` (Texte an Claude), Kanon: `docs/Kunibert-Kanon.md`.

## Ablauf je Teil

1. Sicherheitsweiche auf den Wunsch des Kindes (wie bisher).
2. Neue Folge: Stimmung und Anlass (`EPISODE_SPARKS`) werden ausgelost. Die Stimmung passt zur Jahreszeit (`seedsForSeason`): im Winter kein Frühlingstag. Der Wunsch des Kindes gilt für die ganze Folge. Abends (19 bis 6 Uhr deutscher Zeit) bekommt jeder Teil den Hinweis für die Schlafenszeit (Kanon, Abschnitt 7): ruhiger, gemütlicher Haltepunkt.
3. Rolle des Teils (`storyPhase`): Teil 1 Anfang, Teil 2 unterwegs (meist Hexe), Mitte, vorletzter Teil Wendung, letzter Teil Heimkehr. Bei drei Teilen kommt die Hexe schon in Teil 1.
4. Claude schreibt den Teil. In Teil 1 legt es zuerst einen **Plan** fest (Anlass, Nebenfigur, Hinweis der Hexe wörtlich, kluge Lösung, Wunsch). Der Plan wird nicht vorgelesen und geht in jeden weiteren Teil mit.
5. Jeder weitere Teil bekommt: Plan, Zusammenfassung der ganzen Folge, offene Fäden, die letzten Sätze des vorigen Teils, Anknüpfung und eine Vorschau auf den nächsten Teil.
6. Vorlese-Glättung (`prepareStoryText`): kein Markdown, keine Emojis, keine Klammern oder Gedankenstriche; Ziffern, Uhrzeiten und Abkürzungen wie „z. B.“ werden zu Wörtern; Absätze bleiben. An Absätzen setzt die Stimme (Pocket) eine längere Pause, ebenso vor dem Schlusssatz.
7. Messwerte (`storyMetrics`): Wörter, Absätze, Sätze, Wörter je Satz, lange Sätze, Redeteile, „plötzlich“. Sie stehen als eine Zeile im Protokoll (nur Zahlen, nie Text). Ist ein Teil kürzer als die Hälfte der Mindestlänge, schreibt Claude ihn einmal neu, wenn noch mindestens 75 s im Zeitbudget sind.
8. Ausgabe-Check (`screenOutput`). Lehnt er ab, schreibt Claude den Teil einmal neu, wenn noch mindestens 75 s im Zeitbudget sind; sonst kommt die Ersatzgeschichte.
9. Fällt Claude mitten in einer laufenden Folge aus, rückt die Folge nicht weiter. Kunibert sagt „Kunibert muss kurz überlegen …“ (fester Text, vorab gesprochen und gespeichert), und der nächste Druck versucht denselben Teil. Erst beim zweiten Ausfall in Folge übernimmt die Ersatzgeschichte.
10. Idee des Kindes: Sagt das Kind während einer Folge per Sprechtaste, was passieren soll, ordnet Claude das als „idee“ ein. Der nächste Teil derselben Folge greift die Idee gleich am Anfang auf. Nach Teil 1 sagt der Schlusssatz, dass das geht. Hat das Kind den Teil vorher per Taste angehalten und das Gerät den Stopp gemeldet (Punkt B2, seit 21.11.2026; der Pi-Client meldet den Stopp, die Firmware noch nicht), erzählt Claude stattdessen denselben Teil ab der gehörten Stelle weiter (`RESUME_HINT` in `prompts.ts`, `server-api/stopp.ts`). Das gilt auch für „weiter“ und die Erzähltaste, dann ohne Idee. Der Rest ist kürzer bestellt, damit der ganze Teil etwa so lang bleibt wie sonst (`remainingWords` in `brain.ts`). Die Folge rückt dabei nicht vor.
11. Liegen mehr als sechs Stunden zwischen zwei Teilen, beginnt der nächste mit zwei Sätzen Erinnerung.
12. Ohne Claude: drei Ersatzfolgen mit verschiedenen Geschenken der Hexe und Listen, je nach Folgennummer.
13. Am Ende einer Folge merkt sich der Zustand die Kernidee (höchstens drei Folgen), damit die nächste Folge einen anderen Trank, Hinweis und eine andere Lösung erfindet.

## Vorbereitung des nächsten Teils (`server-api/prefetch.ts`)

Ein Teil braucht Claude (Einschätzung 20 bis 30 s) und die Sprachausgabe (Pocket auf zwei Kernen rund 37 s für 80 s Ton, gemessen am 13.11.2026). Ohne Vorbereitung wartet das Kind nach jedem Druck auf die Erzähltaste etwa eine Minute. Deshalb erzeugt der Server nach jedem ausgelieferten Teil den nächsten im Hintergrund, nach dem letzten Teil einer Folge den Anfang der nächsten. Drückt das Kind die Erzähltaste, nimmt er den fertigen Teil, wenn er zum Stand der Folge passt; läuft die Vorbereitung noch, wartet er darauf (höchstens so lange, dass danach noch 70 s für einen frischen Teil bleiben). Hat sich der Stand geändert, etwa durch eine Idee des Kindes oder einen nach einem Stopp neu erzählten Teil (dann gleicher Teil, aber neuer Zeitpunkt `at`; `prefetchKey` in `prefetch.ts`), wird das Vorbereitete verworfen. Pausen und feste Texte werden nie vorbereitet.

- Liegt nur im Arbeitsspeicher und wird beim Abholen gelöscht: ein Teil mitten in der Folge höchstens 30 Minuten (wer später weiterhört, bekommt einen frischen Teil mit kurzer Erinnerung), ein Folgenanfang höchstens 24 Stunden. Abgelaufenes löscht der Server spätestens fünf Minuten später. Enthält keine Äußerung des Kindes.
- Kosten: Hört das Kind auf (mitten in einer Folge oder nach ihrem Ende), war höchstens ein Aufruf an Claude umsonst.
- Zeitmessung: `vorbereitet_ms` (`docs/Zeitmessung.md`).
- Gemessen am 14.11.2026 in der Cloud (2 Kerne, echter Pocket-Dienst 4.0.1 mit `stuart_bell`, ohne Claude, also Ersatzgeschichte): Teil 1 kam nach 34,8 s (87 s Ton), Teil 2 und 3 nach 0,0 s, wenn man jeden Teil zu Ende hört. Drückt man sofort wieder, wartet der Server auf die laufende Vorbereitung (gemessen 19 s) statt neu anzufangen. Mit Claude kommt dessen Zeit nur noch bei Teil 1 dazu.
- Pocket am Stück oder je Absatz statt je Satz ist kaum schneller (gemessen 18,9 s und 18,4 s gegen 20,1 s für rund 150 Wörter); die Satzpausen bleiben deshalb.
- Aus mit `PICASTAI_STORY_PREFETCH=0`.

Der Zustand liegt nur im Arbeitsspeicher des Servers (je Gerät) und enthält keine Äußerungen außer dem Wunsch der laufenden Folge (höchstens 200 Zeichen, nach der Folge gelöscht). Er verfällt 24 Stunden nach der letzten Nutzung (vorläufig, Maßnahme M9; `server-api/story-states.ts`). Danach beginnt die nächste Erzählung eine neue Folge wie beim ersten Mal: mit Sprechtasten-Hinweis und ohne Gedächtnis der letzten Folgen. Die Erinnerung nach langer Pause (ab 6 Stunden) gilt also nur bis zu dieser Frist.

Der Systemtext an Claude ist für alle Teile gleich und wird mit Prompt-Caching geschickt (`llm.ts`).

## Eine ganze Folge zum Probehören (nur Erwachsene)

```powershell
# Schlüssel verdeckt eintippen, nur in der eigenen Konsole, nie in eine Datei:
$s = Read-Host "Claude-Schlüssel" -AsSecureString
$env:ANTHROPIC_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
npm run probe:folge -- folge-probe --wunsch "mit einem Einhorn"
```

Ergebnis in `folge-probe/`: `folge.md` (Plan, Texte, Messwerte, Zusammenfassungen, Zeiten, Fragen zum Bewerten) und, wenn eine Sprachausgabe konfiguriert ist (`PICASTAI_TTS_PROVIDER=pocket`, `PICASTAI_POCKET_TTS_URL`), `teil-1.wav` usw. Die Konsole zeigt nur Zahlen.

### Mehrere Folgen mit Bewertung

```powershell
npm run probe:folge -- folge-probe --anzahl 5 --bewerten
```

Erzeugt fünf Folgen nacheinander (wechselnde Wünsche: keiner, Einhorn, Fußball, zum Einschlafen, kleiner Drache), nimmt das Gedächtnis der letzten Folgen mit wie am Gerät und lässt jede Folge von Claude benoten: roter Faden, Lebendigkeit, kindgerecht, Vorlesbarkeit, Kanon, Wunsch (je 1 bis 5), dazu Begründung und ein Verbesserungsvorschlag. Übersicht mit Durchschnitten in `folge-probe/bewertung.md`, die Folgen in `folge-probe/folge-1/` usw. So lassen sich Änderungen an den Anweisungen mit Zahlen vergleichen. Die Bewertung ersetzt keinen Hörtest mit Erwachsenen. Kosten (Einschätzung): pro Folge fünf bis sechs Aufrufe an Claude.

Zum Vergleich von Modellen mit Einzelfragen bleibt `npm run eval:llm`.

## Runde 5 (14.11.2026): ein Tag, böser Drache, Ideen ohne Sprung

- Eine Folge ist genau ein Tag (Morgen, Vormittag, Nachmittag, Gegenüber mit dem Drachen, Abend). Die Teile heißen weiter `start`, `weg`, `middle`, `trick`, `finale` (`PHASE_HINTS` in `server-api/prompts.ts`).
- Die Wendung (`trick`) endet mit Kuniberts Idee als gespanntem Haltepunkt; wie die List ausgeht, erzählt das Finale, danach Abend im Gasthaus und Einschlafen. Die Folge endet nur im Finale (`brain.ts`); ein früheres `episode_finished` von Claude zählt nicht.
- Der Abschluss nach dem Finale ist „Und so endete dieser Tag von Ritter Kunibert.“ ohne Frage nach dem Weiterhören.
- Der Drache ist böse und das ferne Ziel; nie Freund, nie endgültig besiegt (Kanon, Abschnitt 3).
- Ideen per Sprechtaste (`IDEA_HINT`): erst den Moment am Ende des vorigen Teils zu Ende erzählen, dann die Idee als Nächstes; nichts überspringen, Plan bleibt.
- Lesbarkeit: höchstens zwei neue Figuren je Folge, ein Ort je Absatz, Ortswechsel ansagen.
- Leere Antwort von Claude: zweiter Versuch statt Ersatzgeschichte.

## Einordnung parallel zur Geschichte (Punkt B1, 20.11.2026, Schalter `KUNIBERT_EINORDNUNG_PARALLEL`, Standard aus)

An der Sprechtaste ordnet Claude die Äußerung erst ein (Frage, Geschichte, weiter, Idee, Sicherheit, unklar; `QUESTION_SCHEMA` in `brain.ts`). Bei einer Geschichte folgt ein zweiter Aufruf. Die Einordnung kostet rund 4 s (Einschätzung im Probelauf).

- Mit dem Schalter prüft eine Vorab-Regel (`likelyStoryTurn` in `brain.ts`), ob die Äußerung nach Geschichtenwunsch, „weiter“ oder (in einer laufenden Folge) nach einer Idee klingt. Wenn ja, startet der Server genau den Geschichtenaufruf, den die Einordnung danach verlangen würde, schon gleichzeitig mit ihr (`storyCallFor`).
- Gesprochen wird nichts, bevor die Einordnung da ist: Die fertigen Absätze bleiben zurück (`HeldSink`). Passt die Einordnung, gehen sie der Reihe nach hinaus. Sagt sie etwas anderes (Frage, Sicherheit, unklar, eine andere Art Geschichte) oder fällt sie aus, wird die frühe Geschichte verworfen, und es geht weiter wie ohne Schalter.
- Die Sicherheitsweiche läuft vorher wie immer (greift sie, startet nichts); die Kategorie „sicherheit“ der Einordnung gilt weiter; jeder Absatz geht durch den Ausgabe-Check. Beide Aufrufe sind dieselben wie ohne Schalter (gleiche Anweisungen). Im Normalfall ändert sich nur die Wartezeit.
- Grenzfälle: Die frühe Geschichte beginnt rund eine Einordnung (etwa 4 s) früher. Deshalb trifft sie bei jeder Anfrage alle Zeit-Entscheidungen früher: Uhrzeit-Werte (Schlafenszeit, Zeitpunkt des Teils), das Zeitlimit des Aufrufs an Claude (rund 4 s mehr Zeit) und die Regel für den zweiten Versuch (nur mit mindestens 75 s Restzeit, `STORY_RETRY_MIN_MS` in `brain.ts`). Fällt der erste Entwurf durch den Ausgabe-Check, kann es deshalb mit Schalter noch einen zweiten Versuch mit Claude geben, wo ohne Schalter schon die Ersatzgeschichte oder die Pause käme. Beispiel ohne Ton-Strom: Erkennung 3 s, Einordnung 4 s, erster Entwurf nach 40 s abgelehnt. Ohne Schalter bleiben 73 s (kein zweiter Versuch), mit Schalter 77 s (zweiter Versuch).
- Kosten: Liegt die Vorab-Regel daneben, ist ein Aufruf an Claude umsonst (Zeile `modus=vorab_verworfen`, `docs/Zeitmessung.md`). Der verworfene Aufruf läuft zu Ende, beginnt aber keinen zweiten Versuch mehr und schreibt keine Warnzeilen. Ein zweiter Versuch, der schon vor dem Verwerfen begann, läuft ebenfalls zu Ende. Abbrechen ist offen (Punkt N1120-2300-b).
- Daten: Die Äußerung des Kindes steht dann schon vor der Einordnung im zweiten Aufruf (derselbe Empfänger, Anthropic). Ohne Schalter bekommt Claude sie bei einem Geschichtenwunsch auch zweimal, aber erst nach der Einordnung; mit Schalter auch dann, wenn die Einordnung danach „Frage“ oder „sicherheit“ sagt. Einschätzung: für die Datenschutz-Folgenabschätzung vermerken (keine Rechtsberatung).
- Gemessen am 20.11.2026 mit Attrappen: erster Ton beim Geschichtenwunsch 9,5 s → 6,7 s, bei einer Idee 9,4 s → 6,6 s, Fragen unverändert (`docs/Zeitmessung.md`). Mit dem echten Claude nicht gemessen (offen).

## Ton-Strom (Punkt 71, 14.11.2026, Schalter `PICASTAI_AUDIO_STREAM`, Standard aus)

- Claude schreibt im Streaming (`onText` in `server-api/llm.ts`); `brain.ts` gibt jeden fertigen Absatz nach dem Ausgabe-Check an einen `StorySink`, `server-api/audio-stream.ts` vertont der Reihe nach, das Gerät spielt schon (Vertrag in `docs/picastAI-Pi-API.md`).
- Der Plan (`episode_plan`) steht im Format vor dem Text; der Stream-Leser holt nur das Feld `text` heraus. Kommt der Plan später, wartet der erste Ton entsprechend länger, mehr passiert nicht.
- Der erste Absatz eines Teils soll kurz sein (Anweisung in `prompts.ts`), damit der erste Ton früh kommt.
- Treffer des Ausgabe-Checks mitten im Teil: Pause statt Fortsetzung, Folge rückt nicht vor (siehe API-Doku).
