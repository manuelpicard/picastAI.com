# KI-Hinweis und Kennzeichnung der Sprachausgabe

**Stand: 26.11.2026** (Abrufe am selben Tag durch Unteragenten dieses Laufs) · Punkt H3 der Arbeitsliste · Wochen-Autopilot, Rolle Recherche · **Entwurf. Nichts davon ist eingebaut, abgeschickt oder ausgespielt.** Der Stand gilt nur für diesen Tag. Leitlinien und Fristen können sich ändern; siehe „Nicht geprüft“.

**Keine Rechtsberatung.** Ein Anwalt war bewusst nicht beteiligt. Das ist als Restrisiko festgehalten.

Es wurde nichts bestellt, nichts angefragt, kein Konto angelegt und kein Formular benutzt. Es wurde nichts an Dritte geschickt.

So liest man das Dokument:

- „Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. „Nicht belegt“ heißt: Ich habe es in keiner geöffneten Quelle gelesen. „Rn.“ ist die Randnummer (Absatznummer) in den Leitlinien der Kommission.
- Die Quellen Q1 bis Q23 stehen vor „Nicht geprüft“, mit Link, Abrufdatum, Lesestand und einem kurzen Zitat. Im Text stehen keine Zitate.
- **Ich habe nie einen Rohtext gesehen.** Alles stammt aus Berichten von Abruf-Agenten (Claude Sonnet). Es gibt zwei Lesestände. „Wortlaut“: Der Agent bekam den Seitentext vom Abrufwerkzeug und berichtete mir Stellen mit Randnummer. „Zusammenfassung“: Der Agent bekam nur die Antwort eines kleinen Modells des Werkzeugs. Das ist schwächer. Ein „steht nicht im gelesenen Text“ gilt nur für den Teil, den der Agent sah. Die Zitate stammen aus den Berichten und wurden nicht am Original gegengelesen. **Vor einer Entscheidung die Stelle am Original lesen.**
- Zwei Wörter überschneiden sich. „Anbieter“ (englisch provider) ist, wer ein KI-System entwickelt oder entwickeln lässt und unter eigenem Namen in Verkehr bringt (Q3, Rn. 10). Das ist picastAI für das ganze Gerät samt Server. „Betreiber“ heißt in diesem Projekt der Inhaber des Projekts. Im Gesetz meint „Betreiber“ (englisch deployer) jemanden, der ein KI-System in eigener Verantwortung einsetzt. Diese Rolle heißt hier „Betreiber im Gesetz“. Eltern und Kinder, die Kunibert privat benutzen, sind keine Betreiber im Gesetz. Die Pflichten des Anbieters bleiben trotzdem voll bestehen (Q3, Rn. 19 und 20). Eine Stelle kann Anbieter und Betreiber im Gesetz zugleich sein (Q3, Rn. 15). Ob das für picastai gilt, steht in 3.4.

## 1. Kurzfassung

**Frage:** Was gilt für den Hinweis „Das ist eine KI“ und für die Kennzeichnung der künstlichen Stimme? Wie lautet ein Hinweis für Kinder von 6 bis 10 Jahren?

**Antwort (Einschätzung):** Beides gilt für ein neues Gerät schon jetzt, und in `main` fehlt beides. Fünf Punkte:

1. **Hinweis: gesprochen, in einfachen Worten, vor der ersten Antwort.** Art. 50 Abs. 1 und 5 der KI-Verordnung verpflichten den Anbieter. Wer mit Kunibert spricht, muss erfahren: Das ist ein KI-System (Q1). Auf die Ausnahme „offensichtlich“ kann man sich nicht stützen, wenn Kinder Zugang haben (Q4, Rn. 45). Für Sprachsysteme nennen die Leitlinien eine ausdrücklich gesprochene Aussage zu Beginn. Töne allein, Anleitung und Nutzungsbedingungen reichen nicht (Q4, Rn. 37 und 38).
2. **Anthropic verlangt dasselbe.** Die Nutzungsrichtlinie (gültig ab 12.11.2026) verlangt den Hinweis bei Verbraucher-Chatbots mindestens zu Beginn jeder Chat-Sitzung oder in der Produktoberfläche (Q14, S. 16). Die Leitlinien verlangen ihn einmal zu Beginn jeder Sitzung und für jede neue Person (Q7, Rn. 143). Ein gesprochener Satz vor der ersten Antwort jeder Sitzung erfüllt beides. Für eine Person, die mitten in der Sitzung dazukommt, reicht er nicht (Einschätzung; siehe E1).
3. **Stimme: Marke und Erkennung, beides.** Art. 50 Abs. 2 verlangt für synthetische Sprache eine maschinenlesbare Marke. Eine Marke ohne Erkennungsmittel reicht nicht (Q5, Rn. 69 und 70). Für ein Gerät, das nach dem 2.8.2026 in Verkehr kommt, gibt es keine Übergangsfrist (Rückschluss aus Q7, Rn. 153; Einschätzung). Eine sichere Ausnahme für Sprachausgabe an Kinder habe ich nicht gefunden (Q5, Rn. 86 bis 93; Einschätzung).
4. **Pocket TTS: nicht annehmen, dass es markiert.** In den gelesenen Kyutai-Seiten steht zu Pocket TTS nichts zu Wasserzeichen oder Marken. Das Schwestermodell TTS 1.6B setzt ausdrücklich keines (Q21). Den Code habe ich nicht gelesen. Der Nachweis bleibt beim Anbieter des Systems (Q5, Rn. 74).
5. **Die Texte stehen als Entwurf in Abschnitt 5.** Ansage am Gerät, Antwort auf „Bist du ein Mensch?“, Erinnerung in Geschichten und Elterninformation. Die Reihenfolge fürs Bauen steht in Abschnitt 6.

**Was ich nicht klären konnte (Auswahl):** der Volltext des Verhaltenskodex (am Abend des 26.11.2026 gelesen, siehe [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md)); ob Pocket TTS im Code markiert; welches Verfahren für Sprache robust ist; ob der Sprecher hinter der Standardstimme einer KI-Stimme zugestimmt hat (Risiko R1 in [`stimme-lizenz.md`](stimme-lizenz.md)); Herkunft und Lizenz der übrigen Stimmen; wie ein gehörloses Kind den Hinweis erfährt; ob 6-Jährige die Texte verstehen (nicht mit Kindern getestet). Die ganze Liste steht unter „Nicht geprüft“.

## 2. Was ich über Kunibert angenommen habe

- Vernetztes Sprach-Spielzeug für Kinder von 6 bis 10 Jahren. Sprechtaste (Frage) und Erzähltaste (Geschichte). Das Gerät nimmt nur auf und spielt ab. Spracherkennung, Sicherheitsweiche, Sprachmodell (Claude) und Sprachausgabe laufen auf dem Server (`CLAUDE.md`).
- Die Stimme kommt aus Pocket TTS von Kyutai. Die Standardstimme ist `stuart_bell`, eine vorgefertigte Stimme, die auf der Aufnahme eines echten Sprechers beruht (nach [`stimme-lizenz.md`](stimme-lizenz.md) vom 22.11.2026; dieses Repo-Dokument habe ich gelesen, aber nicht an den Quellen nachgeprüft). Als Rückfall gibt es eine Piper-Stimme, optional Google Cloud Text-to-Speech (Punkt N1122-1825-e in [`docs/autopilot/backlog.md`](../autopilot/backlog.md)). Jede dieser Stimmen ist synthetisches Audio. Die Kennzeichnung muss also auf jedem Weg gelten, auch bei Ersatzsätzen.
- Das Serienprodukt kommt nach dem 2.8.2026 in Verkehr (Annahme). Der erste Verkaufstermin steht nicht fest (H2).
- Bis zur Rechtsprüfung hören nur Erwachsene zu (`CLAUDE.md`). Die Texte in Abschnitt 5 sind nicht mit Kindern getestet.
- Picastai ist Anbieter des Gesamtsystems. Gegenüber Claude ist picastai nachgelagerter Anbieter (H2, [`vorgaben-serienprodukt.md`](vorgaben-serienprodukt.md), Abschnitt 2). Ob picastai zugleich Betreiber im Gesetz ist, ist offen (siehe 3.4).

## 3. Befunde

### 3.1 Hinweis „Das ist eine KI“ (Art. 50 Abs. 1 und 5)

**Gesetzestext (Q1)**

- Abs. 1: Anbieter müssen KI-Systeme, die dafür gedacht sind, direkt mit Menschen zu sprechen, so gestalten, dass die Menschen erfahren: Sie sprechen mit einem KI-System. Das gilt nicht, wenn es für eine angemessen informierte, aufmerksame und umsichtige Person nach Umständen und Zusammenhang offensichtlich ist. Zweite Ausnahme: gesetzlich zugelassene Strafverfolgung.
- Abs. 5: Die Information muss klar und unterscheidbar sein, spätestens bei der ersten Interaktion oder dem ersten Kontakt, und sie muss die geltenden Barrierefreiheitsanforderungen erfüllen.
- Fassung: Die Seite zeigt die konsolidierte Fassung vom 27.7.2026. Nur Abs. 7 trägt den Vermerk, vom Digital-Omnibus geändert zu sein. Abs. 1, 2 und 5 tragen keinen Vermerk. Den Text vor dem Omnibus habe ich nicht verglichen.
- Erwägungsgrund 132 (Q2, Fassung vom 13.6.2024): Bei der Umsetzung sind die Merkmale schutzbedürftiger Gruppen wegen Alter oder Behinderung zu berücksichtigen, soweit das System für sie gedacht ist. Das Wort „Kinder“ steht dort nicht.

**Was die Leitlinien dazu sagen** (Kommission, C(2026) 5054 vom 20.7.2026, Q3 bis Q7)

