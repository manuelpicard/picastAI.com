# Wochen-Autopilot

Angelegt am 17.11.2026 von Claude im Auftrag des Betreibers.

Der Wochen-Autopilot sind geplante Aufgaben in der Cloud (Claude Code). Sie arbeiten ohne Rückfragen die Arbeitsliste in [`backlog.md`](backlog.md) ab. Ziel: Das wöchentliche Claude-Nutzungslimit des Betreibers fließt vollständig in echten Fortschritt für Kunibert. Neustart des Limits: freitags 08:00 (Europe/Berlin).

## Wie eine Woche läuft

| Phase | Zeit (Europe/Berlin) | Was ein Lauf tut |
|---|---|---|
| Grundlast | Fr 08:00 bis So 23:59 | einen Punkt gründlich fertig machen |
| Aufbau | Mo 00:00 bis Mi 21:59 | bis zu zwei Punkte |
| Endspurt | Mi 22:00 bis Fr 07:59 | weiterarbeiten, bis das Limit greift oder nichts Sinnvolles mehr offen ist |

## Die Aufgaben

| Aufgabe | Zeiten (Europe/Berlin) | Rolle |
|---|---|---|
| Kunibert Autopilot · Bauen | täglich 00:37, 06:37, 13:37, 19:37 | Punkte mit Rolle „Bauen“ umsetzen, testen, prüfen lassen, mergen |
| Kunibert Autopilot · Prüfen | täglich 23:23 | gemergte PRs unabhängig prüfen, Sicherheit, Datenschutz, Tests |
| Kunibert Autopilot · Recherche | täglich 11:53 | Recherche mit Quellen, Doku gegen Code |
| Kunibert Autopilot · Planen & Bericht | täglich 18:07 | Arbeitsliste pflegen und Tagesbericht; freitags zusätzlich der Wochenbericht |
| Kunibert Restlimit (Mi, Do, Fr) | Mi 22:58, Do stündlich :03, Fr 00:03 bis 07:03 | ältere Aufgaben mit eigenem Auftrag vom 13.11.: arbeiten auf `restlimit/<Jahr>-KW<nn>` in einem Entwurfs-PR. Ihr Auftrag sieht kein Mergen vor. Sein Inhalt (Story-Stand mit Ablauf, Eltern-Server-Teil, Doku) ist Punkt A1 der Arbeitsliste. Der Autopilot übernimmt Brauchbares freitags (Punkt A2 der Arbeitsliste) |

Im Endspurt arbeiten die Läufe des Autopiloten so lange weiter, bis das Limit greift. Dazu kommen die stündlichen Restlimit-Läufe.

Die Zeiten sind so gelegt, dass jedes 5-Stunden-Fenster des Nutzungslimits mit einer leichten Rolle beginnt (Prüfen 23:23, Recherche 11:53, Planen & Bericht 18:07). „Bauen“ folgt eine bis anderthalb Stunden später und nutzt den Rest des Fensters. Nur Bauen 06:37 hat keine solche Rolle davor.

## Welches Modell wofür

Wort des Betreibers vom 20.11.2026, 09:40: Für den Autopiloten gilt immer das am besten passende Modell.

- Bauen und Prüfen: Claude Opus 5.5. Diese Läufe schreiben und prüfen Code, der ohne Menschen gemergt wird.
- Recherche und Planen & Bericht: Claude Sonnet 5.5. Sie lesen, fassen zusammen und pflegen Listen. Das spart Limit.
- Unteragenten bekommen ihr Modell ausdrücklich: unabhängige Prüfung eines Diffs immer Opus; reine Abfragen und Zusammenfassungen Haiku; Teilfragen einer Recherche Sonnet; parallele Punkte im Endspurt Opus.
- Kein Claude Fable: Es verbraucht das Wochenlimit schneller, und Opus reicht für diese Arbeit.
- Läufe mit Sonnet übernehmen keine verwaisten Code-PRs und schreiben keinen Code für Server, Pi-Client, Firmware, Sicherheitsweiche oder das, was Kinder hören. Sie dürfen Recherche- und Planungs-PRs übernehmen und PRs mit „Status: fertig“ und grünen Checks mergen. Ein verwaister Code-PR bleibt also für den nächsten Lauf mit Opus liegen.

## Wie die Läufe sich abstimmen

