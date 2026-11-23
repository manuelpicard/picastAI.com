# Vorgaben für ein Serienprodukt

**Stand: 23.11.2026** (Abrufe am selben Tag, etwa 12:00 bis 12:30 Uhr, durch Unteragenten dieses Laufs) · Punkt H2 der Arbeitsliste · Wochen-Autopilot, Rolle Recherche. Der Stand gilt nur für diesen Tag. Fristen werden verschoben; siehe „Nicht geprüft“.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

Es wurde nichts bestellt, nichts angefragt, kein Konto angelegt und kein Formular benutzt.

So liest man das Dokument: „Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. „Nicht belegt“ heißt: Ich habe es in keiner geöffneten Quelle gelesen. Die Quellen Q1 bis Q37 stehen vor „Nicht geprüft“, mit Link, Abrufdatum und einem kurzen Zitat. Im Text stehen keine Zitate. **Die Zitate stammen aus dem Auszug, den das Abrufwerkzeug lieferte, nicht aus dem Rohtext. Sie wurden nicht im Browser gegengelesen.** Vor einer Entscheidung die Stelle am Original lesen.

## Kurzfassung

**Frage:** Was muss Kunibert erfüllen, bevor es als Serienprodukt verkauft wird, und ab wann?

**Antwort (Einschätzung):** Nichts davon verbietet das Produkt. Aber vier Dinge bestimmen Zeit und Kosten.

1. **Der Prüfweg.** Kunibert ist sehr wahrscheinlich ein Spielzeug (für Kinder unter 14 Jahren, Art. 2 der Spielzeugverordnung (Q1)). Bis 31.7.2030 gilt noch die Spielzeug-Richtlinie. Wegen WLAN gilt zugleich die Funkanlagen-Richtlinie (RED) mit Cybersicherheit. Die Selbsterklärung des Herstellers (Modul A) reicht nur, wenn passende harmonisierte Normen ganz angewandt werden. Sonst prüft eine benannte Stelle. Für die Cybersicherheits-Normen EN 18031 gelten Einschränkungen: Es gibt keine Konformitätsvermutung, wenn der Nutzer kein Passwort setzen muss oder der Zugriff für Eltern nicht gesichert ist (Q2).
2. **Der Stichtag 11.12.2027.** Kommt ein Gerät ab diesem Tag in Verkehr, gilt der Cyber Resilience Act (CRA) statt der RED-Cybersicherheit (Q3, Q4). Ein sprechendes, vernetztes Spielzeug steht dort in „Klasse I“ (Q5). Ohne passende Normen heißt das: benannte Stelle. Wann Kunibert erstmals verkauft wird, bestimmt also den Prüfweg.
3. **KI-Verordnung, schon jetzt.** Art. 50 gilt seit 2.8.2026 (Q6). Für ein neues Gerät heißt das: Hinweis, dass man mit einer KI spricht (Abs. 1), und maschinenlesbare Kennzeichnung der künstlichen Stimme (Abs. 2). Eine Übergangsfrist gibt es nur für Systeme, die vor dem 2.8.2026 in Verkehr kamen (Q7). In `main` gibt es beides noch nicht (Suche im Quelltext, siehe Abschnitt 2). Als Hochrisiko-System gilt Kunibert wahrscheinlich nicht; die Pflichten dafür begännen frühestens am 2.8.2028.
4. **Anmeldungen vor dem ersten Verkauf.** Stiftung ear (Gerät und Batterie) und Verpackungsregister LUCID. Das kann Wochen dauern. Mit eigener Marke ist der Betreiber in allen drei Bereichen „Hersteller“.

Dazu kommen: Datenschutz (Eltern willigen ein; eine Folgenabschätzung ist wahrscheinlich nötig; keine Sprechererkennung; die Aufnahme muss erkennbar sein), der Data Act (für Produkte ab 12.9.2026), die Batterieregeln (ab 18.2.2027 entnehmbarer Akku, für Spielzeug eine Ausnahme bis 31.7.2030) und Pflichtangaben im Online-Angebot.

**Was ich nicht klären konnte (Auswahl):** Welche Normen für den CRA und für die Spielzeugverordnung gelten werden (noch nicht belegt). Ob die Einschränkungen von EN 18031 heute noch so gelten. Was die Entwürfe der Hochrisiko-Leitlinien zu Spielzeug sagen (gesperrt). Ob der Data Act ein Spielzeug erfasst. Kosten und Dauer von Prüfungen (keine Zahlen gefunden). Die ganze Liste steht unter „Nicht geprüft“.

## Was ich über Kunibert angenommen habe

