import React from 'react';
import { Cpu, Lock, Shield, Server, HardDrive, Radio, CheckCircle } from 'lucide-react';

export const ArchitectureViewer: React.FC = () => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center space-x-3 border-b border-stone-800 pb-4">
        <div className="p-2.5 bg-blue-950/60 border border-blue-800/80 rounded-xl text-blue-400">
          <Cpu className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-100">System- &amp; Datenschutz-Architektur</h3>
          <p className="text-xs text-stone-400">
            Konsequent auf Kinderschutz, Privatsphäre und Zuverlässigkeit ausgelegt
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Hardware-Architektur */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
          <div className="flex items-center space-x-2 text-stone-200 font-bold">
            <Radio className="w-4 h-4 text-amber-400" />
            <span>Raspberry Pi Hardware-Pins (BCM)</span>
          </div>
          <ul className="space-y-2 text-stone-400">
            <li className="flex items-start gap-2">
              <span className="font-mono bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded border border-rose-800 text-[10px]">
                GPIO 5
              </span>
              <span><strong>Sprechtaste:</strong> Frage stellen (Push-to-Talk). Aufnahme max. 20–30 s, 16 kHz Mono PCM.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800 text-[10px]">
                GPIO 6
              </span>
              <span><strong>Erzähltaste:</strong> Neue Geschichte starten oder laufende Folge fortsetzen.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800 text-[10px]">
                GPIO 17
              </span>
              <span><strong>Status-LED:</strong> Aus (Bereit), Schnell blinkend (Aufnahme), Langsam pulsierend (Verarbeitung), Dauer-An (Wiedergabe).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800 text-[10px]">
                GPIO 22
              </span>
              <span><strong>Mikrofon-Aus:</strong> Physischer Schalter, der die Mikrofonaufnahme hardwarenah unterbricht.</span>
            </li>
          </ul>
        </div>

        {/* Datenschutz-Architektur */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
          <div className="flex items-center space-x-2 text-stone-200 font-bold">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Privatsphäre &amp; Datensparsamkeit</span>
          </div>
          <ul className="space-y-2 text-stone-400">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Keine Festplattenspeicherung:</strong> Audio liegt nur kurzzeitig im flüchtigen RAM (/dev/shm).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Einmaliger Audio-Abruf:</strong> Nach Abholung durch den Pi wird die WAV-Datei sofort vernichtet (TTL max. 120s).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Keine Transkript-Logs:</strong> Logs enthalten ausschließlich Dauer und Turn-Typ, niemals den Wortlaut des Kindes.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Deterministische Schutzweiche:</strong> Prüft Notlagen vor dem KI-Aufruf und spielt feste Nummern (112, 116 111) ab.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
