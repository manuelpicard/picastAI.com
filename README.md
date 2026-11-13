# picastAI.com — Ritter Kunibert als erstes Produkt

Ein bildschirmloses Zuhör- und Erzählgerät: Ein Kind drückt die **Sprechtaste** und stellt eine Frage, oder es drückt die **Erzähltaste** und hört eine neue Geschichte von Ritter Kunibert, im Geist der Geschichten, die ein Vater sich einmal ausgedacht hat.

| Ordner | Inhalt | Stand |
| --- | --- | --- |
| `docs/` | Ursprungsgeschichte, Gerätekonzept, Hardware-Liste, Softwarearchitektur, **Kunibert-Kanon v0.1** und picastAI-Geräte-API | Pi-Vertikalschnitt in Arbeit |
| `docs/ai-context/` | Gesprächsarchiv und historische Produktbeschreibung als Kontext für künftige KI-Sitzungen; verweist teils auf Pfade, die es nicht (mehr) gibt, z. B. `firmware/arduino-giga/` | Kontextarchiv 2026-10-02 bis 2026-10-14 |
| `pi-client/` | Raspberry-Pi-Client: GPIO-Tasten, begrenzte Aufnahme, Antwort holen und abspielen | erweitert: Zustandsautomat, LED-Signale, Mikrofon-Aus, ALSA-Diagnose, Hardware-Mocks; Tests |
| `firmware/esp32-s3/` | Firmware für das Endgerät (ESP32-S3, ESP-IDF): gleicher Ablauf und gleiche Schnittstelle wie der Pi-Client | Entwurf, baut in der CI, auf keinem Gerät gelaufen |
| `deploy/` | Server-Betrieb: Einrichtung hinter Caddy, systemd-Dienst, Produktions-`.env`, Checkliste für den ersten Durchlauf mit echtem Pi (nicht auf einem echten Server ausgeführt) | Vorbereitet |
| `server-api/` | Server hinter der API mit STT-/TTS-Providern, Sicherheitsweiche, Erzählmotor (Claude, siehe `docs/LLM-Anbieter.md`) und AudioStore | HTTP-Vertikalschnitt implementiert |
| `hoerproben/` | **neu:** komplette Kunibert-Folge (7:45 min) und Fragerunde als MP3, alles zum Mitlesen | echte Ausgabe, nicht nachbearbeitet |
| `demo/` | Skript für den Live-Durchlauf (Client → Server → gespeichertes Abspiel-Audio) | – |

**Produktplattform:** `picastAI.com` ist die kommerzielle Plattform. Spracheingabe, Kuration, Erzähl-Engine und Eltern-Bereich sollen dort als kontrollierte Dienste zusammenlaufen; `manualAI.org` ist als Non-Profit-Struktur vorgesehen. Der Prototyp läuft auf einem Raspberry Pi 5, das Endgerät wird ein ESP32-S3 (Entscheidung vom 7. bis 9.11.2026); beide sind bildschirmlose, authentisierte Clients derselben Schnittstelle (`docs/picastAI-Pi-API.md`). Hinweise für KI-Sitzungen stehen in `CLAUDE.md`.
**Aktueller Vertikalschnitt:** Raspberry-Pi-WAV → konfigurierbarer STT-Provider → Sicherheitsweiche/Brain → konfigurierbarer TTS-Provider → geschützter WAV-Abruf. Ohne Provider-Key bleiben deterministische Fallbacks für lokale Tests aktiv.
