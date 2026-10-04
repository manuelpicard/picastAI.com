# Ritter Kunibert – Server (Durchstich 1 + 2)

Das ist das Gegenstück zum Pi-Client: Es nimmt die Aufnahme der Sprechtaste entgegen, erkennt den Text, entscheidet zwischen **Frage**, **Geschichte**, **Weiter** und **Sicherheitsfall**, schreibt die Antwort oder den nächsten Teil der Kunibert-Folge und spricht sie mit einer deutschen Stimme ein. Der Server erfüllt genau den API-Vertrag, den der Pi-Client schon erwartet. Am Client musste dafür nichts Grundlegendes geändert werden.

> **Status:** Funktionierender Prototyp für Tests mit einem Erwachsenen daneben, **kein fertiges Kinderprodukt**. Die festen Sicherheitstexte und die Erkennungsmuster müssen vor jeder Nutzung durch Kinder von Fachleuten geprüft werden.

## So läuft ein Tastendruck ab

```
Pi (Sprechtaste)  ──POST /v1/turn──▶  Spracherkennung (Whisper, lokal auf dem Server)
                                         │
                                         ▼
                                   Sicherheitsweiche (feste Muster, vor jeder KI)
                                         │ unauffällig
                                         ▼
                        Frage ─▶ Antwortmodell (gpt-5-mini)   Geschichte/Weiter ─▶ Erzählmodell (gpt-5)
                                         │
                                         ▼
                                   Stimme (Piper, lokal)  ─▶  Audio 120 s im RAM, einmal abrufbar
Pi  ◀──GET /v1/turn/{id}/audio──  (danach gelöscht)  ─▶  aplay
```

Ins Internet geht nur der **erkannte Text** (an das Sprachmodell). Die Stimme des Kindes verlässt den eigenen Server nicht. Gespeichert werden weder Aufnahmen noch Transkripte noch Antworttexte. Im Protokoll stehen nur Modus, Antwortart und Dauer.

| Baustein | Datei | Aufgabe |
| --- | --- | --- |
| Kuniberts Welt | `kunibert_server/prompts.py` | Erinnerungsanker (Dachzimmer, Kutscher, Hexe, Drache, Niederlage und Rückkehr, List, Erwachen), Erzählstil, Grenzen, Antwortregeln |
| Erzählmotor | `kunibert_server/brain.py` | Weiche, Folge in 5 Teilen (Aufbruch → Mitte → Mitte → List → Heimkehr), offene Fäden, Kürzen am Satzende |
| Sicherheitsweiche | `kunibert_server/safety.py` | Muster für Notlagen in Ich-Form; feste, prüfbare Antwort mit 112 und Nummer gegen Kummer (116 111) |
| Anbieter | `kunibert_server/providers.py` | Whisper (STT), Piper (TTS), OpenAI-kompatibles LLM, dazu Fakes für Tests |
| Gerätezugang | `kunibert_server/devices.py` | Token je Gerät (nur SHA-256 gespeichert, widerrufbar), Ratenbegrenzung, flüchtiger Einmal-Audiospeicher |
| HTTP | `kunibert_server/app.py` | `POST /v1/turn`, `GET /v1/turn/{id}/audio`, `GET /health` |

## Einrichten (Linux-Server oder eigener Rechner)

```bash
python3 -m venv venv && . venv/bin/activate
pip install -r requirements.txt
mkdir -p voices && python3 -m piper.download_voices --download-dir voices de_DE-thorsten-medium
export OPENAI_API_KEY='…'                 # bleibt auf dem Server
python3 -m kunibert_server add-device prototype-1   # zeigt das Geräte-Token genau einmal an
python3 -m kunibert_server serve --host 127.0.0.1 --port 8000
```

Beim ersten Start lädt Whisper das Modell `small` (rund 460 MB). Grafikkarte nicht nötig; 4 CPU-Kerne und 8 GB RAM reichen für einen Prototyp. Für das Gerät dann im Pi-Client:

```bash
export KUNIBERT_API_BASE='https://api.picast.com'   # lokal: http://127.0.0.1:8000
export KUNIBERT_DEVICE_ID='prototype-1'
export KUNIBERT_DEVICE_TOKEN='<Token aus add-device>'
python3 -m kunibert_pi --wav frage.wav --mode frage
python3 -m kunibert_pi --mode geschichte --state-file /dev/shm/kunibert.json
python3 -m kunibert_pi --mode weiter     --state-file /dev/shm/kunibert.json
```

**Ohne Mikrofon ausprobieren** (Text statt Aufnahme, sonst dieselbe Pipeline):

```bash
python3 -m kunibert_server say --mode frage --text "Warum ist der Himmel blau?" --out antwort.wav
python3 -m kunibert_server say --mode geschichte --state-file /tmp/k.json --out teil1.wav
python3 -m kunibert_server say --mode weiter     --state-file /tmp/k.json --out teil2.wav
```