- Vernetztes Sprach-Spielzeug für Kinder von 6 bis 10 Jahren. Mikrofon, Lautsprecher, zwei Tasten (Sprechtaste, Erzähltaste), WLAN. Das Gerät nimmt nur auf und spielt ab. Spracherkennung, Sicherheitsweiche, Sprachmodell (Claude) und Sprachausgabe laufen auf dem Server (`CLAUDE.md`).
- Annahmen, die noch nicht feststehen: Akku mit USB-C-Ladung, Gehäuse aus Kunststoff, Verkaufsverpackung aus Karton, Verkauf zuerst in Deutschland (auch online, per Fernabsatz), der Betreiber als „Hersteller“ mit eigenem Namen und eigener Marke, vielleicht ein Auftragsfertiger außerhalb der EU.
- Prototyp: Raspberry Pi 5 (`pi-client/`). Geplantes Endgerät: ESP32-S3 (`firmware/esp32-s3/`, Entwurf).
- Die Rechtstexte gelten für das Serienprodukt, nicht für den Prototyp, der nur bei Erwachsenen steht. Bis zur Rechtsprüfung testen nur Erwachsene (`CLAUDE.md`).

## Fristen auf einen Blick

Quellen stehen in der letzten Spalte. Was die Frist für Kunibert bedeutet, steht in den Abschnitten 1 bis 6.

**Gilt schon (Stand 23.11.2026)**

| Seit | Vorgabe | Quelle |
| --- | --- | --- |
| 25.5.2018 | DSGVO, darin Art. 8 (Einwilligung von Kindern) | (Q8) |
| 13.12.2024 | Allgemeine Produktsicherheitsverordnung (GPSR) | (Q9) |
| 28.12.2024 | USB-C-Pflicht für bestimmte Gerätearten; Spielzeug ist keine eigene Art | (Q10) |
| 2.2.2025 | KI-Verordnung: Verbote (Art. 5) und KI-Kompetenz (Art. 4) | (Q11, Q7) |
| 1.8.2025 | RED: Cybersicherheit (Art. 3 Abs. 3 Buchst. d, e, f) | (Q12) |
| 12.9.2025 | Data Act (Grundsatz) | (Q13) |
| 18.8.2025 | Batterieverordnung: Herstellerverantwortung und Symbol | (Q14) |
| 7.10.2025 | Batterierecht-Durchführungsgesetz (BattDG) statt BattG | (Q15) |
| 1.1.2026 | Spielzeugverordnung in Kraft (nur einzelne Artikel gelten; Geltung ab 1.8.2030) | (Q16) |
| 2.8.2026 | KI-Verordnung: Transparenzpflichten (Art. 50) | (Q6) |
| 12.8.2026 | EU-Verpackungsverordnung (PPWR) und neues Verpackungsgesetz | (Q17, Q18) |
| 11.9.2026 | CRA: Meldepflichten (Art. 14), auch für schon verkaufte Produkte | (Q5, Q19) |
| 12.9.2026 | Data Act, Art. 3 Abs. 1: für Produkte, die ab da in Verkehr kommen | (Q20) |

**Kommt noch**

| Ab | Vorgabe | Quelle |
| --- | --- | --- |
| 2.12.2026 | KI-Verordnung: Ende der Übergangsfrist für Art. 50 Abs. 2 (nur für Systeme, die vor dem 2.8.2026 in Verkehr kamen) | (Q7) |
| 18.2.2027 | Batterie: Nutzer müssen den Akku entnehmen können (Art. 11); für Spielzeug eine Ausnahme bis 31.7.2030 | (Q14, Q21) |
| 2.12.2027 | KI-Verordnung: Pflichten für Hochrisiko-Systeme nach Anhang III | (Q7) |
| 11.12.2027 | CRA gilt voll; die RED-Cybersicherheit (Verordnung 2022/30) wird aufgehoben | (Q5, Q4) |
| 2.8.2028 | KI-Verordnung: Pflichten für Hochrisiko-Systeme nach Anhang I (dort steht die Spielzeug-Richtlinie) | (Q7, Q22) |
| 1.8.2030 | Spielzeugverordnung gilt; Richtlinie 2009/48/EG aufgehoben; digitaler Produktpass | (Q1) |
| 1.2.2031 | Letzter Tag für EG-Baumusterprüfbescheinigungen nach der Richtlinie (wenn sie nicht früher ablaufen) | (Q1) |


## Befunde

### 1. Spielzeug (Spielzeugverordnung und Spielzeug-Richtlinie)

**Ab wann**

