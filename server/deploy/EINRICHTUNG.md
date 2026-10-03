# Server auf dem Schweizer Host einrichten

Diese Anleitung installiert den Ritter-Kunibert-API-Server auf einem Debian-/Ubuntu-System und veröffentlicht ausschließlich die Geräte-API über Caddy. **Der Server ist nicht Teil des Raspberry Pi**: Der Pi bleibt Client.

> **Wichtig:** Dies ist die vorbereitete Anleitung, kein bereits ausgeführtes Deployment auf dem Schweizer Quantencomputer. Vor der Live-Inbetriebnahme müssen dessen Betriebssystem, Architektur, öffentlicher Netzweg, DNS und administrativer Zugriff bestätigt werden. Die bisherige HTTPS-Probe lief nur in der Sandbox mit Caddys lokaler Test-CA.

## Zielaufbau

```text
Raspberry Pi -- HTTPS :443 --> Caddy -- HTTP nur lokal --> 127.0.0.1:8000 Kunibert API
                                                |
                              STT lokal / TTS lokal / LLM per serverseitigem API-Schlüssel
```

Der Python-Dienst lauscht ausschließlich auf `127.0.0.1:8000`. Nur Caddy nimmt öffentliche Verbindungen an, holt/erneuert TLS-Zertifikate und leitet `/health` sowie `/v1/*` weiter. Andere Pfade erhalten 404.

## 1. Voraussetzungen

- Debian 12 oder Ubuntu 24.04, systemd, Python 3.11+, `sudo`-Zugang.
- Genügend Speicherplatz für Python-Abhängigkeiten, Whisper-Cache und Piper-Stimme. Die Stimme `de_DE-thorsten-medium` benötigt zusätzlich rund 63 MB; Whisper lädt sein Modell beim ersten Start in den Cache.
- Eine Domain, die du kontrollierst. Für die Beispielkonfiguration wird `api.picast.com` verwendet.
- DNS-A-Eintrag für `api.picast.com` zeigt auf die öffentliche IP des Schweizer Hosts. Einen AAAA-Eintrag nur setzen, wenn IPv6 dort wirklich erreichbar ist.
- Eingehend TCP 80 und 443 geöffnet; UDP 443 ist optional für HTTP/3. Port 8000 **nicht** im Internet freigeben.
- Erreichbarkeit der konfigurierten OpenAI-kompatiblen LLM-API vom Server. Der API-Schlüssel wird nur dort gespeichert.

Vor dem Einrichten prüfen:

```bash
uname -m
cat /etc/os-release
free -h
df -h /
```

## 2. Code auf den Server übertragen

Das Repo ist privat. Verwende entweder einen eigens eingerichteten **read-only Deploy Key** für dieses Repository oder übertrage den geprüften Ordner `server/` von deinem administrativen Rechner über SSH. Kein persönliches GitHub-Token in ein Skript, in eine Systemdatei oder in die Shell-Historie schreiben.

Die folgenden Schritte setzen voraus, dass der Code unter `/opt/kunibert/server` liegt und die Dateien aus `server/` enthält.

## 3. Systembenutzer, Laufzeit und Stimme

```bash
sudo useradd --system --home-dir /var/lib/kunibert --shell /usr/sbin/nologin kunibert
sudo install -d -o root -g root -m 755 /opt/kunibert
sudo install -d -o kunibert -g kunibert -m 750 /var/lib/kunibert
sudo install -d -o root -g root -m 700 /etc/kunibert

cd /opt/kunibert/server
sudo python3 -m venv /opt/kunibert/venv
sudo /opt/kunibert/venv/bin/pip install --upgrade pip
sudo /opt/kunibert/venv/bin/pip install -r requirements.txt
sudo /opt/kunibert/venv/bin/python -m piper.download_voices \
  --download-dir /opt/kunibert/server/voices de_DE-thorsten-medium
```

Das systemd-Sandboxing erlaubt dem Dienst Schreibzugriff nur unter `/var/lib/kunibert`. Whisper-Modelle werden dort nachgeladen.

## 4. Geheimnisse und Serverkonfiguration

```bash
sudo install -o root -g root -m 600 \
  /opt/kunibert/server/deploy/kunibert.env.example \
  /etc/kunibert/kunibert.env
sudoedit /etc/kunibert/kunibert.env
```

In dieser Datei den Platzhalter `OPENAI_API_KEY` durch den serverseitigen Schlüssel ersetzen. Werte prüfen, dann Rechte nochmals setzen:

```bash
sudo chown root:root /etc/kunibert/kunibert.env
sudo chmod 600 /etc/kunibert/kunibert.env
```

