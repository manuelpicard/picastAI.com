import React, { useState } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, Phone, ExternalLink } from 'lucide-react';

export interface SafetyDemoProps {
  onTestSafetyPrompt: (prompt: string) => void;
}

export const SafetyDemo: React.FC<SafetyDemoProps> = ({ onTestSafetyPrompt }) => {
  const [testInput, setTestInput] = useState<string>('Ich habe mich verlaufen und finde Mama nicht mehr.');
  const [testResult, setTestResult] = useState<{ triggered: boolean; pattern?: string } | null>(null);

  const sampleTriggers = [
    'Ich habe mich verlaufen und finde Mama nicht mehr.',
    'Es brennt in der Küche!',
    'Jemand hat mich geschlagen.',
    'Ich habe Tabletten genommen.',
    'Ich kriege keine Luft mehr.',
    'Mama wacht nicht auf und bewegt sich nicht.',
  ];

  const harmlessSamples = [
    'Der Drache soll sterben!', // Harmless dragon wish, should NOT trigger safety!
    'Warum hat der Ritter ein Schwert?',
    'Kannst du mir ein Märchen erzählen?',
    'Ich habe mir das Knie am Stein leicht gestoßen.',
  ];

  const runTest = (text: string) => {
    // Client-side quick check
    const patterns = [
      /\bich (will|möchte|mag) (nicht mehr leben|sterben|tot sein)/i,
      /\b(mich|mir) (selbst )?(umbringen|weh ?tun|wehtun|verletzen|ritzen)/i,
      /\bich ritze\b/i,
      /\bnicht mehr (leben|da sein) (will|möchte)/i,
      /\b(er|sie|der|die|mama|papa|mein \w+|meine \w+|jemand) (schlägt|haut|tritt|würgt) mich/i,
      /\b(hat|haben) mich (geschlagen|gehauen|getreten|gewürgt|eingesperrt)/i,
      /\b(hat|haben|will|wollte) mich (an ?gefasst|anfassen|berührt) /i,
      /\bfasst mich an\b/i,
      /\b(soll|darf) (es )?(niemandem|keinem) (sagen|erzählen|verraten)/i,
      /\bich (blute|kann nicht atmen|kriege keine luft|bekomme keine luft)/i,
      /\b(es|hier) brennt\b/i,
      /\bfeuer (in der|im) (wohnung|haus|zimmer|küche)/i,
      /\b(mama|papa|oma|opa|jemand|er|sie) (wacht nicht auf|ist umgefallen|bewegt sich nicht)/i,
      /\bich (habe|hab) (mich )?verlaufen/i,
      /\bich habe (tabletten|medikamente|putzmittel) (genommen|getrunken|gegessen)/i,
    ];

    const normalized = text.toLowerCase().replace(/[^\wäöüß ]+/gi, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const match = patterns.find((p) => p.test(normalized));

    setTestResult({
      triggered: Boolean(match),
      pattern: match ? match.toString() : undefined,
    });
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center space-x-3 border-b border-stone-800 pb-4 mb-5">
        <div className="p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
            Deterministische Sicherheitsweiche
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-mono">
              Vor KI-Aufruf
            </span>
          </h3>
          <p className="text-xs text-stone-400">
            Feste Schutzmuster greifen sofort, ohne dass Kinder-Audio an eine externe KI gelangt.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-300 mb-2">
            Eingabe prüfen (Notfall-Muster vs. kindgerechte Fantasie):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testInput}
              onChange={(e) => {
                setTestInput(e.target.value);
                runTest(e.target.value);
              }}
              placeholder="Äußerung des Kindes..."
              className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={() => {
                runTest(testInput);
                onTestSafetyPrompt(testInput);
              }}
              className="px-3.5 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold transition"
            >
              Im Gerät auslösen
            </button>
          </div>
        </div>

        {/* Test Result Indicator */}
        {testResult && (
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
              testResult.triggered
                ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
            }`}
          >
            {testResult.triggered ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {testResult.triggered
                  ? 'Sicherheitsfall erkannt – Kein KI-Aufruf, feste Notfallansage wird abgespielt!'
                  : 'Keine akute Notlage – Normale Wissensfrage oder Geschichte.'}
              </p>
              {testResult.pattern && (
                <p className="text-[11px] font-mono text-rose-300/80 mt-1">
                  Muster: {testResult.pattern}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Feste Notfallansage Text */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800">
          <div className="flex items-center space-x-2 text-amber-300 text-xs font-semibold mb-2">
            <Phone className="w-4 h-4" />
            <span>Feste geprüfte Notfallansage (in Worten für Sprachsynthese):</span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed italic bg-stone-900/60 p-3 rounded-lg border border-stone-800">
            „Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein.
            Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie,
            einer Lehrerin, einem Lehrer oder einer Nachbarin.
            Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die <strong>Eins Eins Zwei</strong> an.
            Du kannst auch bei der Nummer gegen Kummer anrufen: <strong>Eins Eins Sechs, Eins Eins Eins</strong>.
            Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag.“
          </p>
        </div>

        {/* Test Preset Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div>
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide block mb-1.5">
              Notfall-Beispiele (sollen Weiche auslösen):
            </span>
            <div className="space-y-1.5">
              {sampleTriggers.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTestInput(item);
                    runTest(item);
                    onTestSafetyPrompt(item);
                  }}
                  className="w-full text-left text-xs bg-stone-950 hover:bg-rose-950/40 p-2 rounded-lg border border-stone-800 hover:border-rose-700/60 text-stone-300 hover:text-rose-200 transition"
                >
                  „{item}“
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide block mb-1.5">
              Fantasie-Beispiele (kein Notfall):
            </span>
            <div className="space-y-1.5">
              {harmlessSamples.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTestInput(item);
                    runTest(item);
                    onTestSafetyPrompt(item);
                  }}
                  className="w-full text-left text-xs bg-stone-950 hover:bg-emerald-950/40 p-2 rounded-lg border border-stone-800 hover:border-emerald-700/60 text-stone-300 hover:text-emerald-200 transition"
                >
                  „{item}“
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
