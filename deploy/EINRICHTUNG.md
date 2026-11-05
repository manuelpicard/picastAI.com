# Server einrichten (Debian/Ubuntu, Node-Server)

Diese Anleitung installiert den Kunibert-Server (Node 22, Express) hinter Caddy. Der Pi bleibt Client. Die abhakbare Abnahme samt erstem Durchlauf mit echtem Pi steht in [`CHECKLISTE.md`](CHECKLISTE.md).

> **Stand:** Die Dateien in diesem Ordner sind vorbereitet, aber nicht auf einem echten Server ausgeführt. Die systemd-Datei ist mit `systemd-analyze verify` geprüft, das Caddyfile **nicht** (kein Caddy in der Entwicklungsumgebung): vor dem Start `caddy validate` ausführen. Die Zeitkette und die Starttests laufen in der CI.

```text
Pi --HTTPS :443--> Caddy --HTTP lokal--> 127.0.0.1:3000 Kunibert-Server
                                              |
                      Spracherkennung/-ausgabe (OpenAI-kompatibel), Sprachmodell (Gemini oder Claude)
```

Öffentlich ist nur Caddy, und Caddy reicht nur `/health` und `/v1/*` durch. Admin-Routen (`/api/*`) und die Weboberfläche sind von außen nicht erreichbar.

## 1. Voraussetzungen

- Debian 12 oder Ubuntu 24.04 mit systemd, `sudo`-Zugang, Node.js 22 (wie in der CI; Installation nach [nodejs.org](https://nodejs.org/en/download)), `git`, `openssl`.
- Ein Hostname, dessen DNS du kontrollierst, mit A-Eintrag auf die öffentliche IP (AAAA nur, wenn IPv6 wirklich geht). `kunibert.example` unten durch deinen Namen ersetzen, **überall gleich**.
- Eingehend TCP 80 und 443 offen. Port 3000 nie nach außen freigeben.
- Schlüssel: `OPENAI_API_KEY` (Spracherkennung) und `GEMINI_API_KEY` (Sprachausgabe, dazu auch das Sprachmodell, wenn du Gemini wählst) oder `ANTHROPIC_API_KEY` (Sprachmodell). Für ein Gemini-Konto den **bezahlten** Tarif nehmen, der kostenlose nutzt Eingaben zur Produktverbesserung.
- Kinderstimmen gehen an OpenAI (Spracherkennung), erkannter Text an Google oder Anthropic (Sprachmodell), die Antworttexte an Google (Sprachausgabe). Bis zur Datenschutzprüfung nur Erwachsene als Tester.

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

Mindestens setzen: `PICASTAI_PUBLIC_BASE_URL`, `PICASTAI_ADMIN_TOKEN`, `PICASTAI_DEVICE_TOKEN`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (Sprachausgabe) und den Schlüssel des gewählten Sprachmodells (`PICASTAI_LLM_PROVIDER`). Werte nicht in die Shell-Historie tippen. Wichtige Punkte:

- `NODE_ENV=production` ist Pflicht. Ohne sind Entwicklungsgeräte mit **bekannten Tokens** aktiv.
- `PICASTAI_PUBLIC_BASE_URL` bestimmt die `audio_url`. Der Pi lehnt eine Adresse mit anderem Schema oder Host ab. Gleiche Schreibweise wie auf dem Pi (`PICASTAI_API_BASE_URL`).
- Ein Gerät aus `PICASTAI_DEVICE_ID`/`PICASTAI_DEVICE_TOKEN` überlebt Neustarts. Über `/api/devices` angelegte Geräte nur mit `PICASTAI_DEVICE_STORE=firestore`.

## 4. Dienst starten

```bash
sudo install -o root -g root -m 644 deploy/kunibert-server.service /etc/systemd/system/kunibert-server.service
sudo systemd-analyze verify /etc/systemd/system/kunibert-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now kunibert-server
sudo systemctl status kunibert-server --no-pager
curl -fsS http://127.0.0.1:3000/health
```

Erwartet: `{"status":"ok", ...}`. Im Journal steht beim Start `Feste Sprechtexte vorbereitet (3 von 3)`; bei `0 von 3` stimmt der Schlüssel der Sprachausgabe (`GEMINI_API_KEY`, bei `PICASTAI_TTS_PROVIDER=openai` der OpenAI-Schlüssel) oder das Netz nicht. Eine Warnung zu einem „wird abgeschaltet“-Modell zeigt, dass noch ein altes OpenAI-Modell eingestellt ist. Fehlersuche: `sudo journalctl -u kunibert-server -n 100 --no-pager`. Eine Warnung zu `NODE_ENV` darf **nicht** erscheinen.

## 5. Caddy

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

## 6. Abnahme von außen

```bash
curl -i https://kunibert.example/health        # 200
curl -i https://kunibert.example/              # 404
curl -i https://kunibert.example/api/status    # 404, Admin-Routen sind nicht erreichbar
curl -i http://kunibert.example/health         # Weiterleitung auf https
```

Von innen mit Admin-Token (nur auf dem Server): `curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/api/status`.

## 7. Pi anbinden

Auf dem Pi (siehe [`pi-client/README.md`](../pi-client/README.md)) `PICASTAI_API_BASE_URL=https://kunibert.example`, dieselbe `PICASTAI_DEVICE_ID` und das Geräte-Token eintragen, dann `--once health` und `--once story` prüfen. Weiter mit der Checkliste.

## Betrieb

- **Update:** neuen Stand holen (`git pull`), `npm install`, `npm run build`, `sudo systemctl restart kunibert-server`, Abnahme wiederholen. Ein Neustart verwirft laufende Folgen und nicht abgeholtes Audio (nur im Arbeitsspeicher).
- **Gerät sperren:** bei Umgebungs-Gerät Token in der env-Datei ändern und neu starten; bei Geräten aus der Admin-API `POST /api/devices/<id>/revoke` von lokal.
- **Schlüssel tauschen:** env-Datei ändern, Dienst neu starten, alten Schlüssel beim Anbieter widerrufen.
- **Logs:** Das Journal enthält Fehlermeldungen, aber keine Aufnahmen und keine Antworttexte (`KUNIBERT_DIAGNOSTIC_TEXT` wirkt in Produktion nicht).
