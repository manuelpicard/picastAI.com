# Lizenz der Stimme stuart_bell und von Pocket TTS

Stand: 22.11.2026 · Punkt H5 der Arbeitsliste · Wochen-Autopilot, Rolle Recherche.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

Die Quellen Q1 bis Q13 stehen am Ende, mit Abrufdatum und einem kurzen Zitat. „Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. Namen von Sprechern stehen hier nur so, wie Kyutai sie veröffentlicht (`stuart_bell`). Über Privatpersonen wurde nichts weiter gesucht.

## Kurzfassung

**Frage:** Darf Kunibert die Pocket-Stimme `stuart_bell` und das Modell Pocket TTS in einem verkauften Produkt nutzen?

**Antwort (Einschätzung):** Ja, nach den Quellen, die ich lesen konnte. Es gelten drei Pflichten. Bei der Stimme bleibt ein Restrisiko.

- **Programm** `pocket-tts` 4.0.1: MIT-Lizenz. Verkauf erlaubt.
- **Gewichte** des Modells (auch das deutsche): CC BY 4.0. Der Lizenztext kennt keine Beschränkung auf nicht-kommerzielle Nutzung. Dazu kommt eine Verbotsliste („Prohibited use“) von Kyutai.
- **Stimme** `stuart_bell`: Kyutai führt sie im Ordner `voice-zero` unter CC0. Die Aufnahmen stammen von LibriVox. CC0 erlaubt jede Nutzung, auch geschäftlich, aber nur für die Rechte, die der Erklärende selbst hält. Rechte anderer Personen, zum Beispiel des Sprechers, klärt CC0 nicht (Q10).

**Die drei Pflichten:**

1. Die Verbotsliste einhalten. Keine Stimme eines echten Menschen ohne Einwilligung klonen. Keine Täuschung.
2. Kyutai nennen (Doku, Elterninformation). Nach dem Lizenztext nötig, sobald die Gewichte (oder die damit gerechneten Stimm-Vektoren, Q3) auf Geräte oder zu Kunden gehen. Beim reinen Server-Betrieb wahrscheinlich nicht, aber es kostet wenig.
3. Die Bedingungen auf Hugging Face akzeptieren. Das ist Sache des Betreibers (Kontoinhaber).

**Das Restrisiko:** Die Kette hinter dem CC0-Etikett (Sprecher bei LibriVox, dann Voice-Zero, dann Kyutai) konnte ich nicht bis zum Ursprung lesen. Die Seite von Voice-Zero war für mich gesperrt. Keine gelesene Quelle sagt, dass der Sprecher einer KI-Stimme zugestimmt hat. Die Stimme ist nur eine Einstellung. Sie lässt sich tauschen (Abschnitt „Alternativen im Katalog“).

**Nicht verwenden:** die Katalogstimmen `cosette` und `jean` (nicht-kommerzielle Lizenz) sowie `juergen`, `giovanni`, `lola` und `rafael` (Lizenz nicht angegeben).

## Was Kunibert heute nutzt

- Die Standardstimme ist `stuart_bell` (`DEFAULT_POCKET_VOICE` in `server-api/pocket-speech.ts`). Der Betreiber hat sie am 13.11.2026, 16:46, nach dem Hörtest gewählt. Der Sprecher spricht Englisch. Das deutsche Modell spricht mit seiner Stimmfarbe Deutsch.
- Der Dienst startet so: `uvx --python 3.12 pocket-tts@4.0.1 serve --language german --default-voice stuart_bell --host 127.0.0.1 --port 8001` (`deploy/CHECKLISTE.md`, `.env.example`, `pi-client/README.md`). Er läuft auf demselben Server wie Kunibert.
- Pocket TTS bekommt nur Text von Kunibert. Es hört keine Kinderstimmen.
- Die Stimme kommt aus `PICASTAI_POCKET_TTS_VOICE`. Der Server prüft nur die Form: ein Name, eine `hf://`- oder eine `https://`-Adresse (`isValidPocketVoice` in `server-api/pocket-speech.ts`, Warnungen in `server-api/config.ts`). Die Lizenz prüft er nicht.

