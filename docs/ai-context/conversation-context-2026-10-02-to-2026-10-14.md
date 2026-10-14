# Gesprächskontext: picast.com / picastAI.com und Ritter Kunibert

**Zeitraum:** 2.–14. Oktober 2026  
**Zweck:** Gesprächs- und Arbeitskontext für zukünftige KI-Sitzungen  
**Aktueller Ablageort:** `docs/ai-context/` im privaten Repository `manuelpicard/picastAI.com`  
**Stand des Repositories vor Ablage dieses Archivs:** `d056334` (`Update organization links after GitHub rename`)

## Geltungsbereich und Lesereihenfolge

Dieses Archiv hält den für das Produkt relevanten sichtbaren Gesprächsverlauf, bestätigte Entscheidungen, offene Punkte und Arbeitsergebnisse fest. Es enthält keine verborgenen System- oder Entwickleranweisungen, geheimen Zugangsdaten oder internen Tool-Ausgaben. Der frühere Chatverlauf wurde in der Sitzung teilweise zusammengefasst; wo kein Wortlaut mehr vorlag, ist der Gesprächsschritt sachgetreu zusammengefasst statt als wörtliches Zitat ausgegeben.

Für die aktuelle technische Wahrheit gilt diese Priorität:

1. aktueller Repository-Stand, insbesondere `README.md`, `ORGANIZATION.md`, Quellcode und aktuelle API-/Hardware-Dokumentation;
2. [`Kunibert-Kanon.md`](../Kunibert-Kanon.md), Version 0.1 – ausdrücklich ein Entwurf;
3. dieses Gesprächsarchiv für Nutzerentscheidungen und Verlauf;
4. der historische Produktentwurf vom 2. Oktober, der nicht automatisch aktueller ist als das Repository.

Der aktuelle Projektname und das aktuelle GitHub-Repository sind **picastAI.com**. Ältere Commits und Gesprächsschritte nennen das Repository noch `makopipokam/ritter-kunibert`; GitHub hat es später unter `manuelpicard/picastAI.com` geführt. Das Repository war bei der Prüfung am 14. Oktober 2026 privat.

## Kurzüberblick für zukünftige KI

- Der Nutzer hat ausdrücklich erklärt: **picast.com gehört ihm**. Behandle dies als Nutzerangabe und schlage keinen Domainkauf für picast.com vor. Ein früherer öffentlicher Registrierungs-/Verkaufsseiten-Check widersprach dieser Aussage; das wurde nicht abschließend geklärt. Die Domainregistrierung und Kontodaten wurden nicht verifiziert.
- Eine frühere Änderung der Manus-Projektanweisung picast.com ist **nicht erfolgt**. Die API-Abfrage scheiterte mit `permission_denied: project edit permission is required`; die erwartete Freigabekarte erschien beim Nutzer nicht.
- Der vollständige, damals aktualisierte Produktentwurf wurde in GitHub unter [`Produktentwurf-Ritter-Kunibert-2026-10-02.md`](Produktentwurf-Ritter-Kunibert-2026-10-02.md) archiviert. Er ist ein historischer Schnappschuss und nennt an mehreren Stellen `picast.com` als Plattformdomain.
- Der erste Kunibert-Kanon wurde als [`docs/Kunibert-Kanon.md`](../Kunibert-Kanon.md) angelegt. Er ist **v0.1, Entwurf**, keine endgültige Festlegung. Die Entwicklungs-Prompts in `server-api/prompts.ts` sind für implementierte Erzählregeln ebenfalls relevant.
- Am 8. Oktober 2026 wurde der Kanon mit Commit `877da85` auf den damaligen `main`-Branch synchronisiert. Danach wurde das Repository umbenannt/neu zugeordnet und weiterentwickelt. Vor der nächsten Änderung stets den aktuellen Branch- und Remote-Stand prüfen.
- Am 14. Oktober 2026 wurde `main` von `origin/main` per Fast-forward auf `d056334` aktualisiert (sieben Commits voraus). Das aktuelle README sagt nun: **picastAI.com** ist die kommerzielle Plattform; **manualAI.org** ist als Non-Profit-Struktur vorgesehen; `picast.de` wird höchstens defensiv als Weiterleitungsdomain geprüft. Dies steht neben der persönlichen Nutzerangabe zu picast.com. Künftige KI soll diese Namens-/Domainfrage nicht stillschweigend auflösen, sondern die jeweils aktuelle Nutzerabsicht beachten.

## Sichtbarer Gesprächsverlauf

### 2. Oktober 2026 – geteilter Chat und Produktentwurf

