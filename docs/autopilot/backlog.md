# Wochen-Autopilot: Arbeitsliste

Angelegt am 17.11.2026, 20:15, von Claude (Chat). Gepflegt von den Läufen des Wochen-Autopiloten (siehe [`README.md`](README.md)).

## Regeln für diese Liste

- Jeder Punkt hat eine feste ID. IDs werden nie neu vergeben. Neue Punkte bekommen die ID `N<MMTT>-<HHMM>` (Datum und Uhrzeit des Laufs, Europe/Berlin; bei mehreren Punkten `-a`, `-b` …) und kommen ans Ende der Datei.
- Reihenfolge der Arbeit: erst Prio (1 vor 2 vor 3 vor 4), dann die Reihenfolge in dieser Datei.
- Status ist genau eins von: `offen`, `erledigt (PR #n, TT.MM.JJJJ)`, `blockiert (Grund)`, `verworfen (Grund)`.
- Belegt ist ein Punkt, solange ein offener PR mit `[Autopilot <ID>]` im Titel existiert.
- „Nach X“ heißt: erst anfangen, wenn X erledigt ist.
- „(Kinder)“ heißt: ändert, was Kinder hören. Eigener PR mit „(ändert, was Kinder hören)“ im Titel.
- Keine personenbezogenen Daten: Das Repo ist öffentlich.
- „Nr. 76“ verweist auf die Aufgabenliste des Betreibers (`claude/aufgaben.md` im Claude-Projekt, nicht im Repo).

---

### A1 · PR #49 auf den heutigen Stand bringen und abschließen
- Rolle: Bauen · Prio: 1 · Status: offen · Bezug: Nr. 68E (Eltern-App, Server-Teil), Maßnahme M9
- Ziel: Der Inhalt von PR #49 (Branch `restlimit/2026-KW46`, Stand 13.11.) kommt auf den heutigen `main`: Story-State verfällt nach 24 Stunden ohne Nutzung (M9); Eltern-Server-Teil (Kopplung per sechsstelligem Code, Einwilligung erteilen und widerrufen, Schlafmodus, Ruhezeiten, Geschichte neu beginnen, alles löschen); Doku.
- Vorgehen: neuer Branch von `main`. Die Änderungen neu anwenden, nicht blind mergen: `server.ts` und der Erzähler haben sich mit #50 bis #58 stark geändert. Ist es zu groß, zwei PRs: erst M9, dann der Eltern-Teil. Danach PR #49 mit Verweis schließen und den Branch `restlimit/2026-KW46` löschen (letzten Commit-Hash im Bericht nennen).
- Fertig, wenn: gemergt, CI grün. Außerhalb von `NODE_ENV=production` läuft der Probelauf am Rechner ohne Kopplung weiter (mit Test belegt). `docs/picastAI-Pi-API.md` passt.
- Offen (Recht, keine Rechtsberatung): Die Einwilligung liegt nur im Arbeitsspeicher. Siehe E2.

### B1 · Sprechtaste schneller (Einordnung)
- Rolle: Bauen · Prio: 1 · Status: offen · Bezug: Nr. 76
- Ziel: Nach der Sprechtaste ordnet Claude erst ein (Frage, Idee, Geschichte …) und schreibt dann. Die Einordnung kostet rund 4 s. Erst messen (Attrappe mit realistischen Zeiten, `deploy/dryrun/`), dann beschleunigen: zum Beispiel Einordnung und Antwort in einem Aufruf, ein kleineres Modell (Claude Haiku) nur für die Einordnung oder eine sichere Vorab-Regel für eindeutige Fälle.
- Fertig, wenn: Messung vorher und nachher im PR. Neue Wege nur hinter einem Schalter, Standard unverändert, solange die Güte nicht belegt ist. Sicherheitsweiche und Ausgabe-Check unverändert wirksam (Tests).

### B2 · Stopp per Taste dem Server melden
- Rolle: Bauen · Prio: 1 · Status: offen · Bezug: Befund aus dem Probelauf vom 14.11.
- Ziel: Stoppt das Kind einen Teil per Taste, weiß der Server das bisher nicht. Eine Idee setzt dann am Ende des ganzen Teils an, obwohl das Kind nur einen Teil gehört hat. Der Pi-Client meldet den Stopp mit der gehörten Zeit; der Server merkt sich, wo die Geschichte für das Kind stand, und die nächste Idee setzt dort an.
- Fertig, wenn: Server, Pi-Client, Schnittstellen-Doku und Tests (auch e2e) passen. Für die Firmware ein eigener Folgepunkt. Ohne Meldung verhält sich alles wie heute.