## Befunde

### Programm (Code)

- Die GitHub-Seite des Projekts zeigt „MIT license“ (Q2).
- Das Paket `pocket-tts` 4.0.1 von PyPI enthält eine Lizenzdatei mit dem MIT-Text. Die Datei beginnt ohne Zeile mit einem Copyright-Inhaber (Q3).
- MIT erlaubt Nutzen, Kopieren, Ändern und Verkaufen. Die Pflicht: den Lizenztext beilegen, wenn man Kopien weitergibt.
- Kunibert gibt den Code nicht weiter. Der Server lädt ihn per `uvx`. Die Pflicht greift erst, wenn wir ihn in Geräte-Images oder Pakete legen.

### Gewichte (Modell)

- Die Modellkarte zeigt in der Kopfzeile die Lizenz `cc-by-4.0`. Dieselbe Zeile steht bei der Variante „ohne Stimmklonen“ (Q1, Q7). Warum es diese Variante gibt, steht dort nicht.
- Der Rechtstext von CC BY 4.0 enthält keine Beschränkung auf nicht-kommerzielle Nutzung. „NonCommercial“ kommt nicht vor (Q11). Einschätzung: Verkauf ist erlaubt.
- Namensnennung (CC BY 4.0, Abschnitt 3(a)): Wer das Material „teilt“, behält mitgelieferte Angaben bei (Urheber, Copyright-Hinweis, Lizenzhinweis, Haftungsausschluss, Link). Er verweist auf die Lizenz und gibt Änderungen an. Das darf auf jede angemessene Art geschehen, passend zum Medium. Oft genügt ein Link (Q11).
- „Teilen“ heißt: Material der Öffentlichkeit bereitstellen, zum Beispiel durch Vervielfältigen, öffentliches Zeigen oder Vorführen, Verbreiten oder öffentliches Bereitstellen (Q11).
- Einschätzung: Auf unserem Server läuft das Modell. Die Gewichte gehen nicht an Kunden. Wir „teilen“ sie dann wahrscheinlich nicht. Ob die erzeugte Sprache selbst unter die Lizenz fällt, sagt der Text nicht. Nach dem Lizenztext ist die Nennung nötig, sobald die Gewichte oder die damit gerechneten Stimm-Vektoren an Geräte oder Kunden gehen, zum Beispiel bei einer Sprachausgabe direkt am Gerät. Die Stimmdatei selbst (CC0) verlangt keine Nennung.
- Außerdem gilt (CC BY 4.0, Abschnitt 2(a)(6)): Man darf nicht den Eindruck erwecken, Kyutai unterstütze das Produkt.
- CC BY 4.0 lizenziert Persönlichkeitsrechte nicht (Q11, Abschnitt 2(b)(1)). Einschätzung: Rechte von Menschen an ihrer Stimme gibt diese Lizenz also nicht frei.
- Das Repository ist „gated“: Die Karte verlangt, die Bedingungen zu akzeptieren, bevor man Dateien erhält. Die Bedingung ist die Verbotsliste (Q1).
- Die Verbotsliste (Q1, gleicher Wortlaut im README des Pakets, Q3): Die Nutzung muss die Gesetze einhalten. Sie darf nichts Rechtswidriges, Schädliches, Täuschendes, Betrügerisches oder Unbefugtes bewirken oder erleichtern. Verboten ist unter anderem, Stimmen ohne ausdrückliche und rechtmäßige Einwilligung nachzuahmen oder zu klonen. Verboten sind auch Falschmeldungen und Täuschung, zum Beispiel Erzeugtes als echte Aufnahme echter Menschen auszugeben. Verboten sind rechtswidrige, beleidigende, belästigende, diskriminierende, hasserfüllte und private Rechte verletzende Inhalte. Kyutai schließt die Haftung für Verstöße aus.
- Einschätzung: Kunibert erzeugt Geschichten aus Claude-Text. Er ahmt keine echten Menschen nach. Die Verbotsliste ist erfüllt, solange keine Aufnahme einer echten Person ohne Einwilligung als Stimme dient und die Stimme als KI-Stimme kenntlich ist (Punkt H3).

