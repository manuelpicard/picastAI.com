# Lieferbarkeit und Preise der Hardware

**Zuletzt geprüft: 22.11.2026** (Abrufe zwischen 19:01 und 19:26 Uhr, nach den Zeitstempeln der Abruf-Läufe) · Punkt H1 der Arbeitsliste · Wochen-Autopilot, Rolle Recherche. Der Autopilot prüft neu, sobald dieser Stand älter als 3 Tage ist (also ab 25.11.2026).

Es wurde nichts bestellt, nichts angefragt, kein Konto angelegt und kein Formular benutzt. Preise und Bestand ändern sich. Die Angaben gelten nur für den Abruf. Preise sind Endpreise mit MwSt. (brutto), wenn nichts anderes dabeisteht. Ausnahmen: Farnell nennt nur netto; bei buyzero nennt die Seite die MwSt. nicht; bei Botland stammt der Preis nur aus den Meta-Angaben, ob er die MwSt. enthält, ist offen. Der Versand kommt meist dazu.

„Einschätzung“ heißt: meine Bewertung, kein Satz aus einer Quelle. „Eigene Rechnung“ heißt: aus den Preisen der Seiten errechnet, so steht es auf keiner Seite. Die Quellen Q1 bis Q24 stehen vor „Nicht geprüft“, mit Abrufdatum und einem kurzen Zitat. Im Text stehen keine Zitate, nur dort.

## Kurzfassung

**Raspberry Pi 5**

- **8 GB: lieferbar.** Die Seiten zeigen den Artikel als lieferbar bei BerryBase (189,00 €, höchstens 2 Stück je Bestellung), Welectron (189,00 €, Versand in Deutschland frei) und Farnell (155,11 € netto, eigene Rechnung: etwa 184,58 € brutto).
- Bei buyzero (191,90 €) steht nur eine Lieferzeit von 1 bis 2 Tagen, kein Bestandstext: unklar. Bei Pollin (198,95 €) ist der Status ebenfalls unklar.
- **4 GB: bei keinem Händler sicher zu haben.** Ausdrücklich nicht lieferbar: BerryBase (123,90 €), Welectron (118,00 €), Pollin (179,90 €). buyzero (118,89 €) nennt keinen Status. Bei Farnell wurde der 4-GB-Pi nicht gesucht.
- Der Mehrpreis für 8 GB liegt (eigene Rechnung) bei etwa 65 bis 73 € (BerryBase, Welectron, buyzero).

**ESP32-S3-BOX-3**

- **Lieferbar nur bei Völkner** (60,99 €, Lieferzeit 1 bis 2 Tage) und bei Schukat (nur für Gewerbe, siehe unten).
- BerryBase: BOX-3 (69,90 €) und BOX-3B (59,90 €) nicht lieferbar.
- Schukat hat 96 Stück, liefert laut Seite aber nicht an Privatkunden.
- Botland (Polen): Status unklar, 87,90 € (nur aus den Meta-Angaben der Seite).

**Alternativen mit Mikrofon und Lautsprecher**

- **M5Stack Atom EchoS3R: lieferbar** (BerryBase, 17,90 €). Die Seite nennt ein Mikrofon. Display und Tasten nennt sie nicht. Ob der Lautsprecher fest eingebaut ist, steht nicht dort.
- **M5Stack CoreS3** (BerryBase 64,90 €: nicht lieferbar; Botland 66,90 €: unklar): zwei Mikrofone, Lautsprecher eingebaut, Touchscreen.
- **M5Stack CoreS3 SE** (Botland 41,90 €, nur Meta: unklar): ein Mikrofon, Lautsprecher eingebaut, Touchscreen.
- **Waveshare ESP32-S3-AUDIO-Board** (BerryBase 23,90 €: nicht lieferbar; Eckstein 20,76 € und 22,63 €: unklar): zwei Mikrofone, aber nur ein Anschluss für einen Lautsprecher, keiner im Lieferumfang genannt.

**Lücken und Vorbehalte**

- Lieferbar mit BOX-3 sind in dieser Prüfung nur Völkner und Schukat. Schukat verkauft nur an Gewerbe. Ob Völkner an Privatkunden liefert, ist nicht geprüft; die Seite sagt nichts Gegenteiliges.
- Den Firmensitz habe ich bei Völkner, Welectron, Pollin und BerryBase nicht geprüft.
- Die Seiten widersprechen sich zum Teil (Abschnitt „Widersprüche“), und keine nennt einen Stand mit Datum. Vor jedem Kauf im Browser prüfen.

