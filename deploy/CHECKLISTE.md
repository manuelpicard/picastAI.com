# Checkliste: Server und erster Durchlauf mit dem echten Pi

Nur mit **erwachsenen Testpersonen** und unkritischen Sätzen, bis Datenschutz- und Sicherheitsprüfung abgeschlossen sind. Tests mit Kindern oder Kinderstimmen erst nach der „Freigabe-Checkliste vor dem ersten Kind“ (Doc „Datenschutz-Folgenabschätzung“ des Betreibers).

Für den Server gibt es zwei Wege. Teil B bis D gelten für beide.

- **Server auf dem eigenen Rechner** (Windows, im selben WLAN wie der Pi): reicht für den ersten Durchlauf und kostet nichts außer den Aufrufen an Claude. Teil A1. Ausführliche Befehle: [`pi-client/README.md`](../pi-client/README.md), Abschnitte „Ganz ohne gemieteten Server“ (Sprachserver und Stimme) und „Später: der Pi im selben WLAN“.
- **Gemieteter Server** (Linux, mit Caddy und HTTPS): nötig, sobald der Pi außerhalb des eigenen WLANs arbeiten soll. Teil A2. Ausführliche Befehle: [`EINRICHTUNG.md`](EINRICHTUNG.md).

## A1. Server auf dem eigenen Rechner (Windows, PowerShell)

Stand 21.11.2026: **nicht unter Windows und nicht mit einem Pi getestet**; geschrieben nach dem Code (`server.ts`, `server-api/config.ts`, `server-api/devices.ts`, `deploy/eltern-einwilligung.mjs`).

- [ ] **Sprachserver:** `docker start speaches` (beim ersten Mal `docker run …` und die beiden Modelle laden, siehe README). `curl.exe -fsS http://127.0.0.1:8000/health` antwortet.
- [ ] **Stimme:** Pocket TTS läuft im eigenen Fenster (`uvx --python 3.12 pocket-tts@4.0.1 serve --language german --default-voice stuart_bell --host 127.0.0.1 --port 8001`). `curl.exe -fsS http://127.0.0.1:8001/health` antwortet. Sprachserver und Stimme lauschen nur auf `127.0.0.1`, also nur für den Rechner selbst.
- [ ] **Zwei Tokens** erzeugt (README, Schritt 1, je 64 Zeichen): eines für den Pi (`PICASTAI_DEVICE_TOKEN`) und eines für den Betreiber (`PICASTAI_ADMIN_TOKEN`; unter 32 Zeichen antwortet die Betreiber-Route mit 503). Tokens und den Schlüssel für Claude nur in die verdeckten Abfragen (`Read-Host -AsSecureString`, README, Schritte 3 und 3b) und am Pi eintippen, nie direkt in eine Befehlszeile: PowerShell speichert Befehlszeilen in einer Verlaufsdatei. Jede Zeile mit `Read-Host` einzeln einfügen und mit der Eingabetaste abschicken, erst dann das Token eingeben. Sonst liest die Abfrage die nächste eingefügte Zeile als Token.
- [ ] **Feste IPv4-Adresse:** `ipconfig`, Zeile „IPv4-Adresse“ des WLAN- oder LAN-Adapters, im Router als feste Adresse vergeben. Der Pi bekommt in Teil B die Adresse `http://<IPv4-Adresse>:3000`.
- [ ] **Windows-Firewall:** Node.js nur für „Private Netzwerke“ erlaubt, nicht für „Öffentliche Netzwerke“. Das WLAN ist in Windows als „Privates Netzwerk“ eingestellt. Kommt beim ersten Start keine Frage, gibt es vielleicht schon eine Regel für Node.js: unter „Windows-Sicherheit“, „Firewall- und Netzwerkschutz“, „Zugriff von App durch Firewall zulassen“ nachsehen. Node.js darf dort nur bei „Privat“ angehakt sein. Eine Sperre für Node.js geht jeder Erlaubnis vor. Fehlt eine Regel: „Kunibert-Server (Heimnetz)“ als Administrator anlegen (nur TCP 3000, nur aus dem eigenen Netz, nur Profil „Privat“; README, Schritt 4).
- [ ] **Server-Fenster** (Fenster 1, im Ordner des Repos, Stand von `main`; README, Schritt 3): `npm ci` und `npm run build`, dann `NODE_ENV=production`, `HOST=0.0.0.0`, `PICASTAI_AUDIO_STREAM=1`, `PICASTAI_DEVICE_ID=prototype-001`, die beiden Tokens, der Schlüssel für Claude (`ANTHROPIC_API_KEY`), die Zeilen für Sprachserver (`PICASTAI_STT_…`) und Stimme (`PICASTAI_TTS_PROVIDER=pocket`, `PICASTAI_POCKET_TTS_URL`), dann `npm start`. Mit `PICASTAI_AUDIO_STREAM=1` beginnt ein Teil der Geschichte, den Claude gerade schreibt, schon nach dem ersten Absatz. Fragen, feste Texte und vorbereitete Teile kommen auch dann als ganze Datei. `KUNIBERT_EINWILLIGUNG_PRUEFEN` nicht setzen: Mit `NODE_ENV=production` wirkt es nicht.
- [ ] **Startzeilen** in Fenster 1: `läuft auf http://0.0.0.0:3000`; kein „Hinweis: NODE_ENV ist nicht "production"“; keine Zeile mit ⚠️; nach einigen Sekunden „Feste Sprechtexte vorbereitet (7 von 7)“. Steht dort „Feste Sprechtexte: … von 7 vorbereitet, neuer Versuch in … s“, erreicht der Server die Stimme nicht: Fenster und `/health` von Pocket TTS prüfen. Nach gut sechs Minuten ohne Erfolg steht dort „(0 von 7)“.
- [ ] **Health:** `curl.exe -fsS http://127.0.0.1:3000/health` antwortet mit `"status":"ok"`. Nach der Installation am Pi (Teil B) dort `curl -fsS http://<IPv4-Adresse>:3000/health`: Antwortet das nicht, blockieren WLAN, Adresse oder Firewall.
- [ ] **Einwilligung** (Fenster 2, im Ordner des Repos, nach jedem Start des Servers; README, Schritt 3b): Betreiber-Token verdeckt eingeben, `PICASTAI_DEVICE_ID=prototype-001`, dann `node deploy\eltern-einwilligung.mjs`. Erwartet: `Einwilligung erteilt.` Danach Fenster 2 schließen.
- [ ] **Neustartprobe:** in Fenster 1 Strg+C, dann `npm start` erneut (die Einstellungen bleiben in diesem Fenster gesetzt). `/health` antwortet wieder, danach die Einwilligung erneut erteilen.
- [ ] **Grenzen bekannt:** Zwischen Pi und Rechner läuft http, also unverschlüsselt im eigenen WLAN. Ohne Caddy ist im WLAN mehr erreichbar als nur die Geräte-Routen: die Eltern-Routen (`/v1/eltern/…`, nur mit Kopplungscode), die Betreiber-Routen (`/api/…`, nur mit Betreiber-Token) und die Entwicklungsseiten (`/`, `/hoerproben`; ohne Daten). Deshalb nur im eigenen, verschlüsselten WLAN und nur mit Erwachsenen. Aufräumen: README, Abschnitt „Später: der Pi im selben WLAN“, „Grenzen“.

