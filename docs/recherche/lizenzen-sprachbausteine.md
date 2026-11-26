# Lizenzen der übrigen Sprachbausteine (Spracherkennung, Piper-Rückfall, Google)

Stand: 26.11.2026 · Punkt N1122-1825-e der Arbeitsliste · Bezug: H5 (`stimme-lizenz.md`) · Wochen-Autopilot, Rolle Recherche.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

Die Quellen Q1 bis Q40 stehen am Ende, mit Abrufdatum, Lesestand und einem kurzen Zitat. Die Nummern gelten nur in diesem Dokument. „Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. „Offen“ heißt: nicht belegt. Ein Abrufwerkzeug hat die Seiten gelesen und mir berichtet. In der Spalte „Gelesen“ steht, ob mir der Wortlaut vorlag oder nur eine Zusammenfassung des Werkzeugs. Namen von Privatpersonen stehen hier nicht. Ausnahme ist `thorsten`: Das ist der Name der Stimme, und er steht schon im Repository (`deploy/setup-server.sh`). `Thorsten-Voice` ist der Name des Projekts des Sprechers und steht in Adressen und Titeln der Quellen. Die Adresse von Q31 enthält einen Personennamen und steht deshalb nicht in der Tabelle. Sie steht auf der Karte Q21.

OpenAI (Hersteller von Whisper) und Gemini (genannt auf einer Google-Seite) kommen hier nur als Gegenstand der Lizenzprüfung vor. Das Sprachmodell von Kunibert bleibt Claude.

## Kurzfassung

**Frage:** Darf Kunibert die übrigen Sprachbausteine in einem verkauften Produkt nutzen? Gemeint sind die Spracherkennung (`faster-whisper-small` über Speaches), die Rückfall-Stimme von Piper und die optionale Sprachausgabe von Google. Pocket TTS und die Stimme `stuart_bell` behandelt `stimme-lizenz.md`.

**Antwort (Einschätzung):** Die Spracherkennung: ja, nach den gelesenen Seiten. Die Piper-Stimme `thorsten` aus der Kopie bei Speaches: nicht, solange die Lizenzkette offen ist. Google: nicht, solange die Altersgrenze der Cloud-Bedingungen nicht geklärt ist. Auch für Tests mit Erwachsenen ist beides offen. Bis zur Klärung: Google aus, Piper nicht standardmäßig laden.

| Baustein | Lizenz (Quelle) | Verkauf | Offen |
| --- | --- | --- | --- |
| Sprachserver Speaches | MIT (Q1) | ja | Lizenzdatei nicht gelesen. Pakete im Image 0.8.3 nicht geprüft. |
| Spracherkennung: `faster-whisper`, CTranslate2, Modell `faster-whisper-small`, Whisper | alle MIT (Q3 bis Q7) | ja | Herkunft der Trainingsdaten von Whisper (Q8). Lizenzdateien nicht gelesen. |
| Piper-Programm (`piper-tts` ab 1.3.0, so verlangt es Speaches) | GPL-3.0-or-later, mit eingebettetem espeak-ng (GPL ab Version 3; die Seitenleiste nennt zusätzlich Apache-2.0 und BSD-2-Clause) (Q2, Q17, Q20) | ja. Bei Weitergabe greifen Pflichten (L4, Q39). | Version im Image 0.8.3 nicht geprüft. Die Voices-Seite sagt, Piper sei nur für persönlichen Gebrauch und Forschung gedacht (Q13). Was sie meint, ist unklar. Lizenz der Wörterbuchdaten von espeak-ng nicht gelesen. |
| Piper-Stimme `thorsten` (Kopie bei Speaches, Stand 21.3.2025) | Aufnahmen CC0 (Q29, Q30). Die alte Fassung ist aus `lessac` feinabgestimmt (Q22, Q28). | **nein, bis geklärt** | Welche Fassung die Kopie enthält. Sie ist älter als der Commit vom November 2026, der laut Titel neu trainiert (Q21, Q26). |
| Google Cloud Text-to-Speech (Chirp 3 HD), optional | Dienst unter Googles Bedingungen (Q36, Q37) | **nein, bis geklärt** | Altersgrenze 18 für generative KI-Dienste, nur als Zusammenfassung gelesen (Q36). Ob Chirp 3 HD darunter fällt. Eigentum am erzeugten Ton: die Produktseite sagt nichts dazu (Q33). Herkunft der Stimmen: nicht genannt (Q32). |

**Was das heißt (Einschätzung, vorläufig, 26.11.2026, 18:24 Uhr):**

- Die Spracherkennung ist nach den gelesenen Seiten lizenzrechtlich unkritisch. Alle Teile stehen unter MIT. Kunibert gibt sie nicht weiter, sie laufen auf dem eigenen Server. Offen bleibt die Herkunft der Trainingsdaten von Whisper (L3).
- Die Piper-Stimme ist der Baustein mit dem größten Lizenzrisiko. Das Einrichtungsskript lädt sie bei jedem Lauf, auch wenn Pocket TTS spricht. Wer sie in einem verkauften Gerät nutzen will, muss erst klären, welche Fassung läuft (L1). Auch für Tests mit Erwachsenen ist die Lage offen: Die Erlaubnis für `lessac` nennt Forschung (Q12). Bis zur Klärung sollte das Skript die Stimme nicht mehr standardmäßig laden (Punkt N1126-1600-a).
- Google bleibt aus (der Standard ist Pocket TTS). Wer es einschalten will, muss erst Abschnitt 20 der Cloud-Bedingungen im Wortlaut lesen (L2). Das gilt vorsichtshalber auch für Tests mit Erwachsenen, weil sich Kunibert als Ganzes an Kinder richtet.
- Die GPL für `piper-tts` löst bei uns heute nichts aus: Kunibert gibt Piper nicht weiter (L4).

## Was Kunibert heute nutzt