**Einschätzung:** Wer jetzt einen Pi braucht, findet von 4 und 8 GB nur sichere 8-GB-Angebote. Bei buyzero ist der Status von 4 GB unklar. Pi 5 mit 1, 2 und 16 GB wurde nicht gesucht. Der erste Aufbau in `pi-client/README.md` ist mit 4 GB beschrieben.

## So wurde gelesen

- Die Händlerseiten hat jeweils ein Abruf-Agent (Unteragent mit Webzugriff) geladen und wörtlich berichtet. Ich habe die Rohseiten nicht selbst gesehen, nur diese Berichte. Preise, Status und Zahlen stehen so in den Berichten.
- **Einordnung** (lieferbar, nicht lieferbar, unklar) ist meine Zuordnung nach dem Seitentext. Wo die Seite keinen Status nennt oder sich widerspricht, steht „unklar“.
- **Meta** heißt: Der Wert stand nur in den Meta-Angaben der Seite, nicht im sichtbaren Text.
- **Produktblock** heißt: Nur der Anfang der Seite lag wörtlich vor, mit Name, Preis und Status. Steht „x von y Zeichen“ dabei, waren es die ersten x Zeichen. Der Rest kam als automatische Zusammenfassung. Eine solche Zusammenfassung hat sich bei Welectron nachweislich geirrt (sie meldete, das Produkt sei nicht gelistet, der wörtliche Block zeigte es). Deshalb gelten hier nur wörtlich gelesene Teile. Die Spalte „Gelesen“ bei den Quellen sagt, wie viel wörtlich vorlag.
- Bei mehreren Angaben zum selben Artikel zählt die eigene Produktseite des Händlers. Empfehlungsleisten auf anderen Seiten stehen nur bei den Widersprüchen.
- **Kurz erklärt** (allgemeines Wissen, nicht aus den Quellen): Ein Codec ist ein Chip, der Ton zwischen analog und digital wandelt. I2S ist eine Schnittstelle für digitalen Ton. Flash ist der Speicher für das Programm, PSRAM zusätzlicher Arbeitsspeicher. Ein MEMS-Mikrofon ist ein winziges Chip-Mikrofon. Eine Staffel ist ein Mengenrabatt. Netto heißt ohne MwSt. KW 01/2027 ist die erste Kalenderwoche 2027. Ω (Ohm) und W (Watt) beschreiben Widerstand und Leistung eines Lautsprechers.

## Raspberry Pi 5

| Händler | Modell | Preis | Einordnung | Hinweise | Quelle |
| --- | --- | --- | --- | --- | --- |
| BerryBase | 4 GB | 123,90 € | nicht lieferbar | Art.-Nr. RPI5-4GB; Benachrichtigungsformular vorhanden (nicht benutzt) | Q1, Q3 |
| BerryBase | 8 GB | 189,00 € | lieferbar | 1 bis 3 Tage; höchstens 2 Stück je Bestellung; Art.-Nr. RPI5-8GB | Q2, Q3 |
| Welectron | 4 GB | 118,00 € | nicht lieferbar | zwei Seiten für dasselbe Produkt; beide führen das Board als nicht auf Lager; eine nennt zusätzlich, der Artikel sei bald wieder auf Lager (ohne Termin) | Q4, Q5 |
| Welectron | 8 GB | 189,00 € | lieferbar | 1 bis 3 Werktage; Versand in Deutschland frei; Art.-Nr. RP1-151800; eine zweite 8-GB-Seite wurde nicht gelesen | Q6 |
| buyzero | 4 GB | 118,89 € | unklar | als Variante wählbar, kein Statustext; MwSt. nicht genannt | Q7 |
| buyzero | 8 GB | 191,90 € | unklar | Lieferzeit 1 bis 2 Tage ohne Bezug zu einer Variante, kein Bestandstext; MwSt. nicht genannt; Versand wird an der Kasse berechnet; Händler pi3g GmbH & Co. KG, Leipzig | Q7 |
| Pollin | 4 GB | 179,90 € | nicht lieferbar | Benachrichtigung bei Lieferbarkeit angeboten (nicht benutzt) | Q8 |
| Pollin | 8 GB | 198,95 € | unklar | Die Seite sagt, die Stückzahl sei derzeit nicht ausreichend, und zeigt zugleich 1 bis 3 Werktage Lieferzeit | Q9 |
| Farnell | 8 GB | 155,11 € netto (eigene Rechnung: 184,58 € brutto) | lieferbar | 16.814 Stück auf Lager; Express am nächsten Arbeitstag (die Seite nennt 13 Uhr und 17:00 Uhr, der Zusammenhang ist unklar); Standardlieferzeit des Herstellers 13 Wochen; Bestell-Nr. 4256000; Bruttopreis steht nicht auf der Seite | Q10 |

