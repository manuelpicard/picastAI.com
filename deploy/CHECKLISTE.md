# Checkliste: Server und erster Durchlauf mit dem echten Pi

Ausführliche Befehle: [`EINRICHTUNG.md`](EINRICHTUNG.md). Nur mit **erwachsenen Testpersonen** und unkritischen Sätzen, bis Datenschutz- und Sicherheitsprüfung abgeschlossen sind.

## A. Server

- [ ] Hostname, DNS-A-Eintrag, TCP 80/443 offen, Port 3000 von außen zu (`ss -ltnp` zeigt 127.0.0.1:3000).
- [ ] `NODE_ENV=production`; im Journal keine Warnung dazu; `/etc/kunibert/kunibert.env` gehört root, Modus 600.
- [ ] `PICASTAI_PUBLIC_BASE_URL` = Hostname im Caddyfile = `PICASTAI_API_BASE_URL` auf dem Pi.
- [ ] `systemctl status kunibert-server` aktiv; Journal: „Feste Sprechtexte vorbereitet (4 von 4)“ (Sicherheitshinweis, „nicht verstanden“, Fehlerhinweis, Ersatzantwort). Ist der Sprachserver beim Start noch nicht bereit, versucht der Dienst es gut sechs Minuten lang wieder („neuer Versuch in … s“).
- [ ] Von außen: `/health` 200, `/` 404, `/api/status` 404, HTTP leitet auf HTTPS, Zertifikat gültig.
- [ ] Neustartprobe: Server neu starten, `/health` wieder 200.

## B. Pi vorbereiten

- [ ] USB-Mikrofon und USB-Lautsprecher (Pi 5) mit `pi-client/test_alsa_audio.sh` einzeln geprüft; bei zwei USB-Geräten `KUNIBERT_INPUT_DEVICE`/`KUNIBERT_OUTPUT_DEVICE` gesetzt (siehe `pi-client/README.md`, „Erster Aufbau“).
- [ ] `/etc/kunibert/kunibert.env` auf dem Pi: richtige URL, Geräte-ID, Token (Modus 600).
- [ ] `python pi-client/kunibert_client.py --once health` gibt `OK`.
- [ ] Mikrofon-Aus-Schalter trennt das Mikrofon **elektrisch** (separat geprüft, nicht nur GPIO 22).

## C. Erster Durchlauf (Dienst starten, `journalctl -u kunibert.service -f` und Server-Journal nebeneinander)