| Rn. | Aussage | Quelle |
| --- | --- | --- |
| 2, 5 | Art. 50 gilt ab 2.8.2026. Die Leitlinien sind nicht bindend. | Q3 |
| 10, 11 | Anbieter ist, wer ein System entwickelt oder entwickeln lässt und unter eigenem Namen oder eigener Marke in Verkehr bringt, auch kostenlos. Wer das System eines anderen verändert und unter eigenem Namen in Betrieb nimmt, wird Anbieter des neuen Systems. Der erste Anbieter bleibt für seines verantwortlich. | Q3 |
| 19, 20 | Private Nutzer sind keine Betreiber im Gesetz. Der Anbieter bleibt voll verpflichtet. | Q3 |
| 22 | Tests unter Echtbedingungen fallen nicht unter die Ausnahme für Forschung und Entwicklung. | Q3 |
| 26, 27 | Art. 50 gilt für KI-Systeme mit allgemeinem Verwendungszweck, nicht ausdrücklich für Modelle. Modellanbieter sind nur ermuntert. Ihre Maßnahmen auf Modellebene helfen den Anbietern von Systemen, die darauf aufbauen, bei deren Pflichten aus Abs. 1 und 2. | Q3 |
| 28 bis 33 | Die Pflicht aus Abs. 1 liegt beim Anbieter. Direkte Interaktion schließt Sprache ein. Sprachassistenten, KI-Begleiter und Roboter-Haustiere fallen darunter. Der Hinweis ist in Gestaltung und Betrieb einzubauen, spätestens bei der ersten Interaktion. | Q3, Q4 |
| 34 | Kinder: Hinweise kindgerecht, altersgerecht, leicht verständlich und für alle Kinder zugänglich. Einheitliche Hinweise werden empfohlen. Fußnote 19: Das gilt auch, wenn das System nicht gezielt an Kinder gerichtet ist. | Q4 |
| 35 | Ausdrücklich über die künstliche, nicht-menschliche Natur des Gegenübers informieren. | Q4 |
| 36, 37 | Sprachsysteme: ausdrücklich gesprochene Aussage zu Beginn der Interaktion. Dazu bei längeren Gesprächen Erinnerungen, besonders nach Unterbrechungen oder wenn das System die Rolle wechselt. Signaltöne allein reichen nicht. Für Hinweise in Textform einfache Wörter, besonders für Kinder. | Q4 |
| 38 | Allein nicht ausreichend: Nutzungsbedingungen, Adressen oder Dokumentation; Marken, die der Nutzer nicht wahrnimmt (für Abs. 1); unklare Signale und allgemeine Sätze, dass irgendwo KI genutzt wird. Sie dürfen den Hinweis ergänzen. | Q4 |
| 39, 40 | Hinweise sollen verhältnismäßig sein, damit sie nicht abstumpfen. Ein deutlicher Hinweis vor der ersten Interaktion reicht meist. Erinnerungen sind wahrscheinlich nötig bei verletzlichen Personen (Kinder ausdrücklich genannt), langen Interaktionen, emotionaler Bindung, und immer dann, wenn jemand nach der Natur des Systems fragt oder verwirrt wirkt. Eine feste Zahl steht nicht da. | Q4 |
| 42 bis 45 | Ausnahme „offensichtlich“: Der Anbieter muss sie prüfen und belegen können. Der Maßstab sinkt, wenn Kinder dabei sind (Rn. 44). Die Ausnahme ist eng auszulegen: Es darf fast kein Zweifel bleiben. Haben Verbraucher Zugang, für die es weniger offensichtlich ist (genannt: Kinder), kann man sich auf sie nicht stützen (Rn. 45). Nicht offensichtlich: lebensechte Roboter-Haustiere, sehr menschlich klingende Stimmen, besonders bei Kindern. Offensichtlich: in Haushaltsgeräte eingebettete KI mit enger Funktion; Spielfiguren im Einzelspieler-Spiel, wenn die KI-Natur auch für verletzliche Personen klar ist. | Q4 |
| 50 | Verbraucherrecht gilt daneben. Bei KI-gesteuerten Diensten kann die KI-Funktion ein wesentliches Merkmal sein, das vor Vertragsabschluss genannt werden muss. | Q4 |
| 141, 142 | Der Hinweis ist klar und unterscheidbar zu geben, spätestens bei der ersten Interaktion. Klar heißt: wahrnehmbar, leicht verständlich und zugänglich für die betroffene Person. Handbuch, Menüs und Nutzungsbedingungen reichen nicht. Fußnote 40 nennt sechs Merkmale für Kinder (Abschnitt 5.6). | Q6, Q7 |
| 143 | Mindestens einmal zu Beginn einer interaktiven Sitzung. Jede neue Person hat ihre eigene erste Interaktion. | Q7 |
| 144 | Abs. 5 stellt keine eigenen zusätzlichen Anforderungen auf. Er verweist auf bestehende Barrierefreiheitsregeln (Richtlinien (EU) 2016/2102 und (EU) 2019/882). Ob sie für ein Spielzeug gelten, habe ich nicht geprüft. | Q7 |

**Einschätzung zu 3.1**

- Die Pflicht trifft picastai. Art. 50 gilt für Systeme, nicht ausdrücklich für Modelle (Q3, Rn. 26 und 27). Anthropic erfüllt sie für Kunibert nicht mit.
- „Offensichtlich“ trägt nicht. Haben Kinder Zugang, kann man sich auf die Ausnahme nicht stützen (Q4, Rn. 45). Das Beispiel der Spielfiguren im Einzelspieler-Spiel gilt nur, wenn die KI-Natur auch für verletzliche Personen klar ist. Bei einer Ritterfigur mit freundlicher Stimme für 6-Jährige ist das wohl nicht so: Ein Kind kann sie für ein lebendes Wesen halten. Der Anbieter müsste das Gegenteil belegen können (Q4, Rn. 42). Das wird schwer.
- Das Beispiel der Haushaltsgeräte mit enger Funktion passt nicht. Kunibert führt einen offenen Dialog und erzählt Geschichten (Q4, Rn. 45). Das Wort „Spielzeug“ kommt in den berichteten Stellen der Leitlinien nicht vor. Die Pflicht hängt daran nicht.
- Ein Hinweis nur in der Anleitung, auf der Verpackung oder in der Elterninformation reicht nicht (Q4, Rn. 38; Q7, Rn. 142). Er kann den gesprochenen Hinweis ergänzen. Ob die Verpackung wie Dokumentation zählt, sagt der berichtete Text nicht.
- Die Produktseite und die Verpackung sollten das Wort KI nennen, weil die KI-Funktion ein wesentliches Merkmal sein kann (Q4, Rn. 50; Einschätzung).
- **Neue Person in der Sitzung.** Jede neue Person hat ihre eigene erste Interaktion (Q7, Rn. 143). Ein Geschwisterkind, das mitten in einer Sitzung dazukommt, hört den Hinweis nicht, wenn er nur beim Start kommt. Eine Sprecher- oder Stimmerkennung habe ich im Repo nicht gefunden (Suche in `server.ts`, `server-api/`, `pi-client/`, `firmware/` und `docs/picastAI-Pi-API.md`). Ich nehme an: Kunibert merkt nicht, wer spricht. Ausgleich in E1, E3 und E4. Eine Lücke bleibt (Einschätzung).

### 3.2 Kennzeichnung der Stimme (Art. 50 Abs. 2)

**Gesetzestext (Q1).** Anbieter von KI-Systemen, die synthetische Audio-, Bild-, Video- oder Textinhalte erzeugen, auch von Systemen mit allgemeinem Verwendungszweck, müssen sicherstellen: Die Ausgaben sind in einem maschinenlesbaren Format markiert und als künstlich erzeugt oder verändert erkennbar. Die technischen Lösungen müssen wirksam, interoperabel, robust und zuverlässig sein, soweit das technisch machbar ist. Inhaltsarten, Kosten und Stand der Technik sind zu beachten. Es gibt drei Ausnahmen: unterstützende Funktion bei der Standardbearbeitung; keine wesentliche Änderung der vom Betreiber im Gesetz gelieferten Eingabedaten oder ihrer Bedeutung; gesetzlich zugelassene Strafverfolgung.

**Was die Leitlinien dazu sagen**

| Rn. | Aussage | Quelle |
| --- | --- | --- |
| 54 bis 66 | Anwendungsbereich von Abs. 2. Sprache zählt als Audio (Rn. 60). | Q4 |
| 68 | Endergebnisse geschlossener Arbeitsabläufe müssen markiert werden. Reine Maschine-zu-Maschine-Ausgabe nicht. | Q5 |
| 69, 70 | Markierung und Erkennung sind zwei eng verbundene Teile. Markierung ohne Erkennung genügt nicht. | Q5 |
| 71 | Verlangt ist nur die maschinenlesbare Marke. Eine für Menschen wahrnehmbare Marke ist ein freiwilliges Extra. | Q5 |
| 73 | Mittel nach Erwägungsgrund 133: Wasserzeichen, Metadaten, kryptografische Herkunftsnachweise, Protokollierung, Fingerabdrücke und Kombinationen. Eine lückenlose Herkunftskette ist nicht verlangt. | Q5 |
| 74 | Die Markierung darf auf Systemebene, auf Modellebene oder bei der Erzeugung geschehen. Der Systemanbieter darf sich auf die Marke des Modellanbieters oder eines Dritten stützen, wenn sie Abs. 2 erfüllt. Den Nachweis führt der Systemanbieter. | Q5 |
| 75 bis 78 | Erkennungsmittel müssen für die betroffenen Personen verfügbar sein. Für volle Interoperabilität sind öffentlich verfügbare Industriestandards zu nutzen. Gibt es keine, ist für begrenzte Zeit eine eigene, fremde oder gemeinsame Lösung erlaubt, die mit anderen zusammenarbeitet. Wer von anderen abhängt, muss sicherstellen, dass sie Abs. 2 und 5 erfüllen. | Q5 |
| 79 bis 85 | Die vier Eigenschaften (wirksam, interoperabel, robust, zuverlässig) sind erklärt. Technische Machbarkeit ist ein objektiver Begriff und hängt nicht von den Mitteln des einzelnen Anbieters ab (Rn. 81). Die Lösungen müssen dem allgemein anerkannten Stand der Technik entsprechen (Rn. 82); Rn. 83 erklärt den Begriff. Anbieter dürfen sich auf einen als angemessen bewerteten Kodex stützen (Rn. 84). Kosten dürfen berücksichtigt werden (Rn. 85). | Q5 |
| 86 | Enger Fall, in dem weniger robuste Metadaten genügen: generatives System in einem physischen Produkt, technisch kontrolliert und geschlossen, überwiegend Anleitungen (Beispiel: Auto-Navigation), wirksame Maßnahmen verhindern, dass die Ausgaben die Umgebung verlassen. | Q5 |
| 87 | Industrie und Geschäftskunden. Öffentliche und Verbraucher-Systeme sind ausdrücklich ausgenommen. | Q5 |
| 88 | Flüchtige Echtzeit-Inhalte, sofort verbraucht und nicht aufgezeichnet, gespeichert oder weitergegeben (Beispiele: Videospiele, VR), können ausgenommen werden, wenn (a) die Markierung technisch nicht machbar ist und (b) die Personen informiert werden. | Q5 |
| 89 bis 93 | Drei Ausnahmen. Standardbearbeitung heißt: keine neuen Inhalte. Keine wesentliche Änderung der Eingabe ist je Fall zu beurteilen. Als Beispiele genannt: angepasste neuronale Stimmen und Sprachhilfen, die nur echte menschliche Eingaben umformen. Gegenbeispiel mit Markierungspflicht: Sprachsynthese in der Stimme einer bestimmten Person. Auch KI-Zusammenfassungen brauchen eine Marke. | Q5 |
| 94 | Angaben zum Urheber sollen dafür nicht verarbeitet werden. Datenschutz durch Technikgestaltung gilt. | Q5 |
| 153, 154 | Übergang bis 2.12.2026 nur für die Pflicht aus Abs. 2 und nur für generative Systeme, die vor dem 2.8.2026 in Verkehr kamen oder in Betrieb genommen wurden. Gemischte Systeme müssen den Hinweis nach Abs. 1 schon ab 2.8.2026 geben. Alte Inhalte müssen nicht nachträglich markiert werden. | Q7 |