Gerät sperren: `python3 -m kunibert_server revoke-device prototype-1` (greift sofort, ohne Neustart).

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | – | Zugang zu einem OpenAI-kompatiblen Anbieter |
| `KUNIBERT_STORY_MODEL` / `_REASONING` | `gpt-5` / `minimal` | Erzählmodell; gemessen rund 13 s je Teil |
| `KUNIBERT_ANSWER_MODEL` / `_REASONING` | `gpt-5-mini` / `low` | Antwortmodell und Weiche; rund 3–5 s |
| `KUNIBERT_WHISPER_MODEL` | `small` | `base` ist schneller, erkennt aber schlechter |
| `KUNIBERT_PIPER_VOICE` | `voices/de_DE-thorsten-medium.onnx` | `thorsten-high` klingt etwas besser, ist aber etwa 4× langsamer |
| `KUNIBERT_AGE` | `sechs bis zehn` | Zielalter in den Regeln |
| `KUNIBERT_PARTS_PER_EPISODE` | `5` | Teile pro Folge (3–12) |
| `KUNIBERT_AUDIO_TTL` | `120` | Sekunden, die eine Antwort abrufbar bleibt |
| `KUNIBERT_RATE_LIMIT` | `30` | Turns je Gerät in 10 Minuten |
| `KUNIBERT_DEVICES_FILE` | `devices.json` | Geräteliste (nur Token-Hashes) |
| `KUNIBERT_DIAGNOSTIC_TEXT` | `0` | `1` gibt den Antworttext im JSON mit zurück, nur zur Fehlersuche |

## Betrieb unter picast.com

`deploy/` enthält eine Caddy-Konfiguration (automatisches HTTPS, 3-MB-Grenze, keine Zugriffsprotokolle), eine gehärtete systemd-Unit und eine Beispiel-`.env`. Die kanonische Geräte-API soll unter `api.picast.com` laufen; Elternoberfläche und Kuration gehören zur picast.com-Plattform. Voraussetzung ist, dass DNS und Serverzugriff für picast.com eingerichtet sind. Dann setzt du einen DNS-Eintrag `api.picast.com` auf den Server, kopierst den Code nach `/opt/kunibert`, legst die `.env` unter `/etc/kunibert/` ab und startest `systemctl enable --now kunibert-server caddy`. `picast.de` ist für die Gerätekommunikation nicht erforderlich und soll höchstens defensiv weiterleiten.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

Insgesamt 21 Tests, ohne Netz und ohne Modelle:

- **Zugang:** fehlendes, falsches, fremdes und widerrufenes Token werden abgelehnt; im Speicher liegt nur der Hash.
- **Audio:** Antworten sind nur einmal und nur für das eigene Gerät abrufbar.
- **Sicherheit:** Das Sicherheitsmuster greift vor dem Sprachmodell. Meldet das Modell „sicherheit“, wird nie generierter Text vorgelesen.
- **Fehlerfälle:** Stille löst keinen KI-Aufruf aus. Ein ausgefallener Anbieter führt zu einer gesprochenen Fehleransage.
- **Eingaben:** Falsche Formate, zu lange und zu große Aufnahmen werden abgewiesen, ebenso Anfragen über der Ratenbegrenzung und manipulierter Geschichtenstand.
- **Geschichten:** Ein Bogen über fünf Teile mit offenen Fäden.
- **Echter Pi-Client:** `test_with_pi_client.py` lässt den Client per HTTP gegen einen echten uvicorn-Server laufen.

## Gemessen (Sandbox, 6 CPU-Kerne, echte Modelle, über den Pi-Client)

| Vorgang | Zeit bis zum Abspielen | Länge der Antwort |
| --- | --- | --- |
| Frage (Whisper + gpt-5-mini + Piper) | 5,8–9,2 s | 16–25 s |
| Sicherheitsfall (feste Ansage, keine KI) | 2,2 s | 28 s |
| Erzählteil (gpt-5 minimal + Piper) | 12,4–15,6 s | 84–99 s |

Auf dem Gerät sollte während der Wartezeit ein kurzer lokaler Ton oder ein Satz wie „Moment, Kunibert sattelt das Pferd …“ laufen. Ein Erzählteil kommt erst nach gut 13 Sekunden.

## Bewusst noch offen

- Fachliche Prüfung der Sicherheitsmuster und -texte, Tests mit schwierigen Kinderfragen und typischen Erkennungsfehlern bei Kinderstimmen
- Elterneinwilligung und Datenschutzinformation, Auftragsverarbeitungsvertrag mit dem Sprachmodell-Anbieter, Wahl des Rechenzentrums
- Streaming (erster Satz früher hörbar), Token-Rotation, Monitoring ohne Inhalte, signierte Updates
- Auf dem Pi: Aufnahme per Taste (`arecord`) und GPIO-Steuerung (Durchstich 3)
