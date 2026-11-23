# Wochen-Autopilot: Fahrplan

Angelegt am 22.11.2026 von Claude (Chat), vorläufig. Gepflegt vom Lauf „Planen & Bericht“ (im ersten Lauf nach dem Neustart des Wochenlimits, siehe unten).

Jeder Lauf prüft gleich beim Start mit `python3 docs/autopilot/ap.py fahrplan <Rolle>`, ob er laut dieser Tabelle arbeitet oder Pause hat. Bei Pause endet er sofort. Das kostet fast nichts vom Limit.

Warum es diesen Fahrplan gibt: Das Wochenlimit reicht nicht für alle Läufe einer Woche. In der Woche ab 20.11.2026 war es am Samstag, 21.11., gegen 23:30 aufgebraucht, nach 1,6 Tagen und 14 gemergten PRs. Danach brach jeder Lauf nach Sekunden ab, bis zum Neustart am Freitag. Betroffen waren auch die anderen geplanten Aufgaben des Betreibers (manualAI montags und donnerstags, Satya montags). Deshalb laufen unter der Woche nur wenige Läufe, im Endspurt alle. Seit 22.11.2026, 17:31 hat der Betreiber einen größeren Tarif (Max): Das Wochenlimit ist größer, und es starten höchstens 15 geplante Aufgaben am Tag.

Neustart des Wochenlimits: Fr 08:00

Das Wochenlimit beginnt freitags um 08:00 neu (Wort des Betreibers, 22.11.2026, 17:52). Mit dem Wechsel zum Max-Tarif begann es einmalig am So 22.11. gegen 17:49 neu. Ändert sich der Neustart, nur diese Zeile anpassen; `ap.py` rechnet Phase, Endspurt und Wochenbudget daraus.

- **Wochenmodus:** vom Neustart bis 25 Stunden vor dem nächsten (jetzt Fr 08:00 bis Do 06:59). Ein Punkt je Lauf.
- **Endspurt:** die letzten 25 Stunden vor dem Neustart (jetzt Do 07:00 bis Fr 07:59). Weiter, bis das Limit greift oder nichts Sinnvolles mehr offen ist.
- „arbeiten Mo Mi Fr So“ heißt: im Wochenmodus nur an diesen Tagen (Tag des Starts, Europe/Berlin), sonst Pause.
- **Tageslimit:** Höchstens 15 geplante Aufgaben starten am Tag, alle zusammen (auch Läufe mit Pause und die anderen Aufgaben des Betreibers). Der Autopilot hat 7 Termine am Tag. Die Restlimit-Aufgaben hat der Betreiber am 22.11.2026 gelöscht.
- **Wochenbudget:** Im Wochenmodus bremst ein Budget an Laufzeit den Lauf „Bauen“. Prüfen, Recherche und Planen & Bericht laufen immer, wenn die Tabelle „arbeiten“ sagt; Prüfen und Recherche zählen aber zum Verbrauch. Es wächst gleichmäßig vom Neustart bis zum Endspurt. Ein Lauf arbeitet nur, solange der Verbrauch der Woche unter dem bis dahin erlaubten Anteil liegt; sonst hat er Pause, auch wenn die Tabelle „arbeiten“ sagt. So verteilt sich die Arbeit über die Woche, und der Rest bleibt für den Endspurt. `ap.py fahrplan` rechnet den Verbrauch aus dem Laufprotokoll aus: Minuten von „Start“ bis „Ende“, Recherche zählt halb (Sonnet), ein Start ohne Ende zählt 45 Minuten. Planen & Bericht zählt nicht mit. Im Endspurt gilt das Budget nicht. `ap.py lage` zeigt den Stand.

Wochenbudget im Wochenmodus: 1200 Minuten

| Rolle | Zeit | Wochenmodus | Endspurt |
|---|---|---|---|
| Prüfen | 23:23 | arbeiten | arbeiten |
| Bauen | 00:37 | arbeiten | arbeiten |
| Bauen | 06:37 | arbeiten | arbeiten |
| Recherche | 11:53 | arbeiten | arbeiten |
| Bauen | 13:37 | arbeiten | arbeiten |
| Planen & Bericht | 18:07 | arbeiten | arbeiten |
| Bauen | 19:37 | arbeiten | arbeiten |

Die Zeiten sind die der geplanten Aufgaben in der Claude-App. Ändern kann sie nur der Betreiber oder Claude im Chat, kein Lauf. Die Liste der Termine im Auftragstext ist älter; es gilt diese Tabelle.

## Nachstellen (erster Lauf „Planen & Bericht“ nach dem Neustart, mit dem Wochenbericht)

Ziel: Das Limit greift erst im Endspurt. So bleibt unter der Woche Limit für die anderen geplanten Aufgaben, und am Ende der Woche ist trotzdem alles verbraucht.

