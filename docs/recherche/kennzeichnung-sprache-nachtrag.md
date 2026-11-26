# Kennzeichnung von Sprache: Nachtrag aus den Volltexten

**Stand der Quellen: 26.11.2026** (Abrufe am selben Tag, zwischen etwa 21:30 und 23:58 Uhr, durch Unteragenten dieses Laufs; die Zeiten sind geschätzt) · Punkt N1126-2348-a der Arbeitsliste, Nachtrag zu N1126-1153-c ([`kennzeichnung-sprache.md`](kennzeichnung-sprache.md)) · Wochen-Autopilot, Rolle Recherche. Dient N1123-1153-b (Bauen). Es wurde nichts angemeldet, nichts angefragt und nichts abgeschickt.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

**Warum es diesen Nachtrag gibt.** Der Vergleich in [`kennzeichnung-sprache.md`](kennzeichnung-sprache.md) stützt sich nach den eigenen Angaben dort auf Antworten des Abrufwerkzeugs, nicht auf den Wortlaut der Seiten. Ich habe dieselben Quellen und weitere im Wortlaut lesen lassen. Dabei zeigte sich: Eine wichtige Aussage dort stimmt nicht (Abschnitt 3). Dieser Nachtrag berichtigt sie, ergänzt Lizenzen und Befunde und stellt die Empfehlung für N1123-1153-b unter Vorbehalt.

**So wurde gelesen.** Alle Seiten wurden am 26.11.2026 über die Websuche gefunden und danach durch Unteragenten (Claude Sonnet) gelesen. Die Agenten gaben den Seitentext fensterweise im Wortlaut wieder (Fenster von etwa 40.000 Zeichen, mit etwa 1.000 Zeichen Überlappung) und berichteten danach. Die maschinelle Zusammenfassung, die das Werkzeug anhängt, wurde nicht benutzt. Ich habe nie einen Rohtext gesehen, nur die Berichte. Aussagen wie „steht nicht im Text“ sind also Aussagen von Agenten über lange Texte. Eine Stelle kann übersehen sein. Wie viel von jeder Seite gelesen wurde, steht in der Quellentabelle. Lizenztexte (Dateien LICENSE) habe ich bei keinem Verfahren gelesen, nur das, was die Seiten über die Lizenz sagen.

„Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. Im Text stehen keine Zitate, nur in der Quellentabelle (ein Zitat je Quelle, höchstens 15 Wörter, aus dem Bericht des Agenten, nicht am Original gegengelesen). Sätze aus `kennzeichnung-sprache.md` gebe ich sinngemäß wieder.

## 1. Kurzfassung

**Frage:** Was ändert sich am Vergleich in `kennzeichnung-sprache.md`, wenn man die Quellen im Wortlaut liest?

**Antwort (Einschätzung), sieben Punkte:**

1. **Eine Berichtigung.** Dort steht sinngemäß, keine Quelle prüfe die Wiedergabe über Lautsprecher mit neuer Aufnahme. Das stimmt nicht. Eine Arbeit, die neun Wasserzeichen-Verfahren vergleicht, hat es mit echtem Lautsprecher und echtem Mikrofon gemessen (Q1, Abschnitt 4). Es sind nur 5 markierte Proben je Verfahren. Die Messung ist dünn, aber sie ist da.
2. **Ergebnis dieser Messung:** AudioSeal und SilentCipher bestehen bei keinem der drei Abstände (0,5 m, 2,5 m, 5 m). WavMark besteht bei 0,5 m, auch mit anderem Mikrofon und anderem Lautsprecher, aber nicht ab 2,5 m. Timbre besteht bei 0,5 m und bei 2,5 m. Ab 2,5 m liegt die Genauigkeit der meisten Verfahren unter 0,6 (Q1).
3. **Folge für die Empfehlung:** AudioSeal passt bei Lizenz, Abtastrate und Erkennungsmittel am besten, wie im Vergleich dort. Über Lautsprecher gibt es aber nur diesen einen Messwert, und er ist für AudioSeal negativ (Einschätzung). Die Messung am Pi (N1126-2323-h) wird damit zur Bedingung für die Wahl und nicht erst zur Kontrolle danach. Zu messen sind AudioSeal, WavMark und, wenn die Lizenz es zulässt, Timbre (Abschnitt 9).
4. **Kein Verfahren ist breit robust.** Tonhöhenänderung bricht alle neun Verfahren der Arbeit (Q1). Neu erzeugte Sprache, neuronale Codecs und Entrauscher löschen die Marken weitgehend (Q1, Q2). Gezielte Angriffe entfernen sie ebenfalls (Q2, Q3, Q4). Bei MP3, Tempo und Opus widersprechen sich die Quellen (Abschnitt 5).
5. **Lizenzen (Abschnitt 6):** AudioSeal MIT für Code und Gewichte (Q5). WavMark MIT für Paket und Modellseite (Q6, Q7). Perth: Code MIT, für die Gewichte keine eigene Aussage (Q14, Q16). SilentCipher: Code MIT, für die Gewichte steht auf drei Seiten keine Lizenz (Q11 bis Q13). **Timbre: Code unter GPL-3.0**, Gewichte ohne Lizenzangabe (Q9). SynthID für Audio: kein Weg für Dritte gefunden (Q19 bis Q21).
6. **Zweite Schicht (Metadaten):** Es bleibt bei dem Vergleich dort. Neu: Die Formatliste von C2PA führt WAV, MP3 und M4A (Q23). Das AWS-Beispiel zeigt, dass Metadaten oft verloren gehen und ein Wasserzeichen mit Register sie zurückholen soll (Q24). Ein Signaturzertifikat und eine Vertrauensliste habe ich nicht gefunden (Abschnitt 7).
7. **Offen:** ob eine Marke über den Lautsprecher des Geräts gefunden wird; ob Timbre lizenzfähig ist; ob es Verfahren gibt, die für Wiedergabe mit neuer Aufnahme gebaut sind (zum Beispiel DeAR, nur als Titel bekannt, nicht gelesen).