Preisunterschied 8 GB zu 4 GB (eigene Rechnung, nur zum Vergleich, weil 4 GB nirgends sicher lieferbar ist): BerryBase 65,10 €, Welectron 71,00 €, buyzero 73,01 €, Pollin 19,05 €.

## ESP32-S3-BOX-3

| Händler | Modell | Preis | Einordnung | Hinweise | Quelle |
| --- | --- | --- | --- | --- | --- |
| BerryBase | BOX-3 | 69,90 € | nicht lieferbar | Art.-Nr. ADA5835; zwei digitale Mikrofone, 2,4-Zoll-Touchscreen, 16 MB Flash, 16 MB PSRAM; Lautsprecher auf der Seite nicht genannt; Lieferumfang nennt nur das Kit | Q11, Q13 |
| BerryBase | BOX-3B | 59,90 € | nicht lieferbar | Lieferumfang mit DOCK, USB-C-Kabel und RGB-LED-Modul; Lautsprecher 8 Ω / 1 W; Tasten Reset, Boot, Mute; die Seite erklärt den Unterschied zum BOX-3 nicht | Q12, Q13 |
| Völkner | BOX-3 | 60,99 € | lieferbar | Lieferzeit 1 bis 2 Tage; Staffel ab 3 Stück (60,38 €); Versand extra, Betrag nicht genannt; Art.-Nr. W322333; Lieferumfang mit Dock, Sensor, Halterung, Bread, RGB-LED-Modul, USB-C-Kabel; Verkäufer ist der Shop selbst; die Seite zeigt ein zweites Neu-Angebot, Anbieter nicht genannt | Q14 |
| Schukat | BOX-3 | netto, Betrag steht nicht im Text | lieferbar, aber nur für Gewerbekunden | 96 Stück auf Lager; nächster Eingang KW 01/2027 (240 Stück); die Seite sagt, sie liefere nicht an private Endverbraucher; Sitz Monheim am Rhein | Q15 |
| Botland (Polen) | BOX-3 | 87,90 € (Meta) | unklar | nennt Lagerbestand und zugleich eine Lieferung auf dem Weg ins Lager, ohne Zahlen; Versand ab 4,69 €, frei ab 100 € | Q16 |
| Mouser (Werbeseite) | BOX-3 | – | – | kein Preis, kein Bestand; Seite zuletzt geändert am 5.6.2025 | Q17 |

## Alternativen mit Mikrofon und Lautsprecher

Ausgewählt wurden Boards mit ESP32-S3 (wie die Firmware), mit Mikrofon und Lautsprecher oder Lautsprecheranschluss, die in einem deutschsprachigen Shop angeboten werden. Die Ausstattung steht so auf den Händlerseiten. Datenblätter der Hersteller wurden nicht gelesen.

| Kandidat | Händler, Preis | Einordnung | Ausstattung laut Seite | Quelle |
| --- | --- | --- | --- | --- |
| M5Stack Atom EchoS3R | BerryBase 17,90 € | lieferbar (53 Stück, 1 bis 3 Tage) | 1 MEMS-Mikrofon mit Codec ES8311; Verstärker NS4150B und Lautsprecher 8 Ω / 1 W (ob fest eingebaut, steht nicht dort); Display und Tasten nicht genannt; 8 MB Flash, 8 MB PSRAM; 5 V DC; Infrarot-Sender; 24 × 24 × 16,8 mm | Q18 |
| M5Stack CoreS3 | BerryBase 64,90 €; Botland 66,90 € (Meta) | BerryBase nicht lieferbar; Botland unklar | 2 Mikrofone (ES7210); Lautsprecher 1 W eingebaut (AW88298); 2-Zoll-Touchscreen 320 × 240; Tasten: Power und Reset; 16 MB Flash, 8 MB PSRAM; laut BerryBase Akku 500 mAh; Kamera und Sensoren | Q19, Q20 |
| M5Stack CoreS3 SE | Botland 41,90 € (Meta) | unklar | 1 Mikrofon (ES7210); Lautsprecher 1 W eingebaut; 2-Zoll-Touchscreen; kein Akku im Set; Kamera und Sensoren fehlen gegenüber dem CoreS3 | Q21 |
| Waveshare ESP32-S3-AUDIO-Board | BerryBase 23,90 €; Eckstein 22,63 € (Art. 32184) und 20,76 € (Art. 32185) | BerryBase nicht lieferbar; Eckstein unklar | 2 Mikrofone (ES7210, ES8311 genannt); nur Anschluss für einen Lautsprecher, keiner im Lieferumfang genannt; Display nicht im Lieferumfang genannt (nur Anschluss); programmierbare Tasten ohne Zahl; 7 RGB-LEDs; 16 MB Flash, 8 MB PSRAM; Akku bei BerryBase im Lieferumfang, bei Eckstein als optional genannt | Q22, Q23, Q24 |

