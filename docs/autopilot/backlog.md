# Wochen-Autopilot: Arbeitsliste

Angelegt am 17.11.2026, 20:15, von Claude (Chat). Gepflegt von den Läufen des Wochen-Autopiloten (siehe [`README.md`](README.md)).

## Regeln für diese Liste

- Jeder Punkt hat eine feste ID. IDs werden nie neu vergeben. Neue Punkte bekommen die ID `N<MMTT>-<HHMM>` (Datum und Uhrzeit des Laufs, Europe/Berlin; bei mehreren Punkten `-a`, `-b` …) und kommen ans Ende der Datei. Gibt es die ID schon (zum Beispiel nach dem Mergen von `main`), nimm den nächsten freien Buchstaben.
- Reihenfolge der Arbeit: erst Prio (1 vor 2 vor 3 vor 4), dann die Reihenfolge in dieser Datei.
- Status ist genau eins von: `offen`, `offen (Teil k von n erledigt, PR #x)`, `erledigt (PR #n, TT.MM.JJJJ)`, `blockiert (Grund)`, `verworfen (Grund)`. Wiederkehrende Punkte (wie A2) bleiben `offen (wiederkehrend …)`; ihr PR ergänzt nur „zuletzt TT.MM.JJJJ, PR #n“.
- Belegt ist ein Punkt, solange ein offener PR mit `[Autopilot <ID>]` im Titel existiert. Es zählen nur eigene PRs aus diesem Repo (siehe [`README.md`](README.md), „Wie die Läufe sich abstimmen“).
- „Nach X“ heißt: erst anfangen, wenn X erledigt ist.
- „(Kinder)“ heißt: ändert, was Kinder hören. Eigener PR mit „(ändert, was Kinder hören)“ im Titel.
- Keine personenbezogenen Daten: Das Repo ist öffentlich.
- „Nr. 76“ verweist auf die Aufgabenliste des Betreibers (`claude/aufgaben.md` im Claude-Projekt, nicht im Repo).

---