- **Sprachserver:** Speaches im Docker-Container, Image `ghcr.io/speaches-ai/speaches:0.8.3-cpu`, nur lokal erreichbar (`deploy/setup-server.sh`). Der Kunibert-Server ruft ihn über HTTP auf.
- **Spracherkennung:** Modell `Systran/faster-whisper-small` (`deploy/setup-server.sh`). Kinderstimmen gehen nur an diesen eigenen Server (feste Regel in `CLAUDE.md`).
- **Rückfall-Stimme:** Piper-Modell `speaches-ai/piper-de_DE-thorsten-medium`, Stimme `thorsten` (`deploy/setup-server.sh`). Das Skript lädt beide Modelle bei jedem Lauf und trägt sie in die env-Datei ein. Kuniberts Hauptstimme ist seit 13.11.2026 Pocket TTS. Piper bleibt der Rückfall (`deploy/EINRICHTUNG.md`, Abschnitt 4).
- **Google (optional, standardmäßig aus):** `PICASTAI_TTS_PROVIDER=google` mit der Stimme `de-DE-Chirp3-HD-Algenib` (`deploy/kunibert.env.example`, `server-api/google-speech.ts`). Zu Google geht nur der Antworttext, nicht die Kinderstimme.
- **Nicht im Gerät:** Das Gerät nimmt nur auf und spielt ab (`CLAUDE.md`). Speaches, Whisper und Piper laufen nie auf dem Gerät. Wir geben sie nicht an Kunden weiter.

## Befunde

### Sprachserver Speaches

- Lizenz: MIT (Q1). Die Datei `pyproject.toml` hat kein Feld `license` (Q2). Die Lizenzdatei habe ich nicht gelesen (offen).
- Die README nennt als Bausteine `faster-whisper` für die Erkennung sowie Piper und Kokoro für die Sprachausgabe (Q1). Zu den Lizenzen der Modelle sagt sie nichts. Einschätzung: Die MIT-Lizenz von Speaches gilt für das Programm, nicht für die Modelle, die es lädt. Die Modelle haben eigene Lizenzen (siehe unten).
- Abhängigkeiten laut `pyproject.toml` auf dem Zweig `master`: `faster-whisper` ab 1.1.1, `ctranslate2` ab 4.5.0, `piper-tts` ab 1.3.0, `kokoro-onnx` ab 0.4.5 (unter 0.5) und `huggingface-hub` ab 0.33.4 (Q2). Das ist der Stand von `master` am 26.11.2026. Die Pakete im Image 0.8.3, das Kunibert nutzt, habe ich nicht geprüft (offen).
- Das Image enthält weitere Pakete mit eigenen Lizenzen. Das habe ich nicht untersucht. Kokoro nutzt Kunibert nicht.

### Spracherkennung: faster-whisper, CTranslate2, Modell, Whisper

- `faster-whisper` steht unter MIT (Q3). Die README nennt es eine Neuimplementierung des Whisper-Modells mit CTranslate2.
- CTranslate2 steht unter MIT. Als Rechteinhaber nennt die Lizenzdatei die Firma SYSTRAN und die Projektgruppe OpenNMT (Q4, Q5).
- Das Modell `Systran/faster-whisper-small`: Die Karte nennt als Lizenz MIT. Sie sagt, das Modell sei aus `openai/whisper-small` umgewandelt (Befehl `ct2-transformers-converter`, Gewichte in FP16). Datum und Versionen der Umwandlung nennt sie nicht. Eigene Einschränkungen hat sie nicht, sie verweist auf die Karte von OpenAI (Q6).
- Whisper selbst: Code und Gewichte stehen unter MIT. Das sagt die README ausdrücklich (Q7).
- Trainingsdaten (Q8): 680 000 Stunden Ton mit Text, laut Karte aus dem Internet gesammelt. 65 % davon sind Englisch. 18 % sind nicht-englischer Ton mit englischem Text, 17 % nicht-englischer Ton mit Text in derselben Sprache. Der Anteil Deutsch steht nicht dabei. Zur Lizenz der Quellen und zur Einwilligung der Sprechenden sagt die Karte nichts. Einschätzung: Das Risiko liegt beim Anbieter des Modells. Ich kann es weder bewerten noch ausschließen (L3).
- Hinweise der Karte (Q8): Das Modell richtet sich vor allem an die KI-Forschung. Die Karte warnt davor, Aufnahmen ohne Einwilligung der Sprechenden abzuschreiben. Sie nennt Fehler: erfundene Wörter (Halluzinationen), Wiederholungen und höhere Fehlerraten bei manchen Akzenten, Geschlechtern, Herkünften und Altersgruppen. Einschätzung: Das gehört in die Datenschutz-Folgenabschätzung (Einwilligung der Eltern) und in die Tests mit Kinderstimmen, nicht in diesen Punkt. Der Server behandelt eine Erkennung, die nur aus dem Hinweis „Ritter Kunibert“ besteht, schon wie Stille (`deploy/kunibert.env.example`).
- Pflichten: Die gelesenen Seiten nennen keine Pflicht zur Nennung (Q3, Q6, Q7). Die MIT-Bedingung ist: Lizenz- und Copyright-Hinweis erhalten (Q38). Die Lizenzdateien habe ich nicht gelesen. Einschätzung: Der Hinweis muss in Kopien stehen, die wir weitergeben. Wir geben heute keine weiter (Server-Betrieb).
- Verkauf: MIT erlaubt die kommerzielle Nutzung (Q38).

### Piper: das Programm

