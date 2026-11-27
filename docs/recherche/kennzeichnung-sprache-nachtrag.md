# Kennzeichnung von Sprache: Nachtrag aus den Volltexten

**Stand der Quellen: 26.11.2026, zum Teil erneut gelesen am 27.11.2026** (Abrufe am 26.11. zwischen etwa 21:30 und 23:58 Uhr, am 27.11. zwischen etwa 11:57 und 12:10 Uhr, jeweils durch Unteragenten dieser Läufe; die Zeiten sind geschätzt) · Punkt N1126-2348-a der Arbeitsliste, Nachtrag zu N1126-1153-c ([`kennzeichnung-sprache.md`](kennzeichnung-sprache.md)) · Wochen-Autopilot, Rolle Recherche. Dient N1123-1153-b (Bauen). Es wurde nichts angemeldet, nichts angefragt und nichts abgeschickt.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

**Warum es diesen Nachtrag gibt.** Der Vergleich in [`kennzeichnung-sprache.md`](kennzeichnung-sprache.md) stützt sich nach den eigenen Angaben dort auf Antworten des Abrufwerkzeugs, nicht auf den Wortlaut der Seiten. Ich habe dieselben Quellen und weitere im Wortlaut lesen lassen. Der Vergleich nennt inzwischen die Lautsprecher-Messung der SoK-Arbeit, aber ohne Zahlen und ohne Timbre. Dieser Nachtrag liefert die Zahlen, ergänzt Lizenzen und Befunde, nennt Stellen, an denen die Quellen sich widersprechen, und stellt die Empfehlung für N1123-1153-b unter Vorbehalt. Die Berichtigungen (Abschnitt 3) sind in `kennzeichnung-sprache.md` eingearbeitet.

**So wurde gelesen.** Alle Seiten wurden am 26.11.2026 über die Websuche gefunden und danach durch Unteragenten (Claude Sonnet) gelesen. Die Agenten gaben den Seitentext fensterweise im Wortlaut wieder (Fenster von etwa 40.000 Zeichen, mit etwa 1.000 Zeichen Überlappung) und berichteten danach. Die maschinelle Zusammenfassung, die das Werkzeug anhängt, wurde nicht benutzt. Ich habe nie einen Rohtext gesehen, nur die Berichte. Aussagen wie „steht nicht im Text“ sind also Aussagen von Agenten über lange Texte. Eine Stelle kann übersehen sein. Wie viel von jeder Seite gelesen wurde, steht in der Quellentabelle. Lizenztexte (Dateien LICENSE) habe ich bei keinem Verfahren gelesen, nur das, was die Seiten über die Lizenz sagen.

**Gegengelesen am 27.11.2026.** Der Lauf, der diesen Nachtrag fertig gemacht hat, ließ die wichtigsten Quellen noch einmal lesen, mit anderem Auftrag und durch andere Agenten (Claude Sonnet): die SoK-Arbeit (Q1) ganz, dazu die Seiten zu Lizenz, Abtastrate und Nutzlast von AudioSeal (Paketseite, Q5), WavMark (Paketseite Q6, Dateiliste auf Hugging Face Q26), Timbre (Q9) und SilentCipher (Q11, Q12). Die Adressen kamen aus Websuchen vom selben Tag. Alle Abrufe gingen durch. Die Zeichenzahlen der erneut gelesenen Seiten sind dieselben wie am 26.11. Die Seiten haben sich in der Zwischenzeit also wohl nicht geändert (Einschätzung). Auch dabei habe ich nur Berichte gesehen. Sie bestätigen die Zahlen der SoK-Arbeit und die Lizenzangaben. Sie ändern einzelne Stellen: Die Zahlen der SoK-Arbeit stehen als Text vor. Die Zähleinheit von Tabelle VI ist offen. SilentCipher trägt laut Projektseiten 40 Bit. Die WavMark-Gewichte liegen als Pickle-Dateien vor.

„Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. Im Text stehen keine Zitate, nur in der Quellentabelle (ein Zitat je Quelle, höchstens 15 Wörter, so wie der Agent es wiedergegeben hat, nicht am Original gegengelesen). Sätze aus `kennzeichnung-sprache.md` gebe ich sinngemäß wieder.

## 1. Kurzfassung

**Frage:** Was ändert sich am Vergleich in `kennzeichnung-sprache.md`, wenn man die Quellen im Wortlaut liest?

**Antwort (Einschätzung), sieben Punkte:**

1. **Der Lautsprecher-Test hat jetzt Zahlen.** Der Vergleich dort nennt die Messung der SoK-Arbeit schon, aber ohne Zahlen und ohne Timbre. Die Arbeit hat neun Wasserzeichen-Verfahren mit echtem Lautsprecher und echtem Mikrofon geprüft (Q1, Abschnitt 4). Es sind nur 5 markierte Proben je Verfahren. Die Messung ist dünn, aber sie ist da.
2. **Ergebnis dieser Messung** („bestanden“ heißt: Bit-Genauigkeit über 0,8): AudioSeal und SilentCipher bestehen in keinem Aufbau. WavMark besteht bei 0,5 m, auch mit anderem Mikrofon und anderem Lautsprecher, aber nicht ab 2,5 m. **Timbre besteht bei 0,5 m und bei 2,5 m**, auch mit anderen Geräten, nicht bei 5 m. Patchwork besteht nur im Standardaufbau bei 0,5 m. Bei 5 m besteht keines der neun Verfahren (Q1, Tabelle V).
3. **Folge für die Empfehlung:** AudioSeal passt bei Lizenz, Abtastrate und Erkennungsmittel am besten, wie im Vergleich dort. Über Lautsprecher gibt es aber nur diese eine Messung, und sie ist für AudioSeal negativ (Einschätzung). Die Messung am Pi (N1126-2323-h) wird damit zur Bedingung für die Wahl und nicht erst zur Kontrolle danach. Zu messen sind AudioSeal, WavMark und, wenn die Lizenz es zulässt, Timbre (Abschnitt 9).
4. **Kein Verfahren ist breit robust.** Tonhöhenänderung bricht alle neun Verfahren der Arbeit (Q1, Tabelle V). Neu erzeugte Sprache, neuronale Codecs und Entrauscher löschen die Marken weitgehend (Q1, Q2). Gezielte Angriffe entfernen sie ebenfalls (Q2, Q3, Q4). Bei MP3, Tempo, Hochpass und bei SilentCipher widersprechen sich die Quellen (Abschnitt 3 und 5).
5. **Lizenzen (Abschnitt 6), am 27.11. an den Seiten gegengelesen:** AudioSeal MIT für Code und Gewichte (Q5). WavMark MIT für Paket und Hugging-Face-Seite (Q6, Q26); die gespeicherten Gewichte sind Pickle-Dateien. Perth: Code MIT, für die Gewichte keine eigene Aussage (Q14, Q16; nicht gegengelesen). SilentCipher: Code MIT, für die Gewichte steht auf GitHub und Hugging Face keine Lizenz (Q11, Q12). **Timbre: Code unter GPL-3.0**, Gewichte ohne Lizenzangabe (Q9). SynthID für Audio: kein Weg für Dritte gefunden (Q19 bis Q21).
6. **Zweite Schicht (Metadaten):** Es bleibt bei dem Vergleich dort. Neu: Die Formatliste von C2PA führt WAV, MP3 und M4A (Q23). Das AWS-Beispiel zeigt, dass Metadaten oft verloren gehen und ein Wasserzeichen mit Register sie zurückholen soll (Q24). Ein Signaturzertifikat und eine Vertrauensliste habe ich nicht gefunden (Abschnitt 7).
7. **Offen:** ob eine Marke über den Lautsprecher des Geräts gefunden wird; ob Timbre lizenzfähig ist; ob es Verfahren gibt, die für Wiedergabe mit neuer Aufnahme gebaut sind (zum Beispiel DeAR: die SoK-Arbeit beschreibt es so, hat es aber nicht getestet; sonst nur als Titel bekannt, nicht gelesen).