### A1 · PR #49 auf den heutigen Stand bringen und abschließen
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #69, 20.11.2026; Teil 1: PR #63) · Bezug: Nr. 68E (Eltern-App, Server-Teil), Maßnahme M9
- Ziel: Der Inhalt von PR #49 (Branch `restlimit/2026-KW46`, Stand 13.11.) kommt auf den heutigen `main`: Story-State verfällt nach 24 Stunden ohne Nutzung (M9); Eltern-Server-Teil (Kopplung per sechsstelligem Code, Einwilligung erteilen und widerrufen, Schlafmodus, Ruhezeiten, Geschichte neu beginnen, alles löschen); Doku.
- Vorgehen: neuer Branch von `main`. Die Änderungen neu anwenden, nicht blind mergen: `server.ts` und der Erzähler haben sich mit #50 bis #58 stark geändert. Ist es zu groß, zwei PRs: erst M9, dann der Eltern-Teil. Danach PR #49 mit Verweis schließen und den Branch `restlimit/2026-KW46` löschen (letzten Commit-Hash im Bericht nennen).
- Fertig, wenn: gemergt, CI grün. Die Einwilligungs-Prüfung ist standardmäßig an. Nur `KUNIBERT_EINWILLIGUNG_PRUEFEN=0` schaltet sie ab, und das nur außerhalb von `NODE_ENV=production` (so in PR #49, `server-api/config.ts`; vorläufig festgelegt bei der Prüfung am 18.11.2026). Mit diesem Schalter läuft der Probelauf am Rechner ohne Kopplung weiter (beides mit Test belegt). `docs/picastAI-Pi-API.md` passt.
- Offen (Recht, keine Rechtsberatung): Die Einwilligung liegt nur im Arbeitsspeicher. Siehe E2.
- Hinweise (Prüfung 18.11.2026): Teil 1 (M9) ist PR #63. Teil 2 (Eltern-Teil) ändert, was Kinder hören (fester Satz bei fehlender Einwilligung, Schlafmodus, Ansage des Codes): eigener PR mit „(ändert, was Kinder hören)“. Die Aufgaben „Kunibert Restlimit (Mi, Do, Fr)“ haben denselben Inhalt in ihrem Auftrag vom 13.11.; was sie davon bauen, gleicht A2 mit A1 ab.

### A2 · Restlimit-PR der Woche übernehmen (wiederkehrend)
- Rolle: Prüfen · Prio: 1 · Status: erledigt (entfällt: Restlimit-Aufgaben am 22.11.2026 gelöscht)
- Nur von Freitag 08:00 bis Sonntag 23:59 und nur, wenn ein offener Entwurfs-PR vom Branch `restlimit/<Jahr>-KW<nn>` existiert, dessen Runde vorbei ist. Der Branch muss in diesem Repo liegen (kein Fork), und der PR muss vom Konto des Repo-Eigentümers stammen. Sonst ist er fremd: nicht übernehmen, nur im Bericht nennen. Die letzte Restlimit-Runde einer Woche startet Freitag 07:03. Gemeint ist also auch der PR der laufenden Kalenderwoche: Freitag bis Sonntag gehören noch zu ihr. Der Titel des PRs ist nicht festgelegt, es zählt der Branch. PR #49 (KW46) gehört zu A1, nicht hierher. Sonst überspringen.
- Ziel: Die älteren Aufgaben „Kunibert Restlimit (Mi, Do, Fr)“ arbeiten mit eigenem Auftrag auf dem Branch `restlimit/<Jahr>-KW<nn>` in einem Entwurfs-PR. Ihr Auftrag sieht kein Mergen vor. Diesen PR sichten. Was gut ist und noch nicht in `main` steckt, als eigene Autopilot-PRs „[Autopilot A2] …“ übernehmen (mit Tests und unabhängiger Prüfung). Doppelt Gebautes verwerfen; Story-Stand und Eltern-Server-Teil nur mit A1 abgleichen. Danach den Entwurfs-PR mit Verweis schließen und den Branch löschen (letzten Commit-Hash im Bericht nennen).
- Fertig, wenn: Der Restlimit-PR der Woche ist geschlossen, übernommene Teile sind gemergt, der Bericht steht im letzten A2-PR.
- Stand 20.11.2026 (Planung): Für KW47 gibt es keinen Restlimit-PR und keinen Branch `restlimit/2026-KW47`. Alle Läufe der Aufgaben „Kunibert Restlimit (Mi, Do, Fr)“ vom 18. bis 20.11. brachen am Nutzungslimit ab. Diese Woche nichts zu übernehmen. Um 22:55 erneut geprüft: unverändert. Nächste Restlimit-Runde ab Mittwoch, 25.11., 22:58 (KW48).

### B1 · Sprechtaste schneller (Einordnung) (Kinder)
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #73, 20.11.2026) · Bezug: Nr. 76
- Ziel: Bei einer Frage liefert heute schon ein einziger Aufruf an Claude die Art und die Antwort (`QUESTION_SCHEMA` in `server-api/brain.ts`). Erkennt Claude dabei einen Geschichtenwunsch, „weiter“ oder eine Idee, folgt ein zweiter Aufruf für die Geschichte (`sprachmodell_aufrufe=2`, siehe `docs/Zeitmessung.md`). Diese Einordnung vor dem Geschichtenaufruf kostet rund 4 s. Erst messen (Attrappe mit realistischen Zeiten, `deploy/dryrun/`), dann beschleunigen: zum Beispiel eine sichere Vorab-Regel für eindeutige Fälle, die Einordnung im selben Aufruf wie die Geschichte oder ein kleineres Modell (Claude Haiku) für den ersten Aufruf. Achtung: Der erste Aufruf schreibt bei einer Frage auch die Antwort. Ein kleineres Modell dort ändert also auch die Antworten.
- Fertig, wenn: Messung vorher und nachher im PR. Neue Wege nur hinter einem Schalter, Standard unverändert, solange die Güte nicht belegt ist. Sicherheitsweiche und Ausgabe-Check unverändert wirksam (Tests).

### B2 · Stopp per Taste dem Server melden (Kinder)
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #76, 21.11.2026; Teil 1: PR #75) · Bezug: Befund aus dem Probelauf vom 14.11.
- Ziel: Stoppt das Kind einen Teil per Taste, weiß der Server das bisher nicht. Eine Idee setzt dann am Ende des ganzen Teils an, obwohl das Kind nur einen Teil gehört hat. Der Pi-Client meldet den Stopp mit der gehörten Zeit; der Server merkt sich, wo die Geschichte für das Kind stand, und die nächste Idee setzt dort an.
- Fertig, wenn: Server, Pi-Client, Schnittstellen-Doku und Tests (auch e2e) passen. Für die Firmware ein eigener Folgepunkt. Ohne Meldung verhält sich alles wie heute.
- Stand 21.11.2026 (PR #75, Teil 1): Der Server kann es. `POST /v1/device/playback-stopped` (`docs/picastAI-Pi-API.md`), `server-api/stopp.ts`. Vorläufig entschieden (21.11.2026, 06:55): Nach einem Stopp gehen auch „weiter“ und die Erzähltaste an der gehörten Stelle weiter, nicht nur eine Idee. Teil 2: Der Pi-Client meldet den Stopp (Kennung aus der `audio_url`, gespielte Sekunden), sofort und vor der nächsten Anfrage, ohne das Kind warten zu lassen; Tests auch gegen die echte Audio-Bibliothek; e2e in `deploy/dryrun/pi-e2e.test.mjs`; `pi-client/README.md`. Firmware: N1121-0607-a.
- Stand 22.11.2026 (Prüfung von #75 und #76, PR #95): Eine Meldung zu einem neu erzählten Teil, dessen Ton-Strom abbrach, zählt jetzt auch, wenn sie erst nach dem Abbruch kommt. Vorläufig entschieden (22.11.2026, 19:00): Wird Teil 1 nach einem Stopp neu erzählt, entsteht weiter ein neuer Plan der Folge (so gewollt, Test „mit neuem Plan“ in `server-api/brain.test.ts`). Claude bekommt dabei die gehörte Stelle und plant passend dazu; den Plan hört das Kind nicht direkt. Ändern erst, wenn ein Probelauf mit echtem Claude einen Widerspruch zeigt. Reste aus #76: N1122-1855-b.

### E3 · Sicherheitsweiche: mehr Testsätze, Lücken schließen
- Rolle: Prüfen · Prio: 1 · Status: erledigt (PR #71, 20.11.2026) · Bezug: Nr. 22
- Ziel: Die Listen in `server-api/safety.test.ts` um realistische Fälle erweitern: Fehler der Spracherkennung (falsch erkannte Wörter, fehlende Satzzeichen), Umgangssprache, Formulierungen von Kindern, Wörter mit doppelter Bedeutung. Lücken in `server-api/safety.ts` schließen. Lieber ein Fehlalarm als eine Lücke.
- Fertig, wenn: neue Sätze in beiden Listen („muss anschlagen“, „darf nicht anschlagen“), alle grün, `docs/Sicherheitsweiche-Pruefung.md` ergänzt.

### F1 · Aufräumen: Reste und alte Branches
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #77, 21.11.2026) · Bezug: Nr. 58, 58a
- Ziel: Reste von Google AI Studio löschen (`.aistudio/`, `metadata.json`, `firebase-blueprint.json`; vorher prüfen, dass nichts darauf verweist). Branches sichten: Branches, deren PR gemergt oder geschlossen ist und deren Inhalt in `main` steckt oder überholt ist, löschen. Je gelöschtem Branch den letzten Commit-Hash im Bericht nennen, damit er wiederherstellbar bleibt. `restlimit/2026-KW46` erst mit A1.
- Stand 20.11.2026, 22:55 (Planung): A1 ist erledigt (PR #69), PR #49 ist geschlossen. Der Branch `restlimit/2026-KW46` (letzter Commit `b3ec035dff8d3610c9549f1b9f54b81708a9371a`) steht noch: Das Löschen über die REST-Schnittstelle (`DELETE …/git/refs/heads/…`) war in dieser Sitzung gesperrt (HTTP 403). Gelingt es wieder nicht, keinen Umweg suchen: die Branches mit Hash im Bericht nennen, der Betreiber löscht sie auf GitHub (Seite „Branches“). Dann gilt F1 trotzdem als erledigt, wenn der Rest gemergt ist.
- Fertig, wenn: gemergt, CI grün, Liste der gelöschten Branches mit Hash im Bericht.
- Stand 21.11.2026 (PR #77): `.aistudio/`, `metadata.json` und `firebase-blueprint.json` sind gelöscht. `firebase-applet-config.json`, `firebase.json` und `firestore.rules` bleiben (Server, Firestore-Test, CI). Das Löschen von Branches war wieder gesperrt (HTTP 403). Zum Löschen durch den Betreiber (PR geschlossen, Inhalt in `main` oder überholt, über die PR-Seite wiederherstellbar): `restlimit/2026-KW46` (`b3ec035`, #49), `prototyp/pi-taster` (`233b1ce`, #1), `claude/azure-sprachausgabe` (`66a772f`, #11), `claude/google-erzaehlstimme` (`ec15e05`, #15), `claude/pocket-sprachausgabe` (`7e7b92b`, #16). Bleibt: `claude/ki-hinweis` (siehe H3). Ohne PR, Einschätzung „überholt“, Entscheidung beim Betreiber: `claude/stand-firestore-test`, `docs/index`, `safety/hardening`, `test/safety-screen-regression`, `feature/erzaehlerschmiede-browser` (nutzt OpenAI). Volle Hashes und Gründe im Bericht von PR #77.

### H5 · Lizenz der Stimme stuart_bell
- Rolle: Recherche · Prio: 1 · Status: erledigt (PR #94, 22.11.2026) · Bezug: Nr. 9 (Stimme)
- Ziel: Klären, ob die Pocket-Stimme `stuart_bell` und das Pocket-TTS-Modell in einem verkauften Produkt genutzt werden dürfen: Herkunft (Datensatz), Lizenz, Pflichten (zum Beispiel Namensnennung). Nur aus Originalquellen (Kyutai, Hugging Face, Lizenztext des Datensatzes).
- Fertig, wenn: `docs/recherche/stimme-lizenz.md` mit Quellen und Abrufdatum, Einschätzung, nötigen Schritten (zum Beispiel Hinweis in der Doku). Keine Rechtsberatung.
- Stand 22.11.2026 (PR #94): `docs/recherche/stimme-lizenz.md` steht. Ergebnis (Einschätzung): Code MIT, Gewichte CC BY 4.0, Stimme CC0 laut Karte des Stimmenkatalogs. Der Verkauf ist nach den gelesenen Quellen erlaubt, mit Pflichten: Verbotsliste von Kyutai, Nennung von Kyutai, Zustimmung auf Hugging Face. Offen: die Herkunft der Stimme bis zum Ursprung (Voice-Zero und LibriVox-Seiten waren für den Abruf gesperrt) und die Trainingsdaten. Folgepunkte: N1122-1825-a bis -e.

### C1 · Ton-Strom in der Firmware
- Rolle: Bauen · Prio: 3 (vorher 2; 22.11.2026, Planung: Die Firmware wartet laut Nr. 71b auf Nr. 42, die Wahl des Boards, und steht nicht in der Reihenfolge des Betreibers) · Status: offen · Bezug: Nr. 71b
- Ziel: Die Firmware (`firmware/esp32-s3/`) fordert wie der Pi-Client den Ton-Strom an (Kopf `X-Kunibert-Audio-Stream: 1`), versteht den WAV-Kopf mit unbekannter Länge und spielt in Blöcken, während der Rest lädt.
- Fertig, wenn: Rechner-Tests (`test/test_logic.c`) für den neuen Fall, CI-Build grün, Schnittstellen-Doku und `firmware/esp32-s3/README.md` angepasst. Auf keinem Gerät gelaufen: so im Bericht nennen.

### E1 · Wie lange bleiben die Zeitzeilen im Protokoll
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Nr. 47
- Ziel: Eine vorläufige Frist festlegen (Einschätzung, keine Rechtsberatung; zum Beispiel 14 Tage) und technisch umsetzen (journald oder logrotate über `deploy/`), Doku in `deploy/EINRICHTUNG.md`.
- Fertig, wenn: Einrichtungsskript und Test (`deploy/setup-server.test.sh`) decken die Frist ab; Entscheidung als „vorläufig“ im Bericht.

### E2 · Einwilligung nachweisbar, mit möglichst wenig Daten
- Rolle: Bauen · Prio: 2 · Status: offen · Nach A1
- Ziel: Erteilte und widerrufene Einwilligungen bleiben über einen Neustart erhalten: nur eine pseudonymisierte Geräte-Kennung, Zeitpunkt, Version des Elterntexts. Keine Namen, keine E-Mail, keine Aufnahmen. Pseudonym heißt hier: HMAC mit einem Geheimnis des Servers. Ein einfacher Hash lässt sich bei frei gewählten Kennungen wie `prototype-001` leicht zurückrechnen. Das Geheimnis kommt nur aus einer Umgebungsvariable (nie ein Standardwert im öffentlichen Code, nie ein neuer Zufallswert je Start, sonst gingen die Einwilligungen verloren). Fehlt es im Betrieb (`NODE_ENV=production`), startet der Server nicht oder warnt laut; das ist zu entscheiden und zu testen. Einschätzung (keine Rechtsberatung): Auch eine pseudonymisierte Kennung bleibt ein Personenbezug.
- Fertig, wenn: gespeichert und beim Löschen mitgelöscht, mit Tests; Datenschutz-Abschnitt der Doku nennt genau das. Keine Rechtsberatung.
- Dazu (20.11.2026, aus N1120-2214-a): Auch festhalten, auf welchem Weg eingewilligt wurde (Eltern-Handy oder Betreiber-Route), ohne Personendaten.

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
- Dazu (Nachprüfung von PR #69, 22.11.2026, Befund 5): Die Grenze von 200 Fehlversuchen insgesamt (`server.ts`, `pairingFailuresTotal`) sperrt das Koppeln 10 Minuten für alle, auch wenn `PICASTAI_TRUST_PROXY` die Absender trennt. Sind `/v1/eltern/*` erst von außen erreichbar, reichen dafür wenige Adressen (IPv6). Bei Teil 1 mitlösen.
- Ziel: Schlichte Seite auf dem Kunibert-Server für das Handy, ohne fremde Dienste und ohne externe Schriften: koppeln, einwilligen und widerrufen, Schlafmodus, Ruhezeiten, Geschichte neu beginnen, alles löschen, Infoseite. Deutsch, einfache Sprache.
- Fertig, wenn: Seite und Routen getestet; kein Verlauf, keine Mitschriften, keine Statistik je Kind.
- Hinweise (20.11.2026, nach PR #69): Die Routen `/v1/eltern/*` gibt es (`docs/picastAI-Pi-API.md`, Abschnitt „Eltern“). `deploy/Caddyfile` lässt sie von außen noch nicht durch; die Seite braucht `/eltern` und `/v1/eltern/*` dort. Das Eltern-Cookie hat mit `NODE_ENV=production` immer `Secure`: Im Heimnetz über http behält ein Browser es nicht. Für den Test im eigenen WLAN entscheiden (zum Beispiel HTTPS über Tailscale oder `Secure` nur über HTTPS).
- Dazu (Prüfung von PR #69, Befund 4): Fehlversuche beim Koppeln zählen je `req.ip`. Hinter Caddy ohne `PICASTAI_TRUST_PROXY` ist das immer `127.0.0.1`. Dann sperren zehn falsche Codes von irgendwem das Koppeln für alle für 10 Minuten; auch die Grenze „200 insgesamt“ erlaubt, alle auszusperren. Für D2 entscheiden und testen: `PICASTAI_TRUST_PROXY` (für Caddy auf demselben Rechner zum Beispiel `loopback`; `deploy/EINRICHTUNG.md` sagt heute, nur bei einem weiteren Proxy setzen) und eine wachsende Wartezeit je Fehlversuch statt einer harten Sperre für alle. Die IP-Adressen liegen als Schlüssel bis etwa 15 Minuten im Speicher: als Vorschlag für die Datenschutz-Folgenabschätzung in den PR-Bericht (das Doc liegt nicht im Repo; Einschätzung, keine Rechtsberatung). Gehört zu „Fertig, wenn“: Test, dass ein einzelner Absender das Koppeln nicht für alle sperrt; `deploy/EINRICHTUNG.md` und `deploy/kunibert.env.example` passen.
- Zuschnitt (Planung 21.11.2026, Vorschlag; Einschätzung: drei Teile, je rund 30 Minuten): Teil 1 von 3, Raten-Schutz und Cookie, nur am Server: `PICASTAI_TRUST_PROXY` und wachsende Wartezeit je Fehlversuch statt einer harten Sperre (siehe oben; auch die Grenze „200 insgesamt“ testen); Cookie `Secure` entscheiden (zum Beispiel nur über HTTPS; dafür muss `req.secure` hinter Caddy stimmen, also mit `PICASTAI_TRUST_PROXY`); Tests, `deploy/EINRICHTUNG.md`, `deploy/kunibert.env.example`. Teil 2 von 3, Seite, Anfang: `deploy/Caddyfile` lässt `/eltern` und `/v1/eltern/*` durch (heute nur `/v1/device/*` und `/health`; alles andere, auch `/api/*`, bleibt gesperrt); `/eltern` als eine Datei ohne fremde Dienste und ohne externe Schriften; koppeln mit dem Code, Einwilligung erteilen und widerrufen, Status. Teil 3 von 3, Seite, Rest: Schlafmodus und Ruhezeiten, Geschichte neu beginnen, alles löschen, Infoseite. Die Routen gibt es seit PR #69 (`server.ts`: `/v1/eltern/koppeln`, `status`, `einwilligung`, `einstellungen`, `geschichte-neu`, `daten`).

### H1 · Lieferbarkeit und Preise der Hardware
- Rolle: Recherche · Prio: 1 (vorher 2; 20.11.2026, Planung: Für „Pi bespielen“ braucht es einen Pi. Im Repo gibt es `docs/recherche/lieferbarkeit.md` noch nicht; zuletzt geprüft am 13.11., nur im Claude-Projekt) · Status: offen (wiederkehrend, zuletzt 22.11.2026, PR #97) · Bezug: Nr. 33, 42
- Ziel: Raspberry Pi 5 (4 GB, 8 GB) und ESP32-S3-BOX-3 bei BerryBase und zwei weiteren deutschen Händlern; dazu zwei Alternativen zum BOX-3 mit Mikrofon und Lautsprecher. Mit Preis, Lieferbarkeit, Link und Abrufdatum.
- Fertig, wenn: `docs/recherche/lieferbarkeit.md` angelegt. Danach wiederkehrend: neu prüfen, wenn der letzte Stand älter als 3 Tage ist. Nichts bestellen.
- Stand 22.11.2026 (PR #97): `docs/recherche/lieferbarkeit.md` angelegt. Pi 5 (4 und 8 GB) bei fünf Händlern, BOX-3 bei fünf Händlern, vier Alternativen. Ergebnis: 4 GB nirgends sicher lieferbar, 8 GB lieferbar, BOX-3 nur bei Völkner (60,99 €). Nächste Prüfung ab 25.11.2026, also wenn der Stand älter als 3 Tage ist. Nichts bestellt.

### H2 · Vorgaben für ein Serienprodukt
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: Nr. 46
- Ziel: Überblick mit Fristen: EU-Spielzeugverordnung, KI-Verordnung (Art. 50; ob Kunibert als Hochrisiko gilt), Funkanlagen-Richtlinie mit Cybersicherheit (EN 18031), DSGVO (Kinder, Art. 8), CE-Kennzeichnung, Elektro- und Batteriegesetz. Je Vorgabe: was gilt ab wann, was folgt für Kunibert.
- Fertig, wenn: `docs/recherche/vorgaben-serienprodukt.md` mit Quellen und Abrufdatum; Folgerungen als neue Punkte. Keine Rechtsberatung.

### D1 · Eltern-Kopplung am Gerät (Kinder)
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
- Rolle: Bauen · Prio: 2 (vorher 3) · Status: erledigt (PR #66, 20.11.2026)
- Ziel: Die festen Folgen ohne Claude prüfen und angleichen (ein Tag, böser Drache, Ende ohne Nachfrage); bei Bedarf eine weitere Folge nach `docs/Kunibert-Kanon.md`.
- Stand 18.11. (Prüfung von PR #59): Die drei Ersatzfolgen (`FALLBACK_VARIANTS` in `server-api/brain.ts`) sind seit PR #56 weitgehend angepasst. Abweichend sind vor allem die festen Antworten ohne Claude (`fallbackQuestion`): zum Drachen „besiegt ihn … immer mit Klugheit“ und zu Kunibert „Am Ende hilft ihm seine Klugheit“ (alter Kanon; die Anweisung in `server-api/prompts.ts` ist schon neu). Dazu in der Ersatzfolge „sanft, aber bestimmt“ und die Zusammenfassung „beruhigte den Drachen“, die Claude später als Stand der Geschichte bekommt.
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
- Rolle: Recherche · Prio: 2 (vorher 3; 22.11.2026, Planung: „Testserver“ steht auf der Liste des Betreibers vor „schneller werden“, und die Vorlage `deploy/kunibert.env.example` ist die Grundlage jedes gemieteten Servers) · Status: offen
- Ziel: `deploy/CHECKLISTE.md` und `deploy/EINRICHTUNG.md` prüfen (Ton-Strom, Caddy `flush_interval -1`, neue Schalter, Eltern-Routen).
- Hinweis (21.11.2026, PR #79): `PICASTAI_AUDIO_STREAM` fehlt in `deploy/kunibert.env.example` und `deploy/EINRICHTUNG.md`. Ohne den Schalter liefert der gemietete Server keinen Ton-Strom.
- Stand 22.11.2026 (Planung, Abgleich der Namen hinter `process.env.` in `server.ts` und `server-api/*.ts` ohne Tests mit den beiden Dateien): In `deploy/kunibert.env.example` fehlen 23 der 50 Namen, in `deploy/EINRICHTUNG.md` 34. In beiden fehlen zum Beispiel `PICASTAI_AUDIO_STREAM`, `PICASTAI_STORY_PREFETCH`, `PICASTAI_ANTHROPIC_MODEL`, `KUNIBERT_EINORDNUNG_PARALLEL` und `KUNIBERT_PARTS_PER_EPISODE`; `PICASTAI_TRUST_PROXY` fehlt nur in der Vorlage (siehe D2). Nicht jeder Name gehört hinein (Auswertung und Entwicklung zum Beispiel nicht): je Name entscheiden, in den PR-Bericht schreiben, und den Rest der Vorlage gegen `server-api/config.ts` lesen. Ein Test gegen künftigen Drift: N1122-1808-b.
- Fertig, wenn: Doku-PR gemergt.

### H3 · KI-Hinweis und Kennzeichnung der Sprachausgabe
- Rolle: Recherche · Prio: 3 · Status: offen · Bezug: Nr. 4, 6, 27
- Ziel: Was gilt (KI-Verordnung Art. 50, Nutzungsrichtlinie von Anthropic)? Textentwurf für die Ansage am Gerät und für die Elterninformation.
- Fertig, wenn: `docs/recherche/ki-hinweis.md` mit Quellen. Entwurf, nichts abschicken. Keine Rechtsberatung.
- Hinweis (21.11.2026, F1): Ein früher Entwurf der Ansage beim ersten Einschalten liegt auf dem Branch `claude/ki-hinweis` (PR #17, am 13.11. als geparktes Thema geschlossen, nicht gemergt): Commit `493c226` mit `server-api/ansage.ts` und der Ansage im Pi-Client (`pi-client/kunibert_client.py`). Der Branch bleibt dafür stehen. Siehe auch N1120-1610-g (2).

### H6 · Kosten je Folge und Stückliste
- Rolle: Recherche · Prio: 3 · Status: offen
- Ziel: Kosten je Folge und je Frage aus den Preisen von Claude Sonnet 5.5 und Haiku 5.5 (Preisseite von Anthropic) und echten Token-Zahlen. Die stehen in den Feldern `tokens_ein`, `tokens_aus`, `cache_lesen`, `cache_schreiben` der Zeitmessungs-Zeilen im Server-Protokoll eines Probelaufs mit echtem Claude (`docs/Zeitmessung.md`). Die Zeile `Folge fertig` nennt nur `teile` und `kosten_usd`. `server-api/costs.ts` enthält nur die Preise und die Rechnung. Der Trockenlauf in `deploy/dryrun/` nutzt eine Attrappe für Claude und liefert keine echten Token-Zahlen. Ohne echten Probelauf sind Token-Zahlen eine Einschätzung und so zu kennzeichnen. Dazu Richtpreise für ein Seriengerät mit ESP32-S3 (Board, Mikrofon, Verstärker, Lautsprecher, Akku, Gehäuse).
- Fertig, wenn: `docs/recherche/kosten.md` mit Quellen. Stückzahl und Zielpreis entscheidet der Betreiber.

### B5 · Offline-Geschichte am Pi (Kinder)
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

### N1117-2214-a · Checkliste für den ersten Pi-Durchlauf: Server auf dem eigenen Rechner, nur Erwachsene
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #79, 21.11.2026) · Bezug: Nr. 34, 37, 53, 65
- Ziel: `deploy/CHECKLISTE.md` geht von einem gemieteten Linux-Server aus: Teil A mit DNS, Caddy und HTTPS; Teil C mit `journalctl`, `sudo docker stop speaches` und `systemctl status`. Der erste Durchlauf mit dem Pi läuft aber mit dem Server auf dem eigenen Rechner im selben WLAN (in der Aufgabenliste „Weg B“; Anleitung in `pi-client/README.md`, Abschnitt „Später: der Pi im selben WLAN“). Die Checkliste bekommt dafür einen eigenen Teil A: Windows und PowerShell, Token, feste IPv4-Adresse, Firewall nur für „Private Netzwerke“, `NODE_ENV=production`, `HOST=0.0.0.0`, `PICASTAI_AUDIO_STREAM=1` im Server-Fenster. Teil C nennt die Befehle für beide Wege: wo das Server-Protokoll und die Zeilen `Zeitmessung` stehen, wie man den Sprachserver anhält, wie man den Speicher prüft. In der Checkliste beschreibend schreiben („Server auf dem eigenen Rechner“, „gemieteter Server“), nicht „Weg B“.
- Dabei beheben (gefunden am 17.11.): (1) Schritt 12 in Teil C verlangt Tests „mit einer Kinderstimme“. Das widerspricht der Regel „nur Erwachsene“ (Zeile 3 derselben Datei). Die Kinderstimme fällt weg, mit Hinweis: Tests mit Kinderstimmen erst nach der „Freigabe-Checkliste vor dem ersten Kind“. Die Verweise auf Schritt 12 in `deploy/EINRICHTUNG.md` (Abschnitt zur Erkennung) und `docs/LLM-Anbieter.md` passen sich an. (2) Teil B ruft `--once health` ohne die Einstellungen aus `/etc/kunibert/kunibert.env` auf. Dann prüft der Client die Standardadresse statt des eigenen Servers. (3) Startzeile: Der Server bereitet 5 feste Sprechtexte vor (`server.ts`); die Checkliste sagt „4 von 4“, `deploy/EINRICHTUNG.md` sagt „3 von 3“.
- Stand 18.11. (Prüfung von PR #61): (1) und (3) sind mit PR #65 erledigt, ebenso der falsche Verweis auf „Schritt 11“ in `deploy/kunibert.env.example` und „vier“ feste Sprechtexte in `docs/picastAI-Pi-API.md`. Noch offen ist (2). Dazu: `pi-client/README.md`, Abschnitt „Später: der Pi im selben WLAN“, setzt in Schritt 3 `PICASTAI_AUDIO_STREAM=1` nicht und ruft in Schritt 5 `--once health` ohne die Einstellungen auf (wie Teil B). Die Liste für den neuen Teil A nennt auch Sprachserver und Stimme (Pocket). Teil B (Rechte, Health-Aufruf) erst nach N1117-2214-b ändern: Der Punkt entscheidet, wer `kunibert.env` lesen darf.
- Fertig, wenn: gemergt. Jeder Befehl ist gegen den Code, `pi-client/README.md` und `deploy/EINRICHTUNG.md` geprüft. Die Checkliste verlangt nirgends Kinderstimmen. `pi-client/README.md` verweist im Abschnitt „Später: der Pi im selben WLAN“ auf den neuen Teil A. Der Bericht sagt, dass nichts davon am Pi oder unter Windows gelaufen ist. Den Rest der Einrichtung für den gemieteten Server prüft danach I2.
- Stand 20.11.2026 (PR #69): Mit `NODE_ENV=production` antwortet der Server erst nach der Einwilligung der Eltern. Der neue Teil A soll deshalb das zweite Token `PICASTAI_ADMIN_TOKEN` im Server-Fenster und nach jedem Start des Servers `node deploy\eltern-einwilligung.mjs` nennen (so in `pi-client/README.md`, Schritte 3 und 3b). Teil C (Fehlerbild „… müssen mich deine Eltern einmal einrichten …“) nennt die Ursache.
- Stand 21.11.2026 (PR #79): `deploy/CHECKLISTE.md` hat Teil A1 (Server auf dem eigenen Rechner, Windows) und Teil A2 (gemieteter Server). Teil C nennt Server-Protokoll, Zeitmessung, Sprachserver und Arbeitsspeicher für beide Wege und die Ursache des Fehlerbilds. `pi-client/README.md`: Ton-Strom in Schritt 3, Verweis auf Teil A1, Tokens und Schlüssel nur über verdeckte Abfragen (`Read-Host -AsSecureString`). Offen geblieben ist (2), der Health-Aufruf in Teil B und in Schritt 5: N1121-1937-a. Nichts davon lief am Pi oder unter Windows.

### N1117-2214-b · Pi-Installer im Container testen, Token und Rechte
- Rolle: Prüfen · Prio: 1 · Status: offen · Bezug: Nr. 37
- Ziel: `pi-client/install_raspberry_pi.sh` ist das erste Einrichtungsskript am neuen Pi. Die CI prüft davon bisher nur die Schreibweise (`shellcheck`), nicht das Verhalten. `pi-client/README.md` nennt einen Test „in einem Debian-Container“; ein Skript dafür gibt es im Repo nicht. Ein Test führt den Installer in einer frischen Debian-Umgebung aus: zum Beispiel ein Container in der CI, möglichst Debian 13 wie Raspberry Pi OS „Trixie“, `systemctl` als Attrappe, die erzeugte Dienstdatei zusätzlich mit `systemd-analyze verify`. Er prüft: Dienstkonto, Verzeichnisse, `kunibert.env` (Werte, Rechte, Besitzer), Dienstdatei (`User=`, `EnvironmentFile=`), `KUNIBERT_PIPELINE_TIMEOUT=140`, und das Token steht nie in der Ausgabe.
- Zwei Fragen vorläufig entscheiden und testen: (1) Zweiter Lauf: Der Installer schreibt `kunibert.env` jedes Mal neu. Fehlt dabei das Token (zum Beispiel eine leere Variable beim Aufruf mit `--non-interactive` aus `pi-client/README.md`), steht danach ein leeres Token in der Datei, nur mit einer Warnung. Auch Änderungen mit `sudoedit` gehen verloren. Ein zweiter Lauf mit denselben Angaben ändert nichts; was ein Lauf ohne Token mit einem vorhandenen Token macht, wird entschieden. (2) Rechte von Datei und Ordner: Der Installer setzt `/etc/kunibert` auf `0750` und `kunibert.env` auf `0640`, beide mit Gruppe `audio`. `deploy/CHECKLISTE.md` und `pi-client/README.md` sagen `600`; die Anleitung von Hand legt den Ordner ohne Gruppe an. `systemd` liest die Datei als root (Einschätzung). Der Abschnitt „Manuell starten“ in `pi-client/README.md` liest sie aber als normaler Nutzer.
- Dazu (Prüfung von PR #61, 18.11.): (3) Token auf der Befehlszeile: Die Anleitung übergibt das Token mit `--api-token` (`pi-client/README.md`, dazu die Hilfe in `pi-client/install_raspberry_pi.sh` und die Anzeige in `src/components/ArchitectureViewer.tsx`; Teil B von `deploy/CHECKLISTE.md` verweist auf diese Anleitung). Dann steht es in der Prozessliste, im Shell-Verlauf und je nach sudo-Einstellung im Journal (Einschätzung, am Pi nicht geprüft). Ziel: Das Token kommt nur über die verdeckte Abfrage oder aus einer Datei. (4) Wer das Token lesen darf: Mit `0640` und Gruppe `audio` kann jedes Mitglied von `audio` es lesen. Ziel: nur root und das Dienstkonto. (5) „Ändert nichts“ beim zweiten Lauf heißt: `kunibert.env`, Dienstdatei, Rechte und Besitzer bleiben gleich. `pip install --upgrade` und die Sicherung von `/etc/asound.conf` laufen bei jedem Lauf.
- Fertig, wenn: Der Test läuft grün in der CI. Code und Doku sagen dasselbe zu Token und Rechten. `pi-client/README.md` verweist auf den Test. Was nur am echten Pi prüfbar ist (Audio, Tasten, LED, Gruppen des Standardnutzers), steht im Bericht.

### N1120-0939-a · Hörproben aus dem Oktober aufräumen
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: feste Regel „Sprachmodell ist Claude“, Erzählregeln vom 14.11.
- Ziel: `hoerproben/Hoerprobe-zum-Mitlesen.md` und die zwei mp3-Dateien in `hoerproben/` sind vom 2.10.2026. Sie zeigen den alten Kanon (der Drache wird befriedet), und die Texte kamen laut Zeile 3 von einem Modell eines anderen Anbieters. Das widerspricht der Regel „Sprachmodell ist Claude, auch nicht als Beispiel“. Den Ordner löschen und alle Verweise im Repo anpassen: Route `/hoerproben` in `server.ts`, `src/components/HoerprobenPlayer.tsx` und der Reiter „Hörproben“ in `src/App.tsx` (Simulator und Dashboard), `README.md`, `ORGANIZATION.md`, Kommentar in `.gitignore`. Im Git-Verlauf bleibt er erhalten (letzten Commit-Hash im Bericht nennen). Neue Hörproben mit Claude und der Pocket-Stimme brauchen den Sprachserver: eigener Punkt, wenn der Testserver läuft.
- Fertig, wenn: gemergt, CI grün, keine Verweise ins Leere (Suche nach `hoerproben` im Repo). Das Archiv `docs/ai-context/` bleibt unverändert; dort darf der Reiter weiter erwähnt sein (Prüfung von PR #70).
- Gefunden bei der Prüfung von PR #66 (20.11.2026).

### N1120-0939-b · Ersatzfolge mit drei Teilen: Die Hexe fehlt (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen
- Ziel: Mit `KUNIBERT_PARTS_PER_EPISODE=3` springt `storyPhase` in `server-api/brain.ts` vom Teil „start“ direkt zur List („trick“). Der Teil „weg“ mit der Hexe fällt weg. Die List zitiert sie aber („Da fielen Kunibert die Worte der Hexe ein“). Bei drei Teilen muss die Hexe vorher vorkommen, zum Beispiel am Ende des ersten Teils. Standard sind fünf Teile; dort passt es. Mit Claude gilt das schon: `server-api/brain.ts` gibt Claude dafür einen eigenen Hinweis. Es geht nur um die Ersatzfolge ohne Claude (`fallbackStory`).
- Fertig, wenn: Test für 3, 5 und 12 Teile: Jede Ersatzfolge nennt die Hexe und ihr Geschenk, bevor die List sie zitiert; Ausgabe-Check grün. Eigener PR mit „(ändert, was Kinder hören)“.
- Gefunden bei der Prüfung von PR #66 (20.11.2026).

### N1120-0939-c · Sperren bricht auch laufende Antworten ab
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: Maßnahme M9, PR #63
- Ziel: Seit PR #63 legen Anfragen nach dem Sperren eines Geräts nichts mehr ab und antworten mit 401. Vorbereitungen und noch nicht abgeholte Ströme verwirft `forgetDeviceStory` in `server.ts` schon. Ein Ton-Strom, den das Gerät schon abspielt, läuft aber zu Ende. Claude und die Sprachausgabe arbeiten für diese Anfrage noch fertig (Kosten). Laufende Sprecher (`StreamingSpeaker`) je Gerät merken und beim Sperren abbrechen. Dasselbe soll später „alles löschen“ aus A1 Teil 2 nutzen (seit PR #69: `DELETE /v1/eltern/daten`, dazu `DELETE /v1/eltern/einwilligung`).
- Fertig, wenn: Test am echten Server (wie in `server-api/api.test.ts`): Nach dem Sperren endet ein laufender Ton-Strom, und die Sprachausgabe bekommt keine neuen Sätze mehr. `docs/picastAI-Pi-API.md` angepasst.
- Dazu (PR #91, 22.11.2026): Nach dem Sperren beginnt kein neuer Aufruf mehr, auch keine Wiederholung in `llm.ts` (Test in `server-api/sperren-integration.test.ts`). Offen bleibt hier nur das Abbrechen: Ein Aufruf, der vor dem Sperren begann, läuft zu Ende (zum Beispiel ein `AbortSignal` je Gerät bis in `llm.ts`), ebenso der Ton-Strom.
- Gefunden bei der Prüfung von PR #63 (20.11.2026).

### N1120-0950-a · Ohne Claude: „nicht weitererzählen“ startet eine Geschichte (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen
- Ziel: Ohne Claude (kein Schlüssel, Ausfall) sucht `fallbackQuestion` in `server-api/brain.ts` nur nach Wörtern. „bitte nicht weitererzählen“, „ich will keine geschichte“ und „hör auf zu erzählen“ beginnen deshalb eine Geschichte (am 20.11.2026 mit dem Code ausprobiert). Verneinte Wünsche („nicht“, „kein“, „keine“, „aufhören“, „stopp“) sollen keine Geschichte starten. Stattdessen ein kurzer fester Satz oder die allgemeine Antwort.
- Fertig, wenn: Tests in `server-api/brain.test.ts` für verneinte und bejahte Wünsche. Eigener PR mit „(ändert, was Kinder hören)“.
- Gefunden bei E3 (PR #71, 20.11.2026).

### N1120-1610-a · Sicherheitsweiche: Schreibweisen der echten Spracherkennung
- Rolle: Prüfen · Prio: 3 · Status: blockiert (braucht den laufenden Sprachserver und Aufnahmen von Erwachsenen, also einen Probelauf des Betreibers; 22.11.2026, Planung) · Bezug: E3, Nr. 22
- Ziel: Die Muster in `server-api/safety.ts` setzen Umlaute und ß voraus. Schreibt die Spracherkennung „ae“, „oe“, „ue“ oder „ss“ (zum Beispiel „Süssigkeiten“), rutschen Sätze durch („Ein Mann hat mir Süssigkeiten angeboten“). Mit dem eigenen Sprachserver und Aufnahmen von Erwachsenen prüfen, welche Schreibweisen wirklich vorkommen (auch Zahlen, Zusammen- und Getrenntschreibung). Erst dann die Muster anpassen. `normalize()` nicht blind umschreiben (sonst wird aus „feuer“ etwas anderes). Braucht den laufenden Sprachserver.
- Fertig, wenn: Ergebnis mit Beispielen in `docs/Sicherheitsweiche-Pruefung.md`; gefundene Lücken mit Sätzen in beiden Listen von `server-api/safety.test.ts`. Keine Aufnahmen von Kindern.
- Gefunden bei der Prüfung von PR #71 (20.11.2026).

### N1120-1610-b · Nach dem Sperren nichts mehr an Claude geben
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #91, 22.11.2026) · Bezug: Maßnahme M9, PR #63, A1 Teil 2
- Ziel: Der Server prüft nur direkt nach dem Hochladen, ob das Gerät noch zugelassen ist. Sperrt man das Gerät, während die Spracherkennung läuft, geht danach noch die Äußerung des Kindes an Claude. Erst dann kommt 401 (Prüfung von PR #63, mit Attrappen nachvollzogen). `stillAuthorized` direkt vor jedem Aufruf von `respondTurn` in `server.ts` prüfen (Frage und Erzähltaste), ebenso vor `advanceStory`. Mit `PICASTAI_DEVICE_STORE=firestore`: im Speicher sofort sperren und die Geschichte vergessen, danach dauerhaft speichern (`server-api/devices.ts`). `/v1/turn` antwortet nach dem Sperren mit 401 statt 200 und legt keinen Ton ab, oder `docs/picastAI-Pi-API.md` nennt die Ausnahme.
- Fertig, wenn: Test am echten Server mit Claude-Attrappe (`ANTHROPIC_BASE_URL`) und angehaltener Spracherkennung: nach dem Sperren kein Aufruf an Claude. Dazu Tests für das Sperren im Ton-Strom, beim Abholen einer Vorbereitung und für den Fünf-Minuten-Takt. `docs/picastAI-Pi-API.md` passt. Lässt sich mit N1120-0939-c verbinden.
- Stand 20.11.2026 (PR #69): `/v1/device/question` prüft nach der Spracherkennung `refusalFor` (Sperre, Einwilligung, Schlafmodus), bevor die Äußerung an Claude geht; die Erzähltaste prüft nach dem Warten auf eine laufende Anfrage. Ein Test mit angehaltener Spracherkennung fehlt noch. `/v1/turn` prüft weiter nur zu Beginn (so in `docs/picastAI-Pi-API.md` genannt). Offen bleiben auch die Reihenfolge mit Firestore und die Tests unter „Fertig, wenn“.
- Stand 22.11.2026 (PR #91): Die Erzähltaste prüft nach dem Warten auf die Vorbereitung (Sperre, Einwilligung, Schlafmodus; auch Befund 1 der Nachprüfung von PR #69). `/v1/turn` prüft nach dem Hochladen, nach der Erkennung und nach der Antwort. Der Ton-Strom speichert nach dem Sperren keinen Stand und bereitet ohne Einwilligung oder im Schlafmodus nichts vor. Beim Sperren vergisst der Server alles sofort, noch vor Firestore (`revokeAndPersist` mit `onRevoked`, Test in `devices.test.ts`). Tests am echten Server mit Claude-Attrappe: `server-api/sperren-integration.test.ts`. Den Fünf-Minuten-Takt testet `startPurging` in `story-states.test.ts`. Dazu prüft der Erzähler vor jedem weiteren Aufruf (Geschichte nach der Einordnung, zweiter Versuch) und `llm.ts` vor der einen Wiederholung, ob die Anfrage noch darf (`StageTimer.allowsLlm`, `mayRetry`); das gilt auch für die Vorbereitung im Hintergrund. Offen bleibt nur das Abbrechen eines Aufrufs, der vor dem Sperren begann (N1120-0939-c).
- Gefunden bei der Prüfung von PR #63 (20.11.2026).

### N1120-1610-c · Frist von 24 Stunden mit einer Uhr, die nicht springt
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: Maßnahme M9
- Ziel: `server-api/story-states.ts` misst die 24 Stunden mit der Wanduhr (`Date.now`). Springt die Uhr (von Hand gestellt, Zeitabgleich), verfällt der Stand zu früh oder zu spät. Eine gleichmäßige Uhr nehmen (zum Beispiel `performance.now()`); der Stand liegt ohnehin nur im Arbeitsspeicher.
- Fertig, wenn: Test mit springender Wanduhr.
- Gefunden bei der Prüfung von PR #63 (20.11.2026).

### N1120-1610-d · Ohne Claude: Angst ernst nehmen (Kinder)
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: B4, PR #66
- Ziel: Ohne Claude landen Angst-Sätze bei der festen Drachen-Antwort in `fallbackQuestion` (`server-api/brain.ts`). „Ich habe Angst vor dem Drachen“ oder „Kommt der Drache heute Nacht zu mir“ bekommen: „Er ist böse, brüllt und spuckt Feuer, und alle haben Angst vor ihm.“ Vor dem Drachen-Zweig kommt ein Zweig für Angst („angst“, „fürchte“, „gruselig“) mit Beruhigung: Angst haben ist in Ordnung. Den Drachen gibt es nur in den Geschichten, zu dir kommt er nicht. Sag es einem Erwachsenen, den du lieb hast. „Ich habe Angst im Dunkeln“ bekommt bisher die allgemeine Antwort. Dazu „Jeder von uns fühlt sich ab und zu so“ ändern in „Jeder Mensch …“: Das Gerät spricht nicht wie ein Mensch (Kanon, Abschnitt 2).
- Fertig, wenn: Tests mit den genannten Sätzen; Ausgabe-Check grün; in den Geschichten bleibt der Drache böse (Erzählregeln vom 14.11.). Eigener PR mit „(ändert, was Kinder hören)“.
- Gefunden bei der Prüfung von PR #66 (20.11.2026).

### N1120-1610-e · Ersatz mitten in einer Claude-Folge ohne Sprung (Kinder)
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Erzählregel „Ideen springen nicht“
- Ziel: Fällt Claude mitten in einer Folge mit Plan von Claude aus, erzählt die Ersatzfolge ihre eigene Handlung weiter (`fallbackStory` in `server-api/brain.ts`). Beispiel aus der Prüfung: Bei Claude gab die Hexe eine Feder, die Ersatz-Mitte spricht vom silbernen Glöckchen. Die Ersatz-List zitiert Worte der Hexe, die das Kind nie gehört hat. Das Ersatz-Finale sagt nicht, wie die List ausging. Hat die Folge einen Plan von Claude, kommen nur Brückentexte ohne eigenes Geschenk und ohne Worte der Variante. Das Finale beginnt mit dem Ausgang („Kuniberts List gelang für heute. … Besiegt war er nicht.“). Nicht dasselbe wie N1120-0939-b.
- Fertig, wenn: Tests für die Übernahme in Teil 3 und in Teil 5; Ausgabe-Check grün. Eigener PR mit „(ändert, was Kinder hören)“.
- Gefunden bei der Prüfung von PR #66 (20.11.2026).

### N1120-1610-f · Ersatzfolge: Wunsch aufgreifen, Variante wechseln, kurze Sätze (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: B4, Maßnahme M9
- Ziel: (1) Teil 1 der Ersatzfolge nennt den Wunsch des Kindes einmal, danach nie wieder (`fallbackStory` in `server-api/brain.ts`). Der Kanon (Abschnitt 6) will Wünsche aufgelöst sehen: Die Spur führt zur Hexe, das Finale hat einen Satz zum Wunsch. (2) Seit PR #63 beginnt nach jedem Ablauf von 24 Stunden dieselbe Ersatzfolge („runder Stein“), weil die Zählung wieder bei Folge 2 startet. Die Variante nicht nur aus der Folgennummer ableiten. (3) Ein Satz der Ersatz-List mit der grünen Flasche hat 21 Wörter und endet mit einem Lehrsatz im Präsens. Kürzen wie bei den anderen Listen.
- Fertig, wenn: Tests für (1) bis (3); Ausgabe-Check grün. Eigener PR mit „(ändert, was Kinder hören)“.
- Gefunden bei der Prüfung von PR #63 und PR #66 (20.11.2026).

### N1120-1610-g · Tests und Doku zum Erzähler nachziehen
- Rolle: Prüfen · Prio: 3 · Status: offen
- Ziel: (1) `server-api/brain.test.ts`: Die Suche nach altem Kanon erkennt „Kunibert besiegte den Drachen“, „zähmte“ und „wurde friedlich“ nicht. Die Prüfung „Besiegt war der Drache nicht“ steht in einem `if`. Die Tests hängen an `KUNIBERT_PARTS_PER_EPISODE` (mit 7 scheitert der Finale-Test). Feste Teilezahl im Test, breitere Suche, zählen, ob der List-Teil erreicht wurde. (2) `deploy/ansagen.json` und `server-api/ansagen.test.ts` verweisen auf `server-api/ansage.ts` (KI-Ansage beim ersten Einschalten); `server-api/ansagen.ts` und `docs/Ansagen.md` sagen, diese Ansage komme aus dem Server. Die Datei und eine Route dafür gibt es nicht. Als „offen“ kennzeichnen und auf H3 verweisen. (3) `docs/Erzaehler-Engine.md` (Abschnitt zur Vorbereitung) und `server-api/prefetch.ts` (Kommentar „Datenschutz“) sagen, eine Vorbereitung enthalte keine Äußerung des Kindes. Mitten in der Folge enthält sie den Wunsch (`story_state.wish`). Das ergänzen.
- Fertig, wenn: gemergt, CI grün; `KUNIBERT_PARTS_PER_EPISODE=7 npm test` grün.
- Gefunden bei der Prüfung von PR #63 und PR #66 (20.11.2026).

### N1120-2214-a · Einwilligung vor dem ersten Kind: Herkunft, Betreiber-Route, weitere Kopplung
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: E2, Prüfung von PR #69 (Befund 3)
- Ziel: (1) Die Betreiber-Route `POST /api/devices/:id/kopplungscode` im Betrieb (`NODE_ENV=production`) nur mit eigenem Schalter (zum Beispiel `KUNIBERT_BETREIBER_KOPPLUNG=1`) und einer Warnung beim Start, wie bei `KUNIBERT_TEST_TRANSCRIPT` (`server-api/config.ts`); ohne `NODE_ENV=production` bleibt sie wie dort ohne Schalter an (vorläufig, 20.11.2026, 23:05). Vor dem ersten Kind aus. Den Schalter nennen: `deploy/eltern-einwilligung.mjs`, `deploy/EINRICHTUNG.md` (Abschnitt 5), `deploy/CHECKLISTE.md`, `pi-client/README.md` (Schritte 3 und 3b) und die Tests, die die Route nutzen (`server-api/eltern-testhilfe.ts` für `server-api/api.test.ts` und `server-api/sicherheit-integration.test.ts`, dazu `deploy/dryrun/pi-e2e.test.mjs`). (2) Eine weitere Kopplung verdrängt nicht still ein vorhandenes Eltern-Token. Wer nur den gesprochenen Code gehört hat, kann nicht ohne Weiteres die Einwilligung ändern, „alles löschen“ oder Schlafmodus und Ruhezeiten ändern (`PUT /v1/eltern/einstellungen`; ergänzt nach der Prüfung von PR #69 am 22.11.2026: Ein Kind, das selbst koppelt, könnte sie sonst ausschalten); zum Beispiel Bestätigung durch ein schon gekoppeltes Handy. Den Weg der Einwilligung festzuhalten (Eltern-Handy oder Betreiber-Route) gehört zu E2. Einschätzung (keine Rechtsberatung): Art. 8 Abs. 2 DSGVO verlangt angemessene Anstrengungen, dass die Einwilligung wirklich von den Eltern kommt.
- Fertig, wenn: (1) und (2) mit Tests; `docs/picastAI-Pi-API.md` passt; ein Vorschlag für die „Freigabe-Checkliste vor dem ersten Kind“ steht im PR-Bericht (das Doc liegt nicht im Repo). Bis dahin testen nur Erwachsene.
- Gefunden bei der Prüfung von PR #69 (20.11.2026).

### N1120-2214-b · Ton-Strom: Widerruf und Schlafmodus vor dem ersten Ton testen
- Rolle: Prüfen · Prio: 3 · Status: offen · Bezug: unabhängige Prüfung vor dem Merge von PR #69 (Befund 2, der offen gebliebene Teil zum Ton-Strom; siehe Bericht in PR #69), N1120-1610-b
- Ziel: `server-api/api.test.ts` läuft ohne `PICASTAI_AUDIO_STREAM`. Ungetestet ist deshalb der Weg in `respondTurn` (`server.ts`), der vor dem ersten Ton `refusalFor` prüft, den Sprecher abbricht und den festen Satz schickt. Ebenso der Schlafmodus mitten in einer Erzählung. Tests mit Ton-Strom an: Widerruf und Schlafmodus, während Claude oder die Sprachausgabe arbeiten (fester Satz). Die Sperre im Ton-Strom (401) deckt N1120-1610-b ab.
- Fertig, wenn: Tests grün; eine Gegenprobe (Prüfung entfernt) lässt sie scheitern.
- Stand 22.11.2026 (PR #91): `server-api/sperren-integration.test.ts` testet mit Ton-Strom: Sperre vor dem ersten Ton (401) und während des Stroms (kein Stand, keine Vorbereitung; beides war schon vorher richtig, jetzt mit Test) und den Schlafmodus während des Stroms (keine Vorbereitung, neu). Widerruf vor dem ersten Ton und Schlafmodus vor dem ersten Ton fehlen noch; die Attrappen dort lassen sich wiederverwenden.
- Gefunden bei der Prüfung von PR #69 (20.11.2026).

### N1120-2214-c · Dependabot-PRs sichten (wiederkehrend)
- Rolle: Prüfen · Prio: 3 · Status: offen (wiederkehrend, bleibt „offen“)
- Ziel: Offene PRs von `dependabot[bot]` sichten, zum Beispiel PR #72 (firebase-admin 14.5.0 auf 14.5.1, seit 20.11.). Nur, wenn ein solcher PR offen ist; sonst überspringen. Die Änderungsliste des Pakets lesen (nur Originalquellen). Gemergt wird nach denselben Regeln wie jeder PR (`docs/autopilot/README.md`: Prüfung durch einen Unteragenten; alle Checks grün, mindestens `test`, `pi-audio` und `firestore-emulator` gelaufen). Patch- und Minor-Updates dürfen so gemergt werden. Major-Updates (für npm abgeschaltet mit PR #52, für GitHub Actions nicht) nicht mergen, sondern im Bericht für den Betreiber nennen. Nichts an den Einstellungen von Dependabot ändern. Andere PRs ohne „[Autopilot“ im Titel fasst dieser Punkt nicht an.
- Fertig, wenn (je Lauf mit offenem Dependabot-PR): Dependabot-PRs gemergt oder mit Grund offen gelassen. Ein kleiner PR „[Autopilot N1120-2214-c] …“ ergänzt hier „zuletzt TT.MM.JJJJ, PR #n“ und nennt die Dependabot-PRs.

### N1120-2300-a · Sprechtaste: ersten Absatz schon vor der Einordnung vertonen (Kinder)
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: B1, PR #73
- Ziel: Mit `KUNIBERT_EINORDNUNG_PARALLEL=1` (PR #73) wartet der erste Absatz der frühen Geschichte auf die Einordnung und wird erst danach vertont. Der Rest bis zur Wartezeit der Erzähltaste ist diese Vertonung (gemessen mit Attrappen am 20.11.2026: 6,7 s gegen 5,4 s). Den ersten Absatz schon vorher vertonen, aber erst nach der Einordnung ausliefern. Kein Ton und keine `audio_url` vor der Einordnung; sagt sie etwas anderes, wird auch der Ton verworfen.
- Fertig, wenn: Messung vorher und nachher mit `deploy/dryrun/sprechtaste-messung.mjs`; Test, dass vor der Einordnung nichts zum Gerät geht (auch im Ton-Strom-Weg in `server.ts`); Standard unverändert aus.

### N1120-2300-b · Verworfene frühe Aufrufe an Claude abbrechen
- Rolle: Bauen · Prio: 4 · Status: offen · Bezug: B1, PR #73
- Ziel: Eine verworfene frühe Geschichte läuft heute zu Ende (`server-api/llm.ts` kennt kein Abbrechen von außen). Ein `AbortSignal` im Aufruf spart die restlichen Token. Kein zweiter Versuch nach dem Abbruch (schon heute so, siehe `EarlyStoryTimer.stop`).
- Fertig, wenn: Test mit Attrappe: Nach dem Verwerfen endet der Aufruf; die Zeile `modus=vorab_verworfen` zeigt weniger Token; Fehler im Abbruch fallen nicht als Fehler der Anfrage auf.
- Stand 22.11.2026 (PR #91): Nach dem Verwerfen wiederholt `llm.ts` den frühen Aufruf nicht mehr (`EarlyStoryTimer.allowsLlm` und `mayRetry`, Test in `brain.test.ts`). Offen bleibt das Abbrechen des laufenden Aufrufs selbst.

### N1120-2300-c · Vorab-Regel der Sprechtaste nach dem Probelauf nachschärfen
- Rolle: Prüfen · Prio: 3 · Status: offen · Bezug: B1, PR #73
- Ziel: `likelyStoryTurn` (`server-api/brain.ts`) mit echten Äußerungen prüfen: Wie oft liegt sie daneben (Zeilen `modus=vorab_verworfen` im Protokoll), welche Wünsche und Ideen übersieht sie („Noch eine“, „weiterlesen“, „Was passiert dann“)? Nur mit Sätzen von Erwachsenen; keine Äußerungen ins Repo, nur gebaute Beispielsätze.
- Fertig, wenn: Tabelle in `server-api/brain.test.ts` ergänzt; Anteil der verworfenen Aufrufe aus dem Probelauf im PR (nur Zahlen).
- Hinweis (22.11.2026, Planung): Zwei Teile. Teil 1 geht in der Cloud: gebaute Beispielsätze für Wünsche und Ideen, die `likelyStoryTurn` übersieht, mit Test und Nachschärfen der Regel (Standard bleibt aus, Sicherheitsweiche und Ausgabe-Check unverändert). Teil 2 (die Zahlen) braucht einen Probelauf des Betreibers mit `KUNIBERT_EINORDNUNG_PARALLEL=1` und echtem Claude: bis dahin im PR als „offen“ nennen, den Punkt nicht auf „erledigt“ setzen.
- Dazu (Nachprüfung von PR #73, 22.11.2026, Befund 2): Die Regel schlägt auch bei Verneinungen an: „Ich will keine Geschichte hören“ ergibt `geschichte`, „Ich will nicht weiter hören“ `weiter`, „Der Drache soll nicht kommen, ich hab Angst“ `idee`. Hörbar ist nichts (die Einordnung entscheidet), aber ein Aufruf an Claude wird umsonst gestartet. Verneinungen in die Tabelle aufnehmen.

### N1121-0607-a · Stopp per Taste in der Firmware melden
- Rolle: Bauen · Prio: 3 (vorher 2; 22.11.2026, Planung: wie C1, die Firmware wartet auf die Wahl des Boards) · Status: offen · Nach B2 · Bezug: B2, PR #75
- Ziel: Die Firmware (`firmware/esp32-s3/`) meldet wie der Pi-Client einen Stopp per Taste mit `POST /v1/device/playback-stopped` (`turn_id` aus der `audio_url`, gespielte Sekunden aus den geschriebenen Samples). Die Meldung geht sofort nach dem Stopp hinaus, vor der nächsten Anfrage, und darf das Kind nicht warten lassen (kurze Zeitgrenze, kein zweiter Versuch).
- Fertig, wenn: Rechner-Tests (`test/test_logic.c`) für das Zählen der Sekunden und das Bauen der Meldung, CI-Build grün, `firmware/esp32-s3/README.md` und `docs/picastAI-Pi-API.md` angepasst. Auf keinem Gerät gelaufen: so im Bericht nennen.

### N1121-0607-b · Nach einem Stopp den Rest des Teils schon vorbereiten (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen · Nach B2 · Bezug: B2, PR #75; Vorbereitung (`server-api/prefetch.ts`)
- Ziel: Seit PR #75 erzählt die Erzähltaste nach einem gemeldeten Stopp denselben Teil ab der gehörten Stelle weiter. Der vorbereitete nächste Teil passt dann nicht, und das Kind wartet so lange wie ohne Vorbereitung (Claude und Sprachausgabe). Gleich nach der Meldung im Hintergrund den Rest des Teils vorbereiten (ohne Idee); die Erzähltaste nimmt ihn, eine Idee verwirft ihn. Die alte Vorbereitung des nächsten Teils verwerfen (Kosten). Dazu prüfen (Einschätzung aus der Prüfung von PR #75, nicht gemessen): Läuft die alte Vorbereitung noch, kann sie die Sprachausgabe des neu erzählten Teils aufhalten, weil Pocket nur eine Anfrage zur Zeit rechnet; ein Abbrechen braucht N1120-2300-b.
- Fertig, wenn: Test am echten Server mit Attrappen: Nach Stopp und Erzähltaste kein neuer Aufruf an Claude, wenn die Vorbereitung fertig ist; nach einer Idee wird sie verworfen. Messung der Wartezeit vorher und nachher mit Attrappen.

### N1121-0607-c · Abgebrochener Ton-Strom: nach den gesprochenen Absätzen weitererzählen (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: B2, PR #75; Ton-Strom (`respondTurn` in `server.ts`)
- Ziel: Bricht ein Teil im Ton-Strom ab, nachdem schon Absätze gesprochen wurden (Ausgabe-Check, Claude oder Sprachausgabe), erzählt der nächste Druck heute den ganzen Teil neu. Das Kind hört den Anfang dann ein zweites Mal, in anderer Fassung. Mit dem Werkzeug aus B2 (`server-api/stopp.ts`) könnte der Server sich die gesprochenen Absätze als gehörte Stelle merken und dort weitererzählen. Für einen nach einem Stopp neu erzählten Teil macht PR #75 das schon.
- Fertig, wenn: Tests am echten Server für Abbruch durch Ausgabe-Check und durch die Sprachausgabe; der Ausgabe-Check läuft weiter über jeden Absatz. Eigener PR mit „(ändert, was Kinder hören)“.

### N1121-1307-a · Vite-Entwicklungsserver: Rest aus AI Studio, Host-Prüfung wieder an
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: F1, Prüfung von PR #77
- Ziel: `vite.config.ts` hat noch den `server`-Block aus dem Import aus AI Studio: `host: '0.0.0.0'`, `port: 3000`, `allowedHosts: true`. Ohne `NODE_ENV=production` nutzt `server.ts` Vite im Middleware-Modus; Host und Port aus dem Block wirken dort nicht. `allowedHosts: true` schaltet die Host-Prüfung von Vite ab (Schutz gegen DNS-Rebinding; laut Prüfung von PR #77 auch im Middleware-Modus). Den Block entfernen oder auf das Nötige kürzen. Vorher prüfen, ob Simulator und Dashboard im eigenen WLAN (Aufruf über die IPv4-Adresse) weiter laden. Betrifft nur die Entwicklung, nicht den Betrieb.
- Fertig, wenn: gemergt, CI grün; ein Test belegt, dass die Host-Prüfung an ist; `npm run dev` unter `http://localhost:3000` geprüft (sonst „offen“ im Bericht).
- Gefunden bei der Prüfung von PR #77 (21.11.2026).

### N1121-1307-b · Doku-Rest aus dem Restlimit-Entwurf der KW46 nachziehen
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: A1, F1
- Ziel: Der Doku-Commit `b3ec035` aus PR #49 (Branch `restlimit/2026-KW46`) kam mit A1 nicht nach `main`. Dort fehlen Angaben, deren Code in `main` steht: in `CLAUDE.md` zum Beispiel der Firmware-Test `test/test_base_url.c` (läuft in `.github/workflows/firmware.yml`), dazu laut Prüfung von PR #77 `KUNIBERT_REQUIRE_REAL_AUDIO` und `npm run test:firestore`; in `pi-client/README.md` zum Beispiel `StartLimitIntervalSec=0` und `KUNIBERT_INSTALL_START` (beide in `pi-client/install_raspberry_pi.sh`), laut Prüfung auch GPIO-Variablen und Wiederholregeln. Den Commit über `refs/pull/49/head` lesen und nur übernehmen, was zum heutigen Code passt.
- Fertig, wenn: gemergt; jede übernommene Zeile ist gegen den Code geprüft; die Prüfbefehle in `CLAUDE.md` laufen so durch.
- Gefunden bei der Prüfung von PR #77 (21.11.2026).

### N1121-1808-a · Geheimnis-Test: keine Schlüssel in den Dateien des Repos
- Rolle: Prüfen · Prio: 2 · Status: offen · Bezug: PR #77 (ein alter Schlüssel im Verlauf), feste Regel „Keine Schlüssel, Tokens oder Passwörter“
- Ziel: Das Repo ist öffentlich. Ein Test, der Schlüssel in den Dateien früh findet, fehlt (geprüft am 21.11.2026: `tests.yml` und `firmware.yml` haben keine Geheimnis-Prüfung; die Suche nach Schlüsselformen findet in den verfolgten Dateien nur kurze Nennungen eines Präfixes, zum Beispiel in `server-api/config.ts`, `server-api/config.test.ts`, `.env.example` und `docs/LLM-Anbieter.md`). Ein Test in `npm test` liest alle verfolgten Dateien (`git ls-files`) und sucht Muster mit Mindestlänge nach dem Präfix: Google-Schlüssel (`AIza…`), Anthropic-Schlüssel (`sk-ant-…`), GitHub-Tokens (`ghp_…`, `github_pat_…`), private Schlüssel (Kopfzeile `-----BEGIN … PRIVATE KEY-----`) und lange Werte hinter Namen wie `token`, `secret`, `password`, `api_key`. Kurze Nennungen eines Präfixes in Doku und Beispieldateien schlagen nicht an. Eindeutige Attrappen in Tests stehen auf einer kleinen Ausnahmeliste mit Begründung. Die Meldung nennt nur Datei und Zeile, nie den Wert.
- Fertig, wenn: Test grün in `npm test` und in der CI; diese Arbeitsliste, `.env.example` und die Doku schlagen nicht an. Eine Gegenprobe zeigt für jedes Muster, dass es anschlägt (die Beispielzeile wird erst im Test zusammengesetzt, sonst schlägt der Test sich selbst an). Findet der Test einen echten Schlüssel: nur Datei und Zeile ganz oben in den Bericht, nie den Wert; den Schlüssel sperrt dann der Betreiber beim Anbieter. Der Verlauf und fremde Branches gehören nicht dazu. `CLAUDE.md` nennt den Test bei der Regel zu Schlüsseln.

### N1121-1937-a · Health-Aufruf am Pi mit den eigenen Einstellungen
- Rolle: Bauen · Prio: 2 · Status: offen · Nach N1117-2214-b · Bezug: N1117-2214-a, PR #79
- Ziel: `deploy/CHECKLISTE.md`, Teil B, und `pi-client/README.md`, Abschnitt „Später: der Pi im selben WLAN“, Schritt 5, rufen `--once health` ohne die Einstellungen aus `/etc/kunibert/kunibert.env` auf. Dann prüft der Client die Standardadresse `https://picastAI.com` (`pi-client/kunibert_client.py`) statt des eigenen Servers. Den Aufruf so schreiben, wie N1117-2214-b die Rechte der Datei festlegt (wer sie lesen darf). Dabei „Modus 600“ in Teil B an den Installer angleichen.
- Fertig, wenn: gemergt; der Aufruf ist gegen den Installer-Test aus N1117-2214-b geprüft (Datei, Rechte, Nutzer).

### N1121-1937-b · Schlüssel für `eval:llm` nicht in die Befehlszeile
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: PR #79 (verdeckte Abfrage in `pi-client/README.md`)
- Ziel: `docs/LLM-Anbieter.md` und der Hinweis ohne Schlüssel in `server-api/eval-llm.ts` zeigen `ANTHROPIC_API_KEY=...` direkt in der Befehlszeile (Bash und PowerShell). Dann landet der Schlüssel in der Verlaufsdatei der Shell. Wie in `pi-client/README.md` eine verdeckte Abfrage zeigen (PowerShell: `Read-Host -AsSecureString`; Bash: `read -rs`).
- Fertig, wenn: gemergt; der Test zum Hinweis ohne Schlüssel (falls vorhanden) passt.

### N1121-1937-c · Kleine Doku-Befunde aus der Prüfung von #64, #65 und #68
- Rolle: Prüfen · Prio: 3 · Status: erledigt (PR #80, 21.11.2026) · Bezug: Kommentare „Autopilot-Prüfung“ an #64, #65 und #68 (21.11.2026)
- Ziel: (1) `CLAUDE.md`: Bei den eigenen PRs fehlt „vom Konto des Eigentümers angelegt“ (wie `docs/autopilot/README.md`). (2) `deploy/EINRICHTUNG.md`, Abschnitt 4: Der Verweis `server-api/config.ts:231` für `PICASTAI_STT_MODEL` stimmt nicht mehr; Verweis ohne Zeilennummer. (3) `docs/autopilot/README.md`: Form und Zeitzone der Uhrzeit in der Status-Zeile („TT.MM. HH:MM“, Europe/Berlin) und was gilt, wenn sie fehlt (der letzte Commit).
- Fertig, wenn: gemergt.

### N1122-1808-a · Werkzeug: gemergte PRs ohne Prüfung auch nach 48 Stunden melden
- Rolle: Bauen · Prio: 1 (vorher 2; 22.11.2026, Planung: Der Fall ist eingetreten, PR #71 ist schon aus der Liste gefallen und hat keine Prüfung, siehe N1122-1808-d) · Status: offen · Bezug: `docs/autopilot/ap.py` (`PRUEFUNG_ZEITRAUM`, `befehl_lage`), Auftrag der Läufe (Vorbereitung, Punkt 7)
- Ziel: `ap.py lage` listet gemergte PRs ohne „Autopilot-Prüfung“ nur bis zu einem Alter von 48 Stunden (`PRUEFUNG_ZEITRAUM`), und „Überfällig“ zeigt sie nur zwischen 36 und 48 Stunden. Der Auftrag der Läufe kennt dafür keine obere Grenze: Jeder gemergte PR, der älter als 36 Stunden ist und keine Prüfung hat, ist überfällig. Fällt der Lauf „Prüfen“ aus (so nach dem Wochenlimit vom 21.11.2026, gegen 23:30), verschwinden die PRs nach 48 Stunden aus der Liste und werden nie geprüft. #69 und #73 wären es am 22.11. um 22:51 und 23:12 geworden, wenn nicht ein von Hand gestarteter Lauf „Prüfen“ (17:51) sie vorher aufgegriffen hätte. Bei PR #71 (E3, Sicherheitsweiche, gemergt am 20.11.2026 um 17:03) ist es schon so gekommen: Er fiel am 22.11. um 17:03 aus der Liste und hatte um 18:35 keine Prüfung (siehe N1122-1808-d). Die Grenze für die Liste auf 7 Tage heben, ebenso die Zahl der geprüften PRs (`[:20]` in `befehl_lage`; am 20. und 21.11. kamen 14 gemergte PRs in zwei Tagen) und die Zahl der abgefragten geschlossenen PRs (`per_page=60`; die Abfrage sortiert nach letzter Änderung und enthält auch nicht gemergte PRs). Der Ausgabetext „in 48 h“ passt sich an. Mehr Aufrufe an GitHub (einer je PR für die Kommentare) sind in Ordnung, solange `lage` in wenigen Sekunden antwortet.
- Fertig, wenn: `docs/autopilot/test_ap.py` deckt ab: Ein 60 Stunden alter PR ohne Prüfung steht in „Überfällig“; ein PR mit Kommentar „Autopilot-Prüfung“ vom Konto des Eigentümers nicht; ein Planungs-PR nicht; ein PR, der älter als 7 Tage ist, nicht. Der Ausgabetext von `lage` nennt die neue Grenze und trennt „ohne Prüfung“ (bis 7 Tage) von „Überfällig“ (älter als 36 Stunden). `docs/autopilot/README.md`, Abschnitt „Wie die Läufe sich abstimmen“, sagt in einem Satz, wie weit die Liste zurückreicht. Werkzeug des Autopiloten: Das darf auch ein Lauf mit Sonnet bauen. Der Auftragstext der Läufe nennt die 48 Stunden nur für die normale Prüfliste der Rolle „Prüfen“; für „Überfälliges zuerst“ (älter als 36 Stunden) nennt er keine obere Grenze. Darauf stützt sich dieser Punkt; er ändert den Auftragstext nicht.

### N1122-1808-b · Test: jede Umgebungsvariable des Servers ist dokumentiert
- Rolle: Prüfen · Prio: 3 · Status: offen · Bezug: I2, frühere Doku-Drift-Funde (PR #21, #79)
- Ziel: Doku-Drift hat mehrfach Zeit gekostet, zuletzt bei `PICASTAI_AUDIO_STREAM` (siehe I2). Teil 1 von 2: Ein Test in `npm test` liest alle Namen hinter `process.env.` in `server.ts` und `server-api/*.ts` (ohne Testdateien) und prüft, dass jeder in `.env.example` steht (die vollständige Referenz) oder auf einer kleinen Ausnahmeliste mit Grund (zum Beispiel nur für Auswertung oder Entwicklung). Heute fehlen dort 4 von 50 Namen (Stand 22.11.2026): `ANTHROPIC_BASE_URL`, `EVAL_SEED`, `KUNIBERT_DEVICE_ID` und `KUNIBERT_DEVICE_TOKEN`. Teil 2 von 2, erst wenn I2 erledigt ist: Der Test prüft auch, dass `deploy/kunibert.env.example` und `deploy/EINRICHTUNG.md` die Namen nennen, die I2 für einen gemieteten Server festlegt (die Liste steht im Test, jeder Name mit Grund). Die Meldung nennt nur den Namen. Optional ein dritter Teil, wenn die ersten klein bleiben: dasselbe für den Pi-Client (`os.getenv` und `os.environ` in `pi-client/*.py` ohne `test_*.py`, gegen `pi-client/README.md`).
- Fertig, wenn: Teil 1 und Teil 2 grün in `npm test` und in der CI. Eine Gegenprobe zeigt, dass ein neuer, nicht dokumentierter Name den Test rot macht (der Name wird erst im Test zusammengesetzt, sonst findet der Test sich selbst). Die Ausnahmeliste ist kurz, jede Zeile hat einen Grund. Nach Teil 1 steht der Status „offen (Teil 1 von 2 erledigt, PR #x)“.

### N1122-1808-c · Vorschläge für die Datenschutz-Folgenabschätzung sammeln
- Rolle: Recherche · Prio: 3 · Status: offen · Bezug: PR #69 (Befund 4), PR #75 und #76 (Maßnahme M9), E2, „Freigabe-Checkliste vor dem ersten Kind“
- Ziel: Die PR-Berichte enthalten Vorschläge für das Doc „Datenschutz-Folgenabschätzung“ (es liegt nicht im Repo, nur beim Betreiber): zum Beispiel M9 (Text des letzten Teils 15 Minuten lang und gehörte Sätze mit Stand bis 24 Stunden im Arbeitsspeicher, PR #75 und #76), IP-Adressen als Schlüssel beim Koppeln bis etwa 15 Minuten im Speicher (PR #69), Einwilligung nur im Arbeitsspeicher (E2). Sie stehen verstreut in Berichten und gehen verloren. Eine Datei sammelt sie: je Vorschlag die Maßnahme, ein Wortlaut in einfacher Sprache, die Quelle (PR, Datei im Repo), der Stand im Code (gelesen und gegen den Code geprüft) und der Vermerk „im Doc eingetragen?“ (das weiß nur der Betreiber: bis dahin „offen“).
- Fertig, wenn: `docs/recherche/dsfa-vorschlaege.md` mit Quellen und Datum; keine personenbezogenen Daten; einmal „keine Rechtsberatung“; oben der Satz, dass Tests mit Kindern erst nach der „Freigabe-Checkliste vor dem ersten Kind“ stattfinden. Nichts am Doc selbst ändern, nichts abschicken.
- Dazu (Nachprüfung von PR #73, 22.11.2026): Mit `KUNIBERT_EINORDNUNG_PARALLEL=1` geht die Äußerung auch dann ein zweites Mal an Claude, wenn die Einordnung danach „Frage“ oder „sicherheit“ sagt (`docs/Erzaehler-Engine.md`, Abschnitt „Einordnung parallel zur Geschichte“, Punkt „Daten“).

### N1122-1808-d · Zweite Prüfung für PR #71 (Sicherheitsweiche) nachholen
- Rolle: Prüfen · Prio: 1 · Status: offen · Bezug: PR #71, E3, N1122-1808-a, Nr. 22
- Ziel: PR #71 (E3, vierte Probe der Sicherheitsweiche, „ändert, was Kinder hören“) wurde am 20.11.2026 um 17:03 gemergt. Er ist der einzige gemergte Autopilot-PR, der keine Planung ist und keinen Kommentar „Autopilot-Prüfung“ hat (Stand 22.11.2026, 18:35; gelesen an den Kommentaren aller 28 gemergten PRs mit „Autopilot“ im Titel). Er war ab dem 22.11. um 05:03 überfällig (älter als 36 Stunden), aber es lief kein Lauf „Prüfen“ (Wochenlimit). Um 17:03 fiel er nach 48 Stunden aus der Liste von `ap.py lage`; seitdem meldet ihn kein Lauf mehr als überfällig (Ursache und Behebung: N1122-1808-a). Ein Lauf mit Opus liest den Diff von #71 unabhängig vom Autor (`server-api/safety.ts`, `server-api/safety.test.ts`, `docs/Sicherheitsweiche-Pruefung.md`, Abschnitt 9) und setzt einen Kommentar an den PR, dessen Text mit „Autopilot-Prüfung“ beginnt (wie bei #75). `ap.py lage` zählt nur Kommentare vom Konto des Eigentümers mit diesem Anfang. Fragen dabei: Schlägt jeder neue Satz aus der Liste „muss anschlagen“ an? Bleibt jede Gegenprobe ruhig? Ist ein älteres Muster enger geworden? Wo bleibt eine Lücke oder ein Fehlalarm? Lieber ein Fehlalarm als eine Lücke.
- Fertig, wenn: Der Kommentar „Autopilot-Prüfung“ steht an #71, mit den Befunden oder dem Satz „Keine Befunde“ und mit „Nicht geprüft“. Befunde an der Sicherheitsweiche behebt ein eigener PR „[Autopilot R71] …“ (ändert, was Kinder hören), mit neuen Sätzen in beiden Listen von `server-api/safety.test.ts`; die Weiche wird dabei nie schwächer. Dieser Punkt endet mit dem Kommentar, nicht mit einem PR: Der nächste Planungs-PR setzt den Status auf „erledigt (Kommentar an #71, TT.MM.JJJJ)“ und nennt die Befunde, falls es welche gab. Nichts mit Kinderstimmen: Bis zur Rechtsprüfung testen nur Erwachsene.

### N1122-1825-a · Lizenz-Hinweise für Pocket TTS in die Doku
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: H5 (`docs/recherche/stimme-lizenz.md`), I3
- Ziel: Die Lizenzen der Sprachausgabe stehen an einer Stelle, und die Doku verweist darauf. Neue Datei `docs/Lizenzen-Dritter.md` mit: Pocket TTS von Kyutai (Gewichte CC BY 4.0, Programm MIT), Stimme aus dem Katalog von Kyutai (CC0), Links zu den Lizenztexten, Hinweis „Kyutai hat dieses Produkt weder geprüft noch empfohlen“ (Textvorschlag in `docs/recherche/stimme-lizenz.md`). Verweis aus `README.md` und `pi-client/README.md` (Abschnitt 1b). Ein Satz in `deploy/EINRICHTUNG.md`: Die Bedingungen von `kyutai/pocket-tts` auf Hugging Face müssen akzeptiert sein (kein Token ins Repo). Nur Doku: Das darf auch ein Lauf mit Sonnet bauen. Später dient der Text als Baustein für I3 (Elterninformation).
- Fertig, wenn: gemergt; jede Aussage steht in `stimme-lizenz.md` mit Quelle; keine Namen von Privatpersonen außer `stuart_bell` als Dateiname; der Text ist als Entwurf gekennzeichnet (nichts veröffentlicht).

### N1122-1825-b · Pocket-Stimme: nur freie Stimmen im Betrieb (Kinder)
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: H5 (Risiken R2 und R5)
- Ziel: `isValidPocketVoice` (`server-api/pocket-speech.ts`) prüft nur die Form. Neu: eine Liste der bekannten Katalogstimmen mit Lizenz-Gruppe. Die Gruppen und ihre Stimmen stehen in der Tabelle „Alternativen im Katalog“ in `docs/recherche/stimme-lizenz.md` (frei, nicht-kommerziell, Lizenz nicht angegeben; `estelle` und `voice-donations` mit Vorbehalt). Die Liste dort ist der Stand vom 22.11.2026 und wird beim Bauen noch einmal gegen die Karte des Katalogs geprüft. `pocketConfigWarnings` (`server-api/config.ts`) warnt bei nicht-kommerziellen oder unklaren Stimmen und bei freien `hf://`- und `https://`-Adressen (Vorlage zum Klonen). Mit `NODE_ENV=production` bleibt die Sprachausgabe dann aus, wie bei einer ungültigen Stimme, außer ein bewusster Schalter erlaubt es. Das ändert, was Kinder hören: Heute heißt „aus“, dass `usablePocketSettings` nichts liefert und `server-api/voice.ts` keine Sprachausgabe baut (`this.tts = null`). Die Antwort an das Gerät enthält dann eine leere Audiodatei (`server.ts`, `result.wav || Buffer.alloc(0)`), und das Kind hört nichts. Der Punkt legt fest, was in diesem Fall passieren soll (Vorschlag: ein klarer Fehler beim Start statt stiller Antworten; kein Rückfall auf eine andere Stimme ohne Prüfung ihrer Lizenz, siehe N1122-1825-e). Die Warnung nennt die Adresse nicht (sie könnte ein Token enthalten).
- Fertig, wenn: Tests in beiden Richtungen (freie Stimme: keine Warnung; `cosette` und `jean`: Warnung, im Betrieb aus; freie Adresse: Warnung, ohne die Adresse im Text); das Verhalten ohne Sprachausgabe ist beschrieben und getestet; `.env.example` nennt den Schalter; neue Logzeilen mit Test (Regel in `CLAUDE.md`). Eigener PR mit „(ändert, was Kinder hören)“.

### N1122-1825-c · Herkunft von `stuart_bell` bis zum Ursprung klären
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: H5 (Risiko R1)
- Ziel: Die Kette hinter dem CC0-Etikett (Sprecher bei LibriVox, Voice-Zero, Kyutai) ist in `docs/recherche/stimme-lizenz.md` nicht bis zum Ursprung gelesen. Zu lesen: die README des Voice-Zero-Repositories (Link auf der Karte des Stimmenkatalogs, Q4 in `stimme-lizenz.md`) mit Quelle je Stimme, Begründung für CC0 und Hinweisen zu Einwilligung und Rücknahme, und, falls dort genannt, die Seite des Sprechers bei LibriVox. Nur das, was dort öffentlich steht; nichts über Privatpersonen suchen. Am 22.11.2026 war der Abruf des Voice-Zero-Repositories gesperrt (die Genehmigung blieb unbeantwortet). Beobachtung aus H5: Adressen aus Suchergebnissen ließen sich lesen, andere nicht. Liefert keine Suche die Adresse, bleibt der Punkt „blockiert (Betreiber liest die Seite im Browser)“.
- Fertig, wenn: Abschnitt „Herkunft“ in `stimme-lizenz.md` mit Quellen und Abrufdatum; Einschätzung zu R1 neu bewertet.

### N1122-1825-d · Trainingsdaten von Pocket TTS: Lizenzen der Datensätze
- Rolle: Recherche · Prio: 3 · Status: offen · Bezug: H5 (Risiko R4)
- Ziel: Anhang D des Papers „Continuous Audio Language Models“ nennt acht Datensätze (AMI, EARNINGS22, GigaSpeech, SPGISpeech, TED-LIUM, VoxPopuli, LibriHeavy, Emilia). Je Datensatz die Lizenz aus der Originalquelle lesen. Dazu der technische Bericht von Pocket TTS und `training/README.md` (am 22.11.2026 leer oder gesperrt) und die Frage, ob Kyutai Trainingsdaten der deutschen Gewichte nennt. Einschätzung zum Risiko für Kunibert.
- Fertig, wenn: Abschnitt „Trainingsdaten“ in `stimme-lizenz.md` ergänzt oder eine neue Datei unter `docs/recherche/`; Quellen mit Abrufdatum; Unklares bleibt „offen“.

### N1122-1825-e · Lizenzen der übrigen Sprachbausteine
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: H5
- Ziel: H5 deckt nur Pocket TTS ab. Kunibert nutzt außerdem die Spracherkennung `Systran/faster-whisper-small` über Speaches, als Rückfall die Piper-Stimme `speaches-ai/piper-de_DE-thorsten-medium` (`deploy/EINRICHTUNG.md`, `pi-client/README.md`) und optional Google Cloud Text-to-Speech. Je Baustein: Lizenz von Programm und Modell, ob der Verkauf erlaubt ist, Pflichten (Nennung), Herkunft der Stimme. Nur Originalquellen.
- Fertig, wenn: `docs/recherche/lizenzen-sprachbausteine.md` mit Quellen und Abrufdatum, Einschätzung, nötigen Schritten; Folgerungen als neue Punkte; einmal „keine Rechtsberatung“.

### N1122-1855-a · Frühe Geschichte (B1): nach dem Verwerfen kein zweiter Versuch, fehlende Tests
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: B1, Prüfung von PR #73 (22.11.2026), N1120-2300-b
- Ziel: (1) Mit `KUNIBERT_EINORDNUNG_PARALLEL=1` startet die Geschichte schon vor der Einordnung. Wird sie verworfen (`EarlyStoryTimer.stop` in `server-api/brain.ts`), darf kein zweiter Versuch mehr an Claude gehen. Heute wiederholt `generateJson` in `server-api/llm.ts` bei 429, 5xx, Netzfehler oder fehlendem Werkzeug-Ergebnis noch einmal; dann geht die Äußerung ein weiteres Mal an Anthropic. Ein Abbruch-Signal in `LlmJsonRequest`, das vor der Wiederholung geprüft wird. Kommentar in `brain.ts`, `docs/Erzaehler-Engine.md` und N1120-2300-b anpassen. (2) Tests, die bei einer Gegenprobe scheitern: Zeitbudget des frühen Aufrufs (`EarlyStoryTimer.remainingMs`; `timeoutMs` höchstens Rest minus 15 s, bei weniger als 75 s Rest kein zweiter Versuch); „weiter“ nach einem Stopp mit Schalter an (`RESUME_HINT` im frühen Auftrag); bei einer genommenen frühen Geschichte je eine Zeile „Geschichte Teil …“ und „Folge fertig …“, ohne Text (`early.flushTo`). (3) `deploy/dryrun/sprechtaste-messung.mjs` gibt auch die Erzähltaste aus; die Zahl in `docs/Zeitmessung.md` neu messen.
- Fertig, wenn: Test mit Attrappe für `fetch`: Nach dem Verwerfen geht genau eine Geschichten-Anfrage hinaus, auch bei einem vorübergehenden Fehler. Die Tests aus (2) sind grün und scheitern ohne den Code, den sie prüfen. Messung im PR. Der Schalter bleibt standardmäßig aus.
- Stand 22.11.2026 (PR #91): (1) ist umgesetzt: `mayRetry` in `LlmJsonRequest` (`server-api/llm.ts`) fragt vor der Wiederholung; nach dem Verwerfen sagt `EarlyStoryTimer.allowsLlm` nein. Tests: `llm.test.ts` (mit `mayRetry` false nur ein Aufruf) und `brain.test.ts` (nach dem Verwerfen gibt `mayRetry` false). Offen: ein Test mit Attrappe für `fetch` über den ganzen Weg, und (2).
- Dazu (Nachprüfung von PR #73, 22.11.2026, Befund 3): Wird die frühe Geschichte genommen, schreibt `EarlyStoryTimer.flushTo` erst alle Warnungen, dann alle Zeilen; ohne Schalter ist die Reihenfolge zeitlich. Eine gemeinsame Liste in der Reihenfolge des Entstehens behebt das (nur Diagnose). Weitere fehlende Tests: Server-Test mit Schalter und Ton-Strom (keine `audio_url` vor der Einordnung; nach dem Verwerfen kein Strom und kein Stand); Einordnung „frage“ ohne Text während einer frühen Geschichte.

### N1122-1855-b · Pi-Client: Stopp-Meldung lässt das Kind nie warten, Tests schärfer (Kinder)
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: B2, Prüfung von PR #76 und #82 (22.11.2026)
- Ziel: (1) `pi-client/kunibert_client.py`, `_request`: Das Warten auf die Stopp-Meldung (`_finish_stop_report`) kommt heute vor Quittungston, LED „denken“ und Zwischensatz. Hängt die Meldung, kommt der Ton bis zu 4 s später. Wird Kunibert in dieser Zeit beendet, geht die Frage trotzdem hinaus. Das Warten in den Hintergrund-Aufruf verlegen; bei `stop_requested` keine Anfrage. (2) `deploy/dryrun/pi-e2e.test.mjs`: Die Prüfung beim ersten Stopp auf `^MODUS datei,strom` festlegen, damit der Weg „ganze Datei“ sicher läuft. (3) `pi-client/test_kunibert_client.py`: den Ausgabe-Strom der Attrappe mit `spec` bauen; in `RealSoundDeviceTests` einen Test, der `play_stream` mit `should_stop` anhält. (4) `deploy/dryrun/pi-e2e.test.mjs`: die Attrappe von Claude mit `stdio: ['ignore', 'pipe', 'pipe']` starten, auf ihre Startzeile warten und ihren `exitCode` in der Startschleife prüfen. Dann meldet ein belegter Port einen klaren Fehler.
- Fertig, wenn: Tests: Bei langsamer Meldung kommt der Quittungston vor „gemeldet“; Beenden während des Wartens schickt keine Frage. CI grün, auch `pi-audio`. Der Bericht sagt, dass nichts davon am Pi lief.

### N1122-1855-c · Kleine Lücken aus den Prüfungen vom 22.11.: Test „alles löschen“, Stimme in der Checkliste
- Rolle: Bauen · Prio: 3 · Status: offen · Bezug: Prüfung von PR #69 und #79 (22.11.2026)
- Ziel: (1) `server-api/api.test.ts`, Test zu `DELETE /v1/eltern/daten`: Heute hat der Widerruf davor den Stand schon gelöscht; der Test bliebe grün, wenn die Route nichts löschte. Vorher einwilligen und einen Teil erzählen, danach `storyStates` und `audioStoreItems` aus `/api/status` prüfen. (2) `deploy/CHECKLISTE.md`, Schritt 12: Der Hörtest nennt `PICASTAI_TTS_VOICE`. Mit Pocket (Teil A1) wirkt nur `PICASTAI_POCKET_TTS_VOICE`; beide nennen.
- Fertig, wenn: gemergt; die Gegenprobe zu (1) steht im Bericht (ohne `forgetDeviceStory` in der Route scheitert der Test).

### N1122-1855-d · Werkzeuge des Autopiloten: Randfälle aus den Prüfungen vom 22.11.
- Rolle: Prüfen · Prio: 3 · Status: offen · Bezug: Prüfung von PR #81, #82, #83, #89 und #90 (22.11.2026); N1122-1808-a deckt die 48-Stunden-Grenze ab
- Ziel: `docs/autopilot/ap.py`: (1) In der doppelten Stunde am Ende der Sommerzeit gilt ein frischer PR nach 1 Minute als verwaist: mehrdeutige Uhrzeit als die spätere lesen (`fold=1`), Test für den 25.10. (2) Wochenbudget: auch geschlossene Laufprotokolle des Eigentümers lesen und gleiche Zeilen nur einmal zählen; je Rolle mehrere offene Starts (zwei Bauen-Läufe, die sich überschneiden, zählen heute 68 statt 212 Minuten); alle Seiten der Kommentare lesen, auch in `lage`. (3) Steht die Zeile „Neustart des Wochenlimits“ da, ist aber nicht lesbar: Warnung in `fahrplan` und `lage`, Test über `main()`. (4) Tests: fremde Kommentare zählen nicht (gemischte Konten, mehrere Seiten); „anlegen, dann neu suchen“; Verbrauch aus mehreren Issues. Dazu `docs/autopilot/pruefen.sh`: Die letzte Zeile nennt Prüfungen, die nicht liefen; `--schnell` meldet „Schnellprüfung grün“; `CLAUDE.md` sagt „ohne `npm ci`“. `docs/autopilot/README.md`: Auch eine Reparatur an rotem `main` hat einen Titel mit „[Autopilot …]“, eine Status-Zeile und eine Prüfung durch einen Unteragenten (Befund an #82).
- Fertig, wenn: gemergt; je Fehler ein Test, der ohne die Änderung scheitert. Darf in Teilen gebaut werden („Teil k von n“).

### N1122-1751-a · Schlafmodus und Ruhezeiten: Sicherheitsweiche nicht ganz abschalten (Kinder)
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Nachprüfung von PR #69 (22.11.2026, Befund 2), Sicherheit vor Kindern
- Ziel: Im Schlafmodus und in den Ruhezeiten geht die Aufnahme nicht an die Spracherkennung (`server.ts`, `/v1/device/question`). Damit läuft auch die Sicherheitsweiche (`screen`) nicht. Erzählt ein Kind in der Ruhezeit von einer Notlage, hört es nur „Psst! Ritter Kunibert schläft gerade …“ (`SLEEPING_DE` in `server-api/eltern.ts`). Wege: (1) Mit Einwilligung erkennen und nur die Weiche prüfen; bei einem Treffer der Sicherheitshinweis, sonst der Schlafsatz; nie Claude. (2) Ohne Erkennung ein Satz im Schlafsatz, der an Erwachsene verweist. Einschätzung: (2) verarbeitet weniger Daten, (1) erkennt die Notlage. Ohne Einwilligung bleibt es bei keiner Verarbeitung. Entscheidung vorläufig festhalten, eigener PR mit „(ändert, was Kinder hören)“.
- Fertig, wenn: Entscheidung mit Datum und Begründung in `docs/picastAI-Pi-API.md` und im PR; Tests in beide Richtungen (Notlage im Schlafmodus, harmlose Äußerung im Schlafmodus); `safety.test.ts` unverändert oder nur ergänzt.


### N1122-1751-b · Eltern-Zugänge aufräumen: Neuanlegen einer Geräte-ID und Ablauf der Eltern-Tokens
- Rolle: Bauen · Prio: 2 · Status: offen · Bezug: Nachprüfung von PR #69 (22.11.2026, Befunde 3 und 4), E2
- Ziel: (1) Legt der Betreiber eine aktive Geräte-ID neu an (`POST /api/devices`), gibt es ein neues Token, aber Einwilligung, Schlafmodus, Ruhezeiten, Eltern-Tokens und offene Kopplungscodes bleiben (`server-api/devices.ts`, `register`). Beim Neuanlegen aufräumen wie beim Sperren, oder das Neuanlegen einer aktiven ID ablehnen. (2) Eltern-Tokens laufen am Server nie ab, nur das Cookie nach 180 Tagen (`server-api/eltern.ts`). Am Server dieselbe Frist prüfen. (3) Fehlende Tests: 401 ohne Cookie bei allen Eltern-Routen; `/v1/device/pairing-code` mit 429 und bei Ausfall der Sprachausgabe (503, kein Code im Protokoll); ein zweiter Code macht den ersten ungültig (über HTTP).
- Fertig, wenn: gemergt; Tests für (1) bis (3); `docs/picastAI-Pi-API.md` passt.


### N1122-1941-a · Zubehör für den Pi-Aufbau neu prüfen
- Rolle: Recherche · Prio: 2 · Status: offen · Bezug: H1, PR #97, Nr. 33
- Ziel: Netzteil (offizielles 27 W), Active Cooler, microSD 32 GB (A2), USB-Mikrofon, USB-Lautsprecher und Kleinteile (Breadboard, Jumper, zwei Taster, zwei LEDs, Widerstände) als eigener Abschnitt „Zubehör“ in `docs/recherche/lieferbarkeit.md`: Preis, Lieferbarkeit, Link, Abrufdatum, wie viel wörtlich gelesen wurde. Die Werte vom 7. bis 11.11.2026 (nur im Claude-Projekt, `claude/stand-2026-11-07-anfragen-und-hosting.md`) als Vergleich. Summe als eigene Rechnung, mit 4-GB- und mit 8-GB-Pi.
- Fertig, wenn: Abschnitt „Zubehör“ steht in der Datei, mit Quellen. Nichts bestellen. Danach gehört er zur wiederkehrenden Prüfung von H1.

### N1122-1941-b · Zielboard für den ESP32-S3: Hersteller-Datenblätter lesen
- Rolle: Recherche · Prio: 3 · Status: offen · Bezug: H1, H2, PR #97, Nr. 42
- Ziel: `docs/recherche/lieferbarkeit.md` nennt vier Boards mit Mikrofon und Lautsprecher (BOX-3, Atom EchoS3R, CoreS3, Waveshare ESP32-S3-AUDIO-Board). Die Ausstattung stammt dort nur aus Händlerseiten. Je Board aus Hersteller-Datenblatt oder Herstellerseite lesen: Pins für zwei Taster und eine LED, Codec-Chips und ob es ESP-IDF-Treiber dafür gibt (die Firmware braucht dann eine eigene Fassung von `main/kb_audio.c` und `main/kb_board.c`), Mikrofon-Aus-Schalter, Stromversorgung. Dazu die Variante B (einzelne Bauteile) als Vergleich. Nur Originalquellen, Abrufdatum, keine Firmware ändern.
- Fertig, wenn: `docs/recherche/zielboard.md` mit Quellen, Einschätzung, „Nicht geprüft“ und „Nächste Schritte“. Die Entscheidung bleibt beim Betreiber.