- Die neue Verordnung (EU) 2025/2509 über die Sicherheit von Spielzeug ist vom 26.11.2025. Sie stand am 12.12.2025 im Amtsblatt und ist am 1.1.2026 in Kraft getreten. Sie **gilt ab dem 1.8.2030** (Art. 59) (Q1, Q16, Q23). Einzelne Artikel gelten schon seit dem 1.1.2026: Art. 28 bis 44 (benannte Stellen) und Art. 49 bis 55 (zum Beispiel Rechtsakte der Kommission zum Produktpass) (Q1).
- Die Richtlinie 2009/48/EG gilt bis 31.7.2030 und wird zum 1.8.2030 aufgehoben (Art. 56). Spielzeug, das vorher nach der Richtlinie in Verkehr kam, darf weiter bereitgestellt werden (Art. 57 Abs. 1). EG-Baumusterprüfbescheinigungen gelten längstens bis 1.2.2031 (Art. 57 Abs. 3) (Q1).
- In Deutschland setzt die 2. Produktsicherheitsverordnung (2. ProdSV) die Richtlinie um. Sie ist am 20.7.2011 in Kraft getreten (Q24). Ob und wann sie aufgehoben oder geändert wird: nicht belegt.
- Eine Verschiebung der Fristen habe ich nicht gefunden. Die Seiten des Parlaments (Stand 25.10.2026) und der Kommission nennen keine Änderung (Q23, Q16). Die spanische Fassung wurde am 11.8.2026 berichtigt, nur im Wortlaut (Q25). Andere Sprachfassungen habe ich nicht geprüft.

**Was die Verordnung fordert (soweit für Kunibert wichtig)**

- Eigene Regeln zu Cybersicherheit, Datenschutz oder KI hat sie nicht (Erwägungsgrund 14). Dafür gelten die RED, der CRA und die KI-Verordnung. Erwägungsgrund 15 nennt internetfähiges Spielzeug mit Sprechen oder Filmen ein wichtiges Produkt mit digitalen Elementen (CRA). Dafür sei meist eine Drittprüfung nötig, außer passende Normen oder eine Zertifizierung der Stufe „substantial“ werden angewandt. KI-Spielzeug mit sicherheitsrelevanter KI und Drittprüfung sei Hochrisiko-KI (Q1). Einschätzung: Erwägungsgründe erklären den Text. Die Pflichten stehen in den Artikeln.
- Art. 25 Abs. 2 Buchst. c: Bei Spielzeug im Bereich der KI-Verordnung, des CRA oder der RED muss die Sicherheitsbewertung die besonderen Schutzbedürftigkeiten von Kindern beachten. Erwägungsgrund 16 nennt bei vernetztem Spielzeug auch Risiken für die psychische Gesundheit. Das Wort „mental“ steht laut Wortsuche nur dort, nicht im Artikeltext (Q1).
- Digitaler Produktpass (Art. 19, Anhang VI): Der Hersteller erstellt ihn vor dem Inverkehrbringen. Er ist über einen Datenträger am Spielzeug abrufbar. Aufbewahrung 10 Jahre (Art. 7 Abs. 3). Er ersetzt die EU-Konformitätserklärung, auch die nach KI-Verordnung, CRA und RED (Anhang VI Teil I Buchst. h). Beginn 1.8.2030 (Einschätzung, aus Art. 59 gefolgert) (Q1).
- Konformitätsbewertung (Art. 26): Die Selbsterklärung (interne Fertigungskontrolle, Anhang IV, Modul A) reicht nur, wenn harmonisierte Normen oder gemeinsame Spezifikationen alle Sicherheitsanforderungen abdecken. Sonst braucht es die EU-Baumusterprüfung durch eine benannte Stelle (Modul B plus C). Das gilt auch, wenn Normen fehlen, nicht oder nur teilweise angewandt werden oder eingeschränkt sind, oder wenn der Hersteller selbst eine Drittprüfung für nötig hält (Abs. 3). Die Bescheinigung ist spätestens alle 5 Jahre zu prüfen (Abs. 4) (Q1).
- Kennzeichnung (Art. 6 und 7): Typ-, Chargen-, Serien- oder Modellnummer am Spielzeug, sonst auf Verpackung oder Beilage. Name, Marke, Post- und E-Mail-Adresse und eine Kontaktstelle. CE-Zeichen und Datenträger vor dem Inverkehrbringen. Warnhinweise müssen vor dem Kauf sichtbar sein, auch im Fernabsatz. Hersteller ist auch, wer Spielzeug entwickeln oder bauen lässt und unter eigenem Namen oder eigener Marke vertreibt (Art. 3 Nr. 3). Pflichten haben außerdem Bevollmächtigte (Art. 8), Importeure (Art. 9), Händler (Art. 10), Fulfilment-Dienste (Art. 11) und Online-Marktplätze (Art. 14) (Q1).
- Chemie: Verboten sind unter anderem CMR-Stoffe (Kategorien 1A, 1B, 2), hormonell wirksame Stoffe (Kategorien 1, 2), absichtlich eingesetzte PFAS und bestimmte Bisphenole (Anhang II Teil III Nr. 4 bis 6). Ausnahme für Akkus und Bauteile elektronischer Funktionen, wenn der Stoff für Kinder unzugänglich ist (Nr. 9) (Q1).

**Die Richtlinie 2009/48/EG, die bis 31.7.2030 gilt**

