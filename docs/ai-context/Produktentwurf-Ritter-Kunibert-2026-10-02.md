# picast.com – Produkt 1: Ritter Kunibert

**Stand:** 2. Oktober 2026 (aktualisiert: Domain) · **Quelle:** Chat „Ritter Kunibert“ im Manus-Projekt „Kinderbücher“ (interner Task-Link nicht archiviert) · **Status:** Konzept, noch nichts gebaut · **Domain:** picast.com gehört dem Gründer

> **picast-Grundidee:** Eine Streaming-Plattform, die dir nicht vorschlägt, was du willst, sondern was du brauchst – kurative Kuration.

## 1. Das Produkt in einem Satz

Ein **kleines Hörgerät ohne Bildschirm** für Kinder. Es hört auf Knopfdruck zu, beantwortet Fragen und erzählt immer neue Geschichten von **Ritter Kunibert**. Die Geschichten gehen auf die spontanen Erzählungen zurück, die der Vater des Gründers früher erfunden hat. Gedacht ist das Gerät für Kinder, die solche Erzählungen zu Hause nicht bekommen. **Alle Inhalte und die gesamte Intelligenz kommen über picast.com.**

Damit ist die offene Frage aus dem Kunibert-Chat beantwortet: picast.com ist **kein bestehender Fremddienst**, sondern die **eigene Plattform**, die wir aufbauen. Die Domain gehört dem Gründer. Das Gerät ist der erste Weg, über den die Plattform Inhalte ausliefert.

## 2. Warum gerade dieses Produkt zu picast passt

Kinder-Audio ist der Bereich, in dem der Unterschied zwischen *wollen* und *brauchen* am deutlichsten wird. Ein Kind *will* oft „noch eine“. Es *braucht* aber eine Geschichte, die zur Stimmung des Tages passt, ein Ende hat und es zur Ruhe bringt.

Die Kunibert-Geschichte vom Vater enthält diese Bedürfnisse schon. Sie sind kein nachträglich aufgesetztes Pädagogik-Thema:

| Element der Originalgeschichte | Was ein Kind daraus mitnimmt | Wann die Kuration es auswählt |
| --- | --- | --- |
| Kunibert verliert immer wieder gegen den Drachen und versucht es erneut | Scheitern ist kein Ende; Durchhalten | Das Kind erzählt von einem Misserfolg oder Frust |
| Nach der Niederlage geht er ins Gasthaus, isst etwas und schläft | Selbstfürsorge; Erholung ist erlaubt | Das Kind ist erschöpft, traurig oder gekränkt |
| Er bezahlt den Kutscher, obwohl der kein Geld will | Großzügigkeit, Dankbarkeit | Gespräche über Teilen, Freundschaft, Fairness |
| Die Hexe ist undurchschaubar und ihr Gebräu bleibt unklar | Nicht jeder Rat ist eindeutig gut; selbst nachdenken | Ältere Kinder, Fragen nach „Wem kann ich glauben?“ |
| Der Sieg gelingt durch eine List: nicht in die Höhle gehen | Klugheit statt Gewalt; den Blickwinkel ändern | Das Kind steckt bei einem Problem fest |
| Er erwacht wieder im Dachzimmer | Wiederkehr, Geborgenheit, ein ruhiges Ende | Schlafenszeit; jede Geschichte endet so |

Die **Kurationsschicht von picast** wählt also nicht nach Klickrate oder Hördauer aus. Sie entscheidet nach **Situation und Bedürfnis**. Kunibert ist das erste Erzähluniversum, an dem wir das ausprobieren.

## 3. Regeln für die Kuration (Version 1)

1. **Kein Autoplay und keine Endlosschleife.** Jede Geschichte hat ein Ende. Abends endet sie im Dachzimmer und kündigt den Schlaf an.
2. **Die Tageszeit bestimmt die Form:** Tagsüber darf eine Geschichte länger und spannender sein, abends ist sie kürzer, ruhiger und hat weniger Drache.
3. **Das Bedürfnis vor dem Wunsch erkennen:** Wenn das Kind etwas sagt, bevor es eine Geschichte möchte („Heute hat keiner mit mir gespielt“), richtet sich danach die Wahl des Themas.
4. **Begrenzte Sitzungen:** Ab einer bestimmten Zahl von Geschichten schlägt das Gerät freundlich eine Pause vor. Die Grenze legen die Eltern fest; ohne Einstellung gilt eine Voreinstellung.
5. **Zu echten Menschen hinführen:** Das Gerät verweist auf Bezugspersonen, zum Beispiel: „Das könntest du morgen deiner Lehrerin erzählen.“ Es behauptet nie, der Papa des Kindes zu sein, und ahmt ohne Einwilligung keine echte Stimme nach.
6. **Notfälle haben Vorrang vor der Geschichte:** Spricht ein Kind über Gefahr, Missbrauch oder Selbstverletzung, gibt es keine Fantasiegeschichte. Das Gerät verweist dann ruhig auf echte Hilfe. Diese Antworten müssen fachlich geprüft sein.
7. **Was wir messen:** Nicht die Nutzungsdauer. Wichtig ist, ob Sitzungen von selbst ruhig enden und was Eltern zurückmelden. Dafür gibt es keine Überwachung und keine gespeicherten Kinderstimmen.

