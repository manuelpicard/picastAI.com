import React from 'react';
import {
  Home,
  Compass,
  Trees,
  Mountain,
  CheckCircle,
  Clock,
  Sparkles,
  Shield,
  MapPin,
} from 'lucide-react';

export interface ChapterProgressMapProps {
  storyState: {
    ep: number;
    part: number;
    target: number;
    seed?: string;
    done?: boolean;
  };
}

const CHAPTER_DESCRIPTIONS = [
  {
    step: 1,
    name: 'Dachzimmer & Aufbruch',
    shortName: '1. Aufbruch',
    icon: Home,
    phase: 'Start',
    desc: 'Kunibert putzt seine Holzrüstung und bricht auf.',
  },
  {
    step: 2,
    name: 'Der Kutscher & die Brücke',
    shortName: '2. Weg & Brücke',
    icon: Compass,
    phase: 'Weg',
    desc: 'Pflastersteine, Hufgeklapper und die alte Steinbrücke.',
  },
  {
    step: 3,
    name: 'Der dichte Zauberwald',
    shortName: '3. Zauberwald',
    icon: Trees,
    phase: 'Mitte',
    desc: 'Geheimnisvolle Pfade, Kräuter und Moossteine.',
  },
  {
    step: 4,
    name: 'Der Drachenberg & die List',
    shortName: '4. Drachenberg',
    icon: Mountain,
    phase: 'Höhepunkt',
    desc: 'Keine Gewalt – Kunibert löst das Problem mit Grips.',
  },
  {
    step: 5,
    name: 'Heimkehr ins Dachzimmer',
    shortName: '5. Heimkehr',
    icon: Shield,
    phase: 'Finale',
    desc: 'Geborgenheit, dampfende Suppe und Ausruhen.',
  },
];

export const ChapterProgressMap: React.FC<ChapterProgressMapProps> = ({ storyState }) => {
  const currentPart = Math.max(0, storyState?.part || 0);
  const targetParts = Math.max(3, storyState?.target || 5);
  const isDone = Boolean(storyState?.done) || currentPart >= targetParts;
  const progressPercent = Math.min(100, Math.round((currentPart / targetParts) * 100));

  // Dynamische Daten für Recharts Balken-Diagramm
  const chartData = CHAPTER_DESCRIPTIONS.slice(0, targetParts).map((ch, idx) => {
    const chapterNum = idx + 1;
    const isCompleted = currentPart >= chapterNum;
    const isCurrent = currentPart === chapterNum && !isDone;

    return {
      name: ch.shortName,
      fullName: ch.name,
      phase: ch.phase,
      progress: isCompleted ? 100 : isCurrent ? 50 : 0,
      status: isCompleted ? 'Abgeschlossen' : isCurrent ? 'Aktives Kapitel' : 'Ausstehend',
      color: isCompleted ? '#10b981' : isCurrent ? '#f59e0b' : '#3f3f46',
    };
  });

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl text-stone-100 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-950/60 border border-amber-800 rounded-xl text-amber-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-stone-100 flex items-center gap-2">
              Kuniberts Reisekarte &amp; Kapitelfortschritt
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700">
                Folge {storyState?.ep || 1}
              </span>
            </h3>
            <p className="text-xs text-stone-400">
              5-teiliger Spannungsbogen (Dachzimmer → Kutscher → Wald → Berg/List → Heimkehr)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-semibold text-amber-300 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
            Teil {currentPart} / {targetParts} ({progressPercent}%)
          </span>
        </div>
      </div>

      {/* Visual Journey Nodes / Adventure Trail */}
      <div className="relative pt-2 pb-1">
        <div className="grid grid-cols-5 gap-2 relative">
          {/* Connector Line behind nodes */}
          <div className="absolute top-5 left-6 right-6 h-1 bg-stone-800 -z-0 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-amber-300 transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, ((currentPart - 0.5) / (targetParts - 1)) * 100))}%` }}
            />
          </div>

          {CHAPTER_DESCRIPTIONS.slice(0, targetParts).map((chapter, idx) => {
            const stepNum = idx + 1;
            const isCompleted = currentPart >= stepNum;
            const isCurrent = currentPart === stepNum && !isDone;
            const Icon = chapter.icon;

            return (
              <div key={chapter.step} className="flex flex-col items-center text-center relative z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-md ${
                    isCompleted
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 shadow-[0_0_12px_#10b981]'
                      : isCurrent
                      ? 'bg-amber-900/90 border-amber-400 text-amber-200 animate-pulse shadow-[0_0_14px_#f59e0b]'
                      : 'bg-stone-950 border-stone-700 text-stone-500'
                  }`}
                  title={`${chapter.name}: ${chapter.desc}`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="mt-2 space-y-0.5">
                  <span
                    className={`text-[11px] font-bold block truncate max-w-[85px] ${
                      isCompleted
                        ? 'text-emerald-400'
                        : isCurrent
                        ? 'text-amber-300 font-extrabold'
                        : 'text-stone-500'
                    }`}
                  >
                    {chapter.shortName}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider inline-block ${
                      isCompleted
                        ? 'bg-emerald-950/80 text-emerald-400'
                        : isCurrent
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'text-stone-600'
                    }`}
                  >
                    {isCompleted ? 'Erreicht' : isCurrent ? 'Jetzt' : 'Offen'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Native CSS bars avoid loading a charting library for this small visualization. */}
      <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span className="font-semibold text-stone-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Kapitel-Statusanzeige
          </span>
          <span className="text-[11px] font-mono text-stone-400">
            {isDone ? 'Folge abgeschlossen 🎉' : currentPart === 0 ? 'Noch nicht begonnen' : `Kapitel ${currentPart} aktiv`}
          </span>
        </div>

        <div className="h-28 w-full">
          <div className="flex h-full items-end justify-around gap-3" role="list" aria-label="Fortschritt je Kapitel">
            {chartData.map((entry) => (
              <div
                key={entry.name}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                role="listitem"
                aria-label={`${entry.fullName}: ${entry.status} (${entry.progress}%)`}
                title={`${entry.fullName} · Phase: ${entry.phase} · ${entry.status} (${entry.progress}%)`}
              >
                <span className="text-[9px] font-mono text-stone-500">{entry.progress}%</span>
                <div className="flex h-16 w-full max-w-12 items-end overflow-hidden rounded-t bg-stone-800">
                  {entry.progress > 0 && (
                    <div
                      className="w-full rounded-t transition-all"
                      style={{ height: `${entry.progress}%`, backgroundColor: entry.color }}
                    />
                  )}
                </div>
                <span className="w-full truncate text-center text-[9px] text-stone-500">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
