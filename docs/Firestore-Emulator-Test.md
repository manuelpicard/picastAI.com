# Test: Geräteliste in Firestore (mit Emulator)

Mit `PICASTAI_DEVICE_STORE=firestore` merkt sich der Server die Geräte dauerhaft in Firestore (Sammlung `devices`). Gespeichert wird nur ein Hash des Tokens, nie das Token selbst. Dieser Test prüft das gegen den **Firestore-Emulator**, einen Nachbau von Firestore auf dem eigenen Rechner. Es geht nichts an das echte Firestore.

## Was geprüft wird

Der Test startet den echten Server (`server.ts`) und fragt ihn von außen, genau wie ein Gerät oder das Dashboard.

1. **Ein angelegtes Gerät ist nach einem Neustart noch da.** Gerät anlegen, Server beenden, Server neu starten: Das Gerät steht in der Liste, und sein Token gilt weiter.
2. **In Firestore steht nur der Hash.** Der Test liest das gespeicherte Dokument und prüft: Der SHA-256-Hash passt zum Token, und das Token selbst steht nirgends darin.
3. **Ein falsches Token wird abgelehnt.** Falsches Token, fast richtiges Token (ein Zeichen anders), gar kein Token und ein richtiges Token an einem unbekannten Gerät ergeben alle HTTP 401. Das gilt auch nach einem Neustart.
4. **Ein Widerruf bleibt bestehen.** Ein widerrufenes Gerät ist nach einem Neustart weiter gesperrt, andere Geräte nicht.
5. **Die Regeln „deny all" sperren Clients.** Anfragen an den Emulator **ohne** Administrator-Kopf (so, wie ein Browser oder eine App sie stellen würde) werden mit 403 abgelehnt: Lesen (Dokument, Sammlung, Abfrage, fremde Sammlung) und Schreiben (Anlegen, Ändern, Löschen). Danach prüft der Test, dass wirklich nichts angelegt, geändert oder gelöscht wurde. Zur Kontrolle liest er dasselbe Dokument als Administrator. So ist sicher, dass die Sperre von den Regeln kommt und nicht von einer falschen Adresse.
6. **Die Einstellung für die Regeln stimmt.** `firebase.json` muss der Datenbank aus `firebase-applet-config.json` die Datei `firestore.rules` zuordnen. Sonst legt der Emulator die Datenbank mit offenen Regeln an, und Punkt 5 wäre wertlos. Der Test prüft das ausdrücklich.

## Wo läuft der Test?

- **In der CI** (GitHub Actions, Job `firestore-emulator` in `.github/workflows/tests.yml`). Dort wird Java 21 und `firebase-tools` (festgelegte Version) installiert und der Test über `firebase emulators:exec` gestartet.
- **Nicht in `npm test`.** Dort gibt es keinen Emulator. Der Emulator ist **keine Abhängigkeit** in `package.json` oder `package-lock.json`; er wird nur im CI-Job installiert.
- Läuft der Test ohne Emulator, **schlägt er laut fehl**, statt still zu überspringen. Der Server wird dann gar nicht erst gestartet, damit nie versehentlich das echte Firestore angesprochen wird.

### Selbst ausführen (optional)

Voraussetzung: Java 21 und Node 22. Der Emulator lädt beim ersten Start eine Programmdatei von Google herunter.

```bash
npm install --global firebase-tools@15.34.2
```

```bash
firebase emulators:exec --only firestore --project gen-lang-client-0791832135 "npm run test:firestore"
```

(Der Wert nach `--project` ist die `projectId` aus `firebase-applet-config.json`. Sie muss dieselbe sein, sonst gelten die Regeln im Emulator nicht für diese Anfragen.)

## Was der Emulator nicht abdeckt

Ein grüner Lauf heißt: Der Code und die Regeldatei verhalten sich richtig. Er heißt **nicht**, dass der Betrieb in Google Cloud richtig eingerichtet ist.

- **Echte Zugriffsrechte.** Der Emulator kennt keine Rechteverwaltung (IAM). Ob das Dienstkonto des Servers in Google Cloud wirklich lesen und schreiben darf und nicht mehr als nötig, bleibt ungeprüft.
- **Veröffentlichte Regeln.** Getestet wird die Datei `firestore.rules` im Repo. Ob dieselben Regeln in der echten Datenbank (`ai-studio-ritterkunibert-…`) veröffentlicht sind, sagt der Test nicht. Das ist in der Firebase-Konsole oder mit `firebase deploy --only firestore:rules` zu prüfen. Das Admin-SDK des Servers umgeht die Regeln ohnehin; sie schützen nur vor direkten Zugriffen von außen.
- **Region und Standort.** Der Emulator läuft auf dem eigenen Rechner. In welcher Region die echte Datenbank steht, bleibt offen.
- **Kosten und Kontingente.** Keine Abrechnung, keine Lese- und Schreibgrenzen.
- **Netz, Ausfälle, Geschwindigkeit.** Der Emulator ist lokal und schnell. Wie sich der Server bei echten Verbindungsproblemen oder langsamen Antworten verhält, zeigt der Test nicht. (Die Logik „Server startet nicht, wenn die Liste nicht lesbar ist" ist in `server-api/devices.test.ts` mit Attrappen abgedeckt.)
- **Kleine Unterschiede zum echten Firestore.** Der Emulator ist ein Nachbau. Seltene Abweichungen sind möglich.