## 2. Was ich angenommen habe

- Das Gerät bekommt 16 kHz, mono, 16 Bit. Die Stimme entsteht auf dem Server. Die Marke wird am Server gesetzt, spätestens nach der Wandlung auf 16 kHz.
- Maßstab sind die Anforderungen des Kodex aus [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md), Abschnitte 3.3 und 3.4: zwei Schichten, Robustheit gegen Neukomprimierung, Tonhöhenänderung, Zeitdehnung und Wiedergabe mit neuer Aufnahme (Maßnahme 3.3), kostenloses Erkennungsmittel (Teilmaßnahme 2.1.1). Der Kodex verlangt ein hohes Niveau, soweit technisch machbar, und nennt keine Zahlen (Maßnahme 3.2).
- Gemessen und gehört wird nur von Erwachsenen. Bis zur Rechtsprüfung testen keine Kinder.

## 3. Berichtigungen und Ergänzungen zu `kennzeichnung-sprache.md`

Ich vergleiche mit der Fassung auf `main` nach PR #143 (Stand dort 26.11.2026, 23:45; gemergt am 27.11.2026, 00:01, Merge-Commit 1cd8621). Die Berichtigungen sind mit diesem PR in `kennzeichnung-sprache.md` eingearbeitet. Dort steht an jeder Stelle „Nachtrag Nr. …“ mit der Nummer aus dieser Tabelle. Die Q-Nummern in diesem Nachtrag sind eigene (Abschnitt „Quellen“). In `kennzeichnung-sprache.md` heißt die SoK-Arbeit Q13.

| Nr. | Stelle dort | Dort (sinngemäß) | Nach den Volltexten | Quelle |
| --- | --- | --- | --- | --- |
| 1 | Abschnitt 1, Punkt 1; Abschnitte 2 und 4 | AudioSeal fällt in der SoK-Messung durch, WavMark hält nur aus 0,5 m. | Bestätigt, jetzt mit Zahlen (Abschnitt 4). Ergänzt: Timbre besteht bis 2,5 m, nicht bei 5 m. Patchwork besteht nur im Standardaufbau. Bei 5 m besteht keines der neun Verfahren. Nur 5 Proben je Verfahren. | Q1 |
| 2 | Abschnitt 5, Punkt 1 | Timbre und audiowmark nicht verglichen (nur in der SoK-Arbeit genannt, Lizenz nicht gelesen). | Timbre: besteht den Lautsprecher-Test bis 2,5 m; Code unter GPL-3.0, Gewichte ohne Lizenzangabe (Abschnitt 6). audiowmark: besteht keinen Aufbau, Erkennungsrate 0 Prozent. | Q1, Q9 |
| 3 | Abschnitt 6 (Zeile der SoK-Arbeit), Abschnitt 7 (Lautsprecher-Wiedergabe) | Die Zahlen stünden in einem Bild; nur der Text des Werkzeugs gelesen; erste 100.000 Zeichen. | Die Zahlen stehen als Text vor: Tabelle V im Hauptteil (Haken und Kreuze), Tabelle VI im Anhang D (Erkennungsrate in Prozent). Beide sind gelesen. Nur Abbildung 9 (Bit-Genauigkeit je Abstand und Gerät) ist ein Bild und nicht gelesen. Die Seite wurde ganz gelesen (143.159 Zeichen; der Vergleich dort nennt 143.197, der Grund der Abweichung ist offen). | Q1 |
| 4 | Abschnitte 2, 3.1 und 4 (AudioSeal) | Geschwindigkeit 1,25 gut (laut AudioSeal-Paper, Art offen). | Uneinheitlich. In Tabelle V besteht AudioSeal Zeitdehnung weder leicht noch mittel. | Q1, Q4 |
| 5 | Abschnitte 2 und 3.1 (AudioSeal) | Hochpass schwach (Wert 0,61 laut AudioSeal-Paper). | Uneinheitlich. In Tabelle V besteht AudioSeal Hochpass leicht und mittel. | Q1, Q4 |
| 6 | Abschnitte 2 und 3.2 (WavMark) | MP3 gut. | Uneinheitlich. In Tabelle V besteht WavMark MP3 nicht (leicht und mittel). AudioMarkBench sagt ebenfalls schlecht. Das WavMark-Paper und der Benchmark Q22 sagen gut (Abschnitt 5). | Q1, Q3, Q8, Q22 |
| 7 | Abschnitte 2 und 3.3 (SilentCipher) | Viele Angriffe gut (laut SilentCipher-Paper). | In der unabhängigen Messung der SoK-Arbeit besteht SilentCipher nur Hintergrundgeräusch, Tiefpass und Abtastratenwandlung (jeweils nur leicht) und Hochpass (leicht und mittel). Rauschen, Bitcrush, MP3, Zeitdehnung, Tonhöhe, Ausschnitte und Lautsprecher: nicht bestanden. Das SilentCipher-Paper habe ich nicht gelesen. | Q1 |
| 8 | Abschnitt 3.3 (SilentCipher) | 32 Bit Nutzlast (laut SilentCipher-Paper). | Die Projektseiten (GitHub, Hugging Face) nennen 40 Bit, fünf 8-Bit-Zeichen. Das Paper hat der andere Lauf gelesen, ich nicht. Der Widerspruch bleibt offen. Er ändert die Empfehlung nicht. | Q11, Q12 |
| 9 | Abschnitte 2 und 3.3 (SilentCipher) | Gewichte ohne genannte Lizenz. | Bestätigt, enger gefasst. Die Modellkarte auf Hugging Face hat kein Lizenzfeld, aber einen Abschnitt „License“ mit dem Satz aus dem GitHub-README, und der nennt nur den Code. Das Paket (27,2 kB) enthält keine Gewichte. Die Gewichte liegen laut README bei den Releases auf GitHub und auf Hugging Face; das Standard-Laden geht über Hugging Face. LICENSE-Dateien, Releases und der Ordner „Models“ sind ungelesen. | Q11, Q12, Q13 |
| 10 | Abschnitte 2 und 3.2 (WavMark) | MIT; für die Gewichte nur laut Benchmark-Paper MIT. | Die Paketseite nennt MIT in den Metadaten. Die Hugging-Face-Seite der Gewichte zeigt „License: mit“. Eine Aussage nur zu den gespeicherten Gewichten und ihre Herkunft bei `load_model` stehen weiter nirgends. Neu: Dort liegen zwei Pickle-Dateien (10 MB und 30,1 MB). Nur für die erste zeigt die Seite „Safe“ (Abschnitt 6). | Q6, Q7, Q26 |
| 11 | Abschnitt 3.4 (C2PA) | Ob WAV geschrieben werden darf, ist offen. | Bleibt offen. Kein neuer Beleg. | Q23 |