### E3 · Sicherheitsweiche: mehr Testsätze, Lücken schließen
- Rolle: Prüfen · Prio: 1 · Status: offen · Bezug: Nr. 22
- Ziel: Die Listen in `server-api/safety.test.ts` um realistische Fälle erweitern: Fehler der Spracherkennung (falsch erkannte Wörter, fehlende Satzzeichen), Umgangssprache, Formulierungen von Kindern, Wörter mit doppelter Bedeutung. Lücken in `server-api/safety.ts` schließen. Lieber ein Fehlalarm als eine Lücke.
- Fertig, wenn: neue Sätze in beiden Listen („muss anschlagen“, „darf nicht anschlagen“), alle grün, `docs/Sicherheitsweiche-Pruefung.md` ergänzt.

### F1 · Aufräumen: Reste und alte Branches
- Rolle: Bauen · Prio: 1 · Status: offen · Bezug: Nr. 58, 58a
- Ziel: Reste von Google AI Studio löschen (`.aistudio/`, `metadata.json`, `firebase-blueprint.json`; vorher prüfen, dass nichts darauf verweist). Branches sichten: Branches, deren PR gemergt oder geschlossen ist und deren Inhalt in `main` steckt oder überholt ist, löschen. Je gelöschtem Branch den letzten Commit-Hash im Bericht nennen, damit er wiederherstellbar bleibt. `restlimit/2026-KW46` erst mit A1.
- Fertig, wenn: gemergt, CI grün, Liste der gelöschten Branches mit Hash im Bericht.

### H5 · Lizenz der Stimme stuart_bell
- Rolle: Recherche · Prio: 1 · Status: offen · Bezug: Nr. 9 (Stimme)
- Ziel: Klären, ob die Pocket-Stimme `stuart_bell` und das Pocket-TTS-Modell in einem verkauften Produkt genutzt werden dürfen: Herkunft (Datensatz), Lizenz, Pflichten (zum Beispiel Namensnennung). Nur aus Originalquellen (Kyutai, Hugging Face, Lizenztext des Datensatzes).
- Fertig, wenn: `docs/recherche/stimme-lizenz.md` mit Quellen und Abrufdatum, Einschätzung, nötigen Schritten (zum Beispiel Hinweis in der Doku). Keine Rechtsberatung.

### C1 · Ton-Strom in der Firmware
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Nr. 71b
- Ziel: Die Firmware (`firmware/esp32-s3/`) fordert wie der Pi-Client den Ton-Strom an (Kopf `X-Kunibert-Audio-Stream: 1`), versteht den WAV-Kopf mit unbekannter Länge und spielt in Blöcken, während der Rest lädt.
- Fertig, wenn: Rechner-Tests (`test/test_logic.c`) für den neuen Fall, CI-Build grün, Schnittstellen-Doku und `firmware/esp32-s3/README.md` angepasst. Auf keinem Gerät gelaufen: so im Bericht nennen.

### E1 · Wie lange bleiben die Zeitzeilen im Protokoll
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Nr. 47
- Ziel: Eine vorläufige Frist festlegen (Einschätzung, keine Rechtsberatung; zum Beispiel 14 Tage) und technisch umsetzen (journald oder logrotate über `deploy/`), Doku in `deploy/EINRICHTUNG.md`.
- Fertig, wenn: Einrichtungsskript und Test (`deploy/setup-server.test.sh`) decken die Frist ab; Entscheidung als „vorläufig“ im Bericht.

### E2 · Einwilligung nachweisbar, ohne Personendaten
- Rolle: Bauen · Prio: 2 · Status: offen · Nach A1
- Ziel: Erteilte und widerrufene Einwilligungen bleiben über einen Neustart erhalten: nur gehashte Geräte-Kennung, Zeitpunkt, Version des Elterntexts. Keine Namen, keine E-Mail, keine Aufnahmen.
- Fertig, wenn: gespeichert und beim Löschen mitgelöscht, mit Tests; Datenschutz-Abschnitt der Doku nennt genau das. Keine Rechtsberatung.

### E4 · Sicherheits-Prüfung des Servers
- Rolle: Prüfen · Prio: 2 · Status: offen
- Ziel: Angriffsfläche von `server.ts` und `server-api/` prüfen: Größen- und Zeitgrenzen beim Hochladen, Wiederholungen und Missbrauch (Rate-Limits), Prüfung der Geräte-Tokens, Admin-Zugang, Kopfzeilen, Pfade, Fehlertexte, Abhängigkeiten (`npm audit`).
- Fertig, wenn: Befunde als Liste im PR; kleine sofort behoben, große als neue Punkte.

### E5 · Protokoll-Datenschutz automatisch prüfen
- Rolle: Prüfen · Prio: 2 · Status: offen
- Ziel: Ein Test treibt alle Wege des Servers (Frage, Geschichte, Idee, Ton-Strom, Fehler, Kosten-Zeilen) und prüft, dass keine Logzeile Äußerungen, Antworttexte, Geräte-IDs oder Tokens enthält.
- Fertig, wenn: Test grün in der CI; bekannte Logzeilen sind abgedeckt.