## 2. Was ich angenommen habe

- Das Gerät bekommt 16 kHz, mono, 16 Bit. Die Stimme entsteht auf dem Server. Die Marke wird am Server gesetzt, spätestens nach der Wandlung auf 16 kHz.
- Maßstab sind die Anforderungen des Kodex aus [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md), Abschnitte 3.3 und 3.4: zwei Schichten, Robustheit gegen Neukomprimierung, Tonhöhenänderung, Zeitdehnung und Wiedergabe mit neuer Aufnahme (Maßnahme 3.3), kostenloses Erkennungsmittel (Teilmaßnahme 2.1.1). Der Kodex verlangt ein hohes Niveau, soweit technisch machbar, und nennt keine Zahlen (Maßnahme 3.2).
- Gemessen und gehört wird nur von Erwachsenen. Bis zur Rechtsprüfung testen keine Kinder.

## 3. Berichtigungen und Ergänzungen zu `kennzeichnung-sprache.md`

Ich vergleiche mit der Fassung aus Commit 589979e des PR #143 (26.11.2026, 23:41). Die Zeilen 1 bis 7 berichtigen, die Zeilen 8 bis 12 ergänzen.

| Nr. | Stelle dort | Dort (sinngemäß) | Nach den Volltexten | Quelle |
| --- | --- | --- | --- | --- |
| 1 | Abschnitt 1, Satz 1 | Keines der Verfahren sei gegen Wiedergabe über Lautsprecher mit neuer Aufnahme geprüft. | Doch: Die SoK-Arbeit hat neun Verfahren so geprüft, darunter AudioSeal, WavMark und SilentCipher (Abschnitt 4). Nur 5 Proben je Verfahren. | Q1 |
| 2 | Abschnitt 2, Zeile AudioSeal | Lautsprecher: nicht geprüft. | In den dort gelesenen Quellen stimmt das (das AudioSeal-Paper und der Benchmark prüfen es nicht). Die SoK-Arbeit hat es geprüft: nicht bestanden bei 0,5, 2,5 und 5 m; Erkennungsrate 0,07 bis 4,36 Prozent. | Q1, Q4, Q22 |
| 3 | Abschnitt 2, Zeile WavMark | Lautsprecher: nicht geprüft. | Geprüft: besteht bei 0,5 m (Erkennungsrate 100 Prozent), auch mit anderem Mikrofon und anderem Lautsprecher; ab 2,5 m nicht (0 Prozent). | Q1 |
| 4 | Abschnitt 2, Zeile SilentCipher | Lautsprecher: nicht geprüft. | Geprüft: nicht bestanden. Erkennungsrate höchstens 29,9 Prozent (anderes Mikrofon), sonst unter 9 Prozent. | Q1 |
| 5 | Abschnitt 4, Zeile Lautsprecher und neue Aufnahme | In keiner Quelle geprüft; offen; eigener Test nötig. | Dünn geprüft (Abschnitt 4). Der eigene Test bleibt nötig und entscheidet über die Wahl (Abschnitt 9). | Q1 |
| 6 | Abschnitt 7, zweiter Punkt | Keine Quelle prüfe die Wiedergabe über Lautsprecher mit neuer Aufnahme; offen. | Offen bleibt, ob eine Marke über den Lautsprecher des Geräts gefunden wird (deutsche Sätze, 16 kHz, Pi oder ESP32). | Q1 |
| 7 | Arbeitsliste, Punkt N1126-2323-h | Keine gelesene Quelle prüfe Wasserzeichen nach Wiedergabe über Lautsprecher; Prio 3. | Der Satz stimmt nicht (Zeile 1). Vorschlag: Prio 2, Aufbau nach Abschnitt 8. | Q1 |
| 8 | Abschnitt 3.3, SilentCipher | 32 Bit Nutzlast. | Die GitHub-Seite und der Benchmark nennen 40 Bit (fünf 8-Bit-Zeichen). Das Paper hat der andere Lauf gelesen, ich nicht. Nicht geklärt. | Q11, Q22 |
| 9 | Abschnitt 3.2, WavMark | MP3 gut. | Uneinheitlich: Das WavMark-Paper und eine Fremdmessung sagen gut. Die SoK-Arbeit und AudioMarkBench sagen schlecht (Abschnitt 5). | Q8, Q2, Q1, Q3 |
| 10 | Abschnitt 3.1 und 4, AudioSeal | Tempo bis 1,25 gut. | Uneinheitlich: Die SoK-Arbeit sieht bei Zeitdehnung kein Bestehen (Abschnitt 5). | Q4, Q1 |
| 11 | Abschnitt 3.4, C2PA | Ob Schreiben für WAV erlaubt ist, stehe nicht dort; offen. | Bleibt offen. Die Formatliste vermerkt nur bei PDF, dass man nur lesen kann, nicht bei WAV, MP3 und M4A. Das ist kein Beleg (Einschätzung: spricht dafür). | Q23 |
| 12 | Abschnitt 3.3, SilentCipher | Lizenz der Gewichte offen. | Bestätigt und enger gefasst: Auf drei Seiten keine Lizenzangabe für die Gewichte; die Modellkarte hat kein Lizenzfeld; das Paket ist nur 27,2 kB groß und enthält keine Gewichte. | Q11, Q12, Q13 |

