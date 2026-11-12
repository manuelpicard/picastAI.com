# Ritter Kunibert (picastAI.com) – Hinweise für KI-Sitzungen

Vernetztes Sprach-Spielzeug für Kinder von 6 bis 10 Jahren: Sprechtaste (Frage) und Erzähltaste (Kunibert-Geschichte). Das Gerät nimmt nur auf und spielt ab; Spracherkennung, Sicherheitsweiche, Sprachmodell (Claude) und Sprachausgabe laufen auf dem Server.

## Wo der aktuelle Stand steht

- Aufgaben, Entscheidungen und Geparktes: im Claude-Projekt „Ritter Kunibert“, Datei `claude/aufgaben.md`, dazu das Stand-Dokument mit dem neuesten Datum in der Überschrift. Diese Dateien liegen **nicht** im Repo.
- `docs/ai-context/` ist ein Archiv (Oktober bis 1.11.2026) und nicht der aktuelle Stand.
- Geräte: Prototyp auf Raspberry Pi 5 (`pi-client/`), Endgerät ESP32-S3 (`firmware/esp32-s3/`). Beide sprechen dieselbe Schnittstelle: `docs/picastAI-Pi-API.md`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `server.ts`, `server-api/` | Node-Server (Express, TypeScript über tsx): Routen, Sicherheitsweiche (`safety.ts`), Erzähler (`brain.ts`, `prompts.ts`), Claude-Anbindung (`llm.ts`), Sprachdienste (`voice.ts`), Geräteliste (`devices.ts`), Zeitbudget (`timing.ts`) |
| `pi-client/` | Python-Client für den Pi 5 und Installationsskript |
| `firmware/esp32-s3/` | ESP-IDF-Firmware (Entwurf, auf keinem Gerät gelaufen) |
| `deploy/` | Einrichtung des Servers (Caddy, systemd, Skripte), Checkliste, Trockenlauf und Ende-zu-Ende-Test |
| `src/` | Web-Simulator und Dashboard (Entwicklungshilfe, im Betrieb von außen gesperrt) |
| `docs/` | Schnittstelle, Kanon, Anbieter, Zeitmessung, ältere Konzepte |

## Prüfen vor jedem Commit

```bash
npm ci
npm test                 # Server-Tests (node:test)
npm run lint             # tsc --noEmit
npm run build
npm run test:e2e         # echter Pi-Client gegen echten Server, Dienste als Attrappen
python3 -m unittest discover -s pi-client -p "test_*.py"
bash deploy/setup-server.test.sh
# Firmware-Logik auf dem Rechner (der ESP-IDF-Build läuft nur in der CI):
cd firmware/esp32-s3 && cc -std=c11 -Wall -Wextra -Werror -pedantic -fsanitize=address,undefined -I main \
  -o /tmp/kb_logic test/test_logic.c main/kb_state.c main/kb_wav.c main/kb_url.c main/kb_settings_rules.c && /tmp/kb_logic
```

## Feste Regeln

- Sprachmodell ist Claude. Kein OpenAI, kein Gemini, auch nicht als Abhängigkeit oder Beispiel.
- Kinderstimmen gehen nur an den eigenen Sprachserver. Protokolle enthalten nie Äußerungen, Antworttexte, Geräte-IDs oder Tokens (dafür gibt es Tests; bei neuen Logzeilen mitprüfen).
- Kunibert spricht nie nach, was das Kind gesagt hat, ohne Ausgabe-Check (`screenOutput`).
- Änderungen an `safety.ts` immer mit Sätzen in beiden Listen von `safety.test.ts` (muss anschlagen, darf nicht anschlagen). Lieber ein Fehlalarm als eine Lücke.
- Server, Pi-Client und Firmware müssen zur Schnittstellen-Doku passen; Zeitkette Server 120 s, Caddy 130 s, Gerät 140 s.
- Keine Schlüssel, Tokens oder Passwörter in Code, Tests, Doku oder Commits. Nie danach fragen.
- Arbeit nur auf einem eigenen Branch mit Pull Request. Nie direkt auf `main` pushen, kein Force-Push. Mergen, Schließen und Löschen nur, wenn der Betreiber es ausdrücklich sagt.
- Geparkte Themen (Stimme, Recht; die PRs dazu) nicht anfassen. Was geparkt ist, steht in `claude/aufgaben.md`.
- Bis zur Rechtsprüfung testen nur Erwachsene. Vor dem ersten Kind: „Freigabe-Checkliste vor dem ersten Kind“ im Doc „Datenschutz-Folgenabschätzung“.
- Texte für den Betreiber: Deutsch, einfache Sprache, kurze Sätze. „Getestet“ oder „grün“ nur, wenn es in dieser Sitzung geprüft wurde.