- Elektrik (Anhang II Teil IV): höchstens 24 V Nennspannung. Zugängliche Teile höchstens 24 V Gleichspannung. Nr. 6 begrenzt elektromagnetische Felder (Q26).
- Konformität: Vermutung bei harmonisierten Normen (Art. 13). Modul A (Art. 19 Abs. 2) oder EG-Baumusterprüfung durch eine benannte Stelle (Art. 19 Abs. 3) (Q26). Unterlagen und EG-Konformitätserklärung sind 10 Jahre aufzubewahren. Schall darf das Gehör von Kindern nicht schädigen (Anhang II Teil I Nr. 10) (Q27).
- Harmonisierte Normen: Der Durchführungsbeschluss (EU) 2023/740 nennt EN 71-1, -2, -3, -4, -5, -7, -8, -12, -13, -14 und EN IEC 62115:2020 (elektrisches Spielzeug) (Q28). Die Kommission führt drei spätere Änderungen auf: (EU) 2025/1785, 2025/2519 und 2026/2032 (Q29). Nach SGS (sonstige Quelle) nimmt 2025/2519 EN 71-3 und EN 71-13 in der Fassung +A2:2024 auf; die alten Einträge entfallen am 16.6.2027 (Q30). Nach TÜV (sonstige Quelle) fügt 2026/2032 EN 71-4:2020+A1:2025, EN 71-15:2025 und EN 71-16:2025 hinzu (in Kraft seit 14.9.2026; EN 71-4:2020 entfällt ab 14.3.2028) (Q31). EN IEC 62115 kommt in beiden Berichten nicht vor. Den Inhalt von 2025/1785 habe ich nicht gelesen.
- Deutschland (2. ProdSV): Anleitung, Sicherheitsinformationen (§ 4 Abs. 3), Warnhinweise (§ 11 Abs. 5) und EG-Konformitätserklärung (§ 12 Abs. 2) auf Deutsch. Unterlagen 10 Jahre ab dem Inverkehrbringen des letzten Stücks der Serie (§ 3 Abs. 3). Pflichten: Hersteller § 3, Einführer § 6, Händler § 7, CE-Zeichen § 13, Konformitätsbewertung § 15, Baumusterprüfung § 16, Bußgelder § 22 (Q24).

**Ist Kunibert ein Spielzeug? (Einschätzung)**

- Sehr wahrscheinlich ja. Die Verordnung erfasst Produkte, die ganz oder nicht ausschließlich zum Spielen für Kinder unter 14 Jahren bestimmt oder gestaltet sind (Art. 2 Abs. 1). Die Richtlinie hat dieselbe Grundlinie. „Bestimmt für“ gilt dort, wenn Eltern oder Aufsichtspersonen nach Funktion, Maßen und Merkmalen vernünftigerweise annehmen dürfen, dass es für die Altersgruppe gedacht ist (Art. 3 Nr. 29) (Q1, Q26).
- Die Ausnahme in Anhang I Teil II Nr. 14 betrifft Elektronikgeräte wie PC und Spielkonsolen. Sie sind kein Spielzeug, es sei denn, sie sind speziell für Kinder gemacht und haben einen eigenen Spielwert. Nr. 15 nimmt interaktive Freizeitsoftware aus. Eine eigene Kategorie „vernetztes Spielzeug“ gibt es dort nicht (Q1). „Spielwert“ ist im gelesenen Text nicht erklärt.
- Server-Software und Eltern-Seite sind für sich kein Spielzeug (Nr. 15). Sie gehören aber zur Sicherheitsbewertung des Geräts, die über die erwartbare Nutzungsdauer gelten muss (Art. 5 Abs. 3, nach meiner Lesart) (Q1). Das Ergebnis kann kippen, wenn Kunibert als allgemeiner Assistent oder als Schulprodukt vermarktet wird.

**Für Kunibert (Einschätzung)**

- Was bis 31.7.2030 in Verkehr kommt, fällt unter Richtlinie, 2. ProdSV und die Normen (zum Beispiel EN IEC 62115). Es bleibt verkäuflich (Art. 57). Für Geräte, die ab 1.8.2030 erstmals bereitgestellt werden, gilt die Verordnung mit Produktpass. Ob jedes einzelne Stück zählt, ist nicht geprüft (der „Blue Guide“ der Kommission ist nicht gelesen).
- Modul A braucht passende harmonisierte Normen. Für die Verordnung ist noch keine Normenliste belegt; die gelesenen Kommissionsseiten nennen dazu weder Normen noch einen Normungsauftrag (Q16, Q29).
- WLAN steht nicht im Text der Richtlinie. Die RED erfasst es parallel (siehe Abschnitt 3). Die Verordnung verweist darauf (Art. 25 Abs. 2 Buchst. c, Anhang VI) (Q1).

### 2. KI-Verordnung (Verordnung (EU) 2024/1689)

**Zeitplan und Änderungen**