**Einschätzung zu den Alternativen:**

- **Firmware.** Der Entwurf in `firmware/esp32-s3/` ist für Variante B geschrieben: einfaches I2S-Mikrofon und I2S-Verstärker (`firmware/esp32-s3/README.md`). Ein Board mit Codec-Chips braucht laut `firmware/esp32-s3/main/kb_audio.c` eine eigene Fassung dieser Datei. Für das BOX-3 nennt die README zusätzlich `main/kb_board.c`. Nach den Händlerseiten haben alle genannten Boards einen Codec-Chip (ES8311 oder ES7210). Keines passt also ohne Arbeit an der Firmware. Die Firmware ist auf keinem Gerät gelaufen.
- **Tasten und LED.** Kunibert braucht zwei Bedientasten (Sprechtaste, Erzähltaste, `CLAUDE.md`) und eine LED (`firmware/esp32-s3/README.md`). Beim EchoS3R und beim Waveshare-Board nennen die Seiten keine Zahl von Tasten. Beim CoreS3 stehen Power und Reset, kein Bedienknopf. Ob zwei Taster angeschlossen werden können, ist nicht geprüft.
- **Verfügbarkeit.** Nur der EchoS3R war lieferbar. Er ist der billigste Kandidat (17,90 €). Die Seite nennt ein Mikrofon und weder Display noch Tasten. Der Aufbau in `firmware/esp32-s3/README.md` hat kein Display.

## Vergleich mit früheren Prüfungen (8. bis 13.11.2026)

Diese Werte stammen aus Notizen früherer Läufe im Claude-Projekt (nicht im Repo): `claude/stand-2026-11-07-anfragen-und-hosting.md` (8. und 11.11.), `claude/stand-2026-11-11-nachtschicht.md` (11.11., 21:54) und `claude/nachtrag-2026-11-13-restlimit-nacht.md` (13.11., gegen 17:04). Sie wurden hier nicht neu belegt. Die Tabelle zeigt nur BerryBase, weil nur dort Werte an mehreren Tagen vorliegen.

| Artikel | 8.11. | 11.11. | 13.11. | 22.11. (diese Prüfung) |
| --- | --- | --- | --- | --- |
| Pi 5, 4 GB (123,90 €) | nicht lieferbar | nicht lieferbar | nicht lieferbar | nicht lieferbar |
| Pi 5, 8 GB (189,00 €) | lieferbar, 1 bis 3 Tage | lieferbar | lieferbar, höchstens 2 je Bestellung | lieferbar, höchstens 2 je Bestellung |
| ESP32-S3-BOX-3 (69,90 €) | keine Angabe in den Notizen | nicht lieferbar | nicht lieferbar (nur aus der Suchliste gelesen) | nicht lieferbar |

- Der 4-GB-Pi war bei BerryBase an allen vier Stichtagen (8., 11., 13. und 22.11.2026) nicht lieferbar. Der Preis blieb gleich. Ob er dazwischen lieferbar war, ist hier nicht belegt.
- Am 8.11. standen außerdem Rasppishop (4 GB, 123,90 €, ausverkauft, höchstens 1 Stück je Bestellung) und Soldered (4 GB, 108,95 €, die Seite widersprach sich) in den Notizen. Heute wurden beide nicht gelesen (Rasppishop ließ sich nicht laden). Geizhals und Galaxus (8.11.) ebenfalls nicht.
- Der Betreiber hatte am 9.11.2026 entschieden zu warten, bis der Pi 5 bei BerryBase wieder erhältlich wird. Der 8-GB-Pi war damals schon lieferbar (Notizen im Claude-Projekt).

## Widersprüche auf den Seiten