- Das ältere Projekt `rhasspy/piper` steht unter MIT (Q10). Es ist seit dem 6.10.2025 archiviert. Die Seite sagt, die Entwicklung sei nach `OHF-Voice/piper1-gpl` umgezogen (Q9).
- Das Paket `piper-tts` auf PyPI hat die Lizenz gewechselt. Version 1.1.0 (27.7.2023) steht unter MIT und verweist auf `rhasspy/piper` (Q18). Version 1.3.0 (10.7.2025) steht unter GPL-3.0-or-later und verweist auf `OHF-Voice/piper1-gpl` (Q17). Die neueste Version 1.8.0 (4.9.2026) ist ebenfalls GPL-3.0-or-later (Q19). Die Versionen dazwischen habe ich nicht gelesen.
- Speaches verlangt `piper-tts` ab 1.3.0 (Q2). Einschätzung: Speaches nutzt damit die GPL-Fassung. Für das Image 0.8.3 habe ich es nicht geprüft.
- Die Engine bettet espeak-ng zur Phonemisierung ein (Q11, Q17). espeak-ng steht unter GPL ab Version 3 (Q20). Die Seitenleiste nennt zusätzlich Apache-2.0 und BSD-2-Clause. Eine Lizenzangabe für die Wörterbuchdaten steht auf der Seite nicht (offen). Warum Piper die GPL gewählt hat, steht auf den gelesenen Seiten nicht (Q11, Q12). Einschätzung: Der Zusammenhang mit espeak-ng liegt nahe, ist aber nicht belegt.
- Was die GPL verlangt (Q39): den Quelltext bereitstellen, Lizenz- und Copyright-Hinweis erhalten, dieselbe Lizenz verwenden und Änderungen kennzeichnen. Einschätzung: Diese Bedingungen greifen bei der Weitergabe („conveying“). Der Lizenztext sagt: Bloße Interaktion mit Nutzenden über ein Netzwerk ist keine Weitergabe, solange keine Kopie übergeben wird (Q39, Abschnitt 0 des Lizenztextes).
- Einschätzung: Kunibert betreibt Piper auf dem eigenen Server und übergibt keine Kopie. Die Gerätesoftware enthält Piper nicht (`CLAUDE.md`). Die GPL-Pflichten greifen damit heute nach meiner Einschätzung nicht. Das ändert sich, wenn Piper, espeak-ng oder eine Stimme in ein Image oder Paket für Kunden kommt (L4).
- Der Kunibert-Server ruft Speaches nur über HTTP auf. Ob das den Kunibert-Code unter die GPL zieht, habe ich aus keiner Quelle geprüft (offen). Die GNU-Seiten (GPL-FAQ) ließen sich nicht abrufen.
- Verkauf: Die GPL erlaubt die kommerzielle Nutzung (Q39).

### Piper: die Stimme `thorsten`

**Was das Piper-Projekt über Stimmen sagt (Q12, Q13)**

- Das Projekt vergibt selbst keine Lizenz an Stimmenmodellen und setzt auch keine eigene Einschränkung (Q12). Die Rechte kommen aus den Trainingsdaten und von denen, die trainiert haben.
- Die Zeile „License“ in der `MODEL_CARD` gilt nur für die Aufnahmen dieser einen Stimme. Bei feinabgestimmten Stimmen muss man die Kette über die Zeile „Training“ bis zum Ursprung zurückverfolgen (Q12).
- Ob ein trainiertes Modell ein abgeleitetes Werk seiner Trainingsdaten ist, nennt das Projekt eine ungeklärte Rechtsfrage. Es nimmt dazu keine Stellung. Für alles Kommerzielle rät es zu einem Anwalt (Q12). Der Betreiber hat bewusst keinen eingeschaltet. Das ist als Restrisiko festgehalten.
- Viele Stimmen gehen auf `en_US-lessac-medium` zurück. Dessen Korpus (Blizzard 2013) schließt nach seiner Lizenz die kommerzielle Nutzung der erzeugten Sprache aus. Das Piper-Projekt hat keine Erlaubnis der Rechteinhaber (Q12). Als Erlaubnis nennt die Lizenz laut Q12 Forschung und das Erkunden von Sprachtechnik. Einschätzung: Ein Test für ein Produkt, das verkauft werden soll, passt nicht sicher in diesen Rahmen.
- Als saubere Grundlagen nennt das Projekt `nl_BE-rdh-medium` (CC0) und `en_US-hifi_tts_92-medium` (CC BY 4.0, die Nennung wird weitergegeben) (Q12). Die Datei `docs/COMMERCIAL_USE.md` listet Stimmen, deren ganze Kette aus frei lizenzierten Aufnahmen besteht (Q12, Q14). Diese Datei habe ich nicht gelesen. Die Beschreibungen der beiden PRs, die sie anlegten und ergänzten, nennen `thorsten` und deutsche Stimmen nicht (Q14, Q15). Ob die Datei sie nennt, ist offen.
- Auf der Seite „Voices“ steht, Piper sei nur für persönlichen Gebrauch und für Forschung zur Sprachausgabe gedacht. Das Projekt lege Stimmenmodellen keine zusätzlichen Einschränkungen auf. Manche Stimmen hätten strenge Lizenzen, man solle die Karten sorgfältig lesen (Q13). Der Satz sagt nicht eindeutig, ob mit „Piper“ die Engine, die Stimmen oder beides gemeint ist.
- Ein Fragesteller mit einer kommerziellen App fragte am 28.9.2026 beim Piper-Projekt nach der Erlaubnis für zwei russische Stimmen, die aus `lessac` feinabgestimmt sind. Der Eintrag war beim Lesen offen und ohne Antwort (Q16).

**Die Aufnahmen und der Sprecher (Q28 bis Q31)**

- Die Stimme `thorsten` stammt von einem einzelnen Sprecher, der kein Berufssprecher ist (Q31). Er hat die Aufnahmen selbst gemacht. Ein zweiter Autor hat den Ton aufbereitet (Q30).
- Die Datensätze stehen unter CC0: der „Thorsten-Voice Dataset 2022.10“ (Zenodo, Version 1.0 vom 30.10.2022, 12 450 Aufnahmen, über 11 Stunden, Q30) und der „German Neutral-TTS dataset“ (OpenSLR 95, über 23 Stunden, Q29). Die GitHub-Seite des Datensatzes nennt CC0-1.0 für Datensätze (Q31). Für Modelle steht dort keine Lizenzangabe. Ob der Sprecher von OpenSLR 95 derselbe ist wie bei den anderen Aufnahmen und ob er den Datensatz selbst veröffentlicht hat, sagt die Seite nicht (offen, Q29).
- Der Sprecher hat selbst ein Piper-Modell aus seinen Aufnahmen veröffentlicht, mit CC0 und dem Hinweis, dass kommerzielle Nutzung erlaubt ist (Q28). Einschätzung: Das spricht stark dafür, dass er der Nachbildung seiner Stimme zugestimmt hat.
- Eine ausdrückliche Erklärung zur Nutzung in einem Kinderprodukt oder zum Klonen fand ich nicht (Q28 bis Q31). OpenSLR enthält die Bitte, die Stimme nicht für Schlechtes zu nutzen. Das ist ein Wunsch, keine Lizenzbedingung (Q29). CC0 regelt das Urheberrecht, nicht das Recht an der eigenen Stimme (Einschätzung, wie bei `stuart_bell`, siehe Q10 in `stimme-lizenz.md`). Das Risiko ist niedrig (L5).
- Nennung: erwünscht, nicht nötig (Q28). Q31 nennt das Zitieren eine Bitte.

**Die Fassungen der Stimme (Q14, Q15, Q21 bis Q28)**