## 4. Der Lautsprecher-Test der SoK-Arbeit

**Aufbau.** Die Arbeit (Q1) baut neun Wasserzeichen-Verfahren mit offenem Code nach: fünf mit neuronalen Netzen (WavMark, AudioSeal, Timbre, RobustDNN, SilentCipher) und vier klassische (audiowmark, Norm-space, Patchwork, FSVC). Sie prüft 22 Angriffe in 109 Einstellungen. Nach der Einleitung sind es über 200.000 angegriffene Töne; dazu gehört das Training von 35 Modellen für Stimmumwandlung und Sprachsynthese. Die Daten sind LibriSpeech (gelesenes Englisch, 200 Ausschnitte), LJSpeech (ein Sprecher, 2.000 von 13.100 Ausschnitten) und M4Singer (Gesang, 2.000 Ausschnitte). Deutsche Sprache und Kinderstimmen kommen im gelesenen Text nicht vor. Nach dem Bericht vom 26.11. kennt der Angreifer das Verfahren nicht (nicht gegengelesen).

Für die Wiedergabe (Abschnitt VII-E der Arbeit) wurde ein echter Lautsprecher abgespielt und mit einem echten Mikrofon neu aufgenommen, nichts simuliert. Je Verfahren gab es **nur 5 markierte Proben**. Es gab fünf Aufbauten (Tabelle III der Arbeit):

| Aufbau | Abstand | Mikrofon | Lautsprecher |
| --- | --- | --- | --- |
| Standard | 0,5 m | eingebaut (MacBook Pro) | eingebaut (MacBook Pro) |
| Abstand 2,5 m | 2,5 m | eingebaut (MacBook Pro) | eingebaut (MacBook Pro) |
| Abstand 5 m | 5 m | eingebaut (MacBook Pro) | eingebaut (MacBook Pro) |
| anderes Mikrofon | 0,5 m | USB-Mikrofon (HyperX) | eingebaut (MacBook Pro) |
| anderer Lautsprecher | 0,5 m | eingebaut (MacBook Pro) | Logitech Z130 |

**Ergebnis: bestanden (j) oder nicht (n)** (Tabelle V der Arbeit; „bestanden“ heißt Bit-Genauigkeit über 0,8, Anhang E der Arbeit). Die Bit-Genauigkeiten selbst stehen nur in Abbildung 9, einem Bild, das nicht gelesen wurde.

| Verfahren | 0,5 m | 2,5 m | 5 m | anderes Mikrofon | anderer Lautsprecher |
| --- | --- | --- | --- | --- | --- |
| WavMark | j | n | n | j | j |
| Timbre | j | j | n | j | j |
| Patchwork | j | n | n | n | n |
| AudioSeal | n | n | n | n | n |
| SilentCipher | n | n | n | n | n |
| RobustDNN, audiowmark, Norm-space, FSVC | n | n | n | n | n |

**Ergebnis: Erkennungsrate in Prozent** (Tabelle VI der Arbeit, Anhang D; nur vier Verfahren haben dort eine Erkennungswahrscheinlichkeit):

| Verfahren | 0,5 m | anderes Mikrofon | anderer Lautsprecher | 2,5 m | 5 m |
| --- | --- | --- | --- | --- | --- |
| WavMark | 100 | 100 | 100 | 0 | 0 |
| AudioSeal | 0,07 | 0,24 | 0,02 | 1,25 | 4,36 |
| SilentCipher | 8,98 | 29,90 | 0 | 8,57 | 0 |
| audiowmark | 0 | 0 | 0 | 0 | 0 |

Die Zähleinheit von Tabelle VI steht nicht im gelesenen Text. Die Arbeit beschreibt die Messgröße als Wahrscheinlichkeit, bei der erkannte Marken als 1 und nicht erkannte als 0 zählen (Abschnitt VII-A). Bei 5 Proben wären nur Vielfache von 20 Prozent möglich. Werte wie 0,07 oder 8,98 passen dazu nicht. Vermutlich werden Abschnitte je Ton gezählt (Einschätzung, nicht belegt). Die Prozentwerte sind deshalb nur als Rangfolge zu lesen, nicht als Fehlerrate (Einschätzung).