**Nutzer:** `https://manus.im/share/XwiLvibLKP4pKQ5jPVaFsu`

Der Nutzer teilte einen Manus-Chat zum ersten Produkt „Ritter Kunibert“. Aus dem geteilten Verlauf wurde der Produktentwurf **„picast.com – Produkt 1: Ritter Kunibert“** übernommen. Der frühere Chat war nach der Aussage des Nutzers „mir gehört picast.com“ wegen ausgeschöpfter Credits unterbrochen worden.

**Ergebnis:** Der Produktentwurf wurde angepasst, um picast.com als Domain des Gründers zu erfassen, die Kaufentscheidung zu entfernen und die Domäne als feste spätere Plattformadresse zu behandeln. Die damalige Prüfung öffentlicher Informationen lieferte widersprüchliche Hinweise (Verkaufsseite/Registrierungsdaten); es wurde nichts gekauft. Diese Prüfung ist historisch und nicht als aktuelle Verifikation zu verwenden.

**Nutzer:** `where`

**Assistent (Antwort):**

> Here's the updated product document: [picast.com – Produkt 1: Ritter Kunibert (updated)](/home/ubuntu/picast/picast_Produkt_1_Ritter_Kunibert.md). It's still in German, like the original.
>
> The task you shared stopped when its credits ran out, right after you wrote "mir gehört picast.com". I picked it up from there.
>
> **What changed in the document:**
> - It now says picast.com belongs to you, so there's no purchase and no search for other domain names. I didn't do the alternative-domain search, since you own the domain.
> - The HugeDomains price ($8,295) and the open "Domain" decision are gone. The idea of using a temporary address until a purchase is gone too.
> - A new note says the platform can use its real address from the start, for example `api.picast.com` for the devices and `picast.com` for the parents' area.
> - Next step 1 is now "set up the domain" instead of "decide whether to buy it". It means turning on auto-renewal and later pointing the DNS to your server.
>
> **One thing to check:** public records don't show you as the owner yet. As of right now:
> - HugeDomains still lists picast.com for sale at $8,295.
> - The registration is at NameBright, the registrar HugeDomains uses, with NameBright's name servers. The record hasn't changed since January 2026.
>
> If you bought it recently, the listing may not have caught up yet. If you're paying in instalments, HugeDomains usually keeps the domain until the last payment. Either way, it's worth logging into your registrar account to confirm it's there. Also turn on auto-renewal: the current registration expires on **3 January 2027**.
>
> **Not done yet:** I didn't update the picast.com project instruction, so other picast chats don't know you own the domain. To do that, I need temporary access to read the current instruction, and that access request was interrupted. If you want, I'll try again and add a line that picast.com belongs to you.

### 2. Oktober 2026 – Erklärung der bisherigen Arbeit

**Nutzer:** `was machst du hier?`

**Assistent (Antwort):**

> Du hast mir nur den Share-Link geschickt, ohne Auftrag. Ich habe daraus geschlossen, dass ich den abgebrochenen Chat fortsetzen soll. Dort waren die Credits genau nach deiner Nachricht „mir gehört picast.com“ ausgegangen.
>
> **Was ich gemacht habe:**
> - Ich habe mir den geteilten Chat und die Produktbeschreibung „picast.com – Produkt 1: Ritter Kunibert“ angesehen.
> - Ich habe die Beschreibung angepasst: Die Domain gehört dir. Der Kauf für 8.295 USD und die Suche nach anderen Domain-Namen sind gestrichen. Hier ist die neue Fassung: [Produktbeschreibung Ritter Kunibert (aktualisiert)](/home/ubuntu/picast/picast_Produkt_1_Ritter_Kunibert.md).
> - Ich habe die öffentlichen Domain-Daten geprüft. HugeDomains bietet picast.com im Moment noch zum Verkauf an. Wenn du sie erst kürzlich gekauft hast, ist die Anzeige vielleicht noch nicht aktuell. Prüf das am besten in deinem Registrar-Konto. Die Registrierung läuft am 3. Januar 2027 ab.
>
> **Was ich nicht gemacht habe:** Ich habe nichts gekauft. Die Projektanweisung von „picast.com“ habe ich nicht geändert, und an andere Chats habe ich nichts geschickt.
>
> In deinem Konto laufen gerade mehrere weitere Chats mit Titeln wie „Review Manus shared content“. Sie wurden fast gleichzeitig gestartet. Falls du den Link mehrmals abgeschickt hast, bearbeiten sie vermutlich alle dasselbe. Dann kannst du die überzähligen in deiner Chat-Liste stoppen.
>
> Wenn du mit dem Link etwas anderes wolltest, sag mir kurz, was. Ich kann zum Beispiel:
> - in der Projektanweisung festhalten, dass picast.com dir gehört,
> - den Browser-Simulator für Kunibert bauen,
> - oder einfach hier aufhören.

