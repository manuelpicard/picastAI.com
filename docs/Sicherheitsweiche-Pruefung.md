# Sicherheitsweiche: Unterlage für die fachliche Prüfung

Für eine Fachkraft ohne Programmierkenntnisse (zum Beispiel Kinderschutz, Pädagogik, Psychologie).

**Stand:** 6. November 2026, Code-Stand `main` nach PR #14. **Quellen:** nur der Programmcode (`server-api/safety.ts`, `server-api/brain.ts`, `server-api/prompts.ts`) und die Tests (`server-api/safety.test.ts`, `server-api/brain.test.ts`). Was in den Tests steht, ist als **(Test)** gekennzeichnet. Sätze ohne diesen Vermerk wurden zusätzlich am 6. November 2026 mit dem Code ausprobiert; sie stehen nicht in den Tests.

**Wichtig:** Dieses Dokument beschreibt, was die Software tut. Es sagt **nicht**, dass sie ausreicht. Ob das Gerät mit Kindern getestet werden darf, entscheidet erst Ihre Prüfung (so steht es auch in `deploy/CHECKLISTE.md` unter „Go / No-Go“). Am Ende stehen Fragen an Sie.

## 1. Der Weg einer Äußerung

Das Gerät hat zwei Tasten. Mit der **Sprechtaste** stellt das Kind eine Frage, mit der **Erzähltaste** hört es eine Geschichte von Ritter Kunibert.

1. **Spracherkennung.** Die Aufnahme wird in Text umgewandelt. Dabei sind Fehler möglich. Alles Weitere sieht nur diesen Text, nie die Stimme.
2. **Stufe 1: Sicherheitsweiche (Mustersuche).** Eine feste Liste von Wort-Schablonen. Passt der Text des Kindes auf eine Schablone, spricht das Gerät sofort eine **feste Hilfe-Ansage** (Abschnitt 4). Das Sprachmodell Claude wird dann **nicht** gefragt.
3. **Stufe 2: Einstufung durch Claude.** Nur wenn Stufe 1 nichts findet. Claude ordnet die Äußerung einer von fünf Gruppen zu. Eine davon heißt „sicherheit“ (Abschnitt 5). Dann kommt dieselbe feste Ansage.
4. **Stufe 3: Ausgabe-Check.** Ein Text, den Claude geschrieben hat, wird vor dem Vorlesen auf bestimmte Wörter geprüft (Abschnitt 6). Bei einem Treffer wird er durch einen festen Ersatztext ersetzt.
5. **Vorlesen** über die Sprachausgabe.

Was gilt, wenn etwas fehlt:

| Situation | Was bleibt als Schutz |
| --- | --- |
| Normalbetrieb mit Claude | Stufe 1, Stufe 2, Stufe 3 |
| Claude nicht eingerichtet (kein Schlüssel) oder Claude fällt aus | **Nur Stufe 1.** Sätze, die Stufe 1 nicht erkennt, bekommen einen festen, allgemeinen Antworttext (Abschnitt 7.4). |
| Erzähltaste | Das Kind sagt nichts, es gibt keinen Text zum Prüfen. Stufe 1 und 2 entfallen. Stufe 3 prüft die von Claude geschriebene Geschichte. |

Das Gerät merkt sich kein Gespräch. **Jede Äußerung wird für sich geprüft**, ohne die vorherigen zu kennen.

## 2. Welche Notlagen Stufe 1 erkennt

Eine **Schablone** ist eine Wortfolge wie „ich will nicht mehr leben“. Die Prüfung ignoriert Groß- und Kleinschreibung sowie Satzzeichen. Die Schablonen sind bewusst **großzügig** gebaut: Im Programmtext steht, ein Fehlalarm koste nur einen Hinweis, eine Lücke dagegen ein Kind in Not. Nur Deutsch.

Alle Beispiele in der Spalte „Erkannt“ sind in den Tests und **müssen** anschlagen **(Test)**.

