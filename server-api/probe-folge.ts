// Erzeugt eine ganze Kunibert-Folge am Stück durch die echte Erzähler-Kette (Weiche, Claude,
// Ausgabe-Check, Ersatzgeschichte) und legt sie zum Lesen und Anhören ab:
//
//   npm run probe:folge -- <zielordner> [--wunsch "mit einem Einhorn"] [--teile 5] [--anzahl 3] [--bewerten]
//
// --anzahl N erzeugt N Folgen nacheinander (ohne --wunsch mit wechselnden Wünschen; das Gedächtnis
// der letzten Folgen wird mitgenommen, wie am Gerät). --bewerten lässt jede Folge von Claude nach
// festen Kriterien benoten (1 bis 5) und schreibt eine Übersicht bewertung.md.
//
// Braucht ANTHROPIC_API_KEY (nur in der eigenen Konsole setzen, nie in Dateien). Ist eine
// Sprachausgabe konfiguriert (zum Beispiel PICASTAI_TTS_PROVIDER=pocket und
// PICASTAI_POCKET_TTS_URL), entsteht zu jedem Teil auch eine WAV-Datei.
// Ergebnis: folge.md (Plan, Texte, Zusammenfassungen, Wortzahlen, Zeiten) und teil-1.wav usw.
// Nur für Tests mit Erwachsenen. Die Konsole zeigt nur Zahlen, keine Geschichtentexte.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Brain, formatMetrics, storyMetrics, type StoryState, type TurnResult } from './brain.js';
import { loadConfig } from './config.js';
import { createLlmProvider, type JsonSchema, type LlmProvider } from './llm.js';
import { VoicePipeline } from './voice.js';

export interface ProbeOptions {
  brain: Pick<Brain, 'handle' | 'llmName'>;
  wish: string;
  maxParts: number;
  /** Zustand vor der Folge (zum Beispiel mit dem Gedächtnis der letzten Folgen). */
  startState?: unknown;
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
export async function runProbe({ brain, wish, maxParts, startState = {}, synthesize, log = () => undefined }: ProbeOptions): Promise<ProbePart[]> {
  const parts: ProbePart[] = [];
  let state: unknown = startState;
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
    if (!part.fixed) lines.push(`Messwerte: ${formatMetrics(storyMetrics(part.speech))}`, '');
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

/** Kriterien der Bewertung, je 1 (schwach) bis 5 (sehr gut). */
export const JUDGE_CRITERIA = {
  roter_faden: 'Roter Faden: Teile schließen aneinander an; der Hinweis der Hexe wird gesät und am Ende gebraucht; nichts bleibt offen',
  lebendigkeit: 'Lebendigkeit: Dialoge, Sinneseindrücke, kleine komische Momente, Kunibert denkt und handelt selbst',
  kindgerecht: 'Kindgerecht für 6 bis 10 Jahre: verständliche Wörter, kurze Sätze, Spannung ohne Angst, ruhige Enden der Teile',
  vorlesbarkeit: 'Vorlesbarkeit: klingt gesprochen gut, klare Sprecherangaben, keine Zeichen oder Zahlen, über die eine Sprachausgabe stolpert',
  kanon: 'Kanon: vertraute Stationen (Dachzimmer, Wirtin, Kutscher, Hexe, Drache) mit neuen Begebenheiten; Kunibert höflich, mutig, großzügig, klug',
  wunsch: 'Wunsch des Kindes: sichtbar und durch die ganze Folge eingebaut (ohne Wunsch: 5)',
} as const;

export type JudgeScores = Record<keyof typeof JUDGE_CRITERIA, number>;
export interface JudgeResult {
  scores: JudgeScores;
  begruendung: string;
  verbesserung: string;
}

const JUDGE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    ...Object.fromEntries(Object.entries(JUDGE_CRITERIA).map(([key, description]) => [key, { type: 'integer', minimum: 1, maximum: 5, description }])),
    begruendung: { type: 'string', description: 'Zwei bis vier Sätze: was gut ist, was schwach ist, mit kurzen Belegen.' },
    verbesserung: { type: 'string', description: 'Ein konkreter Vorschlag, wie die Anweisungen an den Erzähler die größte Schwäche beheben könnten.' },
  },
  required: [...Object.keys(JUDGE_CRITERIA), 'begruendung', 'verbesserung'],
};

const JUDGE_SYSTEM = `Du bist eine strenge, faire Lektorin für Hörgeschichten für Kinder von 6 bis 10 Jahren.
Du bewertest eine ganze Folge von „Ritter Kunibert“ nach festen Kriterien, je 1 (schwach) bis 5 (sehr gut).
Eine 5 gibt es nur, wenn nichts Wesentliches zu verbessern ist. Begründe knapp und konkret.`;

/** Lässt eine Folge von Claude benoten. Werte außerhalb 1 bis 5 werden begrenzt. */
export async function judgeEpisode(llm: LlmProvider, parts: ProbePart[], wish: string): Promise<JudgeResult> {
  const story = parts.map((part) => `Teil ${part.part}:\n${part.speech}`).join('\n\n');
  const raw = (await llm.generateJson({
    system: JUDGE_SYSTEM,
    user: `Wunsch des Kindes: ${wish ? `«${wish}»` : 'keiner'}\n\nDie Folge, so wie sie vorgelesen wird:\n\n${story}`,
    schemaName: 'bewertung',
    schema: JUDGE_SCHEMA,
    maxOutputTokens: 800,
  })) as Record<string, unknown>;
  const scores = Object.fromEntries(
    Object.keys(JUDGE_CRITERIA).map((key) => [key, Math.max(1, Math.min(5, Math.round(Number(raw[key]) || 1)))])
  ) as JudgeScores;
  return { scores, begruendung: String(raw.begruendung || ''), verbesserung: String(raw.verbesserung || '') };
}

