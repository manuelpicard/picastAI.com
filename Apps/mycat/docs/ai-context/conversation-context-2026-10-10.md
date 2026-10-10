# KI-Kontext: myCat-Projekt und bisherige Konversation

**Erstellt:** 2026-10-10  
**Projekt:** `yumiaura/myCat`  
**Repository:** <https://github.com/yumiaura/myCat>  
**Ablage:** `docs/ai-context/conversation-context-2026-10-10.md`

## Zweck

Diese Datei hält den für zukünftige KI-Arbeit relevanten Projekt- und Gesprächskontext fest. Sie enthält den sichtbaren Verlauf, wichtige Entscheidungen, Prüfergebnisse und den aktuellen Arbeitsstand. Interne Systemanweisungen, geheime Zugangsdaten sowie interne Tool-/Ausführungsmetadaten werden bewusst nicht gespeichert.

## Aktueller Projektstand

- Lokaler Projektordner: `/home/ubuntu/mycat`
- Hauptbranch: `main`
- Remote: `https://github.com/yumiaura/myCat.git`
- Zum Zeitpunkt der letzten Synchronisierung: Commit `286e167` (`Merge pull request #148 from yumiaura/docs/homebrew-installation`)
- Das Repository ist eine Python-/Qt-Desktop-App namens **Desktop Cat: QT Overlay**.
- Unterstützte Plattformen laut Projektbeschreibung: Windows, macOS und Linux.
- Wichtige Funktionen: animierte Desktop-Katze, mehrere Sprachen, LLM-Chat, Erinnerungen, GitHub-Integration, Aktivitäts-Tracking und KI-basierte Erstellung eigener Charaktere.
- Lokale, nicht versionierte Datei: `code-quality-review.html` (HTML-Übersicht der Code-Qualitätsprüfung).

## Wichtige Prüfresultate

Die Code-Qualitätsprüfung wurde im Oktober 2026 durchgeführt:

- **316/316 Tests bestanden**, nachdem die optionalen Kalender-Abhängigkeiten `icalendar` und `recurring-ical-events` installiert wurden.
- Python-Syntaxprüfung mit `compileall`: erfolgreich.
- Ruff-Linting: keine Fehler.
- Ruff-Formatprüfung: 27 Dateien würden formatiert werden.
- Bandit: 0 High-, 13 Medium- und 45 Low-Severity-Hinweise.
- pip-audit meldete nur Probleme mit `pip 24.0` in der temporären Prüfungsumgebung; `pip` ist keine Projekt-Laufzeitabhängigkeit.

### Wichtigste Empfehlungen

1. Größenlimit für Vorschau-Downloads in `mycat/shop_api.py:231` einführen; derzeit wird die gesamte Antwort mit `response.read()` in den Speicher geladen.
2. Größenlimit für ICS-Kalenderfeeds in `mycat/calendar_ics.py:177` einführen; auch dort wird die vollständige Antwort ohne Limit eingelesen.
3. URL-Schemata zentral validieren. Relevante Bereiche sind AI-Backends, Kalender, LLM-Backends, Shop und Updater. Nur `http://` und `https://` sollten zugelassen werden; `webcal://` sollte gezielt in HTTPS umgewandelt werden.
4. Tests für `mycat/shop_api.py` ergänzen: ETag-/Cache-Verhalten, SHA-256, Größenlimit, beschädigte ZIPs, Redirects, Vorschauen und Netzwerkfehler.
5. Ruff-Formatierung ausführen und `ruff format --check` in CI aufnehmen.
6. Bewusst erwartbare Bandit-Hinweise dokumentieren; breite `except Exception: pass`-Blöcke dort verengen, wo dies ohne Funktionsverlust möglich ist.

## Sichtbarer Gesprächsverlauf

### 2026-10-03 – Repository suchen und übertragen

**Nutzer:** Überprüfe GitHub auf die App "mycat" und übertrage sie hier in diese Aufgabe.

**Assistent:** GitHub wurde durchsucht. Es gab mehrere Treffer. Der exakte Namens-Treffer war `yumiaura/myCat` mit der Beschreibung „Desktop Cat: QT Overlay“. Das Repository wurde nach `/home/ubuntu/mycat` geklont.

Ergebnis:

