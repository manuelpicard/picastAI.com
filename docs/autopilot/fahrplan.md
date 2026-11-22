# Wochen-Autopilot: Fahrplan

Angelegt am 22.11.2026 von Claude (Chat), vorläufig. Gepflegt vom Lauf „Planen & Bericht“ (freitags, siehe unten).

Jeder Lauf prüft gleich beim Start mit `python3 docs/autopilot/ap.py fahrplan <Rolle>`, ob er laut dieser Tabelle arbeitet oder Pause hat. Bei Pause endet er sofort. Das kostet fast nichts vom Limit.

Warum es diesen Fahrplan gibt: Das Wochenlimit reicht nicht für alle Läufe einer Woche. In der Woche ab 20.11.2026 war es am Samstag, 21.11., gegen 23:30 aufgebraucht, nach 1,6 Tagen und 14 gemergten PRs. Danach brach jeder Lauf nach Sekunden ab, bis zum Neustart am Freitag. Betroffen waren auch die anderen geplanten Aufgaben des Betreibers (manualAI montags und donnerstags, Satya montags). Deshalb laufen unter der Woche nur wenige Läufe, im Endspurt alle.

- **Wochenmodus:** Freitag 08:00 bis Donnerstag 06:59. Ein Punkt je Lauf.
- **Endspurt:** Donnerstag 07:00 bis Freitag 07:59. Weiter, bis das Limit greift oder nichts Sinnvolles mehr offen ist.
- „arbeiten Mo Mi Fr So“ heißt: im Wochenmodus nur an diesen Tagen (Tag des Starts, Europe/Berlin), sonst Pause.
- **Wochenbudget:** Im Wochenmodus teilen sich Bauen, Prüfen und Recherche ein Budget an Laufzeit. Es wächst gleichmäßig von Freitag 08:00 bis Donnerstag 07:00. Ein Lauf arbeitet nur, solange der Verbrauch der Woche unter dem bis dahin erlaubten Anteil liegt; sonst hat er Pause, auch wenn die Tabelle „arbeiten“ sagt. So verteilt sich die Arbeit über die Woche, und der Rest bleibt für den Endspurt. `ap.py fahrplan` rechnet den Verbrauch aus dem Laufprotokoll aus: Minuten von „Start“ bis „Ende“, Recherche zählt halb (Sonnet), ein Start ohne Ende zählt 45 Minuten. Planen & Bericht zählt nicht mit und wird nicht gebremst. Im Endspurt gilt das Budget nicht. `ap.py lage` zeigt den Stand.

Wochenbudget im Wochenmodus: 150 Minuten

| Rolle | Zeit | Wochenmodus | Endspurt |
|---|---|---|---|
| Prüfen | 23:23 | arbeiten Mo Mi Fr So | arbeiten |
| Bauen | 00:37 | Pause | arbeiten |
| Bauen | 06:37 | arbeiten | arbeiten |
| Recherche | 11:53 | arbeiten Di Fr So | arbeiten |
| Bauen | 13:37 | Pause | arbeiten |
| Planen & Bericht | 18:07 | arbeiten | arbeiten |
| Bauen | 19:37 | Pause | arbeiten |

Die Zeiten sind die der geplanten Aufgaben in der Claude-App. Ändern kann sie nur der Betreiber oder Claude im Chat, kein Lauf.

## Nachstellen (freitags, Lauf „Planen & Bericht“, mit dem Wochenbericht)

Ziel: Das Limit greift erst im Endspurt. So bleibt unter der Woche Limit für die anderen geplanten Aufgaben, und am Ende der Woche ist trotzdem alles verbraucht.

1. Bestimme, wann das Limit in der zu Ende gegangenen Woche zuerst griff: Laufprotokoll (Issue „Wochen-Autopilot: Laufprotokoll“; ein Start ohne Ende) und die Laufübersicht (`failure_reason` „USAGE_LIMIT_REACHED“).
2. Griff es vor Donnerstag 07:00: Wochenbudget um ein Viertel kleiner (auf 10 Minuten gerundet, nicht unter 60 Minuten).
3. Griff es bis Freitag 07:59 gar nicht (alle Läufe im Endspurt kamen ohne Abbruch am Limit durch): Wochenbudget um ein Viertel größer (auf 10 Minuten gerundet). Steht es schon bei 360 Minuten, stattdessen einen Termin im Wochenmodus dazu, in dieser Reihenfolge: Recherche täglich, Prüfen täglich, Bauen 19:37 auf „arbeiten“.
4. Griff es im Endspurt: nichts ändern. Das ist das Ziel.
5. Höchstens ein Schritt je Woche. Ändere nur die Zahl in der Zeile „Wochenbudget im Wochenmodus: … Minuten“ (oder den einen Termin). Trag den Schritt unten im Verlauf ein: Datum, wann das Limit griff, alter und neuer Wert. Die Änderung geht mit dem Planungs-PR.

## Verlauf

- 22.11.2026, Claude (Chat), vorläufig: Fahrplan angelegt. Limit der Woche ab 20.11. am Sa 21.11. gegen 23:30 erreicht (Lauf „Prüfen“ nach 10 Minuten abgebrochen, danach jeder Lauf nach Sekunden). Schätzung: Das Wochenlimit reicht für rund 6 bis 7 Stunden Arbeit mit Opus. Start mit vier bis fünf Läufen am Tag im Wochenmodus.
- 22.11.2026, 17:00, Claude (Chat), vorläufig: Wochenbudget eingeführt, Start mit 150 Minuten. Grund: Die Tabelle allein hätte im Wochenmodus nach Schätzung so viel Arbeit erlaubt, wie das ganze Wochenlimit hergibt (rund 6 Bauen, 4 Prüfen, 3 Recherche). Dann wäre das Limit wieder vor dem Endspurt aufgebraucht. Das Budget misst den echten Verbrauch und bremst rechtzeitig. Nachgestellt wird ab jetzt das Budget, nicht mehr die Tabelle.