## 4. Was picast.com dafür technisch leisten muss

```text
Kunibert-Gerät (Raspberry-Pi-Prototyp: Taste, Mikrofon, Lautsprecher)
   │  verschlüsselt (HTTPS), Gerät meldet sich mit Geräteschlüssel an
   ▼
picast.com – Plattform
   ├─ Geräte-Zugang          Anmeldung, Sitzung, Verbindungsfehler
   ├─ Sprache → Text         Frage des Kindes verstehen
   ├─ Kurationsschicht       Bedürfnis, Tageszeit, Sitzungslänge, Notfall-Erkennung
   ├─ Erzähl-Engine          Kunibert-Kanon + Sprachmodell → Antwort oder Geschichte
   ├─ Sicherheitsfilter      Altersgerecht? Notfallregeln eingehalten?
   ├─ Text → Sprache         eigene warme Erzählerstimme → wird zum Gerät gestreamt
   └─ Eltern-Bereich (Web)   Einrichtung, Zeitgrenzen, Rückmeldung, Datenschutz
```

Die Kurationsschicht und der Eltern-Bereich gehören fest zu picast und lassen sich **wiederverwenden**. Kunibert-Kanon, Erzählerstimme und Gerät sind die **produktspezifischen** Bausteine. Spätere picast-Produkte, etwa für Erwachsene, können dieselbe Kurationsschicht mit anderen Inhalten nutzen.

Die Hardware für den ersten Tisch-Prototyp ist im Kunibert-Chat schon zusammengestellt: Raspberry Pi 5 (4 GB), USB-Mikrofon, USB-Lautsprecher, zwei große Tasten, Aufnahme-LED, ein echter Mikrofon-Aus-Schalter und Netzbetrieb.

**Domain:** picast.com gehört dem Gründer. Ein Kauf und die Suche nach anderen Domain-Namen entfallen. Gerät und Eltern-Bereich erreichen die Plattform von Anfang an unter ihrer festen Adresse, zum Beispiel `api.picast.com` für die Geräte und `picast.com` für den Eltern-Bereich. Eine vorläufige Adresse ist nicht nötig.

## 5. Offene Entscheidungen

| Thema | Stand | Warum es wichtig ist |
| --- | --- | --- |
| **Altersgruppe** | Vorläufig angenommen: 6–10 Jahre. Die Frage „4–6 oder 7–10?“ ist im Kunibert-Chat noch offen. | Davon hängen Sprache, Länge der Geschichten, wie viel Drache es gibt und die Schutzregeln ab. |
| **Erzählerstimme** | Eine eigene Stimme; keine Nachahmung des Vaters ohne dessen Einwilligung | Vertrauen und Rechtslage |
| **Geschäftsmodell** | Offen | Werbung oder Modelle, die an Nutzungsdauer verdienen, widersprechen der Kurations-Idee. Passender wären Gerätekauf plus ein Abo ohne Anreize, das Kind länger zu binden. |
| **Recht und Sicherheit** | Noch nicht geprüft | Einwilligung der Eltern (DSGVO), Hinweis, dass eine KI spricht, Sicherheit von Spielzeug und Elektrik – das muss fachlich geprüft sein, bevor Kinder das Gerät benutzen. |

## 6. Nächste Schritte

1. **Domain einrichten:** Im eigenen Registrar-Konto prüfen, ob picast.com dort geführt wird. Die automatische Verlängerung einschalten, denn die aktuelle Registrierung läuft laut Registry am **3. Januar 2027** ab. Sobald der picast-Kern läuft, die DNS-Einträge auf den eigenen Server setzen.
2. **Den „Kunibert-Kanon“ schreiben:** die Welt, die Figuren und feste Orte, Regeln für Variationen und die Zuordnung von Bedürfnissen zu Story-Elementen aus Abschnitt 2. Das ist die inhaltliche Grundlage der Erzähl-Engine.
3. **picast-Kern v0 bauen:** ein schlanker Server mit drei Funktionen (*Frage beantworten*, *Geschichte erzählen*, *Sitzung beenden*). Dazu kommt ein **Browser-Simulator** mit Sprechtaste, damit man das Erlebnis schon vor der Hardware testen kann.
4. **Tisch-Prototyp bauen** nach der Teileliste aus dem Kunibert-Chat und an den picast-Kern anbinden.
5. **Mit Erwachsenen testen**, danach Datenschutz- und Sicherheitsprüfung. Erst dann folgen begleitete Tests mit Kindern und Einwilligung der Eltern.