| Wann | Was | Quelle |
| --- | --- | --- |
| 26. und 27.6.2023 | Ältester sichtbarer Commit im Ordner der Stimme `de_DE-thorsten-medium` in `rhasspy/piper-voices`: Er fügt laut Titel die Stimmen v1.0 und v0.2 hinzu. Ob zwei Fassungen derselben Stimme gemeint sind, sagt der Titel nicht. Ein zweiter Commit folgt am nächsten Tag (Titel ohne klare Aussage). Es waren nur drei Einträge sichtbar. | Q25 |
| 23.9.2023 | Letzter sichtbarer Commit im Ordner (laut Titel werden Namen in der jeweiligen Landessprache ergänzt). | Q25 |
| ältere Karte | Die Stimme ist aus der amerikanischen Stimme `lessac` (Qualität medium) feinabgestimmt. Daten: CC0. Die Karte im Tag `v1.0.0` ist 285 Byte groß, so lang wie die Karte im Zweig `pr/10` (Inhalt nicht verglichen). | Q22, Q24 |
| 21.3.2025 | Letzte Änderung der Kopie `speaches-ai/piper-de_DE-thorsten-medium`, die Kunibert lädt (laut Liste des Kontos). | Q26 |
| 9.11.2026 | Das Piper-Projekt dokumentiert die Lizenzen der Stimmen (PR 356, zusammengeführt). | Q14 |
| etwa 10.11.2026 | Die Karte der Stimme auf `main` zeigt einen Commit, der laut Titel die Stimmen aus den Grundlagen `rdh` und `hifi_tts_92` neu trainiert (laut Seite vor 16 Tagen, daraus berechnet). Sie nennt jetzt `rdh` (nl_BE, CC0) als Grundlage und verlangt Piper 1.5 oder höher. Einschätzung: Der Zeitpunkt passt zu den beiden PRs. Ein Zusammenhang ist nicht belegt. | Q21 |
| 11.11.2026 | Das Piper-Projekt ergänzt die Liste der frei nutzbaren Stimmen (PR 357, zusammengeführt). | Q15 |

- Widerspruch: Die Ordnerliste von `main` zeigte für die Karte (285 Byte) und die Modelldatei als letzte Änderung vor über drei Jahren (Q23). Die Seite der Karte auf `main` zeigt dagegen einen Commit von vor 16 Tagen und einen anderen Inhalt: `rdh` statt `lessac` (Q21). Beide Seiten habe ich am 26.11.2026 gelesen. Ich kann den Widerspruch nicht auflösen. Ob die Modelldatei neu trainiert wurde, steht damit nicht fest.
- Hinweis zur Kopfzeile des Stimmen-Repos (Q40): Die Angaben zum Repository `rhasspy/piper-voices` auf der Seite von Q21 nennen als Lizenz MIT, während die Karte der Stimme für die Aufnahmen CC0 nennt. Der Hinweis wurde zuerst bei der Prüfung von PR #133 durch den Lauf „Planen & Bericht“ eingetragen (26.11.2026, gegen 18:20 Uhr). Ein Prüfer meines Laufs bestätigte ihn am selben Tag über das Abrufwerkzeug. Die Rohseite sah er nicht, und ich habe die Seite nicht selbst so gelesen. Es zählt deshalb nur als Hinweis. Nach Q12 vergibt das Piper-Projekt selbst keine Lizenz an Stimmenmodellen. Einschätzung: Die Angabe zum Repository gilt dann nicht für die einzelnen Stimmen. Offen: Was sie genau meint.

**Einschätzung (vorläufig, 26.11.2026, 18:24 Uhr):**

- Die Kopie bei Speaches ist von März 2025 (Q26). Sie ist damit älter als der Commit vom November 2026, der laut Titel neu trainiert (Q21). Die ältere Karte sagt, die Stimme sei aus `lessac` feinabgestimmt (Q22). Wahrscheinlich steckt in der Kopie also die alte Fassung. Das ist ein Schluss aus Datum und Karte. Die Karte und die Dateien der Kopie habe ich nicht gesehen: Drei Suchen lieferten ihre Adresse nicht, und die Nachbarseite zeigte im gelesenen Text weder Lizenzfeld noch Karte (Q26, Q27).
- Der Sprecher selbst nennt die Lizenzlage der alten Fassung für kommerzielle Nutzung ungeklärt (Q28). Das Piper-Projekt sagt, der Korpus von `lessac` schließe kommerzielle Nutzung aus, und es habe keine Erlaubnis (Q12). Ob ein Modell als abgeleitetes Werk dieses Korpus gilt, ist laut Piper ungeklärt (Q12).
- Darum gebe ich die Kopie `speaches-ai/piper-de_DE-thorsten-medium` für ein verkauftes Produkt nicht frei (L1). Auch für Tests mit Erwachsenen im eigenen Netz ist sie offen: Die Erlaubnis für den `lessac`-Korpus nennt Forschung (Q12), und ein Test für ein Produkt dient einem geschäftlichen Zweck. Ob das darunter fällt, kann ich nicht beurteilen. Vorsichtshalber sollte das Einrichtungsskript sie nicht mehr standardmäßig laden, bis N1126-1600-b geklärt ist (Punkt N1126-1600-a).

**Eine saubere Alternative (Q28)**

- Der Sprecher hat eine zweite Stimme veröffentlicht, `Piper-Thorsten-CC0`. Sie ist von Grund auf neu trainiert, ohne `lessac`: erst eine Basis aus seinen Aufnahmen (2021.02 und 2022.10, etwa 32 Stunden), dann die Stimme aus den Aufnahmen 2022.10 (etwa 9,7 Stunden). Die Seite sagt, in der Trainingsgeschichte gebe es keinen `lessac`-Stand und kein anderes Fremdmodell.
- Lizenz CC0 1.0. Kommerzielle Nutzung erlaubt. Nur Deutsch, mittlere Qualität, nur neutraler Stil. Die Modelldatei heißt `onnx/de_DE-thorsten_cc0-medium.onnx`. Ein Datum zeigt die Seite nicht.
- Ob Speaches diese Stimme laden kann, habe ich nicht geprüft (offen, Punkt N1126-1600-b). Die Qualität kenne ich nicht: Piper-Stimmen klangen im Hörtest vom 6.11.2026 unnatürlich (`deploy/EINRICHTUNG.md`).