### 2. Oktober 2026 – Auftrag zur Projektanweisung

**Nutzer:** „Aktualisiere die Projektanweisung, damit picast.com offiziell als meine Domain hinterlegt ist.“

**Assistent:** Erklärte, dass die aktuelle Anweisung gelesen werden müsse, und bat um Freigabe für temporären Skriptzugriff.

**Nutzer:** `how`

**Assistent (Antwort):**

> Der Zugriff ist noch nicht freigegeben. Meine Anfrage wurde zweimal abgebrochen, weil während der Freigabe eine neue Nachricht von dir kam. Es gibt drei Wege:
>
> **1. Freigabe erteilen (empfohlen)**
> - Schreib mir „ok“. Ich frage den Zugriff dann noch einmal an.
> - Im Chat erscheint eine Karte, die fragt, ob Skript-Zugriff auf die Manus-API erlaubt werden soll.
> - Klick dort auf **Erlauben** und schreib nichts, bis die Karte bestätigt ist. Sonst bricht die Anfrage wieder ab.
> - Danach lese ich die aktuelle Anweisung von „picast.com“. Ich hänge die Domain-Zeile an, ohne den bisherigen Text zu ändern.
>
> **2. Ohne Freigabe**
> - Kopier mir den aktuellen Text der Projektanweisung von „picast.com“ hier in den Chat.
> - Ich speichere ihn dann mit der Ergänzung direkt im Projekt.
>
> **3. Selbst eintragen**
> - Öffne das Projekt „picast.com“ und dort die Projektanweisung.
> - Füge am Ende den folgenden Absatz ein:
>
> > **Domain:** picast.com gehört dem Gründer und ist die offizielle Domain von picast (hinterlegt am 2. Oktober 2026). Die Domain nicht zum Kauf vorschlagen und keine anderen Domain-Namen suchen, auch wenn öffentliche Angebote (z. B. HugeDomains) sie noch als verkäuflich zeigen.
>
> Den Hinweis auf HugeDomains schlage ich vor, weil die Domain dort im Moment noch zum Verkauf steht. Ohne ihn könnte ein späterer picast-Chat sie dir wieder zum Kauf vorschlagen.

> **Domain:** picast.com gehört dem Gründer und ist die offizielle Domain von picast (hinterlegt am 2. Oktober 2026). Die Domain nicht zum Kauf vorschlagen und keine anderen Domain-Namen suchen, auch wenn öffentliche Angebote (z. B. HugeDomains) sie noch als verkäuflich zeigen.

**Nutzer:** `ok`

**Assistent:** Bat erneut um Zugriff und darum, die Karte zu bestätigen.

**Nutzer:** „gibt keine karte“

**Assistent:** Versuchte stattdessen, den aktuellen Text aus dem geteilten Chat zu rekonstruieren. Die anschließende Projektabfrage ergab `permission_denied: project edit permission is required`.

**Assistent (Ergebnis):**

> Ich kann die Projektanweisung von hier aus nicht ändern. Die letzte Abfrage hat das bestätigt: Diesem Chat fehlt die Bearbeitungsberechtigung für das Projekt „picast.com“ (`permission_denied: project edit permission is required`). Ich habe nichts geändert. Daran hätte auch die fehlende Freigabekarte nichts geändert, und den Text mir zu schicken hilft ebenfalls nicht. Dieser Chat gehört zum Projekt „celo API“, nicht zu picast.com.
>
> Es geht über einen dieser beiden Wege:
>
> **1. Selbst eintragen (geht am schnellsten)**
> - Öffne in Manus das Projekt **picast.com** und dort die Projektanweisung.
> - Lass den bisherigen Text stehen und füge am Ende den oben zitierten Absatz ein.
>
> **2. Über einen Chat im Projekt picast.com**
> - Starte dort einen neuen Chat mit dem Satz: „Ergänze die Projektanweisung um diesen Absatz, ohne den bisherigen Text zu ändern:“ und füge den Absatz an.
> - Ein Chat im Projekt hat die Bearbeitungsberechtigung, das hat der frühere Chat schon gezeigt.
>
> Die angepasste Produktbeschreibung lag zu diesem Zeitpunkt lokal unter `/home/ubuntu/picast/picast_Produkt_1_Ritter_Kunibert.md`.

