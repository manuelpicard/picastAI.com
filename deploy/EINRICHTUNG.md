# Server einrichten (Debian/Ubuntu, Node-Server)

Diese Anleitung installiert den Kunibert-Server (Node 22, Express) hinter Caddy. Der Pi bleibt Client. Die abhakbare Abnahme samt erstem Durchlauf mit echtem Pi steht in [`CHECKLISTE.md`](CHECKLISTE.md).

> **Stand (11.11.2026):** Die Dateien in diesem Ordner sind noch auf keinem echten Server ausgeführt. Geprüft ist: die systemd-Datei mit `systemd-analyze verify`; das Caddyfile mit `caddy validate` (Caddy 2.11.9 im Docker-Container) und im Betrieb gegen den lokalen Server (404 für `/` und `/api/*`, Weiterleitung auf HTTPS, 413 bei zu großer Datei); der Server mit Speaches (faster-whisper-small, Piper) und einer Sprachmodell-Attrappe (`deploy/dryrun/`, Ergebnis in [`dryrun/ERGEBNIS.md`](dryrun/ERGEBNIS.md)). **Nicht** geprüft: echte Anthropic-Aufrufe, Zeiten auf dem Hetzner-Server, Zertifikat von Let's Encrypt. Die Starttests, die Pi-Zeitgrenze (140 s) und das Zeitbudget des Servers (120 s, `server-api/timing.test.ts`) laufen in der CI; die Grenze von Caddy prüft keine Testdatei (siehe „Zeitkette“).

## Nach der Bestellung (Reihenfolge)

Der Server wird erst bestellt, wenn er wirklich nötig ist (Entscheidung des Betreibers vom 12.11.2026): Hetzner rechnet stundenweise ab. Für den Probelauf genügt dein eigener Rechner, ohne Kosten außer den Aufrufen an Claude: `pi-client/README.md`, Abschnitt „Ganz ohne gemieteten Server“. Dann der Reihe nach. **Du selbst** (nicht Claude, nicht ein Skript) machst die mit 👤 markierten Schritte. Zeiten sind **Schätzungen**, nicht gemessen.

1. 👤 **Vorher, ohne Kosten:** Hostname festlegen (und wo sein DNS liegt), SSH-Schlüssel erzeugen, Passwortmanager bereithalten. *(ca. 15 Minuten)*
2. 👤 **Hetzner Console:** Server CCX13, Standort Nürnberg, Image „Docker CE“, den SSH-Schlüssel hinterlegen. Dazu eine **Cloud Firewall** anlegen: eingehend nur TCP 22 (am besten nur von deiner IP), 80 und 443. Öffentliche IPv4 notieren. *(ca. 15 Minuten)*
3. 👤 **DNS:** A-Eintrag für den Hostnamen auf die IPv4 setzen und warten, bis `dig +short kunibert.example` sie zurückgibt. Erst danach Caddy starten, sonst scheitert das Zertifikat. *(5 Minuten Arbeit, Wartezeit von Minuten bis Stunden)*
4. 👤 **AV-Vertrag** (Auftragsverarbeitung) mit Hetzner abschließen, bevor Daten auf dem Server liegen. Wo genau im Kundenkonto, ist nicht geprüft. Rechtliche Bewertung bleibt geparkt.
5. **Auf dem Server (per SSH):** Node.js 22 installieren, dann Abschnitt 2 (Benutzer, Code, `npm ci`, `npm run build`). *(ca. 15 bis 20 Minuten)*
6. **Sprachserver:** Abschnitt 4 (Docker-Container, Modelle laden). Das Laden der Modelle dauert am längsten. *(ca. 15 bis 30 Minuten)*
7. 👤 **Schlüssel und Tokens, nur auf dem Server:** Abschnitt 3. `ANTHROPIC_API_KEY` mit `sudoedit` in `/etc/kunibert/kunibert.env` eintragen: nie in Chat, Git, Skript oder Shell-Historie. Admin- und Geräte-Token dort mit `openssl rand -hex 32` erzeugen; das Geräte-Token brauchst du später auf dem Pi und für das Prüfskript (aus dem Passwortmanager, nicht aus Chats).
8. **Dienst starten** (Abschnitt 5), dann **Caddy** (Abschnitt 6, `caddy validate` vor dem Neuladen). *(ca. 15 Minuten)*
9. 👤 **Prüfskript von deinem Rechner aus** (Abschnitt 7): `deploy/smoke-test.sh` gegen die echte Domain. Alles muss „OK“ sein. *(5 Minuten)*
10. 👤 **Pi anbinden** (Abschnitt 8) und die [`CHECKLISTE.md`](CHECKLISTE.md) abarbeiten. Dabei die Zeiten aus [`docs/Zeitmessung.md`](../docs/Zeitmessung.md) notieren: die Wartezeit auf der CCX13 ist **offen** (siehe `dryrun/ERGEBNIS.md`).
11. 👤 **Nach dem Test:** Wird der Server nicht weiter gebraucht, in der Console **löschen** (nur Ausschalten beendet nach Hetzners Preisregeln die Kosten wahrscheinlich nicht; vor Ort in der Hetzner-Dokumentation prüfen). Testschlüssel beim Anbieter widerrufen.

