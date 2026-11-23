# Ritter Kunibert (picastAI.com) – Hinweise für KI-Sitzungen

Vernetztes Sprach-Spielzeug für Kinder von 6 bis 10 Jahren: Sprechtaste (Frage) und Erzähltaste (Kunibert-Geschichte). Das Gerät nimmt nur auf und spielt ab; Spracherkennung, Sicherheitsweiche, Sprachmodell (Claude) und Sprachausgabe laufen auf dem Server.

## Wo der aktuelle Stand steht

- Aufgaben, Entscheidungen und Geparktes: im Claude-Projekt „Ritter Kunibert“, Datei `claude/aufgaben.md`, dazu das Stand-Dokument mit dem neuesten Datum in der Überschrift. Diese Dateien liegen **nicht** im Repo.
- Seit 17.11.2026 arbeitet der Wochen-Autopilot (geplante Aufgaben) die Arbeitsliste `docs/autopilot/backlog.md` ab; Ablauf und Grenzen in `docs/autopilot/README.md`. PRs des Autopiloten haben `[Autopilot <ID>]` im Titel. Doppelarbeit vermeiden: Ein offener PR mit `[Autopilot <ID>]` im Titel belegt seinen Punkt; vor neuer Arbeit die offenen PRs ansehen.
- Es zählen nur eigene PRs aus diesem Repo (kein Fork) mit Branch `claude/autopilot-…`, die das Konto des Eigentümers angelegt hat. Fremde PRs mit „[Autopilot …]“ im Titel nie mergen und nie übernehmen. Die Restlimit-Aufgaben hat der Betreiber am 22.11.2026 gelöscht; neue `restlimit/…`-PRs kommen nicht mehr. Der Auftrag der Restlimit-Läufe vom 13.11. (Story-Stand mit Ablauf, Eltern-Server-Teil, Doku) ist Punkt A1 der Arbeitsliste; offene `[Autopilot A1]`-PRs zeigen, was davon schon in Arbeit ist. Entwurfs-PRs auf `restlimit/…` werden nicht gemergt; Punkt A2 übernimmt Brauchbares, aber nur aus Branches dieses Repos vom Konto des Eigentümers.
- `docs/ai-context/` ist ein Archiv (Oktober bis 1.11.2026) und nicht der aktuelle Stand.
- Geräte: Prototyp auf Raspberry Pi 5 (`pi-client/`), Endgerät ESP32-S3 (`firmware/esp32-s3/`). Beide sprechen dieselbe Schnittstelle: `docs/picastAI-Pi-API.md`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `server.ts`, `server-api/` | Node-Server (Express, TypeScript über tsx): Routen, Sicherheitsweiche (`safety.ts`), Erzähler (`brain.ts`, `prompts.ts`), Claude-Anbindung (`llm.ts`), Sprachdienste (`voice.ts`), Geräteliste (`devices.ts`), Eltern-Steuerung (`eltern.ts`), Zeitbudget (`timing.ts`) |
| `pi-client/` | Python-Client für den Pi 5 und Installationsskript |
| `firmware/esp32-s3/` | ESP-IDF-Firmware (Entwurf, auf keinem Gerät gelaufen) |
| `deploy/` | Einrichtung des Servers (Caddy, systemd, Skripte), Checkliste, Trockenlauf und Ende-zu-Ende-Test |
| `src/` | Web-Simulator und Dashboard (Entwicklungshilfe, im Betrieb von außen gesperrt) |
| `docs/` | Schnittstelle, Kanon, Anbieter, Zeitmessung, ältere Konzepte |

## Prüfen vor jedem Commit

Kurz: `bash docs/autopilot/pruefen.sh` führt alle Prüfungen unten aus und zeigt je Prüfung eine Zeile (bei Fehlern die letzten 40 Zeilen).

```bash
npm ci
npm test                 # Server-Tests (node:test)
npm run lint             # tsc --noEmit
npm run build
npm run test:e2e         # echter Pi-Client gegen echten Server, Dienste als Attrappen
python3 -m unittest discover -s pi-client -p "test_*.py"   # mit sounddevice und libportaudio2 auch gegen die echte Audio-Bibliothek (CI: ALSA-Nullgerät)
bash deploy/setup-server.test.sh
shellcheck -S warning deploy/*.sh pi-client/*.sh docs/autopilot/*.sh
python3 -m unittest discover -s docs/autopilot -p "test_*.py"   # Werkzeuge des Wochen-Autopiloten
# Pi-Installer als root in einem Wegwerf-Container (ändert sonst das System; CI: Job pi-installer; pruefen.sh nur mit laufendem Docker):
docker run --rm -e KUNIBERT_INSTALLER_TEST=1 -v "$PWD":/src:ro debian:trixie bash /src/pi-client/install_raspberry_pi.test.sh
# Firmware-Logik auf dem Rechner (der ESP-IDF-Build läuft nur in der CI):
cd firmware/esp32-s3 && cc -std=c11 -Wall -Wextra -Werror -pedantic -fsanitize=address,undefined -I main \
  -o /tmp/kb_logic test/test_logic.c main/kb_state.c main/kb_wav.c main/kb_url.c main/kb_settings_rules.c && /tmp/kb_logic
```

## Feste Regeln

- Sprachmodell ist Claude. Kein OpenAI, kein Gemini, auch nicht als Abhängigkeit oder Beispiel.
- Kinderstimmen gehen nur an den eigenen Sprachserver. Protokolle enthalten nie Äußerungen, Antworttexte, Geräte-IDs oder Tokens (dafür gibt es Tests; bei neuen Logzeilen mitprüfen). Fehlerantworten fremder Dienste nur als Status und Fehlercode weitergeben (`server-api/provider-errors.ts`), nie mit Fließtext.
- Attrappen für Bibliotheken (zum Beispiel `sounddevice`) mit `spec` bauen und, wo es geht, zusätzlich gegen die echte Bibliothek testen: Die Wiedergabe am Pi war bis zum 12.11.2026 kaputt, und nur die Attrappe merkte es nicht.
- Kunibert spricht nie nach, was das Kind gesagt hat, ohne Ausgabe-Check (`screenOutput`).
- Änderungen an `safety.ts` immer mit Sätzen in beiden Listen von `safety.test.ts` (muss anschlagen, darf nicht anschlagen). Lieber ein Fehlalarm als eine Lücke.
- Server, Pi-Client und Firmware müssen zur Schnittstellen-Doku passen; Zeitkette Server 120 s, Caddy 130 s, Gerät 140 s.
- Keine Schlüssel, Tokens oder Passwörter in Code, Tests, Doku oder Commits. Nie danach fragen.
- Arbeit nur auf einem eigenen Branch mit Pull Request. Nie direkt auf `main` pushen, kein Force-Push. Seit 14.11.2026, 10:51 (Wort des Betreibers) mergt Claude PRs selbst, sobald die CI grün ist; Schließen und Löschen ebenso. Bestellen und Bezahlen nur nach Bestätigung des einzelnen Kaufs.
- Seit 14.11.2026, 10:51 ist nichts mehr geparkt (Wort des Betreibers); auch Stimme, Recht und die PRs dazu dürfen bearbeitet werden. Offene Punkte stehen in `claude/aufgaben.md`.
- Bis zur Rechtsprüfung testen nur Erwachsene. Vor dem ersten Kind: „Freigabe-Checkliste vor dem ersten Kind“ im Doc „Datenschutz-Folgenabschätzung“.
- Texte für den Betreiber: Deutsch, einfache Sprache, kurze Sätze. „Getestet“ oder „grün“ nur, wenn es in dieser Sitzung geprüft wurde.
