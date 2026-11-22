# Wochen-Autopilot

Angelegt am 17.11.2026 von Claude im Auftrag des Betreibers.

Der Wochen-Autopilot sind geplante Aufgaben in der Cloud (Claude Code). Sie arbeiten ohne Rückfragen die Arbeitsliste in [`backlog.md`](backlog.md) ab. Ziel: Das wöchentliche Claude-Nutzungslimit des Betreibers fließt vollständig in echten Fortschritt für Kunibert. Neustart des Limits: freitags 08:00 (Europe/Berlin).

## Wie eine Woche läuft

Das Wochenlimit reicht nur für einen Teil der Woche (Schätzung nach der Woche ab 20.11.2026: rund 6 bis 7 Stunden Arbeit mit Opus). Ohne Bremse war es nach 1,6 Tagen aufgebraucht; danach brach jeder Lauf ab, auch die anderen geplanten Aufgaben des Betreibers. Deshalb gibt es zwei Phasen:

| Phase | Zeit (Europe/Berlin) | Was ein Lauf tut |
|---|---|---|
| Wochenmodus | Fr 08:00 bis Do 06:59 | nur die Termine, die der [Fahrplan](fahrplan.md) auf „arbeiten“ setzt; ein Punkt je Lauf |
| Endspurt | Do 07:00 bis Fr 07:59 | alle Termine; weiterarbeiten, bis das Limit greift oder nichts Sinnvolles mehr offen ist |

Jeder Lauf fragt beim Start `python3 docs/autopilot/ap.py fahrplan <Rolle>`. Bei Pause endet er sofort. Im Wochenmodus bremst zusätzlich das Wochenbudget den Lauf „Bauen“: Die erlaubte Laufzeit wächst gleichmäßig bis Donnerstag 07:00; Bauen, Prüfen und Recherche zählen zum Verbrauch, das Programm misst ihn im Laufprotokoll. Höchstens 15 geplante Aufgaben starten am Tag (alle zusammen); der Autopilot hat 10 Termine. Der Lauf „Planen & Bericht“ stellt das Budget freitags nach: Griff das Limit vor dem Endspurt, ein Viertel weniger; griff es gar nicht, ein Viertel mehr (Regeln in [`fahrplan.md`](fahrplan.md)).

## Die Aufgaben

| Aufgabe | Zeiten (Europe/Berlin) | Modell | Rolle |
|---|---|---|---|
| Kunibert Autopilot · Bauen | täglich 00:37, 03:37, 06:37, 09:37, 13:37, 19:37, 21:37 | Claude Opus 5.5 | Punkte mit Rolle „Bauen“ umsetzen, testen, prüfen lassen, mergen |
| Kunibert Autopilot · Prüfen | täglich 23:23 | Claude Opus 5.5 | gemergte PRs unabhängig prüfen, Sicherheit, Datenschutz, Tests; Punkte mit Rolle „Prüfen“ |
| Kunibert Autopilot · Recherche | täglich 11:53 | Claude Sonnet 5.5 | Recherche mit Quellen; ist keine offen, ein Routine-Punkt (Doku, Tests, Werkzeuge) |
| Kunibert Autopilot · Planen & Bericht | täglich 18:07 | Claude Sonnet 5.5 | Arbeitsliste pflegen und Tagesbericht; freitags zusätzlich Wochenbericht und Fahrplan |
| Kunibert Restlimit (Mi, Do, Fr) | Mi 22:58, Do stündlich :03, Fr 00:03 bis 07:03 | Claude Sonnet 5.5 | ältere Aufgaben mit eigenem Auftrag vom 13.11.: arbeiten auf `restlimit/<Jahr>-KW<nn>` in einem Entwurfs-PR, ohne Mergen. Ihr Inhalt ist erledigt (A1). Der Autopilot übernimmt Brauchbares freitags (Punkt A2). Einschätzung: überflüssig; ausschalten kann sie nur der Betreiber |

Die Zeiten sind so gelegt, dass ein 5-Stunden-Fenster des Nutzungslimits mit einem Lauf von Prüfen (23:23), Recherche (11:53) oder Planen & Bericht (18:07) beginnt. „Bauen“ folgt gut eine bis knapp zwei Stunden später und nutzt im Endspurt den Rest des Fensters. Bauen 06:37 beginnt ein Fenster allein; das ist der Bauen-Termin im Wochenmodus.

## Welches Modell wofür

Wort des Betreibers vom 20.11.2026, 09:40: Für den Autopiloten gilt immer das am besten passende Modell.