**Passt ein Sonderfall oder eine Ausnahme auf Kunibert? (Einschätzung)**

| Rn. | Fall | Passt auf Kunibert? |
| --- | --- | --- |
| 86 | Eingebettetes System, geschlossene Umgebung, Metadaten genügen | Wohl nicht. Kunibert erzählt Geschichten und beantwortet freie Fragen, die Ausgabe ist nicht überwiegend eine Anleitung. Nichts hindert jemanden daran, den Ton mitzuschneiden. Die Stimme entsteht am Server und wird über das Netz übertragen. |
| 87 | Industrie und Geschäftskunden | Nein. Kunibert ist ein Verbrauchergerät. |
| 88 | Flüchtige Echtzeit-Inhalte | Trägt nicht. Bedingung (a) fehlt: Dass eine Marke bei Sprache technisch nicht machbar wäre, ist nicht belegt. Die Leitlinien nennen Wasserzeichen und Metadaten als Mittel (Rn. 73). Es ist nur eine Kann-Regel. Bedingung (b) würde der gesprochene Hinweis erfüllen. Außerdem legt der Server den Ton kurz im flüchtigen AudioStore ab ([`docs/picastAI-Pi-API.md`](../picastAI-Pi-API.md), Zeile 82) und hält feste Sätze im Speicher ([`server-api/voice.ts`](../../server-api/voice.ts), Zeilen 320 und 379). Das passt schlecht zur Bedingung, dass nichts gespeichert wird. |
| 90 | Standardbearbeitung | Nein. Die Sprachausgabe macht aus Text neue Sprache. |
| 91, 92 | Keine wesentliche Änderung der Eingabe | Wohl nicht. Die Eingabe der Sprachausgabe ist Text, den Claude erzeugt hat, keine echte menschliche Sprache. Rn. 91 spricht von Eingabedaten, die ein Betreiber im Gesetz liefert. Ob Claude-Text so zählt, steht nicht im berichteten Text. Dagegen führt Rn. 92 die Formatumwandlung als Beispiel für die Ausnahme auf, und Rn. 91 nennt Format und Medientyp als Prüffaktoren. Zur Sprachsynthese mit fester künstlicher Stimme steht nichts Ausdrückliches. Eine sichere Ausnahme gibt es nicht. |
| 93 | Strafverfolgung | Nein. |
| 153 | Übergang bis 2.12.2026 | Nein, wenn Kunibert nach dem 2.8.2026 in Verkehr kommt. Ob Prototypen bei Testpersonen schon als „in Betrieb genommen“ zählen, habe ich nicht geprüft. Der Hinweis nach Abs. 1 hat in jedem Fall keine Frist. |

**Was noch fehlt, um ein Verfahren zu wählen (offen).** Welche Verfahren es für Sprache gibt, wie robust sie sind (Abtastratenwandlung, Komprimierung, Aufnahme über Lautsprecher und Mikrofon), was sie kosten und unter welcher Lizenz sie stehen, habe ich in diesem Lauf nicht untersucht. Das ist Punkt N1126-1153-c. Auch ein Erkennungsmittel für Betroffene (Q5, Rn. 75 bis 78) gibt es noch nicht.

### 3.3 Verhaltenskodex der Kommission (freiwillig)

