# Server einrichten (Debian/Ubuntu, Node-Server)

Diese Anleitung installiert den Kunibert-Server (Node 22, Express) hinter Caddy. Der Pi bleibt Client. Die abhakbare Abnahme samt erstem Durchlauf mit echtem Pi steht in [`CHECKLISTE.md`](CHECKLISTE.md).

> **Stand (11.11.2026):** Die Dateien in diesem Ordner sind noch auf keinem echten Server ausgeführt. Geprüft ist: die systemd-Datei mit `systemd-analyze verify`; das Caddyfile mit `caddy validate` (Caddy 2.11.9 im Docker-Container) und im Betrieb gegen den lokalen Server (404 für `/` und `/api/*`, Weiterleitung auf HTTPS, 413 bei zu großer Datei); der Server mit Speaches (faster-whisper-small, Piper) und einer Sprachmodell-Attrappe (`deploy/dryrun/`, Ergebnis in [`dryrun/ERGEBNIS.md`](dryrun/ERGEBNIS.md)). **Nicht** geprüft: echte Anthropic-Aufrufe, Zeiten auf dem Hetzner-Server, Zertifikat von Let's Encrypt. Die Starttests und die Pi-Zeitgrenze (140 s) laufen in der CI; die Grenzen von Server und Caddy prüft keine Testdatei (siehe „Zeitkette“).

## Nach der Bestellung (Reihenfolge)

Der Server wird erst bestellt, wenn der Pi da ist: Hetzner rechnet stundenweise ab. Dann der Reihe nach. **Du selbst** (nicht Claude, nicht ein Skript) machst die mit 👤 markierten Schritte. Zeiten sind **Schätzungen**, nicht gemessen.

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

```text
Pi --HTTPS :443--> Caddy --HTTP lokal--> 127.0.0.1:3000 Kunibert-Server
                                              |
                      Sprachserver (Speaches, nur lokal) und Claude (Sprachmodell)
```

Öffentlich ist nur Caddy, und Caddy reicht nur `/health` und `/v1/*` durch. Admin-Routen (`/api/*`) und die Weboberfläche sind von außen nicht erreichbar.

## 1. Voraussetzungen

