# Kennzeichnung von Sprache: Verfahren im Vergleich

**Stand: 26.11.2026, 23:45 (Europe/Berlin)** · Punkt N1126-1153-c der Arbeitsliste, Folge von H3 ([`ki-hinweis.md`](ki-hinweis.md), Empfehlung E6) und N1126-1153-b ([`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md)) · Wochen-Autopilot, Rolle Recherche. Dient N1123-1153-b (Bauen).

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

„Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. Alle Quellen wurden am 26.11.2026 über die Websuche gefunden und danach abgerufen. Das Abrufwerkzeug gibt nur die Antwort eines kleinen Modells auf eine Frage zurück, nicht den Rohtext der Seite. Alle Angaben unten sind also „gelesen über das Abrufwerkzeug“ und sollten vor dem Bau am Original gegengeprüft werden. Quellen stehen in Abschnitt 6.

## 1. Ergebnis in drei Sätzen

1. Für das Wasserzeichen im Ton gibt es drei Verfahren mit MIT-Lizenz für Code und Gewichte (AudioSeal, WavMark; SilentCipher nur für den Code): AudioSeal passt am besten zu 16 kHz mono, ist schnell und hat ein öffentliches Erkennungsmittel; keines ist gegen Wiedergabe über Lautsprecher mit neuer Aufnahme geprüft, und gegen gezielte Angriffe sind alle schwach.
2. Die zweite Schicht des Kodex (signierte Metadaten) ist mit C2PA und der freien Bibliothek c2pa-rs machbar, aber der Ton-Strom zum Gerät trägt sie nicht weiter, wenn der Server Rohton (PCM) schickt; sie gilt dann für Dateien und Protokolle, nicht für den Strom (Einschätzung).
3. Empfehlung (vorläufig, Einschätzung): AudioSeal im letzten Serverschritt nach der Wandlung auf 16 kHz, mit einer festen 16-Bit-Kennung ohne Personenbezug, dazu signierte Herkunftsangaben (C2PA) für jede gespeicherte oder herunterladbare Audiodatei; Hörprobe und eigener Robustheitstest vor dem Bau.

## 2. Vergleichstabelle

| Verfahren | Schicht | Lizenz (Code / Gewichte) | 16 kHz mono 16 Bit | Robustheit (laut Quellen) | Qualität, Aufwand | Erkennung öffentlich und kostenlos? |
| --- | --- | --- | --- | --- | --- | --- |
| AudioSeal | Wasserzeichen | MIT / MIT (Q1) | ja, auf 16 kHz trainiert (Q1, Q2) | Neukomprimierung, Abtastratenwandlung gut; Tempo 1,25 gut; Hochpass schwach; Angriff mit Detektorzugriff wirksam; Lautsprecher: nicht geprüft (Q2, Q8) | PESQ 4,47; 7 ms je Beispiel auf GPU (Q2); CPU-Wert offen | ja: Detektor liegt im selben Paket (Q1) |
| WavMark | Wasserzeichen | MIT / MIT (Q3, Q8) | ja, nur 16 kHz (Q3) | MP3 gut; Tempo und Neuerzeugung (Vocoder, Codec) schwach (Q2, Q8); Lautsprecher: nicht geprüft | PESQ 4,3 (Q2); etwa 6 bis 7 mal langsamer als AudioSeal (Q8) | ja, im Paket (Q3) |
| SilentCipher | Wasserzeichen | MIT / **Gewichte ohne genannte Lizenz** (Q5, Q6, Q8) | ja, eigenes 16-kHz-Modell (Q7) | viele Angriffe gut; Lautsprecher: nicht geprüft (Q7) | sehr hohe Qualität; schnell (Q7) | Code ja; Nutzung der Gewichte offen |
| C2PA (signierte Angaben) | Metadaten | c2pa-rs: MIT oder Apache 2.0 (Q9) | für WAV und MP3 gelistet (Q10); gilt für Dateien | Angaben gehen verloren, wenn man sie entfernt oder neu kodiert (Q11) | kein Einfluss auf den Klang; Zertifikat nötig (offen) | ja: c2patool und Bibliothek (Q9) |
| Fingerabdruck (Chromaprint, ISCC) | Zusatz | MIT, Apache 2.0 (Q8) | nicht gesondert geprüft | Abgleich nur gegen eine Liste eigener Töne | kein Eingriff in den Ton; braucht Index | nur, wenn man den Index offenlegt (Einschätzung) |
| Protokollieren | Zusatz | entfällt | entfällt | entfällt | verstößt gegen die Regel „keine Antworttexte im Protokoll“ | nein |

## 3. Die Verfahren im Einzelnen

### 3.1 AudioSeal (Meta)

- **Lizenz.** Code MIT; Gewichte laut Projektseite ebenfalls MIT („full MIT license (including the license for the model weights)“, Q1). Auch das Benchmark-Paper nennt MIT für beides (Q8). Die GitHub-Seite selbst ließ sich nicht abrufen (nicht gelesen).
- **Format.** Trainiert auf 16 kHz; Nutzungshinweise empfehlen 16 oder 24 kHz für das Standardmodell (Q1, Q2). Das passt zum Ton am Gerät.
- **Nutzlast.** Optional 16 Bit, der Detektor liefert sie zurück (Q1). Das reicht für eine feste Kennung („Ton von Kunibert, Version x“), nicht für Daten je Gerät oder Person.
- **Robustheit.** Q2: Abtastratenwandlung 1,00, MP3 und AAC 1,00, EnCodec 0,98, Tempo 1,25 gleich 0,99; Hochpass 0,61; weißes Rauschen 0,91. Wiedergabe über Lautsprecher: nicht geprüft. Q8 und Q11 bestätigen die Codec-Werte; ein Rundlauf über 8 kHz schadet nur dem Streaming-Modell, nicht dem Basismodell (Q8). Q12 zeigt, dass Tempo- und Tonhöhenänderung, niedrige Sprach-Codecs, Vocoder und Entrauscher das Zeichen fast löschen.
- **Qualität und Aufwand.** PESQ 4,470, MUSHRA 77,1 gegen 80,5 für das Original (Q2); Erzeugung 7,4 ms und Erkennung 3,3 ms je Beispiel auf einer GPU (Q2). Q8 nennt 4,9 ms je Sekunde Ton. CPU-Aufwand auf dem Server: offen (Messung nötig). Braucht PyTorch (Q1).
- **Erkennung.** Der Detektor ist im selben Paket und kostenlos (Q1). Das ist zugleich ein Nachteil: Wer den Detektor hat, kann gezielt dagegen angreifen (Q2).
- **Einschätzung.** Beste Wahl der drei für Kunibert: passende Rate, freie Lizenz, schnell, Erkennung dabei. Die Marke ist ein Abschreckungs- und Nachweismittel, kein Siegel (Q2, Q12).

### 3.2 WavMark

- Lizenz MIT (Q3, Q8); nur 16 kHz, mono (Q3). 32 Bit je Sekunde, davon 16 Bit feste Kennung, 16 Bit frei; Fehlalarm etwa 1 zu 65.536 laut Projektseite (Q3). Die Robustheit nennen dort die Autoren selbst (Q3).
- Fremde Messungen: gut bei MP3, aber 0,00 bei Tempo- und Tonhöhenänderung und gegen Vocoder und allgemeine Codecs (Q2, Q12). Langsamer und etwas schlechtere Qualität als AudioSeal (Q2, Q8).
- **Einschätzung.** Als Zweitverfahren brauchbar, wenn man eine freie 16-Bit-Nutzlast braucht. Gegen AudioSeal kein Vorteil für Kunibert.

### 3.3 SilentCipher (Sony)

- Code MIT; für die Gewichte nennt keine gelesene Seite eine Lizenz (Q5, Q6; Q8 stuft es deshalb nur als Vergleich ein). Eigenes 16-kHz-Modell, 32 Bit Nutzlast; Angriffe wie Rauschen, Ausschnitt, Neuabtastung, MP3, OGG, AAC wurden geprüft, Wiedergabe über Lautsprecher nicht (Q7). Sehr hohe Qualität und schnell (Q7).
- **Einschätzung.** Technisch interessant, aber ohne klare Lizenz der Gewichte für ein verkauftes Gerät nicht einsetzbar. **Offen:** die Lizenz der Gewichte (Betreiber kann beim Hersteller nachlesen; nichts angefragt).

### 3.4 Signierte Herkunftsangaben (C2PA)

- Die freie Bibliothek c2pa-rs steht unter MIT oder Apache 2.0 (Q9). In der Formatliste der C-Bibliothek stehen WAV (audio/wav), MP3 und M4A (Q10); ob Schreiben für WAV erlaubt ist, steht dort nicht (offen). Die Spezifikation selbst ließ sich nicht abrufen (nicht gelesen, Freigabe fehlte).
- Ein AWS-Beispiel verbindet beides: AudioSeal-Wasserzeichen im Rohton mit 16 Bit als Schlüssel in einem Verzeichnis, dazu ein signiertes C2PA-Manifest; geht das Manifest verloren, führt das Wasserzeichen zurück (Q11). Das Beispiel nennt seine Zahlen „Engineering-Ziele“.
- **Einschätzung.** Das ist die zweite Schicht des Kodex (Maßnahme 3.2, [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md)). Am Gerät kommt Rohton an; Metadaten wandern nur mit Dateien. Für den Strom bleibt also das Wasserzeichen die tragende Schicht. Ob der Kodex-Fall „geschlossene Umgebung, eine Schicht genügt“ passt, ist dort bewertet und hier nicht neu geprüft. Ein Signaturzertifikat und dessen Vertrauensliste sind **offen** (nichts besorgt).

### 3.5 Fingerabdruck und Protokoll

- Fingerabdrücke (Chromaprint MIT, ISCC Apache 2.0) liefern nur einen Abgleich gegen eine eigene Liste (Q8). Sie sind laut Kodex ein Zusatz, keine Schicht. Ein Protokoll mit den erzeugten Tönen passt nicht zur Regel „keine Antworttexte im Protokoll“ ([`CLAUDE.md`](../../CLAUDE.md)). **Einschätzung:** nicht bauen.

## 4. Abgleich mit dem Kodex (Maßstäbe aus N1126-1153-b)

| Maßstab | AudioSeal | Bemerkung |
| --- | --- | --- |
| Zwei Schichten (Metadaten und Wasserzeichen) | Wasserzeichen ja; Metadaten nur mit C2PA daneben | Einschätzung |
| Robust gegen Neukomprimierung, Formatwechsel, Tonhöhe, Zeitdehnung | Komprimierung ja; Tempo bis 1,25 ja; Tonhöhe und starke Dehnung nein (Q2, Q12) | Lücke |
| Robust gegen Lautsprecher und neue Aufnahme | in keiner Quelle geprüft (Q2, Q7, Q8) | offen; eigener Test nötig |
| Kostenloses öffentliches Erkennungsmittel | Detektor im freien Paket (Q1); eine Seite für Betroffene fehlt | Bauaufgabe |
| Zusammenspiel der Erkennung bis 2.2.2027 | keine Norm für Wasserzeichen in den Quellen gefunden | offen |

## 5. Empfehlung für N1123-1153-b (vorläufig, Einschätzung, 26.11.2026 23:45)

1. **Verfahren:** AudioSeal, Basismodell, im letzten Serverschritt nach der Wandlung auf 16 kHz mono (wie E6). Alle Stimmen tragen die Marke: Pocket TTS, Piper, Google, Ersatzsätze und Ansagen.
2. **Nutzlast:** feste 16-Bit-Kennung, nichts Personenbezogenes, keine Geräte-ID, keine Sitzung.
3. **Zweite Schicht:** signierte Herkunftsangaben (C2PA, c2pa-rs) für jede gespeicherte oder abgegebene Audiodatei (zum Beispiel Elternseite, Export). Für den Strom keine; das wird offen so dokumentiert.
4. **Erkennung:** ein kleines freies Prüfskript im Repo und eine Seite, die erklärt, wie man es nutzt.
5. **Vor dem Bau messen:** CPU-Zeit je Sekunde Ton auf dem Zielserver; Hörprobe mit Erwachsenen; Test, dass die Marke nach Wandlung, Übertragung und Wiedergabe über Lautsprecher mit Aufnahme am Pi noch gefunden wird (nur Erwachsene, [Freigabe-Checkliste](../../CLAUDE.md) bleibt).
6. **Test im Repo:** jede Audio-Antwort trägt die Marke (auch Ersatzsätze); kein Protokoll enthält Äußerung, Antworttext, Geräte-ID oder Token.
7. **Ehrlich dokumentieren:** Die Marke hält gezielten Angriffen nicht stand (Q2, Q12).

## 6. Quellen (alle am 26.11.2026 über Websuche gefunden und abgerufen)

- Q1 AudioSeal, Paketseite: https://pypi.org/project/audioseal/ (Lizenz, Rate, Nutzlast, Erkennung). Zitat: „full MIT license (including the license for the model weights)“.
- Q2 AudioSeal, Paper: https://arxiv.org/html/2401.17264v2 (Robustheit, Qualität, Tempo, Grenzen).
- Q3 WavMark, Paketseite: https://pypi.org/project/wavmark/0.0.2/ (MIT, 16 kHz, Nutzlast).
- Q4 entfällt (WavMark-Paper, nur in der Suche gelistet, nicht abgerufen, nicht benutzt).
- Q5 SilentCipher, Repo: https://github.com/sony/silentcipher (Code MIT; Gewichte ohne Lizenzangabe).
- Q6 SilentCipher, Modellseite: https://huggingface.co/Sony/SilentCipher (keine Lizenz für die Gewichte genannt).
- Q7 SilentCipher, Paper: https://arxiv.org/html/2406.03822v2 (16-kHz-Modell, Angriffe, Laufzeit; letzte 18.439 Zeichen nicht gelesen).
- Q8 Benchmark offener Wasserzeichen und Fingerabdrücke (Vorabdruck): https://arxiv.org/pdf/2610.04151 (erste 100.000 von 199.921 Zeichen gelesen).
- Q9 c2pa-rs, README: https://raw.githubusercontent.com/contentauth/c2pa-rs/main/README.md (MIT oder Apache 2.0).
- Q10 C2PA, Formatliste: https://opensource.contentauthenticity.org/docs/c2pa-c/docs/supported-formats/ (wav, mp3, m4a).
- Q11 AWS-Beitrag zu Herkunft von Audio: https://aws.amazon.com/blogs/media/building-audio-provenance-for-ai-generated-content-at-the-source-with-aws/ (Beispielaufbau, Zahlen sind „Ziele“).
- Q12 Angriffe auf Wasserzeichen: https://arxiv.org/html/2504.10782v1 (AudioSeal, WavMark; SilentCipher nicht geprüft).

Zitate: eines je Quelle, höchstens 15 Wörter. Text auf den Seiten, der sich an mich richtete: keiner gefunden.

## 7. Nicht geprüft

- Kein Ton erzeugt, nichts eingebettet, kein Code ausgeführt. Alle Werte stammen aus Quellen, nicht aus eigenen Messungen.
- Wiedergabe über Lautsprecher mit neuer Aufnahme: keine Quelle prüft sie. Offen.
- CPU-Aufwand von AudioSeal auf dem Server: offen.
- Lizenz der SilentCipher-Gewichte, Schreiben von C2PA in WAV, Signaturzertifikat: offen.
- Nicht gelesen (Freigabe fehlte): C2PA-Spezifikation (`spec.c2pa.org`), AudioSeal-GitHub-Seite.
- Kodex-Maßnahme 3.4 (Zusammenspiel bis 2.2.2027): keine Norm gefunden; Suche war schmal.
- Ob Pocket TTS selbst markiert: bleibt N1126-1153-d. Die Suche nach einer Marke in Pocket TTS lieferte keinen Beleg.
- Rechtliche Wirkung: keine Rechtsberatung.

## 8. Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Claude | N1126-2323-g: AudioSeal auf dem Zielserver messen (CPU, Hörprobe, Wandlung) | Server, nur Erwachsene |
| Claude | N1126-2323-h: Test der Marke über Lautsprecher und Mikrofon am Pi | Pi, nur Erwachsene |
| Claude | N1126-2323-i: Lizenz der SilentCipher-Gewichte und C2PA-Schreiben für WAV klären | nur lesen |
| Claude | N1123-1153-b bauen nach Abschnitt 5, wenn N1126-1153-d vorliegt | Repo |
| Manuel | Entscheiden, ob ein Signaturzertifikat für C2PA besorgt wird (nichts bestellt) | im Chat |