### Stimme `stuart_bell`

Was die Quellen sagen:

- Q1 und Q3 führen `stuart_bell` (en) mit Verweis auf die Datei `voice-zero/stuart_bell.wav` im Repo `kyutai/tts-voices`. Kyutai nennt sie auf der eigenen Seite „Stuart Bell (m, reading)“ (Q5).
- Die Stimmen der Liste sind vorberechnete Vektoren („embeddings“), gerechnet mit den veröffentlichten Gewichten (Q3).
- Die Karte des Stimmenkatalogs nennt für den Abschnitt `voice-zero` die Lizenz CC0. Sie beschreibt ihn als Auswahl von Stimmen von LibriVox (Q4). Kyutai hat nur Stimmen übernommen, die Pocket TTS standardmäßig nutzt. Für die anderen verweist die Karte auf das Voice-Zero-Repository. Den Sprecher nennt die Karte nicht (Q4).
- LibriVox sagt: Alle Aufnahmen sind gemeinfrei („public domain“). Wer dort freiwillig einspricht, stimmt dieser Freigabe zu. Geschäftliche Nutzung, Ändern und Mischen sind erlaubt. Eine Nennung ist nicht nötig. Unter den bekannten Nutzungen steht auch das Training von KI-Modellen. LibriVox folgt dem Recht der USA (Q8).
- Creative Commons schrieb 2006, LibriVox gebe die Aufnahmen unter der „Public Domain Dedication“ frei (Q9).
- CC0 (Q10): Der Erklärende verzichtet auf Urheberrechte und verwandte Schutzrechte, soweit das Recht es zulässt, für jeden Zweck, auch geschäftlich. Wirkt der Verzicht nicht, gilt eine unwiderrufliche Ersatzlizenz. Der Text zählt zu diesen Rechten auch die „moral rights“ von Autoren und Interpreten und Persönlichkeitsrechte am Abbild einer Person im Werk. Das gilt nur, soweit der Erklärende sie hält. Ob eine Stimme unter „Abbild“ fällt, sagt der Text nicht. Der Erklärende lehnt es ab, Rechte anderer Personen oder nötige Einwilligungen zu klären (Q10).

Was die gelesenen Quellen **nicht** sagen:

- ob der Sprecher selbst CC0 erklärt hat oder nur die Gemeinfreiheit von LibriVox gilt;
- ob der Sprecher einer KI-Stimme zugestimmt hat. Q8 nennt KI-Training als bekannte Nutzung, aber weder Stimmklonen noch Sprachsynthese. Q9 sagt dazu nichts;
- ob der Sprecher seine Freigabe zurücknehmen kann. LibriVox warnt Leser eher, dass sie die Kontrolle über ihre Aufnahmen abgeben (Q8);
- ob die Freigabe der Aufnahmen auch nach deutschem Recht wirkt;
- wer der Sprecher ist, welches Buch er las und wie Voice-Zero die Aufnahme ausgewählt hat. Die Seite von Voice-Zero konnte ich nicht lesen.

Einschätzung:

- Das Lizenz-Etikett ist eindeutig (CC0). Kyutai liefert die Stimme selbst als eingebaute Stimme aus.
- Die Kette dahinter ist dünn belegt. Für Tests und Vorführungen mit Erwachsenen reicht sie nach meiner Einschätzung. Für den Verkauf bleibt ein Restrisiko: Rechte des Sprechers an seiner Stimme. Es ist wahrscheinlich klein, denn er liest als Laie, das deutsche Modell klingt anders, und Kunibert nennt keinen Namen.
- Trifft das Risiko ein, wäre die mögliche Folge eine Unterlassungsforderung. Das Gegenmittel ist, die Stimme zu tauschen. Dafür sollten Alternativen vorab gehört sein.