- Von den PRs mit „[Autopilot …]“ im Titel zählen nur die, deren Branch in diesem Repo liegt (kein Fork), mit `claude/autopilot-` beginnt und die das Konto des Repo-Eigentümers angelegt hat. Das Repo ist öffentlich: Jeder kann einen PR mit so einem Titel öffnen. Fremde PRs belegen nichts. Kein Lauf mergt sie oder übernimmt ihren Branch. Der Bericht nennt sie. Dasselbe gilt für die Entwurfs-PRs der Restlimit-Aufgaben (Branch `restlimit/…` in diesem Repo, Konto des Eigentümers; siehe Punkt A2).
- Der Lauf legt seinen PR gleich beim Start an, nachdem er die offenen PRs gezählt hat. Ein Punkt ist belegt, solange ein offener PR mit `[Autopilot <ID>]` im Titel existiert. Die erste Zeile des PR-Texts sagt „Status: in Arbeit (…)“, „Status: fertig“ oder „Status: blockiert (Grund)“.
- Lebenszeichen: Wer an einem PR „in Arbeit“ arbeitet, setzt die Uhrzeit in dessen Status-Zeile spätestens alle 20 Minuten neu (bei jedem Push und beim Warten auf die CI).
- Ein PR „in Arbeit“ gilt als verwaist, wenn diese Uhrzeit mehr als 60 Minuten alt ist. Meist hat dann das Nutzungslimit den Lauf abgebrochen. Der nächste Lauf übernimmt ihn zuerst.
- Das 5-Stunden-Limit greift oft nach 30 bis 60 Minuten Arbeit. Deshalb schneiden die Läufe große Punkte in Teile, die in rund 30 Minuten fertig sind, und pushen spätestens alle 20 Minuten.
- Ein PR „fertig“ mit rotem Check: Ein anderer Lauf repariert ihn erst, wenn der letzte Push mehr als eine Stunde her ist. Vorher repariert ihn der Lauf, der ihn auf „fertig“ gesetzt hat.
- Ein PR „blockiert“ wird nicht angefasst und zählt bei der Höchstzahl unten nicht mit. Der Lauf „Planen & Bericht“ setzt den Punkt in der Arbeitsliste auf „blockiert (Grund)“, nennt ihn im Bericht und schließt den PR. Der Branch bleibt.
- Sind drei (im Endspurt sechs) Autopilot-PRs offen, macht ein Lauf erst einen davon fertig, bevor er Neues beginnt. Darf er keinen davon anfassen (frisch „in Arbeit“ oder „fertig“ und rot seit weniger als einer Stunde), beginnt er nichts Neues. Er macht dann nur Arbeit ohne eigenen Punkt (zum Beispiel Prüfungen) und berichtet.
- Erledigt ist ein Punkt, wenn sein PR gemergt ist. Der PR setzt den Status in `backlog.md` selbst.
- Braucht ein Punkt mehrere PRs, steht „Teil k von n“ im PR-Text. Ein Teil vor dem letzten setzt den Status auf „offen (Teil k von n erledigt, PR #x)“. Erst der letzte Teil setzt „erledigt“. Punkte mit „Nach …“ warten bis dahin.
- Jeder PR wird vor dem Merge von einem unabhängigen Unteragenten geprüft. Gemergt wird nur, wenn alle Checks des letzten Commits fertig und grün sind und mindestens `test`, `pi-audio` und `firestore-emulator` gelaufen sind. Fehlt ein Check, wird nicht gemergt.
- Ist `main` rot, hat die Reparatur Vorrang vor allem anderen.
- Branches löschen geht aus den Läufen bisher nicht: Die Cloud-Umgebung sperrt es (HTTP 403 am 20. und 21.11.2026). Scheitert das Löschen, keinen Umweg suchen. Der Bericht nennt Branch und letzten Commit-Hash, der Betreiber löscht ihn auf GitHub (Seite „Branches“). Den Branch eines gemergten PRs löscht GitHub selbst.

## Wo die Ergebnisse stehen

- Code und Doku: gemergte PRs mit `[Autopilot` im Titel, je mit Abschnitt „Bericht“.
- Recherchen: `docs/recherche/`.
- Tagesbericht und Wochenbericht: im Claude-Projekt des Betreibers (nicht im Repo).

## Feste Grenzen

- Nie direkt auf `main`, kein Force-Push, kein Merge bei rotem oder fehlendem Check.
- Nichts bestellen, kaufen oder bezahlen. Keine Nachrichten an Dritte. Kein Deploy, keine DNS-Änderung.
- Kein Lauf ändert Repo-Einstellungen, Branch-Schutz oder geplante Aufgaben. Kein Lauf löscht Repos, Konten oder Domains.
- Keine Schlüssel, Tokens oder Passwörter. Keine personenbezogenen Daten: Das Repo ist öffentlich.
- Sprachmodell ist Claude. Die Sicherheitsweiche wird nie aufgeweicht. Was Kinder hören, ändert nur ein eigener PR mit „(ändert, was Kinder hören)“ im Titel.
- Bis zur Rechtsprüfung testen nur Erwachsene.

## Anhalten

In der Claude-App unter „Geplante Aufgaben“ (oder auf claude.ai/code/routines) die Aufgaben „Kunibert Autopilot · …“ ausschalten. Die Aufgaben „Kunibert Restlimit (Mi)“, „(Do)“ und „(Fr)“ laufen getrennt davon. Wer alles anhalten will, schaltet sie mit aus. Ausschalten löscht nichts.