### G2 · Ende-zu-Ende: eine ganze Folge
- Rolle: Prüfen · Prio: 2 · Status: offen
- Ziel: e2e-Szenario mit Claude-Attrappe: eine Folge von Morgen bis Abend, eine Idee mittendrin, eine Frage zur Folge, ein Stopp per Taste, Ton-Strom an und aus.
- Fertig, wenn: läuft in `npm run test:e2e` in der CI.

### D2 · Eltern-Weboberfläche `/eltern`
- Rolle: Bauen · Prio: 2 · Status: offen · Nach A1 · Bezug: Nr. 68E (PR C)
- Ziel: Schlichte Seite auf dem Kunibert-Server für das Handy, ohne fremde Dienste und ohne externe Schriften: koppeln, einwilligen und widerrufen, Schlafmodus, Ruhezeiten, Geschichte neu beginnen, alles löschen, Infoseite. Deutsch, einfache Sprache.
- Fertig, wenn: Seite und Routen getestet; kein Verlauf, keine Mitschriften, keine Statistik je Kind.

### H1 · Lieferbarkeit und Preise der Hardware
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: Nr. 33, 42
- Ziel: Raspberry Pi 5 (4 GB, 8 GB) und ESP32-S3-BOX-3 bei BerryBase und zwei weiteren deutschen Händlern; dazu zwei Alternativen zum BOX-3 mit Mikrofon und Lautsprecher. Mit Preis, Lieferbarkeit, Link und Abrufdatum.
- Fertig, wenn: `docs/recherche/lieferbarkeit.md` angelegt. Danach wiederkehrend: neu prüfen, wenn der letzte Stand älter als 3 Tage ist. Nichts bestellen.

### H2 · Vorgaben für ein Serienprodukt
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: Nr. 46
- Ziel: Überblick mit Fristen: EU-Spielzeugverordnung, KI-Verordnung (Art. 50; ob Kunibert als Hochrisiko gilt), Funkanlagen-Richtlinie mit Cybersicherheit (EN 18031), DSGVO (Kinder, Art. 8), CE-Kennzeichnung, Elektro- und Batteriegesetz. Je Vorgabe: was gilt ab wann, was folgt für Kunibert.
- Fertig, wenn: `docs/recherche/vorgaben-serienprodukt.md` mit Quellen und Abrufdatum; Folgerungen als neue Punkte. Keine Rechtsberatung.

### D1 · Eltern-Kopplung am Gerät
- Rolle: Bauen · Prio: 3 · Status: offen · Nach A1 · Bezug: Nr. 68E (PR B)
- Ziel: Pi-Client: beide Tasten 5 s halten, Kunibert sagt den Kopplungs-Code an; Schlafmodus und Ruhezeiten werden beachtet. Firmware-Entwurf nachziehen.
- Fertig, wenn: Pi-Client-Tests (auch gegen die echte Audio-Bibliothek in der CI), e2e, Doku.

### D3 · Themen, die Eltern ausschließen können (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen · Nach D2 · Bezug: Nr. 73
- Ziel: feste Auswahl (zum Beispiel Gespenster, Dunkelheit, Tiere in Gefahr, Streit), kein Freitext. Die Auswahl geht in die Anweisung an Claude und in den Ausgabe-Check.
- Fertig, wenn: mit Tests; Eltern-Seite zeigt die Auswahl.

### B3 · Erzähler-Probe ohne Schnittstelle (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen
- Ziel: Claude spielt nach den Anweisungen in `server-api/prompts.ts` drei Folgen Teil für Teil durch und prüft sie gegen die Regeln vom 14.11. (eine Folge ist ein Tag; Drache böse, ihn zu besiegen bleibt das ferne Ziel; Ideen ohne Sprung; Ende ohne Nachfrage; kurze Sätze). Unklare oder widersprüchliche Stellen in den Anweisungen beheben.
- Fertig, wenn: Befunde im PR; Änderungen an den Anweisungen mit Begründung; Tests grün. Die Probe ersetzt keinen Test mit dem echten Modell.

### B4 · Ersatzfolgen auf die Regeln vom 14.11. bringen (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen
- Ziel: Die festen Folgen ohne Claude prüfen und angleichen (ein Tag, böser Drache, Ende ohne Nachfrage); bei Bedarf eine weitere Folge nach `docs/Kunibert-Kanon.md`.
- Fertig, wenn: Ausgabe-Check und Tests grün.

