# Stromversorgungs-Architektur: Raspberry Pi Zero 2 W

Ein pragmatischer und robuster Architekturplan für die Stromversorgung von **Ritter Kunibert**:
- **Phase 1 (Prototyp)**: Reiner stationärer **5V USB-C Netzteilbetrieb** für verlässliche Software-, Audio- und Interaktionstests ohne Akkukomplikationen.
- **Phase 2 (Roadmap Serie)**: Erweiterung um einen **kompakten LiPo UPS-HAT** (PiSugar 3 / Waveshare Zero UPS) für den mobilen Kinderzimmer-Einsatz.

---

### Bestätigte Entscheidung für den Prototyp

> [!IMPORTANT]
> **Für den ersten Prototyp: Reiner 5V USB-C Netzteilbetrieb**
> Um die Entwicklungs- und Testphase maximal stabil, brandsicher und unkompliziert zu halten, wird der Raspberry Pi Zero 2 W stationär über ein standardmäßiges **5V / 2.0A–2.5A USB-C Netzteil** an einer Steckdose betrieben.
> 
> **Die Vorteile für die Prototyp-Phase:**
> 1. **Keine leeren Akkus**: Kontinuierliches Testen von Spracherkennung, Story-Synthese und Audio ohne Ladezyklen-Unterbrechung.
> 2. **Freier GPIO-Header**: Der 40-Pin Header steht ohne räumliche Kollision voll für den I2S Audio-HAT (WM8960 / ReSpeaker) und die Taster (GPIO 17, 27, 22, 23) zur Verfügung.
> 3. **Maximale Sicherheit im Labor**: Keine empfindlichen LiPo-Beutelzellen im offenen Breadboard-/Versuchsaufbau auf dem Schreibtisch.
> 4. **Stabile Spannungsversorgung**: Keine Spannungseinbrüche bei plötzlichen Lastspitzen der Audio-Verstärker-Endstufe.

---

## 1. Übersicht & Stromversorgungs-Phasen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 1: PROTOTYP (Tischbetrieb via Netzteil)                │
│                                                                             │
│   [5V / 2.0A–2.5A USB-C Netzteil]                                           │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Raspberry Pi Zero 2 W (Power Micro-USB / USB-C Adapter)             │   │
│   │                                                                     │   │
│   │ • 5.0V Versorgungsspannung direkt an Systembus                      │   │
│   │ • Keine Akku-Wartung, keine Ladeelektronik notwendig                │   │
│   │ • Header oben: 100% frei für Audio-HAT und Taster                   │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Audio-HAT & Taster (GPIO 17, 27, 22, 23)                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 2: ROADMAP SERIENGERÄT (Mobiler Akkubetrieb)          │
│                                                                             │
│   [USB-C Ladebuchse] ──> [PiSugar 3 / Waveshare UPS HAT] ──> [1200mAh LiPo] │
│                                  │ (5V Boost via Pogo-Pins)                 │
│                                  ▼                                          │
│                    [Raspberry Pi Zero 2 W + I2C Fuel Gauge]                 │
│                                  │                                          │
│                    [Safe-Shutdown Daemon bei < 5% Akku]                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technische Details: Phase 1 Netzteilbetrieb

| Eigenschaft | Spezifikation für Pi Zero 2 W |
| :--- | :--- |
| **Eingangsspannung** | 5,0 V bis 5,1 V Gleichspannung (DC) |
| **Empfohlene Stromstärke** | Mindestens 2,0 A (besser 2,5 A für Audio-HAT & Lautsprecher) |
| **Anschluss am Pi Zero 2 W** | Micro-USB PWR IN Buchse (oder USB-C Adapter) |
| **Leistungsaufnahme im Betrieb** | ca. 1,0 W bis 1,8 W (200 mA–360 mA bei voller Lautstärke) |
| **Schutz vor Datenverlust** | Da das Gerät am Netzteil läuft, empfiehlt sich ein standardmäßiges `read-only` Dateisystem oder der Befehl `sudo poweroff` vor dem Ziehen des Steckers. |

---

## 3. Web-Simulator & Dashboard Umsetzung

1. **Simulator-Anzeige (`src/components/DeviceSimulator.tsx`)**:
   - Die Status-Leiste signalisiert standardmäßig **Netzteil (5V)** aktiv.
   - Der Benutzer kann per Klick probehalber auf den Akku-Modus umschalten, um das Verhalten bei schwächer werdender Stromversorgung vorab zu simulieren.
2. **Architektur-Viewer (`src/components/ArchitectureViewer.tsx`)**:
   - Eigener Informationsblock zur Stromversorgung mit klarer Trennung zwischen Prototypen-Phase (Netzteil) und Roadmap (USV-HAT).
