# Feste Ansagen für den Pi

Der Pi spielt ein paar feste Sätze: die Vorstellung beim ersten Einschalten und Zwischensätze, wenn die Antwort länger dauert. Die Sprachdateien (WAV) liegen **nicht im Repo**, weil die Stimme noch nicht festgelegt ist. Du erzeugst sie mit einem Befehl.

## Die Dateien

| Datei | Wofür |
|---|---|
| `willkommen.wav` | Vorstellung beim ersten Einschalten |
| `zwischen-1.wav` bis `zwischen-6.wav` | Zwischensätze nach 2,5 Sekunden Wartezeit |
| `zwischen-lang.wav` | zweiter Satz nach 15 Sekunden |

Die Namen sind fest. Der Pi sucht genau diese Dateien. Die Texte stehen in [`deploy/ansagen.json`](../deploy/ansagen.json). Wer einen Text ändert, ändert ihn dort und erzeugt die Dateien neu.

## Dateien erzeugen

Auf dem Rechner mit dem Server-Code. Die Sprachausgabe muss konfiguriert sein, genau wie beim Server (`PICASTAI_TTS_*`, siehe [`deploy/EINRICHTUNG.md`](../deploy/EINRICHTUNG.md)). Es wird die Stimme benutzt, die gerade eingestellt ist.

```bash
npm run ansagen -- ./ansagen-out
```

Das Ergebnis sind acht WAV-Dateien (16 kHz, Mono, 16 Bit) im Ordner `ansagen-out`. Der Befehl schreibt erst, wenn alle acht Dateien gelungen sind. Bestehende Dateien werden überschrieben. Die Ausgabe nennt nur Dateinamen und Längen.

Ohne konfigurierte Sprachausgabe bricht der Befehl mit einer verständlichen Meldung ab und schreibt nichts.

## Dateien auf den Pi bringen

Vom Rechner auf den Pi kopieren (`<pi-adresse>` ersetzen):

```bash
scp ./ansagen-out/*.wav <benutzer>@<pi-adresse>:/tmp/
```

Auf dem Pi in den Ordner des Clients legen und neu starten:

```bash
sudo install -o kunibert -g audio -m 0640 /tmp/willkommen.wav /tmp/zwischen-*.wav /var/lib/kunibert/ansagen/
sudo systemctl restart kunibert
journalctl -u kunibert -n 20
```

Im Log darf keine Warnung „Ansagen fehlen“ stehen. Fehlen Dateien, läuft der Pi trotzdem weiter, nur ohne diese Sätze.

## Vorstellung erneut spielen

Die Vorstellung kommt nur beim allerersten Start. Eltern wiederholen sie mit Mikrofon-Schalter „aus“ und beiden Tasten 5 Sekunden halten (siehe [`pi-client/README.md`](../pi-client/README.md)).
