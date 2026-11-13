# Erzähler-Engine (Stand 13.11.2026)

So entsteht ein Teil einer Kunibert-Folge. Code: `server-api/brain.ts` (Ablauf, Zustand), `server-api/prompts.ts` (Texte an Claude), Kanon: `docs/Kunibert-Kanon.md`.

## Ablauf je Teil

1. Sicherheitsweiche auf den Wunsch des Kindes (wie bisher).
2. Neue Folge: Stimmung (`EPISODE_SEEDS`) und Anlass (`EPISODE_SPARKS`) werden ausgelost. Der Wunsch des Kindes gilt für die ganze Folge.
3. Rolle des Teils (`storyPhase`): Teil 1 Anfang, Teil 2 unterwegs (meist Hexe), Mitte, vorletzter Teil Wendung, letzter Teil Heimkehr. Bei drei Teilen kommt die Hexe schon in Teil 1.
4. Claude schreibt den Teil. In Teil 1 legt es zuerst einen **Plan** fest (Anlass, Nebenfigur, Hinweis der Hexe wörtlich, kluge Lösung, Wunsch). Der Plan wird nicht vorgelesen und geht in jeden weiteren Teil mit.
5. Jeder weitere Teil bekommt: Plan, Zusammenfassung der ganzen Folge, offene Fäden, die letzten Sätze des vorigen Teils, Anknüpfung und eine Vorschau auf den nächsten Teil.
6. Vorlese-Glättung (`prepareStoryText`): kein Markdown, keine Emojis, keine Klammern oder Gedankenstriche; Absätze bleiben. An Absätzen setzt die Stimme (Pocket) eine längere Pause, ebenso vor dem Schlusssatz.
7. Ausgabe-Check (`screenOutput`). Lehnt er ab, schreibt Claude den Teil einmal neu, wenn noch mindestens 75 s im Zeitbudget sind; sonst kommt die Ersatzgeschichte.
8. Am Ende einer Folge merkt sich der Zustand die Kernidee (höchstens drei Folgen), damit die nächste Folge einen anderen Trank, Hinweis und eine andere Lösung erfindet.

Der Zustand liegt nur im Arbeitsspeicher des Servers (je Gerät) und enthält keine Äußerungen außer dem Wunsch der laufenden Folge (höchstens 200 Zeichen, nach der Folge gelöscht).

Der Systemtext an Claude ist für alle Teile gleich und wird mit Prompt-Caching geschickt (`llm.ts`).

## Eine ganze Folge zum Probehören (nur Erwachsene)

```powershell
# Schlüssel verdeckt eintippen, nur in der eigenen Konsole, nie in eine Datei:
$s = Read-Host "Claude-Schlüssel" -AsSecureString
$env:ANTHROPIC_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
npm run probe:folge -- folge-probe --wunsch "mit einem Einhorn"
```

Ergebnis in `folge-probe/`: `folge.md` (Plan, Texte, Zusammenfassungen, Wortzahlen, Zeiten, Fragen zum Bewerten) und, wenn eine Sprachausgabe konfiguriert ist (`PICASTAI_TTS_PROVIDER=pocket`, `PICASTAI_POCKET_TTS_URL`), `teil-1.wav` usw. Die Konsole zeigt nur Zahlen.

Zum Vergleich von Modellen mit Einzelfragen bleibt `npm run eval:llm`.