1. Bestimme, wann das Wochenlimit in der zu Ende gegangenen Woche zuerst griff: Laufprotokoll (Issue „Wochen-Autopilot: Laufprotokoll“; ein Start ohne Ende) und die Laufübersicht (`failure_reason` „USAGE_LIMIT_REACHED“). Abbrüche an einem Tag mit mehr als 15 gestarteten Aufgaben zählen nicht: Liefen danach noch vor dem Neustart wieder Läufe, war es das Tageslimit, nicht das Wochenlimit.
2. Griff es vor dem Endspurt: Wochenbudget um ein Viertel kleiner (auf 10 Minuten gerundet, nicht unter 60 Minuten).
3. Griff es bis zum Neustart gar nicht: Wochenbudget um ein Viertel größer (auf 10 Minuten gerundet, höchstens 1800 Minuten). Steht es schon bei 1800 Minuten, nichts ändern und im Wochenbericht melden: Dann sollte Claude im Chat mehr Termine oder mehrere Punkte je Lauf einrichten.
4. Griff es im Endspurt: nichts ändern. Das ist das Ziel.
5. Höchstens ein Schritt je Woche. Ändere nur die Zahl in der Zeile „Wochenbudget im Wochenmodus: … Minuten“. Trag den Schritt unten im Verlauf ein: Datum, wann das Limit griff, alter und neuer Wert. Die Änderung geht mit dem Planungs-PR.

## Verlauf

- 22.11.2026, Claude (Chat), vorläufig: Fahrplan angelegt. Limit der Woche ab 20.11. am Sa 21.11. gegen 23:30 erreicht (Lauf „Prüfen“ nach 10 Minuten abgebrochen, danach jeder Lauf nach Sekunden). Schätzung: Das Wochenlimit reicht für rund 6 bis 7 Stunden Arbeit mit Opus. Start mit vier bis fünf Läufen am Tag im Wochenmodus.
- 22.11.2026, 17:00, Claude (Chat), vorläufig: Wochenbudget eingeführt, Start mit 150 Minuten. Grund: Die Tabelle allein hätte im Wochenmodus nach Schätzung so viel Arbeit erlaubt, wie das ganze Wochenlimit hergibt (rund 6 Bauen, 4 Prüfen, 3 Recherche). Dann wäre das Limit wieder vor dem Endspurt aufgebraucht. Das Budget misst den echten Verbrauch und bremst rechtzeitig. Nachgestellt wird ab jetzt das Budget, nicht mehr die Tabelle.
- 22.11.2026, 17:45, Claude (Chat), vorläufig: Max-Tarif. Wochenbudget 150 → 1200 Minuten (das Wochenlimit ist ein Vielfaches; in dieser Woche bremst der Donnerstag wegen der Restlimit-Aufgaben). Bauen hat 7 Termine (neu 03:37, 09:37, 21:37), alle Termine arbeiten im Wochenmodus, gebremst wird nur Bauen. 10 Termine am Tag lassen Platz im Tageslimit von 15 für die anderen Aufgaben des Betreibers; freitags reicht es mit den Restlimit-Aufgaben noch für „Planen & Bericht“ um 18:07. Quelle Tageslimit: claude.com, „Introducing routines in Claude Code“ (14.04.2026), abgerufen 22.11.2026.
- 22.11.2026, 17:55, Claude (Chat), vorläufig: Berichtigung zu 17:45. Die drei weiteren Bauen-Termine (03:37, 09:37, 21:37) hat das System für Claude gesperrt; sie brauchen das Wort des Betreibers. Es bleiben die 4 echten Bauen-Termine, zusammen 7 Termine des Autopiloten am Tag (nicht 10). Alle Termine arbeiten im Wochenmodus, gebremst wird nur Bauen. Mit 7 Terminen bleibt im Tageslimit von 15 Platz für die anderen Aufgaben des Betreibers (die Restlimit-Aufgaben sind seit 17:49 gelöscht, siehe 18:00). (Am 23.11.2026 vom Lauf „Planen & Bericht“ nachgetragen, nach der Prüfung von #85: Dort war der Eintrag 17:45 umgeschrieben worden; er steht jetzt wieder wie in #84. Die Zeit 17:55 nennt die Prüfung von #85; gemergt wurde #85 um 17:44.)
- 22.11.2026, 18:00, Claude (Chat), vorläufig: Neustart als eigene Zeile im Fahrplan (Fr 08:00, Wort des Betreibers 17:52). Mit dem Wechsel zum Max-Tarif begann das Wochenlimit einmalig am So 22.11. gegen 17:49 neu. Restlimit-Aufgaben vom Betreiber gelöscht (17:49).