Nach dem Text der Arbeit fällt die Genauigkeit der meisten Verfahren ab 2,5 m unter 0,6, teils auf etwa 0,4 oder tiefer (Q1).

**Grenzen der Messung.**

- Nur 5 Proben je Verfahren und ein Aufbau mit zwei Wechseln (Mikrofon, Lautsprecher). Englische Sprache und Gesang, keine Kinderstimmen. Raum, Lautstärke, Störgeräusche, Abtastrate, Länge der Töne und Zahl der Wiederholungen stehen nicht in dem, was gelesen wurde (Q1).
- Der Text widerspricht sich an zwei Stellen. Eine Kernaussage nennt nur WavMark und Timbre als Ausnahmen, Tabelle V zeigt auch Patchwork bei 0,5 m. Eine andere sagt, Timbre halte alle Angriffe außer Tonhöhe ab; Tabelle V zeigt für Timbre auch Kreuze bei mittlerem Rauschen, bei 5 m und bei den Stimmumwandlungen (Q1). Die Tabelle ist die genauere Quelle (Einschätzung).
- Die Autoren sagen selbst, der Gerätewechsel sage wenig, weil viele Verfahren schon im Standardaufbau scheitern (Q1).
- Es ist ein Vorabdruck auf arXiv (Fassung 2 vom 27.03.2025). Tagung oder Zeitschrift stehen nicht im Text. Ob er begutachtet wurde, ist unbekannt.
- Das AudioSeal-Paper selbst prüft die Wiedergabe nicht (Q4). Es ist also keine Gegenmessung, sondern eine Lücke dort.

**Einschätzung.**

- Die Arbeit empfiehlt, beim Training viele Angriffsarten zu berücksichtigen, auch physische (Q1). Das legt nahe, dass die geprüften Verfahren dafür nicht gebaut sind. Das sagt die Arbeit nicht ausdrücklich.
- Ob die Ergebnisse auf den kleinen Lautsprecher des Geräts übertragbar sind, ist offen. Das gilt in beide Richtungen.
- Ein Abstand von 0,5 m ist für eine Aufnahme mit dem Handy bei einem Spielzeug nicht unrealistisch. Ob 2,5 m nötig ist, ist offen.
- Kein gefundenes Verfahren erfüllt die Robustheit aus Maßnahme 3.3 des Kodex über alle genannten Veränderungen. Ob ein einzelnes Verfahren mit bekannten Lücken reicht, weil der Kodex ein hohes Niveau nur soweit technisch machbar verlangt, ist offen. Das ist keine Frage, die ich beantworte.

## 5. Weitere Befunde zur Robustheit

Zeilen mit „Tabelle V“ sind am 27.11. gegengelesen (Q1). Die übrigen Angaben stammen aus den Berichten vom 26.11. und sind nicht gegengelesen (Q2, Q3, Q4, Q8, Q10, Q22).

| Veränderung | Befund | Quelle |
| --- | --- | --- |
| Tonhöhe | Tabelle V: Alle neun Verfahren der SoK-Arbeit scheitern schon beim leichten Angriff; die Arbeit nennt dafür eine Genauigkeit unter 0,6 bei guter Tonqualität. Bei plus oder minus einem Halbton: WavMark 0,00, MaskMark 1,00. Die Autoren setzen Geschwindigkeitsänderung gegen Timbre, WavMark und AudioSeal ein. Im Kombinationstest des Benchmarks überlebte nichts Tonhöhe, Tempo oder Speed. | Q1, Q2, Q22 |
| Zeitdehnung, Tempo | Uneinheitlich. AudioSeal-Paper: 0,99 bei Tempo ×1,25 (ob die Tonhöhe mitwandert, steht nicht dort). AudioMarkBench: Dehnung von 0,7 bis 1,5 wirkt kaum (Zahlen nur in Bildern). SoK-Arbeit, Tabelle V: AudioSeal besteht weder mild noch mäßig; Timbre und Patchwork beides; WavMark nur mild. Der Anhang C der SoK-Arbeit nennt für Timbre, WavMark und Patchwork 0,8 bis 1,0 bei Dehnfaktoren von 0,5 bis 1,5 und für SilentCipher und FSVC unter 0,6; AudioSeal steht dort nicht. Bei WavMark passt der Anhang nicht zu Tabelle V. Q2: Geschwindigkeit bringt Timbre auf 0,27 und WavMark auf 0,00. WavMark-Paper: Tempo ×1,1 und ×0,9 mit 4,65 Prozent Bitfehlern bei 1-s-Stücken. | Q4, Q3, Q1, Q2, Q8 |
| MP3, AAC | Uneinheitlich. AudioSeal 1,00 bei MP3 32 kbps und AAC 64 kbps (Q4). Nach MP3 128 Bit-Genauigkeit 0,997 (AudioSeal) und 1,000 (WavMark) (Q22). WavMark-Paper: 1,19 Prozent Bitfehler bei MP3 64 kbps (Q8). Timbre: ab 32 kbps 1,0000, bei 8 kbps 0,9186 (Q10). Dagegen Tabelle V der SoK-Arbeit: WavMark und SilentCipher bestehen MP3 nicht, AudioSeal und Timbre bestehen (Q1). AudioMarkBench: MP3 löscht die Marke von WavMark ohne Qualitätsverlust (Q3). | Q4, Q22, Q8, Q10, Q1, Q3 |
| Abtastratenwandlung | AudioSeal 1,00 (über 32 kHz und zurück, Q4); Basismodell 0,999 beim Rundlauf über 8 kHz, die Streaming-Fassung 0,505, das ist Zufall (Q22). WavMark-Paper: 1,58 Prozent Bitfehler (Q8). Timbre: bei 16 kHz 1,0000, bei 8 kHz 0,9940 (Q10). Tabelle V der SoK-Arbeit: AudioSeal und Timbre bestehen leicht und mittel, WavMark und SilentCipher nur leicht (Q1). | Q4, Q22, Q8, Q10, Q1 |
| Neuronale Codecs, Entrauscher, Opus | AudioSeal 1,00 bei DAC, ESC und Encodec, aber 0,00 bis 0,01 bei SpeechTokenizer, FACodec, TiCodec, Encodec-VoiceCraft und SpectralCodec; Entrauscher 0,02 bis 0,04. WavMark 0,00 bei allen acht neuronalen Codecs (Q2). Opus: AudioSeal und WavMark 1,00 bei 24 kbps (Q2), dagegen Opus, EnCodec und SoundStream lassen die Fehlerrate stark steigen (Q3). | Q2, Q3 |
| Neu erzeugte Sprache | Tabelle V hat 12 Zeilen mit KI-Angriffen (fünf Stimmumwandlungen, sechs Zeilen Synthese mit Tacotron2 oder FastSpeech2, dazu YourTTS). Kein Verfahren besteht außer Timbre, und Timbre nur in den sechs Synthese-Zeilen. Bei AudioSeal fehlt der Eintrag in 8 der 12 Zeilen, in den übrigen 4 steht ein Kreuz (Q1). Dazu nach dem Bericht vom 26.11.: Stimmumwandlung und Synthese mit fremden Modellen drücken die Bit-Genauigkeit auf etwa 50 Prozent (Zufall). Timbre besteht nur, wenn das Synthesemodell mit markierten Daten trainiert wurde (Q1). Vocoder: Timbre und MaskMark 1,00 bei BigVGAN, BigVGAN2 und Vocos; WavMark 0,00 bei allen fünf; AudioSeal 0,00 bis 0,01 bei DiffWave (Q2). AudioSeal-Paper: erkennt auch neu synthetisierte Teile (HiFi-GAN) (Q4). | Q1, Q2, Q4 |
| Gezielte Angriffe | Mit Zugriff auf den Detektor steigt der Erkennungsfehler von AudioSeal um etwa 80 Prozent bei guter Qualität; die Autoren halten die Detektor-Gewichte geheim (Q4). AudioMarkBench: Mit Zugriff auf das Verfahren erreicht die Fehlerrate 1 bei allen Verfahren; ohne Zugriff braucht es viele Anfragen (Q3). Q2: Entfernen ohne Kenntnis des Verfahrens, mit fertigen Modellen und geringem Qualitätsverlust. | Q4, Q3, Q2 |