- Repository: [`yumiaura/myCat`](https://github.com/yumiaura/myCat)
- Lokaler Projektordner: `/home/ubuntu/mycat`
- Branch: `main`
- Commit beim Klonen: `286e167`
- 142 versionierte Dateien

### 2026-10-05 – Code-Qualitätsprüfung

**Nutzer:** Führe eine Code-Qualitätsprüfung durch und suche nach potenziellen Verbesserungen oder Bugs.

**Assistent:** Das Repository wurde geprüft. Die Syntaxprüfung war erfolgreich. In einer separaten Prüfungsumgebung wurden die Entwicklungswerkzeuge installiert.

Zwischenergebnis vor Installation des Kalender-Extras:

- 313 Tests bestanden
- 3 Kalender-Tests fehlgeschlagen, weil `icalendar` und `recurring-ical-events` fehlten

Nach Installation der optionalen Kalender-Abhängigkeiten:

- **316 Tests bestanden**
- Ruff-Linting ohne Fehler
- Formatprüfung mit 27 nicht formatierten Dateien
- Bandit ohne High-Severity-Befunde

Festgestellte Verbesserungsbereiche:

- unbegrenzte Vorschau- und ICS-Downloads
- fehlende zentrale URL-Schema-Validierung
- fehlende dedizierte Shop-API-Tests
- uneinheitliche Ruff-Formatierung

Es wurden zu diesem Zeitpunkt keine Änderungen am Quellcode vorgenommen.

### 2026-10-05 – HTML-Bericht

**Nutzer:** Erstelle eine kompakte HTML-Übersicht der Code-Qualitätsprüfung mit allen Fundstellen und Empfehlungen.

**Assistent:** Die Datei wurde erstellt und verifiziert:

- `code-quality-review.html`
- Enthält Testergebnisse, priorisierte Fundstellen, Bandit-Fundstellen, Empfehlungen und Gesamturteil.
- Die Datei ist aktuell lokal vorhanden und nicht versioniert.

### 2026-10-08 – Synchronisierung mit GitHub

**Nutzer:** synchronisiere mit der neuen aktuellen GitHub repo

**Assistent:** Das konfigurierte Remote war `https://github.com/yumiaura/myCat.git`. Der lokale Branch `main` wurde mit `origin/main` verglichen und per `git fetch` geprüft. Ergebnis: bereits aktuell, keine neuen Commits.

Zusätzlich wurde ein Remote-Zweig `origin/codex/contribution-templates` gefunden. Der lokale Stand blieb bei Commit `286e167`.

**Nutzer:** ich meine mit dem Apps/mycat

**Assistent:** Es wurde geprüft, ob ein Ordner `Apps/mycat` existiert. In der aktuellen Sandbox wurde kein solcher Ordner gefunden. Vorhanden war nur `/home/ubuntu/mycat`. Auch eine GitHub-Suche nach Repositories mit `Apps mycat` ergab keinen Treffer. Für eine Synchronisierung eines anderen Projekts wären dessen absoluter Pfad oder GitHub-Repository-Name nötig.

### 2026-10-10 – Kontextablage

**Nutzer:** lade den gesamten Inhalt dieser Konversation in einen relevanten Ordner auf GitHub hoch, sodass sie von einer zukünftigen KI wieder benutzt werden kann.

**Assistent:** Dieser Kontext wird in `docs/ai-context/` des relevanten Repositories `yumiaura/myCat` abgelegt. Die Datei enthält den sichtbaren Gesprächsverlauf und projektbezogene Erkenntnisse. Interne Systemanweisungen, geheime Daten sowie interne Tool-/Ausführungsdetails werden nicht übernommen.

## Hinweise für zukünftige KI-Aufgaben

- Vor Änderungen zuerst `git status --short --branch`, `git remote -v` und den aktuellen Commit prüfen.
- Den aktuellen GitHub-Stand mit `git fetch origin` und möglichst `git merge --ff-only origin/main` synchronisieren.
- Die lokale Datei `code-quality-review.html` nicht ungefragt löschen oder überschreiben.
- Änderungen am Quellcode nur nach ausdrücklichem Auftrag durchführen.
- Bei externen Downloads stets Größenlimits, URL-Schema-Validierung, Timeout und atomisches Schreiben berücksichtigen.
- Bei Kalender-Tests die optionale Abhängigkeit installieren: `pip install 'icalendar>=6' 'recurring-ical-events>=3'`.
- Relevante Tests nach Änderungen mit `QT_QPA_PLATFORM=offscreen pytest -q` ausführen.