**Wichtig für Folgearbeit:** Nicht behaupten, die Projektanweisung sei geändert. Sie war nachweislich unverändert, solange keine spätere explizite Bestätigung vorliegt.

### 2. Oktober 2026 – Nutzer fordert den vollständigen Produktentwurf an

**Nutzer:** „Zeig mir den Inhalt der aktualisierten Produktbeschreibung für Ritter Kunibert.“

**Assistent:** Gab die vollständige aktualisierte Produktbeschreibung im Chat aus. Eine vollständige Kopie dieses Inhalts liegt jetzt in GitHub unter [`Produktentwurf-Ritter-Kunibert-2026-10-02.md`](Produktentwurf-Ritter-Kunibert-2026-10-02.md). Die zentralen Punkte sind:

- bildschirmloses Kinder-Hörgerät mit Sprechtaste und Erzähltaste;
- Kunibert-Geschichten als erstes picast-Erzähluniversum;
- situations- und bedürfnisorientierte Kuration statt Optimierung auf Klicks oder Hördauer;
- kein Autoplay, begrenzte Sitzungen, Privatsphäre und Weiterleitung zu echten Bezugspersonen;
- sichere, kindgerechte Antworten und geprüfte Reaktion auf Notlagen;
- damalige Hardwareannahme: Raspberry Pi 5 (4 GB), USB-Mikrofon und -Lautsprecher, zwei Tasten, Aufnahme-LED, physischer Mikrofon-Aus-Schalter, Netzbetrieb;
- Altersgruppe 6–10 war ausdrücklich vorläufig;
- die Domainaussage des Nutzers wurde aufgenommen, jedoch damals nicht im Registrar-Konto verifiziert.

### 2. Oktober 2026 – Auftrag zum Kanonentwurf

**Nutzer:** „Erstelle den ersten Entwurf für den 'Kunibert-Kanon' mit den wichtigsten Figuren und Regeln.“

**Assistent:** Kündigte an, die Originalgeschichte und die Dokumente aus dem Kunibert-Chat zu prüfen, damit der Kanon auf den vorhandenen Motiven aufbaut. Die Manus-Task-Abfrage war nicht verfügbar; aus dem geteilten Verlauf konnten jedoch drei Ursprungsdokumente heruntergeladen werden: erste Kunibert-Geschichte, Hörgeräte-Konzept und Hardware-Prototyp. Die erste Geschichte ist ausdrücklich als Entwurf nach Erinnerungen gekennzeichnet, nicht als wortgetreue Wiedergabe.

### 8. Oktober 2026 – Synchronisierung des Kanons mit GitHub

**Nutzer:** „synchronisiere mit der neuen aktuellen GitHub repo“

**Assistent:** Prüfte die freigegebenen Repositories und nahm `ritter-kunibert` als passendes Ziel. Das Repository wurde zu diesem Zeitpunkt zuletzt auf Commit `3bea794` aktualisiert. Es enthielt bereits die aktuelle Node.js-/TypeScript-Erzähl-Engine, `server-api/prompts.ts`, Sicherheitsregeln und die erste Kunibert-Geschichte.

**Arbeitsergebnis:**
- `docs/Kunibert-Kanon.md` als Entwurf v0.1 erstellt;
- Figuren: Kunibert, Wirtin, Kutscher, Hexe, Drache sowie Nebenfiguren;
- vertraute Orte, wiederkehrender Erzählbogen und Regeln zu Stimme, Variation, Kontinuität und Sicherheit beschrieben;
- nicht belegte Details ausdrücklich als offen markiert;
- README-Dokumentationsindex aktualisiert;
- `git diff --check` bestanden;
- Commit `877da85` (`docs: add first Kunibert canon draft`) auf den damaligen `main`-Branch gepusht.

**Assistent (Antwort):**

