# Erzählerschmiede — Browser-Prototyp

Ein eigenständiger Browser-Prototyp für Sprache, Kunibert-Geschichten und lokale Erzählerprofile. Er liegt absichtlich in `demo/erzaehlerschmiede/`; die bestehenden Pi-Hardwaredateien und der Vertrag der Geräte-API bleiben unberührt.

## Funktionen

- Sprach-Eingabe per Klick über die Web Speech API; die erkannte Transkription bleibt vor dem Absenden bearbeitbar.
- Antwort wird über die lokale Browser-Sprachausgabe vorgelesen; keine Papa-Stimmenkopie.
- Plaudern, Geschichtenerzählen und geführte Erzählerschmiede.
- Auswählbares „Papa – Originalerzähler“-Profil: Papa bewertet die von der KI erzeugten Geschichten und gibt Rückmeldungen. **Er muss nicht selbst erzählen oder Textbeispiele liefern.**
- „Gut gelungen“-Bewertungen und kurze Verbesserungshinweise werden lokal gespeichert; die letzten fünf Notizen können als Prompt-Kontext künftige Geschichten beeinflussen.
- Eigene Erzählerprofile; bei persönlichen Profilen können ausdrücklich freigegebene Textbeispiele und Korrekturen als Stilkontext dienen.
- Gesprächsverlauf, Profile, Beispiele und Feedback bleiben im `localStorage` des jeweiligen Browsers; Export und vollständiges Löschen sind enthalten.
- Für Papa exportiert ein separates Feedback-Paket nur Bewertungen und Kommentare, nicht Chats oder KI-Geschichten. Stilpaket-Export/-Import bleibt für persönliche Erzählerprofile verfügbar.
- Die kurze Projekt- und Papa-Rollen-Erklärung ist als `public/papa.html` direkt teilbar.
- Die Nachricht, höchstens acht vorherige Gesprächsbeiträge und höchstens fünf kurze Bewertungsnotizen werden zur Antwortgenerierung an den Modellserver gesendet. Es gibt keine Speicherung des persönlichen Lernstands auf dem Server.

## Voraussetzungen

- Node.js 20 oder neuer (keine zusätzlichen npm-Pakete nötig).
- Ein OpenAI-kompatibler Chat-Completions-Zugang. Der gewählte Prototyp-Standard ist `gpt-5-mini`.
- Für GPT-5 ist `reasoning.effort=minimal` gesetzt, damit das Antwortbudget für den sichtbaren Erzähltext reicht.
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
- Text, den du absendest, geht für die Antwort an den Modellserver. Profile und Lernstände werden nicht serverseitig abgelegt; bis zu fünf kurze Bewertungsnotizen werden als Prompt-Kontext übertragen. Der Feedback-Export enthält nur Bewertungen und Kommentare, keine Chats oder KI-Geschichten.
- Papas Bewertungen wirken als Prompt-Kontext, **nicht durch Fine-Tuning**. Papa muss keine eigenen Geschichten erzählen oder Beispiele freigeben.
- Der Bot ist nicht Papa, behauptet keine authentische Rekonstruktion und imitiert keine echte menschliche Stimme.
- Der Prototyp ist noch kein fertiges, unbeaufsichtigt nutzbares Kinderprodukt.

## API

Der Demo-Server stellt nur `/api/health`, `/api/session`, `/api/unlock` und `/api/chat` für den Browser-Prototyp bereit. Er ändert oder ersetzt keine vorhandenen `/v1/turn`-Geräte-Endpunkte.
