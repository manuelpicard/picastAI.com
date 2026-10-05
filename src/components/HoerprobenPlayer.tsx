import React, { useState } from 'react';
import { Headphones, Play, Pause, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';

export const HoerprobenPlayer: React.FC = () => {
  const [activeTrack, setActiveTrack] = useState<string>('folge');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center space-x-3 border-b border-stone-800 pb-4">
        <div className="p-2.5 bg-purple-950/60 border border-purple-800/80 rounded-xl text-purple-400">
          <Headphones className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
            Original-Hörproben aus dem echten Prototyp
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-mono">
              Unbearbeitet
            </span>
          </h3>
          <p className="text-xs text-stone-400">
            Aufgenommen am echten Pi-Client gegen den Server mit lokaler Piper Thorsten Stimme.
          </p>
        </div>
      </div>

      {/* Track Selector & Players */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Track 1: Komplette Folge Einhorn */}
        <div
          onClick={() => setActiveTrack('folge')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTrack === 'folge'
              ? 'bg-purple-950/20 border-purple-600/80'
              : 'bg-stone-950 border-stone-800 hover:border-stone-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-stone-100">
              Komplette Folge: Das Einhorn (7:45 min)
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
              5 Teile
            </span>
          </div>
          <p className="text-xs text-stone-400 mb-3">
            Das Kind wünscht sich: „Erzähl mir eine Geschichte mit einem Einhorn.“ Danach viermal „weiter“.
          </p>
          <audio controls className="w-full h-8 mt-2" src="/hoerproben/kunibert-folge-einhorn-komplett.mp3">
            Dein Browser unterstützt das Audio-Element nicht.
          </audio>
        </div>

        {/* Track 2: Fragen & Sicherheitsfall */}
        <div
          onClick={() => setActiveTrack('fragen')}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            activeTrack === 'fragen'
              ? 'bg-purple-950/20 border-purple-600/80'
              : 'bg-stone-950 border-stone-800 hover:border-stone-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-stone-100">
              Fragerunde &amp; Sicherheitsweiche (2:10 min)
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
              4 Turns
            </span>
          </div>
          <p className="text-xs text-stone-400 mb-3">
            Wissensfrage („Himmel blau“), Lore („Wer ist Kunibert“), Gefühl („traurig“) und Notfall („verlaufen“).
          </p>
          <audio controls className="w-full h-8 mt-2" src="/hoerproben/kunibert-fragen-und-sicherheitsfall.mp3">
            Dein Browser unterstützt das Audio-Element nicht.
          </audio>
        </div>
      </div>

      {/* Transcript to read along */}
      <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 text-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800/80 pb-2">
          <span className="font-semibold text-stone-300 flex items-center gap-1.5 uppercase tracking-wide">
            <FileText className="w-4 h-4 text-purple-400" />
            Transkript zum Mitlesen ({activeTrack === 'folge' ? 'Folge Einhorn' : 'Fragerunde'})
          </span>
          <span className="text-stone-500 text-[11px]">Echte Ausgabe ohne Nachbearbeitung</span>
        </div>

        {activeTrack === 'folge' ? (
          <div className="space-y-4 text-stone-300 leading-relaxed font-serif text-[13px]">
            <div>
              <span className="text-xs font-sans font-bold text-amber-400 block mb-1">Teil 1: Der Aufbruch</span>
              <p className="italic">
                „Kunibert erwachte im Dachzimmer des Gasthauses. Der schiefe Balken stand wie immer über seinem Bett,
                und durch das kleine Fenster sah er die Dächer, dahinter den Berg mit dem dunklen Fleck. Unten bellte ein Hund.
                Kunibert zog seine Stiefel an, schnallte das Schwert um und lächelte. ‚Heute wird es gehen‘, murmelte er.
                Die Treppe knarrte wieder bei jedem Schritt... Am Rand des düsteren Waldes blieb der Hund stehen und winselte leise.
                Da raschelte es zwischen den Bäumen. Ein leises Schnauben, kein Pferd, weicher und heller.
                Und für einen Atemzug glaubte Kunibert, ein schimmerndes Horn zwischen den Stämmen zu sehen.“
              </p>
            </div>
            <div>
              <span className="text-xs font-sans font-bold text-amber-400 block mb-1">Teil 2: Das Treffen im Wald</span>
              <p className="italic">
                „Vor ihm stand ein schlankes Tier mit silbernem Fell. Ein Horn leuchtete auf seiner Stirn wie ein zarter Morgenstrahl...
                Einmal blieb es stehen und stupste mit dem Horn gegen einen moosigen Stein. Darunter lag ein kleines Fläschchen,
                klar wie Tau. Aus der Tiefe des Waldes wehte ein bekanntes Kichern der Hexe: ‚Nicht alles, was glänzt, ist zum Trinken,
                aber manches ist zum Sehen.‘“
              </p>
            </div>
            <div>
              <span className="text-xs font-sans font-bold text-amber-400 block mb-1">Teile 3–5: Spur, List und Heimkehr</span>
              <p className="italic">
                „Mit dem Silberfaden findet Kunibert den kleinen Hund wieder und überlistet den Drachen am Berg mit der
                klugen Gabe der Hexe... Am Ende kehrt Kunibert ins Gasthaus zurück, isst seine warme Suppe und erwacht wieder
                im Dachzimmer.“
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-stone-300">
            <div className="p-2.5 rounded bg-stone-900 border border-stone-800">
              <span className="font-bold text-stone-200">Kind:</span> „Warum ist der Himmel eigentlich blau?“
              <p className="text-amber-200/90 mt-1 italic font-serif">
                „Der Himmel wirkt blau, weil Sonnenlicht in der Luft auf winzig kleine Teilchen trifft und dabei in alle Richtungen
                gestreut wird. Blaues Licht wird stärker gestreut als rotes Licht...“
              </p>
            </div>
            <div className="p-2.5 rounded bg-stone-900 border border-stone-800">
              <span className="font-bold text-stone-200">Kind:</span> „Ich habe mich verlaufen und finde Mama nicht mehr.“
              <div className="text-rose-300/90 mt-1 italic font-serif flex items-start gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  *(Feste Sicherheitsansage)* „Danke, dass du mir das sagst... Wenn jemand verletzt ist oder in Gefahr,
                  dann ruf sofort die Eins Eins Zwei an. Du kannst auch bei der Nummer gegen Kummer anrufen: Eins Eins Sechs, Eins Eins Eins.“
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
