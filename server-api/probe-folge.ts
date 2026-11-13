// Erzeugt eine ganze Kunibert-Folge am Stück durch die echte Erzähler-Kette (Weiche, Claude,
// Ausgabe-Check, Ersatzgeschichte) und legt sie zum Lesen und Anhören ab:
//
//   npm run probe:folge -- <zielordner> [--wunsch "mit einem Einhorn"] [--teile 5]
//
// Braucht ANTHROPIC_API_KEY (nur in der eigenen Konsole setzen, nie in Dateien). Ist eine
// Sprachausgabe konfiguriert (zum Beispiel PICASTAI_TTS_PROVIDER=pocket und
// PICASTAI_POCKET_TTS_URL), entsteht zu jedem Teil auch eine WAV-Datei.
// Ergebnis: folge.md (Plan, Texte, Zusammenfassungen, Wortzahlen, Zeiten) und teil-1.wav usw.
// Nur für Tests mit Erwachsenen. Die Konsole zeigt nur Zahlen, keine Geschichtentexte.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Brain, type StoryState, type TurnResult } from './brain.js';
import { loadConfig } from './config.js';
import { createLlmProvider } from './llm.js';
import { VoicePipeline } from './voice.js';

export interface ProbeOptions {
  brain: Pick<Brain, 'handle' | 'llmName'>;
  wish: string;
  maxParts: number;
  synthesize?: (text: string) => Promise<Buffer>;
  log?: (line: string) => void;
}

export interface ProbePart {
  part: number;
  ms: number;
  ttsMs: number | null;
  words: number;
  fixed: string | null;
  speech: string;
  state: StoryState;
  wav: Buffer | null;
}

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Läuft eine Folge bis zum Ende (höchstens maxParts Teile). Erster Teil mit Wunsch über die Sprechtaste, sonst Erzähltaste. */
export async function runProbe({ brain, wish, maxParts, synthesize, log = () => undefined }: ProbeOptions): Promise<ProbePart[]> {
  const parts: ProbePart[] = [];
  let state: unknown = {};
  for (let index = 0; index < maxParts; index++) {
    const started = Date.now();
    const result: TurnResult = index === 0 && wish ? await brain.handle('geschichte', wish, state) : await brain.handle('weiter', '', state);
    const ms = Date.now() - started;
    let wav: Buffer | null = null;
    let ttsMs: number | null = null;
    if (synthesize) {
      const ttsStart = Date.now();
      wav = await synthesize(result.speech);
      ttsMs = Date.now() - ttsStart;
    }
    parts.push({ part: result.story_state.part, ms, ttsMs, words: countWords(result.speech), fixed: result.fixed ?? null, speech: result.speech, state: result.story_state, wav });
    log(`Teil ${result.story_state.part}: ${countWords(result.speech)} Wörter, Sprachmodell ${(ms / 1000).toFixed(1)} s` +
      (ttsMs !== null ? `, Sprachausgabe ${(ttsMs / 1000).toFixed(1)} s` : '') + (result.fixed ? `, fester Text (${result.fixed})` : ''));
    state = result.story_state;
    if (result.story_state.done) break;
    // Nach dem ersten Teil gehört derselbe Plan zur Folge; ein Fehlschlag in Teil 1 beginnt sonst neu.
    if (index === 0 && result.story_state.part !== 1) break;
  }
  return parts;
}

export function renderProbe(parts: ProbePart[], meta: { model: string; wish: string; date: string }): string {
  const lines = [
    `# Kunibert-Folge (Probe)`,
    ``,
    `- Erzeugt: ${meta.date}`,
    `- Sprachmodell: ${meta.model}`,
    `- Wunsch: ${meta.wish || '(keiner, Erzähltaste)'}`,
    `- Stimmung und Anlass: ${parts[0]?.state.seed ?? ''}`,
    ``,
  ];
  for (const part of parts) {
    lines.push(`## Teil ${part.part}${part.fixed ? ` (fester Text: ${part.fixed})` : ''}`, '');
    if (part.part === 1 && part.state.plan) lines.push(`> Plan der Folge (wird nicht vorgelesen): ${part.state.plan}`, '');
    lines.push(part.speech, '');
    lines.push(`_${part.words} Wörter, Sprachmodell ${(part.ms / 1000).toFixed(1)} s${part.ttsMs !== null ? `, Sprachausgabe ${(part.ttsMs / 1000).toFixed(1)} s` : ''}_`, '');
    if (!part.state.done) {
      lines.push(`<details><summary>Stand nach Teil ${part.part}</summary>`, '');
      lines.push(`- Bisher: ${part.state.summary}`, `- Offene Fäden: ${part.state.threads}`, `- Anknüpfen an: ${part.state.hook}`, '', `</details>`, '');
    } else if (part.state.recent) {
      lines.push(`Gemerkt für die nächsten Folgen: ${part.state.recent}`, '');
    }
  }
  lines.push('## Zum Bewerten (Erwachsene)', '',
    '- Roter Faden: Kommt der Hinweis der Hexe am Ende wirklich zum Einsatz? Wird der Wunsch aufgelöst?',
    '- Lebendig: Gibt es Dialoge, kleine komische Momente, Sinneseindrücke?',
    '- Kindgerecht: kurze Sätze, verständliche Wörter, nichts Gruseliges am Ende eines Teils?',
    '- Gesprochen: Klingen die Pausen an den Absätzen richtig? Stolpert die Stimme irgendwo?', '');
  return lines.join('\n');
}

function parseArgs(argv: string[]): { dir: string; wish: string; parts: number } {
  let dir = '';
  let wish = '';
  let parts = 0;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--wunsch') wish = argv[++index] ?? '';
    else if (arg === '--teile') parts = Number(argv[++index]) || 0;
    else if (!dir) dir = arg;
  }
  return { dir, wish, parts };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error('Aufruf: npm run probe:folge -- <zielordner> [--wunsch "mit einem Einhorn"] [--teile 5]');
    return 2;
  }
  const config = loadConfig();
  const llm = createLlmProvider(config);
  if (!llm) {
    console.error('ANTHROPIC_API_KEY fehlt. In der eigenen Konsole setzen (nie in eine Datei), dann noch einmal starten.');
    return 2;
  }
  const partsPerEpisode = args.parts ? Math.max(3, Math.min(12, args.parts)) : config.partsPerEpisode;
  const brain = new Brain(llm, { partsPerEpisode });
  const voice = new VoicePipeline(config);
  const synthesize = voice.ttsConfigured ? (text: string) => voice.synthesize(text) : undefined;
  console.log(`Folge mit ${partsPerEpisode} Teilen, ${brain.llmName}, Sprachausgabe ${synthesize ? 'an' : 'aus'}.`);

  const parts = await runProbe({ brain, wish: args.wish, maxParts: partsPerEpisode, synthesize, log: (line) => console.log(line) });
  fs.mkdirSync(args.dir, { recursive: true });
  fs.writeFileSync(path.join(args.dir, 'folge.md'), renderProbe(parts, { model: brain.llmName, wish: args.wish, date: new Date().toISOString() }));
  for (const part of parts) if (part.wav) fs.writeFileSync(path.join(args.dir, `teil-${part.part}.wav`), part.wav);
  console.log(`Fertig: ${path.join(args.dir, 'folge.md')}${synthesize ? ' und WAV-Dateien je Teil' : ''}.`);
  return parts.some((part) => part.fixed) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (error) => {
    console.error(`Abbruch: ${(error as Error)?.message || error}`);
    process.exit(1);
  });
}