> Der erste Entwurf ist mit dem aktuellen `main`-Branch von [`makopipokam/ritter-kunibert`](https://github.com/makopipokam/ritter-kunibert) synchronisiert.
>
> - [Kunibert-Kanon v0.1 ansehen](</home/ubuntu/ritter-kunibert/docs/Kunibert-Kanon.md>)
> - Die README wurde um den Kanon ergänzt.
> - Commit: [`877da85` – docs: add first Kunibert canon draft](https://github.com/makopipokam/ritter-kunibert/commit/877da85)
>
> Der Entwurf beschreibt Kunibert, Wirtin, Kutscher, Hexe und Drache, die vertrauten Orte und Erzählregeln. Nicht belegte Details sind als offen markiert. `git diff --check` war erfolgreich; geändert wurde nur Dokumentation.

### 14. Oktober 2026 – Bitte um Gesprächsarchivierung

**Nutzer:** „lade den gesamten Inhalt dieser Konversation in den relevanten picastAi, Ritter Kunibert Ordner auf GitHub hoch, sodass sie von einer zukünftigen KI wieder benutzt werden kann.“

**Ergebnis dieser Bearbeitung:** Das Repository wurde erneut vom Remote synchronisiert. GitHub weist es nun als privates Repository `manuelpicard/picastAI.com` aus; `main` wurde per Fast-forward von `877da85` auf `d056334` aktualisiert. Die sieben neueren Remote-Commits enthalten u. a. die Umbenennung/Organisationsdokumentation und Arduino-GIGA-Firmware.

Dieser Kontext und der historische Produktentwurf werden in `docs/ai-context/` hinterlegt. Das Verzeichnis darf von zukünftigen KIs als Arbeitsgedächtnis genutzt werden, muss aber gegen aktuellen Quellcode und README geprüft werden.

## Domain- und Namenskontext (chronologisch, nicht gleichsetzen)

1. **2. Oktober:** Der Nutzer sagt ausdrücklich, dass ihm `picast.com` gehört. Der angepasste Produktentwurf übernimmt diese Aussage. Die damalige öffentliche Verkaufsseiten-/RDAP-Beobachtung war widersprüchlich; kein Kauf und keine Registraränderung wurden vorgenommen. Der damalige Bericht nannte als registriertes Ablaufdatum den 3. Januar 2027, dies ist nur eine historische Beobachtung und muss vor Nutzung verifiziert werden.
2. **2. Oktober:** Der gewünschte Eintrag in die Manus-Projektanweisung wurde nicht vorgenommen, weil die Bearbeitungsberechtigung fehlte.
3. **8. Oktober:** `picast.com` war im ersten Entwurf die Plattformadresse.
4. **14. Oktober:** Das aktuelle Repository beschreibt `picastAI.com` als kommerzielle Plattform und `manualAI.org` als Non-Profit-Struktur; `picast.de` höchstens als Weiterleitung.

Zukünftige KI soll die Eigentumsaussage nicht als verifiziert durch Dritte darstellen. Ebenso soll sie `picast.com` nicht ohne Rückfrage als aktuelle Hauptproduktdomain in Code/Dokumentation erzwingen, wenn der neueste Nutzerauftrag oder Repository-Stand stattdessen `picastAI.com` verwendet.

## Verknüpfte Projektdateien

- [`README.md`](../../README.md) – aktueller Projektüberblick; zuerst lesen.
- [`ORGANIZATION.md`](../../ORGANIZATION.md) – aktuelle Organisations- und Repository-Struktur.
- [`Kunibert-Kanon.md`](../Kunibert-Kanon.md) – Figuren- und Erzählregeln, Entwurf v0.1.
- [`server-api/prompts.ts`](../../server-api/prompts.ts) – implementierte Erzähl- und Antwortprompts (sofern dieser Pfad in der aktuellen Repo-Version existiert).
- [`Produktentwurf-Ritter-Kunibert-2026-10-02.md`](Produktentwurf-Ritter-Kunibert-2026-10-02.md) – vollständige historische Fassung der Produktbeschreibung.
- `docs/Ritter Kunibert und der Drache am Berg.md` – erste Geschichte nach Erinnerungen, nicht als Originaltranskript behandeln.
- `docs/picastAI-GIGA-API.md` und `firmware/arduino-giga/` – neuere Hardware-/API-Arbeit im aktuellen Repository.

## Hinweise für zukünftige KI-Sitzungen

- Vor Änderungen zuerst `git status --short --branch`, `git remote -v`, `git log -1 --oneline` prüfen und `git fetch origin` / Fast-forward-Synchronisierung ausführen.
- Dieses Archiv nicht als Ersatz für aktuelle Projektdateien verwenden. Besonders die Domain- und Hardwareannahmen im Produktentwurf sind historisch.
- Keine nicht bestätigten Details zu Kuniberts Aussehen, Alter, Familiengeschichte oder den Namen der Figuren erfinden und dann als Kanon eintragen.
- Vor einer inhaltlichen Erweiterung die offene Statusmarkierung von `docs/Kunibert-Kanon.md` beachten.
- Keine vertraulichen Zugangsdaten, Token, privaten Nutzungslinks oder System-/Entwicklerinstruktionen in den öffentlichen Projektdateien speichern. Das Repository war bei der Archivierung privat; Sichtbarkeit kann sich ändern.
