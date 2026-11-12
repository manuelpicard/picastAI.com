# Trockenlauf und Prüfung der Anleitung (11.11.2026)

Kein Hetzner-Server, keine echten Schlüssel, keine Aufrufe an Anthropic. Das Sprachmodell war eine Attrappe (`mock-anthropic.mjs`, antwortet sofort mit festen Texten). Alles lief auf einem Windows-Rechner mit Docker Desktop (8 CPU-Kerne, 15,6 GiB), **nicht** auf der geplanten CCX13.

## Was lief

| Teil | Wie | Ergebnis |
| --- | --- | --- |
| Sprachserver | `ghcr.io/speaches-ai/speaches:latest-cpu` (Ubuntu 24.04, Speaches 0.1.0), nur `127.0.0.1:8000`; Modelle `Systran/faster-whisper-small` und `speaches-ai/piper-de_DE-thorsten-medium` über die Schnittstelle geladen | läuft, Modelle geladen |
| Node-Server | `NODE_ENV=production`, `HOST=127.0.0.1`, zufällige Tokens, `ANTHROPIC_BASE_URL` auf die Attrappe | Start-Log: „Feste Sprechtexte vorbereitet (3 von 3)“, keine Warnung |
| Endpunkte | `deploy/dryrun/dryrun.mjs`: Test-WAV (Piper, mono, 16 Bit, 16 kHz, 1,4 s) | `GET /health` 200; `POST /v1/device/question` 200; `GET /v1/device/audio/:turn_id` 200 `audio/wav`; zweiter Abruf 404 (einmalig) |
| Erkennung | direkt gegen Speaches | „Warum ist der Himmel blau?“ richtig erkannt (`language=de`, `prompt=Ritter Kunibert`) |
| Caddy | `caddy:2` (2.11.9) mit `deploy/Caddyfile`, nur Hostname und Zertifikat für den Test angepasst | `caddy validate`: „Valid configuration“ |
| Prüfskript | `deploy/smoke-test.sh` in einem Alpine-Container gegen Caddy und den Server | 16 von 17 bestanden; die eine Ausnahme siehe unten |

## Zeit je Stufe (Zeilen „Zeitmessung“ aus dem Server-Log)

| Lauf | erkennung | weiche | sprachmodell | ausgabecheck | sprachausgabe | gesamt | Audio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (kalt, direkt nach dem Start) | 8 985 ms | 15 ms | 19 ms | 1 ms | 1 611 ms | 10 644 ms | 7,2 s |
| 2 (warm) | 6 526 ms | 3 ms | 7 ms | 0 ms | 937 ms | 7 481 ms | 7,2 s |

Lesart:

- **Spracherkennung ist die größte Stufe**, auch für nur 1,4 Sekunden Aufnahme: 6,5 bis 9 s auf 8 Kernen.
- Sprachausgabe (Piper) 0,9 bis 1,6 s für 7,2 s Audio.
- **Sprachmodell nicht aussagekräftig:** 7 bis 19 ms ist die Attrappe. Die echte Zeit kommt dazu (laut `docs/Zeitmessung.md` ist sie bei Claude mehrere Sekunden).
- Die CCX13 hat weniger Kerne als dieser Rechner. Ob dort die Spracherkennung unter dem Ziel (Antwort in unter 20 s, `CHECKLISTE.md` Schritt C2) bleibt, ist **offen** und erst nach der Bestellung messbar. Das ist das größte Risiko dieses Wegs. Ausweichen: kleineres Modell (`faster-whisper-base` oder `-tiny`, schlechter bei Kinderstimmen) oder größerer Server.
- Pi-Wartezeit, Netz und Hochladen sind nicht gemessen (kein Pi).

## Prüfung von `EINRICHTUNG.md` gegen den Code

Stand: ✓ stimmt, ✗ war falsch und ist korrigiert, „offen“ nicht prüfbar.