- Der „Digital-Omnibus“ zur KI-Verordnung ist beschlossen: Verordnung (EU) 2026/1744. Der Rat hat sie am 29.6.2026 angenommen. Sie stand am 24.7.2026 im Amtsblatt und ist am 27.7.2026 in Kraft getreten (am dritten Tag nach der Veröffentlichung) (Q7, Q32).
- Neu: Die Pflichten für Hochrisiko-Systeme gelten ab 2.12.2027 (Anhang III) und ab 2.8.2028 (Anhang I). Der allgemeine Beginn war der 2.8.2026. Grund laut der Verordnung: Normen und Leitlinien kamen zu spät (Q7).
- Art. 50 gilt seit 2.8.2026. Systeme, die vor dem 2.8.2026 in Verkehr kamen, müssen Art. 50 Abs. 2 bis zum 2.12.2026 erfüllen (Art. 111 Abs. 4) (Q7, Q6).
- Art. 4 (KI-Kompetenz) ist neu gefasst: Es gibt die Pflicht, Maßnahmen zu ergreifen, die die KI-Kompetenz des Personals fördern. Ein bestimmtes Niveau wird nicht garantiert. Der Beginn bleibt der 2.2.2025 (Q7).

**Art. 50: Transparenz**

- Abs. 1: Wer direkt mit einer KI spricht, muss das erfahren. Ausnahme nur, wenn es für eine angemessen informierte, aufmerksame und umsichtige Person offensichtlich ist. Abs. 5: Der Hinweis muss klar erkennbar sein, spätestens bei der ersten Interaktion, und barrierefrei (Q11).
- Die Leitlinien der Kommission (C(2026) 5054, 20.7.2026, laut eigenem Text nicht bindend) lesen „offensichtlich“ eng. Kinder gelten als verletzlich. Bei Sprache empfehlen sie einen gesprochenen Hinweis zu Beginn, Erinnerungen bei langen Gesprächen und bei Kindern und kindgerechte Worte (Rn. 34 bis 45). Spielzeug kommt dort nach meiner Suche nicht vor (Q33, Q6).
- Abs. 2: Wer synthetisches Audio, Bild, Video oder Text erzeugt, muss die Ausgabe maschinenlesbar markieren und als künstlich erkennbar machen. Ausnahmen: unterstützende Standardbearbeitung, keine wesentliche Änderung der Eingabe, Strafverfolgung (Q34).
- Die Leitlinien dazu: Synthetische Sprache zählt als Audio (Rn. 60). Als Mittel nennen sie zum Beispiel Wasserzeichen oder Metadaten (Rn. 73). Nur Metadaten reichen nur in engen Fällen, etwa bei eingebetteten Produkten in geschlossenen Umgebungen (Rn. 86). Die Markierung des Modellanbieters darf genutzt werden. Der Systemanbieter muss die Einhaltung trotzdem selbst nachweisen (Rn. 74). Wer ein System ändert und unter eigenem Namen anbietet, wird Anbieter (Rn. 11) (Q33).
- Den Verhaltenskodex zur Kennzeichnung KI-erzeugter Inhalte gibt es in der Endfassung vom 10.6.2026. Kommission und KI-Gremium haben ihn als geeignetes freiwilliges Mittel bestätigt. Ende Juli 2026 hatte er rund 190 Unterzeichner (Q35). Ob er auch Abs. 1 abdeckt, ist nicht belegt. Den Text des Kodex habe ich nicht geöffnet.
- Bußgeld (Art. 99 Abs. 4 Buchst. g): bis 15 Mio. EUR oder 3 % des weltweiten Jahresumsatzes, je nachdem, was höher ist. KMU, Start-ups und kleine Mid-Caps zahlen den niedrigeren Wert (Q11).

**Verbote (Art. 5)**

- Art. 5 Abs. 1 Buchst. b verbietet KI, die Schwächen wegen des Alters ausnutzt, um das Verhalten wesentlich zu verzerren und erheblich zu schaden. Das gilt seit 2.2.2025. Bußgeld bis 35 Mio. EUR oder 7 % (Q11).
- Die Leitlinien zu den Verboten (C(2025) 5052, 29.7.2025, nicht bindend), Rn. 105: Verboten wäre ein KI-Spielzeug, das Kinder mit Belohnungen zu riskanteren Mutproben bringt. KI-Spielzeug, Spiele und Lern-Apps allgemein sind nicht betroffen (Rn. 105 und 121). Begleiter-KI: Es gibt ein Bindungsrisiko (Rn. 116). Ohne erheblichen Schaden ist sie nicht verboten (Rn. 134) (Q36).

**Hochrisiko**