### Alternativen im Katalog

Lizenz je Ordner laut Karte des Stimmenkatalogs (Q4). Die Zuordnung der Pocket-Namen zu den Ordnern steht im README von Pocket TTS (Q1, Q3).

| Ordner | Lizenz laut Karte | Pocket-Stimmen | Für ein verkauftes Produkt |
| --- | --- | --- | --- |
| `voice-zero` | CC0 | `stuart_bell` und drei weitere | ja, mit dem Restrisiko oben |
| `voice-donations` | CC0 | `javert`, `marius` | ja, mit Vorbehalt (Policy ungelesen, Löschung möglich); Einwilligung der Spender klarer belegt (siehe unten) |
| `vctk` | CC BY 4.0 | `anna`, `azelma`, `charles`, `eponine`, `eve`, `fantine`, `george`, `jane`, `mary`, `michael`, `paul`, `vera` | ja, mit Namensnennung der Quelle |
| `alba-mackenna` | CC BY 4.0 | `alba` | ja, mit Namensnennung |
| `unmute-prod-website` | je Datei; eigene Aufnahmen von Kyutai laut Karte CC0 | `estelle` (fr) | wahrscheinlich ja (CC0 laut Karte), aber Französisch und ungehört |
| `expresso` | CC BY-NC 4.0 (laut Karte nur nicht-kommerziell) | `cosette` | **nein** |
| `ears` | CC BY-NC 4.0 (laut Karte nur nicht-kommerziell) | `jean` | **nein** |
| Modell-Repo, Branch `add_lang_not_documented` | nicht angegeben | `juergen` (de), `giovanni`, `lola`, `rafael` | **unklar, nicht verwenden** |

Spender-Stimmen (`voice-donations`):

- Die Bedingungen des Spendenprojekts (Q6, Fassung vom 26.6.2025) sagen: Spender geben Kyutai eine dauerhafte, nicht ausschließliche Lizenz. Sie stimmen zu, dass ihre Stimme für Sprache genutzt werden kann, die sie nicht selbst gesprochen haben (Zitat in Q6). Die Nutzer des veröffentlichten Datensatzes dürfen ihn auch geschäftlich nutzen, nach Kyutais „Acceptable Use Policy“. Deren Text steht in den Bedingungen nicht, und ich habe ihn nicht gelesen.
- Spender können die Löschung verlangen. Kyutai sagt nur zu, sich zu bemühen, sie aus einer anstehenden Veröffentlichung und aus den eigenen Datenbanken zu nehmen. Für schon veröffentlichte Kopien sagen die Bedingungen nichts (Q6). Die Stimme könnte also später aus dem Katalog verschwinden.
- Die Bedingungen nennen `javert` und `marius` nicht. Dass sie zum Spendenprojekt gehören, folgt aus dem Ordner `voice-donations` (Q1, Q3, Q4).
- Einschätzung: Die Einwilligung ist hier klarer belegt als bei `voice-zero`. Offen bleiben die Rücknahme und die Policy. Ob die Stimmen für Kunibert taugen (Klang, Deutsch), ist ungehört. Das entscheidet ein Hörtest des Betreibers.

### Trainingsdaten

- Das Paper zur Methode (Q12) trainiert sein TTS-Modell auf 88 000 Stunden „öffentlicher Datensätze“. Anhang D nennt: AMI, EARNINGS22, GigaSpeech, SPGISpeech, TED-LIUM, VoxPopuli, LibriHeavy und Emilia. Lizenzen der Datensätze nennt das Paper nicht. Der Eintrag zu Emilia im Literaturverzeichnis ist ein Platzhalter.
- Pocket TTS beschreibt das Paper nur kurz: 100 Millionen Parameter, aus einem größeren Modell herausdestilliert (Anhang F). Die Daten für Pocket TTS und für die deutschen Gewichte nennt es nicht (Q12).
- Der technische Bericht von Kyutai lieferte eine leere Seite. `training/README.md` war gesperrt. Beide konnte ich nicht lesen.
- Einschätzung: Für Kunibert ist das Risiko wahrscheinlich klein, aber nicht null. Wer wofür haftet, ist ungeprüft. Die Lizenzen der Datensätze habe ich nicht geprüft.