**Einschätzung.** Wer die Marke gezielt entfernen will, schafft das bei allen geprüften Verfahren. Der Kodex verlangt Widerstand gegen böswillige Angriffe (Maßnahme 3.3). Auch das ist mit offenen Verfahren heute nicht voll zu erfüllen. Die Marke bleibt ein Nachweismittel und kein Siegel, wie im Vergleich dort. Bei neu erzeugter Sprache zählt das für Kunibert nur, wenn jemand die Stimme absichtlich neu erzeugen lässt.

## 6. Lizenz und Erkennung je Verfahren

Gegengelesen am 27.11. sind die Zeilen AudioSeal, WavMark, Timbre und SilentCipher (Q5, Q6, Q9, Q11, Q12, Q26). Perth und SynthID: Stand vom 26.11., nicht gegengelesen.

| Verfahren | Code | Gewichte | Abtastrate, Nutzlast | Erkennungsmittel | Stand |
| --- | --- | --- | --- | --- | --- |
| AudioSeal | MIT (Q5) | MIT. Die Aussage steht im Eintrag „Key Updates“ vom 02.04.2024 (damit sind auch kommerzielle Anwendungen möglich), nicht in einem eigenen Lizenzabschnitt. Die Gewichte liegen laut Seite auf Hugging Face (nicht geöffnet). Die LICENSE-Datei ist ungelesen (Q5) | 16 kHz als Basis; laut Seite geht es auch mit anderen Raten (genannt: 24, 44,5 und 48 kHz); 16 Bit optional, ohne Einfluss auf die Erkennung (Q5) | lokal im Paket (Python); kein Online-Dienst genannt (Q5) | PyPI 0.2.1 vom 03.11.2026 (Q5) |
| WavMark | MIT in den Metadaten der Paketseite (Q6) | Die Hugging-Face-Seite zeigt „License: mit“ (Q26). Eine eigene Aussage nur für die Gewichte, ihre Herkunft bei `load_model` und kommerzielle Nutzung stehen nicht dort (Q6, Q7, Q8). Dateien: zwei Pickle-Dateien, 10 MB (die Seite zeigt „Safe“) und 30,1 MB (kein „Safe“, dafür der Link „How to fix it?“). Ob `load_model` eine davon lädt, steht nicht dort (Q26) | nur 16 kHz, mono; 32 Bit je Sekunde, im Paket 16 Bit feste Kennung und 16 Bit Nutzlast (Q6, Q8) | lokal (Q6); eine Online-Demo gibt es (nicht geöffnet) | PyPI 0.0.3 vom 07.01.2024 (Q6) |
| Timbre | GPL-3.0 (Q9) | keine Lizenzangabe. Das README nennt einen Google-Drive-Ordner mit allen Parameterdateien des Stimmklon-Modells (nicht geöffnet). Ob dort auch Gewichte des Wasserzeichen-Modells liegen, steht nicht dort (Q9) | 22,05 kHz, mono; 10 Bit als Standard (Q10, das Paper); auf der Code-Seite stehen beide Angaben nicht (Q9) | lokal mit dem Code (Q9) | 26 Commits laut Bericht vom 26.11.; „Releases“ war im Abruf nur eine leere Überschrift, das beweist nicht, dass es keine gibt (Q9) |
| SilentCipher | MIT (Q11, Q13) | keine Lizenzangabe gefunden. GitHub: Der Lizenzsatz nennt nur den Code (Q11). Hugging Face: kein Lizenzfeld, dazu die Warnung zu fehlenden Metadaten; der Abschnitt „License“ hat denselben Satz nur zum Code (Q12). Das Paket (27,2 kB) enthält keine Gewichte (Q13). LICENSE-Dateien, Releases und der Ordner „Models“ sind ungelesen | Modelle für 44,1 kHz und 16 kHz; 40 Bit, fünf 8-Bit-Zeichen (Q11, Q12) | lokal (Q11); das Standard-Laden der Gewichte geht über Hugging Face (Q11) | PyPI 1.0.5 vom 18.06.2024 (Q13) |
| Perth | MIT (Q14, Q16) | keine eigene Aussage; der Benchmark nennt MIT (Q22); ob Gewichte im Paket liegen, steht nicht dort (Q14) | Abtastrate nicht angegeben; ein Nutzer nennt 32 kHz als Standard, nicht am Code geprüft (Q15); Nutzlast nicht angegeben | lokal im Paket (Q16); der Hersteller bietet einen Dienst mit Schlüssel an, Preise nicht gefunden (Q17, Q18) | PyPI 1.0.1 vom 23.05.2025 (Q16) |
| SynthID (Audio) | kein Code für Audio; quelloffen ist laut Google nur das Text-Wasserzeichen (Q21) | nicht zutreffend | nicht zutreffend | öffentlicher Detektor SynthID.com: Datei hochladen, Prüfung gegen die Partner (Q19) | Ein Weg für Dritte, SynthID in Audio einzubauen, steht auf keiner der drei Seiten (Q19, Q20, Q21). ElevenLabs bettet es in eigene Ausgaben ein (Q20). |