- Bauen und Prüfen: Claude Opus 5.5. Diese Läufe schreiben und prüfen Code, der ohne Menschen gemergt wird.
- Recherche und Planen & Bericht: Claude Sonnet 5.5. Sie lesen, fassen zusammen und pflegen Listen. Sonnet kostet je Token die Hälfte von Opus.
- Unteragenten bekommen ihr Modell ausdrücklich: unabhängige Prüfung eines Diffs immer Opus; reine Abfragen und Zusammenfassungen Haiku; Teilfragen einer Recherche Sonnet; parallele Bauen-Punkte im Endspurt Opus.
- Kein Claude Fable: Es verbraucht das Wochenlimit schneller; höchstens die Hälfte des Wochenlimits darf darauf entfallen. Opus reicht für diese Arbeit.
- Läufe mit Sonnet übernehmen keine verwaisten Code-PRs und schreiben keinen Code für Server, Pi-Client, Firmware, Sicherheitsweiche oder das, was Kinder hören. Sie dürfen Doku, Tests und die Werkzeuge des Autopiloten ändern, Recherche- und Planungs-PRs übernehmen und PRs mit „Status: fertig“ und grünen Checks mergen. Ein verwaister Code-PR bleibt für den nächsten Lauf mit Opus liegen.

## Werkzeuge

Sie sparen den Läufen Schritte und Limit. Die Regeln stehen im Auftrag der Läufe und hier; die Werkzeuge setzen sie nur um. Meldet ein Werkzeug einen Fehler, geht es von Hand mit `gh api` weiter.

| Aufruf (im Repo-Ordner) | Was er tut |
|---|---|
| `python3 docs/autopilot/ap.py fahrplan <Rolle>` | sagt, ob der Lauf laut Fahrplan und Wochenbudget arbeitet (Rückgabe 0) oder Pause hat (10); kann das Programm das Laufprotokoll nicht lesen, arbeitet der Lauf |
| `python3 docs/autopilot/ap.py lage` | Zeit und Phase, CI auf `main`, offene PRs mit Einstufung (eigen, fremd, verwaist, belegt, fertig), gemergte PRs ohne Prüfung, Überfälliges, freie Punkte je Rolle, Laufprotokoll der letzten 24 Stunden |
| `python3 docs/autopilot/ap.py status <PR> in-arbeit` | setzt die Status-Zeile mit der aktuellen Uhrzeit (Lebenszeichen); auch `fertig` oder `"blockiert: <Grund>"` |
| `AP_PR=<PR> bash docs/autopilot/pruefen.sh` | alle Prüfungen aus `CLAUDE.md`, je eine Zeile; bei Fehlern die letzten 40 Zeilen; setzt dabei das Lebenszeichen. `--schnell`: nur Tests und Lint |
| `python3 docs/autopilot/ap.py mergen <PR>` | nur eigene PRs mit „Status: fertig“: prüft den Stand von `main`, wartet auf die Checks (höchstens 6 Minuten), mergt nur bei Grün und wartet auf die CI von `main`. Rückgabe 0 gemergt, 1 rot, 2 läuft noch, 3 erst `main` einmergen, 4 nicht erlaubt, 5 `main` danach rot |
| `python3 docs/autopilot/ap.py lauf <Rolle> start` / `… ende "<Ergebnis>"` | eine Zeile im Issue „Wochen-Autopilot: Laufprotokoll“ |
| `python3 docs/autopilot/ap.py bericht <Datei>` | Bericht ins Issue „Wochen-Autopilot: Berichte“, wenn das Claude-Projekt nicht erreichbar ist |

Kommentare im Laufprotokoll und „Autopilot-Prüfung“-Kommentare zählen nur, wenn das Konto des Repo-Eigentümers sie geschrieben hat. Die Tests der Werkzeuge: `python3 -m unittest discover -s docs/autopilot -p "test_*.py"` (läuft in der CI).

## Wie die Läufe sich abstimmen