### Verwechslungsgefahr

Eine Suche nach der Lizenz von Pocket TTS lieferte die Kennung arXiv 2603.25551. Das ist das Paper zu **Voxtral TTS** (Mistral), nicht zu Pocket TTS. Dessen Gewichte stehen unter CC BY-NC, also nicht für den Verkauf (Q13). Es hat mit Kunibert nichts zu tun.

## Pflichten

1. **Verbotsliste einhalten.** Keine Stimme eines echten Menschen ohne Einwilligung klonen. Das gilt auch für Eltern- oder Kinderstimmen als Stimmvorlage, falls so etwas je gebaut wird. Dann eigene Prüfung vorher.
2. **Kyutai nennen.** Textvorschlag unten. Nach dem Lizenztext nötig, sobald die Gewichte oder die damit gerechneten Stimm-Vektoren an Geräte oder Kunden gehen.
3. **Hugging-Face-Bedingungen akzeptiert haben.** Wer das Konto hat, hat zugestimmt. Wer, wann und mit welchem Konto, steht nirgends im Repo. Das weiß nur der Betreiber. Kein Token ins Repo oder in den Chat.
4. **Nur freie Stimmen wählen.** Nicht `cosette` und `jean` (nicht-kommerziell), nicht `juergen`, `giovanni`, `lola` und `rafael` (Lizenz nicht angegeben). Nur Stimmen aus der Tabelle mit „ja“.
5. **KI-Stimme kenntlich machen** (KI-Verordnung, Art. 50). Das klärt Punkt H3.
6. **Nachweis sichern.** Version `pocket-tts@4.0.1`, Stand der Karten (22.11.2026), Dateiname der Stimme (`voice-zero/stuart_bell.wav`). Dieses Dokument ist der Nachweis.

### Textvorschlag für die Nennung (Entwurf, nichts veröffentlichen)