1. **BerryBase, Pi 5 mit 4 GB.** Die eigene Produktseite und die Kategorieliste nennen den Artikel nicht lieferbar (Q1, Q3). Ein FAQ-Satz auf derselben Seite sagt aber, die Modelle mit 2, 4 und 8 GB seien derzeit lieferbar. Auf der Seite des BOX-3B zeigt eine Empfehlungsleiste den 4-GB-Pi für 118,50 € als lieferbar (mit der Angabe 100+ Stück), die eigene Seite nennt 123,90 €. Einschätzung: Produktseite und Liste stimmen überein und sprechen für nicht lieferbar. Welcher Stand der neueste ist, ist aus den Seiten nicht erkennbar.
2. **BerryBase, BOX-3.** Eigene Seite und Liste: nicht lieferbar (Q11, Q13). Die Seite des BOX-3B zeigt das BOX-3 in der Leiste mit ähnlichen Produkten als lieferbar (4 Stück). Einschätzung wie bei 1.
3. **Welectron, Pi 5 mit 4 GB.** Zwei Seiten für dasselbe Produkt, mit verschiedenen Artikelnummern (RP1-151400-P und RP1-151400). Beide führen das Board als nicht auf Lager. Eine sagt in der Statuszeile, der Artikel sei bald wieder auf Lager, und zeigt einen Knopf zum Konfigurieren und Kaufen, ohne Termin.
4. **Pollin, Pi 5 mit 8 GB.** Die Seite sagt, die Stückzahl sei derzeit nicht ausreichend, und zeigt zugleich 1 bis 3 Werktage Lieferzeit und einen Knopf für den Warenkorb. Sie bietet an, die fehlende Stückzahl unter Umständen zu beschaffen, auf Anfrage per E-Mail (nicht genutzt).
5. **Farnell, Pi 5 mit 8 GB.** 16.814 Stück auf Lager, aber die Tabelle nennt eine Standardlieferzeit des Herstellers von 13 Wochen. Die Seite erklärt es nicht. Einschätzung: Das können zwei verschiedene Dinge sein (Lager des Händlers, Lieferzeit ab Werk).
6. **buyzero.** Der Preis neben dem Warenkorb-Knopf zeigt 49,89 € (die 1-GB-Variante), obwohl 8 GB zu 191,90 € vorgewählt sind. Der Beschreibungstext spricht nur von 4-GB- und 8-GB-Modellen zum Start; die Auswahl bietet auch 1 GB. Einschätzung: Der Text wirkt veraltet.
7. **Waveshare-Board.** BerryBase nennt einen Akku im Lieferumfang, Eckstein nennt ihn optional. Eckstein führt zwei Artikel (32184 und 32185) mit verschiedenen Preisen, EAN und Zolltarifnummern. Ein Unterschied in der Hardware ist aus den Seiten nicht erkennbar. Beide Eckstein-Seiten zeigen einen Hinweis, der Artikel sei im Lieferland nicht verfügbar; welches Land eingestellt war, ist nicht erkennbar.
8. **Botland.** Die Preisfelder im sichtbaren Text sind leer (Preis nur in den Meta-Angaben), und der Status nennt Bestand und Lieferung unterwegs ohne Zahlen.

## Hinweise der Händler zur Sicherheit (für die Rechtsprüfung)

Keine Rechtsberatung. Es sind nur Aussagen von Händlerseiten, keine Bewertung.

- BerryBase (BOX-3, BOX-3B, CoreS3, Atom EchoS3R, Waveshare-Board): für Kinder unerreichbar aufbewahren oder Kleinteile von Kindern fernhalten. Bei den Pi-Seiten: den Pi nicht unbeaufsichtigt lassen, wenn Kinder Zugriff haben.
- buyzero (Pi 5): Die Sicherheitsangaben nennen eine Eignung erst ab 10 Jahren.
- Botland: Die Seiten von BOX-3, CoreS3 und CoreS3 SE stufen das Produkt als Komponente ein, nicht als Fertigprodukt im Sinne der Produktsicherheitsvorschriften. Das Rückgaberecht gilt laut den Seiten von CoreS3 und CoreS3 SE nur für Verbraucher.
- Einschätzung: Die Händler führen die Boards als Entwicklerboards, Kits oder Bauteile. Kunibert richtet sich an Kinder von 6 bis 10 Jahren. Für ein verkauftes Kinder-Spielzeug sind Gehäuse, Prüfungen und Kennzeichnung Sache des Produkts selbst. Das gehört zu Punkt H2 der Arbeitsliste (Vorgaben für ein Serienprodukt). Bis zur Rechtsprüfung testen nur Erwachsene.

## Einschätzung

