import React from 'react';
import { Cpu, Lock, Shield, Server, HardDrive, Radio, CheckCircle, Terminal, Zap, Volume2, Wifi, Plug } from 'lucide-react';

export const ArchitectureViewer: React.FC = () => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-stone-100">Raspberry Pi 5 – Prototyp</h3>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                Endgerät später: ESP32-S3
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Erster Aufbau mit USB-Mikrofon und USB-Lautsprecher. Das Endgerät bekommt eine eigene Firmware (firmware/esp32-s3, Entwurf).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 bg-stone-950 border border-stone-800 text-stone-300 rounded-lg font-mono text-[11px]">
            Raspberry Pi OS Lite (64-Bit)
          </span>
          <span className="px-2.5 py-1 bg-amber-950/60 border border-amber-800 text-amber-300 rounded-lg font-mono text-[11px]">
            ALSA / USB-Audio
          </span>
        </div>
      </div>

      {/* Hauptgitter: Hardware-Pins & Datenschutz */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Hardware-Architektur Pi 5 (Prototyp) */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-stone-200 font-bold">
              <Radio className="w-4 h-4 text-rose-400" />
              <span>Pi 5 – GPIO-Belegung (BCM)</span>
            </div>
            <span className="text-[10px] font-mono text-stone-500">40-Pin Header</span>
          </div>

          <ul className="space-y-2.5 text-stone-400">
            <li className="flex items-start gap-2.5 bg-stone-900/60 p-2 rounded-lg border border-stone-800/80">
              <span className="font-mono bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800 text-[11px] font-bold shrink-0">
                GPIO 17
              </span>
              <div>
                <strong className="text-stone-200">Sprechtaste (Push-to-Talk):</strong>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Pin 11 nach GND mit internem <code className="text-amber-300">INPUT_PULLUP</code>. Aufnahme läuft nur, solange gedrückt (höchstens 15 s, 16 kHz, mono).
                </p>
              </div>
            </li>

            <li className="flex items-start gap-2.5 bg-stone-900/60 p-2 rounded-lg border border-stone-800/80">
              <span className="font-mono bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800 text-[11px] font-bold shrink-0">
                GPIO 27
              </span>
              <div>
                <strong className="text-stone-200">Erzähltaste (Kunibert-Geschichten):</strong>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Pin 13 nach GND mit internem <code className="text-amber-300">INPUT_PULLUP</code>. Startet eine neue 5-teilige Kunibert-Folge oder setzt das nächste Kapitel fort.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-2.5 bg-stone-900/60 p-2 rounded-lg border border-stone-800/80">
              <span className="font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800 text-[11px] font-bold shrink-0">
                GPIO 22
              </span>
              <div>
                <strong className="text-stone-200">Mikrofon-Aus (Hardware-Sense &amp; Trennung):</strong>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Pin 15, Schalter nach GND. Der Client nimmt dann nicht auf und verwirft eine laufende Aufnahme. Im ersten Aufbau noch nicht verbaut.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-2.5 bg-stone-900/60 p-2 rounded-lg border border-stone-800/80">
              <span className="font-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 text-[11px] font-bold shrink-0">
                GPIO 23
              </span>
              <div>
                <strong className="text-stone-200">Status-LED:</strong>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Pin 16 über 330 Ω nach GND. Dauerlicht: bereit. Schnelles Blinken: Aufnahme. Langsames Blinken: Kunibert arbeitet oder spricht. Sehr schnelles Blinken: Fehler. Doppelblitz: Mikrofon aus.
                </p>
              </div>
            </li>
          </ul>
        </div>

        {/* Datenschutz- & Audio-Architektur */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-stone-200 font-bold">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Privatsphäre &amp; Audio-Hygiene</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              Zero-Disk Storage
            </span>
          </div>

          <ul className="space-y-2 text-stone-400">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-stone-200">Keine Speicherung auf der Speicherkarte:</strong> Aufnahme und Antwort liegen beim Client nur im Arbeitsspeicher und werden nie in Dateien geschrieben.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-stone-200">Einmaliger Server-Abruf:</strong> Der API-Server liefert die erzeugte Antwort genau einmal an den Pi aus. Danach wird der RAM-Buffer mit maximal 120s TTL gelöscht.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-stone-200">Keine Sprach-Mitschnitte in der Cloud:</strong> Weder Firestore noch der Server speichern private Stimmaufnahmen oder vollständige Frage-Transkripte der Kinder.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-stone-200">Feste Sicherheitsweiche:</strong> Erkannte Notlagen (feste Muster, vor jedem Sprachmodell) bekommen einen festen Hinweis mit 112 und 116 111. Was die Muster nicht erkennen, beurteilt das Sprachmodell.
              </span>
            </li>
          </ul>

          <div className="pt-2 border-t border-stone-850">
            <div className="bg-stone-900/80 p-2.5 rounded-lg border border-stone-800 text-[11px] text-stone-400">
              <span className="text-amber-300 font-semibold">Ton:</span> Erster Aufbau mit getrenntem USB-Mikrofon und USB-Lautsprecher (einzeln wählbar). I2S-HATs sind möglich, aber nicht getestet.
            </div>
          </div>
        </div>
      </div>

      {/* Stromversorgungs-Architektur (Prototyp vs. Serie) */}
      <div className="bg-stone-950 p-4 rounded-xl border border-stone-850 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider flex items-center gap-2">
            <Plug className="w-4 h-4 text-amber-400" />
            Stromversorgung: 5V USB-C Netzteilbetrieb (Prototyp-Phase)
          </h4>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            Stationärer Tischbetrieb
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-2">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-amber-400" />
              Phase 1: Reiner 5V USB-C Netzteilbetrieb
            </span>
            <p className="text-[11px] text-stone-300 leading-relaxed">
              Für die Erprobung von Software, Ton und Spracherkennung läuft der Pi 5 am offiziellen <strong>27-W-USB-C-Netzteil</strong>.
            </p>
            <ul className="space-y-1 text-[11px] text-stone-400">
              <li>• Keine leeren Akkus oder unvorhersehbare Spannungseinbrüche beim Testen.</li>
              <li>• Maximale Sicherheit: Kein Risiko durch überhitzende LiPo-Zellen im Bastelaufbau.</li>
              <li>• Der 40-Pin-Header bleibt frei für Taster und LED.</li>
              <li>• Stabile Spannungsversorgung auch bei Leistungsspitzen des Audio-Verstärkers.</li>
            </ul>
          </div>

          <div className="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-2">
            <span className="font-bold text-stone-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-stone-400" />
              Phase 2: Endgerät mit ESP32-S3
            </span>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Das Seriengerät wird ein <strong>ESP32-S3</strong> mit eigener Firmware (<code className="text-stone-300">firmware/esp32-s3</code>, Entwurf, auf keinem Gerät gelaufen). Board, Akku und Gehäuse sind offen.
            </p>
            <ul className="space-y-1 text-[11px] text-stone-500">
              <li>• Gleiche Schnittstelle wie der Pi (docs/picastAI-Pi-API.md).</li>
              <li>• Gleiche Zustände, LED-Muster und Fehlerregeln wie der Pi-Client.</li>
              <li>• Einrichtung ohne Kabel und Update über Funk: geplant (Stufe M6).</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Warum der Pi 5 für den Prototyp? */}
      <div className="bg-stone-950 p-4 rounded-xl border border-stone-850 space-y-3">
        <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Warum der Pi 5 für den Prototyp
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-1">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Echte TLS-Zertifikate
            </span>
            <p className="text-[11px] text-stone-400">
              Natives Linux-Zertifikatsmanagement via ca-certificates. Keine fehleranfälligen manuellen CA-Flashvorgänge wie bei Mikrocontrollern.
            </p>
          </div>

          <div className="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-1">
            <span className="font-bold text-emerald-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              Reife ALSA-Audiostack
            </span>
            <p className="text-[11px] text-stone-400">
              Hardware-Mixer, sauberes PCM-Resampling und robuste Pufferung verhindern Knackser, Latenzen oder DAC-Clipping.
            </p>
          </div>

          <div className="bg-stone-900/60 p-3 rounded-lg border border-stone-800 space-y-1">
            <span className="font-bold text-blue-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              systemd Service-Daemon
            </span>
            <p className="text-[11px] text-stone-400">
              <code className="text-stone-300">kunibert.service</code> startet automatisch beim Einschalten und fängt Verbindungsabbrüche mit automatischem Reconnect ab.
            </p>
          </div>
        </div>
      </div>

      {/* Pi Client Installationsbefehl Box */}
      <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-200 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-stone-400" />
            Einrichtung auf dem Raspberry Pi 5:
          </span>
          <span className="text-[10px] font-mono text-stone-500">Idempotenter Installer</span>
        </div>
        <pre className="font-mono text-[11px] bg-stone-900 text-stone-300 p-2.5 rounded-lg border border-stone-800 overflow-x-auto select-all">
sudo bash pi-client/install_raspberry_pi.sh --api-url https://dein-host.example --device-id prototype-001 --api-token 'TOKEN_AUS_DASHBOARD'
        </pre>
        <p className="text-[11px] text-stone-500">
          Richtet Python 3, venv, Audio-Einstellungen, Systembenutzer und <code className="text-stone-400">/etc/systemd/system/kunibert.service</code> ein (Anleitung: pi-client/README.md).
        </p>
      </div>
    </div>
  );
};