## 4. Der Lautsprecher-Test der SoK-Arbeit

**Aufbau.** Die Arbeit (Q1) baut neun Wasserzeichen-Verfahren mit offenem Code nach: fünf mit neuronalen Netzen (WavMark, AudioSeal, Timbre, RobustDNN, SilentCipher) und vier klassische (audiowmark, Norm-space, Patchwork, FSVC). Sie prüft 22 Angriffe in 109 Einstellungen mit über 200.000 markierten Tönen. Die Daten sind englische Sprache (LJSpeech, LibriSpeech) und Gesang. Der Angreifer kennt das Verfahren nicht.

Für die Wiedergabe (Abschnitt VII-E der Arbeit) wurde ein echter Lautsprecher abgespielt und mit einem echten Mikrofon neu aufgenommen, nichts simuliert. Je Verfahren gab es **nur 5 markierte Proben**. Die Abstände waren 0,5 m, 2,5 m und 5 m, mit dem eingebauten Lautsprecher und Mikrofon eines Laptops. Beim Gerätewechsel (0,5 m) kam einmal ein anderes USB-Mikrofon und einmal ein anderer Lautsprecher zum Einsatz. „j“ unten heißt: Bit-Genauigkeit über 0,8.

**Ergebnis, Bit-Genauigkeit (Tabelle V der Arbeit):**

| Verfahren | 0,5 m | 2,5 m | 5 m | anderes Mikrofon | anderer Lautsprecher |
| --- | --- | --- | --- | --- | --- |
| WavMark | j | n | n | j | j |
| Timbre | j | j | n | j | j |
| Patchwork | j | n | n | n | n |
| AudioSeal | n | n | n | n | n |
| SilentCipher | n | n | n | n | n |
| RobustDNN, audiowmark, Norm-space, FSVC | n | n | n | n | n |

**Ergebnis, Erkennungsrate in Prozent (Tabelle VI, nur vier Verfahren):**

| Verfahren | 0,5 m | anderes Mikrofon | anderer Lautsprecher | 2,5 m | 5 m |
| --- | --- | --- | --- | --- | --- |
| WavMark | 100 | 100 | 100 | 0 | 0 |
| AudioSeal | 0,07 | 0,24 | 0,02 | 1,25 | 4,36 |
| SilentCipher | 8,98 | 29,90 | 0 | 8,57 | 0 |
| audiowmark | 0 | 0 | 0 | 0 | 0 |

Nach dem Text der Arbeit fällt die Genauigkeit der meisten Verfahren ab 2,5 m unter 0,6, teils auf etwa 0,4 oder tiefer (Q1).

**Grenzen der Messung.**

- Nur 5 Proben je Verfahren und ein Gerät mit zwei Wechseln. Englische Sprache und Gesang, keine Kinderstimmen. Raum, Lautstärke und Störgeräusche stehen nicht in dem, was ich gelesen habe (Q1).
- Der Text widerspricht sich in einem Punkt: Eine Kernaussage nennt nur WavMark und Timbre als Ausnahmen, Tabelle V zeigt auch Patchwork bei 0,5 m (Q1).
- Die Autoren sagen selbst, der Gerätewechsel sage wenig, weil viele Verfahren schon im Standardaufbau scheitern (Q1).
- Es ist ein Vorabdruck. Ob er begutachtet wurde, habe ich nicht geprüft.
- Das AudioSeal-Paper selbst prüft die Wiedergabe nicht (Q4). Es ist also keine Gegenmessung, sondern eine Lücke dort.

**Einschätzung.**

- Die Arbeit empfiehlt, beim Training viele Angriffsarten zu berücksichtigen, auch physische (Q1). Das legt nahe, dass die geprüften Verfahren dafür nicht gebaut sind. Das sagt die Arbeit nicht ausdrücklich.
- Ob die Ergebnisse auf den kleinen Lautsprecher des Geräts übertragbar sind, ist offen. Das gilt in beide Richtungen.
- Ein Abstand von 0,5 m ist für eine Aufnahme mit dem Handy bei einem Spielzeug nicht unrealistisch. Ob 2,5 m nötig ist, ist offen.
- Kein gefundenes Verfahren erfüllt die Robustheit aus Maßnahme 3.3 des Kodex über alle genannten Veränderungen. Ob ein einzelnes Verfahren mit bekannten Lücken reicht, weil der Kodex ein hohes Niveau nur soweit technisch machbar verlangt, ist offen. Das ist keine Frage, die ich beantworte.

## 5. Weitere Befunde zur Robustheit