### Google Cloud Text-to-Speech (Chirp 3 HD)

- Chirp 3: HD ist laut Google die neueste Generation der Sprachausgabe, auf Basis generativer Modelle. Deutsch (`de-DE`) ist dabei, mit 30 Stimmnamen. `Algenib` steht nicht wörtlich auf der Seite, nur das Namensmuster. Die Region `eu` ist allgemein verfügbar. Dass der Endpunkt `eu-texttospeech`, den Kunibert nutzt, zu dieser Region gehört, steht auf der Seite nicht (Q32).
- Zur Herkunft der Stimmen (Sprecher, Aufnahmen) sagt die Seite nichts (Q32). Die Wörter „watermark“ und „SynthID“ kommen auf der Seite nicht vor (Q32). Das ist für die Kennzeichnung von KI-Sprache wichtig (Punkt N1126-1153-c).
- Daten: Cloud Text-to-Speech ist laut Seite zustandslos, und Google protokolliert keine Texte oder Audiodaten von Kunden (Q34, Seite geändert am 10.11.2026). Zum Training mit Kundendaten sagt die Seite nichts Eindeutiges: Ein allgemeiner Satz zur Verbesserung von Produkten mit Kundendaten ist nicht klar auf Text-to-Speech bezogen. Offen: Speicherung in anderen Systemen, Aufbewahrung, Training. Dazu gehört das Cloud Data Processing Addendum (genannt in Q37, nicht gelesen).
- Rechte am erzeugten Ton: Die Produktseite sagt nichts zu Eigentum, Speicherung oder Training (Q33). Die Cloud-Bedingungen habe ich nur als Zusammenfassung gelesen (Q36, Q37). Ob Kunibert den Ton in einem verkauften Produkt nutzen darf und welche Pflichten dafür gelten, ist offen.
- Alter, Produktseite: Unter einem Werkzeug „Generate a solution“, das mit Gemini gebaut ist, steht der Hinweis, man müsse mindestens 18 sein und solle keine sensiblen oder persönlichen Daten eingeben (Q33). Nach der Stellung und dem ersten Satz gehört der Hinweis wohl zu diesem Werkzeug und nicht zur Sprachausgabe (Einschätzung; der Text sagt es nicht ausdrücklich).
- COPPA-Seite (Q35): Sie erklärt COPPA und nennt als COPPA-konform nutzbar die Kerndienste von Google Workspace for Education (mit Einwilligung der Eltern über die Schule). Zu Cloud-Diensten wie Text-to-Speech für Kinder unter 13 sagt sie nichts.
- Alter, Vertragsbedingungen (Q36): Die Service Specific Terms haben nach der Zusammenfassung des Abrufwerkzeugs einen Abschnitt 20 über generative KI-Dienste. Darin verbietet Unterabschnitt (d), der Altersgrenzen regelt, einen solchen Dienst in einem Angebot zu nutzen, das sich an unter 18-Jährige richtet oder von ihnen wahrscheinlich genutzt wird. Das ist eine Zusammenfassung, kein Wortlaut. Kunibert richtet sich an Kinder von 6 bis 10 Jahren. Ob Cloud Text-to-Speech mit Chirp 3 HD zu diesen Diensten zählt, habe ich nicht gesehen: Definition und Liste der Dienste lagen mir nicht vor. „Text-to-Speech“ stand nur im Produktmenü der Seite. „Chirp“ und „COPPA“ kamen im gelesenen Text nicht vor.
- Lesestand von Q36: Der Abruf lieferte nur die ersten 39 947 von 236 845 Zeichen wörtlich (fast nur Menü). Die nächsten etwa 100 000 Zeichen lagen als Zusammenfassung vor, die letzten 96 898 gar nicht. Die Hauptbedingungen (Q37) sind laut Zusammenfassung am 18.11.2026 zuletzt geändert worden.
- Das passt zum Vermerk im Repo, dass Gemini für den Kinderbetrieb nicht zulässig ist (Googles Bedingungen, `deploy/kunibert.env.example`). Der Vermerk „Für den Kinderbetrieb rechtlich prüfen“ in `deploy/EINRICHTUNG.md` bleibt richtig.
- Einschätzung (vorläufig, 26.11.2026, 18:24 Uhr): Google nicht einschalten, bis Abschnitt 20 im Wortlaut gelesen ist (L2). Das gilt vorsichtshalber auch für Tests mit Erwachsenen, weil sich Kunibert als Ganzes an Kinder richtet. Das Risiko ist hoch, bis der Wortlaut gelesen ist. Fällt Chirp 3 HD nicht darunter, bleiben offene Fragen zum Ton: Rechte, Herkunft der Stimmen, Training.

## Pflichten

| Baustein | Pflicht | Wann sie greift | Heute |
| --- | --- | --- | --- |
| Speaches, `faster-whisper`, CTranslate2, Whisper (MIT) | Lizenz- und Copyright-Hinweis erhalten (Q38) | in Kopien, die wir weitergeben (Einschätzung) | greift nicht: Server-Betrieb |
| `piper-tts` und espeak-ng (GPL) | Quelltext bereitstellen, Lizenzhinweis, gleiche Lizenz, Änderungen kennzeichnen (Q39) | bei Weitergabe von Kopien. Zugriff über das Netz allein ist keine Weitergabe (Q39). | greift nicht: Server-Betrieb |
| Piper-Stimmen | `MODEL_CARD` jeder Stimme mitgeben (Q12) | wenn die Modelldatei an Endnutzer geht (Q12) | greift nicht: Server-Betrieb |
| Stimme des Sprechers (CC0) | keine. Nennung ist erwünscht (Q28). | – | freiwillig, in die Hinweise aufnehmen (N1122-1825-a) |
| Google Cloud Text-to-Speech | Bedingungen von Google Cloud einhalten, auch die Altersgrenze (Q36, offen). Rechte am erzeugten Ton: offen. | immer, wenn Google eingeschaltet ist | Google ist aus |
| Whisper | keine Pflicht aus der Karte. Die Karte warnt davor, Aufnahmen ohne Einwilligung abzuschreiben (Q8). | immer | Einwilligung der Eltern: Datenschutz-Folgenabschätzung |

## Risiken für die Rechtsprüfung

Die Nummern L1 bis L5 gehören neben R1 bis R5 aus `stimme-lizenz.md`. Die Stufen sind meine Einschätzung (vorläufig, 26.11.2026, 18:24 Uhr).