| Aussage | Ergebnis | Quelle |
| --- | --- | --- |
| Nur 80/443 öffentlich, nur Caddy | ✓ (Firewall selbst: offen, erst auf dem Server prüfbar) | `deploy/Caddyfile:13` (nur Hostname lauscht), `:16-17` |
| Caddy reicht nur `/health` und `/v1/device/*` durch, sonst 404 (seit 12.11.2026 enger: vorher `/v1/*`; `/v1/turn` der Weboberfläche ist damit von außen gesperrt) | ✓ im Test vom 11.11. gegen echtes Caddy mit `/v1/*`: `/`, `/api/status`, `/api/devices` je 404; die engere Regel ist **nicht** neu gegen Caddy getestet | `deploy/Caddyfile:16-17`, `:30-32` |
| Port 3000 nie nach außen | ✓ per Konfiguration: `HOST=127.0.0.1`. ✗ Ohne `HOST` lauscht der Server auf `0.0.0.0` (jetzt im Text) | `deploy/kunibert.env.example:9`, `server-api/config.ts:219`, `server.ts:516` |
| Port 8000 nie nach außen | ✓ `--publish 127.0.0.1:8000:8000`. Hinweis zu Docker und `ufw` ergänzt | `deploy/EINRICHTUNG.md` Abschnitt 4 |
| `PICASTAI_PUBLIC_BASE_URL` bestimmt die `audio_url` | ✓ im Test (Antwort enthielt die eingestellte Adresse) | `server.ts:112-119`, `server-api/http-utils.ts:36-63` |
| Pi lehnt `audio_url` mit anderem Schema/Host ab | ✓ | `pi-client/kunibert_client.py:158-179`, `:447` |
| `NODE_ENV=production` Pflicht; sonst bekannte Tokens | ✓ | `server-api/devices.ts:32-34`, `server.ts:484-492` |
| `KUNIBERT_DIAGNOSTIC_TEXT` wirkt in Produktion nicht | ✓ | `server-api/config.ts:83-87` |
| Sprachserver braucht keinen Schlüssel, Variablen `PICASTAI_STT_*`, `_TTS_*` | ✓ | `server-api/config.ts:35`, `:229-236` |
| Image `ghcr.io/speaches-ai/speaches:latest-cpu`, Volume-Pfad | ✓ Image gezogen und gestartet; Pfad `/home/ubuntu/.cache/huggingface/hub` existiert im Container | Trockenlauf |
| Modellnamen für Piper („nicht gegengeprüft“) | ✓ jetzt geprüft: `speaches-ai/piper-de_DE-thorsten-medium`, Stimme `thorsten` | Speaches-Registry |
| Meldung „Feste Sprechtexte vorbereitet (3 von 3)“ | ✓ | `server.ts:521-525`, Start-Log |
| Zeitgrenze Server 120 s | ✗ galt nur bei einem Sprachmodell-Aufruf; Worst Case 150 s. **Seit 11.11.2026 (vorläufig):** gemeinsames Zeitbudget von 120 s für die ganze Anfrage, Tests in `server-api/timing.test.ts` (Zeilen unter „Zeitbudget“); die Quellenzeilen in dieser Zeile gelten für den Code vor der Änderung | `server-api/config.ts:225,241`, `server-api/brain.ts:231,247,368`, `server-api/voice.ts:160,200`, `server-api/llm.ts:80` |
| Caddy 130 s | ✓ im Caddyfile; Wirkung bei echten Wartezeiten nicht gemessen | `deploy/Caddyfile:26` |
| Pi-Client 140 s | ✓ | `pi-client/kunibert_client.py:70,115`, Test `pi-client/test_kunibert_client.py:624-626` |
| Caddy begrenzt den Body auf 3 MB, Server auf 2 MiB | ✓ 2,5 MB und 4 MB ergaben je 413 (welche der beiden Stellen bei 4 MB ablehnt, ist am Status nicht zu sehen) | `deploy/Caddyfile:19-21`, `server.ts:47-52`, `:456-461` |
| „Caddyfile nicht geprüft“ | ✗ jetzt mit `caddy validate` geprüft | Trockenlauf |
| „Zeitkette … laufen in der CI“ | ✗ nur die Pi-Grenze hat einen Test; für Server und Caddy gibt es keinen | `.github/workflows/tests.yml:22`, `package.json` (Script `test`) |
| Node 22 wie in der CI | ✓ | `.github/workflows/tests.yml:18` |
| Hetzner-Image „Docker CE“ enthält Node | ✗ nein, Node 22 muss installiert werden (jetzt im Text); Dockerfile/Compose für den Node-Server gibt es nicht | Repo-Suche (nur `deploy/Caddyfile`) |
| Zertifikat von Let's Encrypt, Erneuerung | offen (erst mit echter Domain) | — |
| Zeiten auf der CCX13 | offen | — |
| `uvx speaches-cli …` | offen (`uv` nicht getestet; die Schnittstelle als Ersatz schon) | — |

## Prüfskript: Hinweise

- Der Test gegen ein lokales Caddy meldete einen Fehler bei „Zertifikat gilt noch mindestens 14 Tage“. Das ist ein Testartefakt: Caddys lokale Testzertifikate gelten nur 12 Stunden (Prüfung: `notAfter` 12 Stunden nach `notBefore`). Ein Let's-Encrypt-Zertifikat gilt 90 Tage und wird früh erneuert.
- Unter Windows mit Git Bash und dem Windows-`curl` läuft das Skript nicht (Schannel prüft den Rückruf des Zertifikats, Pfade zu temporären Dateien). In einem Linux-Container (WSL, Alpine) lief es.

## Selbst wiederholen

```bash
docker run -d --name speaches --publish 127.0.0.1:8000:8000 --volume hf-hub-cache:/home/ubuntu/.cache/huggingface/hub ghcr.io/speaches-ai/speaches:latest-cpu
curl -X POST http://127.0.0.1:8000/v1/models/Systran/faster-whisper-small
curl -X POST http://127.0.0.1:8000/v1/models/speaches-ai/piper-de_DE-thorsten-medium
node deploy/dryrun/mock-anthropic.mjs &       # Attrappe, Port 8099
# Server mit Umgebungsvariablen starten (NODE_ENV=production, zufällige Tokens, ANTHROPIC_API_KEY=beliebig,
# ANTHROPIC_BASE_URL=http://127.0.0.1:8099, PICASTAI_STT_*/PICASTAI_TTS_* wie oben), dann:
BASE_URL=http://127.0.0.1:3000 DEVICE_ID=… DEVICE_TOKEN=… SPEACHES_URL=http://127.0.0.1:8000 \
  TTS_MODEL=speaches-ai/piper-de_DE-thorsten-medium TTS_VOICE=thorsten node deploy/dryrun/dryrun.mjs
```
