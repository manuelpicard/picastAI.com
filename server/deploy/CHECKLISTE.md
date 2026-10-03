# Checkliste: Kunibert-Server auf dem Schweizer Quantencomputer

**Zielbild:** Der Schweizer Host betreibt die Kunibert-API, STT und TTS. Der Raspberry Pi ist nur Client. Öffentlich erreichbar ist allein Caddy über HTTPS auf TCP 443 (TCP 80 dient Zertifikatsausstellung/HTTP→HTTPS); der Python-Dienst bleibt lokal auf `127.0.0.1:8000`.

> **Status heute:** Quellcode, systemd-Unit, Caddyfile, Beispiel-Environment und Installationsanleitung sind vorbereitet. Tests und Caddyfile-Validierung liefen in der Sandbox erfolgreich. **Das ist kein Live-Deployment.** Host, DNS, Netzweg und produktive Schlüssel sind auf dem Quantencomputer noch zu prüfen bzw. einzurichten.
>
> Der Server-README dokumentiert, dass `picast.com` bei der damaligen Prüfung auf eine Domain-Verkaufsseite zeigte. Vor dem Deployment unbedingt erneut klären, ob du die Domain-DNS-Zone kontrollierst; `api.picast.com` nicht als bereits eingerichtet voraussetzen.

Ausführliche Befehle stehen in [`EINRICHTUNG.md`](EINRICHTUNG.md). Diese Checkliste dient als Arbeits- und Abnahmeprotokoll.

## A. Projektfreigabe und Voraussetzungen

- [ ] Bestätigt: **Der Schweizer Quantencomputer ist das Serverziel**; Pi bleibt Client.
- [ ] Technischer Verantwortlicher für den Quantencomputer und Wartungsfenster festgelegt.
- [ ] Administrativer Zugang zum Server vorhanden (SSH-Schlüssel, `sudo`); Zugang nicht in Chat oder Git eintragen.
- [ ] Betriebssystem, Version und Architektur dokumentiert: `cat /etc/os-release`, `uname -m`.
- [ ] Python 3.11+, `systemd`, `sudo` vorhanden.
- [ ] Ressourcen geprüft: CPU/RAM/Platte mit `lscpu`, `free -h`, `df -h /`; als Ausgangspunkt laut Projekt README **4 CPU-Kerne und 8 GB RAM** für den Prototyp einplanen. Bei weniger Ressourcen erst Whisper-Modell und Stabilität neu bemessen.
- [ ] Hostzeit, DNS-Auflösung und ausgehender HTTPS-Zugriff geprüft.
- [ ] Wartung, Neustart und Wiederherstellung sind mit dem Betreiber des Quantencomputers abgestimmt.

## B. Domain, DNS und Netzgrenzen

- [ ] Domainkontrolle bestätigt; zuständige Person kann die DNS-Zone ändern.
- [ ] API-Hostname festgelegt, zunächst `api.picast.com`; falls abweichend, den Namen in Caddyfile und Pi-Konfiguration konsistent ändern.
- [ ] Öffentliche, stabile Server-IP ermittelt; DNS-A-Eintrag zeigt auf diesen Host.
- [ ] AAAA-Eintrag nur gesetzt, wenn IPv6 am Host und in der Firewall tatsächlich funktioniert.
- [ ] DNS von außerhalb geprüft (`dig +short A api.picast.com`; ggf. `dig +short AAAA api.picast.com`).
- [ ] Firewall: eingehend TCP 80 und TCP 443 erlaubt; UDP 443 optional für HTTP/3.
- [ ] Firewall: TCP 8000 **nicht öffentlich** freigegeben; SSH auf notwendige Quellnetze eingeschränkt.
- [ ] Keine vorgeschaltete TLS-Terminierung/Proxy vorhanden oder deren Weiterleitung und Client-IP-Vertrauen ausdrücklich abgestimmt.

## C. Datenschutz und Schlüssel vor Installation