| Nr. | Risiko | Einschätzung | Schritt |
| --- | --- | --- | --- |
| L1 | Piper-Stimme `thorsten`: Die Kopie bei Speaches ist wahrscheinlich die alte, aus `lessac` feinabgestimmte Fassung. Der Korpus schließt kommerzielle Nutzung aus (Q12, Q22, Q26, Q28). | Hoch für ein verkauftes Produkt, wenn die Kopie die alte Fassung ist. Für Tests mit Erwachsenen offen: Die Erlaubnis für `lessac` nennt Forschung (Q12). | N1126-1600-b (Fassung klären), N1126-1600-a (saubere Stimme festlegen) |
| L2 | Google: Altersgrenze 18 für generative KI-Dienste in den Cloud-Bedingungen (nur Zusammenfassung, Q36). Kunibert richtet sich an Kinder von 6 bis 10 Jahren. | Hoch, bis der Wortlaut von Abschnitt 20 gelesen ist (nur Zusammenfassung). Google ist standardmäßig aus. | N1126-1600-c |
| L3 | Whisper: Die Trainingsdaten stammen aus dem Internet, ohne Angabe zu Lizenz oder Einwilligung (Q8). | Nicht bewertbar. Das Risiko liegt beim Anbieter des Modells. | beobachten, kein eigener Punkt |
| L4 | GPL: `piper-tts` und espeak-ng sind GPL. Wird Piper, espeak-ng oder eine Stimme an Kunden weitergegeben (Geräte-Image, Paket), greifen Pflichten (Q12, Q17, Q20, Q39). | Niedrig, solange alles auf dem eigenen Server bleibt. | bei jeder Planung eines Images oder Pakets prüfen |
| L5 | Recht des Sprechers von `thorsten` an seiner Stimme: CC0 regelt es nicht. Eine ausdrückliche Freigabe für Kinderprodukte fand ich nicht (Q28 bis Q31). | Niedrig: Der Sprecher hat Daten und Modell selbst unter CC0 veröffentlicht (Q28, Q30). | keiner |

## Folgerungen für Kunibert (neue Punkte in `docs/autopilot/backlog.md`)

- **N1126-1600-a** · Piper-Rückfall: saubere Stimme festlegen, Skript und Doku anpassen (Rolle Bauen, ändert, was Kinder hören könnten). Nach N1126-1600-b.
- **N1126-1600-b** · Piper-Stimme `thorsten`: Fassung bei Speaches klären (Rolle Recherche). Dazu `docs/COMMERCIAL_USE.md` im Piper-Repository lesen.
- **N1126-1600-c** · Google: Abschnitt 20 der Cloud-Bedingungen im Wortlaut lesen (Rolle Recherche).
- Zu N1122-1825-a (Lizenz-Hinweise in der Doku) und N1122-1825-b (nur freie Stimmen im Betrieb) kommt je eine Stand-Zeile: Die Hinweise sollen auch die Bausteine dieses Dokuments führen. Es soll keinen Rückfall auf Piper im Betrieb geben, bevor L1 geklärt ist.
- Die Aussage in `deploy/EINRICHTUNG.md`, jede Piper-Stimme habe eine eigene Lizenz und müsse vor dem Einsatz mit Kindern geprüft werden, bleibt richtig. Dieses Dokument liefert dazu die Befunde.

## Nicht geprüft

- Die Lizenzdateien selbst: `LICENSE` von Speaches, `faster-whisper` und Whisper. Ich habe nur die Angaben auf den Seiten gelesen. Die Lizenztexte von MIT und GPL kenne ich nur aus der Seite von choosealicense (Q38, Q39), nicht aus den Originalen. Die GNU-Seiten (GPL-FAQ, Affero-Seite) ließen sich nicht abrufen.
- `docs/COMMERCIAL_USE.md` im Piper-Repository. Keine Suche lieferte die Adresse.
- Karte, Lizenzfeld und Dateien der Kopie `speaches-ai/piper-de_DE-thorsten-medium` und der anderen Stimmen im Konto `speaches-ai`. Der Inhalt der `.onnx`-Dateien und die Unterschiede zwischen den Fassungen.
- Das Image 0.8.3 von Speaches (Pakete und Versionen). Gelesen ist nur `pyproject.toml` auf `master`.
- Die Lizenz der Wörterbuchdaten von espeak-ng (die Seite nennt keine eigene Angabe) und ob OpenSLR 95 vom selben Sprecher stammt wie die anderen Aufnahmen.
- Lizenzen von Kokoro (Kunibert nutzt es nicht) und der anderen deutschen Piper-Stimmen (`kerstin`, `karlsson`, `eva_k`, `pavoque`, `ramona`, `mls`, `thorsten_emotional`).
- Google: den Wortlaut von Abschnitt 20 der Service Specific Terms (Definition, Liste der Dienste, Unterabschnitt (d)). Dazu die Additional Product Terms, das Cloud Data Processing Addendum, die Acceptable Use Policy und die Richtlinie für generative KI. Ob der Endpunkt `eu-texttospeech` zur Region `eu` gehört.
- Die Herkunft der Whisper-Trainingsdaten und die LICENSE-Datei von Whisper.
- Die Lizenzen der Gerätesoftware (Pi-Client, Firmware) und der Web-Oberfläche. Sie sind nicht Teil dieses Punkts.
- Wie ein Gericht Ableitung, Persönlichkeitsrecht und Kinderschutz beurteilt. Ich habe nur gelesen, was die Quellen sagen.
- Qualität und Klang der Stimmen. Das ist Sache der Hörtests.

## Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Claude | Die Punkte N1126-1600-a bis -c abarbeiten. Zuerst -b, dann -a. | Repo, `docs/autopilot/backlog.md` |
| Betreiber | Optional, beschleunigt -b: im Browser die Seite `speaches-ai/piper-de_DE-thorsten-medium` öffnen, die Reiter „Model card“ und „Files and versions“ ansehen (Datum, Lizenzfeld) und Claude im Chat sagen, was dort steht. | im Browser auf huggingface.co |
| Betreiber | Optional, beschleunigt -c: auf `cloud.google.com/terms/service-terms` den Abschnitt 20 über generative KI-Dienste öffnen. Steht in der Liste der Dienste „Text-to-Speech“ oder „Chirp“? Was sagt Unterabschnitt (d)? Das Ergebnis Claude im Chat sagen. | im Browser auf cloud.google.com |
| Betreiber | Bis zur Klärung die Piper-Stimme nicht in einem verkauften Gerät einsetzen, Google nicht einschalten (auch nicht für Tests mit Erwachsenen) und das Einrichtungsskript Piper nicht mehr standardmäßig laden lassen (Punkt N1126-1600-a). | Einrichtung des Servers |
| Betreiber | Vor Tests mit Kindern die „Freigabe-Checkliste vor dem ersten Kind“ im Doc „Datenschutz-Folgenabschätzung“ durchgehen. Dieses Dokument ändert daran nichts. | im Chat |
| Claude | Ergebnis und Risiken L1 bis L5 in `claude/aufgaben.md` und ins Doc „Datenschutz-Folgenabschätzung“ vorschlagen (der Lauf „Planen & Bericht“). | Claude-Projekt |

## Quellen

Alle Quellen abgerufen am 26.11.2026. Ein Zitat je Quelle, höchstens 15 Wörter.

