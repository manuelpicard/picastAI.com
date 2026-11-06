# Server einrichten (Debian/Ubuntu, Node-Server)

Diese Anleitung installiert den Kunibert-Server (Node 22, Express) hinter Caddy. Der Pi bleibt Client. Die abhakbare Abnahme samt erstem Durchlauf mit echtem Pi steht in [`CHECKLISTE.md`](CHECKLISTE.md).

> **Stand:** Die Dateien in diesem Ordner sind vorbereitet, aber nicht auf einem echten Server ausgeführt. Die systemd-Datei ist mit `systemd-analyze verify` geprüft, das Caddyfile **nicht** (kein Caddy in der Entwicklungsumgebung): vor dem Start `caddy validate` ausführen. Die Zeitkette und die Starttests laufen in der CI.

```text
Pi --HTTPS :443--> Caddy --HTTP lokal--> 127.0.0.1:3000 Kunibert-Server
                                              |
                      Sprachserver (Speaches, nur lokal) und Claude (Sprachmodell)
```

Öffentlich ist nur Caddy, und Caddy reicht nur `/health` und `/v1/*` durch. Admin-Routen (`/api/*`) und die Weboberfläche sind von außen nicht erreichbar.

## 1. Voraussetzungen

- Debian 12 oder Ubuntu 24.04 mit systemd, `sudo`-Zugang, Node.js 22 (wie in der CI; Installation nach [nodejs.org](https://nodejs.org/en/download)), `git`, `openssl`.
- Ein Hostname, dessen DNS du kontrollierst, mit A-Eintrag auf die öffentliche IP (AAAA nur, wenn IPv6 wirklich geht). `kunibert.example` unten durch deinen Namen ersetzen, **überall gleich**.
- Eingehend TCP 80 und 443 offen. Port 3000 nie nach außen freigeben.
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
sudo npm install        # im Repo liegt kein Lockfile; tsx (devDependency) wird zur Laufzeit gebraucht
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
- **Stimme:** Piper hat deutsche Stimmen (`eva_k`, `karlsson`, `kerstin`, `mls`, `pavoque`, `ramona`, `thorsten`, `thorsten_emotional`). Welche Modellnamen Speaches dafür anbietet und wie die Stimme angesprochen wird, zeigt `registry ls` und die Speaches-Dokumentation; nicht gegengeprüft. Jede Stimme hat eine eigene Lizenz: vor dem Einsatz mit Kindern prüfen.
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
| Server (Summe) | 45 + 30 + 45 = 120 s | `PICASTAI_VOICE_TIMEOUT_MS`, `PICASTAI_LLM_TIMEOUT_MS` |
| Caddy | 130 s | `response_header_timeout` im Caddyfile |
| Pi-Client | 140 s | `KUNIBERT_PIPELINE_TIMEOUT` |

Wer die Server-Grenzen ändert, passt die beiden anderen an.

## 7. Abnahme von außen

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

- **Update:** neuen Stand holen (`git pull`), `npm install`, `npm run build`, `sudo systemctl restart kunibert-server`, Abnahme wiederholen. Ein Neustart verwirft laufende Folgen und nicht abgeholtes Audio (nur im Arbeitsspeicher).
- **Gerät sperren:** bei Umgebungs-Gerät Token in der env-Datei ändern und neu starten; bei Geräten aus der Admin-API `POST /api/devices/<id>/revoke` von lokal.
- **Schlüssel tauschen:** env-Datei ändern, Dienst neu starten, alten Schlüssel beim Anbieter widerrufen.
- **Logs:** Das Journal enthält Fehlermeldungen, aber keine Aufnahmen und keine Antworttexte (`KUNIBERT_DIAGNOSTIC_TEXT` wirkt in Produktion nicht).
