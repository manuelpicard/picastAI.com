# Ritter Kunibert – Datenschutz und Speicherung (Stand Code-Review)

Diese Notiz beschreibt, was der Code tatsächlich tut. Was externe Anbieter mit Daten machen, steht hier nur als offener Punkt.

## Was der Code belegt

| Daten | Verhalten | Fundstelle |
| --- | --- | --- |
| Kinderaufnahme (WAV) | Nur im Arbeitsspeicher, Lebensdauer 120 Sekunden, maximal 5 pro Gerät, wird nach dem einmaligen Abruf gelöscht | `server-api/devices.ts` (`AudioStore`) |
| Kinderaufnahme auf Festplatte | Kein Schreiben im geprüften Code | – |
| Transkript der Frage | Auf 1000 Zeichen begrenzt | `server.ts` |
| Logs | Kein Loggen von Transkripten, Texten oder Audio gefunden. Sicherheitsereignisse werden nur mit Zeitstempel und Auslöser protokolliert (`logSafetyEvent`) | `server-api/safety.ts`, `server-api/brain.ts` |
| Gerätezugriff | Firestore-Client-Zugriff ist per Regel gesperrt, Zugriff nur über den Server | `firestore.rules` |
| API-Schlüssel | Liegen nur auf dem Server, nie auf dem Pi | `.env.example` |

## Offen, bitte klären

- **Speicherdauer bei STT- und TTS-Anbietern:** Welcher Anbieter speichert Audio oder Text, wie lange, und ob zum Training verwendet wird. Das steht nicht im Repo.
- **Gemini:** Gleiche Frage für Texte und Klassifikationen, die an das Modell gehen.
- **Serverlogs in der Hosting-Umgebung:** Die Logs dort können Fehlermeldungen mit Teilen von Anfragen enthalten. Das sollte beim Hoster geprüft werden.
- **Elternrechte:** Es gibt einen Eltern-Bereich im Frontend. Welche Daten Eltern sehen und löschen können, ist im Code nicht vollständig nachvollziehbar.

## Sicherheitsereignisse

Wenn die Sicherheitsweiche auslöst, wird ein Eintrag mit Zeitstempel und Auslöser geschrieben:
- `input`: Die Äußerung des Kindes wurde erkannt.
- `model_classification`: Das Modell hat die Äußerung als Sicherheitsfall eingestuft.
- `story_output`: Die generierte Geschichte hat ein Muster getroffen, sie wird nicht abgespielt.

Der Inhalt selbst wird nicht protokolliert.