- Art. 6 Abs. 1: Hochrisiko nur, wenn die KI (a) Sicherheitsbauteil eines Produkts nach dem Recht aus Anhang I ist und (b) das Produkt eine Prüfung durch Dritte braucht. Neu durch den Omnibus: KI für Nutzerhilfe oder Komfort ist kein Sicherheitsbauteil. KI, deren Ausfall Gesundheit und Sicherheit gefährdet, ist eines. Eine Drittprüfung nur wegen des Funkspektrums zählt nicht. Beginn 2.8.2028 (Q11).
- Anhang I Abschnitt A nennt unter Nr. 2 die Spielzeug-Richtlinie 2009/48/EG und unter Nr. 6 Funkanlagen. Die neue Spielzeugverordnung 2025/2509 steht dort nicht (Q22). Sie gilt erst ab 1.8.2030 (Q1).
- Die Spielzeug-Richtlinie (Art. 19): Interne Fertigungskontrolle reicht, wenn angewandte harmonisierte Normen alle Anforderungen abdecken. Sonst ist eine EG-Baumusterprüfung durch eine benannte Stelle nötig (Q26).
- Anhang III Nr. 3 (Bildung) nennt: Zugang und Zuweisung, Bewertung von Lernergebnissen, Bewertung des Bildungsniveaus, Erkennen verbotenen Verhaltens bei Prüfungen (Q11).
- Die Kommission hat am 19.5.2026 Entwürfe von Leitlinien zur Einstufung als Hochrisiko-KI veröffentlicht. Eine Endfassung ist dort nicht genannt. Die Entwürfe selbst waren für mich gesperrt (Q37).

**Rolle des Betreibers**

- „Anbieter“ ist, wer ein KI-System entwickelt oder entwickeln lässt und es unter eigenem Namen oder eigener Marke in Verkehr bringt (Art. 3 Nr. 3). „Nachgelagerter Anbieter“ baut ein KI-Modell in sein System ein (Art. 3 Nr. 68). Modellanbieter müssen ihm Informationen geben (Art. 53 Abs. 1 Buchst. b) (Q11).

**Für Kunibert (Einschätzung)**

- Art. 50 Abs. 1: Kunibert spricht direkt mit Kindern. „Offensichtlich“ greift bei 6- bis 10-Jährigen wohl nicht. Sinnvoll ist ein gesprochener Hinweis zu Beginn jeder Sitzung, in kindgerechten Worten. **Stand im Repo:** In `main` fand ich keinen solchen Text. `server-api/ansagen.ts` und `docs/Ansagen.md` sagen nur, dass die „KI-Ansage beim ersten Einschalten“ aus dem Server komme. In `server.ts`, `server-api/prompts.ts`, `server-api/brain.ts` und im Pi-Client stand dazu nichts (Suche nach „KI“, „künstlich“, „Computer“, „Maschine“, „Roboter“). Ein früher Entwurf liegt auf dem Branch `claude/ki-hinweis` (Commit `493c226`, siehe Punkt H3).
- Art. 50 Abs. 2: Die Stimme vom Server ist synthetisches Audio. Ein neues Gerät hat keine Übergangsfrist (Art. 111 Abs. 4 gilt nur für Systeme von vor dem 2.8.2026). Der Betreiber bleibt nachweispflichtig, auch wenn der Sprachdienst selbst markiert (Rn. 74). **Stand im Repo:** In `server.ts`, `server-api/`, `pi-client/`, `firmware/` und `docs/picastAI-Pi-API.md` fand ich keine Kennzeichnung der Stimme (Suche nach „Wasserzeichen“, „watermark“, „c2pa“, „synthetisch“, „metadat“). Der einzige Treffer in `server-api/sicherheit-integration.test.ts` betrifft ein Feld der Claude-Anfrage, nicht die Stimme.
- Art. 5 Abs. 1 Buchst. b: keine Belohnungsschleifen, keine Mutproben, keine gefühlsbetonte Bindung als Designziel (nach Rn. 105 und 116 der Leitlinien). Das gilt auch für die Anweisungen an Claude (Prompts), nicht nur für Programmcode.
- Hochrisiko: unwahrscheinlich, nicht ausgeschlossen. Nötig wären ein Sicherheitsbauteil und eine Drittprüfung. Erzählen und Antworten ist keine Sicherheitsfunktion. Offen ist, ob schädliche Antworten als Gefahr für „Gesundheit und Sicherheit“ zählen. Eine Drittprüfung droht eher, wenn passende Normen fehlen. Früheste Geltung: 2.8.2028. Anhang III Nr. 3 passt nicht, solange Kunibert keine Lernstände bewertet.
- Der Betreiber ist Anbieter des Gesamtsystems. Gegenüber Claude ist er „nachgelagerter Anbieter“.


## Quellen

Alle Seiten wurden am 23.11.2026 durch Unteragenten abgerufen. Ein Zitat je Quelle, höchstens 15 Wörter. Die Zitate stammen aus dem Auszug des Abrufwerkzeugs.