| Veränderung | Befund | Quelle |
| --- | --- | --- |
| Tonhöhe | Alle neun Verfahren der SoK-Arbeit scheitern (Genauigkeit unter 0,6 bei guter Tonqualität). Bei plus oder minus einem Halbton: WavMark 0,00, MaskMark 1,00. Die Autoren setzen Geschwindigkeitsänderung gegen Timbre, WavMark und AudioSeal ein. Im Kombinationstest des Benchmarks überlebte nichts Tonhöhe, Tempo oder Speed. | Q1, Q2, Q22 |
| Zeitdehnung, Tempo | Uneinheitlich. AudioSeal-Paper: 0,99 bei Tempo ×1,25 (ob die Tonhöhe mitwandert, steht nicht dort). AudioMarkBench: Dehnung von 0,7 bis 1,5 wirkt kaum (Zahlen nur in Bildern). SoK-Arbeit: AudioSeal besteht weder mild noch mäßig; Timbre und Patchwork beides; WavMark nur mild. Q2: Geschwindigkeit bringt Timbre auf 0,27 und WavMark auf 0,00. WavMark-Paper: Tempo ×1,1 und ×0,9 mit 4,65 Prozent Bitfehlern bei 1-s-Stücken. | Q4, Q3, Q1, Q2, Q8 |
| MP3, AAC | Uneinheitlich. AudioSeal 1,00 bei MP3 32 kbps und AAC 64 kbps (Q4). Nach MP3 128 Bit-Genauigkeit 0,997 (AudioSeal) und 1,000 (WavMark) (Q22). WavMark-Paper: 1,19 Prozent Bitfehler bei MP3 64 kbps (Q8). Timbre: ab 32 kbps 1,0000, bei 8 kbps 0,9186 (Q10). Dagegen: SoK-Arbeit: WavMark besteht MP3 nicht, AudioSeal und Timbre bestehen (Q1). AudioMarkBench: MP3 löscht die Marke von WavMark ohne Qualitätsverlust (Q3). | Q4, Q22, Q8, Q10, Q1, Q3 |
| Abtastratenwandlung | AudioSeal 1,00 (über 32 kHz und zurück, Q4); Basismodell 0,999 beim Rundlauf über 8 kHz, die Streaming-Fassung 0,505, das ist Zufall (Q22). WavMark-Paper: 1,58 Prozent Bitfehler (Q8). Timbre: bei 16 kHz 1,0000, bei 8 kHz 0,9940 (Q10). | Q4, Q22, Q8, Q10 |
| Neuronale Codecs, Entrauscher, Opus | AudioSeal 1,00 bei DAC, ESC und Encodec, aber 0,00 bis 0,01 bei SpeechTokenizer, FACodec, TiCodec, Encodec-VoiceCraft und SpectralCodec; Entrauscher 0,02 bis 0,04. WavMark 0,00 bei allen acht neuronalen Codecs (Q2). Opus: AudioSeal und WavMark 1,00 bei 24 kbps (Q2), dagegen Opus, EnCodec und SoundStream lassen die Fehlerrate stark steigen (Q3). | Q2, Q3 |
| Neu erzeugte Sprache | Stimmumwandlung und Synthese mit fremden Modellen drücken die Bit-Genauigkeit auf etwa 50 Prozent (Zufall). Nur Timbre besteht, wenn das Synthesemodell mit markierten Daten trainiert wurde (Q1). Vocoder: Timbre und MaskMark 1,00 bei BigVGAN, BigVGAN2 und Vocos; WavMark 0,00 bei allen fünf; AudioSeal 0,00 bis 0,01 bei DiffWave (Q2). AudioSeal-Paper: erkennt auch neu synthetisierte Teile (HiFi-GAN) (Q4). | Q1, Q2, Q4 |
| Gezielte Angriffe | Mit Zugriff auf den Detektor steigt der Erkennungsfehler von AudioSeal um etwa 80 Prozent bei guter Qualität; die Autoren halten die Detektor-Gewichte geheim (Q4). AudioMarkBench: Mit Zugriff auf das Verfahren erreicht die Fehlerrate 1 bei allen Verfahren; ohne Zugriff braucht es viele Anfragen (Q3). Q2: Entfernen ohne Kenntnis des Verfahrens, mit fertigen Modellen und geringem Qualitätsverlust. | Q4, Q3, Q2 |

**Einschätzung.** Wer die Marke gezielt entfernen will, schafft das bei allen geprüften Verfahren. Der Kodex verlangt Widerstand gegen böswillige Angriffe (Maßnahme 3.3). Auch das ist mit offenen Verfahren heute nicht voll zu erfüllen. Die Marke bleibt ein Nachweismittel und kein Siegel, wie im Vergleich dort. Bei neu erzeugter Sprache zählt das für Kunibert nur, wenn jemand die Stimme absichtlich neu erzeugen lässt.

## 6. Lizenz und Erkennung je Verfahren

