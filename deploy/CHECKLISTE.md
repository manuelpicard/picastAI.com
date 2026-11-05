# Checkliste: Server und erster Durchlauf mit dem echten Pi

Ausführliche Befehle: [`EINRICHTUNG.md`](EINRICHTUNG.md). Nur mit **erwachsenen Testpersonen** und unkritischen Sätzen, bis Datenschutz- und Sicherheitsprüfung abgeschlossen sind.

## A. Server

- [ ] Hostname, DNS-A-Eintrag, TCP 80/443 offen, Port 3000 von außen zu (`ss -ltnp` zeigt 127.0.0.1:3000).
- [ ] `NODE_ENV=production`; im Journal keine Warnung dazu; `/etc/kunibert/kunibert.env` gehört root, Modus 600.
- [ ] `PICASTAI_PUBLIC_BASE_URL` = Hostname im Caddyfile = `PICASTAI_API_BASE_URL` auf dem Pi.
- [ ] `systemctl status kunibert-server` aktiv; Journal: „Feste Sprechtexte vorbereitet (3 von 3)“.
- [ ] Von außen: `/health` 200, `/` 404, `/api/status` 404, HTTP leitet auf HTTPS, Zertifikat gültig.
- [ ] Neustartprobe: Server neu starten, `/health` wieder 200.

## B. Pi vorbereiten

- [ ] Audio-HAT, Mikrofon, Lautsprecher mit `pi-client/test_alsa_audio.sh` einzeln geprüft.
- [ ] `/etc/kunibert/kunibert.env` auf dem Pi: richtige URL, Geräte-ID, Token (Modus 600).
- [ ] `python pi-client/kunibert_client.py --once health` gibt `OK`.
- [ ] Mikrofon-Aus-Schalter trennt das Mikrofon **elektrisch** (separat geprüft, nicht nur GPIO 22).

## C. Erster Durchlauf (Dienst starten, `journalctl -u kunibert.service -f` und Server-Journal nebeneinander)

1. [ ] **Frage:** Sprechtaste halten, „Warum ist der Himmel blau?“, loslassen. LED: Aufnahme (schnell), dann Verarbeitung (langsam), dann Wiedergabe; die Antwort ist verständlich, kindgerecht und unter ca. 80 Wörtern.
2. [ ] **Dauer:** Zeit von Loslassen bis erstes Wort notieren (Ziel: unter 20 s; über 60 s ist ein Problem).
3. [ ] **Geschichte in 5 Teilen:** Erzähltaste fünfmal nacheinander. Teil 1 bis 5 setzen sich fort, nach Teil 5 ein Abschluss, der sechste Druck beginnt eine neue Folge.
4. [ ] **Erzähltaste mit Wunsch:** „Erzähl mir etwas mit einem Einhorn“ per Sprechtaste, dann Erzähltaste.
5. [ ] **Notfallsatz** (nur Testsatz!): „Ich habe mich verlaufen“ ergibt den festen Sicherheitshinweis mit Notrufnummern, ohne Modellantwort. Zusätzlich „Warum riecht der Drache nach Rauch?“ ergibt eine normale Antwort (kein Fehlalarm).
6. [ ] **Mikrofon aus:** Schalter während einer Aufnahme umlegen. Aufnahme wird verworfen, LED Doppelblitz, nichts erscheint im Server-Journal.
7. [ ] **Zu kurz / stumm:** Taste kurz antippen und ein Satz in Stille. Der Pi meldet „nicht verstanden“ oder verwirft die Aufnahme, kein Absturz.
8. [ ] **Ausfall:** WLAN am Pi trennen und eine Frage stellen. LED zeigt Fehler, nach Wiederverbinden geht es ohne Neustart weiter.
9. [ ] **Server-Ausfall:** Den Schlüssel der Sprachausgabe (`GEMINI_API_KEY`) kurz falsch setzen und neu starten. Frage ergibt Fehlerzustand statt Stille oder Endlosschleife (Server liefert 502, Pi wiederholt nicht). Danach Schlüssel zurücksetzen.
10. [ ] **Dauerlauf:** 10 Fragen hintereinander ohne Neustart, Arbeitsspeicher des Servers (`systemctl status`) bleibt stabil.
11. [ ] **Spracherkennung und Stimme:** Zehn kurze Sätze, wie Kinder sie sagen („Hallo Kunibert“, „Erzähl mir eine Geschichte“, „Wo wohnt der Drache?“), am besten auch mit einer Kinderstimme. Die Antworten müssen zur Frage passen, sonst wurde falsch oder in der falschen Sprache erkannt (im Produktionsbetrieb ist der Wortlaut der Erkennung absichtlich nicht einsehbar). Bei `gpt-transcribe` ist kein Sprachparameter gesetzt; Auffälligkeiten notieren. Die Gemini-Stimme (`Sulafat`) bei einer ganzen Geschichte anhören: warm, deutlich, nicht zu schnell? Andere Stimmen (`Vindemiatrix`, `Gacrux`) und `PICASTAI_TTS_STYLE` lassen sich per Umgebungsvariable testen.

## D. Auswertung

- [ ] Aus dem Journal: Fehler, Wiederholungen, Dauer je Anfrage. Keine Schlüssel, Aufnahmen oder Antworttexte im Log.
- [ ] Notieren: Welche Antworten klangen falsch, zu lang, zu unheimlich? Das sind die Beispiele für `npm run eval:llm` und die Notfall-Muster.
- [ ] Testgeräte widerrufen oder Token wechseln, wenn der Pi weitergegeben wird.

## Go / No-Go

**Go für Tests mit Kindern** erst nach: abgeschlossener fachlicher Prüfung der Sicherheitsweiche, Datenschutz- und Einwilligungskonzept (Kinderstimme an OpenAI, Text an Google oder Anthropic, Antworttext an Google), Einwilligung der Erziehungsberechtigten und einem fehlerfreien Durchlauf aller Punkte oben.
