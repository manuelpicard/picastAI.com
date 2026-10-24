# picastAI.com — Ritter Kunibert als erstes Produkt

Ein bildschirmloses Zuhör- und Erzählgerät: Ein Kind drückt die **Sprechtaste** und stellt eine Frage, oder es drückt die **Erzähltaste** und hört eine neue Geschichte von Ritter Kunibert, im Geist der Geschichten, die ein Vater sich einmal ausgedacht hat.

| Ordner | Inhalt | Stand |
| --- | --- | --- |
| `docs/` | Ursprungsgeschichte, Gerätekonzept, Hardware-Liste, Softwarearchitektur, **Kunibert-Kanon v0.1** und picastAI-Geräte-API | Pi-Vertikalschnitt in Arbeit |
| `docs/ai-context/` | Gesprächsarchiv und historische Produktbeschreibung als Kontext für künftige KI-Sitzungen | Kontextarchiv 2026-10-02 bis 2026-10-14 |
| `pi-client/` | Raspberry-Pi-Client: GPIO-Tasten, begrenzte Aufnahme, Antwort holen und abspielen | erweitert: Zustandsautomat, LED-Signale, Mikrofon-Aus, ALSA-Diagnose, Hardware-Mocks; Tests |
| `server-api/` | Server hinter der API mit STT-/TTS-Providern, Sicherheitsweiche, Erzählmotor und AudioStore | HTTP-Vertikalschnitt implementiert |
| `hoerproben/` | **neu:** komplette Kunibert-Folge (7:45 min) und Fragerunde als MP3, alles zum Mitlesen | echte Ausgabe, nicht nachbearbeitet |
| `demo/` | Skript für den Live-Durchlauf (Client → Server → gespeichertes Abspiel-Audio) | – |

**Produktplattform:** `picastAI.com` ist die kommerzielle Plattform. Spracheingabe, Kuration, Erzähl-Engine und Eltern-Bereich sollen dort als kontrollierte Dienste zusammenlaufen; `manualAI.org` ist als Non-Profit-Struktur vorgesehen. Der Raspberry Pi ist die einzige aktuelle Zielplattform und bleibt ein bildschirm- und authentisierter Client.
**Aktueller Vertikalschnitt:** Raspberry-Pi-WAV → konfigurierbarer STT-Provider → Sicherheitsweiche/Brain → konfigurierbarer TTS-Provider → geschützter WAV-Abruf. Ohne Provider-Key bleiben deterministische Fallbacks für lokale Tests aktiv.