| Verfahren | Code | Gewichte | Abtastrate, Nutzlast | Erkennungsmittel | Stand |
| --- | --- | --- | --- | --- | --- |
| AudioSeal | MIT (Q5) | MIT; seit 02.04.2024 sind laut README damit auch kommerzielle Anwendungen möglich (Q5) | 16 kHz als Basis; 16 Bit optional (Q5) | lokal im Paket (Python); kein Online-Dienst genannt (Q5) | PyPI 0.2.1 vom 03.11.2026 (Q5) |
| WavMark | MIT (Q6) | Die Modellseite nennt MIT (Q7). Eine eigene Aussage nur für die Gewichte, ihre Herkunft bei `load_model` und kommerzielle Nutzung stehen nicht dort (Q6, Q7, Q8) | nur 16 kHz, mono; 32 Bit je Sekunde, im Paket 16 Bit feste Kennung und 16 Bit Nutzlast (Q6, Q8) | lokal (Q6); eine Online-Demo gibt es (nicht geöffnet) | PyPI 0.0.3 vom 07.01.2024 (Q6) |
| Timbre | GPL-3.0 (Q9) | keine Lizenzangabe; die README verweist auf einen Google-Drive-Ordner mit Parametern des Stimmklon-Modells (nicht geöffnet) (Q9) | 22,05 kHz, mono; 10 Bit als Standard (Q10) | lokal mit dem Code (Q9) | 26 Commits, kein Release (Q9) |
| SilentCipher | MIT (Q11, Q13) | keine Lizenzangabe gefunden: Modellkarte ohne Lizenzfeld (Q12); Paket mit 27,2 kB ohne Gewichte (Q13) | Modelle für 44,1 kHz und 16 kHz; 40 Bit (Q11) | lokal (Q11) | PyPI 1.0.5 vom 18.06.2024 (Q13) |
| Perth | MIT (Q14, Q16) | keine eigene Aussage; der Benchmark nennt MIT (Q22); ob Gewichte im Paket liegen, steht nicht dort (Q14) | Abtastrate nicht angegeben; ein Nutzer nennt 32 kHz als Standard, nicht am Code geprüft (Q15); Nutzlast nicht angegeben | lokal im Paket (Q16); der Hersteller bietet einen Dienst mit Schlüssel an, Preise nicht gefunden (Q17, Q18) | PyPI 1.0.1 vom 23.05.2025 (Q16) |
| SynthID (Audio) | kein Code für Audio; quelloffen ist laut Google nur das Text-Wasserzeichen (Q21) | nicht zutreffend | nicht zutreffend | öffentlicher Detektor SynthID.com: Datei hochladen, Prüfung gegen die Partner (Q19) | Ein Weg für Dritte, SynthID in Audio einzubauen, steht auf keiner der drei Seiten (Q19, Q20, Q21). ElevenLabs bettet es in eigene Ausgaben ein (Q20). |

Der Benchmark (Q22) nennt AudioSeal und WavMark mit MIT für Code und Gewichte und SilentCipher mit MIT für den Code, ohne Lizenzangabe für die Gewichte. Das passt zu meinen Funden.

**Einschätzung.**

- Für ein verkauftes Gerät genügt eine Lizenz für den Code nicht, wenn die Gewichte anderen Bedingungen unterliegen oder gar keine Lizenz nennen. Das betrifft Perth, SilentCipher und Timbre.
- Zu Timbre: GPL-3.0 ist eine Copyleft-Lizenz. Ob sie bei einem Dienst, der auf dem eigenen Server läuft, Pflichten auslöst, ist offen. Das ist eine Rechtsfrage, die ich nicht beantworte. Die Gewichte stehen nur hinter einem Link, den ich nicht geöffnet habe.
- Zu Perth: Ein Fehlerbericht zeigt bei 44,1 kHz Eingang, dass die Energie über etwa 16,8 kHz um rund 94 Prozent sinkt; ob man das hört, steht dort nicht (Q15). Für ein Gerät mit 16 kHz ist das kaum von Belang. Perth ist laut Hersteller für Musik und Sprache gedacht; Zahlen zur Robustheit nennt der Hersteller nur ohne Testaufbau (Q17, Q18). Ich stufe Perth deshalb als Kandidat zweiter Reihe ein.
- Die Seiten von Resemble nennen Art. 50 mehrfach (Q18). Die Aussagen hängen an der Firmenlösung und nicht an der offenen Bibliothek. Der EU-Kodex wird dort nicht genannt.

## 7. Zweite Schicht und Ton-Strom (C2PA)

- **Bibliothek:** c2pa-rs steht unter MIT und Apache 2.0 (Doppellizenz), ist aber eine Beta-Fassung (0.92.3). Sie erstellt und signiert Manifeste und bettet sie in unterstützte Formate ein (Q25).
- **Formate:** Die Liste der unterstützten Formate führt WAV, MP3 und M4A. FLAC steht nicht darin. Nur bei PDF ist vermerkt, dass man nur lesen kann (Q23).
- **Verlust:** Das Manifest geht oft verloren, wenn Transcoder Metadaten nicht durchreichen (Q24).
- **Wasserzeichen als Rückweg:** Im AWS-Beispiel trägt ein 16-Bit-Wasserzeichen nur einen Schlüssel für ein Register. Die vollen Angaben stehen im signierten Manifest und im Register. Fehlt das Manifest, führt das Wasserzeichen zurück. Als Rückfall dient ein Fingerabdruck mit geringerer Sicherheit. Die Fehlerrate von höchstens 4 Prozent nach MP3 und AAC ist dort ein Entwicklungsziel, kein gemessener Wert (Q24). Der Benchmark beschreibt dasselbe Muster als Soft Binding und mahnt, einen Treffer nur als Hinweis auf ein mögliches Manifest zu zeigen (Q22).
- **Nicht gefunden:** Signaturzertifikate, Vertrauensliste, selbst signierte Zertifikate und ihre Anzeige beim Prüfer, Kosten, die Art der Einbettung in WAV (Q23, Q24, Q25).

**Einschätzung.**

- Der Ton-Strom zum Gerät besteht aus Rohton. Er trägt keine Metadaten. Die zweite Schicht gilt also für Dateien, Exporte und Protokolle, nicht für den Strom, wie im Vergleich dort.
- Ein Register nach dem AWS-Muster speichert je Ton einen Hash und die Signaturdaten. Es darf keine Äußerungen, Antworttexte, Geräte-IDs oder Tokens enthalten (Regel in `CLAUDE.md`). Das ist machbar, braucht aber einen Test.