| Nr. | Quelle | Gelesen | Zitat |
| --- | --- | --- | --- |
| Q1 | Speaches, GitHub-Hauptseite, https://github.com/speaches-ai/speaches | Wortlaut (28 362 Zeichen) | – (zeigt „MIT license“) |
| Q2 | Speaches, `pyproject.toml` auf `master`, https://github.com/speaches-ai/speaches/blob/master/pyproject.toml | Wortlaut (13 768 Zeichen, 102 Zeilen) | „piper-tts>=1.3.0“ (Zeile in den Abhängigkeiten) |
| Q3 | faster-whisper, GitHub-Hauptseite, https://github.com/SYSTRAN/faster-whisper | Wortlaut (36 774 Zeichen); die verlinkte Lizenzdatei nicht geöffnet | – (zeigt „MIT license“) |
| Q4 | CTranslate2, Lizenzdatei, https://github.com/OpenNMT/CTranslate2/blob/master/LICENSE | Wortlaut (11 969 Zeichen, 22 Zeilen) | „MIT License“ (erste Zeile) |
| Q5 | CTranslate2, GitHub-Hauptseite, https://github.com/OpenNMT/CTranslate2 | Wortlaut (35 278 Zeichen) | – (Seitenleiste zeigt „MIT license“) |
| Q6 | Modellkarte `Systran/faster-whisper-small`, https://huggingface.co/Systran/faster-whisper-small | Wortlaut (7 078 Zeichen) | – (Kopfzeile „License: mit“) |
| Q7 | OpenAI Whisper, GitHub-Hauptseite, https://github.com/openai/whisper | Wortlaut (27 942 Zeichen) | „Whisper's code and model weights are released under the MIT License.“ |
| Q8 | Whisper, Modellkarte, https://github.com/openai/whisper/blob/main/model-card.md | Wortlaut (18 179 Zeichen) | „collected from the internet“ (Abschnitt zu den Trainingsdaten) |
| Q9 | Piper (älteres Projekt), GitHub-Hauptseite, https://github.com/rhasspy/piper | Wortlaut (18 482 Zeichen); der README-Text war nicht enthalten | „Development has moved“ (Hinweis oben auf der Seite) |
| Q10 | Piper (älteres Projekt), Lizenzdatei, https://github.com/rhasspy/piper/blob/master/LICENSE.md | Wortlaut (12 089 Zeichen, 21 Zeilen) | „MIT License“ (erste Zeile, Jahr 2022) |
| Q11 | Piper (Nachfolger), GitHub-Hauptseite, https://github.com/OHF-Voice/piper1-gpl | Wortlaut (24 602 Zeichen) | – (Seitenleiste zeigt „GPL-3.0 license“) |
| Q12 | Piper (Nachfolger), `docs/LICENSING.md`, https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md | Wortlaut (16 069 Zeichen, 104 Zeilen); kein Datum | „excludes commercial use of the resulting synthesis“ (Abschnitt über die Grundstimme lessac) |
| Q13 | Piper (Nachfolger), `docs/VOICES.md`, https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md | Wortlaut (13 638 Zeichen, 63 Zeilen); kein Datum | „Some voices may have restrictive licenses, however, so please review them carefully!“ (Abschnitt zu den Modellen) |
| Q14 | Piper (Nachfolger), PR 356 zu Lizenzen und kommerzieller Nutzung, zusammengeführt am 9.11.2026, https://github.com/OHF-Voice/piper1-gpl/pull/356 | Wortlaut (15 065 Zeichen): Beschreibung und Commit-Text; die angelegten Dateien selbst nicht | „Neither page is legal advice.“ |
| Q15 | Piper (Nachfolger), PR 357 zur Liste frei nutzbarer Stimmen, zusammengeführt am 11.11.2026, https://github.com/OHF-Voice/piper1-gpl/pull/357 | Wortlaut (15 076 Zeichen): Beschreibung und Commit-Text | „so their whole training chain permits commercial use.“ |
| Q16 | Piper (Nachfolger), Issue 314 zu `lessac`-Stimmen, eröffnet am 28.9.2026, https://github.com/OHF-Voice/piper1-gpl/issues/314 | Wortlaut (13 572 Zeichen): Beschreibung und Aktivität; beim Lesen offen, ohne Antwort | „we need the actual applicable grant before using these weights.“ |
| Q17 | `piper-tts` 1.3.0 auf PyPI (10.7.2025), https://pypi.org/project/piper-tts/1.3.0/ | Wortlaut (43 212 Zeichen) | „embeds espeak-ng for phonemization“ (Beschreibung; Lizenz GPL-3.0-or-later) |
| Q18 | `piper-tts` 1.1.0 auf PyPI (27.7.2023), https://pypi.org/project/piper-tts/1.1.0/ | Wortlaut (21 527 Zeichen) | „OSI Approved :: MIT License“ (Klassifizierer) |
| Q19 | `piper-tts`, neueste Version 1.8.0 auf PyPI (4.9.2026), https://pypi.org/project/piper-tts/ | Wortlaut der ersten 39 956 von 68 080 Zeichen, der Rest als Zusammenfassung. Lizenz und Links stehen im Wortlaut. | – (Lizenz GPL-3.0-or-later) |
| Q20 | eSpeak NG, GitHub-Hauptseite, https://github.com/espeak-ng/espeak-ng | Wortlaut (32 459 Zeichen) | – (Lizenzabschnitt: GPL ab Version 3, Angabe sinngemäß; eine Datei unter BSD-2-Clause; die Seitenleiste nennt zusätzlich Apache-2.0) |
| Q21 | Piper-Stimme `thorsten` medium, Karte auf `main`, https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD | Wortlaut (7 302 Zeichen, Länge der abgerufenen Seite); Commit `cf910fb`, laut Seite vor 16 Tagen | „Retrain voices from the rdh and hifi_tts_92 bases“ (Titel des Commits) |
| Q22 | Dieselbe Karte, ältere Fassung im Zweig `pr/10`, https://huggingface.co/rhasspy/piper-voices/raw/refs%2Fpr%2F10/de/de_DE/thorsten/medium/MODEL_CARD | Wortlaut (285 Zeichen) | „Finetuned from U.S. English lessac voice (medium quality).“ |
| Q23 | Ordnerliste `thorsten/medium` auf `main`, https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE/thorsten/medium | Wortlaut (5 861 Zeichen) | „Add v1.0 and v0.2 voices“ (Titel des letzten Commits von Karte und Modelldatei, laut Liste vor über drei Jahren) |
| Q24 | Ordnerliste `thorsten/medium` im Tag `v1.0.0`, https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/de/de_DE/thorsten/medium | Wortlaut (5 872 Zeichen) | – (Karte 285 Byte, Modelldatei 63,2 MB, Ordner 63,3 MB) |
| Q25 | Commit-Verlauf des Ordners `thorsten/medium` (Stand `fdd9ff5`), https://huggingface.co/rhasspy/piper-voices/commits/fdd9ff593f474a02a17a0f0745b8c8c7ea9829c2/de/de_DE/thorsten/medium | Wortlaut (2 668 Zeichen); nur drei Einträge sichtbar | „Add native names“ (neuester sichtbarer Commit, 23.9.2023) |
| Q26 | Hugging-Face-Konto `speaches-ai`, Liste der Modelle, https://huggingface.co/speaches-ai/models | Wortlaut (7 931 Zeichen); 30 von 127 Modellen gezeigt | „Updated Mar 21, 2025“ (Eintrag `piper-de_DE-thorsten-medium`) |
| Q27 | `speaches-ai`, Stimme `piper-de_DE-mls-medium` (Nachbarseite), https://huggingface.co/speaches-ai/piper-de_DE-mls-medium | Wortlaut (5 436 Zeichen); Lizenzfeld, Karte und Dateiliste nicht im Lesestand | – (Schlagwörter: Text-to-Speech, ONNX, Piper, German) |
| Q28 | Piper-Modell `Piper-Thorsten-CC0` auf Hugging Face, vom Sprecher veröffentlicht, https://huggingface.co/Thorsten-Voice/Piper-Thorsten-CC0 | Wortlaut (17 974 Zeichen); kein Datum | „no lessac checkpoint or any other third-party model“ (Abschnitt zur Herkunft) |
| Q29 | OpenSLR 95, https://www.openslr.org/95 | Wortlaut (2 655 Zeichen) | „Creative Commons (CC0) Licence“ |
| Q30 | Zenodo, Datensatz 2022.10, https://zenodo.org/records/7265581 | Wortlaut (8 932 Zeichen) | – (zeigt „Creative Commons Zero v1.0 Universal“) |
| Q31 | GitHub-Seite des Datensatzes (die Adresse steht auf der Karte Q21, sie enthält einen Personennamen und steht deshalb nicht hier) | Wortlaut (37 038 Zeichen); kein Datum der README | – (Repo-Angabe „CC0-1.0 license“) |
| Q32 | Google, Seite zu Chirp 3: HD, https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd | Wortlaut (46 716 Zeichen); Seite geändert am 19.11.2026 | – (zeigt „Last updated 2026-11-19 UTC.“) |
| Q33 | Google, Produktseite Cloud Text-to-Speech, https://cloud.google.com/text-to-speech | Wortlaut (33 702 Zeichen); kein Datum | „You must be 18 or older to use it.“ (Hinweis unter dem Werkzeug zur Lösungssuche) |
| Q34 | Google, Seite „Data logging“ zu Text-to-Speech, https://docs.cloud.google.com/text-to-speech/docs/data-logging | Wortlaut (etwa 10 640 Zeichen); Seite geändert am 10.11.2026 | „Google does not log any customer Cloud TTS text or audio data.“ |
| Q35 | Google, Seite zu COPPA, https://cloud.google.com/security/compliance/coppa | Wortlaut (23 144 Zeichen); kein Datum | – (nennt nur Kerndienste von Google Workspace for Education) |
| Q36 | Google Cloud, Service Specific Terms, https://cloud.google.com/terms/service-terms | Wörtlich nur die ersten 39 947 von 236 845 Zeichen (fast nur Menü). Etwa 100 000 Zeichen als Zusammenfassung des Werkzeugs, die letzten 96 898 nicht gelesen. | – (Abschnitt 20, Unterabschnitt (d) nur aus der Zusammenfassung) |
| Q37 | Google Cloud, Terms of Service (Übersicht der Vertragsdokumente), https://cloud.google.com/terms | Wörtlich nur die ersten 39 961 von 116 775 Zeichen (Menü), der Rest als Zusammenfassung | – (laut Zusammenfassung zuletzt geändert am 18.11.2026) |
| Q38 | choosealicense.com, MIT License, https://choosealicense.com/licenses/mit/ | Wortlaut (5 517 Zeichen); Zusammenfassung der Lizenz, nicht der Lizenztext | – (Bedingung: „License and copyright notice“) |
| Q39 | choosealicense.com, GNU GPL v3.0, https://choosealicense.com/licenses/gpl-3.0/ | Wortlaut (40 480 Zeichen); enthält auch den Lizenztext | „Mere interaction with a user through a computer network“ (Lizenztext, Abschnitt 0) |
| Q40 | Dieselbe Karte wie Q21 (Karte der Stimme `thorsten` auf `main` bei `rhasspy/piper-voices`), zweite Lesung durch einen Prüfer, https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD | Zusammenfassung des Abrufwerkzeugs, Rohseite nicht gesehen; gelesen am 26.11.2026 | „License: mit“ (Angabe zum Repository, nicht zur Datei) |