1. **Pi 5.** Von 4 und 8 GB ist heute nur der 8-GB-Pi sicher zu bekommen. Das Gerät nimmt nach `CLAUDE.md` nur auf und spielt ab; der erste Aufbau in `pi-client/README.md` ist mit 4 GB beschrieben. Ob 4 GB reichen, ist nicht gemessen. Der 8-GB-Pi würde dieselbe Rolle spielen und kostet etwa 65 bis 73 € mehr als der nirgends sicher lieferbare 4-GB-Pi (eigene Rechnung, BerryBase, Welectron und buyzero; bei Pollin 19,05 €). Der Betreiber hatte am 9.11.2026 entschieden zu warten, bis der Pi 5 bei BerryBase wieder erhältlich wird. Ob er dabei bleibt oder 8 GB nimmt, entscheidet der Betreiber. Jeder einzelne Kauf braucht seine Bestätigung im Chat.
2. **Händler für den 8-GB-Pi.** BerryBase und Welectron verlangen beide 189,00 €. Welectron nennt freien Versand in Deutschland. Ab welchem Betrag BerryBase frei versendet, ist offen: Die Abrufberichte nannten 200 € und an einer Stelle 150 €, keine der Quellen Q1 bis Q3 belegt es. Farnell zeigt nur den Nettopreis (155,11 €, brutto etwa 184,58 €, eigene Rechnung). Ob Farnell an Privatkunden liefert und was der Versand kostet, steht auf der gelesenen Seite nicht.
3. **BOX-3.** Völkner ist das einzige lieferbare Angebot ohne den Hinweis, dass nur an Gewerbe geliefert wird (60,99 €). Ob Völkner an Privatkunden liefert, ist nicht geprüft. BerryBase hat BOX-3 und BOX-3B nicht lieferbar. Schukat verkauft nur an Gewerbe.
4. **Alternativen.** Nur der EchoS3R ist lieferbar. Ob er für Sprechtaste, Erzähltaste und LED taugt, ist nicht geprüft. CoreS3, CoreS3 SE und Waveshare-Board sind nirgends sicher lieferbar; CoreS3 und Waveshare-Board haben laut den Seiten zwei Mikrofone.
5. **Wie sicher sind die Zahlen?** Sie sind nur so gut wie die Seiten. Die Seiten widersprechen sich zum Teil, nennen kein Datum und zeigen den Bestand oft nur in Worten. Darum wurde jede Aussage nur aus der eigenen Produktseite des Händlers genommen. Vor einem Kauf im Browser prüfen.

## Quellen

Alle Seiten abgerufen am 22.11.2026 (zwischen 19:01 und 19:26 Uhr). Ein Zitat je Quelle, höchstens 15 Wörter. „ganz“ heißt: Die Seite lag nach dem Bericht wörtlich komplett vor. „Produktblock“ heißt: Nur der Anfang der Seite lag wörtlich vor (bei „x von y Zeichen“ die ersten x Zeichen), mit Name, Preis und Status. Verwendet wurde nur dieser Anfang; der Rest kam als Zusammenfassung.