## 8. Aufbau der Messung am Pi (Vorschlag für N1126-2323-h)

Das ist ein Vorschlag (Einschätzung). Er ersetzt den Auftrag im Punkt nicht, er füllt ihn aus. Nur Erwachsene sprechen und hören. Es gibt keine Kinderstimmen und keine Äußerungen oder Antworttexte im Protokoll.

1. **Material:** Feste deutsche Beispielsätze, die ein Erwachsener vorbereitet (nichts aus dem Betrieb). Erzeugt mit den Stimmen, die Kunibert benutzt, je 5 bis 15 Sekunden lang. Mindestens 30 markierte und 30 unmarkierte Töne je Verfahren, damit sich Fehlerraten überhaupt angeben lassen. Die SoK-Arbeit hatte 5. Markiert wird nach der letzten Wandlung auf 16 kHz, mono, 16 Bit, wie am Gerät.
2. **Aufbau:** Pi mit dem echten Lautsprecher des Prototyps, in Betriebslautstärke. Aufnahme mit einem Smartphone (Sprachmemo; es speichert meist verlustbehaftet, Einschätzung) und mit einem einfachen USB-Mikrofon. Abstände 0,3 m, 0,5 m, 1 m und 2 m. Ein ruhiger Raum und ein Raum mit Hintergrundgeräusch.
3. **Messen:** Bit-Genauigkeit (Schwelle über 0,8 wie in der SoK-Arbeit, damit die Zahlen vergleichbar bleiben), Erkennungsrate und Fehlalarmrate an den unmarkierten Kontrolltönen, je Verfahren, Abstand und Gerät.
4. **Dazu:** Dieselben Töne mit Tonhöhe um 1 und 2 Halbtöne, Tempo 0,9 und 1,1, MP3 mit 128 kbps und AAC mit 96 kbps. So steht belegt da, was die Verfahren nicht überstehen. Der Kodex nennt diese Veränderungen (Maßnahme 3.3).
5. **Ergebnis:** Eine Tabelle je Verfahren, Abstand und Gerät, mit Raum, Lautstärke und Abstand. Lücken benannt. Keine Äußerungen und keine Texte im Protokoll.

## 9. Empfehlung für N1123-1153-b, geändert (vorläufig, Einschätzung, __UHRZEIT__)

1. **Noch kein Verfahren festlegen.** Erst messen: N1126-2323-g (Rechenaufwand, Hörprobe, Wandlung) und N1126-2323-h (Lautsprecher und Mikrofon) zusammen, für AudioSeal und WavMark. Timbre nur dazunehmen, wenn die Lizenzfrage geklärt ist (N1126-2348-b).
2. **Entscheidungsregel:** Besteht AudioSeal die Messung bei 0,5 m, bleibt es bei AudioSeal wie im Vergleich dort. Besteht nur WavMark, wird es WavMark, mit den bekannten Grenzen: nur 16 kHz, langsamer, schwach bei Tempo und Tonhöhe, MP3-Befund uneinheitlich, im Paper belegt die Kennung 10 von 32 Bit (Q8). Besteht keines, wird das Ergebnis offen dokumentiert. Das ist dann ein Restrisiko, das der Betreiber trägt. Die zweite Schicht (signierte Herkunftsangaben mit Register nach dem AWS-Muster) und die Suche nach besser geeigneten Verfahren laufen dann weiter (N1126-2348-c).
3. **Rest wie im Vergleich dort:** Feste 16-Bit-Kennung ohne Personenbezug. Alle Stimmen tragen die Marke (Pocket TTS, Piper, Google, Ersatzsätze, Ansagen). Signierte Herkunftsangaben für gespeicherte oder abgegebene Dateien. Ein freies Prüfskript im Repo mit einer Seite, die erklärt, wie man es benutzt. Ein Test im Repo: Jede Audio-Antwort trägt die Marke, und kein Protokoll enthält Äußerung, Antworttext, Geräte-ID oder Token.
4. **Ehrlich dokumentieren:** Die Marke hält Tonhöhenänderung, neu erzeugter Sprache und gezielten Angriffen nicht stand (Q1 bis Q4). Sie ist ein Nachweismittel, kein Siegel.

## Quellen

Alle Seiten wurden am 26.11.2026 durch Unteragenten (Claude Sonnet) über das Abrufwerkzeug gelesen. Ein Zitat je Quelle, höchstens 15 Wörter, aus den Berichten der Agenten. „Art“ heißt: Vorabdruck (arXiv), Projektseite, Paketseite, Herstellerseite oder Fachpresse.