## A2. Gemieteter Server

- [ ] Hostname, DNS-A-Eintrag, TCP 80/443 offen, Port 3000 von außen zu (`ss -ltnp` zeigt 127.0.0.1:3000).
- [ ] `NODE_ENV=production`; im Journal keine Warnung dazu; `/etc/kunibert/kunibert.env` gehört root, Modus 600.
- [ ] `PICASTAI_PUBLIC_BASE_URL` = Hostname im Caddyfile = `PICASTAI_API_BASE_URL` auf dem Pi.
- [ ] `systemctl status kunibert-server` aktiv; Journal: „Feste Sprechtexte vorbereitet (7 von 7)“ (Sicherheitshinweis, „nicht verstanden“, Fehlerhinweis, Ersatzantwort, Pausensatz der Geschichte, Hinweis ohne Einwilligung, Satz im Schlafmodus). Ist der Sprachserver beim Start noch nicht bereit, versucht der Dienst es gut sechs Minuten lang wieder („neuer Versuch in … s“).
- [ ] Von außen: `/health` 200, `/` 404, `/api/status` 404, HTTP leitet auf HTTPS, Zertifikat gültig.
- [ ] Neustartprobe: Server neu starten, `/health` wieder 200.

## B. Pi vorbereiten

- [ ] USB-Mikrofon und USB-Lautsprecher (Pi 5) mit `pi-client/test_alsa_audio.sh` einzeln geprüft; bei zwei USB-Geräten `KUNIBERT_INPUT_DEVICE`/`KUNIBERT_OUTPUT_DEVICE` gesetzt (siehe `pi-client/README.md`, „Erster Aufbau“).
- [ ] `/etc/kunibert/kunibert.env` auf dem Pi: richtige URL, Geräte-ID, Token (Modus 600).
- [ ] `python pi-client/kunibert_client.py --once health` gibt `OK`.
- [ ] Mikrofon-Aus-Schalter trennt das Mikrofon **elektrisch** (separat geprüft, nicht nur GPIO 22).