| Gruppe | Gemeint ist | Erkannt, zum Beispiel |
| --- | --- | --- |
| Selbstverletzung, Suizidgedanken | Das Kind will sich etwas antun, nicht mehr leben oder nicht mehr da sein. | „ich will nicht mehr leben“ · „ich möchte sterben“ · „ich will mir wehtun“ · „ich wäre lieber tot“ · „Am liebsten wäre ich tot.“ · „niemand würde mich vermissen“ · „Ich glaube, es wäre besser, wenn es mich nicht gäbe“ |
| Gewalt gegen das Kind | Jemand schlägt, tritt oder würgt das Kind oder sperrt es ein. | „mein papa schlägt mich“ · „er hat mich geschlagen“ |
| Übergriffe, Geheimhaltung | Jemand fasst das Kind an; Geheimhaltung wird verlangt. Die Schablonen prüfen nicht, ob das Kind es will (siehe 7.3). | „jemand hat mich angefasst“ · „mein onkel fasst mich immer an“ · „keiner darf wissen was er mit mir macht“ · „ich soll es niemandem sagen“ |
| Medizinische Notlage | Atemnot, Blutung, Tabletten oder Putzmittel geschluckt, Knochenbruch, aufgeschnittener Körperteil. | „ich kann nicht atmen“ · „ich habe keine luft“ · „ich hab tabletten geschluckt“ · „ich habe mir den arm gebrochen“ · „Ich habe mir gestern den Finger aufgeschnitten“ |
| Feuer, Rauch, Gas | Gefahr im Raum. | „es brennt“ · „es riecht nach gas“ · „Ich rieche Gas.“ · „rauch in der wohnung“ |
| Person reagiert nicht, Sturz | Eine Person ist bewusstlos, gestürzt oder antwortet nicht. | „mama bewegt sich nicht“ · „mein papa ist bewusstlos“ · „opa ist gestürzt“ · „Mama ist umgekippt.“ · „Oma liegt auf dem Boden und sagt nichts mehr“ · „opa liegt im flur und reagiert nicht“ |
| Verloren, getrennt, allein | Das Kind hat sich verlaufen oder die Eltern verloren. | „ich hab mich verlaufen“ · „Ich habe mich im Wald verirrt“ · „ich weiß nicht wo ich bin“ · „ich finde mama nicht“ · „Ich habe Mama und Papa verloren.“ · „Ich bin im Supermarkt und finde meine Mama nicht mehr“ · „ich bin ganz allein im kaufhaus“ |
| Fremde Person | Ein Fremder will das Kind mitnehmen. | „ein fremder mann will dass ich mitkomme“ · „Ein Fremder will mich mitnehmen.“ · „Ein fremder Mann hat gesagt, ich soll in sein Auto einsteigen.“ |

## 3. Was Stufe 1 absichtlich nicht erkennt

Die Tests halten auch fest, was **nicht** anschlagen darf. Ein Fehlalarm verunsichert ein Kind. Alle Beispiele sind **(Test)**.

| Art | Nicht erkannt, zum Beispiel |
| --- | --- |
| Geschichten und Spielfiguren | „der drache hat den ritter geschlagen“ · „der drache bewegt sich nicht“ · „Der Drache liegt da und sagt nichts.“ · „Der Ritter hat sich im Wald verirrt.“ · „Papa riecht nach Rauch.“ · „Warum riecht der Drache nach Rauch?“ |
| Kleine Missgeschicke | „Ich habe mir die Zunge verbrannt.“ · „Ich habe mir ein Brot aufgeschnitten.“ · „Ich habe mir das Herz gebrochen.“ · „mein bauch tut mir weh“ · „es riecht nach verbranntem toast“ |
| Meinungen | „Ich finde Papa nicht mehr lustig.“ · „Ich sehe meine Eltern nicht mehr so oft.“ · „ich finde papa nicht schlimm“ |
| Zuwendung und Pflege | „mama küsst mich“ · „mama zieht mich an“ · „der ritter fasst den drachen an“ |
| Harmloses Alleinsein | „ich bin allein im zimmer“ · „mama ist im supermarkt“ · „oma liegt im bett und schläft“ · „keiner will mit mir spielen“ |
| Redewendungen | „ich will nicht sterben“ · „ich bring mich um den schlaf“ · „ich möchte nicht mehr warten“ |

