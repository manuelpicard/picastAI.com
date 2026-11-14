# Erzähler-Engine (Stand 13.11.2026, nachts)

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
10. Idee des Kindes: Sagt das Kind während einer Folge per Sprechtaste, was passieren soll, ordnet Claude das als „idee“ ein. Der nächste Teil derselben Folge greift die Idee gleich am Anfang auf. Nach Teil 1 sagt der Schlusssatz, dass das geht.
11. Liegen mehr als sechs Stunden zwischen zwei Teilen, beginnt der nächste mit zwei Sätzen Erinnerung.
12. Ohne Claude: drei Ersatzfolgen mit verschiedenen Geschenken der Hexe und Listen, je nach Folgennummer.
13. Am Ende einer Folge merkt sich der Zustand die Kernidee (höchstens drei Folgen), damit die nächste Folge einen anderen Trank, Hinweis und eine andere Lösung erfindet.

## Vorbereitung des nächsten Teils (`server-api/prefetch.ts`)

Ein Teil braucht Claude (Einschätzung 20 bis 30 s) und die Sprachausgabe (Pocket auf zwei Kernen rund 37 s für 80 s Ton, gemessen am 13.11.2026). Ohne Vorbereitung wartet das Kind nach jedem Druck auf die Erzähltaste etwa eine Minute. Deshalb erzeugt der Server nach jedem ausgelieferten Teil den nächsten im Hintergrund, nach dem letzten Teil einer Folge den Anfang der nächsten. Drückt das Kind die Erzähltaste, nimmt er den fertigen Teil, wenn er zum Stand der Folge passt; läuft die Vorbereitung noch, wartet er darauf (höchstens so lange, dass danach noch 70 s für einen frischen Teil bleiben). Hat sich der Stand geändert, etwa durch eine Idee des Kindes, wird das Vorbereitete verworfen. Pausen und feste Texte werden nie vorbereitet.

- Liegt nur im Arbeitsspeicher und wird beim Abholen gelöscht: ein Teil mitten in der Folge höchstens 30 Minuten (wer später weiterhört, bekommt einen frischen Teil mit kurzer Erinnerung), ein Folgenanfang höchstens 24 Stunden. Enthält keine Äußerung des Kindes.
- Kosten: Hört das Kind auf (mitten in einer Folge oder nach ihrem Ende), war höchstens ein Aufruf an Claude umsonst.
- Zeitmessung: `vorbereitet_ms` (`docs/Zeitmessung.md`).
- Aus mit `PICASTAI_STORY_PREFETCH=0`.

Der Zustand liegt nur im Arbeitsspeicher des Servers (je Gerät) und enthält keine Äußerungen außer dem Wunsch der laufenden Folge (höchstens 200 Zeichen, nach der Folge gelöscht).

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
