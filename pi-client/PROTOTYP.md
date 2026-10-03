# Erster Ritter-Kunibert-Prototyp auf dem Raspberry Pi

**Ziel:** Ein Pi als Tisch-Prototyp, der über einen Sprechtaster eine kurze Frage aufnimmt, die Antwort vom Schweizer Quantencomputer holt und abspielt. Ein zweiter Taster startet bzw. setzt eine Geschichte fort. Der Pi ist dabei ausschließlich **Gerät/Client**; STT, Modell und Sprachausgabe laufen auf dem Server.

> **Stand:** Die Taster-Software ist vorbereitet und ohne Pi-Hardware getestet. Der Server samt Caddy-Konfiguration ist vorbereitet, aber der HTTPS-Dienst auf dem Schweizer Server muss noch tatsächlich installiert, mit DNS verbunden und erreichbar gemacht werden. Bis dahin können wir Montage, Mikrofon, Lautsprecher und Taster lokal prüfen; der End-to-End-Aufruf kommt danach.

## 1. Einkauf

### Empfohlenes Pi-Kit

[Amazon.de: Raspberry Pi 5 Starterkit von BerryBase (8 GB, 64 GB microSD, Gehäuse mit Lüfter, 27-W-USB-C-Netzteil, Micro-HDMI-Kabel, Kartenleser)](https://www.amazon.de/Raspberry-Starterkit-8GB-vorinstalliert-Geschenkverpackung/dp/B0FWKHQ7MD) — **ASIN B0FWKHQ7MD**.

Die Produktseite führte diese Bestandteile und BerryBase als Verkäufer. Der angezeigte Preis/Versand war bei der Prüfung nicht verlässlich genug für eine Preiszusage. **Vor Bestellung** bitte Preis, Versand an deine Schweizer Adresse, Schweizer Einfuhrabgaben und die Ausführung des Netzteilsteckers direkt auf Amazon prüfen. Die 8 GB sind für den Client mehr als nötig; 4 GB genügen. Wenn du ein deutlich günstigeres 4-GB-Kit findest, nimm es, sofern es ein ordentliches 5-V-/5-A-USB-C-Netzteil, ein passendes Pi-5-Gehäuse mit Kühlung und eine microSD-Karte enthält.

**Wichtig vor dem Kauf:** Prüfe in den Verkäuferdetails, ob der 40-polige GPIO-Header auf dem Board bereits verlötet ist. Für den Taster-Prototyp sollten wir keine Lötausrüstung voraussetzen.

### Noch nötig für Sprache und Taster

| Teil | Anzahl | Empfehlung / worauf achten |
|---|---:|---|
| USB-Mikrofon | 1 | [SunFounder USB-Mini-Mikrofon auf Amazon.de](https://www.amazon.de/-/en/SUNFOUNDER-Mini-Microphone-Raspberry-Recognition/dp/B01KLRBHGM). USB-A, ohne Spezialtreiber; später am Pi mit `arecord -l` prüfen. |
| USB-Audioadapter | 1 | [UGREEN USB-A auf 3,5-mm-Audioadapter](https://www.amazon.de/-/en/UGREEN-External-Sound-Adapter-Version/dp/B087T5H3MQ), damit ein normaler Aktivlautsprecher am Pi Ton ausgeben kann. Der Pi 5 hat keinen eingebauten 3,5-mm-Audioausgang; alternativ zunächst Audio über einen HDMI-Monitor mit Lautsprechern testen. |
| Aktivlautsprecher | 1 | Kleiner Aktivlautsprecher mit **3,5-mm-Audioeingang** und eigener Stromversorgung/USB-Strom. Nicht mit einem rein passiven Lautsprecher verwechseln. Audio läuft über den USB-Audioadapter, USB-Strom versorgt nur den Lautsprecher. |
| Schließer-Taster (NO) | 2 | Momenttaster, normalerweise offen, zum Drücken geeignet. Für den Tischaufbau reichen zwei einfache Taster auf einem Steckbrett. |
| Steckbrett + Jumperkabel | 1 Set | Steckbrett und passende Dupont-Kabel (weiblich-weiblich für GPIO; für Taster je nach Anschlussart ggf. zusätzlich männlich-männlich). Kein Löten beim Aufbau, wenn Header und Kabel passen. |
| HDMI-Bildschirm/Tastatur | 1 (leihweise) | Nur für die Ersteinrichtung; danach kann der Pi per WLAN und SSH laufen. Der HDMI-Bildschirm kann zunächst auch den Ton ausgeben. |

[Amazon.de-Suche: Taster und Dupont-/Steckbrett-Set](https://www.amazon.de/s?k=Raspberry+Pi+Taster+Breadboard+Dupont+Kabel) · [Amazon.de-Suche: USB-Aktivlautsprecher mit 3,5-mm-Eingang](https://www.amazon.de/s?k=kleine+Aktivlautsprecher+3%2C5+mm+USB+Strom)

## 2. Tasterverdrahtung

Die Software verwendet BCM-GPIO-Nummern. Jeder Schließer verbindet beim Drücken **nur** einen GPIO-Eingang mit GND. Die internen Pull-up-Widerstände des Pi werden benutzt.

| Funktion | BCM-GPIO | Physischer Pin am 40-Pin-Header | Gemeinsame Masse |
|---|---:|---:|---:|
| Sprechtaste (gedrückt halten) | GPIO17 | Pin 11 | Pin 6 (GND) |
| Erzähltaste (kurz drücken) | GPIO27 | Pin 13 | Pin 9 (GND) |

**Sicherheitsregeln:** Pi vollständig ausschalten und USB-C-Netzteil abziehen, bevor du Kabel umsteckst. Keine 5 V oder 3,3 V an einen GPIO legen; keine Tasterleitung an einen Versorgungspin anschließen. Niemals lose Kabel so liegen lassen, dass sie benachbarte Pins kurzschließen. Vor dem Einschalten Verdrahtung anhand der Pin-Nummern am Board doppelt prüfen.

## 3. Was der vorbereitete Taster-Client macht

- **Sprechtaste halten:** nimmt mit `arecord` mono, 16 kHz, 16-bit PCM auf; beim Loslassen wird die Aufnahme beendet und als Frage gesendet. Maximale Aufnahme: 30 Sekunden; sehr kurze Tastendrücke werden verworfen.
- **Erzähltaste drücken:** startet eine Folge, wenn noch keine aktiv ist; andernfalls fordert sie den nächsten Teil an. Nach dem letzten Teil startet die nächste Folge.
- Aufnahmen und Antworten liegen während der Verarbeitung in privaten Verzeichnissen unter `/dev/shm` und werden anschließend entfernt. Der kleine Geschichtenstand liegt ebenfalls dort und verschwindet beim Neustart.
- Der Client folgt keinen Weiterleitungen, nutzt außerhalb lokaler Tests nur HTTPS und sendet keine Anbieter-Schlüssel. Keine automatische Wiederholung bei einem Netzwerkfehler.
- Das ist ein **begleiteter Tisch-Prototyp**, kein freigegebenes Kinderprodukt. Vor Tests mit Kindern sind Eltern-Einwilligung, Datensparsamkeit, Antwortprüfung, Offline-Verhalten und der reale Serverbetrieb gesondert abzunehmen.

## 4. Aufbau- und Inbetriebnahme in kleinen Schritten

Wir gehen nach Lieferung Schritt für Schritt vor; nicht alles auf einmal anschließen.

### Schritt A – Betriebssystem und erster Start

1. Auf einem Computer den offiziellen [Raspberry Pi Imager](https://www.raspberrypi.com/software/) öffnen, Raspberry Pi 5 auswählen und **Raspberry Pi OS Lite (64-bit)** auf die mitgelieferte microSD schreiben.
2. Im Imager einen eigenen Benutzernamen und ein starkes Passwort setzen, WLAN konfigurieren und SSH nur dann einschalten, wenn du es benötigst. Kein Standardpasswort verwenden.
3. microSD einsetzen, Monitor/Tastatur anschließen und den Pi mit dem mitgelieferten Netzteil starten. Ein Update durchführen:

   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo reboot
   ```

### Schritt B – Mikrofon und Lautsprecher einzeln prüfen

1. USB-Mikrofon anschließen. `arecord -l` ausführen und notieren, ob ein Capture-Gerät erscheint.
2. Für den ersten Test den Aktivlautsprecher entweder am USB-Audioadapter oder den HDMI-Monitor verwenden. `aplay -l` zeigt die verfügbaren Ausgänge.
3. Benötigte Werkzeuge installieren:

   ```bash
   sudo apt install -y alsa-utils python3-gpiozero
   ```

4. Testaufnahme (fünf Sekunden) erstellen und anhören:

   ```bash
   arecord -f S16_LE -r 16000 -c 1 -d 5 /tmp/mikrofontest.wav
   aplay /tmp/mikrofontest.wav
   rm -f /tmp/mikrofontest.wav
   ```

   Falls die Geräte nicht das ALSA-Standardgerät sind, wählen wir den mit `arecord -l`/`aplay -l` angezeigten Namen gezielt aus. Die Testaufnahme danach löschen.

### Schritt C – Taster zuerst stromlos verdrahten

1. Pi herunterfahren (`sudo poweroff`) und Netzteil abziehen.
2. Sprechtaster zwischen Pin 11 (GPIO17) und Pin 6 (GND) anschließen.
3. Erzähltaster zwischen Pin 13 (GPIO27) und Pin 9 (GND) anschließen.
4. Pin-Nummern, Schließer-Kontakte und Kurzschlussfreiheit prüfen. Erst danach einschalten.

### Schritt D – Client und Server verbinden

Der Quantencomputer-Server muss zunächst als HTTPS-Dienst mit einer eigenen API-Adresse eingerichtet sein. Caddy-Konfiguration und Systemdienst liegen im privaten Repo unter `server/deploy/`; DNS und öffentliche Erreichbarkeit wurden noch nicht für einen Livebetrieb hergestellt. **`api.picast.com` deshalb nicht als bereits verfügbaren Dienst voraussetzen.** Sobald der echte Hostname feststeht, ersetzen wir in der Pi-Konfiguration den Platzhalter durch genau diese URL.

Der Client benötigt pro Pi eine Gerätekennung und ein widerrufbares Token, das der Administrator direkt auf dem Server erzeugt. Das Token wird nicht in Git, nicht in Chatnachrichten und nicht auf Fotos des Aufbaus festgehalten. Auf dem Pi wird die Datei nur für den lokalen Benutzer lesbar gemacht (`chmod 600`). Beispielwerte, noch keine echten Zugangsdaten:

```bash
mkdir -p ~/.config/kunibert
nano ~/.config/kunibert/device.env
chmod 600 ~/.config/kunibert/device.env
```

Dateiinhalt mit den später vom Serverbetreiber gelieferten Werten:

```sh
KUNIBERT_API_BASE=https://DEIN-ECHTER-SERVER-HOSTNAME
KUNIBERT_DEVICE_ID=prototype-1
KUNIBERT_DEVICE_TOKEN=HIER-DAS-GERAETETOKEN
KUNIBERT_MIC_DEVICE=default
# Nur nötig, wenn der Standardausgang nicht passt; z. B. plughw:1,0
# KUNIBERT_AUDIO_DEVICE=plughw:1,0
```

### Schritt E – Client starten und Verhalten prüfen

1. Private Repo-Dateien nach dem Merge des Prototyp-PR auf den Pi übertragen (per SSH von deinem Rechner oder per Anmeldung mit GitHub CLI auf dem Pi; **niemals** ein GitHub-Token in den Pi-Code schreiben).
2. Im Verzeichnis `pi-client/` mit Raspberry-Pi-OS-Systempython starten:

   ```bash
   set -a
   . ~/.config/kunibert/device.env
   set +a
   python3 -m kunibert_pi.buttons
   ```

3. Zuerst als Erwachsener testen: Taste GPIO27 startet eine Folge; nochmals drücken fordert Teil 2 an. GPIO17 gedrückt halten, einen kurzen harmlosen Testsatz sprechen, loslassen und Antwort abwarten.
4. Netzwerk trennen und Fehlerverhalten prüfen. Nach dem Test Prozess mit `Ctrl-C` beenden; keine Token oder Sprachaufnahmen in Screenshots, Logs oder Git committen.

## 5. Nächster gemeinsamer Arbeitsschritt

Wenn das Paket da ist, starten wir mit **A: OS/Netzwerk** und machen erst weiter, wenn der Pi erreichbar und aktualisiert ist. Danach testen wir Mikrofon und Ton separat, dann stromlos die Taster. Den echten API-End-to-End-Test machen wir erst, sobald der Server auf dem Schweizer Quantencomputer mit DNS und HTTPS bereitsteht.

## Verifizierte Quellen

- [Raspberry Pi 5 – technische Daten und empfohlenes 27-W-USB-C-Netzteil](https://www.raspberrypi.com/products/raspberry-pi-5/)
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
- [GPIO Zero installieren](https://gpiozero.readthedocs.io/en/stable/installing.html) (auf Raspberry Pi OS standardmäßig enthalten; falls nötig via apt installierbar)
- [GPIO Zero: Eingänge und interne Pull-ups](https://gpiozero.readthedocs.io/en/stable/api_input.html)
- [Raspberry-Pi-Forum: Audioausgabe beim Pi 5, USB-DAC/HDMI](https://forums.raspberrypi.com/viewtopic.php?t=357073)
