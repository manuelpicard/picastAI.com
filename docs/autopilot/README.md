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
| Kunibert Autopilot · Bauen | täglich 00:07, 06:07, 13:07, 19:07 | Punkte mit Rolle „Bauen“ umsetzen, testen, prüfen lassen, mergen |
| Kunibert Autopilot · Prüfen | täglich 03:07, 16:07 | gemergte PRs unabhängig prüfen, Sicherheit, Datenschutz, Tests |
| Kunibert Autopilot · Recherche | täglich 10:37 | Recherche mit Quellen, Doku gegen Code |
| Kunibert Autopilot · Planen & Bericht | täglich 09:13 und 22:13 | Arbeitsliste pflegen; abends Tagesbericht, freitags Wochenbericht |
| Kunibert Restlimit (Mi, Do, Fr) | Mi 22:58, Do stündlich :03, Fr 00:03 bis 07:03 | ältere Aufgaben mit eigenem Auftrag vom 13.11.: arbeiten auf `restlimit/<Jahr>-KW<nn>` in einem Entwurfs-PR und mergen nicht. Der Autopilot übernimmt Brauchbares freitags (Punkt A2 der Arbeitsliste) |

Im Endspurt arbeiten die Läufe des Autopiloten so lange weiter, bis das Limit greift. Dazu kommen die stündlichen Restlimit-Läufe.

## Wie die Läufe sich abstimmen

- Ein Punkt ist belegt, solange ein offener PR mit `[Autopilot <ID>]` im Titel existiert. Die erste Zeile des PR-Texts sagt „Status: in Arbeit (…)“ oder „Status: fertig“.
- Ein PR „in Arbeit“ ohne Push seit mehr als 4 Stunden gilt als verwaist. Der nächste Lauf übernimmt ihn.
- Sind drei (im Endspurt sechs) Autopilot-PRs offen, macht ein Lauf erst einen davon fertig, bevor er Neues beginnt.
- Erledigt ist ein Punkt, wenn sein PR gemergt ist. Der PR setzt den Status in `backlog.md` selbst.
- Jeder PR wird vor dem Merge von einem unabhängigen Unteragenten geprüft. Gemergt wird nur, wenn alle Checks grün sind.
- Ist `main` rot, hat die Reparatur Vorrang vor allem anderen.

## Wo die Ergebnisse stehen

- Code und Doku: gemergte PRs mit `[Autopilot` im Titel, je mit Abschnitt „Bericht“.
- Recherchen: `docs/recherche/`.
- Tagesbericht und Wochenbericht: im Claude-Projekt des Betreibers (nicht im Repo).

## Feste Grenzen

- Nie direkt auf `main`, kein Force-Push, kein Merge bei rotem Check.
- Nichts bestellen, kaufen oder bezahlen. Keine Nachrichten an Dritte. Kein Deploy, keine DNS-Änderung, keine Änderung an Repo-Einstellungen.
- Keine Schlüssel, Tokens oder Passwörter. Keine personenbezogenen Daten: Das Repo ist öffentlich.
- Sprachmodell ist Claude. Die Sicherheitsweiche wird nie aufgeweicht. Was Kinder hören, ändert nur ein eigener PR mit „(ändert, was Kinder hören)“ im Titel.
- Bis zur Rechtsprüfung testen nur Erwachsene.

## Anhalten

In der Claude-App unter „Geplante Aufgaben“ (oder auf claude.ai/code/routines) die Aufgaben „Kunibert Autopilot · …“ ausschalten. Ausschalten löscht nichts.