| Nr. | Quelle | Art | Zitat |
| --- | --- | --- | --- |
| Q1 | Verordnung (EU) 2025/2509 über die Sicherheit von Spielzeug (EUR-Lex), https://eur-lex.europa.eu/eli/reg/2025/2509 | amtlich | „It shall apply from 1 August 2030.“ |
| Q2 | Beschluss (EU) 2025/138: EN 18031-1, -2 und -3 im Amtsblatt (EUR-Lex), https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202500138 | amtlich | „parental or guardian access control is not ensured“ |
| Q3 | Leitfaden der Kommission zur RED (Stand Oktober 2026), https://webgate.ec.europa.eu/circabc-ewpp/d/d/workspace/SpacesStore/d2d68489-33b8-46c2-a167-8c042daebbb3/download | amtlich | „will be subject to the requirements of Regulation (EU) 2024/2847 (CRA), and not to“ |
| Q4 | Ratsdokument ST 6429/2026: Delegierte Verordnung der Kommission (C(2026) 778), https://data.consilium.europa.eu/doc/document/ST-6429-2026-INIT/en/pdf | amtlich | „Delegated Regulation (EU) 2022/30 is repealed with effect from 11 December 2027.“ |
| Q5 | Cyber Resilience Act, Verordnung (EU) 2024/2847, Amtsblatt (EUR-Lex), https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202402847 | amtlich | „social interactive features (e.g. speaking or filming) or that have location tracking features“ |
| Q6 | Kommission: Meldung zu den Leitlinien über Transparenzpflichten, https://digital-strategy.ec.europa.eu/en/news/commission-publishes-guidelines-transparency-obligations-providers-and-deployers-certain-ai-systems | amtlich | „transparency obligations, which start to apply on 2 August 2026“ |
| Q7 | Verordnung (EU) 2026/1744 (Digital-Omnibus zur KI-Verordnung), Amtsblatt (EUR-Lex), https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202601744 | amtlich | „comply with Article 50(2) by 2 December 2026“ |
| Q8 | DSGVO, Verordnung (EU) 2016/679, deutsche Fassung (EUR-Lex), https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02016R0679-20160504 | amtlich | „wenn das Kind das sechzehnte Lebensjahr vollendet hat“ |
| Q9 | Allgemeine Produktsicherheitsverordnung (EU) 2023/988 (EUR-Lex), PDF, https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32023R0988 | amtlich | „Chapter III, Section 1, Chapters V and VII and Chapters IX to XI“ |
| Q10 | Europäische Kommission: ein gemeinsames Ladegerät, https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red/one-common-charging-solution-all_en | amtlich | „provides answers to the most frequently asked questions on the common charger“ |
| Q11 | KI-Verordnung (EU) 2024/1689, konsolidierte Fassung vom 27.7.2026 (EUR-Lex), https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng/pdf | amtlich | „at the time of the first interaction or exposure“ |
| Q12 | Verordnung (EU) 2023/2444 (Verschiebung der RED-Cybersicherheit), EUR-Lex, https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R2444 | amtlich | „It shall apply from 1 August 2025.“ |
| Q13 | Europäische Kommission: Data Act, https://digital-strategy.ec.europa.eu/en/policies/data-act | amtlich | „entered into force on 11 January 2024“ |
| Q14 | Batterieverordnung (EU) 2023/1542, konsolidiert am 13.8.2026 (EUR-Lex), https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02023R1542-20260813 | amtlich | „Article 11 shall apply from 18 February 2027“ |
| Q15 | Umweltbundesamt: BattDG in Kraft getreten, https://www.umweltbundesamt.de/themen/battdg-in-kraft-getreten-uba-beleiht-erneut | amtlich | „Am 07.10.2025 trat das Batterierecht-Durchführungsgesetz“ |
| Q16 | Europäische Kommission: Spielzeugsicherheit, https://single-market-economy.ec.europa.eu/sectors/toys/toy-safety_en | amtlich | „enters into force on 1 January 2026“ |
| Q17 | Bundesumweltministerium: Europäische Verpackungsverordnung ab heute wirksam, https://www.bundesumweltministerium.de/pressemitteilung/europaeische-verpackungsverordnung-ab-heute-wirksam | amtlich | „löst das bisherige Verpackungsgesetz ab“ |
| Q18 | EUR-Lex: Zusammenfassung „Verpackungen und Verpackungsabfälle ab 2026“, https://eur-lex.europa.eu/DE/legal-content/summary/packaging-and-packaging-waste-from-2026.html | amtlich | „gilt ab dem 12. August 2026“ |
| Q19 | Kommission: Meldung „Sicherere digitale Produkte“ (11.9.2026), https://commission.europa.eu/news-and-media/news/safer-and-more-secure-digital-products-2026-09-11_en | amtlich | „all products with digital elements made available in the EU“ |
| Q20 | Data Act, Verordnung (EU) 2023/2854 (EUR-Lex), https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX:32023R2854 | amtlich | „placed on the market after 12 September 2026“ |
| Q21 | Kommission: Rechtsakt C(2026) 5031 zur Austauschbarkeit bei Spielzeug, PDF, https://environment.ec.europa.eu/document/download/0e738cbb-581d-42c3-bbad-83e91c066a55_en?filename=C_2026_5031_1_EN_ACT_part1_v3.pdf | amtlich | „until 31 of July 2030, electric toys that incorporate rechargeable batteries“ |
| Q22 | KI-Service-Desk der Kommission: Anhang I, https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-1 | amtlich | „Directive 2009/48/EC of the European Parliament and of the Council“ |
| Q23 | Europäisches Parlament: Legislative Train, Spielzeugsicherheit, https://www.europarl.europa.eu/legislative-train/theme-a-european-green-deal/file-toy-safety-directive-(refit) | amtlich | „was published in the Official Journal on 12 December 2025.“ |
| Q24 | 2. ProdSV (Verordnung über die Sicherheit von Spielzeug), gesetze-im-internet.de, https://www.gesetze-im-internet.de/gpsgv_2/BJNR135000011.html | amtlich | „Warn- und Sicherheitshinweise sind in deutscher Sprache abzufassen.“ |
| Q25 | Berichtigung der spanischen Fassung der Verordnung 2025/2509 (BOE, gibt das Amtsblatt wieder), https://www.boe.es/doue/2026/90689/L00001-00001.pdf | amtlich | „que sea probable que tengan un impacto en los niños“ |
| Q26 | Richtlinie 2009/48/EG, konsolidierte Fassung vom 5.12.2022 (EUR-Lex), https://eur-lex.europa.eu/eli/dir/2009/48/2022-12-05/eng | amtlich | „Toys shall not be powered by electricity of a nominal voltage exceeding 24 volts“ |
| Q27 | Richtlinie 2009/48/EG, Fassung vom 5.7.2022, PDF (EUR-Lex), https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02009L0048-20220705 | amtlich | „10 years after the toy has been placed on the market“ |
| Q28 | Durchführungsbeschluss (EU) 2023/740: harmonisierte Normen für Spielzeug (EUR-Lex), https://eur-lex.europa.eu/eli/dec_impl/2023/740/oj | amtlich | „Electric toys – Safety“ |
| Q29 | Europäische Kommission: harmonisierte Normen für Spielzeug, https://single-market-economy.ec.europa.eu/single-market/goods/european-standards/harmonised-standards/toy-safety_en | amtlich | „harmonised standards for toys drafted in support of Directive 2009/48/EC“ |
| Q30 | SGS: neue Normenliste für Spielzeug (Beschluss 2025/2519), https://www.sgs.com/en/news/2025/12/safeguards-18825-eu-updates-standards-for-presumption-of-conformity-with-toy-safety-directive | sonstige Quelle (Prüfhaus) | „these two entries will be deleted on June 16, 2027“ |
| Q31 | TÜV: Beschluss (EU) 2026/2032 zu Spielzeug-Normen, https://tuv.com/ae-en/market-access-services/regulations-and-standards/eu-commission-implementing-decision-eu-2026-2032-updating-toy-safety-standards-12314 | sonstige Quelle (Prüfhaus) | „This Decision enters into force on September 14, 2026.“ |
| Q32 | Rat: Ratsdokument ST 11301/2026 (Annahme des Rechtsakts), https://data.consilium.europa.eu/doc/document/ST-11301-2026-INIT/en/pdf | amtlich | „Adoption of the legislative act“ |
| Q33 | Leitlinien der Kommission zu Art. 50 der KI-Verordnung (C(2026) 5054), PDF, https://ai-act-service-desk.ec.europa.eu/sites/default/files/2026-07/guidelines_on_the_implementation_of_the_transparency_obligations_for_certain_ai_systems_under_article_50_of_the_ai_act_bzptwqhk0ikg1dtlddap41psfy_131215.pdf | amtlich | „limited to cases where there is almost no doubt left“ |
| Q34 | KI-Service-Desk der Kommission: Art. 50, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50 | amtlich | „marked in a machine-readable format and detectable as artificially generated“ |
| Q35 | Kommission: Verhaltenskodex zu KI-erzeugten Inhalten, https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content | amtlich | „an adequate voluntary tool to demonstrate compliance“ |
| Q36 | Leitlinien der Kommission zu den verbotenen Praktiken (C(2025) 5052), PDF, https://ai-act-service-desk.ec.europa.eu/sites/default/files/2026-01/guide-prohibited_en.pdf | amtlich | „not AI-enabled toys, games, learning applications or other digital applications in general“ |
| Q37 | Kommission: Entwurf der Leitlinien zur Einstufung als Hochrisiko-KI (Seite), https://digital-strategy.ec.europa.eu/en/library/draft-commission-guidelines-classification-high-risk-ai-systems | amtlich | – (Die Seite war lesbar, die Entwürfe selbst waren gesperrt) |

(Abschnitte 3 bis 6, Folgerungen, „Nicht geprüft“ und „Nächste Schritte“ folgen im selben PR.)
