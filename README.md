# picastAI.com — Ritter Kunibert als erstes Produkt

Ein bildschirmloses Zuhör- und Erzählgerät: Ein Kind drückt die **Sprechtaste** und stellt eine Frage, oder es drückt die **Erzähltaste** und hört eine neue Geschichte von Ritter Kunibert, im Geist der Geschichten, die ein Vater sich einmal ausgedacht hat.

| Ordner | Inhalt | Stand |
| --- | --- | --- |
| `docs/` | Ursprungsgeschichte, Gerätekonzept, Hardware-Liste, Softwarearchitektur, **Kunibert-Kanon v0.1** und picastAI-Geräte-API | API-Gegenstelle für GIGA ergänzt |
| `pi-client/` | Raspberry-Pi-Client: GPIO-Tasten, begrenzte Aufnahme, Antwort holen und abspielen | erweitert: Zustandsautomat, LED-Signale, Mikrofon-Aus, ALSA-Diagnose, Hardware-Mocks; Tests |
| `server/` | **neu:** Server hinter der API mit Whisper, Sicherheitsweiche, Erzählmotor, Antwortmodell und Piper-Stimme | 21 Tests, echter Durchlauf mit dem Pi-Client |
| `hoerproben/` | **neu:** komplette Kunibert-Folge (7:45 min) und Fragerunde als MP3, alles zum Mitlesen | echte Ausgabe, nicht nachbearbeitet |
| `demo/` | Skript für den Live-Durchlauf (Client → Server → gespeichertes Abspiel-Audio) | – |
| `firmware/arduino-giga/` | Arduino-GIGA-Firmware, Connectivity-Test, Verdrahtung und WLAN-Logger | Prototyp 0.3 |

**Produktplattform:** `picastAI.com` ist die kommerzielle Plattform. Spracheingabe, Kuration, Erzähl-Engine und Eltern-Bereich sollen dort als kontrollierte Dienste zusammenlaufen; `manualAI.org` ist als Non-Profit-Struktur vorgesehen. Der Arduino GIGA beziehungsweise Raspberry Pi bleibt ein bildschirm- und authentisierter Client. `picast.de` wird höchstens defensiv als deutsche Weiterleitungsdomain geprüft.
**Was als Nächstes fehlt:** ein picastAI.com-Vertikalschnitt mit Geräteaufnahme/-widerruf, Eltern-Bereich, Einwilligungs- und Datenschutzfluss, anschließend die reale Verdrahtung und der Test auf dem Arduino-GIGA- und Raspberry-Pi-Prototyp. Die Sicherheits- und Kurationstexte müssen fachlich geprüft werden.