| Nr. | Quelle | Art und Lesestand | Zitat |
| --- | --- | --- | --- |
| Q1 | SoK: How Robust is Audio Watermarking in Generative AI models? (arXiv 2503.19176, Fassung 2, Datum 27.03.2025), https://arxiv.org/html/2503.19176v2 | Vorabdruck · Wortlaut, ganz (143.159 Zeichen, vier Fenster) | „none of the existing audio watermarking techniques are fully reliable“ |
| Q2 | Deep Audio Watermarks are Shallow: Limitations of Post-hoc Watermarking Techniques for Speech (arXiv 2504.10782, Fassung 1), https://arxiv.org/html/2504.10782v1 | Vorabdruck · Wortlaut, ganz (48.641 Zeichen, zwei Fenster; das zweite nur Literatur) | „DEEP AUDIO WATERMARKS ARE SHALLOW“ |
| Q3 | AudioMarkBench: Benchmarking Robustness of Audio Watermarking (arXiv 2406.06979, Fassung 2, 13.11.2024), https://arxiv.org/html/2406.06979v2 | Vorabdruck · Wortlaut, Zeichen 0 bis 156.824 von 168.026; der Rest (Anhang) nicht gelesen | „FNRs reach 1 for all watermarking methods“ |
| Q4 | AudioSeal: Proactive Detection of Voice Cloning with Localized Watermarking (arXiv 2401.17264, Fassung 2, 06.06.2024), https://arxiv.org/html/2401.17264v2 | Vorabdruck · Wortlaut, ganz (153.821 Zeichen, vier Fenster) | „the detector’s weights should be kept confidential“ |
| Q5 | AudioSeal: README (roh) https://raw.githubusercontent.com/facebookresearch/audioseal/main/README.md und Paketseite https://pypi.org/project/audioseal/ (Version 0.2.1 vom 03.11.2026) | Projektseite und Paketseite · Wortlaut, beide ganz (11.558 und 36.343 Zeichen) | „full MIT license (including the license for the model weights)“ |
| Q6 | WavMark: Paketseite, https://pypi.org/project/wavmark (Version 0.0.3 vom 07.01.2024) | Paketseite · Wortlaut, ganz (25.754 Zeichen) | „MIT License“ |
| Q7 | WavMark: Modellseite auf Hugging Face (README), https://huggingface.co/M4869/WavMark/blame/main/README.md | Projektseite · Wortlaut, ganz (8.651 Zeichen) | „license: mit“ |
| Q8 | WavMark: Watermarking for Audio Generation (arXiv 2308.12770, Fassung 3, 07.01.2024), https://arxiv.org/html/2308.12770v3 | Vorabdruck · Wortlaut, ganz (116.626 Zeichen, drei Fenster) | „We utilized 16kHz audio as hosts.“ |
| Q9 | Timbre Watermarking: Code-Seite auf GitHub, https://github.com/TimbreWatermarking/TimbreWatermarking | Projektseite · Wortlaut, ganz (17.141 Zeichen) | „we provide the complete code for training and testing the watermarking model“ |
| Q10 | Detecting Voice Cloning Attacks via Timbre Watermarking (arXiv 2312.03410, Fassung 1, 06.12.2023; NDSS 2024), https://arxiv.org/html/2312.03410v1 | Vorabdruck · Wortlaut, Zeichen 0 bis 156.956 von 238.712 (66 Prozent); der Rest ungelesen | „embeds watermark information into the target individual’s speech, eventually defeating the voice cloning attacks“ |
| Q11 | SilentCipher: Code-Seite auf GitHub, https://github.com/sony/silentcipher | Projektseite · Wortlaut, ganz (22.620 Zeichen) | „The code in this repository is released under the MIT license“ |
| Q12 | SilentCipher: Modellseite auf Hugging Face, https://huggingface.co/sony/silentcipher | Projektseite · Wortlaut, ganz (13.827 Zeichen) | „YAML Metadata Warning: empty or missing yaml metadata in repo card“ |
| Q13 | SilentCipher: Paketseite, https://pypi.org/project/silentcipher/ (Version 1.0.5 vom 18.06.2024) | Paketseite · Wortlaut, ganz (27.619 Zeichen) | „Artefact free robust high quality audio watermarking“ |
| Q14 | Perth: Code-Seite auf GitHub, https://github.com/resemble-ai/Perth | Projektseite · Wortlaut, ganz (21.711 Zeichen) | „This project is licensed under the MIT License - see the LICENSE file for details.“ |
| Q15 | Perth: Fehlerbericht Nr. 8 auf GitHub, https://github.com/resemble-ai/Perth/issues/8 | Projektseite · Wortlaut, ganz (2.984 Zeichen) | „This has a default: sample_rate=32000“ |
| Q16 | Perth: Paketseite, https://pypi.org/project/resemble-perth/ (Version 1.0.1 vom 23.05.2025) | Paketseite · Wortlaut, ganz (26.356 Zeichen) | „This project is licensed under the MIT License“ |
| Q17 | Resemble AI: Seite zum Modell PerTh, https://resemble.ai/learn/models/perth | Herstellerseite · Wortlaut, ganz (25.069 Zeichen) | „The recovery rate stays near 100% across a typical attack suite“ |
| Q18 | Resemble AI: Produktseite Watermarker, https://www.resemble.ai/products/watermarker | Herstellerseite · Wortlaut, ganz (29.769 Zeichen) | „Built to support EU AI Act Article 50 compliance.“ |
| Q19 | InfoQ: Google SynthID Detector (21.10.2026), https://infoq.com/news/2026/10/synthid-watermarking-detector | Fachpresse · Wortlaut, ganz (30.823 Zeichen) | „extensive modifications can also degrade SynthID's watermark signal, resulting in false negatives“ |
| Q20 | ElevenLabs: Blogbeitrag zu SynthID (Datum nicht gefunden), https://elevenlabs.io/blog/synthid | Herstellerseite · Wortlaut, ganz (4.363 Zeichen) | „survive common audio transformations like compression, clipping, and speed changes“ |
| Q21 | Google: Blogbeitrag zum SynthID Detector (20.05.2025), https://blog.google/technology/ai/google-synthid-ai-content-detector/ | Herstellerseite · Wortlaut, ganz (26.362 Zeichen) | „open sourced SynthID text watermarking, so any developer can build with this technology“ |
| Q22 | Watermarks and Fingerprints as Soft Bindings for Content Provenance (arXiv 2610.04151, Oktober 2026), https://arxiv.org/pdf/2610.04151 | Vorabdruck · Wortlaut, Zeichen 0 bis 156.836 von 199.921 (78 Prozent); der Rest nicht gelesen | „a pointer to a candidate manifest that must be confirmed“ |
| Q23 | Content Authenticity Initiative: Liste der unterstützten Dateiformate, https://opensource.contentauthenticity.org/docs/c2pa-c/docs/supported-formats/ | Projektseite · Wortlaut, ganz (860 Zeichen) | „other libraries in the SDK support the same formats unless noted otherwise“ |
| Q24 | AWS: Building audio provenance for AI-generated content at the source with AWS (27.08.2026), https://aws.amazon.com/blogs/media/building-audio-provenance-for-ai-generated-content-at-the-source-with-aws/ | Herstellerseite · Wortlaut, ganz (39.978 Zeichen) | „The manifest is often dropped by transcoders that don’t implement metadata pass-through.“ |
| Q25 | c2pa-rs: README (Version 0.92.3), https://docs.rs/crate/c2pa/latest/source/README.md | Projektseite · Wortlaut, ganz (13.556 Zeichen) | „both the MIT license and the Apache License (Version 2.0)“ |

