# Wochen-Autopilot: Fahrplan

Angelegt am 22.11.2026 von Claude (Chat), vorläufig. Gepflegt vom Lauf „Planen & Bericht“ (freitags, siehe unten).

Jeder Lauf prüft gleich beim Start mit `python3 docs/autopilot/ap.py fahrplan <Rolle>`, ob er laut dieser Tabelle arbeitet oder Pause hat. Bei Pause endet er sofort. Das kostet fast nichts vom Limit.

Warum es diesen Fahrplan gibt: Das Wochenlimit reicht nicht für alle Läufe einer Woche. In der Woche ab 20.11.2026 war es am Samstag, 21.11., gegen 23:30 aufgebraucht, nach 1,6 Tagen und 14 gemergten PRs. Danach brach jeder Lauf nach Sekunden ab, bis zum Neustart am Freitag. Betroffen waren auch die anderen geplanten Aufgaben des Betreibers (manualAI montags und donnerstags, Satya montags). Deshalb laufen unter der Woche nur wenige Läufe, im Endspurt alle.

- **Wochenmodus:** Freitag 08:00 bis Donnerstag 06:59. Ein Punkt je Lauf.
- **Endspurt:** Donnerstag 07:00 bis Freitag 07:59. Weiter, bis das Limit greift oder nichts Sinnvolles mehr offen ist.
- „arbeiten Mo Mi Fr So“ heißt: im Wochenmodus nur an diesen Tagen (Tag des Starts, Europe/Berlin), sonst Pause.

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

1. Bestimme, wann das Limit in der zu Ende gegangenen Woche zuerst griff: Laufprotokoll (Issue „Wochen-Autopilot: Laufprotokoll“; ein Termin mit „arbeiten“ ohne Start-Zeile oder ein Start ohne Ende) und die Laufübersicht (`failure_reason` „USAGE_LIMIT_REACHED“).
2. Griff es vor Donnerstag 07:00: Nimm im Wochenmodus einen Schritt weg, in dieser Reihenfolge: Recherche nur noch „arbeiten Di So“; Prüfen nur noch „arbeiten Mo Mi So“; Planen & Bericht nur noch „arbeiten Mo Mi Fr“ (freitags immer, wegen des Wochenberichts); Bauen 06:37 nur noch „arbeiten Mo Di Mi Fr Sa“.
3. Kamen im Endspurt alle Läufe ohne Abbruch am Limit durch, war Limit übrig: Gib im Wochenmodus einen Schritt dazu, zuerst die zuletzt weggenommenen, sonst in dieser Reihenfolge: Bauen 13:37 auf „arbeiten“, Recherche und Prüfen täglich, Bauen 00:37, Bauen 19:37.
4. Höchstens ein Schritt je Woche. Trag ihn unten im Verlauf ein: Datum, wann das Limit griff, was geändert ist. Die Änderung geht mit dem Planungs-PR.

## Verlauf

- 22.11.2026, Claude (Chat), vorläufig: Fahrplan angelegt. Limit der Woche ab 20.11. am Sa 21.11. gegen 23:30 erreicht (Lauf „Prüfen“ nach 10 Minuten abgebrochen, danach jeder Lauf nach Sekunden). Schätzung: Das Wochenlimit reicht für rund 6 bis 7 Stunden Arbeit mit Opus. Start mit vier bis fünf Läufen am Tag im Wochenmodus.