### C2 · Firmware Stufe M6 weiter
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: Nr. 45
- Ziel: offene Teile von M6: Einrichtung ohne Kabel (Entwurf), Update-Ablauf mit signierter Firmware (Entwurf und Code, soweit ohne Gerät prüfbar), Verschlüsselung des Speichers (Konzept).
- Fertig, wenn: Rechner-Tests und CI-Build grün; was nur am Gerät prüfbar ist, steht im Bericht.

### G1 · Testabdeckung messen und Lücken schließen
- Rolle: Prüfen · Prio: 3 · Status: offen
- Ziel: Abdeckung der Server-Tests messen (`node --test --experimental-test-coverage` oder ähnlich). Die wichtigsten Lücken in `server-api/brain.ts`, `llm.ts` und `audio-stream.ts` schließen.
- Fertig, wenn: Messung vorher und nachher im PR.

### I1 · Schnittstellen-Doku gegen den Code
- Rolle: Recherche · Prio: 3 · Status: offen
- Ziel: `docs/picastAI-Pi-API.md` mit Server, Pi-Client und Firmware vergleichen. Abweichungen in der Doku beheben oder als Punkt eintragen.
- Fertig, wenn: Doku-PR gemergt.

### I2 · Einrichtung und Checkliste gegen den Code
- Rolle: Recherche · Prio: 3 · Status: offen
- Ziel: `deploy/CHECKLISTE.md` und `deploy/EINRICHTUNG.md` prüfen (Ton-Strom, Caddy `flush_interval -1`, neue Schalter, Eltern-Routen).
- Fertig, wenn: Doku-PR gemergt.

### H3 · KI-Hinweis und Kennzeichnung der Sprachausgabe
- Rolle: Recherche · Prio: 3 · Status: offen · Bezug: Nr. 4, 6, 27
- Ziel: Was gilt (KI-Verordnung Art. 50, Nutzungsrichtlinie von Anthropic)? Textentwurf für die Ansage am Gerät und für die Elterninformation.
- Fertig, wenn: `docs/recherche/ki-hinweis.md` mit Quellen. Entwurf, nichts abschicken. Keine Rechtsberatung.

### H6 · Kosten je Folge und Stückliste
- Rolle: Recherche · Prio: 3 · Status: offen
- Ziel: Kosten je Folge und je Frage aus den Preisen von Claude Sonnet 5.5 und Haiku 5.5 (Preisseite von Anthropic) und den Token-Zahlen aus `server-api/costs.ts`; Richtpreise für ein Seriengerät mit ESP32-S3 (Board, Mikrofon, Verstärker, Lautsprecher, Akku, Gehäuse).
- Fertig, wenn: `docs/recherche/kosten.md` mit Quellen. Stückzahl und Zielpreis entscheidet der Betreiber.

### B5 · Offline-Geschichte am Pi
- Rolle: Bauen · Prio: 4 · Status: offen · Bezug: Nr. 75
- Ziel: Ist der Server nicht erreichbar, spielt der Pi eine feste Geschichte statt nur eines Fehlers. Der Ton wird beim Einrichten erzeugt, nicht im Repo gespeichert.
- Fertig, wenn: Pi-Client-Tests, Installationsskript, Doku.

### E6 · Antwort nur einmal abrufbar
- Rolle: Prüfen · Prio: 4 · Status: offen · Bezug: Nr. 62
- Ziel: Folgen prüfen, wenn das Laden abbricht (Antwort weg). Vorschlag mit kurzer Wiederholfrist; umsetzen nur, wenn der Datenschutz gleich bleibt.
- Fertig, wenn: Entscheidung (vorläufig) im PR, mit Tests.

### F2 · Startseite des Repos
- Rolle: Bauen · Prio: 4 · Status: offen
- Ziel: `README.md` auf den heutigen Stand: was Kunibert ist, wie es aufgebaut ist, wie man testet. Nichts versprechen, was das Produkt nicht tut.
- Fertig, wenn: gemergt.

### H7 · Vergleich mit ähnlichen Produkten
- Rolle: Recherche · Prio: 4 · Status: offen
- Ziel: zum Beispiel Toniebox, Yoto, Fably und neue KI-Erzählgeräte: Funktionen, Datenschutz, Preise. Was kann Kunibert daraus lernen?
- Fertig, wenn: `docs/recherche/vergleich.md` mit Quellen; Ideen als neue Punkte.

### I3 · Elterninformation (Entwurf)
- Rolle: Recherche · Prio: 4 · Status: offen · Bezug: Nr. 16
- Ziel: Entwurf in einfacher Sprache, der nur die Verarbeitung beschreibt, die der Code wirklich macht.
- Fertig, wenn: `docs/recherche/elterninformation-entwurf.md`. Nichts veröffentlichen. Keine Rechtsberatung.

---

## Neue Punkte (von den Läufen angehängt)