Gesamt bis zum ersten Pi-Durchlauf grob **2 bis 3 Stunden** reine Arbeitszeit (Schätzung).

### Kürzer mit dem Skript

Die Schritte 5, 6 und 8 und die Vorbereitung von Schritt 7 erledigt [`setup-server.sh`](setup-server.sh) in einem Lauf (Pakete, Node.js 22, Docker, Caddy, Benutzer, Frist für Protokolle, Code, Build, env-Datei, Sprachserver mit Modellen, Dienst, Caddyfile). Es ist mehrfach ausführbar. **Stand: auf keinem echten Server gelaufen.** Geprüft sind `bash -n`, `shellcheck` und die Hilfsfunktionen (`bash deploy/setup-server.test.sh`). Bricht es ab, geht es von Hand mit den Abschnitten 1 bis 6 weiter.

```bash
# von deinem Rechner (im Repo-Ordner; unter Windows in PowerShell mit OpenSSH)
scp deploy/setup-server.sh root@<IPv4>:
ssh root@<IPv4>
# auf dem Server
bash setup-server.sh --hostname kunibert.example
```

- 👤 Beim **ersten Lauf** hält das Skript an und zeigt einen öffentlichen Deploy-Key. Den trägst du bei GitHub ein (Repo → Settings → Deploy keys, **ohne** Schreibrecht) und startest das Skript noch einmal.
- Admin- und Geräte-Token erzeugt das Skript selbst und schreibt sie nur in `/etc/kunibert/kunibert.env` (nicht auf den Bildschirm). 👤 Den `ANTHROPIC_API_KEY` trägst du danach selbst mit `sudoedit` ein; das Skript kennt ihn nicht.
- Zeigt der Hostname noch nicht auf den Server, stoppt das Skript Caddy und sagt es. So gibt es keine Fehlversuche beim Zertifikat. Nach dem DNS-Eintrag: `sudo systemctl start caddy`.
- **Wartezeit messen:** Gleich nach dem Lauf `bash /opt/kunibert/app/deploy/stt-messung.sh` starten. Es misst die Spracherkennung mit `tiny`, `base` und `small` auf diesem Server und zeigt, was erkannt wurde (auch nicht auf einem echten Server gelaufen). Damit ist die offene Frage zur Wartezeit auf der CCX13 in ein paar Minuten beantwortet.
- Anderes Erkennungsmodell: `--stt-model Systran/faster-whisper-base`. Image des Sprachservers: Standard ist die feste Version `0.8.3-cpu` (am 12.11.2026 dieselbe Kennung wie `latest-cpu`); eine andere mit `--speaches-image ghcr.io/speaches-ai/speaches:<Version>-cpu`. Die Zusammenfassung nennt die Kennung des Images, das tatsächlich läuft. Alle Optionen: `bash setup-server.sh --help`.
- Das Skript schaltet automatische Sicherheitsupdates des Betriebssystems ein (`unattended-upgrades`, ohne automatischen Neustart).

```text
Pi --HTTPS :443--> Caddy --HTTP lokal--> 127.0.0.1:3000 Kunibert-Server
                                              |
                      Sprachserver (Speaches, nur lokal) und Claude (Sprachmodell)
```

Öffentlich ist nur Caddy, und Caddy reicht nur `/health` und `/v1/device/*` durch. Admin-Routen (`/api/*`) und die Weboberfläche sind von außen nicht erreichbar.

## 1. Voraussetzungen