Die Beispielwerte nennen Antwortmodell `gpt-5-mini`, Geschichtenmodell `gpt-5`, Whisper `small`, Piper `de_DE-thorsten-medium` und `KUNIBERT_LLM_TIMEOUT=30`. Anbieter-, Modell- und Netzwerkkompatibilität vor Livebetrieb auf dem konkreten Host prüfen. Den Schlüssel nie an den Pi geben.

## 5. Gerät registrieren

Jedes Gerät bekommt eine eigene Kennung und ein widerrufbares Token. Die Ausgabe des Tokens erscheint **nur beim Anlegen**. Für dieses Beispiel darf das Token nicht auf die Kommandozeile geschrieben oder in Logs kopiert werden:

```bash
cd /opt/kunibert/server
sudo -u kunibert env \
  KUNIBERT_DEVICES_FILE=/var/lib/kunibert/devices.json \
  /opt/kunibert/venv/bin/python -m kunibert_server add-device prototype-1
```

Das ausgegebene Token einmalig mit einem Passwortmanager übertragen und später lokal auf dem Pi in eine Datei mit Modus `0600` setzen. Verlorene oder nicht mehr benötigte Geräte mit `revoke-device` widerrufen. Geräteliste/Token-Datei nicht in Git committen.

## 6. Python-Dienst starten (systemd)

```bash
sudo install -o root -g root -m 644 \
  /opt/kunibert/server/deploy/kunibert-server.service \
  /etc/systemd/system/kunibert-server.service
sudo systemd-analyze verify /etc/systemd/system/kunibert-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now kunibert-server
sudo systemctl status kunibert-server --no-pager
curl -fsS http://127.0.0.1:8000/health
```

Erwartete Health-Antwort: `{"status":"ok"}`. Falls der Dienst nicht startet:

```bash
sudo journalctl -u kunibert-server -n 100 --no-pager
```

Beachte, dass der API-Schlüssel und Gerätezutritt erst auf dem Zielhost verfügbar sein dürfen. Diese Anleitung verändert keine Netzwerk- oder Firewall-Regeln automatisch.

## 7. Caddy aus dem offiziellen Debian-/Ubuntu-Repository installieren

Nach [offizieller Caddy-Installationsanleitung](https://caddyserver.com/docs/install):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Das Debian-Paket richtet einen systemd-Dienst `caddy` ein.

## 8. Caddyfile installieren und prüfen

Die Vorlage [`Caddyfile`](Caddyfile) nutzt den Hostnamen `api.picast.com` und:

- fordert automatisch ein öffentlich vertrauenswürdiges TLS-Zertifikat an und erneuert es,
- erzwingt HTTP→HTTPS,
- lässt nur `/health` und `/v1/*` zur API durch,
- begrenzt den Request-Body auf 3 MB,
- leitet intern an `127.0.0.1:8000` weiter,
- begrenzt das Warten auf Antwort-Header auf 80 Sekunden,
- schreibt bewusst keine Caddy-Zugriffslogs und entfernt den `Server`-Header.

Wenn du einen anderen Hostnamen verwendest, ändere ihn **gleichzeitig** in der Caddyfile und in der Pi-Konfiguration. Installieren und testen:

```bash
sudo install -o root -g root -m 644 \
  /opt/kunibert/server/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Zertifikatsausstellung erfordert, dass die DNS-Adresse auf diesen Host zeigt und Caddy über TCP 80/443 erreichbar ist. Wenn ein anderer Reverse-Proxy davorsteht, muss die Caddy-Proxy-/Client-IP-Konfiguration gesondert abgestimmt werden.

## 9. Abnahme von außen

Von einem anderen Netz bzw. einem Testrechner aus:

```bash
curl -i https://api.picast.com/health
curl -i https://api.picast.com/          # 404 erwartet
curl -i https://api.picast.com/docs     # 404 erwartet
```

Erwartet: `/health` liefert 200 und `{"status":"ok"}`; `/` und `/docs` liefern 404; HTTP wird auf HTTPS umgeleitet; das Zertifikat ist gültig. Zusätzlich sicherstellen, dass Port 8000 von außen geschlossen und lokal an `127.0.0.1` gebunden bleibt.

Diagnose:

```bash
sudo journalctl -u caddy -n 100 --no-pager
sudo journalctl -u kunibert-server -n 100 --no-pager
sudo ss -ltnp | grep -E ':(80|443|8000)\b'
```

## Verfügbare Konfigurationsdateien

- [`Caddyfile`](Caddyfile) — HTTPS, API-Weiterleitung und Zugriffsgrenzen
- [`kunibert-server.service`](kunibert-server.service) — systemd-Benutzer, lokaler Listener und Prozesshärtung
- [`kunibert.env.example`](kunibert.env.example) — nicht geheime Beispielwerte; enthält keinen echten API-Schlüssel
- [`../../README.md`](../../README.md) — Server- und Datenschutzübersicht
