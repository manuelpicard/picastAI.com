# Erzählerschmiede — Browser-Prototyp

Ein eigenständiger Browser-Prototyp für Sprache, Kunibert-Geschichten und lokale Erzählerprofile. Er liegt absichtlich in `demo/erzaehlerschmiede/`; die bestehenden Pi-Hardwaredateien und der Vertrag der Geräte-API bleiben unberührt.

## Funktionen

- Sprach-Eingabe per Klick über die Web Speech API; die erkannte Transkription bleibt vor dem Absenden bearbeitbar.
- Antwort wird über die lokale Browser-Sprachausgabe vorgelesen; keine Papa-Stimmenkopie.
- Plaudern, Geschichtenerzählen und geführte Erzählerschmiede.
- Auswählbares „Papa OG“-Startprofil mit Kunibert-Welt und vorhandenem Projekt-Stilrahmen. **Das Repository enthält keine Papa-Dialoge; das Startprofil ist nicht aus echten Interaktionen mit Papa trainiert und rekonstruiert seinen Originalstil nicht.**
- Eigene Erzählerprofile; nur ausdrücklich freigegebene Textbeispiele und Korrekturen wirken als Stilkontext.
- Gesprächsverlauf, Profile, Beispiele und Feedback bleiben im `localStorage` des jeweiligen Browsers; Export und vollständiges Löschen sind enthalten.
- Stilpaket-Export/-Import überträgt nur den ausgewählten Profilstil und ausdrücklich freigegebene Beispiele zwischen Browsern. Ein vollständiges Backup enthält zusätzlich lokale Chats und Feedback.
- Die kurze Projekt- und Papa-Rollen-Erklärung ist als `public/papa.html` direkt teilbar.
- Die Nachricht und höchstens acht vorherige Gesprächsbeiträge sowie bis zu fünf freigegebene Beispiele werden zur Antwortgenerierung an den Modellserver gesendet. Es gibt keine Speicherung des persönlichen Lernstands auf dem Server.

## Voraussetzungen

- Node.js 20 oder neuer (keine zusätzlichen npm-Pakete nötig).
- Ein OpenAI-kompatibler Chat-Completions-Zugang. Der gewählte Prototyp-Standard ist `gpt-5-mini`.
- `OPENAI_API_KEY` und optional `OPENAI_API_BASE` nur lokal als Umgebungsvariablen setzen. Schlüssel niemals in Dateien eintragen oder committen.
- `DEMO_TOKEN` setzen; ohne Code sind Chat-Endpunkte gesperrt.

## Start

```bash
cd demo/erzaehlerschmiede
export OPENAI_API_BASE="https://api.openai.com/v1"  # nur falls eigener Provider
export OPENAI_API_KEY="…"                          # lokal aus sicherer Umgebung
export MODEL="gpt-5-mini"
export DEMO_TOKEN="$(openssl rand -hex 16)"
node server.mjs
```

Öffne `http://localhost:4173`, gib `DEMO_TOKEN` als Vorschau-Code ein und wähle einen Erzähler. Standardmäßig bindet der Server nur an `127.0.0.1`. Für eine kontrollierte Vorschau über einen Reverse Proxy kann `HOST=0.0.0.0` gesetzt werden; verwende dafür einen privaten Vorschau-Code und teile die URL nur gezielt.

## Datenschutz und Grenzen

- Audio wird von der App nicht aufgezeichnet oder gespeichert. Die browserabhängige Spracherkennung kann Audio an den jeweiligen Browserdienst senden; alternativ kann die Eingabe getippt werden.
- Text, den du absendest, geht für die Antwort an den Modellserver. Profile und Lernstände werden nicht mitgesendet oder serverseitig abgelegt; der ausgewählte Stil und die für eine Antwort benötigten Beispiele werden als Prompt-Kontext übertragen. Der Stilpaket-Transfer erfolgt lokal über eine Datei und sendet nichts an den Server.
- Stilübernahme beruht auf freigegebenen Textbeispielen als Prompt-Kontext, **nicht auf Fine-Tuning**. Nutzer müssen Papa-Beispiele ausdrücklich freigeben.
- Der Bot ist nicht Papa, behauptet keine authentische Rekonstruktion und imitiert keine echte menschliche Stimme.
- Der Prototyp ist noch kein fertiges, unbeaufsichtigt nutzbares Kinderprodukt.

## API

Der Demo-Server stellt nur `/api/health`, `/api/session`, `/api/unlock` und `/api/chat` für den Browser-Prototyp bereit. Er ändert oder ersetzt keine vorhandenen `/v1/turn`-Geräte-Endpunkte.
