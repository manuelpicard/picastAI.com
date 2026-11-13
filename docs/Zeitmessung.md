# Zeitmessung: Wo geht die Wartezeit hin?

Ein Kind wartet im Test 7 bis 9 Sekunden auf die Antwort auf eine kurze Frage und etwa 18 Sekunden auf einen Geschichtenteil. Woran das liegt, war bisher unbekannt. Server und Pi schreiben deshalb jetzt pro Anfrage eine Zeile mit den Zeiten ins Protokoll (Journal). Damit lässt sich nachlesen, welche Stufe die Zeit braucht.

**In den Zeilen stehen nur Zahlen und feste Wörter.** Kein Text des Kindes, keine Antwort, keine Geräte-ID, kein Token.

## Server

Je Anfrage an `/v1/device/question`, `/v1/device/kunibert-story` und `/v1/turn` eine Zeile. Ansehen auf dem Server:

```bash
sudo journalctl -u kunibert-server -n 200 --no-pager | grep Zeitmessung
```

Beispiel:

```text
Zeitmessung id=3f9a1c2b modus=frage status=200 erkennung_ms=1204 weiche_ms=0 sprachmodell_ms=3480 ausgabecheck_ms=0 sprachausgabe_ms=2210 vorbereitet_ms=- gesamt_ms=7050 sprachmodell_aufrufe=1 audio_s=12.4
```

| Feld | Bedeutung |
| --- | --- |
| `id` | Zufällige Nummer der Anfrage (8 Zeichen). Sie hat nichts mit Gerät oder Inhalt zu tun. |
| `modus` | `frage` (Sprechtaste), `weiter` (Erzähltaste) oder bei `/v1/turn` der gesendete Modus (`frage`, `geschichte`, `weiter`). |
| `status` | Antwortcode an das Gerät. `200` ist gut, `503` heißt: Sprachdienst gerade nicht erreichbar. `abgebrochen` heißt: Das Gerät hat aufgelegt, bevor die Antwort fertig war. |
| `erkennung_ms` | Spracherkennung (Aufnahme in Text umwandeln). |
| `weiche_ms` | Sicherheitsweiche (prüft den Text des Kindes auf Notlagen). |
| `sprachmodell_ms` | Claude: Antwort oder Geschichte schreiben. Mehrere Aufrufe werden addiert. |
| `ausgabecheck_ms` | Prüfung des Claude-Textes, bevor er vorgelesen wird. |
| `sprachausgabe_ms` | Sprachausgabe (Text in Sprache umwandeln). Feste Texte aus dem Speicher dauern fast nichts. |
| `vorbereitet_ms` | Nur bei der Erzähltaste: Wie lange der Server auf einen im Hintergrund vorbereiteten Teil gewartet hat (`server-api/prefetch.ts`). `-` = nichts vorbereitet; dann laufen Sprachmodell und Sprachausgabe wie gewohnt. Eine kleine Zahl ohne `sprachmodell_ms` heißt: Der Teil lag fertig bereit. |
| `gesamt_ms` | Gesamtzeit der Anfrage auf dem Server: vom Beginn (nach der Anmeldung des Geräts) bis die Antwort abgeschickt ist. Das Hochladen der Aufnahme gehört dazu. |
| `sprachmodell_aufrufe` | Wie oft Claude gefragt wurde. Erkennt Claude bei einer Frage einen Geschichtenwunsch, sind es **zwei** Aufrufe. |
| `audio_s` | Länge des Antwort-Audios in Sekunden. |

Ein `-` heißt: Diese Stufe ist nicht gelaufen. Das ist etwas anderes als `0`. Beispiele: Bei der Erzähltaste gibt es keinen Text vom Kind, also kein `erkennung_ms` und kein `weiche_ms`. Greift die Sicherheitsweiche, fragt der Server Claude nicht.

Anfragen, die gleich abgewiesen werden (keine Anmeldung, zu viele Anfragen, keine Aufnahme), erzeugen keine Zeile.

## Pi

Der Pi-Client schreibt, wie lange das Kind gewartet hat:

```bash
sudo journalctl -u kunibert.service -n 200 --no-pager | grep Zeitmessung
```

```text
Zeitmessung modus=frage wartezeit_s=7.4
Zeitmessung modus=erzaehltaste wartezeit_s=18.2
```

- `frage`: vom Ende der Aufnahme (Taste losgelassen) bis kurz vor dem Abspielen.
- `erzaehltaste`: vom Tastendruck bis kurz vor dem Abspielen (es gibt keine Aufnahme).

Die Zeit enthält Hochladen, den ganzen Server und das Abholen des Audios.

## So lesen Sie die Zahlen

1. **Server-Zeile finden.** Pi und Server haben keine gemeinsame Nummer. Ordnen Sie die Zeilen über die Uhrzeit einander zu.
2. **Stufen vergleichen.** Welche Stufe ist am größten? Das ist der erste Kandidat zum Verbessern.
3. **Unterschiede erklären:**
   - Pi-Wartezeit minus `gesamt_ms` ist ungefähr Netz, Abholen des Audios und Pi-Verarbeitung.
   - `gesamt_ms` minus die Summe der Stufen ist ungefähr das Hochladen der Aufnahme und Kleinkram.
4. **Mehrere Messungen ansehen.** Eine einzelne Zeile kann ein Ausreißer sein. Besser sind zehn Fragen und zehn Geschichtenteile hintereinander.

## Was die Messung nicht kann

- Sie misst nur die Dauer. Sie sagt nicht, warum eine Stufe langsam ist (zu großes Modell, zu schwacher Rechner, schlechte Verbindung).
- Die Zeit bis zum Beginn der Wiedergabe ist am Pi vor dem Abspielen gemessen. Wenn das Audiogerät selbst zögert, steckt das nicht in der Zahl.
- Eine Zeile pro Anfrage heißt nicht, dass jede Anfrage Erfolg hatte. Bitte `status` mitlesen.
- Noch nicht auf einem echten Server und einem echten Pi gesehen. Getestet ist mit Attrappen für Sprachdienste und Sprachmodell.
