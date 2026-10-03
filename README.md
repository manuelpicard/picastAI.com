# Ritter Kunibert – Projektstand

Ein bildschirmloses Zuhör- und Erzählgerät: Ein Kind drückt die **Sprechtaste** und stellt eine Frage, oder es drückt die **Erzähltaste** und hört eine neue Geschichte von Ritter Kunibert, im Geist der Geschichten, die ein Vater sich einmal ausgedacht hat.

| Ordner | Inhalt | Stand |
| --- | --- | --- |
| `docs/` | Ursprungsgeschichte, Gerätekonzept, Hardware-Liste, Softwarearchitektur (aus der vorherigen Aufgabe) | unverändert |
| `pi-client/` | Raspberry-Pi-Client: GPIO-Tasten, begrenzte Aufnahme, Antwort holen und abspielen | erweitert: Zustandsautomat, LED-Signale, Mikrofon-Aus, Hardware-Mocks; Tests |
| `server/` | **neu:** Server hinter der API mit Whisper, Sicherheitsweiche, Erzählmotor, Antwortmodell und Piper-Stimme | 21 Tests, echter Durchlauf mit dem Pi-Client |
| `hoerproben/` | **neu:** komplette Kunibert-Folge (7:45 min) und Fragerunde als MP3, alles zum Mitlesen | echte Ausgabe, nicht nachbearbeitet |
| `demo/` | Skript für den Live-Durchlauf (Client → Server → gespeichertes Abspiel-Audio) | – |

**Schnellstart:** `server/README.md` (Server einrichten, Gerät anlegen) und danach `pi-client/README.md`.

**Was als Nächstes fehlt:** reale Verdrahtung und Test auf einem Raspberry Pi, fachliche Prüfung der Sicherheitstexte und der Betrieb unter einer Domain, die du kontrollierst. `picast.com` zeigt derzeit nur eine Verkaufsseite.