Der Benchmark (Q22) nennt AudioSeal und WavMark mit MIT für Code und Gewichte und SilentCipher mit MIT für den Code, ohne Lizenzangabe für die Gewichte. Das passt zu meinen Funden.

**Einschätzung.**

- Für ein verkauftes Gerät genügt eine Lizenz für den Code nicht, wenn die Gewichte anderen Bedingungen unterliegen oder gar keine Lizenz nennen. Das betrifft Perth, SilentCipher und Timbre.
- Zu Timbre: GPL-3.0 ist eine Copyleft-Lizenz. Ob sie bei einem Dienst, der auf dem eigenen Server läuft, Pflichten auslöst, ist offen. Das ist eine Rechtsfrage, die ich nicht beantworte. Die Gewichte stehen nur hinter einem Link, den ich nicht geöffnet habe.
- Zu SilentCipher: Der Lizenzsatz auf Hugging Face spricht vom „repository“ und nennt dabei nur den Code. Ob er die Gewichte-Dateien in diesem Repository mitmeint, ist eine Auslegungsfrage und offen. Ich lese ihn so, dass die Gewichte ohne klare Lizenz bleiben.
- Zu Perth: Ein Fehlerbericht zeigt bei 44,1 kHz Eingang, dass die Energie über etwa 16,8 kHz um rund 94 Prozent sinkt; ob man das hört, steht dort nicht (Q15). Für ein Gerät mit 16 kHz ist das kaum von Belang. Perth ist laut Hersteller für Musik und Sprache gedacht; Zahlen zur Robustheit nennt der Hersteller nur ohne Testaufbau (Q17, Q18). Ich stufe Perth deshalb als Kandidat zweiter Reihe ein.
- Die Seiten von Resemble nennen Art. 50 mehrfach (Q18). Die Aussagen hängen an der Firmenlösung und nicht an der offenen Bibliothek. Der EU-Kodex wird dort nicht genannt.
- Zu den Gewichte-Dateien: Pickle-Dateien können beim Laden Programmcode ausführen (allgemein bekannt, nicht aus den Quellen dieser Datei). Bei WavMark liegt eine Datei ohne „Safe“-Zeichen neben der als „Safe“ gekennzeichneten. SilentCipher lädt standardmäßig über Hugging Face. Beides spricht dafür, die Gewichte vor dem Einsatz auf dem eigenen Server festzulegen: Datei und Prüfsumme prüfen und nichts zur Laufzeit aus dem Netz nachladen (Einschätzung; Teil von N1123-1153-b).

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

Das ist ein Vorschlag (Einschätzung). Er ersetzt den Auftrag im Punkt nicht, er füllt ihn aus. Nur Erwachsene sprechen und hören. Es gibt keine Kinderstimmen und keine Äußerungen oder Antworttexte im Protokoll. Aufnahmen werden nach der Messung gelöscht, nichts davon kommt ins Repo.

1. **Material:** Feste deutsche Beispielsätze, die ein Erwachsener vorbereitet (nichts aus dem Betrieb). Erzeugt mit den Stimmen, die Kunibert benutzt, je 5 bis 15 Sekunden lang. Mindestens 30 markierte und 30 unmarkierte Töne je Verfahren, damit sich Fehlerraten überhaupt angeben lassen. Die SoK-Arbeit hatte 5. Markiert wird nach der letzten Wandlung auf 16 kHz, mono, 16 Bit, wie am Gerät.
2. **Aufbau:** Pi mit dem echten Lautsprecher des Prototyps, in Betriebslautstärke. Aufnahme mit einem Smartphone (Sprachmemo; es speichert meist verlustbehaftet, Einschätzung) und mit einem einfachen USB-Mikrofon. Abstände 0,3 m, 0,5 m, 1 m und 2 m. Ein ruhiger Raum und ein Raum mit Hintergrundgeräusch. Die SoK-Arbeit hat mit einem MacBook Pro, einem USB-Mikrofon von HyperX und einem Logitech-Z130-Lautsprecher gemessen (Abschnitt 4). Mit dem Pi lässt sich das nur grob vergleichen (Einschätzung).
3. **Messen:** Bit-Genauigkeit (Schwelle über 0,8 wie in der SoK-Arbeit, damit die Zahlen vergleichbar bleiben), Erkennungsrate und Fehlalarmrate an den unmarkierten Kontrolltönen, je Verfahren, Abstand und Gerät. Die Zähleinheit der Erkennungsrate wird dabei angegeben (je Ton oder je Abschnitt), weil sie in der SoK-Arbeit offen ist.
4. **Dazu:** Dieselben Töne mit Tonhöhe um 1 und 2 Halbtöne, Tempo 0,9 und 1,1, MP3 mit 128 kbps und AAC mit 96 kbps. So steht belegt da, was die Verfahren nicht überstehen. Der Kodex nennt diese Veränderungen (Maßnahme 3.3).
5. **Ergebnis:** Eine Tabelle je Verfahren, Abstand und Gerät, mit Raum, Lautstärke und Abstand. Lücken benannt. Keine Äußerungen und keine Texte im Protokoll.

## 9. Empfehlung für N1123-1153-b, geändert (vorläufig, Einschätzung, 27.11.2026, 12:18)