- Debian 12 oder Ubuntu 24.04 mit systemd (das Hetzner-Image „Docker CE“ ist ein Ubuntu mit installiertem Docker, aber **ohne** Node.js), `sudo`-Zugang, Node.js 22 (wie in der CI; Installation nach [nodejs.org](https://nodejs.org/en/download)), `git`, `openssl`. Docker wird nur für den Sprachserver gebraucht; für den Node-Server gibt es in diesem Repo kein Dockerfile und keine Compose-Datei, er läuft als systemd-Dienst.
- Ein Hostname, dessen DNS du kontrollierst, mit A-Eintrag auf die öffentliche IP (AAAA nur, wenn IPv6 wirklich geht). `kunibert.example` unten durch deinen Namen ersetzen, **überall gleich**.
- Eingehend TCP 80 und 443 offen (bei Hetzner zusätzlich in der Cloud Firewall der Console). Port 3000 und 8000 nie nach außen freigeben: `HOST=127.0.0.1` in der env-Datei und `--publish 127.0.0.1:8000:8000` beim Sprachserver sorgen dafür. Ohne `HOST` lauscht der Server auf allen Adressen (`server-api/config.ts:219`). Vorsicht bei Docker: Ein Port, der ohne `127.0.0.1` veröffentlicht wird, umgeht eine `ufw`-Firewall.
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
sudo openssl rand -hex 32     # zweimal ausführen: einmal Admin-Token, einmal Geräte-Token
sudoedit /etc/kunibert/kunibert.env
```

Mindestens setzen: `PICASTAI_PUBLIC_BASE_URL`, `PICASTAI_ADMIN_TOKEN`, `PICASTAI_DEVICE_TOKEN`, `ANTHROPIC_API_KEY` und nach Abschnitt 4 `PICASTAI_STT_MODEL`, `PICASTAI_TTS_MODEL`, `PICASTAI_TTS_VOICE`. Werte nicht in die Shell-Historie tippen. Wichtige Punkte:

- `NODE_ENV=production` ist Pflicht. Ohne sind Entwicklungsgeräte mit **bekannten Tokens** aktiv.
- `PICASTAI_PUBLIC_BASE_URL` bestimmt die `audio_url`. Der Pi lehnt eine Adresse mit anderem Schema oder Host ab. Gleiche Schreibweise wie auf dem Pi (`PICASTAI_API_BASE_URL`).
- Ein Gerät aus `PICASTAI_DEVICE_ID`/`PICASTAI_DEVICE_TOKEN` überlebt Neustarts. Über `/api/devices` angelegte Geräte nur mit `PICASTAI_DEVICE_STORE=firestore`.

## 4. Sprachserver (Speaches)

Spracherkennung und Sprachausgabe laufen auf einem eigenen Server, hier [Speaches](https://github.com/speaches-ai/speaches) (MIT-Lizenz, OpenAI-kompatible Schnittstelle, `faster-whisper` für die Erkennung, `Piper` für die Stimme). So erreicht die Kinderstimme keinen Dritten. Auf demselben Rechner wie der Kunibert-Server, ohne GPU:

```bash
sudo docker run --detach --name speaches --restart unless-stopped \
  --publish 127.0.0.1:8000:8000 \
  --volume hf-hub-cache:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cpu
```

`127.0.0.1` ist Absicht: der Sprachserver lauscht nur lokal und braucht deshalb keinen Schlüssel. Port 8000 nie nach außen freigeben. Mit NVIDIA-Grafikkarte stattdessen `latest-cuda` und `--gpus=all`. Liegt der Sprachserver auf einem anderen Rechner, nur per `https` und mit Schlüssel (`PICASTAI_STT_API_KEY`, `PICASTAI_TTS_API_KEY`) ansprechen; der Server warnt beim Start vor `http` zu fremden Rechnern.

Modelle laden (mit [uv](https://docs.astral.sh/uv/), Adresse des Sprachservers gesetzt):

```bash
export SPEACHES_BASE_URL=http://127.0.0.1:8000
uvx speaches-cli model download Systran/faster-whisper-small      # Beispiel aus der Speaches-Dokumentation
uvx speaches-cli registry ls --task text-to-speech                # verfügbare Stimmenmodelle (Piper, Kokoro)
```

- **Erkennung:** `Systran/faster-whisper-small` ist das Beispiel der Dokumentation und klein. In der Studie [Kid-Whisper](https://arxiv.org/html/2309.07927) erkennt ein größeres Whisper-Modell Kinderstimmen etwas besser, kostet aber mehr Rechenzeit. Welches Modell reicht, entscheidet der Test in Schritt 11 der Checkliste.
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

Erwartet: `{"status":"ok", ...}`. Im Journal steht beim Start `Feste Sprechtexte vorbereitet (3 von 3)`; bei `0 von 3` ist der Sprachserver nicht erreichbar oder Modell bzw. Stimme sind nicht heruntergeladen (Abschnitt 4). Eine Warnung zu `http` oder zu einem ausgeschlossenen Anbieter zeigt, dass eine Sprachdienst-Adresse nicht passt. Fehlersuche: `sudo journalctl -u kunibert-server -n 100 --no-pager`. Eine Warnung zu `NODE_ENV` darf **nicht** erscheinen.

## 6. Caddy

Installation nach der [offiziellen Anleitung](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Danach:

```bash
sudo install -o root -g root -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile            # kunibert.example ersetzen
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Die Vorlage erzwingt HTTPS, reicht nur `/health` und `/v1/*` durch, begrenzt den Body auf 3 MB und schreibt keine Zugriffsprotokolle. Steht noch ein weiterer Proxy davor, zusätzlich `PICASTAI_TRUST_PROXY` setzen (siehe [`docs/picastAI-Pi-API.md`](../docs/picastAI-Pi-API.md)).

### Zeitkette

Frage und Geschichte laufen durch Spracherkennung, Sprachmodell und Sprachausgabe. Die Grenzen müssen nach außen größer werden, sonst bricht eine Stelle ab, während dahinter noch gearbeitet wird:

| Stelle | Grenze | Einstellung |
| --- | --- | --- |
| Server (Summe, Normalfall) | 45 + 30 + 45 = 120 s | `PICASTAI_VOICE_TIMEOUT_MS` (je Aufruf, Spracherkennung und Sprachausgabe), `PICASTAI_LLM_TIMEOUT_MS` (je Aufruf) |
| Caddy | 130 s | `response_header_timeout` im Caddyfile |
| Pi-Client | 140 s | `KUNIBERT_PIPELINE_TIMEOUT` |

Die Grenzen gelten **je Aufruf**, nicht für die ganze Anfrage. Die 120 s stimmen nur, wenn das Sprachmodell einmal gefragt wird. Erkennt Claude bei einer Frage einen Geschichtenwunsch, sind es **zwei** Aufrufe (`server-api/brain.ts:231` und `:368`, siehe auch `docs/Zeitmessung.md`, Feld `sprachmodell_aufrufe`). Im schlimmsten Fall ist die Summe dann 45 + 30 + 30 + 45 = **150 s**, also mehr als Caddy (130 s) und Pi (140 s). Das tritt nur ein, wenn Dienste fast bis zur Grenze hängen. **Offen:** ob die Grenzen für diesen Fall angepasst werden (zum Beispiel Caddy 160 s und Pi 170 s). Bis dahin: Server-Grenzen nicht erhöhen.

Wer die Server-Grenzen ändert, passt die beiden anderen an. Quellen: `server-api/config.ts:225` und `:241` (Voreinstellungen und Grenzen 3 bis 120 s), `deploy/Caddyfile:26`, `pi-client/kunibert_client.py:70` und `:115`.

## 7. Abnahme von außen

Alle Prüfungen dieses Abschnitts (und mehr: Zertifikat, falscher Token gibt 401, zu große Datei gibt 413) macht das Skript `deploy/smoke-test.sh`. Es läuft auf deinem Rechner (Linux oder macOS mit `bash`, `curl` und `openssl`; unter Windows in WSL, in Git Bash mit dem Windows-`curl` ging es im Test nicht), ruft weder Spracherkennung noch Sprachmodell auf und liest Adresse und Gerätetoken nur aus der Umgebung:

```bash
read -rs PICASTAI_DEVICE_TOKEN; export PICASTAI_DEVICE_TOKEN     # Token einfügen, Eingabe bleibt unsichtbar
PICASTAI_API_BASE_URL=https://kunibert.example PICASTAI_DEVICE_ID=pi-zero-001 ./deploy/smoke-test.sh
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

- **Update:** neuen Stand holen (`git pull`), `npm ci`, `npm run build`, `sudo systemctl restart kunibert-server`, Abnahme wiederholen. Ein Neustart verwirft laufende Folgen und nicht abgeholtes Audio (nur im Arbeitsspeicher).
- **Gerät sperren:** bei Umgebungs-Gerät Token in der env-Datei ändern und neu starten; bei Geräten aus der Admin-API `POST /api/devices/<id>/revoke` von lokal.
- **Schlüssel tauschen:** env-Datei ändern, Dienst neu starten, alten Schlüssel beim Anbieter widerrufen.
- **Logs:** Das Journal enthält Fehlermeldungen, aber keine Aufnahmen und keine Antworttexte (`KUNIBERT_DIAGNOSTIC_TEXT` wirkt in Produktion nicht).