1. [ ] **Frage:** Sprechtaste halten, „Warum ist der Himmel blau?“, loslassen. LED: Aufnahme (schnell), dann Verarbeitung (langsam), dann Wiedergabe; die Antwort ist verständlich, kindgerecht und unter ca. 80 Wörtern.
2. [ ] **Dauer:** Zeit von Loslassen bis erstes Wort notieren (Ziel: unter 20 s; über 60 s ist ein Problem). Welche Stufe die Zeit braucht, zeigt auf dem Server `sudo journalctl -u kunibert-server -n 200 --no-pager | grep Zeitmessung` (Erklärung: [`docs/Zeitmessung.md`](../docs/Zeitmessung.md)); die Zeile je Anfrage mit notieren.
3. [ ] **Geschichte in 5 Teilen:** Erzähltaste fünfmal nacheinander. Teil 1 bis 5 setzen sich fort, nach Teil 5 ein Abschluss, der sechste Druck beginnt eine neue Folge.
4. [ ] **Erzähltaste mit Wunsch:** „Erzähl mir etwas mit einem Einhorn“ per Sprechtaste, dann Erzähltaste.
5. [ ] **Notfallsatz** (nur Testsatz!): „Ich habe mich verlaufen“ ergibt den festen Sicherheitshinweis mit Notrufnummern, ohne Modellantwort. Zusätzlich „Warum riecht der Drache nach Rauch?“ ergibt eine normale Antwort (kein Fehlalarm).
6. [ ] **Mikrofon aus:** Schalter während einer Aufnahme umlegen. Aufnahme wird verworfen, LED Doppelblitz, nichts erscheint im Server-Journal.
7. [ ] **Zu kurz / stumm:** Taste kurz antippen und ein Satz in Stille. Der Pi verwirft zu kurze Aufnahmen; eine stumme Aufnahme ergibt „nicht verstanden“, ohne dass sie an die Spracherkennung geht (im Server-Journal steht dann `erkennung_ms=-`). Ist eine Aufnahme mit Sprechen trotzdem stumm, steht im Journal des Pi „Die Aufnahme ist praktisch stumm“: Mikrofon und Pegel prüfen. Kein Absturz.
8. [ ] **Stoppen:** Während Kunibert eine Geschichte erzählt, kurz die Erzähltaste (und einmal die Sprechtaste) drücken. Er hört sofort auf (unter einer halben Sekunde), danach ist die LED wieder auf Dauerlicht, und der Druck hat keine neue Geschichte oder Aufnahme gestartet. Im Journal des Pi steht „Wiedergabe durch Tastendruck beendet“.
9. [ ] **Ausfall:** WLAN am Pi trennen und eine Frage stellen. LED zeigt Fehler, nach Wiederverbinden geht es ohne Neustart weiter.
10. [ ] **Ausfall des Sprachservers:** Den Sprachserver kurz anhalten (`sudo docker stop speaches`) und eine Frage stellen. Frage ergibt Fehlerzustand statt Stille oder Endlosschleife. Danach `sudo docker start speaches`.
11. [ ] **Dauerlauf:** 10 Fragen hintereinander ohne Neustart, Arbeitsspeicher des Servers (`systemctl status`) bleibt stabil.
12. [ ] **Spracherkennung und Stimme:** Zehn kurze Sätze, wie Kinder sie sagen („Hallo Kunibert“, „Erzähl mir eine Geschichte“, „Wo wohnt der Drache?“), am besten auch mit einer Kinderstimme. Die Antworten müssen zur Frage passen, sonst wurde falsch oder in der falschen Sprache erkannt (im Produktionsbetrieb ist der Wortlaut der Erkennung absichtlich nicht einsehbar). Mit `PICASTAI_STT_PROMPT=Ritter Kunibert` prüfen, dass Stille oder Rauschen (eine Aufnahme ohne Sprechen) den Hinweis „nicht verstanden“ ergibt (im Test vom 6.11.2026 war das so). Seit dem 12.11.2026 behandelt der Server eine Erkennung, die nur aus dem Hinweis („Ritter Kunibert“) oder einem bekannten Untertitel-Abspann („Untertitel im Auftrag des ZDF …“) besteht, wie eine leere Erkennung; wer nur „Ritter Kunibert“ sagt, hört deshalb auch „nicht verstanden“. Dazu fünf Testsätze der Sicherheitsweiche aus Schritt 5 mit Kinderstimme: Die Weiche muss anschlagen, sonst ist die Erkennung zu schlecht. Den Parameter `language=de` nimmt Speaches an (Quelltext von Speaches 0.8.3, `src/speaches/routers/stt.py`, am 12.11.2026 gelesen); Stille schneidet Speaches dort standardmäßig mit einer Spracherkennung der Sprechpausen (VAD) weg. Meldet das Journal trotzdem einen HTTP-Fehler der Spracherkennung, bitte melden. **Hörtest:** dieselbe ganze Geschichte mit mehreren deutschen Stimmen anhören (`PICASTAI_TTS_VOICE`): warm, deutlich, nicht zu schnell? Die gewählte Stimme und die Wartezeit notieren.

## D. Auswertung

- [ ] Aus dem Journal: Fehler, Wiederholungen, Dauer je Anfrage. Keine Schlüssel, Aufnahmen oder Antworttexte im Log.
- [ ] Notieren: Welche Antworten klangen falsch, zu lang, zu unheimlich? Das sind die Beispiele für `npm run eval:llm` und die Notfall-Muster.
- [ ] Testgeräte widerrufen oder Token wechseln, wenn der Pi weitergegeben wird.

## Go / No-Go

**Go für Tests mit Kindern** erst nach: abgeschlossener fachlicher Prüfung der Sicherheitsweiche, Datenschutz- und Einwilligungskonzept (Kinderstimme nur an den eigenen Sprachserver, erkannter Text an Anthropic, bei Google-Sprachausgabe auch der Antworttext an Google), Einwilligung der Erziehungsberechtigten und einem fehlerfreien Durchlauf aller Punkte oben.