- Der Kodex zur Kennzeichnung KI-erzeugter Inhalte liegt in der Endfassung vom 10.6.2026 vor und ist freiwillig (Q9, Q10, Q11). Er hat zwei Teile: Anbieter (Kennzeichnen und Erkennbarmachen) und Betreiber im Gesetz (Deepfakes und KI-Text) (Q9). Audio ist eingeschlossen (Q9).
- Laut Kommission hilft der Kodex beim Nachweis zu Abs. 2, 4 und 5 (Q9, Q12). Eine Seite nennt nur Abs. 2 und 4 (Q10). Abs. 1, der Hinweis „Das ist eine KI“, wird auf keiner der gelesenen Seiten als vom Kodex erfasst genannt (Q9 bis Q13). Der Kodex hilft beim Hinweis also wohl nicht.
- Wirkung: Anbieter dürfen sich auf einen als angemessen bewerteten Kodex stützen (Q5, Rn. 84). Der Kodex erleichtert den Nachweis. Wer nicht unterzeichnet, muss mit mehr Auskunftsverlangen rechnen (Q7, Rn. 146 bis 148). Zusagen können bei Bußgeldern mildern (Q7, Rn. 149). Das Wort „Vermutung der Konformität“ steht in keiner gelesenen Quelle. Die Kommission und das KI-Gremium haben den Kodex laut einer Seite als angemessen bewertet (Q12). Q10 nennt diese Bewertung in der Wiedergabe des Werkzeugs an einer Stelle als erfolgt und an einer anderen als künftig.
- Konkrete Vorgaben für Audio (Wasserzeichen, Metadaten, Fingerabdruck, Protokollierung, Erkennungswerkzeuge): in keiner der fünf Kommissionsseiten (Q9 bis Q13). Den Volltext habe ich in diesem Lauf zunächst nicht gelesen. Er ist seit dem Abend des 26.11.2026 gelesen (Punkt N1126-1153-b, PR #142): [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md). Teil 1 des Kodex verlangt für Audio zwei Schichten (signierte Metadaten und ein nicht hörbares Wasserzeichen), ein robustes Verfahren und ein kostenloses Erkennungsmittel. Abs. 1 kommt im Kodex nicht vor.
- Der Kodex bietet ein freiwilliges EU-Symbol in drei Varianten (Q10, Q13). Es ist für Betreiber im Gesetz gedacht (Q13).
- Unterzeichner: etwa 190 Organisationen bis Ende Juli 2026 (Q9). Ob picastai unterzeichnet, entscheidet der Betreiber. Die Anmeldung wäre eine Nachricht an Dritte; Claude schickt sie nicht ab.

### 3.4 Stimme einer echten Person und Deepfake (Art. 50 Abs. 4)

- Abs. 4 trifft Betreiber im Gesetz, die ein System beruflich nutzen (Q5, Rn. 111 und 112; Q6, Rn. 117; Q12). Private Nutzer sind es nicht (Q3, Rn. 19 und 20). Eine Stelle kann Anbieter und Betreiber im Gesetz zugleich sein; dann gelten Abs. 2 und 4 (Q3, Rn. 15). Picastai entwickelt Kunibert und betreibt den Server selbst, geschäftlich. Ob picastai damit auch Betreiber im Gesetz ist, habe ich nicht geprüft. Möglich ist es (Einschätzung). Dann träfe Abs. 4 picastai selbst.
- Ein Deepfake ist ein Inhalt mit vier gemeinsamen Merkmalen. Die Stimme zählt zu den Merkmalen einer Person. Die Ähnlichkeit muss spürbar sein (Q5, Rn. 111 bis 113; Q6, Rn. 114 bis 116). Die Beurteilung ist objektiv und braucht keine Täuschungsabsicht (Q6, Rn. 114). Zählt eine verletzliche Gruppe wie Kinder zum Publikum, kann die Täuschung dieser Gruppe genügen (Q6, Rn. 115).
- Beispiele der Kommission (Q6, Kasten auf S. 37): Das Klonen der Stimmen echter Podcast-Moderatoren ist ein Deepfake. Stimmersatz für erfundene Figuren ist es nicht, solange niemand über die Identität des Sprechers getäuscht wird.
- Texte zu Themen von öffentlichem Interesse sind ein anderer Fall (Q6, Rn. 131). Erfundene Geschichten nennt der berichtete Text nicht ausdrücklich. Das Beispiel KI-erzeugter Fantasy-Romane spricht dafür, dass Kunibert-Geschichten nicht erfasst sind (Einschätzung).
- Für Kunibert (Einschätzung): Eine erfundene Ritterfigur mit synthetischer Stimme ist kein Deepfake. Die Standardstimme `stuart_bell` ist zwar vorgefertigt, beruht aber auf der Aufnahme eines echten Sprechers (LibriVox; nach [`stimme-lizenz.md`](stimme-lizenz.md)). Ob er einer KI-Stimme zugestimmt hat, ist dort als Risiko R1 offen. Ob die Stimme einer erkennbaren echten Person gleicht, ist nicht geprüft. Das klären die Punkte N1122-1825-c und N1122-1825-e. Kyutai verbietet Nachahmung ohne ausdrückliche und rechtmäßige Zustimmung (Q20). Das ist ein Nutzungs- und Persönlichkeitsrechts-Thema und nicht nur eines der KI-Verordnung.

### 3.5 Fristen, Bußgeld, Aufsicht

- 2.8.2026: Art. 50 gilt (Q3, Rn. 2; Q8; Q13).
- 2.12.2026: Übergang nur für die Pflicht aus Abs. 2 und nur für Systeme, die vor dem 2.8.2026 in Verkehr kamen (Q7, Rn. 153; Q10; Q12). Für ein neues Gerät gibt es keine Frist (Rückschluss aus Rn. 153, Einschätzung).
- Bußgeld: bis 15 Mio. EUR oder 3 % des weltweiten Jahresumsatzes, je nachdem, was höher ist. Für kleine und mittlere Unternehmen und Start-ups gilt der niedrigere Wert (Q7, Rn. 152). Die Kommissionsseiten lassen offen, ob der höhere Wert gilt (Q12, Q13). Maßgeblich ist der berichtete Wortlaut von Rn. 152.
- Aufsicht: vor allem die nationalen Marktüberwachungsbehörden; das KI-Büro nur in engen Fällen; der Europäische Datenschutzbeauftragte für EU-Einrichtungen (Q7, Rn. 151; Q12). Welche Behörde in Deutschland zuständig ist, habe ich nicht geprüft.
- Die Leitlinien sind nicht bindend. Die Kommission kann sie ändern oder zurückziehen (Q3, Rn. 5; Q7, Rn. 155). Letzte Aktualisierung der Bibliotheksseite: 5.11.2026 (Q8).
- Tests unter Echtbedingungen fallen nicht unter die Ausnahme für Forschung und Entwicklung (Q3, Rn. 22). Ob ein Test mit Erwachsenen zu Hause so ein Test ist, habe ich nicht geprüft. Vorsorglich gilt der Hinweis auch dort (E8).

### 3.6 Regeln von Anthropic

**Nutzungsrichtlinie (Q14).** Gelesen: das ganze PDF (31.706 Zeichen), gültig ab 12.11.2026. Sie gilt auch für die Endnutzer von Produkten, die Claude einbauen (S. 1).

- Offenlegung (S. 16): Alle Verbraucher-Chatbots und KI-Agenten mit direktem Kontakt zu externen Nutzern müssen offenlegen, dass die Nutzer mit KI und nicht mit einem Menschen sprechen. Mindestens zu Beginn jeder Chat-Sitzung oder in der Produktoberfläche. Anthropic, Claude oder das Modell müssen nicht genannt werden. Wie die Offenlegung bei einem reinen Sprachgerät aussehen soll, steht nicht im gelesenen Text.
- Keine falschen Personas, die Menschen vortäuschen (S. 7). Ausgenommen sind klar offengelegte Parodie, Satire oder Fiktion. Ob eine Ritterfigur ohne Weiteres unter Fiktion fällt, sagt der Text nicht. Mit dem Hinweis aus E1 ist die Frage ohne Gewicht (Einschätzung).
- Produkte für Minderjährige (S. 16): Sie müssen die zusätzlichen Leitlinien im Support-Artikel und alle geltenden Gesetze einhalten. Minderjährig ist, wer unter 18 ist (S. 6). Altersgrenzen stehen in den Nutzungsbedingungen (nicht gelesen).
- Kinderschutz-Verbote (S. 5 und 6): unter anderem das Sexualisieren Minderjähriger, auch in Fiktion oder Rollenspiel. Anthropic meldet Missbrauchsdarstellungen an Behörden.
- Emotionserkennung ist verboten, außer aus medizinischen oder Sicherheitsgründen (S. 9). Für Kunibert heißt das: keine Stimmung aus der Kinderstimme ableiten (Einschätzung).
- Eine Vorab-Information an Anthropic oder eine Freigabe für Kinderprodukte steht nicht im gelesenen Text. Die Vorabgenehmigung in S. 10 und 11 betrifft andere Fälle.
- Wasserzeichen und die KI-Verordnung kommen im Text nicht vor.

**Hilfeartikel für Organisationen mit Minderjährigen (Q15).**

- Organisationen müssen ihren Nutzern offenlegen, dass sie mit einem KI-System und nicht mit einem Menschen sprechen. Form und Zeitpunkt stehen nicht da.
- Beispiele für technische Maßnahmen: Altersprüfung, Inhaltsfilter, Überwachung und Meldewege, Lernmaterial für Minderjährige. Anthropic kann einen Kinderschutz-Systemprompt anbieten, den solche Organisationen einbauen sollen. Ob es ihn heute gibt, steht nicht da.
- Die Organisation ist selbst für Kinderschutz- und Datenschutzrecht verantwortlich. Genannt wird nur das US-Gesetz COPPA. Die Einhaltung soll öffentlich angegeben werden. Anthropic prüft regelmäßig. Bleiben Maßnahmen nach einer Aufforderung aus oder bleibt die Verstoßrate dauerhaft hoch, kann das zur Sperrung oder Kündigung des Kontos führen.
- Eine Pflicht, Anthropic vorab zu informieren oder eine Freigabe zu holen, steht nicht im gelesenen Text.

**Weitere Seiten.** Der Artikel zum Start eines API-Produkts beschreibt die Offenlegung für nach außen gerichtete Produkte als Empfehlung (Q16). Die Meldung zur Nutzungsrichtlinie von 2024 erlaubt Produkte für Minderjährige, wenn die Organisation Schutzfunktionen zusagt und den KI-Einsatz offenlegt (Q17). Der Leitfaden für Entwickler sagt: Der Entwickler ist selbst für die Schutzmaßnahmen verantwortlich; das Sexualisieren Minderjähriger ist auch in Fiktion verboten. Zur KI-Offenlegung gegenüber Kindern, zum Kinderschutz-Systemprompt und zu DSGVO oder COPPA sagt er nichts (Q18).

**Einschätzung.** Ein Spielzeug für 6- bis 10-Jährige ist sehr wahrscheinlich ein Verbraucher-Chatbot im Sinn von Q14 und ein Produkt für Minderjährige. Der gesprochene Hinweis zu Beginn jeder Sitzung ist die Bedingung. Ohne ihn droht ein Verstoß gegen die Nutzungsrichtlinie und damit im schlimmsten Fall die Sperrung des Kontos (Q14, Q15). Die übrigen Auflagen für Produkte mit Minderjährigen (Altersprüfung, Überwachung, Meldewege, öffentliche Erklärung) habe ich nicht gegen das Repo geprüft. Das ist Punkt N1126-1153-e.

### 3.7 Pocket TTS und Kyutai

- **Verbotene Nutzung (Q20, ganz gelesen).** Ein Absatz. Die Nutzung muss geltendes Recht einhalten. Verboten sind unter anderem: Nachahmen oder Klonen von Stimmen ohne ausdrückliche und rechtmäßige Zustimmung; Fehlinformation, Desinformation oder Täuschung, auch das Ausgeben erzeugter Inhalte als echte Aufnahmen echter Personen; rechtswidrige, schädliche, beleidigende, belästigende, diskriminierende, hasserfüllte oder privatsphäreverletzende Inhalte. Die Liste ist nicht abschließend. Kyutai schließt jede Haftung aus. Q19 nennt dieselben Punkte, aber nur in der Zusammenfassung des Werkzeugs. Der Wortlaut dieses Abschnitts lag mir dort nicht vor.
- **Wasserzeichen und Marken.** Zu Pocket TTS steht nichts im gelesenen Text (Q19, Q20). Suchbegriffe ohne einschlägigen Treffer: Wasserzeichen, Herkunftsnachweis, C2PA, AudioSeal, SilentCipher, Fingerabdruck, Erkennung, Offenlegung, Kennzeichnung, KI-erzeugt. Das Wort Erkennung steht in Q20 nur bei Projekten Dritter, die Pocket TTS für andere Zwecke nutzen, nicht für künstliche Sprache. Das Wort Metadaten steht in Q20 nur als Beschriftung eines Links der Seite. Das Schwestermodell Kyutai TTS 1.6B setzt ausdrücklich kein Wasserzeichen und nennt zwei Gründe: Wasserzeichen sind bei offenen Modellen leicht abzuschalten, und die Wasserzeichen bestehender Sprachsysteme gehen beim Kodieren und Dekodieren mit dem Kodierer Mimi verloren (Q21). Das beschreibt dieses Modell. Es belegt nicht, dass jede Marke bei Sprache unmöglich ist (Einschätzung).
- **Einschätzung.** Dass Pocket TTS nicht markiert, ist nur ein Rückschluss aus dem Schweigen der Seiten und der Begründung beim Schwestermodell. Der Code wurde nicht gelesen. Ob Pocket TTS etwas in den Ton schreibt, lässt sich nur am erzeugten Ton prüfen (Punkt N1126-1153-d). Bis dahin gilt: nicht annehmen, dass es markiert. Der Nachweis bliebe ohnehin bei picastai (Q5, Rn. 74).
- **Kinder, Spielzeug, Hinweis an Hörer.** In keiner der gelesenen Kyutai-Seiten (Q19 bis Q21). Das Täuschungsverbot ist keine Kennzeichnungspflicht.
- **Lizenz.** Code unter MIT-Lizenz (Q19, Lizenztext nicht gelesen). Das Repository trägt die Lizenz CC BY 4.0 (Q20). Die Lizenz je Stimme steht auf einer eigenen Seite, die ich nicht gelesen habe. Das ist Punkt N1122-1825-e.
- **Stimmen.** Die fertigen Stimmen sind vorberechnet aus Kyutais Gewichten (Q20). Die Stimmenliste auf den Kyutai-Seiten verlinkt Pfade mit den Ordnernamen voice-zero (4 Stimmen), vctk (12), expresso, ears, voice-donations, unmute-prod-website und alba-mackenna (Q19, Q20). Dazu kommen vier Stimmen in einem Zweig `add_lang_not_documented`, darunter die deutsche Stimme `juergen`. Zwei davon tragen Dateinamen aus Common Voice (Q20). Nach [`stimme-lizenz.md`](stimme-lizenz.md) ist für diese vier Stimmen keine Lizenz angegeben. Die Seiten erklären die Ordnernamen nicht. Den Katalog selbst habe ich nicht gelesen. Auf einer anderen Seite steht, dass man seine Stimme anonym spenden kann (Q23). Herkunft und Zustimmung je Stimme stehen nicht im gelesenen Text. Zur Standardstimme `stuart_bell` hat der Lauf H5 die Kette bis zu LibriVox gelesen ([`stimme-lizenz.md`](stimme-lizenz.md)). Dort ist die Zustimmung des Sprechers zur KI-Stimme als Risiko R1 offen. Das klärt Punkt N1122-1825-c.
- **Klonen.** Pocket TTS kann Stimmen aus einer WAV-Datei klonen (Q20). Auch die vorgefertigten Stimmen gehen auf Aufnahmen von Menschen zurück. Kunibert sollte deshalb keine weitere Stimme aus einer Aufnahme klonen, weil das Kyutai-Verbot sonst greift und die Sprachsynthese in der Stimme einer bestimmten Person ausdrücklich markierungspflichtig ist (Q5, Rn. 92; Einschätzung). Ob schon die Standardstimme als Stimme einer bestimmten Person zählt, ist offen. Es hängt unter anderem an der Zustimmung ihres Sprechers (R1 in [`stimme-lizenz.md`](stimme-lizenz.md)). Ich rechne vorsorglich damit, dass die Marke nötig ist (E6). Es gibt auch ein Repository „ohne Stimmenklonen“ (Q22). Die Seite erklärt den Unterschied nicht.

## 4. Stand im Repo

Suche in `main` am 26.11.2026 (zuerst Stand ecda762, danach auf Stand 97d3e2e wiederholt, mit gleichem Ergebnis):

- **Kein gesprochener KI-Hinweis.** [`deploy/ansagen.json`](../../deploy/ansagen.json) (Zeile 2) und [`server-api/ansagen.test.ts`](../../server-api/ansagen.test.ts) (Zeile 27) sagen, die KI-Ansage beim ersten Einschalten komme aus dem Server, und nennen dafür `server-api/ansage.ts`. Diese Datei gibt es in `main` nicht. [`server-api/ansagen.ts`](../../server-api/ansagen.ts) (Zeile 7) und [`docs/Ansagen.md`](../Ansagen.md) (Zeile 3) sagen nur, sie komme aus dem Server. Die Doku verweist auf [`pi-client/README.md`](../../pi-client/README.md). Der Punkt N1123-1153-a macht aus den Verweisen echte oder streicht sie.
- **Eine Regel für die Frage, keine Ansage.** [`server-api/prompts.ts`](../../server-api/prompts.ts), Zeile 208: Kunibert darf nie behaupten, Papa, Mama oder ein Mensch zu sein. Zeile 97 verlangt dasselbe für die Erzählstimme. Ein Testsatz dazu steht in [`server-api/eval-prompts.json`](../../server-api/eval-prompts.json), Zeile 20. Die Regel wirkt nur als Antwort auf eine Frage.
- **Keine Kennzeichnung der Stimme.** Die Suche nach Wasserzeichen, watermark, c2pa, synthetisch und metadat in `server.ts`, `server-api/`, `pi-client/`, `firmware/`, `docs/picastAI-Pi-API.md` und `deploy/` fand nur einen Kommentar zu einem Feld der Claude-Anfrage ([`server-api/sicherheit-integration.test.ts`](../../server-api/sicherheit-integration.test.ts), Zeile 304).
- **Früher Entwurf, nicht in `main`.** Der Branch `claude/ki-hinweis` (Commit 493c226 vom 6.11.2026, PR #17, nicht gemergt) hat eine feste Ansage mit Version im Server und im Pi-Client. Der Text dort sagt „Computer-Ritter, kein echter Mensch“, nennt aber das Wort KI nicht. Er behauptet ein Leuchten der Lampe, das ich nicht geprüft habe. Ich habe ihn nicht übernommen. Die Texte in Abschnitt 5 sind neu geschrieben.
- Protokolle dürfen nie Äußerungen, Antworttexte, Geräte-IDs oder Tokens enthalten (`CLAUDE.md`). Das gilt auch für die Belege zum Hinweis (E7) und für die Marke (E6).

## 5. Textentwurf

**ENTWURF. Nicht mit Kindern getestet. Nicht rechtlich geprüft. Bis zur Rechtsprüfung hören nur Erwachsene zu.** Alle Texte sind von mir neu geschrieben. Sie dürfen erst gesprochen oder gedruckt werden, wenn der Betreiber sie freigibt und der Hinweis eingebaut und geprüft ist.

### 5.1 Lange Ansage beim ersten Einschalten (vom Server gesprochen, etwa 23 Sekunden)

> Hallo! Ich bin Ritter Kunibert. Ich bin kein Mensch. Ich bin ein Computer, der sprechen kann. Man sagt dazu: eine KI. Ich erzähle dir Geschichten und beantworte deine Fragen. Manchmal irre ich mich. Wenn etwas wichtig ist, frag bitte auch einen Erwachsenen. Mit der Sprechtaste kannst du mir etwas sagen. Mit der Erzähltaste hörst du eine Geschichte.

### 5.2 Kurzer Hinweis vor der ersten Antwort jeder Sitzung (drei Varianten im Wechsel, je etwa 4 bis 6 Sekunden)

> A: Hallo! Hier ist Kunibert, ein sprechender Computer. Ich bin kein Mensch.
>
> B: Ich bin's, Kunibert! Zur Erinnerung: Ich bin eine KI, ein Computer, und kein Mensch.
>
> C: Hallo! Hier spricht Kunibert, der Computer-Ritter. Ich bin kein echter Mensch.

### 5.3 Leitlinie für die Antwort, wenn ein Kind nach der Natur von Kunibert fragt

Das sind Beispiele für die Antwortlinie im Prompt. Es sind keine festen Sätze. Claude formuliert selbst, bleibt aber bei dieser Aussage.

> „Bist du ein Mensch?“ oder „Bist du echt?“: Nein, ich bin kein Mensch. Ich bin ein Computer, den man KI nennt. Ich kann sprechen und Geschichten erzählen. Aber ich bin nicht lebendig wie du.
>
> „Bist du ein echter Ritter?“: Nein. Ritter Kunibert ist eine Figur aus den Geschichten. In Wirklichkeit bin ich ein Computer.
>
> „Bist du mein Papa?“ oder „Bist du meine Mama?“: Nein, ich bin kein Papa und keine Mama. Ich bin ein Computer, kein Mensch.

### 5.4 Erinnerung zu Beginn jeder Geschichte (drei Varianten im Wechsel)

Zu Beginn jeder Folge und vor dem nächsten Teil, wenn das Kind nach einer längeren Pause weitermacht. Der Satz behauptet nicht, dass Kunibert die Geschichte selbst erfunden hat, denn der Prompt verbietet den Anspruch auf Originalgeschichten (`server-api/prompts.ts`, Zeile 97).

> A: Los geht's! Ich bin ein Computer und erzähle dir jetzt eine Geschichte.
>
> B: Bereit? Ich bin ein sprechender Computer. Hier kommt eine Kunibert-Geschichte.
>
> C: Ritter Kunibert erzählt! Ich bin ein Computer, kein Mensch.

### 5.5 Elterninformation, Teil „KI“ (für Eltern-Seite, Beilage und Produktseite)

Das ist nur der KI-Teil. Die Angaben zu Aufnahmen, Daten und Empfängern gehören in die Elterninformation und die Datenschutzerklärung (Punkt I3). Dieser Text beschreibt den geplanten Zustand. Er darf erst veröffentlicht werden, wenn der Hinweis eingebaut und geprüft ist.

> **Ritter Kunibert ist eine KI**
>
> Kunibert ist kein Mensch. Es ist ein Computerprogramm. Es antwortet auf Fragen Ihres Kindes und erzählt Geschichten. Die Antworten erzeugt ein Sprachmodell. Die Sprache wird am Computer erzeugt.
>
> Das Gerät sagt Ihrem Kind das auch selbst: beim ersten Einschalten ausführlich, danach zu Beginn jeder Nutzung kurz. Zu Beginn jeder Geschichte erinnert es noch einmal daran.
>
> Kunibert kann sich irren. Es ersetzt keine Eltern, Lehrer oder Ärzte. Sprechen Sie mit Ihrem Kind darüber, was es hört.

Offen: Ob hier schon steht, dass das Sprachmodell Claude von Anthropic ist, entscheidet die Datenschutzerklärung (Empfänger nennen). Man darf nicht sagen, die Stimme sei keine Aufnahme eines Menschen: Die Standardstimme beruht auf der Aufnahme eines Sprechers ([`stimme-lizenz.md`](stimme-lizenz.md)). Im Text oben steht deshalb nur, dass die Sprache vom Computer erzeugt wird. Was man über die Herkunft der Stimme sagen darf, ist erst klar, wenn N1122-1825-c gelesen ist.

### 5.6 Die sechs Merkmale für Kinder (Fußnote 40) gegen den Entwurf

| Merkmal | Erfüllt der Entwurf es? |
| --- | --- |
| Kindgerecht | Kurze Sätze, Ritter-Ton, das Wort KI wird erklärt. Nicht mit Kindern getestet. |
| Klar, einfach, kurz | Die lange Ansage dauert etwa 23 Sekunden, die kurzen 4 bis 6. Ob 6-Jährige sie verstehen, ist nicht getestet. |
| Leicht erreichbar, wenn nötig | Der Hinweis kommt vom Gerät selbst vor der ersten Antwort. Auf die Frage nach der Natur gibt es eine Antwortlinie (5.3). |
| Amtliche Sprache | Deutsch. Ob das Gerät weitere Sprachen spricht, habe ich nicht geprüft. |
| Ansprechend, zum Beispiel mit Figuren | Die Figur Kunibert spricht selbst. Eine Grafik gibt es am Gerät nicht (Annahme). |
| Über die Zeit verteilt | Lange Ansage nur beim ersten Einschalten, danach kurze Hinweise in drei Varianten, Erinnerung zu Beginn jeder Geschichte. |

Quelle der sechs Merkmale: Q7 (Fußnote 40), in meinen Worten. Die Fußnote ist nur im Bericht des Agenten gelesen.

**Offener Punkt: Barrierefreiheit.** Ein gesprochener Hinweis erreicht gehörlose und schwerhörige Kinder nicht. Das Gerät hat nach meiner Annahme keinen Bildschirm. Abs. 5 verlangt einen barrierefreien Hinweis (Q1; Q7, Rn. 144). Was dafür reicht (Licht, Vibration, Verpackung, Eltern-Seite) und ob die Richtlinien (EU) 2016/2102 und (EU) 2019/882 für ein Spielzeug gelten, habe ich nicht geprüft. Das ist Punkt N1126-1153-f.

## 6. Einschätzung und Empfehlungen

**Entscheidungen (vorläufig, 26.11.2026, ca. 14:45).** Das sind meine Vorschläge. Der Betreiber kann sie ändern.

| Nr. | Empfehlung | Grund |
| --- | --- | --- |
| E1 | **Gesprochener Hinweis vor der ersten Antwort jeder Sitzung.** Der Server erzeugt ihn, der Nutzer kann ihn nicht abschalten. Er kommt auch bei Ersatzsätzen und wenn Claude ausfällt. Eine Sitzung beginnt mit der ersten Anfrage nach dem Einschalten und nach einer Pause. Pausenlänge: Vorschlag 10 Minuten (geschätzt, nicht belegt; keine Quelle nennt eine Zahl). **Lücke:** Eine neue Person hat nach Q7, Rn. 143 ihre eigene erste Interaktion. Kunibert erkennt nicht, wer spricht (Annahme). Ein Kind, das mitten in der Sitzung dazukommt, hört den Hinweis daher nicht. Ausgleich: eine eher kurze Pause, dazu E3 und E4. Ganz geschlossen ist die Lücke damit nicht. Der Betreiber entscheidet, ob der kurze Hinweis öfter kommen soll. | Q4 Rn. 37 und 40, Q7 Rn. 143, Q14 S. 16 |
| E2 | **Lange Ansage nur beim ersten Einschalten.** Danach der kurze Hinweis in drei wechselnden Varianten (5.1, 5.2). Das vermeidet Abstumpfung und verteilt die Information über die Zeit. | Q4 Rn. 39, Q7 Fn. 40 |
| E3 | **Erinnerung zu Beginn jeder Geschichte** und nach längerer Pause (5.4). Das Erzählen ist ein Rollenwechsel, und Kinder sind verletzlich. | Q4 Rn. 37 und 40 |
| E4 | **Prompt-Regel bleibt** und bekommt die Antwortlinie aus 5.3. Dazu ein Test, der prüft, dass auf die Frage nach der Natur eine klare Antwort kommt, auch nach einer Geschichte. Die Erinnerung gilt immer, wenn das Kind danach fragt oder verwirrt wirkt. | Q4 Rn. 40 |
| E5 | **Elterninformation, Produktseite und Verpackung nennen die KI**, aber nur als Ergänzung. Sie ersetzen den gesprochenen Hinweis nicht. Der Gesamttext der Elterninformation ist Punkt I3. | Q4 Rn. 38 und 50, Q7 Rn. 142 |
| E6 | **Stimme: Marke und Erkennung planen.** Reihenfolge: (1) den Kodex im Volltext lesen (N1126-1153-b, erledigt am 26.11.2026: [`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md)); (2) am erzeugten Ton prüfen, ob Pocket TTS etwas einbettet (N1126-1153-d); (3) ein Verfahren für Sprache wählen (N1126-1153-c): Wasserzeichen im letzten Serverschritt nach der Abtastratenwandlung, dazu Metadaten (Metadaten allein reichen wohl nicht, weil der enge Fall in Rn. 86 nicht passt); (4) ein Erkennungsmittel für Betroffene bereitstellen; (5) nichts Personenbezogenes in die Marke, vor allem keine Geräte-ID. Protokollierung als Verfahren passt schlecht, weil Protokolle nie Äußerungen oder Antworttexte enthalten. Keine weitere Stimme aus einer Aufnahme klonen. Die Standardstimme beruht selbst auf einer Aufnahme (R1 in [`stimme-lizenz.md`](stimme-lizenz.md)). N1122-1825-c kommt deshalb vor jede Aussage zur Herkunft der Stimme. | Q5 Rn. 69 bis 78, 86, 92, 94; Q20 |
| E7 | **Belege führen.** Fassung des Hinweises, Datum der Einführung und Ergebnis der Hörprobe mit Erwachsenen in `docs/` festhalten, nicht im Protokoll. Der Anbieter muss belegen können, dass die Ausnahmen oder Marken wirken. | Q4 Rn. 42, Q5 Rn. 74 |
| E8 | **Den Hinweis auch bei Tests mit Erwachsenen einbauen**, vorsorglich. Tests unter Echtbedingungen sind nicht von der Forschungsausnahme gedeckt. | Q3 Rn. 22 |
| E9 | **Vor dem ersten Test mit Kindern** die „Freigabe-Checkliste vor dem ersten Kind“ im Doc „Datenschutz-Folgenabschätzung“ (Claude-Projekt) mit dem Betreiber durchgehen. Hinweis und Marke müssen vorher laufen. Die Texte müssen vorher verständlich geprüft sein. | `CLAUDE.md` |

**Reihenfolge fürs Bauen (Vorschlag).** Erst N1123-1153-a (Hinweis, E1 bis E4). Er braucht keine weitere Recherche und ist der größere Hebel: Er erfüllt auch die Bedingung von Anthropic. Danach N1123-1153-b (Marke), sobald N1126-1153-b bis -d gelesen sind. Beide Bau-Punkte ändern, was Kinder hören, und brauchen „(ändert, was Kinder hören)“ im Titel. Läufe mit Sonnet schreiben dafür keinen Code (Regel in [`docs/autopilot/README.md`](../autopilot/README.md)). Sie brauchen einen Lauf mit dem stärkeren Modell oder den Betreiber in Claude Code.

**Rechtsrisiken (Einschätzung).**

- **Ohne Hinweis und Marke ab dem ersten Verkauf** drohen Bußgelder bis 15 Mio. EUR oder 3 % des Umsatzes, je nachdem, was höher ist. Für kleine und mittlere Unternehmen gilt der niedrigere Wert (Q7, Rn. 152). Das Risiko wächst mit dem ersten Verkauf. Bis dahin hören nur Erwachsene zu.
- **Verstoß gegen die Nutzungsrichtlinie von Anthropic** kann bei ausbleibender Abhilfe zur Sperrung des Kontos führen (Q14, Q15). Das wäre ein Geschäftsrisiko, weil das Sprachmodell dann fehlt.
- **Herkunft und Zustimmung bei den Stimmen** sind offen. Die Standardstimme `stuart_bell` geht auf die Aufnahme eines echten Sprechers zurück. Seine Zustimmung zur KI-Stimme ist nicht belegt (R1 in [`stimme-lizenz.md`](stimme-lizenz.md)). Das Kyutai-Verbot (Q20) und Persönlichkeitsrechte könnten greifen (N1122-1825-c, -e).
- **Die Leitlinien können strenger werden.** Sie sind nicht bindend und können geändert werden (Q7, Rn. 155). Die Bibliotheksseite wurde am 5.11.2026 aktualisiert; ob das PDF danach ersetzt wurde, ist nicht geprüft (Q8).
- **Ein Hinweis, der Kinder verwirrt oder ängstigt.** Das ist nicht getestet und erst nach der Freigabe-Checkliste prüfbar (E9).

## 7. Widersprüche und Lücken zwischen den Quellen

1. **Erinnerungen:** Rn. 37 nennt Erinnerungen in längeren Gesprächen, Rn. 40 sagt, meist genüge ein Hinweis (Q4). Rn. 40 bindet Erinnerungen an Risikokontexte und nennt Kinder ausdrücklich. Ich folge der strengeren Lesart (E3).
2. **Zeitpunkt:** Rn. 33 sagt spätestens bei der ersten Interaktion, Rn. 40 sagt vor ihr (Q4). Das ist eine leichte Spannung, kein Widerspruch. Ich folge dem Strengeren: vor der ersten Antwort (E1).
3. **EU und Anthropic:** Die EU verlangt den Hinweis einmal zu Beginn einer Sitzung, für jede neue Person (Q7, Rn. 143). Anthropic verlangt ihn zu Beginn jeder Chat-Sitzung oder in der Produktoberfläche (Q14). Ein Hinweis zu Beginn jeder Sitzung erfüllt die Regel von Anthropic. Die EU-Regel erfüllt er für jede Person, die von Anfang an dabei ist (Einschätzung).
4. **Anthropic, Pflicht oder Empfehlung:** Q15 formuliert die Offenlegung als Pflicht, die Einleitung und der Schluss derselben Seite sprechen von Empfehlungen. Q16 nennt sie eine Empfehlung. Q14, die Nutzungsrichtlinie (gültig ab 12.11.2026), sagt Pflicht. Ich behandle sie als Pflicht.
5. **Daten der Anthropic-Seiten:** Q15 und Q16 tragen „16. März 2026“ ohne Beschriftung, Q18 „26. Juni 2026“ ohne Beschriftung. Q17 ist am 10.5.2024 veröffentlicht, in den Metadaten am 14.10.2026 geändert. Ob die Hilfeartikel nach der Richtlinie vom 12.11.2026 noch gelten, ist nicht belegt.
6. **Status der Leitlinien:** Die Kennung ist als endgültig bezeichnet, der Titel der Titelseite nennt aber einen Entwurf der Mitteilung, deren Inhalt gebilligt wird (Q3). Die Bibliotheksseite wurde am 5.11.2026 aktualisiert (Q8). Was sich änderte, steht nicht im gelesenen Text.
7. **Absätze des Kodex:** Q9 und Q12 nennen Abs. 2, 4 und 5, Q10 nur Abs. 2 und 4. Abs. 1 nennt keine Seite.
8. **Der 2.12.2026:** Q10 und Q12 nennen den Tag, Q13 nur den Monat Dezember 2026, Q9 und Q11 nichts.
9. **Stand der Kommissionsseiten:** Q10 (10.6.2026) nennt die Prüfung des Kodex durch Kommission und KI-Gremium als künftig, Q12 (24.7.2026) als erfolgt. Q10 ist älter. Q9 ist die jüngste Seite (19.10.2026). Schon die Wiedergabe von Q10 durch das Werkzeug ist uneinheitlich: Sie nennt die Bewertung an einer Stelle als erfolgt, an einer anderen als künftig. Ohne Rohtext nicht zu klären.
10. **Zahl der Unterzeichner:** etwa 190 (Q9, Ende Juli) gegen über 187 Teilnehmende am Entwurfsprozess (Q10). Das sind wohl zwei verschiedene Zahlen. Ohne Rohtext nicht zu klären.
11. **Titel des Kodex:** Q11 nennt ihn Kennzeichnung KI-erzeugter Inhalte, Q10, Q12 und Q13 nennen ihn Transparenz KI-erzeugter Inhalte. Ob es ein Dokument ist, ist nicht geprüft.
12. **Bußgeld:** Q7, Rn. 152 sagt, der höhere Wert gilt. Q12 und Q13 lassen es offen. Maßgeblich ist Rn. 152.
13. **Kapitel zur Chatbot-Pflicht in Q12:** Der Anbieter-Teil zählt sie zuerst zu Abs. 2, später zu Abs. 1. Q1 stützt Abs. 1.
14. **Erwägungsgrund 132 und Leitlinien:** Der Erwägungsgrund (Fassung 2024) nennt das Alter, aber keine Kinder (Q2). Die Leitlinien konkretisieren das und betonen Kinder ausdrücklich (Q4, Rn. 34). Das ist eine Konkretisierung, kein Widerspruch (Einschätzung).
15. **Kyutai, Verbotsliste:** Beim ersten Abruf nannte das Werkzeug je Seite andere Punkte der Verbotsliste (Q19, Q20, Q22). Q20 wurde ganz im Wortlaut gelesen und ist maßgeblich.
16. **Kyutai, Stand:** Q19 nennt sieben Sprachen und die Neuerung vom Oktober 2026, Q20 sechs. Q19 ist also neuer. Q20 ist die Seite mit dem Verbotsabsatz im Wortlaut.
17. **Lizenzen:** Code unter MIT (Q19), Repository unter CC BY 4.0 (Q20). Das ist für H3 ohne Folge. Der Punkt N1122-1825-e prüft es.

## 8. Eigene Rechnung

- Vom 26.11.2026 bis zum 2.12.2026 sind es 6 Tage (30 − 26 = 4 Tage bis zum 30.11., dazu 2). Für ein neues Gerät ist das ohne Bedeutung, weil die Frist nur Systeme von vor dem 2.8.2026 betrifft (Q7, Rn. 153).
- Sprechdauer (Annahme: 2,5 Wörter je Sekunde, geschätzt und nicht gemessen): lange Ansage 5.1: 57 Wörter, rund 23 Sekunden. Kurze Hinweise 5.2: 11, 14 und 11 Wörter, rund 4 bis 6 Sekunden. Erinnerungen 5.4: 12, 10 und 9 Wörter, rund 4 bis 5 Sekunden. Elterninformation 5.5: 80 Wörter mit Überschrift (75 ohne), rund 32 Sekunden Lesezeit bei 150 Wörtern je Minute (Annahme). Die Wörter sind mit einem Skript gezählt.
- Höchstbetrag der Geldbuße für ein kleines Unternehmen: der niedrigere Wert aus 15 Mio. EUR und 3 % des Jahresumsatzes (Q7, Rn. 152). Beispiel mit einem erfundenen Umsatz von 1 Mio. EUR: 3 % sind 30.000 EUR. Das ist nur die Obergrenze, keine erwartete Strafe, und keine Zahl aus den Konten des Betreibers.

## 9. Quellen

Alle Seiten wurden am 26.11.2026 durch Unteragenten (Claude Sonnet) über das Abrufwerkzeug gelesen. Ein Zitat je Quelle, höchstens 15 Wörter. Die Zitate stammen aus den Berichten der Agenten, nicht aus einem Gegenlesen am Original. „Art“ heißt: amtlich (Gesetzgeber, Kommission), Hersteller (Seite des Herstellers) oder sonstige Quelle. „Wortlaut“ heißt: Der Agent bekam den Seitentext vom Werkzeug. „Zusammenfassung“ heißt: Der Agent bekam nur die Antwort eines kleinen Modells des Werkzeugs. Das Werkzeug stufte die meisten Seiten als nicht vorab freigegeben ein (nicht in jedem Bericht vermerkt). Wo das galt, durften die Agenten nur kurze Zitate (höchstens 125 Zeichen) wiedergeben und den Rest nur in eigenen Worten. Q3 bis Q7 sind dasselbe PDF (173.987 Zeichen), in fünf überlappenden Fenstern gelesen.

| Nr. | Quelle | Art und Lesestand | Zitat |
| --- | --- | --- | --- |
| Q1 | KI-Verordnung, Art. 50, AI-Act-Service-Desk der Kommission (konsolidierte Fassung vom 27.7.2026), https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50 | amtlich · Wortlaut, ganz (41.309 Zeichen) | „at the latest at the time of the first interaction or exposure“ |
| Q2 | Erwägungsgrund 132 der KI-Verordnung (Fassung vom 13.6.2024), AI-Act-Service-Desk, https://ai-act-service-desk.ec.europa.eu/en/ai-act/recital-132 | amtlich · Wortlaut, ganz (35.176 Zeichen) | „vulnerable groups due to their age or disability“ |
| Q3 | Leitlinien der Kommission zu Art. 50, C(2026) 5054 vom 20.7.2026, PDF, Fenster 1: Zeichen 0 bis 39.760 (Titelseite bis Rn. 30), https://ai-act-service-desk.ec.europa.eu/sites/default/files/2026-07/guidelines_on_the_implementation_of_the_transparency_obligations_for_certain_ai_systems_under_article_50_of_the_ai_act_bzptwqhk0ikg1dtlddap41psfy_131215.pdf | amtlich · Wortlaut, 39.760 von 173.987 Zeichen | „These Guidelines are non-binding.“ |
| Q4 | Dieselben Leitlinien, Fenster 2: Zeichen 39.000 bis 78.760 (Rn. 31 bis 66), gleiche Adresse wie Q3 | amtlich · Wortlaut, 39.760 von 173.987 Zeichen | „explicit spoken statements at the beginning of the interaction“ |
| Q5 | Dieselben Leitlinien, Fenster 3: Zeichen 78.000 bis 117.760 (Rn. 65 bis 113), gleiche Adresse wie Q3 | amtlich · Wortlaut, 39.760 von 173.987 Zeichen; über Gliederung und Nachfragen gelesen | „two distinct, but inherently interlinked elements“ |
| Q6 | Dieselben Leitlinien, Fenster 4: Zeichen 117.000 bis 156.760 (Rn. 114 bis 142), gleiche Adresse wie Q3 | amtlich · Wortlaut, 39.760 von 173.987 Zeichen | „AI voice replication for fictional characters“ |
| Q7 | Dieselben Leitlinien, Fenster 5: ab Zeichen 156.000 bis zum Ende (Rn. 142 bis 155, Fußnoten 39 bis 50), gleiche Adresse wie Q3 | amtlich · Wortlaut, bis zum Ende | „at least, be provided once at the start of an interactive session“ |
| Q8 | Kommission: Bibliotheksseite „Guidelines on transparency obligations for providers and deployers of AI systems“, https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems | amtlich · Zusammenfassung (Seite zuletzt am 5.11.2026 aktualisiert) | „These transparency obligations apply from 2 August 2026.“ |
| Q9 | Kommission: Seite zum Verhaltenskodex für KI-erzeugte Inhalte (letzte Änderung 19.10.2026), https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content | amtlich · Zusammenfassung | „effective, interoperable, robust, and reliable“ |
| Q10 | Kommission: Fragen und Antworten zum Kodex (Stand 10.6.2026), https://digital-strategy.ec.europa.eu/en/faqs/code-practice-transparency-ai-generated-content | amtlich · Zusammenfassung | „Adherence to the code of practice is voluntary.“ |
| Q11 | Kommission: Meldung zur Veröffentlichung des Kodex (10.6.2026, geändert 12.6.2026), https://digital-strategy.ec.europa.eu/en/news/commission-publishes-code-practice-marking-and-labelling-ai-generated-content | amtlich · Zusammenfassung | „Code of Practice on marking and labelling of AI-generated content“ |
| Q12 | Kommission: Fragen und Antworten zu Art. 50 (Stand 24.7.2026), https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act | amtlich · Zusammenfassung | „chatbots, AI agents, and avatars“ |
| Q13 | Kommission: Quick Facts zu den Transparenzregeln (Stand 29.7.2026), https://digital-strategy.ec.europa.eu/en/factpages/quick-facts-transparency-rules-ai-systems | amtlich · Zusammenfassung | „as amended by the AI Omnibus“ |
| Q14 | Anthropic: Usage Policy, PDF, „Effective—Nov 12, 2026“, https://assets.claude.com/88cf16e8b7d203be16d2c726bcd28a6ec7c7f5c8.pdf | Hersteller · Wortlaut, ganz (31.706 Zeichen) | „must disclose to users that they are interacting with AI rather than a human“ |
| Q15 | Anthropic: Hilfeartikel „Responsible Use of Anthropic's Models: Guidelines for Organizations Serving Minors“ (Datum 16.3.2026 ohne Beschriftung), https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors | Hersteller · Wortlaut, ganz (9.125 Zeichen der Seite) | „Organizations must disclose to their users that they are interacting with an AI system“ |
| Q16 | Anthropic: Hilfeartikel zum Start eines Produkts mit der Claude API (Datum 16.3.2026 ohne Beschriftung), https://support.claude.com/en/articles/8241216-i-m-planning-to-launch-a-product-using-the-claude-api-what-steps-should-i-take-to-ensure-i-m-not-violating-anthropic-s-usage-policy | Hersteller · Wortlaut, ganz (8.491 Zeichen der Seite) | „disclose to your users that they are interacting with an AI system“ |
| Q17 | Anthropic: Meldung „Updating our Usage Policy“ (veröffentlicht 10.5.2024, in den Metadaten geändert 14.10.2026), https://www.anthropic.com/news/updating-our-usage-policy | Hersteller · Wortlaut, ganz (8.080 Zeichen der Seite) | „allows organizations to incorporate our API into their products for minors“ |
| Q18 | Anthropic: Hilfeartikel „Child safety guidance for developers“ (Datum 26.6.2026 ohne Beschriftung), https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers | Hersteller · Wortlaut, ganz (13.362 Zeichen der Seite) | „You are responsible for implementing appropriate safeguards against these risks on your deployment.“ |
| Q19 | Kyutai: GitHub-Seite von Pocket TTS, https://github.com/kyutai-labs/pocket-tts | Hersteller · Wortlaut, 39.950 von 53.119 Zeichen; der Rest nur als Zusammenfassung | „MIT license“ |
| Q20 | Kyutai: Hugging-Face-README von Pocket TTS, https://huggingface.co/kyutai/pocket-tts/blob/main/README.md | Hersteller · Wortlaut, ganz (32.597 Zeichen) | „voice impersonation or cloning without explicit and lawful consent“ |
| Q21 | Kyutai: Hugging-Face-README von TTS 1.6B (Schwestermodell), https://huggingface.co/kyutai/tts-1.6b-en_fr/raw/main/README.md | Hersteller · Wortlaut, ganz (3.915 Zeichen) | „This model does not perform watermarking for two reasons:“ |
| Q22 | Kyutai: Hugging-Face-README „pocket-tts-without-voice-cloning“ (Commit b336510), https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/blob/b336510a57267ba8e007de68e942fbce5e17b313/README.md | Hersteller · Zusammenfassung | „misinformation, disinformation, or deception“ |
| Q23 | Kyutai: Seite zu Text-to-Speech, https://kyutai.org/tts/ | Hersteller · Zusammenfassung | „You can anonymously donate your voice to be added to the voice repository“ |

## 10. Nicht geprüft

**Grenzen der Methode**

- Ich habe nie einen Rohtext gesehen, nur die Berichte der Abruf-Agenten. Zitate, Randnummern, Zahlen und „steht nicht im gelesenen Text“ sind nicht am Original gegengelesen. Die Fenster Q3 bis Q7 begannen und endeten mitten im Satz. Q5 wurde über einen Gliederungsbericht und gezielte Nachfragen gelesen. Nicht jede Randnummer wurde einzeln berichtet.
- Q8 bis Q13 und Q22 bis Q23 liegen nur als Zusammenfassung des Werkzeugs vor. Das ist die schwächste Stufe. Bei Q15 bis Q18 durften die Agenten nur kurze Zitate nennen, den Rest in eigenen Worten.
- Beim ersten Versuch bekam ich zu den Anthropic- und Kyutai-Seiten nur Antworten eines kleinen Modells. Diese Seiten wurden ein zweites Mal gelesen. Die erste Adresse der Nutzungsrichtlinie leitete um (HTTP 302) auf eine Datei mit anderem Namen. Gelesen habe ich eine Adresse aus einem Suchtreffer (Q14), ohne Umweg. Ob beide Dateien dasselbe Dokument sind, ist nicht geprüft. Zwei Agenten brachen wegen zu langer Berichte ab und wurden mit kürzeren Aufträgen neu gestartet.
- Die Aussagen über den Stand des Repos stammen aus einer Textsuche in `main` am 26.11.2026. Nichts davon wurde ausgeführt.
- Zwei unabhängige Durchsichten (Claude Opus, zwei Prüfer mit getrennten Aufgaben) sind im PR-Bericht zu diesem PR (#125) beschrieben. Ihre Befunde sind in dieses Dokument eingearbeitet.

**KI-Verordnung und Leitlinien**

- Der Wortlaut von Art. 50 vor dem Digital-Omnibus und die Verordnung (EU) 2026/1744 selbst. Die Erwägungsgründe 133 bis 137 (nur genannt).
- Die deutsche Fassung der Leitlinien (Kennung 134791), die Pressemitteilung vom 20.7.2026 und ob das PDF nach der Aktualisierung der Bibliotheksseite am 5.11.2026 ersetzt wurde.
- Das Anmeldeformular, die Unterzeichnerliste und die Stellungnahme der Kommission zur Angemessenheit. Der Volltext des Verhaltenskodex und die Kommissionsseite zur Unterzeichnung sind seit dem Abend des 26.11.2026 gelesen ([`kodex-kennzeichnung-ki-inhalte.md`](kodex-kennzeichnung-ki-inhalte.md)).
- Welche deutsche Behörde für Art. 50 zuständig ist und ob es ein deutsches Durchführungsgesetz gibt.
- Ob die Richtlinien (EU) 2016/2102 und (EU) 2019/882 für ein Spielzeug gelten (Barrierefreiheit des Hinweises).
- Ob ein Test mit Erwachsenen zu Hause ein „Test unter Echtbedingungen“ ist (Rn. 22). Ob Prototypen bei Testpersonen schon als „in Betrieb genommen“ zählen (Rn. 153).
- Ob picastai zugleich Betreiber im Gesetz ist (Rn. 12 und 15) und ob Abs. 3 und 4 dann picastai selbst treffen.
- Ob und wie Kunibert merken könnte, dass eine neue Person spricht (Rn. 143). Eine Stimmerkennung wäre ein Datenschutzthema und ist nicht untersucht.
- Verbraucherrecht (Rn. 50 der Leitlinien: unlautere Geschäftspraktiken, Verbraucherrechte), Datenschutzpflichten (Information, Einwilligung der Eltern) und der Schutz der Stimme als Persönlichkeitsrecht. Das ist nicht Teil von H3.
- Welche Verfahren der Kennzeichnung für Sprache es gibt, wie robust sie sind, was sie kosten und unter welcher Lizenz sie stehen. Welches Erkennungsmittel passt.

**Anthropic**

- Die Nutzungsbedingungen (Altersgrenzen), die Richtlinie zu unterstützten Regionen und ob die Hilfeartikel nach dem 12.11.2026 noch gelten. Ob die Adresse der Richtlinie in Fußzeilen und Text dasselbe Dokument zeigt. Ob die Datei, auf die die erste Adresse der Richtlinie umleitete, dasselbe Dokument ist wie Q14 (die Dateinamen sind verschieden). Die Meldung zur Nutzungsrichtlinie 2026 auf anthropic.com habe ich nicht selbst gelesen. Ein Prüfer fand sie live: veröffentlicht am 8.10.2026, gültig ab 12. November, zu KI-Hinweisen in Chatbots nichts.
- Ob es den Kinderschutz-Systemprompt heute gibt. Die Pflichten zum Melden (zum Beispiel an die US-Stelle NCMEC) für Entwickler. Wie Anthropic prüft.

**Kyutai und Pocket TTS**

- Der Code, der technische Bericht (arXiv 2509.06926 und Blog), die Dokumentation, die Trainings-Anleitung und die Lizenztexte (MIT, CC BY 4.0). Die letzten 13.169 Zeichen der GitHub-Seite im Wortlaut (dort steht der Abschnitt zur verbotenen Nutzung).
- Der Stimmenkatalog (https://huggingface.co/kyutai/tts-voices) mit Lizenz und Herkunft je Stimme. Für `stuart_bell` hat der Lauf H5 die Kette bis zu LibriVox gelesen ([`stimme-lizenz.md`](stimme-lizenz.md)); die Seite von Voice-Zero war dort gesperrt. Offen sind Herkunft und Lizenz der vier Stimmen im Zweig `add_lang_not_documented` (darunter `juergen`). Ob die Zugangsabfrage bei Hugging Face aktiv ist.
- Ob der erzeugte Ton eine Marke trägt. Es wurde kein Ton erzeugt und keiner untersucht.

**Texte (Abschnitt 5)**

- Keine Hörprobe, kein Test mit Kindern, keine Prüfung durch eine Fachperson für Kindersprache. Verständlichkeit für 6-Jährige ist nicht geprüft. Die Sprechdauer ist gerechnet, nicht mit der echten Stimme gemessen.
- Ob die Prompt-Regel (`server-api/prompts.ts`, Zeile 208) in einer Antwort greift, wurde nicht ausgeführt (kein Lauf der Prüfsätze).
- Ob der Entwurf der Elterninformation zu dem passt, was der Code wirklich verarbeitet (Punkt I3).

**Sonst**

- Alle Fristen können sich ändern. Der Stand gilt nur für den 26.11.2026 (siehe N1123-1153-j).

## 11. Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Betreiber | Vor der Entscheidung die Stellen am Original lesen: Q4 Rn. 36 bis 45, Q5 Rn. 69 bis 93, Q7 Rn. 142 bis 153, Q14 S. 16. | Browser |
| Betreiber | Die Empfehlungen E1 bis E9 (Abschnitt 6) und die Texte (Abschnitt 5) freigeben oder ändern. Besonders: Wortlaut des Hinweises, Pausenlänge, nach der eine neue Sitzung beginnt (Vorschlag 10 Minuten), und ob der kurze Hinweis öfter kommen soll, weil eine neue Person mitten in der Sitzung ihren eigenen Hinweis braucht (E1). | im Chat |
| Betreiber | Entscheiden, ob picastai den Verhaltenskodex unterzeichnen will. Die Anmeldung ist eine Nachricht an Dritte. Claude schickt nichts ab. | im Chat |
| Betreiber | Vor dem ersten Test mit Kindern die „Freigabe-Checkliste vor dem ersten Kind“ im Doc „Datenschutz-Folgenabschätzung“ mit Claude durchgehen. Bis dahin testen nur Erwachsene. | im Chat |
| Claude (Lauf Bauen, starkes Modell) | N1123-1153-a bauen: gesprochener Hinweis vor der ersten Antwort jeder Sitzung, Antwortlinie, Erinnerung bei Geschichten, Tests. Titel mit „(ändert, was Kinder hören)“. | Repo, `docs/autopilot/backlog.md` |
| Claude (Lauf Recherche) | N1126-1153-b (erledigt am 26.11.2026, PR #142): Verhaltenskodex im Volltext lesen. N1126-1153-c: Verfahren zur Kennzeichnung von Sprache. N1126-1153-e: Anthropic-Auflagen für Produkte mit Minderjährigen gegen das Repo prüfen. N1126-1153-f: Barrierefreiheit des Hinweises. | `docs/recherche/` |
| Claude (Lauf Bauen oder Prüfen) | N1126-1153-d: Tonprobe, ob Pocket TTS etwas in den Ton schreibt. Danach N1123-1153-b (Kennzeichnung bauen). | Repo |
| Claude (Lauf Recherche) | N1122-1825-c und N1122-1825-e: Herkunft und Lizenz der Stimmen; zuerst die Zustimmung des Sprechers hinter `stuart_bell` (R1 in `stimme-lizenz.md`). | `docs/recherche/` |
| Claude (Lauf „Planen & Bericht“) | Ergebnis und die Rechtsrisiken in `claude/aufgaben.md` und ins Stand-Dokument eintragen. Vorschläge fürs Doc „Datenschutz-Folgenabschätzung“. | Claude-Projekt |
