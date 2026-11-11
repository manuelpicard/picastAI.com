# Firmware für das Endgerät (ESP32-S3)

Das Seriengerät soll ein ESP32-S3 werden; der erste Aufbau läuft auf dem Raspberry Pi 5 (`pi-client/`). Diese Firmware entsteht in Stufen (M1 bis M6). Sie spricht dieselbe Schnittstelle wie der Pi-Client: [`docs/picastAI-Pi-API.md`](../../docs/picastAI-Pi-API.md).

> **Stand (11.11.2026): Stufe M1, Entwurf.** Der Code ist geschrieben, aber **weder gebaut noch auf einem Gerät gelaufen**: In der Umgebung, in der er entstand, ließ sich ESP-IDF nicht installieren. Den Bau prüft die CI (`.github/workflows/firmware.yml`). Auf dem Rechner getestet ist nur die Prüfung der Server-Adresse (`test/test_base_url.c`). Ein Entwicklungsboard ist noch nicht gewählt.

## Stufen

| Stufe | Inhalt | Stand |
| --- | --- | --- |
| M1 | WLAN verbinden, Server über HTTPS erreichen (`GET /health`), Zertifikat prüfen | Entwurf, ungebaut |
| M2 | Aufnahme vom Mikrofon, `POST /v1/device/question` | offen |
| M3 | Antwort abrufen und abspielen (gestreamt) | offen |
| M4 | Tasten, LED, Zustandsautomat wie im Pi-Client | offen |
| M5 | Fehler, Wiederholung, Zeitgrenzen | offen |
| M6 | WLAN-Einrichtung ohne Rechner, Updates mit Rückfall, Schutz des Tokens | offen |

M1 braucht kein bestimmtes Board: jedes ESP32-S3-Modul mit USB genügt. Ab M2 hängen die Pins vom Board ab.

## Bauen und aufspielen (M1)

Voraussetzung: [ESP-IDF](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/index.html) 5.x ist installiert und die Umgebung geladen.

```bash
cd firmware/esp32-s3
idf.py set-target esp32s3
idf.py menuconfig        # Menü "Ritter Kunibert": WLAN-Name, WLAN-Passwort, Adresse des Servers
idf.py build
idf.py -p <Port> flash monitor
```

- WLAN-Name, Passwort und Adresse landen in der Datei `sdkconfig`. Sie steht in `.gitignore` und gehört **nicht** ins Repo.
- Die Adresse muss mit `https://` beginnen und ohne Schrägstrich enden, gleiche Schreibweise wie `PICASTAI_PUBLIC_BASE_URL` auf dem Server. `http://` lehnt die Firmware ab.
- M1 braucht **kein** Gerätetoken: `/health` ist ohne Anmeldung erreichbar. Das Token kommt in M2 und wird dann nicht in `sdkconfig` abgelegt, sondern im verschlüsselten Speicher (M6).

**Abnahme M1:** Im Monitor erscheint alle 30 Sekunden `M1 bestanden: Server über HTTPS erreichbar`. Mit einer falschen Adresse oder einem Server ohne gültiges Zertifikat erscheint stattdessen eine Warnung; das Gerät stürzt nicht ab.

## Test auf dem Rechner

```bash
cc -Wall -Wextra -Werror -I main -o /tmp/kb_test test/test_base_url.c main/kb_url.c && /tmp/kb_test
```