1. **Noch kein Verfahren festlegen.** Erst messen: N1126-2323-g (Rechenaufwand, Hörprobe, Wandlung) und N1126-2323-h (Lautsprecher und Mikrofon) zusammen, für AudioSeal und WavMark. Timbre nur dazunehmen, wenn die Lizenzfrage geklärt ist (N1126-2348-b).
2. **Entscheidungsregel:** Besteht AudioSeal die Messung bei 0,5 m, bleibt es bei AudioSeal wie im Vergleich dort. Besteht nur WavMark, wird es WavMark, mit den bekannten Grenzen: nur 16 kHz, langsamer, schwach bei Tempo und Tonhöhe, MP3-Befund uneinheitlich, im Paper belegt die Kennung 10 von 32 Bit (Q8). Besteht keines, wird das Ergebnis offen dokumentiert. Das ist dann ein Restrisiko, das der Betreiber trägt. Die zweite Schicht (signierte Herkunftsangaben mit Register nach dem AWS-Muster) und die Suche nach besser geeigneten Verfahren laufen dann weiter (N1126-2348-c).
3. **Rest wie im Vergleich dort:** Feste 16-Bit-Kennung ohne Personenbezug. Alle Stimmen tragen die Marke (Pocket TTS, Piper, Google, Ersatzsätze, Ansagen). Signierte Herkunftsangaben für gespeicherte oder abgegebene Dateien. Ein freies Prüfskript im Repo mit einer Seite, die erklärt, wie man es benutzt. Ein Test im Repo: Jede Audio-Antwort trägt die Marke, und kein Protokoll enthält Äußerung, Antworttext, Geräte-ID oder Token. Neu: Die Gewichte werden vor dem Einsatz festgelegt (Datei und Prüfsumme prüfen, nichts zur Laufzeit nachladen; Abschnitt 6).
4. **Ehrlich dokumentieren:** Die Marke hält Tonhöhenänderung, neu erzeugter Sprache und gezielten Angriffen nicht stand (Q1 bis Q4). Sie ist ein Nachweismittel, kein Siegel.

## Quellen

Alle Seiten wurden am 26.11.2026 durch Unteragenten (Claude Sonnet) über das Abrufwerkzeug gelesen. Q1, Q5 (nur die Paketseite), Q6, Q9, Q11 und Q12 wurden am 27.11.2026 ein zweites Mal ganz gelesen, Q26 nur am 27.11.2026. Ein Zitat je Quelle, höchstens 15 Wörter, so wie der Agent es wiedergegeben hat (nicht am Original gegengelesen). „Art“ heißt: Vorabdruck (arXiv), Projektseite, Paketseite, Herstellerseite oder Fachpresse.

| Nr. | Quelle | Art und Lesestand | Zitat |
| --- | --- | --- | --- |
| Q1 | SoK: How Robust is Audio Watermarking in Generative AI models? (arXiv 2503.19176, Fassung 2, Datum 27.03.2025), https://arxiv.org/html/2503.19176v2 | Vorabdruck · Wortlaut, ganz (143.159 Zeichen, vier Fenster); am 27.11.2026 erneut ganz gelesen (143.159 Zeichen, vier Fenster) | „Most watermarks are vulnerable to physical re-recording.“ |
| Q2 | Deep Audio Watermarks are Shallow: Limitations of Post-hoc Watermarking Techniques for Speech (arXiv 2504.10782, Fassung 1), https://arxiv.org/html/2504.10782v1 | Vorabdruck · Wortlaut, ganz (48.641 Zeichen, zwei Fenster; das zweite nur Literatur) | „DEEP AUDIO WATERMARKS ARE SHALLOW“ |
| Q3 | AudioMarkBench: Benchmarking Robustness of Audio Watermarking (arXiv 2406.06979, Fassung 2, 13.11.2024), https://arxiv.org/html/2406.06979v2 | Vorabdruck · Wortlaut, Zeichen 0 bis 156.824 von 168.026; der Rest (Anhang) nicht gelesen | „FNRs reach 1 for all watermarking methods“ |
| Q4 | AudioSeal: Proactive Detection of Voice Cloning with Localized Watermarking (arXiv 2401.17264, Fassung 2, 06.06.2024), https://arxiv.org/html/2401.17264v2 | Vorabdruck · Wortlaut, ganz (153.821 Zeichen, vier Fenster) | „the detector’s weights should be kept confidential“ |
| Q5 | AudioSeal: README (roh) https://raw.githubusercontent.com/facebookresearch/audioseal/main/README.md und Paketseite https://pypi.org/project/audioseal/ (Version 0.2.1 vom 03.11.2026) | Projektseite und Paketseite · Wortlaut, beide ganz (11.558 und 36.343 Zeichen); die Paketseite am 27.11.2026 erneut ganz gelesen (36.343 Zeichen) | „full MIT license (including the license for the model weights)“ |
| Q6 | WavMark: Paketseite, https://pypi.org/project/wavmark/ (Version 0.0.3 vom 07.01.2024) | Paketseite · Wortlaut, ganz (25.754 Zeichen); am 27.11.2026 erneut ganz gelesen (25.754 Zeichen) | „MIT License“ |
| Q7 | WavMark: Modellseite auf Hugging Face (README), https://huggingface.co/M4869/WavMark/blame/main/README.md | Projektseite · Wortlaut, ganz (8.651 Zeichen) | „license: mit“ |
| Q8 | WavMark: Watermarking for Audio Generation (arXiv 2308.12770, Fassung 3, 07.01.2024), https://arxiv.org/html/2308.12770v3 | Vorabdruck · Wortlaut, ganz (116.626 Zeichen, drei Fenster) | „We utilized 16kHz audio as hosts.“ |
| Q9 | Timbre Watermarking: Code-Seite auf GitHub, https://github.com/TimbreWatermarking/TimbreWatermarking | Projektseite · Wortlaut, ganz (17.141 Zeichen); am 27.11.2026 erneut ganz gelesen (17.141 Zeichen) | „GPL-3.0 license“ |
| Q10 | Detecting Voice Cloning Attacks via Timbre Watermarking (arXiv 2312.03410, Fassung 1, 06.12.2023; NDSS 2024), https://arxiv.org/html/2312.03410v1 | Vorabdruck · Wortlaut, Zeichen 0 bis 156.956 von 238.712 (66 Prozent); der Rest ungelesen | „embeds watermark information into the target individual’s speech, eventually defeating the voice cloning attacks“ |
| Q11 | SilentCipher: Code-Seite auf GitHub, https://github.com/sony/silentcipher | Projektseite · Wortlaut, ganz (22.620 Zeichen); am 27.11.2026 erneut ganz gelesen (22.620 Zeichen) | „The code in this repository is released under the MIT license“ |
| Q12 | SilentCipher: Modellseite auf Hugging Face, https://huggingface.co/Sony/SilentCipher | Projektseite · Wortlaut, ganz (13.827 Zeichen); am 27.11.2026 erneut ganz gelesen (13.827 Zeichen) | „YAML Metadata Warning: empty or missing yaml metadata in repo card“ |
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
| Q26 | WavMark: Dateiliste auf Hugging Face, https://huggingface.co/M4869/WavMark/tree/main | Projektseite · Wortlaut, ganz (3.717 Zeichen); nur am 27.11.2026 gelesen | „License: mit“ |