Im Programmtext steht ausdrücklich: „Ich habe mich verbrannt“ schlägt **absichtlich** nicht an, weil es zu oft harmlos ist. Darüber, ob diese Grenzen richtig liegen, möchten wir Ihr Urteil (Fragen in Abschnitt 8).

## 4. Was Kunibert dann antwortet

Bei jedem Treffer von Stufe 1 (und bei „sicherheit“ von Claude) spricht das Gerät **immer denselben Text**, mit den Voreinstellungen für die Nummern:

> Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein. Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie, einer Lehrerin, einem Lehrer oder einer Nachbarin. Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die Eins Eins Zwei an. Du kannst auch bei der Nummer gegen Kummer anrufen: Eins Eins Sechs, Eins Eins Eins. Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag.

Wichtig für die Bewertung:

- **Ein Text für alle Lagen.** Bei Feuer, bei Suizidgedanken und beim Verlaufen im Supermarkt klingt die Ansage gleich. Sie nennt keine Situation und stellt keine Rückfrage.
- Die beiden Nummern lassen sich einstellen (`KUNIBERT_EMERGENCY_NUMBER_PRIMARY`, `KUNIBERT_EMERGENCY_NUMBER_KUMMER`). Voreinstellung wie oben.
- Der Text des Kindes geht bei einem Treffer **nicht** an Claude. Der Code speichert ihn nicht und schickt nichts an Dritte.
- **Es gibt keine Meldung an Eltern oder Stellen** und keinen automatischen Anruf. Im Code ist so etwas nicht vorgesehen.
- Eine laufende Geschichte bleibt, wo sie war. Die Ansage verändert ihren Stand nicht.
- Die Ansage wird von einer **künstlichen Stimme** gesprochen. Beim ersten Mal wird sie erzeugt und danach aus dem Speicher abgespielt. Beim Start des Servers im Betrieb wird sie vorab erzeugt, damit sie auch bei einem Ausfall des Sprachdienstes noch hörbar bleibt.
- **Ohne eingerichtete Sprachausgabe** hört das Kind nur einen kurzen Zweiklang statt des Textes (Testbetrieb).
- **Fällt die Sprachausgabe aus, bevor die Ansage im Speicher liegt**, gibt der Server einen Fehler zurück. Der Pi wiederholt die Anfrage noch zweimal selbst. Gelingt es dann nicht, spielt das Gerät nichts ab und zeigt nur die Fehler-LED. Im Pi-Client ist keine gespeicherte Ansage hinterlegt.

## 5. Stufe 2: Einstufung durch Claude

Claude bekommt den erkannten Text und soll ihn einer Gruppe zuordnen: Frage, Geschichte, weiter, **Sicherheit** oder unklar. Als „Sicherheit“ beschreibt die Anweisung: *Hinweise auf akute Gefahr, Gewalt, Missbrauch, Selbstverletzung, Suizidgedanken, medizinischen Notfall, Feuer, verlaufen/allein in Gefahr.* Bei „Sicherheit“ kommt die feste Ansage aus Abschnitt 4.

Für „Gefühle, Sorgen ohne akute Gefahr“ soll Claude zuhören, das Gefühl benennen und zu einem vertrauten Erwachsenen ermutigen. Es soll nie behaupten, ein Mensch zu sein, und keine Geheimhaltung versprechen.

**Was nicht geprüft ist:** Ob Claude diese Einstufung bei echten Sätzen richtig trifft, ist **nicht belegt**. In diesem Repository gibt es kein Ergebnis eines Laufs mit einem echten Modell, die Tests benutzen Attrappen. Der geplante Modellvergleich (`npm run eval:llm`) prüft es derzeit auch nicht: Seine fünf Sicherheitsfälle fängt bereits Stufe 1 ab, bevor Claude gefragt wird.

Ein Geschichtenwunsch, der über die ältere Schnittstelle `/v1/turn` als Text mitgeschickt wird, geht nur durch Stufe 1, nicht durch die Einstufung von Claude. Die Geräte (Pi) benutzen diese Schnittstelle nicht.

## 6. Stufe 3: Was der Ausgabe-Check prüft