| Nr. | Quelle | Gelesen | Zitat |
| --- | --- | --- | --- |
| Q1 | BerryBase, Pi 5 4 GB, https://www.berrybase.de/en/raspberry-pi-5-4gb-ram | ganz | „Currently not available“ |
| Q2 | BerryBase, Pi 5 8 GB, https://www.berrybase.de/en/raspberry-pi-5-8gb-ram | ganz | „Available · 100+ piece · 1-3 days“ |
| Q3 | BerryBase, Liste „Boards“, https://www.berrybase.de/en/raspberry-pi/raspberry-pi-computer/boards/ | ganz (18 Treffer) | „Showing 18 results“ |
| Q4 | Welectron, Pi 5 4 GB (Seite „RAM_1“), https://www.welectron.com/Raspberry-Pi-5-4-GB-RAM_1 | Produktblock | „Out of stock“ |
| Q5 | Welectron, Pi 5 4 GB (Seite „4-GB_1“), https://www.welectron.com/Raspberry-Pi-5-4-GB_1 | Produktblock | „soon in stock“ |
| Q6 | Welectron, Pi 5 8 GB, https://www.welectron.com/Raspberry-Pi-5-8-GB_1 | Produktblock | „On stock“ |
| Q7 | buyzero (pi3g), Pi 5, https://buyzero.de/en/products/raspberry-pi-5 | ganz | „Delivery time: 1-2 days“ |
| Q8 | Pollin, Pi 5 4 GB, https://www.pollin.de/p/raspberry-pi-5-4-gb-811643 | Produktblock (79.882 von 97.084 Zeichen) | „aktuell nicht lieferbar“ |
| Q9 | Pollin, Pi 5 8 GB, https://www.pollin.de/p/raspberry-pi-5-8-gb-811644 | Produktblock (79.882 von 104.307 Zeichen) | „Der Artikel ist aktuell nicht in ausreichender Stückzahl verfügbar“ |
| Q10 | Farnell Deutschland, RPI5-8GB-SINGLE, https://de.farnell.com/raspberry-pi/rpi5-8gb-single/raspberry-pi-5-model-b-8gb-2-4ghz/dp/4256000 | ganz | „16.814 auf Lager“ |
| Q11 | BerryBase, ESP32-S3-BOX-3, https://www.berrybase.de/en/espressif-esp32-s3-box-3-open-source-aiot-development-kit-wifi-bluetooth-5-le-usb-c | ganz (zwei Abrufe) | „Currently not available“ |
| Q12 | BerryBase, ESP32-S3-BOX-3B, https://www.berrybase.de/en/espressif-esp32-s3-box-3b-aiot-kit-open-source-dual-core-240mhz-wi-fi-bt5-320x240-touch-lcd | ganz (zwei Abrufe) | „Currently not available“ |
| Q13 | BerryBase, Liste „Espressif“, https://www.berrybase.de/en/espressif/ | ganz (13 Treffer) | „Showing 13 results“ |
| Q14 | Völkner, BOX-3, https://www.voelkner.de/products/12746585/Espressif-ESP32-S3-BOX-3-Entwicklungsboard.html | ganz | „auf Lager“ |
| Q15 | Schukat, BOX-3, https://shop.schukat.com/Espressif-Systems/ESP32-S3-BOX-3/p/91064 | ganz (Preisfelder leer) | „Bitte beachten Sie, dass wir nicht an private Endverbraucher liefern.“ |
| Q16 | Botland, BOX-3, https://botland.de/esp32-module-mit-display/24078-esp32-s3-box-3-esp32-aiot-entwicklungskit-espressif-systems.html | ganz (Preis nur in den Meta-Angaben) | „reservieren Sie ein Stück aus dieser Lieferung“ |
| Q17 | Mouser Deutschland, Werbeseite BOX-3, https://www.mouser.de/en/new/espressif/espressif-esp32-s3-box-3-kit/ | ganz (kein Preis, kein Bestand) | „Updated: 2025-06-05“ |
| Q18 | BerryBase, M5Stack Atom EchoS3R, https://www.berrybase.de/en/m5stack-atom-echos3r-smart-speaker-dev-kit-esp32-s3-wi-fi-8mb-flash-psram-i2s-mems-ir-5v | Produktblock (39.875 von 74.286 Zeichen) | „Available · 53 piece · 1-3 days“ |
| Q19 | BerryBase, M5Stack CoreS3, https://www.berrybase.de/en/m5stack-cores3-esp32s3-lot-dev-kit | Produktblock (39.929 von 71.232 Zeichen) | „Currently not available“ |
| Q20 | Botland, M5Stack CoreS3, https://botland.de/core-serie/23180-m5stack-cores3-esp32s3-iot-entwicklungskit-m5stack-k128-6972934174284.html | ganz (Preis nur in den Meta-Angaben) | „Zu unserem Lager unterwegs: dieses Produkts.“ |
| Q21 | Botland, M5Stack CoreS3 SE, https://botland.de/core-serie/25332-m5stack-cores3-se-entwicklungsmodul-esp32-s3-m5stack-k128-se-6972934175304.html | ganz (Preis nur in den Meta-Angaben) | „enthält keinen Akku“ |
| Q22 | BerryBase, Waveshare ESP32-S3 AI Smart Speaker Development Board, https://www.berrybase.de/en/waveshare-esp32-s3-ai-smart-speaker-development-board-dual-mikrofon-wifi-bt5-16mb-flash-240-mhz | ganz | „Currently not available“ |
| Q23 | Eckstein, Waveshare ESP32-S3-AUDIO-Board, Art. 32184, https://eckstein-shop.de/waveshare-esp32-s3-audio-board-ki-lautsprecher-32184 | ganz | „Dieser Artikel ist in ihrem Lieferland nicht verfügbar.“ |
| Q24 | Eckstein, Waveshare ESP32-S3-AUDIO-Board, Art. 32185, https://eckstein-shop.de/waveshare-esp32-s3-audio-board-ai-smart-speaker-32185 | ganz | „This item is not available in your delivery country.“ |

## Nicht geprüft

- **Nicht ladbar** (das Abrufwerkzeug meldete einen Fehler; es wurde kein Umweg versucht). Über diese Händler ist hier nichts bekannt. Daraus darf man nicht schließen, dass sie das Produkt nicht führen:
  - Elektor, Pi 5 mit 4 GB (`https://beta.elektor.de/products/raspberry-pi-5-4-gb-ram`, Fehler `ROBOTS_UNREACHABLE`) und BOX-3 (`https://www.elektor.de/en/products/esp32-s3-box-3`, Fehler `client_error`).
  - Rasppishop (`https://www.rasppishop.de/Raspberry-Pi_5_alt_s2`, Fehler `client_error`).
  - Conrad: Pi 5 (`https://www.conrad.de/de/f/raspberry-pi-5-b-85671705.html`), BOX-3 (`https://www.conrad.com/en/p/espressif-esp32-s3-box-3-pcb-design-board-esp32-s3-3453355.html`) und Markenseite Espressif (`https://www.conrad.de/de/marken/espressif.html`), jeweils Fehler `client_error`.
  - Mouser.com, BOX-3 (Fehler `SERVER_ERROR`).
  - sha256systems, BOX-3 (`https://sha256systems.de/products/espressif-esp32-s3-box-3`, Fehler `ROBOTS_UNREACHABLE`).