- Debian 12 oder Ubuntu 24.04 mit systemd (das Hetzner-Image „Docker CE“ ist ein Ubuntu mit installiertem Docker, aber **ohne** Node.js), `sudo`-Zugang, Node.js 22 (wie in der CI; Installation nach [nodejs.org](https://nodejs.org/en/download)), `git`, `openssl`. Docker wird nur für den Sprachserver gebraucht; für den Node-Server gibt es in diesem Repo kein Dockerfile und keine Compose-Datei, er läuft als systemd-Dienst.
- Ein Hostname, dessen DNS du kontrollierst, mit A-Eintrag auf die öffentliche IP (AAAA nur, wenn IPv6 wirklich geht). `kunibert.example` unten durch deinen Namen ersetzen, **überall gleich**.
- Eingehend TCP 80 und 443 offen (bei Hetzner zusätzlich in der Cloud Firewall der Console). Port 3000 und 8000 nie nach außen freigeben: `HOST=127.0.0.1` in der env-Datei und `--publish 127.0.0.1:8000:8000` beim Sprachserver sorgen dafür. Ohne `HOST` lauscht der Server auf allen Adressen (`server-api/config.ts`, Feld `host`). Vorsicht bei Docker: Ein Port, der ohne `127.0.0.1` veröffentlicht wird, umgeht eine `ufw`-Firewall.
- Schlüssel: `ANTHROPIC_API_KEY` (Sprachmodell). Spracherkennung und Sprachausgabe laufen auf einem eigenen Sprachserver (Abschnitt 4) und brauchen keinen Schlüssel.
- Die Kinderstimme bleibt auf deinem Server und dem Sprachserver; nur der erkannte Text geht an Anthropic (Sprachmodell, Verarbeitung in den USA). OpenAI und Gemini sind für den Kinderbetrieb ausgeschlossen. Bis zur Datenschutzprüfung nur Erwachsene als Tester.

## 2. Benutzer, Code, Abhängigkeiten, Build

```bash
sudo useradd --system --home-dir /var/lib/kunibert --shell /usr/sbin/nologin kunibert
sudo install -d -o root -g root -m 755 /opt/kunibert
sudo install -d -o root -g root -m 700 /etc/kunibert

# Code: geprüften Stand von main (oder einem Tag) holen. Das Repo ist privat: einen
# read-only Deploy-Key verwenden, kein persönliches Token auf dem Server.
sudo git clone git@github.com:manuelpicard/picastAI.com.git /opt/kunibert/app
cd /opt/kunibert/app
sudo npm ci             # genau die Versionen aus package-lock.json; tsx (devDependency) wird zur Laufzeit gebraucht
sudo npm run build      # Typprüfung und Weboberfläche nach dist/
```

Es gibt keinen eigenen Produktionsstart ohne `tsx`: der Dienst startet `node --import tsx server.ts`. Deshalb keine `--omit=dev`-Installation.

## 3. Konfiguration und Geheimnisse

```bash
sudo install -o root -g root -m 600 deploy/kunibert.env.example /etc/kunibert/kunibert.env
sudo openssl rand -hex 32     # dreimal ausführen: Admin-Token, Geräte-Token, Schlüssel der Eltern-Steuerung
sudoedit /etc/kunibert/kunibert.env
```

Mindestens setzen: `PICASTAI_PUBLIC_BASE_URL`, `PICASTAI_ADMIN_TOKEN`, `PICASTAI_DEVICE_TOKEN`, `KUNIBERT_ELTERN_SCHLUESSEL`, `ANTHROPIC_API_KEY` und nach Abschnitt 4 `PICASTAI_STT_MODEL`, `PICASTAI_TTS_MODEL`, `PICASTAI_TTS_VOICE`. Werte nicht in die Shell-Historie tippen. Wichtige Punkte:

- `NODE_ENV=production` ist Pflicht. Ohne sind Entwicklungsgeräte mit **bekannten Tokens** aktiv.
- `PICASTAI_PUBLIC_BASE_URL` bestimmt die `audio_url`. Der Pi lehnt eine Adresse mit anderem Schema oder Host ab. Gleiche Schreibweise wie auf dem Pi (`PICASTAI_API_BASE_URL`).
- Ein Gerät aus `PICASTAI_DEVICE_ID`/`PICASTAI_DEVICE_TOKEN` überlebt Neustarts. Über `/api/devices` angelegte Geräte nur mit `PICASTAI_DEVICE_STORE=firestore`.
- Eltern-Steuerung dauerhaft (seit 23.11.2026, Punkt E2): `KUNIBERT_ELTERN_DATEI=/var/lib/kunibert/eltern.json` und `KUNIBERT_ELTERN_SCHLUESSEL` (mindestens 32 Zeichen, `openssl rand -hex 32`). Dann überstehen Einwilligung, Schlafmodus, Ruhezeiten und die Kopplung der Eltern-Handys einen Neustart. Die Datei muss unter `/var/lib/kunibert` liegen: Nur dort darf der Dienst schreiben (`StateDirectory=kunibert` mit `ProtectSystem=strict` in `deploy/kunibert-server.service`). Den Schlüssel nicht ändern und nicht verlieren: Sonst passen die Pseudonyme nicht mehr, der Server löscht die alten Einträge beim nächsten Start, und alle Eltern müssen neu koppeln und einwilligen. Fehlt eins von beiden, startet der Server mit der Warnung `Eltern-Steuerung nur im Arbeitsspeicher`. Was in der Datei steht: `docs/picastAI-Pi-API.md`, Abschnitt „Dauerhaft: Datei der Eltern-Steuerung“. `setup-server.sh` setzt beides, wenn es fehlt.

## 4. Sprachserver (Speaches)

Spracherkennung und Sprachausgabe laufen auf einem eigenen Server, hier [Speaches](https://github.com/speaches-ai/speaches) (MIT-Lizenz, OpenAI-kompatible Schnittstelle, `faster-whisper` für die Erkennung, `Piper` für die Stimme). So erreicht die Kinderstimme keinen Dritten. Auf demselben Rechner wie der Kunibert-Server, ohne GPU:

```bash
sudo docker run --detach --name speaches --restart unless-stopped \
  --publish 127.0.0.1:8000:8000 \
  --volume hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
  --log-driver journald --log-opt tag=speaches \
  ghcr.io/speaches-ai/speaches:0.8.3-cpu
```

Die Zeile mit `--log-driver` schickt die Meldungen des Sprachservers ins Journal. Dort gilt die Frist für Protokolle (Abschnitt „Betrieb“). Ohne sie schreibt Docker in eine eigene Datei, für die diese Frist nicht gilt.

`127.0.0.1` ist Absicht: der Sprachserver lauscht nur lokal und braucht deshalb keinen Schlüssel. Port 8000 nie nach außen freigeben. Mit NVIDIA-Grafikkarte stattdessen `latest-cuda` und `--gpus=all`. Liegt der Sprachserver auf einem anderen Rechner, nur per `https` und mit Schlüssel (`PICASTAI_STT_API_KEY`, `PICASTAI_TTS_API_KEY`) ansprechen; der Server warnt beim Start vor `http` zu fremden Rechnern.

Modelle laden (mit [uv](https://docs.astral.sh/uv/), Adresse des Sprachservers gesetzt):

```bash
export SPEACHES_BASE_URL=http://127.0.0.1:8000
uvx speaches-cli model download Systran/faster-whisper-small      # Beispiel aus der Speaches-Dokumentation
uvx speaches-cli registry ls --task text-to-speech                # verfügbare Stimmenmodelle (Piper, Kokoro)
```

- **Erkennung:** `Systran/faster-whisper-small` ist das Beispiel der Dokumentation und klein. In der Studie [Kid-Whisper](https://arxiv.org/html/2309.07927) erkennt ein größeres Whisper-Modell Kinderstimmen etwas besser, kostet aber mehr Rechenzeit. Schritt 12 der Checkliste prüft die Erkennung mit erwachsenen Sprechern. Ob ein Modell für Kinderstimmen reicht, zeigt erst ein Test nach der „Freigabe-Checkliste vor dem ersten Kind“. Das Modell ist über die Umgebungsvariable `PICASTAI_STT_MODEL` wählbar (`server-api/config.ts`, Feld `sttModel`); es muss vorher in Speaches heruntergeladen sein (siehe unten). Ein Wechsel (zum Beispiel auf `Systran/faster-whisper-base`) braucht also keine Codeänderung. Gemessen ist das nicht.
- **Stimme:** Piper hat deutsche Stimmen (`eva_k`, `karlsson`, `kerstin`, `mls`, `pavoque`, `ramona`, `thorsten`, `thorsten_emotional`). Am 11.11.2026 gegen die Speaches-Registry geprüft (Image `latest-cpu`): Das Modell heißt z. B. `speaches-ai/piper-de_DE-thorsten-medium` und die Stimme darin `thorsten` (also `PICASTAI_TTS_MODEL=speaches-ai/piper-de_DE-thorsten-medium`, `PICASTAI_TTS_VOICE=thorsten`). Es gibt dieselbe Stimme auch als `-low` und `-high`. Die Namen der anderen Stimmen: `registry ls` oder `curl -s "http://127.0.0.1:8000/v1/registry?task=text-to-speech"`. Jede Stimme hat eine eigene Lizenz: vor dem Einsatz mit Kindern prüfen.
- **Ohne `uv`:** Die Modelle lassen sich auch direkt über die Schnittstelle laden (so im Trockenlauf getestet): `curl -X POST http://127.0.0.1:8000/v1/models/Systran/faster-whisper-small` und `curl -X POST http://127.0.0.1:8000/v1/models/speaches-ai/piper-de_DE-thorsten-medium`. Antwort: `Model '…' downloaded`. Der Cache liegt im Volume `hf-hub-cache` (Pfad im Container `/home/ubuntu/.cache/huggingface/hub`, geprüft) und übersteht ein Neuanlegen des Containers.
- **Erkennung geprüft:** Eine mit Piper erzeugte Frage („Warum ist der Himmel blau?“) wurde mit `faster-whisper-small`, `language=de` und `prompt=Ritter Kunibert` richtig erkannt; der Parameter `language=de` wird von dieser Speaches-Version nicht abgelehnt.
- **Klingt keine Piper-Stimme gut genug:** Im Hörtest vom 6.11.2026 klangen die Piper-Stimmen auch mit abgesenkter Tonhöhe unnatürlich. Die Sprachausgabe lässt sich allein auf Google Cloud Text-to-Speech umstellen (`PICASTAI_TTS_PROVIDER=google`, Chirp 3 HD, siehe `docs/LLM-Anbieter.md`). Die Spracherkennung bleibt auf dem eigenen Server; zu Google geht dann nur der Antworttext. Für den Kinderbetrieb rechtlich prüfen.
- Die Namen in `/etc/kunibert/kunibert.env` eintragen (`PICASTAI_STT_MODEL`, `PICASTAI_TTS_MODEL`, `PICASTAI_TTS_VOICE`) und den Kunibert-Dienst neu starten.

Stimme direkt prüfen (Namen einsetzen):

```bash
curl -s http://127.0.0.1:8000/v1/audio/speech -H 'Content-Type: application/json' --output test.wav \
  --data '{"model":"<Stimmenmodell>","voice":"<Stimme>","input":"Hallo, ich bin Ritter Kunibert.","response_format":"wav"}'
```

## 5. Dienst starten

```bash
sudo install -o root -g root -m 644 deploy/kunibert-server.service /etc/systemd/system/kunibert-server.service
sudo systemd-analyze verify /etc/systemd/system/kunibert-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now kunibert-server
sudo systemctl status kunibert-server --no-pager
curl -fsS http://127.0.0.1:3000/health
```

Erwartet: `{"status":"ok", ...}`. Im Journal steht beim Start `Eltern-Steuerung aus der Datei geladen (…)` und `Feste Sprechtexte vorbereitet (7 von 7)`; bei `0 von 7` ist der Sprachserver nicht erreichbar oder Modell bzw. Stimme sind nicht heruntergeladen (Abschnitt 4). Eine Warnung zu `http` oder zu einem ausgeschlossenen Anbieter zeigt, dass eine Sprachdienst-Adresse nicht passt. Fehlersuche: `sudo journalctl -u kunibert-server -n 100 --no-pager`. Eine Warnung zu `NODE_ENV` und die Warnung `Eltern-Steuerung nur im Arbeitsspeicher` dürfen **nicht** erscheinen.

**Einwilligung für Tests mit Erwachsenen.** Ohne Einwilligung der Eltern antwortet Kunibert nur mit dem festen Hinweis „… müssen mich deine Eltern einmal einrichten …“ (`docs/picastAI-Pi-API.md`, Abschnitt „Eltern“). Solange das Gerät den Kopplungscode noch nicht selbst spricht, erteilt der Betreiber sie für das Testgerät auf dem Server. Mit der Datei der Eltern-Steuerung (Abschnitt 3) reicht das einmal; ohne sie nach jedem Neustart des Dienstes:

```bash
sudo node --env-file=/etc/kunibert/kunibert.env /opt/kunibert/app/deploy/eltern-einwilligung.mjs
```

Das Skript nimmt `PICASTAI_ADMIN_TOKEN` und `PICASTAI_DEVICE_ID` aus der Einstellungsdatei und spricht den Server unter `http://127.0.0.1:3000` an. Erwartet: `Einwilligung erteilt.` Es gibt weder Code noch Token aus. Nur Erwachsene testen.

## 6. Caddy

Installation nach der [offiziellen Anleitung](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Danach:

```bash
sudo install -o root -g root -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile            # kunibert.example ersetzen
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Die Vorlage erzwingt HTTPS, reicht nur `/health` und `/v1/device/*` durch, begrenzt den Body auf 3 MB und schreibt keine Zugriffsprotokolle. Steht noch ein weiterer Proxy davor, zusätzlich `PICASTAI_TRUST_PROXY` setzen (siehe [`docs/picastAI-Pi-API.md`](../docs/picastAI-Pi-API.md)).

### Zeitkette

Frage und Geschichte laufen durch Spracherkennung, Sprachmodell und Sprachausgabe. Die Grenzen müssen nach außen größer werden, sonst bricht eine Stelle ab, während dahinter noch gearbeitet wird:

| Stelle | Grenze | Einstellung |
| --- | --- | --- |
| Server (gemeinsames Zeitbudget der ganzen Anfrage) | 120 s | fest im Code (`TURN_BUDGET_MS`, `server-api/timing.ts`); die Grenzen je Aufruf `PICASTAI_VOICE_TIMEOUT_MS` (Spracherkennung und Sprachausgabe, 45 s) und `PICASTAI_LLM_TIMEOUT_MS` (30 s) gelten zusätzlich |
| Caddy | 130 s | `response_header_timeout` im Caddyfile |
| Pi-Client | 140 s | `KUNIBERT_PIPELINE_TIMEOUT` |

Die 120 s gelten **für die ganze Anfrage zusammen** (Entscheidung vom 11.11.2026, vorläufig). Ohne gemeinsames Budget wären es bei einem Geschichtenwunsch bis zu 45 + 30 + 30 + 45 = 150 s gewesen, denn dann fragt der Server Claude **zweimal** (erst die Einordnung, dann die Geschichte; siehe `docs/Zeitmessung.md`, Feld `sprachmodell_aufrufe`). Das wäre mehr als Caddy (130 s) und Pi (140 s) gewesen. So arbeitet der Server jetzt:

- Die Frist beginnt, wenn die Anfrage beim Server ankommt und angemeldet ist (`startTurnTimer` in `server.ts`). Die Aufnahme liest der Server erst danach (`upload.single` bei `/v1/device/question` und `/v1/turn`). Das Hochladen zählt also mit (berichtigt am 22.11.2026). Zwischen 120 s und den 130 s von Caddy liegt ein Puffer.
- Jeder Sprachmodell-Aufruf bekommt höchstens den Rest des Budgets **minus 15 s für die Sprachausgabe** (`TTS_RESERVE_MS`), und höchstens seine eigenen 30 s.
- Bleiben für einen Aufruf weniger als 3 s, wird er nicht mehr gestartet. Dann greift der feste Fallback-Text (derselbe Weg wie bei einem Fehler des Sprachmodells), und die Sprachausgabe läuft wie gewohnt.
- Die Sprachausgabe bekommt den Rest des Budgets, mindestens 5 s. Läuft sie in die Frist, antwortet der Server mit 503 `voice_provider_failed` (`retryable: true`), wie bisher bei einem Sprachdienst-Fehler. Die Erkennung kann nur die 45 s je Aufruf überschreiten, nicht das Budget; auch ihr Timeout ergibt 503.
- Die Sicherheitsweiche läuft vor dem Sprachmodell, braucht keinen Aufruf und wird vom Budget nicht berührt.
- Obergrenze: höchstens 120 s plus die 5 s Mindestzeit für die Sprachausgabe, also unter den 130 s von Caddy.

Offen: ob 120 s die richtige Größe sind, und die echten Zeiten auf der CCX13 (Schritt 10 oben).

Wer die Server-Grenzen ändert, passt die beiden anderen an. Quellen (ohne Zeilennummern, die veralten): `server-api/timing.ts` (`TURN_BUDGET_MS`, `TTS_RESERVE_MS`, `MIN_LLM_MS`, `MIN_TTS_MS`), `server-api/brain.ts` (Frist je Sprachmodell-Aufruf), `server.ts` (Erkennung und Sprachausgabe), `server-api/config.ts` (`llmTimeoutMs` und `voiceTimeoutMs`, Grenzen je Aufruf, 3 bis 120 s), `deploy/Caddyfile` (`response_header_timeout 130s`), `pi-client/kunibert_client.py` (`KUNIBERT_PIPELINE_TIMEOUT`, Standard 140 s).

## 7. Abnahme von außen

Alle Prüfungen dieses Abschnitts (und mehr: Zertifikat, falscher Token gibt 401, zu große Datei gibt 413) macht das Skript `deploy/smoke-test.sh`. Es läuft auf deinem Rechner (Linux oder macOS mit `bash`, `curl` und `openssl`; unter Windows in WSL, in Git Bash mit dem Windows-`curl` ging es im Test nicht), ruft weder Spracherkennung noch Sprachmodell auf und liest Adresse und Gerätetoken nur aus der Umgebung:

```bash
read -rs PICASTAI_DEVICE_TOKEN; export PICASTAI_DEVICE_TOKEN     # Token einfügen, Eingabe bleibt unsichtbar
PICASTAI_API_BASE_URL=https://kunibert.example PICASTAI_DEVICE_ID=prototype-001 ./deploy/smoke-test.sh
```

Ausgang 0 heißt: alles bestanden. Einzelne Prüfungen von Hand:

```bash
curl -i https://kunibert.example/health        # 200
curl -i https://kunibert.example/              # 404
curl -i https://kunibert.example/api/status    # 404, Admin-Routen sind nicht erreichbar
curl -i http://kunibert.example/health         # Weiterleitung auf https
```

Von innen mit Admin-Token (nur auf dem Server): `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/api/status`.

## 8. Pi anbinden

Auf dem Pi (siehe [`pi-client/README.md`](../pi-client/README.md)) `PICASTAI_API_BASE_URL=https://kunibert.example`, dieselbe `PICASTAI_DEVICE_ID` und das Geräte-Token eintragen, dann `--once health` und `--once story` prüfen. Weiter mit der Checkliste.

## Betrieb

- **Update:** neuen Stand holen (`git pull`), `npm ci`, `npm run build`, `sudo systemctl restart kunibert-server`, Abnahme wiederholen. Hat sich `deploy/kunibert-server.service` geändert (zum Beispiel `SyslogIdentifier=` seit 23.11.2026), die Datei wie in Abschnitt 5 neu installieren und `sudo systemctl daemon-reload` vor dem Neustart. Einfacher: `setup-server.sh` noch einmal starten. Ein Neustart verwirft laufende Folgen und nicht abgeholtes Audio (nur im Arbeitsspeicher).
- **Gerät sperren:** bei Umgebungs-Gerät Token in der env-Datei ändern und neu starten; bei Geräten aus der Admin-API `POST /api/devices/<id>/revoke` von lokal.
- **Schlüssel tauschen:** env-Datei ändern, Dienst neu starten, alten Schlüssel beim Anbieter widerrufen. Ausnahme `KUNIBERT_ELTERN_SCHLUESSEL`: Ein neuer Schlüssel löscht beim nächsten Start alle Einwilligungen und Kopplungen (Abschnitt 3).
- **Eltern-Steuerung** (`/var/lib/kunibert/eltern.json`, Rechte 600): Beim Start steht im Journal nur die Anzahl der Geräte und der gelöschten Einträge. Startet der Dienst mit `Die Datei der Eltern-Steuerung (KUNIBERT_ELTERN_DATEI) ist nicht lesbar oder ungültig` nicht, ist die Datei beschädigt. Sie bleibt dann unverändert liegen (Nachweis der Einwilligungen). Zum Weitermachen die Datei wegschieben, zum Beispiel `sudo mv /var/lib/kunibert/eltern.json /var/lib/kunibert/eltern.json.kaputt`; danach müssen alle Eltern neu koppeln und einwilligen. Die Warnung `Eltern-Steuerung: Die Datei ist nicht beschreibbar` heißt: Einwilligungen und Kopplungen antworten mit 503, bis Rechte oder Platz stimmen. Backups des Servers enthalten die Datei.
- **Logs:** Das Journal enthält Fehlermeldungen und die Zeilen `Zeitmessung`, aber keine Aufnahmen und keine Antworttexte (`KUNIBERT_DIAGNOSTIC_TEXT` wirkt in Produktion nicht).
- **Frist für Protokolle** (vorläufig, 23.11.2026, 01:10, Punkt E1; Einschätzung, keine Rechtsberatung): 14 Tage für alles im Journal dieses Servers, also Kunibert-Dienst, Sprachserver, Caddy und System. Grund: Die Zeilen zeigen, wann ein Gerät benutzt wurde. Für die Auswertung eines Tests reichen 14 Tage. Für die Fehlersuche nach einem Vorfall ist das kurz; wer mehr braucht, legt eine eigene Datei an (unten, „Eigener Wert“).
  - `setup-server.sh` legt `/etc/systemd/journald.conf.d/50-kunibert-frist.conf` an: `MaxRetentionSec=14day` und `MaxFileSec=1day`. journald löscht nur ganze Dateien. Weil jeden Tag eine neue Datei beginnt, weicht die Frist höchstens etwa einen Tag ab (nach der Beschreibung von `journald.conf`; auf einem Server nicht geprüft).
  - Der Container des Sprachservers schreibt ins Journal (Abschnitt 4). Ein älterer Container ohne diese Einstellung bekommt beim Skript einen Hinweis. Dann einmal neu anlegen: `sudo docker rm -f speaches` und das Skript noch einmal starten. Die Modelle bleiben im Volume `hf-hub-cache`.
  - Ist rsyslog installiert (es gibt `/etc/rsyslog.d`), hält `/etc/rsyslog.d/10-kunibert.conf` die Zeilen von `kunibert-server`, `speaches` und `caddy` aus `/var/log/syslog` heraus. Die Kennung `kunibert-server` setzt `SyslogIdentifier=` in `deploy/kunibert-server.service`. Für die übrigen Dateien unter `/var/log` (zum Beispiel Anmeldungen per SSH) gelten weiter die Fristen von logrotate. Das ändert das Skript nicht.
  - Von Hand, ohne Skript:

    ```bash
    sudo install -d -m 755 /etc/systemd/journald.conf.d
    printf '[Journal]\nMaxRetentionSec=14day\nMaxFileSec=1day\n' | sudo tee /etc/systemd/journald.conf.d/50-kunibert-frist.conf
    sudo systemctl restart systemd-journald
    # nur, wenn es /etc/rsyslog.d gibt:
    printf '%s\n' "if \$programname == 'kunibert-server' or \$programname == 'speaches' or \$programname == 'caddy' then stop" | sudo tee /etc/rsyslog.d/10-kunibert.conf
    sudo systemctl restart rsyslog
    ```

    Dazu die Dienstdatei mit `SyslogIdentifier=` (Abschnitt 5) und den Sprachserver mit `--log-driver journald` (Abschnitt 4).

  - Eigener Wert: `/etc/systemd/journald.conf.d/60-eigene-frist.conf` mit `[Journal]` und zum Beispiel `MaxRetentionSec=30day` anlegen, dann `sudo systemctl restart systemd-journald`. Diese Datei wird nach der des Skripts gelesen und gilt. Das Skript fasst sie nicht an; seine eigene Datei setzt es bei jedem Lauf wieder auf 14 Tage.
  - Prüfen: `systemd-analyze cat-config systemd/journald.conf | grep -E '^(MaxRetentionSec|MaxFileSec)='` zeigt `14day` und `1day`. `sudo docker inspect --format '{{.HostConfig.LogConfig.Type}}' speaches` zeigt `journald`. `sudo journalctl --disk-usage` zeigt, wie viel das Journal belegt.
  - Offen: Was der Sprachserver selbst protokolliert (Stufe, ob erkannte Sätze dabei sind), ist nicht geprüft. Nach der ersten Frage im Test `sudo journalctl -t speaches -n 50 --no-pager` ansehen (Checkliste, Teil C, Schritt 1).
  - Backups oder Snapshots des Servers (zum Beispiel bei Hetzner) enthalten auch das Journal. Für sie gilt die Frist nicht.
  - Am Pi gilt diese Frist noch nicht (Punkt N1123-0037-b der Arbeitsliste). Auf dem eigenen Rechner gibt es keine Frist (Checkliste, Teil A1).