## C. Erster Durchlauf

Nebeneinander offen: am Pi `journalctl -u kunibert.service -f` (nach `sudo systemctl start kunibert.service`), dazu das Server-Protokoll. Auf dem eigenen Rechner ist das Fenster 1, auf dem gemieteten Server `sudo journalctl -u kunibert-server -f`.

Vorher, nach jedem Neustart des Servers: Einwilligung für das Testgerät erteilen (eigener Rechner: Teil A1; gemieteter Server: `deploy/EINRICHTUNG.md`, Abschnitt 5, „Einwilligung für Tests mit Erwachsenen“). Hört man auf jede Taste nur „… müssen mich deine Eltern einmal einrichten …“, fehlt sie. Meist wurde der Server neu gestartet: Die Einwilligung liegt vorläufig nur im Arbeitsspeicher. Dann das Skript noch einmal aufrufen.

1. [ ] **Frage:** Sprechtaste halten, „Warum ist der Himmel blau?“, loslassen. LED: Aufnahme (schnell), dann Verarbeitung (langsam), dann Wiedergabe; die Antwort ist verständlich, kindgerecht und unter ca. 80 Wörtern.
2. [ ] **Dauer:** Zeit von Loslassen bis erstes Wort notieren (Ziel: unter 20 s; über 60 s ist ein Problem). Welche Stufe die Zeit braucht, zeigen die Zeilen `Zeitmessung` im Server-Protokoll (Erklärung: [`docs/Zeitmessung.md`](../docs/Zeitmessung.md)): auf dem eigenen Rechner in Fenster 1, auf dem gemieteten Server mit `sudo journalctl -u kunibert-server -n 200 --no-pager | grep Zeitmessung`. Die Zeile je Anfrage mit notieren.
3. [ ] **Geschichte in 5 Teilen:** Erzähltaste fünfmal nacheinander. Teil 1 bis 5 setzen sich fort, nach Teil 5 ein Abschluss, der sechste Druck beginnt eine neue Folge. Ab Teil 2 sollte die Wartezeit deutlich kürzer sein als bei Teil 1, wenn man jeden Teil zu Ende hört: Der Server bereitet den nächsten Teil vor (`vorbereitet_ms` mit einer Zahl und `sprachmodell_ms=-` in der Zeitmessung). Kommt Teil 2 genauso langsam, steht dort `vorbereitet_ms=-`: bitte melden.
4. [ ] **Erzähltaste mit Wunsch:** „Erzähl mir etwas mit einem Einhorn“ per Sprechtaste, dann Erzähltaste. Danach, mitten in der Folge, per Sprechtaste eine Idee: „Kunibert soll den Drachen kitzeln.“ Der nächste Teil derselben Folge greift die Idee am Anfang auf (keine neue Folge, keine bloße Antwort).
5. [ ] **Notfallsatz** (nur Testsatz!): „Ich habe mich verlaufen“ ergibt den festen Sicherheitshinweis mit Notrufnummern, ohne Modellantwort. Zusätzlich „Warum riecht der Drache nach Rauch?“ ergibt eine normale Antwort (kein Fehlalarm).
6. [ ] **Mikrofon aus:** Schalter während einer Aufnahme umlegen. Aufnahme wird verworfen, LED Doppelblitz, nichts erscheint im Server-Protokoll.
7. [ ] **Zu kurz / stumm:** Taste kurz antippen und ein Satz in Stille. Der Pi verwirft zu kurze Aufnahmen; eine stumme Aufnahme ergibt „nicht verstanden“, ohne dass sie an die Spracherkennung geht (im Server-Protokoll steht dann `erkennung_ms=-`). Ist eine Aufnahme mit Sprechen trotzdem stumm, steht im Journal des Pi „Die Aufnahme ist praktisch stumm“: Mikrofon und Pegel prüfen. Kein Absturz.
8. [ ] **Stoppen:** Während Kunibert eine Geschichte erzählt, kurz die Erzähltaste (und einmal die Sprechtaste) drücken. Er hört sofort auf (unter einer halben Sekunde), danach ist die LED wieder auf Dauerlicht, und der Druck hat keine neue Geschichte oder Aufnahme gestartet. Im Journal des Pi steht „Wiedergabe durch Tastendruck beendet“.
9. [ ] **Ausfall:** WLAN am Pi trennen und eine Frage stellen. LED zeigt Fehler, nach Wiederverbinden geht es ohne Neustart weiter.
10. [ ] **Ausfall des Sprachservers:** Den Sprachserver kurz anhalten (eigener Rechner: `docker stop speaches`; gemieteter Server: `sudo docker stop speaches`) und eine Frage stellen. Frage ergibt Fehlerzustand statt Stille oder Endlosschleife. Danach `docker start speaches` (gemieteter Server: `sudo docker start speaches`).
11. [ ] **Dauerlauf:** 10 Fragen hintereinander ohne Neustart. Der Arbeitsspeicher des Servers bleibt stabil: auf dem eigenen Rechner im Task-Manager (Reiter „Details“, `node.exe` mit dem größten Wert, Spalte „Arbeitsspeicher“), auf dem gemieteten Server mit `systemctl status kunibert-server` (Zeile „Memory“). Vorher und nachher notieren.
12. [ ] **Spracherkennung und Stimme:** Zehn kurze Sätze, wie Kinder sie sagen („Hallo Kunibert“, „Erzähl mir eine Geschichte“, „Wo wohnt der Drache?“), gesprochen von Erwachsenen. Tests mit Kinderstimmen erst nach der „Freigabe-Checkliste vor dem ersten Kind“ (Doc „Datenschutz-Folgenabschätzung“ des Betreibers). Die Antworten müssen zur Frage passen, sonst wurde falsch oder in der falschen Sprache erkannt (im Produktionsbetrieb ist der Wortlaut der Erkennung absichtlich nicht einsehbar). Mit `PICASTAI_STT_PROMPT=Ritter Kunibert` prüfen, dass Stille oder Rauschen (eine Aufnahme ohne Sprechen) den Hinweis „nicht verstanden“ ergibt (im Test vom 6.11.2026 war das so). Seit dem 12.11.2026 behandelt der Server eine Erkennung, die nur aus dem Hinweis („Ritter Kunibert“) oder einem bekannten Untertitel-Abspann („Untertitel im Auftrag des ZDF …“) besteht, wie eine leere Erkennung; wer nur „Ritter Kunibert“ sagt, hört deshalb auch „nicht verstanden“. Dazu fünf Testsätze der Sicherheitsweiche (Liste `MUST_TRIGGER` in `server-api/safety.test.ts`; wie in Schritt 5 nur als Testsatz), ebenfalls von Erwachsenen gesprochen: Die Weiche muss anschlagen, sonst ist die Erkennung zu schlecht. Ob sie auch bei Kinderstimmen anschlägt, zeigt erst ein Test nach der Freigabe-Checkliste. Den Parameter `language=de` nimmt Speaches an (Quelltext von Speaches 0.8.3, `src/speaches/routers/stt.py`, am 12.11.2026 gelesen); Stille schneidet Speaches dort standardmäßig mit einer Spracherkennung der Sprechpausen (VAD) weg. Meldet das Server-Protokoll trotzdem einen HTTP-Fehler der Spracherkennung, bitte melden. **Hörtest:** dieselbe ganze Geschichte mit mehreren deutschen Stimmen anhören (`PICASTAI_TTS_VOICE`): warm, deutlich, nicht zu schnell? Die gewählte Stimme und die Wartezeit notieren.