- Pi 5 mit 1, 2 und 16 GB: bei keinem Händler gesucht. Bei Farnell auch 4 GB nicht.
- Die zweite Welectron-Seite für den 8-GB-Pi (`https://www.welectron.com/Raspberry-Pi-5-8-GB-RAM_1`): Der Abruf wurde nicht freigegeben.
- Nur als Zusammenfassung gelesen und deshalb nicht verwendet: die Pollin-Kategorieseite für Raspberry Pi (darin ein JOY-IT-Angebot mit 8 GB, Art unklar), die Höchstmenge von 50 Stück bei Welectron, der Rest der BerryBase-Seiten von CoreS3 und Atom EchoS3R (Empfehlungsleisten, Bewertungen) sowie der Rest der Seiten von Pollin und Welectron.
- Bei Q18 und Q19 (Produktblock) ist nicht festgehalten, ob Ausstattung und Sicherheitshinweise im wörtlichen Anfang standen. Nach „So wurde gelesen“ wurden nur wörtliche Teile verwendet; nachprüfen lässt es sich hier nicht.
- Die BerryBase-Liste der M5Stack-Boards wurde nur auf Seite 1 von 3 gelesen. Die Einzelseiten von CoreS3 und Atom EchoS3R wurden direkt gelesen.
- **Die Rohseiten habe ich nicht selbst gesehen.** Ob die Berichte der Abruf-Agenten sie richtig wiedergeben, wurde nicht unabhängig geprüft.
- Firmensitze: auf den Seiten gesehen bei buyzero (Leipzig), Farnell (Poing), Schukat (Monheim am Rhein), Eckstein (Clausthal-Zellerfeld) und Botland (Polen). Bei BerryBase, Welectron, Pollin und Völkner nicht geprüft.
- Ob Farnell, Völkner oder andere an Privatkunden liefern, Versandkosten (meist nicht genannt), Zoll bei Lieferung aus Polen oder den USA: nicht geprüft. Kein Warenkorb benutzt.
- Hersteller-Datenblätter und Herstellerseiten (Espressif, M5Stack, Waveshare, Raspberry Pi): nicht gelesen. Die Ausstattung steht nach den Händlerseiten.
- Ob eines der Boards zur Firmware passt: nichts getestet, nichts gebaut.
- Zubehör (Netzteil, Kühler, microSD-Karte, USB-Mikrofon, Lautsprecher): nicht neu geprüft. Die älteren Werte vom 7. bis 11.11.2026 stehen nur im Claude-Projekt.
- Rechtliches (Verbraucher oder Gewerbe, Rückgabe, Produktsicherheit): nicht geprüft, nur wiedergegeben.

## Nächste Schritte

| Wer | Was | Wo |
| --- | --- | --- |
| Betreiber | Vor jedem Kauf die Händlerseite öffnen und Preis, Bestand und Versandkosten prüfen (die Seiten nennen kein Datum). Jeden einzelnen Kauf im Chat bestätigen. | Browser, Chat |
| Betreiber | Entscheiden, ob er weiter wartet (Entscheidung vom 9.11.) oder den 8-GB-Pi nimmt, solange 4 GB nirgends sicher lieferbar ist. Optional vorher buyzero 4 GB im Browser ansehen (Status hier unklar). | Browser, Chat |
| Betreiber | Optional: Conrad, Elektor, Rasppishop, Mouser und sha256systems im Browser ansehen, weil sie sich hier nicht lesen ließen. | Browser |
| Claude (Lauf Recherche) | Diese Datei neu prüfen, sobald der Stand älter als 3 Tage ist (ab 25.11.2026): zuerst BerryBase 4 GB, BOX-3, EchoS3R, dann die übrigen Zeilen und die am 8.11. gesehenen Händler Soldered, Geizhals und Galaxus. | `docs/recherche/lieferbarkeit.md` |
| Claude (Lauf Recherche) | N1122-1941-a: Zubehör neu prüfen (Netzteil, Kühler, microSD, Mikrofon, Lautsprecher, Kleinteile). | `docs/recherche/lieferbarkeit.md` |
| Claude (Lauf Recherche) | N1122-1941-b: Hersteller-Datenblätter der Boards lesen (Pins für Tasten und LED, Codec-Treiber). | `docs/recherche/zielboard.md` |
| Betreiber | Danach entscheiden, welches Board die Firmware bekommt (BOX-3, Atom EchoS3R, CoreS3, CoreS3 SE, Waveshare-Board oder einzelne Bauteile). | Chat |