- [ ] Für LLM-Anbieter und Datenfluss ist eine bewusste Betreiberentscheidung getroffen; der erkannte Text kann den eigenen Server verlassen.
- [ ] Datenschutz-/Elterneinwilligungs- und Kinderschutzprüfung ist **vor Kinder-Tests** erfolgt; bis dahin ausschließlich erwachsene Testpersonen und harmlose Beispieldaten.
- [ ] Serverseitigen LLM-Zugangsschlüssel beschafft und nur auf dem Host bereitgestellt.
- [ ] Keine echten Schlüssel in Git, Copy/Paste-Beispiele, Kommandozeilen-Historie, Screenshots oder Logs aufgenommen.
- [ ] Gerätekennung und Token je Pi einzeln geplant; kein gemeinsam genutztes Token.
- [ ] Verschlüsselte, zugriffsbeschränkte Sicherung für notwendige Konfiguration/Geräteliste festgelegt; keine Audios oder Transkripte archivieren.

## D. Code und Serverlaufzeit

- [ ] Private Repository-Version/Commit geprüft und als Deploymentstand festgehalten.
- [ ] Code sicher übertragen: read-only Deploy Key oder Übertragung vom Admin-Rechner; kein persönliches PAT auf dem Host hinterlegt.
- [ ] Projektcode liegt unter `/opt/kunibert/server` (oder dokumentiertem alternativen Pfad); Besitzer und Rechte geprüft.
- [ ] Dedizierter Systembenutzer `kunibert` ohne interaktive Anmeldung angelegt.
- [ ] Laufzeitverzeichnisse erstellt und auf notwendige Schreibrechte beschränkt (z. B. `/var/lib/kunibert`).
- [ ] Virtuelle Python-Umgebung angelegt und `server/requirements.txt` installiert.
- [ ] Piper-Stimme `de_DE-thorsten-medium` vorhanden; Whisper-Modell wurde geladen und der Cache-Pfad ist beschreibbar.
- [ ] Environment aus `kunibert.env.example` erzeugt, echte Werte mit `sudoedit` eingetragen und Rechte `root:root`, Modus `0600` geprüft.
- [ ] Modellnamen, Timeout, Basis-URL und egress vom konkreten Host aus geprüft.

## E. Geräteidentität und Dienst

- [ ] Datei für Gerätezugänge außerhalb von Git und Webroot angelegt; Besitzer `kunibert`, Modus restriktiv (mindestens `0600`).
- [ ] Erstes Geräteprofil mit `add-device prototype-1` erzeugt.
- [ ] Token nur einmal sicher übernommen und an die für den Pi verantwortliche Person übergeben; Token erscheint weder in Logs noch im Repo.
- [ ] systemd-Unit nach `/etc/systemd/system/kunibert-server.service` kopiert und mit `systemd-analyze verify` validiert.
- [ ] `kunibert-server` aktiviert und gestartet; Neustartverhalten geprüft.
- [ ] Listener mit `ss -ltnp` geprüft: Python/Uvicorn lauscht ausschließlich auf `127.0.0.1:8000`.
- [ ] Lokaler Health-Check `curl -fsS http://127.0.0.1:8000/health` liefert `{"status":"ok"}`.
- [ ] Logs der Einheit geprüft (`journalctl -u kunibert-server`); keine Schlüssel, Audios, erkannte Texte oder Antwortinhalte im Log.

## F. Caddy und TLS

