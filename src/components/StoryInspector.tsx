import React from 'react';
import { BookOpen, CheckCircle2, Compass, Bookmark, Clock, Sparkles } from 'lucide-react';

export interface StoryInspectorProps {
  storyState: any;
  onResetState: () => void;
}

export const StoryInspector: React.FC<StoryInspectorProps> = ({ storyState, onResetState }) => {
  const state = storyState || {
    v: 1,
    ep: 1,
    part: 0,
    target: 5,
    seed: '',
    summary: '',
    threads: '',
    hook: '',
    done: false,
  };

  const isOngoing = state.part > 0 && !state.done;
  const progressPercent = state.target ? Math.min(100, Math.round((state.part / state.target) * 100)) : 0;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
        <div className="flex items-center space-x-2.5">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-stone-100">Geschichtenstand (Flüchtiger RAM)</h3>
        </div>
        <button
          onClick={onResetState}
          className="text-xs text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 px-2.5 py-1 rounded-lg border border-stone-700 transition"
        >
          Zustand zurücksetzen
        </button>
      </div>

      <p className="text-xs text-stone-400 mb-4">
        Im Pi-Client liegt dieser Zustand im flüchtigen Arbeitsspeicher (<code className="text-amber-300">/dev/shm/kunibert.json</code>).
        Der Server speichert keine Geschichten auf der Festplatte.
      </p>

      {/* Progress & Chapter stats */}
      <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 mb-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-stone-300">
            Folge {state.ep} • {state.part > 0 ? `Teil ${state.part} von ${state.target}` : 'Noch keine Folge aktiv'}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
            state.done
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : isOngoing
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'bg-stone-800 text-stone-400'
          }`}>
            {state.done ? 'Folge beendet' : isOngoing ? 'Laufende Folge' : 'Bereit'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-stone-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Structured Details */}
      <div className="space-y-3 text-xs">
        {state.seed && (
          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-800/80">
            <span className="font-semibold text-amber-300 flex items-center gap-1 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Einstiegs-Impuls (Seed):
            </span>
            <p className="text-stone-300 italic">{state.seed}</p>
          </div>
        )}

        {state.summary && (
          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-800/80">
            <span className="font-semibold text-stone-300 flex items-center gap-1 mb-1">
              <Bookmark className="w-3.5 h-3.5 text-blue-400" />
              Bisherige Handlung (Summary):
            </span>
            <p className="text-stone-400 leading-relaxed">{state.summary}</p>
          </div>
        )}

        {state.threads && (
          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-800/80">
            <span className="font-semibold text-stone-300 flex items-center gap-1 mb-1">
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              Offene Fäden (werden bis zum Ende aufgelöst):
            </span>
            <p className="text-stone-400">{state.threads}</p>
          </div>
        )}

        {state.hook && !state.done && (
          <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-800/80">
            <span className="font-semibold text-stone-300 flex items-center gap-1 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Nächster Anknüpfungspunkt (Hook):
            </span>
            <p className="text-amber-200/90 font-serif italic">{state.hook}</p>
          </div>
        )}
      </div>

      {/* JSON Viewer Modal Trigger */}
      <div className="mt-4 pt-4 border-t border-stone-800">
        <details className="text-xs text-stone-400">
          <summary className="cursor-pointer hover:text-amber-300 transition select-none">
            Technisches JSON-Protokoll anzeigen
          </summary>
          <pre className="mt-2 p-3 bg-stone-950 rounded-lg border border-stone-800 overflow-x-auto text-[11px] text-stone-300 font-mono">
            {JSON.stringify(state, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
};
