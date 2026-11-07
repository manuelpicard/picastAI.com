# Stand 2026-11-07: Hörtest und Stimme

> Hinweis: Diese Datei lag beim Nachtrag nicht im Repo (weder auf `main` noch auf einem anderen Branch). Sie wurde mit diesem Nachtrag neu angelegt. Der frühere Inhalt (Hörtest, Stimme) fehlt hier und muss bei Bedarf aus der lokalen Fassung ergänzt werden.

## Nachtrag: Firestore-Gerätespeicher gegen den Emulator getestet

Stand: 2026-11-07, Prüfung von `PICASTAI_DEVICE_STORE=firestore` (Aufgabe 23).

### Ergebnis

**Bestanden: 9 von 9 Tests, 0 Fehler.** Der Test liegt auf dem Branch `claude/firestore-emulator-test` (Commit `4fb85e0`, Datei `server-api/firestore.integration.test.ts`, CI-Job `firestore-emulator` in `.github/workflows/tests.yml`, Beschreibung in `docs/Firestore-Emulator-Test.md`). Er startet den echten Server (`server.ts`) gegen den lokalen Firestore-Emulator. Ans echte Firestore geht nichts.

| Prüfung | Ergebnis |
| --- | --- |
| Emulator läuft, Test spricht nur mit dem eigenen Rechner | bestanden |
| `firebase.json` ordnet der App-Datenbank `firestore.rules` zu | bestanden |
| Gerät anlegen und anmelden; in Firestore steht nur der SHA-256-Hash, nie das Token | bestanden |
| Neustart: Gerät steht noch in der Liste, Token gilt weiter | bestanden |
| Falsches, fast richtiges und fehlendes Token sowie unbekanntes Gerät: HTTP 401, auch nach Neustart | bestanden |
| Widerruf bleibt nach Neustart bestehen, andere Geräte unberührt | bestanden |
| Kontrolle: als Administrator ist das Dokument lesbar (Adresse stimmt) | bestanden |
| Regeln „deny all“: Lesen als Client gesperrt (Dokument, Sammlung, Abfrage, fremde Sammlung) | bestanden |
| Regeln „deny all“: Schreiben als Client gesperrt (Anlegen, Ändern, Löschen); danach unverändert | bestanden |

### Gegenproben (damit ein grüner Lauf etwas bedeutet)

- **Regeln absichtlich geöffnet** (`allow read, write: if true`): 3 Tests schlagen fehl (die Zuordnung in `firebase.json` und beide Client-Sperren). Der Test erkennt offene Regeln also. Die Datei wurde danach wieder auf `if false` gesetzt.
- **Ohne Emulator:** Der Test scheitert laut, statt still zu überspringen, und der Server wird nicht gestartet.

### Umgebung dieses Laufs

Windows 10, Temurin JDK 21.0.13, `firebase-tools` 15.34.2, Firestore-Emulator 1.22.0, Node 26.13.0 (die CI nutzt Node 22), Projekt `gen-lang-client-0791832135`. Gelaufen mit:

```bash
firebase emulators:exec --only firestore --project gen-lang-client-0791832135 "npm run test:firestore"
```

### Nicht geprüft

- **Der CI-Job selbst** ist hier nicht gelaufen. Das Repo ist privat, die Actions-Läufe waren ohne Anmeldung nicht einsehbar. Erst ein grüner Lauf auf GitHub (Ubuntu, Node 22) bestätigt den Job.
- **Ob es zum Branch schon einen PR gibt**, war ohne GitHub-Anmeldung nicht feststellbar.
- **Alles, was der Emulator nicht abdeckt:** echte Zugriffsrechte (IAM) des Dienstkontos, ob dieselben Regeln in der echten Datenbank veröffentlicht sind, Region, Kosten und Kontingente, Netzausfälle. Einzelheiten stehen in `docs/Firestore-Emulator-Test.md`.