## Nicht geprüft

**Grenzen der Methode**

- Ich habe nie einen Rohtext gesehen, nur die Berichte der Lese-Agenten (am 26.11. und am 27.11.). Zahlen, Zitate und Aussagen wie „steht nicht im Text“ sind nicht am Original gegengelesen. Abbildungen waren nicht lesbar; Zahlen daraus fehlen (zum Beispiel Abbildung 9 der SoK-Arbeit).
- Kein Ton erzeugt, nichts eingebettet, nichts gemessen, kein Code ausgeführt. Alle Werte stammen aus Quellen.
- Am 27.11. gelesen sind nur Q1, Q5 (Paketseite), Q6, Q9, Q11 und Q12 (zum zweiten Mal) sowie Q26 (zum ersten Mal). **Nicht erneut gelesen:** Q2, Q3, Q4, Q7, Q8, Q10, Q13 bis Q25 und die rohe README von Q5. Das betrifft in Abschnitt 5 alle Angaben ohne den Vermerk „Tabelle V“, in Abschnitt 6 die Zeilen Perth und SynthID und die Zahl der Commits bei Timbre.

**Quellen, die nur zum Teil gelesen sind**

- Timbre-Paper (Q10): 66 Prozent. Ungelesen sind der Rest von Abschnitt V (ab Tabelle V), die Diskussion, das Fazit, die Literatur und der Anhang. Das Inhaltsverzeichnis führt dort einen Abschnitt „Extension to the Physical World“. Sein Inhalt ist unbekannt. Er könnte eine Messung über Lautsprecher enthalten.
- Soft-Binding-Benchmark (Q22): 78 Prozent. AudioMarkBench (Q3): die letzten rund 11.000 Zeichen (Teil des Anhangs).
- SoK-Arbeit (Q1): ganz gelesen. Nicht lesbar waren die Abbildungen (Abbildung 6 bis 15, darunter Abbildung 9 mit den Bit-Genauigkeiten je Abstand). Der Text widerspricht sich bei Patchwork und Timbre (Abschnitt 4), und die Zähleinheit von Tabelle VI ist offen.

**Lizenzen und Rechtliches**

- Keine Lizenzdatei gelesen (weder MIT noch GPL-3.0 noch die der Gewichte). Ob Perth, Timbre und SilentCipher ihre Gewichte unter einer Lizenz abgeben, bleibt offen. Die GPL-3.0-Folgen für Timbre sind eine Rechtsfrage.
- Trainingsdaten-Lizenzen aller Verfahren nicht gelesen.
- Die LICENSE-Dateien, die Releases und der Ordner „Models“ von SilentCipher sowie das Paper und die Hugging-Face-Dateiliste nicht gelesen. Das Paper hat der andere Lauf gelesen.
- Der Google-Drive-Ordner von Timbre und die README-Dateien der Ordner `watermarking_model` und `voice.clone` nicht geöffnet.
- Die Perth-Seite auf GitHub könnte ein älterer Zwischenspeicher sein (ein Bildlink trägt einen Zeitstempel vom 26.09.2026).

**Offen**

- Ob eine Marke über den Lautsprecher des Geräts gefunden wird (N1126-2323-h).
- Verfahren, die für Wiedergabe mit neuer Aufnahme gebaut sind. DeAR (AAAI 2023) beschreibt die SoK-Arbeit als dafür ausgelegt, getestet hat sie es nicht; sonst habe ich nur den Titel aus der Suche gesehen. Neuere Arbeiten 2025 und 2026: nicht gesucht (N1126-2348-c).
- Bedingungen und Kosten, SynthID für Audio in ein eigenes System einzubauen (nichts angefragt).
- Ob Pocket TTS selbst markiert: bleibt N1126-1153-d.
- Recht: Ein Anwalt war bewusst nicht beteiligt (Restrisiko, festgehalten).

## Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Manuel (am Pi), Claude (Auswertung) | N1126-2323-g und N1126-2323-h zusammen: AudioSeal und WavMark messen, Aufbau nach Abschnitt 8. N1126-2323-h steht in der Arbeitsliste schon auf Prio 2 | Server und Pi, nur Erwachsene |
| Claude (Lauf Recherche) | N1126-2348-b: Timbre: Lizenz der Gewichte und GPL-3.0-Lage nur lesen, dazu den Rest des Papers (Anhang zur physischen Welt) | `docs/recherche/timbre-wasserzeichen.md` |
| Claude (Lauf Recherche) | N1126-2348-c: Verfahren suchen, die für Wiedergabe mit neuer Aufnahme gebaut sind (DeAR und neuere Arbeiten): Code, Lizenz, 16 kHz | `docs/recherche/kennzeichnung-neuaufnahme.md` |
| Claude (Lauf Recherche) | N1126-2323-i: Rest: LICENSE-Dateien, Releases und Ordner „Models“ von SilentCipher lesen; Signaturzertifikat und Vertrauensliste für C2PA lesen | nur lesen |
| Betreiber | Nur wenn Timbre ernsthaft in Frage kommt: entscheiden, ob die GPL-3.0 tragbar ist. Das ist eine Rechtsfrage. Nichts bestellt, nichts angefragt | im Chat |