## D. Auswertung

- [ ] Aus dem Server-Protokoll (Fenster 1 oder Journal) und dem Journal des Pi: Fehler, Wiederholungen, Dauer je Anfrage. Keine Schlüssel, Aufnahmen oder Antworttexte im Log.
- [ ] Notieren: Welche Antworten klangen falsch, zu lang, zu unheimlich? Das sind die Beispiele für `npm run eval:llm` und die Notfall-Muster.
- [ ] Testgeräte widerrufen oder Token wechseln, wenn der Pi weitergegeben wird.

## Go / No-Go

**Go für Tests mit Kindern** erst nach der „Freigabe-Checkliste vor dem ersten Kind“ (Doc „Datenschutz-Folgenabschätzung“ des Betreibers) und nach: abgeschlossener fachlicher Prüfung der Sicherheitsweiche, Datenschutz- und Einwilligungskonzept (Kinderstimme nur an den eigenen Sprachserver, erkannter Text an Anthropic, bei Google-Sprachausgabe auch der Antworttext an Google), Einwilligung der Erziehungsberechtigten und einem fehlerfreien Durchlauf aller Punkte oben. Außerdem ist auf dem Server `KUNIBERT_TEST_TRANSCRIPT` nicht gesetzt (beim Start erscheint keine Warnung dazu), damit nur die Aufnahme zählt.