Er prüft nur Texte, die **Claude geschrieben** hat, vor dem Vorlesen. Feste Texte (Ansagen, Ersatztexte) prüft er nicht. Er arbeitet mit **Wortlisten** und versteht keinen Zusammenhang.

| Prüfung | Gilt für | Trifft zum Beispiel |
| --- | --- | --- |
| Internetadressen | alles | `https://…`, `http://…`, `www.…` **(Test: „Schau auf https://example.com“)** |
| Blut | alles | blut, blutet, bluten, blutig, verblutet **(Test: „Der Ritter blutete am Arm.“)** |
| Töten | alles | töte, tötet, getötet, ermordet, Mord, Mörder, umgebracht, erschlagen, erstochen, erhängt |
| Selbsttötung | alles | Selbstmord, Suizid, Selbstverletzung |
| Sexuelles | alles | sex, sexuell, nackt, porno |
| Tod | nur Geschichten | tot, Tod, stirbt, starb, gestorben, sterben **(Test: „Der Drache war tot.“)** |
| Fragen nach persönlichen Daten | nur Antworten | „wie heißt du“, „wo wohnst du“, „wie ist deine adresse“, „in welche schule gehst du“, „wie alt bist du“ **(Test: „Wie heißt du eigentlich?“)** |

Wird ein Text abgelehnt, spricht das Gerät einen **festen Ersatztext**: bei einer Frage eine allgemeine Antwort, bei einer Geschichte eine fest geschriebene Kunibert-Geschichte. Das Kind erfährt nicht, dass etwas abgelehnt wurde.

**In Antworten sind Todeswörter erlaubt**, in Geschichten nicht. So kann Claude auf die Frage eines Kindes zum Tod antworten, aber keine Geschichte über Sterben erzählen.

**Nicht geprüft** (ausprobiert, nicht in den Tests): „Der Ritter nahm ein Messer und stach zu.“ · „Der Soldat erschoss den Drachen.“ · „Er schlug dem Drachen auf den Kopf.“ · „Du darfst das niemandem erzählen, das ist unser Geheimnis.“ · „Du bist dumm.“ · „Nimm Tabletten, dann geht es dir besser.“ · „Sag mir deine Adresse“. Alle diese Texte kommen durch. Auch „Der Drache war nicht tot.“ wird abgelehnt (die Wortliste versteht keine Verneinung).

Zusätzlich enthält die Anweisung an Claude eigene Regeln (zum Beispiel „niemand stirbt“, „kein Blut“, „keine Geheimhaltung versprechen“). Ob Claude sie einhält, ist nicht geprüft; der Ausgabe-Check fängt davon nur die Wörter oben ab.

## 7. Bekannte Lücken und Schwächen

### 7.1 Absichtlich nicht erkannt (aus dem Programmtext)

„Ich habe mich verbrannt“ schlägt nicht an.

### 7.2 Nicht erkannt (ausprobiert, nicht in den Tests)

Diese Sätze lösen Stufe 1 **nicht** aus. Ob sie einen Notfall bedeuten, hängt vom Zusammenhang ab. Welche davon anschlagen sollen, ist Ihre Entscheidung.

| Art | Beispiele |
| --- | --- |
| Verletzung, Gift, Körper | „Ich habe mich an der Herdplatte verbrannt“ · „Mein Kopf blutet“ · „Ich bin hingefallen und mein Arm tut ganz doll weh“ · „Mir tut die Brust weh“ · „Mir ist so schwindelig“ · „Ich habe Beeren gegessen und mir ist schlecht“ · „Ich habe mir wehgetan“ |
| Gewalt und Angst zu Hause | „Papa schreit mich immer an“ · „Ich habe Angst vor meinem Papa“ · „Papa trinkt immer so viel“ |
| Gewalt durch andere Kinder, Mobbing | „Die anderen Kinder hauen mich“ · „Ich werde in der Schule gemobbt“ |
| Mögliche Übergriffe | „Das ist unser Geheimnis“ · „Er zeigt mir Sachen, die ich nicht sehen will“ · „Ich hab ihm gesagt, er soll aufhören, aber er hört nicht auf“ |
| Fremde und Anbahnung | „Ein Mann im Park hat mich angesprochen“ · „Ein Mann hat mir Süßigkeiten angeboten“ · „Jemand will Fotos von mir“ |
| Seelische Not | „Ich will nicht mehr“ · „ich hasse mein leben“ · „ich bin zu nichts nütze“ · „Ich will weglaufen“ · „Ich laufe von zu Hause weg“ |
| Tod und Trauer | „Opa ist gestorben“ · „Meine Katze ist gestorben“ · „Ich glaube Mama ist tot“ |
| Allein und in Gefahr | „Ich bin ganz allein zu Hause und habe Angst“ · „Ich bin allein im Park“ · „Ich habe den Herd angelassen“ · „Die Wohnung ist voller Wasser“ |
| Andere Sprache | „Help I am lost“ |

### 7.3 Fehlalarme (zu empfindlich)

Auch diese Sätze lösen die Ansage aus (ausprobiert, nicht in den Tests):

| Satz | Warum |
| --- | --- |
| „Mein Bruder haut mich“ | Streit unter Geschwistern gilt als „jemand schlägt mich“. |
| „Papa schlägt mich nicht“ | Verneinungen werden nicht verstanden. |
| „Ich blute am Knie“ | Jedes „ich blute“ zählt, auch eine Schürfwunde. |
| „Mama fasst mich an der Hand“ · „Papa fasst mich an der Schulter“ | Jedes „fasst mich an“ zählt, auch freundliches Anfassen. |
| „Es brennt eine Kerze“ | Jedes „es brennt“ zählt. |
| „Ich habe mich im Spiel verlaufen“ · „Wir spielen Verstecken und ich finde Mama nicht“ | Spiele werden nicht von Ernstfällen unterschieden. |
| „Der Drache sagt, es brennt“ | Auch Sätze über Spielfiguren mit „es brennt“ zählen. |

### 7.4 Ohne Claude: allgemeine Antworten auf Sätze, die Stufe 1 nicht erkennt

Ist Claude nicht eingerichtet oder fällt aus (oder lehnt der Ausgabe-Check den Text ab), antwortet das Gerät mit festen Texten nach Stichwörtern. Ausprobiert mit dem Code:

| Satz des Kindes | Antwort des Geräts |
| --- | --- |
| „Ich habe Angst vor meinem Papa“ | „Das ist eine spannende Frage zu «Ich habe Angst vor meinem Papa». Ritter Kunibert lernt auch jeden Tag etwas Neues …“ |
| „Ich laufe von zu Hause weg“ · „Opa ist gestorben“ · „Er zeigt mir Sachen, die ich nicht sehen will“ | dieselbe „spannende Frage“-Antwort |
| „Ich bin ganz allein zu Hause und habe Angst“ | Trostwort („Es ist ganz in Ordnung, manchmal traurig zu sein …“), weil das Wort „allein“ vorkommt |
| „Ich will nicht mehr weiter“ | Das Gerät **beginnt eine Geschichte**, weil das Wort „weiter“ vorkommt |

### 7.5 Weitere Grenzen

- **Die Weiche sieht nur den erkannten Text.** Wird ein Satz falsch erkannt (Kinderstimme, Dialekt, Rauschen), kann sie ihn nicht finden oder meldet etwas, das nicht gesagt wurde.
- **Nur Wortlaut, kein Sinn.** Umschreibungen, Kindersprache („Aua“) und Andeutungen, die keine Schablone treffen, bleiben unerkannt.
- **Kein Gedächtnis.** Ein Hinweis, der über mehrere Sätze verteilt ist, wird nicht zusammengesetzt.
- **Keine Eskalation.** Es gibt keine Meldung an Eltern oder Stellen, keinen Anruf und keine Sperre danach (Abschnitt 4).
- Die Altersgruppe ist vorläufig auf „sechs bis zehn“ eingestellt (`KUNIBERT_AGE`).

## 8. Fragen an Sie

**Zur Ansage**

1. Ist der Text der Ansage für Kinder von sechs bis zehn Jahren angemessen (Wortwahl, Länge, Ton)?
2. Darf **derselbe Text für alle Lagen** gelten? Oder braucht es eigene Texte, zum Beispiel für Feuer („Geh raus und ruf 112“), für Suizidgedanken, für Verlaufen?
3. „Sag es einem Erwachsenen, dem du vertraust“: Passt das, wenn die Gefahr **von einem Erwachsenen im Haushalt** ausgeht? Was sollte das Gerät dann sagen?
4. Stimmen Nummern und Zeiten für die Zielgruppe („Eins Eins Zwei“; „Nummer gegen Kummer“, „Montag bis Samstag am Nachmittag“)? Fehlt ein Angebot für Eltern oder ein Hinweis für Kinder, die abends Hilfe brauchen?

**Zu den Grenzen der Mustersuche**

5. Welche Sätze aus Abschnitt 7.2 **müssen** anschlagen? Wie gehen wir mit Grenzfällen um: „Ich habe mich verbrannt“, Bauchweh, „Ich will nicht mehr“, Trauer um ein Haustier oder Großeltern, Streit der Eltern, Mobbing?
6. „ich will nicht sterben“ schlägt absichtlich nicht an. Ist das richtig, oder verbirgt sich dahinter manchmal Angst, die Aufmerksamkeit braucht?
7. Wie viel **Fehlalarm** ist vertretbar (Abschnitt 7.3)? Soll „Mein Bruder haut mich“ weiter die Ansage auslösen?
8. Welche Sätze aus Ihrer Praxis fehlen ganz (Kindersprache, Umschreibungen, Andeutungen)? Wir nehmen jeden Satz gern als Test auf. Neue Muster nehmen wir nur zusammen mit je einem erkannten und einem nicht erkannten Beispielsatz auf.

**Zum Ablauf nach einem Treffer**

9. Reicht es, dass das Gerät **nach der Ansage nichts weiter tut**? Soll es zum Beispiel für den Rest des Abends keine Geschichte mehr erzählen oder sich anders verhalten?
10. Ist es richtig, dass **nichts gemeldet und nichts gespeichert** wird? Das schützt die Daten des Kindes, bedeutet aber auch: Niemand erfährt davon. Welche Abwägung halten Sie für richtig?
11. Muss das Gerät auch dann etwas **hören lassen**, wenn die Sprachausgabe ausfällt (zum Beispiel eine auf dem Gerät gespeicherte Ansage)? Heute fehlt sie (Abschnitt 4).

**Zu Claude und zum Ausgabe-Check**

12. Wie wollen Sie die Einstufung durch Claude prüfen? Wir können Ihre Sätze durch den Modellvergleich laufen lassen und die Ergebnisse blind bewerten lassen.
13. Fehlen Wörter oder Themen im Ausgabe-Check (Abschnitt 6), etwa Waffen, Messer, Schießen, Beleidigungen, Geheimnisse?
14. Soll in Antworten auf Kinderfragen zum Tod der Ausgabe-Check Todeswörter weiter zulassen? Welche Haltung zur Trauer erwarten Sie vom Gerät?

**Zum Verfahren**

15. Was brauchen Sie als Nachweis für die Freigabe? Wie sollen künftige Änderungen an den Mustern geprüft werden?
16. Ist die vorläufige Altersgruppe „sechs bis zehn“ aus Ihrer Sicht richtig?

## Anhang: Wo steht was im Code?

| Thema | Datei |
| --- | --- |
| Schablonen der Stufe 1 | `server-api/safety.ts` (`PATTERNS`, `PATTERNS_EXTRA`) |
| Feste Ansagen (Hilfe-Ansage, „nicht verstanden“, Fehlerhinweis) | `server-api/safety.ts` |
| Wortlisten des Ausgabe-Checks | `server-api/safety.ts` (`screenOutput`) |
| Ablauf der Stufen, Ersatztexte | `server-api/brain.ts` |
| Anweisung an Claude (Einstufung, Regeln) | `server-api/prompts.ts` |
| Beispielsätze, die anschlagen müssen / nicht dürfen | `server-api/safety.test.ts` |
| Ablauf-Tests (Stufe 1 vor Claude, Ausgabe-Check, Ersatztexte) | `server-api/brain.test.ts` |
