# Aufgaben

> Hinweis: Diese Datei lag beim Nachtrag am 2026-11-07 nicht im Repo (weder auf `main` noch auf einem anderen Branch). Sie wurde neu angelegt und enthält nur Punkt 23. Die Punkte 1 bis 22 und alle weiteren müssen aus der lokalen Fassung übernommen werden.

## 23. Firestore-Gerätespeicher gegen den Emulator testen

**Status: Test erledigt (9 von 9 grün, 2026-11-07). Offen: PR prüfen, CI-Lauf abwarten, zusammenführen (du).**

- [x] Gerät anlegen, anmelden, Server neu starten, Gerät noch da, Token gilt weiter (`PICASTAI_DEVICE_STORE=firestore`, Emulator).
- [x] In Firestore steht nur der Token-Hash; falsche Tokens ergeben 401; Widerruf bleibt nach Neustart bestehen.
- [x] Regeln „deny all“ sperren Clients beim Lesen und Schreiben. Gegenprobe mit absichtlich offenen Regeln schlägt fehl, der Test ist also wirksam.
- [x] Test und CI-Job liegen auf dem Branch `claude/firestore-emulator-test` (Commit `4fb85e0`), nicht in `npm test`, Emulator nur im CI-Job.
- [ ] PR für `claude/firestore-emulator-test` öffnen bzw. prüfen, ob er schon existiert. Nicht zusammenführen, bevor der Job `firestore-emulator` auf GitHub grün gelaufen ist.
- [ ] Außerhalb des Emulators prüfen: Dienstkonto-Rechte (IAM), ob `firestore.rules` in der echten Datenbank veröffentlicht ist (`firebase deploy --only firestore:rules` bzw. Konsole), Region.

Ergebnis im Einzelnen: `claude/stand-2026-11-07-hoertest-und-stimme.md`, Abschnitt „Nachtrag: Firestore-Gerätespeicher“.