## Nicht geprüft

**Grenzen der Methode**

- Ich habe nie einen Rohtext gesehen, nur die Berichte der Lese-Agenten. Zahlen, Zitate und Aussagen wie „steht nicht im Text“ sind nicht am Original gegengelesen. Abbildungen waren nicht lesbar; Zahlen daraus fehlen.
- Kein Ton erzeugt, nichts eingebettet, nichts gemessen, kein Code ausgeführt. Alle Werte stammen aus Quellen.

**Quellen, die nur zum Teil gelesen sind**

- Timbre-Paper (Q10): 66 Prozent. Ungelesen sind der Rest von Abschnitt V (ab Tabelle V), die Diskussion, das Fazit, die Literatur und der Anhang. Das Inhaltsverzeichnis führt dort einen Abschnitt „Extension to the Physical World“. Sein Inhalt ist unbekannt. Er könnte eine Messung über Lautsprecher enthalten.
- Soft-Binding-Benchmark (Q22): 78 Prozent. AudioMarkBench (Q3): die letzten rund 11.000 Zeichen (Teil des Anhangs).
- SoK-Arbeit (Q1): Die Zahlen aus Tabelle V und VI stammen aus dem Bericht des Agenten, nicht aus einem Gegenlesen. Der Text widerspricht sich bei Patchwork (Abschnitt 4).

**Lizenzen und Rechtliches**

- Keine Lizenzdatei gelesen (weder MIT noch GPL-3.0 noch die der Gewichte). Ob Perth, Timbre und SilentCipher ihre Gewichte unter einer Lizenz abgeben, bleibt offen. Die GPL-3.0-Folgen für Timbre sind eine Rechtsfrage.
- Trainingsdaten-Lizenzen aller Verfahren nicht gelesen.
- Die LICENSE-Datei, das Paper und die Releases von SilentCipher nicht gelesen. Das Paper hat der andere Lauf gelesen.
- Die Perth-Seite auf GitHub könnte ein älterer Zwischenspeicher sein (ein Bildlink trägt einen Zeitstempel vom 26.09.2026).

**Offen**

- Ob eine Marke über den Lautsprecher des Geräts gefunden wird (N1126-2323-h).
- Verfahren, die für Wiedergabe mit neuer Aufnahme gebaut sind. DeAR (AAAI 2023) nennt die SoK-Arbeit als Beispiel; ich habe nur den Titel aus der Suche gesehen. Neuere Arbeiten 2025 und 2026: nicht gesucht (N1126-2348-c).
- Bedingungen und Kosten, SynthID für Audio in ein eigenes System einzubauen (nichts angefragt).
- Ob Pocket TTS selbst markiert: bleibt N1126-1153-d.
- Recht: Ein Anwalt war bewusst nicht beteiligt (Restrisiko, festgehalten).

## Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Claude (Lauf Prüfen) | N1126-2323-g und N1126-2323-h zusammen: AudioSeal und WavMark messen, Aufbau nach Abschnitt 8. Vorschlag: N1126-2323-h auf Prio 2 | Server und Pi, nur Erwachsene |
| Claude (Lauf Recherche) | N1126-2348-b (neu): Timbre: Lizenz der Gewichte und GPL-3.0-Lage nur lesen, dazu den Rest des Papers (Anhang zur physischen Welt) | `docs/recherche/kennzeichnung-sprache-nachtrag.md` |
| Claude (Lauf Recherche) | N1126-2348-c (neu): Verfahren suchen, die für Wiedergabe mit neuer Aufnahme gebaut sind (DeAR und neuere Arbeiten): Code, Lizenz, 16 kHz | `docs/recherche/kennzeichnung-sprache-nachtrag.md` |
| Claude (Lauf Recherche) | N1126-2323-i: Rest: Signaturzertifikat und Vertrauensliste für C2PA lesen. Die SilentCipher-Frage ist hier beantwortet: keine Lizenzangabe für die Gewichte gefunden | nur lesen |
| Betreiber | Nur wenn Timbre ernsthaft in Frage kommt: entscheiden, ob die GPL-3.0 tragbar ist. Das ist eine Rechtsfrage. Nichts bestellt, nichts angefragt | im Chat |