- [ ] Caddy aus dem offiziellen Debian-/Ubuntu-Repository installiert.
- [ ] `server/deploy/Caddyfile` mit dem bestätigten API-Hostnamen unter `/etc/caddy/Caddyfile` installiert.
- [ ] Caddyfile formatiert und validiert: `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
- [ ] Caddy aktiviert und gestartet; systemd-Status fehlerfrei.
- [ ] DNS zeigt auf den Host und TCP 80/443 sind von außen erreichbar.
- [ ] Öffentlich gültiges Zertifikat wurde ausgestellt; HTTPS-Zertifikatskette und Hostname stimmen.
- [ ] HTTP wird auf HTTPS umgeleitet.
- [ ] Caddy leitet nur `/health` und `/v1/*` weiter; `/`, `/docs` und sonstige Pfade geben 404.
- [ ] Upload-Grenze, `response_header_timeout` und fehlende Zugriffslogs entsprechen der Vorlage.
- [ ] Caddy-Logs geprüft; keine Authorization-Header oder Audio-/Textinhalte sichtbar.

## G. Ende-zu-Ende-Abnahme vor Übergabe an den Pi

Nur mit einem erwachsenen Tester, eigens registriertem Testgerät und unkritischen Testsätzen ausführen.

- [ ] Von einem externen Netz: `curl -i https://api.picast.com/health` liefert HTTP 200 und `{"status":"ok"}`.
- [ ] Von außen: `https://api.picast.com/` und `/docs` liefern 404; keine Swagger- oder Admin-Oberfläche öffentlich.
- [ ] Von außen: HTTP-Endpunkt leitet zu HTTPS; Zertifikat ist gültig.
- [ ] Von außen: TCP 8000 ist geschlossen; lokal ist der Dienst auf Loopback erreichbar.
- [ ] Gültiges Gerätetoken kann eine kurze Frage durch die ganze Pipeline schicken; Antwortaudio wird abgespielt.
- [ ] Falsches, fehlendes, widerrufenes und fremdes Gerätetoken werden abgelehnt.
- [ ] Antwortaudio ist nur für das anfragende Gerät abrufbar, nur einmal und nur innerhalb der vorgesehenen TTL.
- [ ] Geschichtenstart, Fortsetzung und Folgenabschluss liefern passende Zustände.
- [ ] Sicherheits-Testfälle werden auf Serverebene kontrolliert; keine generierten Antworten bei erkanntem Sicherheitsfall.
- [ ] Modell-/Netzwerkausfall erzeugt eine sichere, verständliche Fehlerreaktion; keine Endlosschleife oder unkontrollierten Wiederholungen.
- [ ] Rate-Limit, maximale Audio-Größe/-Dauer und Request-Body-Limit geprüft.
- [ ] Nach den Tests temporäre Testgeräte widerrufen und Testmaterial löschen.
- [ ] Pi-Konfiguration erhält erst jetzt die bestätigte HTTPS-URL und das eigene Gerätetoken.

## H. Betrieb, Alarmierung und Rückfall

- [ ] Neustartprobe durchgeführt: Caddy und Kunibert starten automatisch; Health-Check bleibt erfolgreich.
- [ ] Vorgehen für Updates dokumentiert: geprüften Commit bereitstellen, Tests ausführen, Konfigurationsbackup, kontrollierter Neustart, Abnahme.
- [ ] Vorgehen für Schlüsselrotation und Gerätewiderruf getestet.
- [ ] Monitoring nur für Verfügbarkeit, Laufzeit, Fehlercode und Ressourcen; keine Transkripte oder Audioinhalte.
- [ ] Benannte Person prüft regelmäßig Speicherplatz, RAM, Dienststatus und Zertifikatsausstellung.
- [ ] Rückfall erprobt: vorherige geprüfte Version wiederherstellen; bei Sicherheitsproblem Dienst stoppen und betroffenes Gerätetoken widerrufen.
- [ ] Betreiber hat dokumentierte Notfallkontakte und Wartungsfenster bestätigt.

## Go/No-Go

**Go für Pi-End-to-End-Test** erst, wenn alle Punkte in A–G erfüllt sind, insbesondere Host/DNS bestätigt, gültiges HTTPS aktiv, Port 8000 nicht öffentlich, Token je Gerät eingerichtet und keine Inhalte in Logs. **Go für Tests mit Kindern** erfordert zusätzlich eine abgeschlossene fachliche Sicherheits- und Datenschutzprüfung sowie Einwilligung der Erziehungsberechtigten.