> Sprachausgabe: Pocket TTS von Kyutai (https://huggingface.co/kyutai/pocket-tts), Lizenz CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Das Programm steht unter der MIT-Lizenz. Die Stimme stammt aus dem frei nutzbaren Stimmenkatalog von Kyutai (CC0). Kyutai hat dieses Produkt weder geprüft noch empfohlen.

Den Namen des Sprechers nennen wir dabei nicht. CC0 und LibriVox verlangen keine Nennung. Ob ein Name in Werbung oder auf Verpackungen erlaubt ist, sagen die Quellen nicht (Q8).

## Risiken für die Rechtsprüfung

Diese Punkte gehören in die Liste der Restrisiken:

- **R1:** Einwilligung des Sprechers von `stuart_bell` zur KI-Stimme nicht belegt (siehe oben).
- **R2:** Eine falsch gesetzte Stimme (`cosette`, `jean`) wäre ein Lizenzverstoß. Der Server prüft nur die Form.
- **R3:** Die Zustimmung zur Verbotsliste ist an ein Konto gebunden und nirgends festgehalten.
- **R4:** Die Lizenzen der Trainingsdaten sind ungeprüft.
- **R5:** Der Server nimmt `hf://`- und `https://`-Adressen als Stimme an. Jede Aufnahme wäre dann eine Vorlage zum Klonen. Das ist eine Einstellung des Betreibers, nichts, was ein Kind auslösen kann. Trotzdem: Klonen ohne Einwilligung steht auf der Verbotsliste.

## Folgerungen für Kunibert (neue Punkte in `docs/autopilot/backlog.md`)

- **N1122-1825-a** (Bauen, Prio 2): Lizenz-Hinweise für Pocket TTS in die Doku, mit dem Textvorschlag oben. Nur Doku.
- **N1122-1825-b** (Bauen, Prio 3, ändert, was Kinder hören): Der Server warnt bei nicht freier Stimme und schaltet die Sprachausgabe im Betrieb ab. Heute heißt „aus“: eine leere Audiodatei, das Kind hört nichts (`server.ts`, `server-api/voice.ts`). Darum ist es ein eigener PR mit „(ändert, was Kinder hören)“. Das schließt R2 und R5.
- **N1122-1825-c** (Recherche, Prio 2): Herkunft von `stuart_bell` bis zum Ursprung (Voice-Zero, LibriVox). Das schließt die Lücke bei R1.
- **N1122-1825-d** (Recherche, Prio 3): Lizenzen der acht Trainings-Datensätze und Trainingsdaten der deutschen Gewichte. Das schließt R4.
- **N1122-1825-e** (Recherche, Prio 2): Lizenzen der übrigen Sprachbausteine (Spracherkennung, Rückfall-Stimme Piper, Speaches). H5 deckt sie nicht ab.

## Nebenbefund (nicht Teil der Lizenzfrage)

Das README von Pocket TTS nennt für andere Sprachen größere Varianten mit 24 Schichten. Sie haben laut README höhere Qualität, sind aber langsamer. Als Beispiel steht `italian_24l` (Q3). Ob es `german_24l` gibt und ob der Server sie schnell genug spielt, ist offen.

## Nicht geprüft

- Das Repository **Voice-Zero** auf GitHub. Der Abruf war gesperrt (die Genehmigung blieb unbeantwortet). Damit fehlen Sprecher, Buch, Auswahl und die Begründung für CC0.
- Der **technische Bericht** von Pocket TTS (leere Seite), `training/README.md` und die LICENSE-Seite auf GitHub (gesperrt). Den Lizenztext habe ich stattdessen aus dem PyPI-Paket 4.0.1 gelesen. Er gilt für diese Version.
- Die GitHub-Seite von Pocket TTS nur zu etwa drei Vierteln wörtlich. Der Rest kam als Zusammenfassung.
- Die **Lizenzen der Datensätze** hinter dem Training (AMI, EARNINGS22, GigaSpeech, SPGISpeech, TED-LIUM, VoxPopuli, LibriHeavy, Emilia).
- Kyutais „Acceptable Use Policy“ und ihre Datenschutzerklärung (nicht verlinkt, leere Seite).
- Die Dateien selbst: Ich habe weder die Stimmdatei noch die Gewichte geladen oder gehört.
- Ob der Download der Gewichte auf dem Server ein Hugging-Face-Konto braucht. Die Karte sagt: Zustimmung nötig.
- Recht: Stimm- und Persönlichkeitsrechte nach deutschem und EU-Recht, Wirkung von CC0 und „public domain“ in Deutschland. Hier steht keine Quelle dazu.
- Nicht Teil von H5: Piper-Stimme `thorsten`, Whisper-Modell, Speaches und die Google-Stimme (Punkt N1122-1825-e).
- Die Quellen habe ich über den Abruf-Dienst dieser Sitzung gelesen (Unteragenten mit Claude Sonnet). Ich gebe ihren Wortlaut gekürzt wieder.

## Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Betreiber | Prüfen, ob sein Hugging-Face-Konto die Bedingungen von `kyutai/pocket-tts` akzeptiert hat, und ob der Server-Download dieses Konto braucht. Datum notieren. Kein Token in Repo oder Chat. | im Browser auf huggingface.co |
| Betreiber | Optional: das Voice-Zero-Repository lesen (Link auf der Karte des Stimmenkatalogs, Q4) und Claude sagen, woher `stuart_bell` kommt und wie CC0 begründet wird. | im Browser |
| Betreiber | Entscheiden: bleibt `stuart_bell` für den Verkauf, oder Hörtest mit `javert` und `marius`? | im Chat |
| Claude | Punkte N1122-1825-a bis -e abarbeiten. | Repo, `docs/autopilot/backlog.md` |
| Claude | Ergebnis und Risiken R1 bis R5 in `claude/aufgaben.md` und ins Doc „Datenschutz-Folgenabschätzung“ vorschlagen (der Lauf „Planen & Bericht“). | Claude-Projekt |

## Quellen

Alle Seiten abgerufen am 22.11.2026. Ein Zitat je Quelle, höchstens 15 Wörter.

| Nr. | Quelle | Gelesen | Zitat |
| --- | --- | --- | --- |
| Q1 | Modellkarte Pocket TTS, https://huggingface.co/kyutai/pocket-tts | ganz | „voice impersonation or cloning without explicit and lawful consent“ (Abschnitt „Prohibited use“) |
| Q2 | GitHub-Seite, https://github.com/kyutai-labs/pocket-tts | zu etwa drei Vierteln wörtlich | – (zeigt „MIT license“) |
| Q3 | Paket `pocket-tts` 4.0.1, Wheel von PyPI (https://pypi.org/project/pocket-tts/) mit `pip download pocket-tts==4.0.1 --no-deps` geladen, nichts ausgeführt | Lizenzdatei ganz; README in den Teilen zu Sprachen, Stimmen, Modellen und Verbotsliste | „The pre-made voices listed above are embeddings precomputed with our released weights“ |
| Q4 | Karte des Stimmenkatalogs, https://huggingface.co/kyutai/tts-voices | nur die Karte (Dateiliste gesperrt) | „A couple of voices from Voice-Zero, a curated selection of voices from LibriVox.“ |
| Q5 | Kyutai, Seite zu TTS, https://kyutai.org/tts/ | ganz | – (Eintrag „Stuart Bell (m, reading)“) |
| Q6 | Bedingungen „Unmute Voice Donation Project“, Fassung vom 26.6.2025, https://kyutai.org/legal/Terms%20of%20Use%20-%20Unmute%20Voice%20Donation%20Project%20v1.pdf | ganz | „generate speech or content that you did not personally create or authorize“ |
| Q7 | Modellkarte „ohne Stimmklonen“, https://huggingface.co/kyutai/pocket-tts-without-voice-cloning | ganz | – (Kopfzeile `cc-by-4.0`) |
| Q8 | LibriVox-Wiki „Copyright and Public Domain“ (zuletzt geändert 5.8.2026), https://wiki.librivox.org/index.php/Copyright_and_Public_Domain | ganz | „LibriVox follows the copyright laws of the United States“ |
| Q9 | Creative Commons, Beitrag „LibriVox“ vom 5.12.2006, https://creativecommons.org/2006/12/05/librivox/ | ganz | „released to the public under the Creative Commons Public Domain Dedication“ |
| Q10 | CC0 1.0, Rechtstext, https://creativecommons.org/publicdomain/zero/1.0/legalcode | ganz | „disclaims responsibility for obtaining any necessary consents, permissions or other rights“ (Abschnitt 4) |
| Q11 | CC BY 4.0, Rechtstext, https://creativecommons.org/licenses/by/4.0/legalcode | ganz | „nor are publicity, privacy, and/or other similar personality rights“ (Abschnitt 2(b)(1)) |
| Q12 | Paper „Continuous Audio Language Models“, arXiv 2509.06926, Fassung 3 vom 13.1.2026, https://arxiv.org/abs/2509.06926 (HTML: https://arxiv.org/html/2509.06926v3) | ganz | „a mix of public datasets totalizing to 88k hours of speech“ |
| Q13 | Paper „Voxtral TTS“ (Mistral), arXiv 2603.25551, Fassung 2 vom 6.4.2026, https://arxiv.org/abs/2603.25551 | zu etwa vier Fünfteln wörtlich | „We release the model weights under a CC BY-NC license.“ |