- Von den PRs mit „[Autopilot …]“ im Titel zählen nur die, deren Branch in diesem Repo liegt (kein Fork), mit `claude/autopilot-` beginnt und die das Konto des Repo-Eigentümers angelegt hat. Das Repo ist öffentlich: Jeder kann einen PR mit so einem Titel öffnen. Fremde PRs belegen nichts. Kein Lauf mergt sie oder übernimmt ihren Branch. Der Bericht nennt sie. Dasselbe gilt für die Entwurfs-PRs der Restlimit-Aufgaben (Branch `restlimit/…` in diesem Repo, Konto des Eigentümers; siehe Punkt A2).
- Der Lauf legt seinen PR gleich beim Start an, nachdem er die offenen PRs gezählt hat. Ein Punkt ist belegt, solange ein offener PR mit `[Autopilot <ID>]` im Titel existiert. Die erste Zeile des PR-Texts sagt „Status: in Arbeit (…)“, „Status: fertig“ oder „Status: blockiert (Grund)“.
- Lebenszeichen: Wer an einem PR „in Arbeit“ arbeitet, setzt die Uhrzeit in dessen Status-Zeile spätestens alle 20 Minuten neu (bei jedem Push und beim Warten auf die CI). Form: „Status: in Arbeit (TT.MM. HH:MM)“, Uhrzeit in Europe/Berlin (nicht UTC).
- Ein PR „in Arbeit“ gilt als verwaist, wenn diese Uhrzeit mehr als 60 Minuten alt ist. Meist hat dann das Nutzungslimit den Lauf abgebrochen. Der nächste passende Lauf übernimmt ihn zuerst. Fehlt die Uhrzeit, zählt die Zeit des letzten Commits.
- Das Limit kann jederzeit greifen, auch das 5-Stunden-Fenster. Deshalb schneiden die Läufe große Punkte in Teile, die in rund 30 Minuten fertig sind, und pushen spätestens alle 20 Minuten.
- Überfälliges zuerst: Wurde seit über 30 Stunden keine Planung gemergt, pflegt der nächste Lauf kurz die Arbeitsliste. Gemergte PRs, die älter als 36 Stunden sind und keine „Autopilot-Prüfung“ haben, prüft der nächste Lauf mit Opus zuerst. Planungs-PRs brauchen keine zweite Prüfung.
- Ein PR „fertig“ mit rotem Check: Ein anderer Lauf repariert ihn erst, wenn der letzte Push mehr als eine Stunde her ist. Vorher repariert ihn der Lauf, der ihn auf „fertig“ gesetzt hat.
- Ein PR „blockiert“ wird nicht angefasst und zählt bei der Höchstzahl unten nicht mit. Der Lauf „Planen & Bericht“ setzt den Punkt in der Arbeitsliste auf „blockiert (Grund)“, nennt ihn im Bericht und schließt den PR. Der Branch bleibt.
- Sind drei (im Endspurt sechs) Autopilot-PRs offen, macht ein Lauf erst einen davon fertig, bevor er Neues beginnt. Darf er keinen davon anfassen (frisch „in Arbeit“ oder „fertig“ und rot seit weniger als einer Stunde), beginnt er nichts Neues. Er macht dann nur Arbeit ohne eigenen Punkt (zum Beispiel Prüfungen) und berichtet.
- Erledigt ist ein Punkt, wenn sein PR gemergt ist. Der PR setzt den Status in `backlog.md` selbst.
- Braucht ein Punkt mehrere PRs, steht „Teil k von n“ im PR-Text. Ein Teil vor dem letzten setzt den Status auf „offen (Teil k von n erledigt, PR #x)“. Erst der letzte Teil setzt „erledigt“. Punkte mit „Nach …“ warten bis dahin.
- Jeder PR wird vor dem Merge von einem unabhängigen Unteragenten (Opus) geprüft. Gemergt wird nur, wenn alle Checks des letzten Commits fertig und grün sind und mindestens `test`, `pi-audio` und `firestore-emulator` mit Erfolg gelaufen sind. Fehlt ein Check, wird nicht gemergt.
- Ist `main` rot, hat die Reparatur Vorrang vor allem anderen.
- Branches löschen geht aus den Läufen bisher nicht: Die Cloud-Umgebung sperrt es (HTTP 403 am 20. und 21.11.2026). Scheitert das Löschen, keinen Umweg suchen. Der Bericht nennt Branch und letzten Commit-Hash, der Betreiber löscht ihn auf GitHub (Seite „Branches“). Den Branch eines gemergten PRs löscht GitHub selbst.

## Wo die Ergebnisse stehen

- Code und Doku: gemergte PRs mit `[Autopilot` im Titel, je mit Abschnitt „Bericht“.
- Recherchen: `docs/recherche/`.
- Tagesbericht und Wochenbericht: im Claude-Projekt des Betreibers (nicht im Repo).
- Start und Ende jedes Laufs: Issue „Wochen-Autopilot: Laufprotokoll“.

## Feste Grenzen

- Nie direkt auf `main`, kein Force-Push, kein Merge bei rotem oder fehlendem Check.
- Nichts bestellen, kaufen oder bezahlen. Keine Nachrichten an Dritte. Kein Deploy, keine DNS-Änderung.
- Kein Lauf ändert Repo-Einstellungen, Branch-Schutz oder geplante Aufgaben. Kein Lauf löscht Repos, Konten oder Domains.
- Keine Schlüssel, Tokens oder Passwörter. Keine personenbezogenen Daten: Das Repo ist öffentlich.
- Sprachmodell ist Claude. Die Sicherheitsweiche wird nie aufgeweicht. Was Kinder hören, ändert nur ein eigener PR mit „(ändert, was Kinder hören)“ im Titel.
- Bis zur Rechtsprüfung testen nur Erwachsene.

## Anhalten

In der Claude-App unter „Geplante Aufgaben“ (oder auf claude.ai/code/routines) die Aufgaben „Kunibert Autopilot · …“ ausschalten. Die Aufgaben „Kunibert Restlimit (Mi)“, „(Do)“ und „(Fr)“ laufen getrennt davon. Wer alles anhalten will, schaltet sie mit aus. Ausschalten löscht nichts. Langsamer oder schneller: im [Fahrplan](fahrplan.md) das Wochenbudget ändern oder Termine auf „Pause“ oder „arbeiten“ setzen.