export function renderJudgeSummary(rows: Array<{ name: string; wish: string; judge: JudgeResult }>): string {
  const keys = Object.keys(JUDGE_CRITERIA) as Array<keyof typeof JUDGE_CRITERIA>;
  const average = (values: number[]) => (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1).replace('.', ',');
  const lines = ['# Bewertung der Probefolgen', '', `| Folge | Wunsch | ${keys.join(' | ')} | Schnitt |`, `|---|---|${keys.map(() => '---').join('|')}|---|`];
  for (const row of rows) {
    const values = keys.map((key) => row.judge.scores[key]);
    lines.push(`| ${row.name} | ${row.wish || '–'} | ${values.join(' | ')} | ${average(values)} |`);
  }
  if (rows.length) {
    const columns = keys.map((key) => average(rows.map((row) => row.judge.scores[key])));
    lines.push(`| **Schnitt** | | ${columns.join(' | ')} | ${average(rows.flatMap((row) => keys.map((key) => row.judge.scores[key])))} |`);
  }
  lines.push('', 'Kriterien:', ...keys.map((key) => `- **${key}**: ${JUDGE_CRITERIA[key]}`), '');
  for (const row of rows) {
    lines.push(`## ${row.name}`, '', row.judge.begruendung, '', `Vorschlag: ${row.judge.verbesserung}`, '');
  }
  lines.push('Die Bewertung stammt von Claude selbst und ersetzt keinen Hörtest mit Erwachsenen.', '');
  return lines.join('\n');
}

/** Wechselnde Wünsche, wenn --anzahl ohne --wunsch läuft (erster Lauf ohne Wunsch, wie die Erzähltaste). */
export const PROBE_WISHES = [
  '',
  'Erzähl mir eine Geschichte mit einem Einhorn',
  'Ich will eine Geschichte, wo Kunibert Fußball spielt',
  'Erzähl mir was ganz Ruhiges zum Einschlafen',
  'Eine Geschichte mit einem kleinen Drachen, der nicht fliegen kann',
];

export function parseArgs(argv: string[]): { dir: string; wish: string; parts: number; count: number; judge: boolean } {
  let dir = '';
  let wish = '';
  let parts = 0;
  let count = 1;
  let judge = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--wunsch') wish = argv[++index] ?? '';
    else if (arg === '--teile') parts = Number(argv[++index]) || 0;
    else if (arg === '--anzahl') count = Math.max(1, Math.min(10, Number(argv[++index]) || 1));
    else if (arg === '--bewerten') judge = true;
    else if (!dir) dir = arg;
  }
  return { dir, wish, parts, count, judge };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error('Aufruf: npm run probe:folge -- <zielordner> [--wunsch "mit einem Einhorn"] [--teile 5] [--anzahl 3] [--bewerten]');
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

  fs.mkdirSync(args.dir, { recursive: true });
  const judged: Array<{ name: string; wish: string; judge: JudgeResult }> = [];
  let carry: unknown = {};
  let anyFixed = false;
  for (let run = 0; run < args.count; run++) {
    const wish = args.wish || (args.count > 1 ? PROBE_WISHES[run % PROBE_WISHES.length] : '');
    const name = args.count > 1 ? `folge-${run + 1}` : '.';
    const dir = path.join(args.dir, name);
    fs.mkdirSync(dir, { recursive: true });
    if (args.count > 1) console.log(`--- Folge ${run + 1} von ${args.count} ---`);
    const parts = await runProbe({ brain, wish, maxParts: partsPerEpisode, startState: carry, synthesize, log: (line) => console.log(line) });
    anyFixed ||= parts.some((part) => part.fixed);
    carry = parts[parts.length - 1]?.state ?? {};
    fs.writeFileSync(path.join(dir, 'folge.md'), renderProbe(parts, { model: brain.llmName, wish, date: new Date().toISOString() }));
    for (const part of parts) if (part.wav) fs.writeFileSync(path.join(dir, `teil-${part.part}.wav`), part.wav);
    if (args.judge) {
      const judge = await judgeEpisode(llm, parts, wish);
      judged.push({ name: args.count > 1 ? name : 'folge', wish, judge });
      console.log(`Bewertung: ${Object.entries(judge.scores).map(([key, value]) => `${key} ${value}`).join(', ')}`);
    }
  }
  if (args.judge) fs.writeFileSync(path.join(args.dir, 'bewertung.md'), renderJudgeSummary(judged));
  console.log(`Fertig: ${args.dir}${synthesize ? ' (mit WAV-Dateien je Teil)' : ''}${args.judge ? ', Übersicht in bewertung.md' : ''}.`);
  return anyFixed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (error) => {
    console.error(`Abbruch: ${(error as Error)?.message || error}`);
    process.exit(1);
  });
}
