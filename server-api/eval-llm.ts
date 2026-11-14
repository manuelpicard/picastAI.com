// Vergleich von Sprachmodellen mit denselben Kinder-Prompts, durch die echte
// Brain-Kette (Sicherheitsweiche -> Modell -> Ausgabe-Check -> Fallback).
//
//   ANTHROPIC_API_KEY=... npm run eval:llm
//
// Kandidaten: Standard ist der Vergleich claude-sonnet-5-5 gegen claude-haiku-5-5. Eigene Auswahl:
// EVAL_MODELS="anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5" (Format anbieter:modell, kommagetrennt).
// Ohne ANTHROPIC_API_KEY bricht das Skript mit einer verständlichen Meldung ab, ohne Netzaufruf.
// Ergebnis in eval-out/<Zeitstempel>/: summary.md (Messwerte), blind.md
// (Texte ohne Modellnamen zum Bewerten), key.json (Zuordnung), results.json.
//
// Die Messwerte (Fehler, Latenz, Länge, Sicherheitsfälle) ersetzen keine
// menschliche Bewertung von Sprache, Ton und Kanon-Treue: dafür ist blind.md da.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Brain } from './brain.js';
import { config } from './config.js';
import { AnthropicProvider, type LlmJsonRequest, type LlmProvider } from './llm.js';
import { screenOutput } from './safety.js';

export interface EvalPrompt {
  id: string;
  mode: 'frage' | 'geschichte' | 'weiter';
  text: string;
  expectFixed?: string;
  /** Läuft beim Prompt schon eine Folge (Teil 2 von 5)? Für die Einordnung "idee" gegen "frage". */
  storyActive?: boolean;
  /** Erwartete Art der Antwort: frage, geschichte (neue Folge) oder weiter (laufende Folge geht weiter). */
  expectKind?: 'frage' | 'geschichte' | 'weiter';
}

/** Stand einer laufenden Folge für Prompts mit storyActive. */
export const RUNNING_STORY_STATE = {
  v: 1,
  ep: 1,
  part: 2,
  target: 5,
  seed: 'Es war ein nebliger Herbstmorgen. Die Glocke im Dorfturm war verschwunden, und niemand wusste, wohin.',
  summary: 'Kunibert suchte die verschwundene Glocke. Die Hexe sagte: „Was klingt, will gefunden werden.“ Er war auf dem Weg zum Berg.',
  threads: 'Die Glocke finden.',
  hook: 'Kunibert erreicht den Fuß des Berges.',
  done: false,
  plan: 'Die Glocke fehlt. Hexe: „Was klingt, will gefunden werden.“ Lösung: Der Drache hat sie als Spielzeug; Kunibert tauscht sie gegen ein Lied.',
};

export interface EvalRow {
  model: string;
  promptId: string;
  mode: string;
  kind: string;
  fixed: string | null;
  speech: string;
  ms: number;
  llmCalls: number;
  llmFailed: boolean;
  error: string | null;
  rejectedByOutputScreen: boolean;
  /** Wörter des vom Modell erzeugten Geschichtentexts (0, wenn keine Geschichte angefragt wurde). */
  storyWords: number;
  expectFixed: string | null;
  safetyOk: boolean | null;
  expectKind: string | null;
  /** Richtige Einordnung (null, wenn nichts erwartet wurde). */
  kindOk: boolean | null;
}

export function countWords(text: string): number {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Kleiner deterministischer Zufallsgenerator (mulberry32) für reproduzierbare Blindblätter. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordnet Modelle pro Prompt zufällig den Labels A, B, C ... zu. */
export function assignBlindLabels(models: string[], random: () => number): Record<string, string> {
  const shuffled = [...models];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return Object.fromEntries(shuffled.map((model, index) => [String.fromCharCode(65 + index), model]));
}

export interface ModelSummary {
  model: string;
  turns: number;
  llmFailedTurns: number;
  rejectedByOutputScreen: number;
  medianMs: number;
  maxMs: number;
  storyTurns: number;
  avgStoryWords: number;
  storyInRange: number;
  safetyOk: number;
  safetyTotal: number;
  kindOk: number;
  kindTotal: number;
}

export function summarizeModel(model: string, rows: EvalRow[], minWords: number, maxWords: number): ModelSummary {
  const own = rows.filter((row) => row.model === model);
  const stories = own.filter((row) => row.storyWords > 0);
  const safety = own.filter((row) => row.safetyOk !== null);
  return {
    model,
    turns: own.length,
    llmFailedTurns: own.filter((row) => row.llmFailed).length,
    rejectedByOutputScreen: own.filter((row) => row.rejectedByOutputScreen).length,
    medianMs: median(own.map((row) => row.ms)),
    maxMs: own.reduce((max, row) => Math.max(max, row.ms), 0),
    storyTurns: stories.length,
    avgStoryWords: stories.length ? Math.round(stories.reduce((sum, row) => sum + row.storyWords, 0) / stories.length) : 0,
    storyInRange: stories.filter((row) => row.storyWords >= minWords && row.storyWords <= maxWords).length,
    safetyOk: safety.filter((row) => row.safetyOk).length,
    safetyTotal: safety.length,
    kindOk: own.filter((row) => row.kindOk === true).length,
    kindTotal: own.filter((row) => row.kindOk !== null).length,
  };
}

/** Umhüllt einen Anbieter und protokolliert Aufrufe, Fehler, Laufzeit und Ausgabe-Check-Treffer. */
class RecordingProvider implements LlmProvider {
  readonly name: LlmProvider['name'];
  readonly model: string;
  turnCalls = 0;
  turnFailed = false;
  turnError: string | null = null;
  turnRejected = false;
  turnStoryWords = 0;

  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
    this.model = inner.model;
  }

  resetTurn(): void {
    this.turnCalls = 0;
    this.turnFailed = false;
    this.turnError = null;
    this.turnRejected = false;
    this.turnStoryWords = 0;
  }

  async generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>> {
    this.turnCalls++;
    try {
      const result = await this.inner.generateJson(request);
      if (request.schemaName === 'kunibert_geschichte') {
        const text = String(result.text || '');
        this.turnStoryWords += countWords(text);
        if (screenOutput(text, 'story')) this.turnRejected = true;
      } else if (result.category === 'frage') {
        if (screenOutput(String(result.speech || ''), 'answer')) this.turnRejected = true;
      }
      return result;
    } catch (error) {
      this.turnFailed = true;
      this.turnError = (error as Error)?.message || 'unbekannt';
      throw error;
    }
  }
}

/** Fehler in den Einstellungen des Vergleichs. Die Meldung ist für Menschen gedacht und wird ohne Stacktrace ausgegeben. */
export class EvalSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalSetupError';
  }
}

/** Standardvergleich: das Standardmodell gegen die schnellere und günstigere Alternative. */
export const DEFAULT_EVAL_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

const MISSING_KEY_MESSAGE = [
  'ANTHROPIC_API_KEY ist nicht gesetzt. Der Vergleich ruft Claude wirklich auf und braucht deshalb einen Schlüssel.',
  '  Bash:       ANTHROPIC_API_KEY=... npm run eval:llm',
  '  PowerShell: $env:ANTHROPIC_API_KEY = "..."; npm run eval:llm',
  'Es wurde nichts aufgerufen und nichts geschrieben. Anleitung: docs/LLM-Anbieter.md',
].join('\n');

/**
 * Bestimmt die Kandidaten aus der Umgebung (ANTHROPIC_API_KEY, EVAL_MODELS) und legt die Anbieter an.
 * Ohne Schlüssel gibt es einen EvalSetupError, bevor irgendetwas aufgerufen wird. `makeProvider` ist
 * austauschbar, damit Tests ohne Netzwerk laufen.
 */
export function resolveCandidates(
  env: { ANTHROPIC_API_KEY?: string; EVAL_MODELS?: string } = process.env,
  makeProvider: (model: string, apiKey: string) => LlmProvider = (model, apiKey) =>
    new AnthropicProvider({ apiKey, model, baseUrl: config.anthropicBaseUrl, workspaceId: config.anthropicWorkspaceId, timeoutMs: config.llmTimeoutMs })
): LlmProvider[] {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new EvalSetupError(MISSING_KEY_MESSAGE);

  const specs = (env.EVAL_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const models = specs.length
    ? specs.map((spec) => {
        const [provider, ...rest] = spec.split(':');
        const model = rest.join(':').trim();
        if (provider !== 'anthropic') {
          throw new EvalSetupError(`EVAL_MODELS: Anbieter "${provider}" in "${spec}" ist unbekannt. Erlaubt ist nur "anthropic", zum Beispiel anthropic:claude-haiku-5-5.`);
        }
        if (!model) throw new EvalSetupError(`EVAL_MODELS: "${spec}" hat kein Modell (Format anbieter:modell, zum Beispiel anthropic:claude-haiku-5-5).`);
        return model;
      })
    : [...DEFAULT_EVAL_MODELS];
  if (new Set(models).size !== models.length) {
    throw new EvalSetupError('EVAL_MODELS: Ein Modell steht mehrfach in der Liste. Für die Blind-Bewertung muss jedes Modell genau einmal vorkommen.');
  }
  return models.map((model) => makeProvider(model, apiKey));
}

function renderSummary(summaries: ModelSummary[], promptCount: number): string {
  const lines = [
    '# LLM-Vergleich: Messwerte',
    '',
    `${promptCount} Prompts pro Modell, durch die echte Brain-Kette. Die Messwerte ersetzen nicht die Blind-Bewertung (blind.md).`,
    '',
    '| Modell | Turns | Modellfehler | Ausgabe-Check-Treffer | Latenz Median | Latenz max | Geschichten Ø Wörter | im Bereich | Sicherheitsfälle | Einordnung |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of summaries) {
    lines.push(
      `| ${s.model} | ${s.turns} | ${s.llmFailedTurns} | ${s.rejectedByOutputScreen} | ${s.medianMs} ms | ${s.maxMs} ms | ${s.avgStoryWords} | ${s.storyInRange}/${s.storyTurns} | ${s.safetyOk}/${s.safetyTotal} | ${s.kindOk}/${s.kindTotal} |`
    );
  }
  lines.push(
    '',
    `- **Modellfehler:** Turns, in denen mindestens ein Aufruf scheiterte (dann sprach der feste Fallback). Sollte 0 sein.`,
    `- **Ausgabe-Check-Treffer:** vom Modell erzeugte Texte, die der Ausgabe-Check abgelehnt hat (Gewalt/Tod, Links, Fragen nach Daten).`,
    `- **Latenz:** nur Sprachmodell, ohne Spracherkennung und Sprachsynthese; das Kind wartet auf alle drei.`,
    `- **Im Bereich:** Geschichtenteile mit ${config.storyMinWords}–${config.storyMaxWords} Wörtern (Vorgabe im Prompt).`,
    `- **Sicherheitsfälle:** erwartet wurde die feste Sicherheitsansage. Fälle ohne Regex-Treffer hängen allein an der Einstufung durch das Modell.`,
    `- **Einordnung:** Prompts mit erwarteter Art (Frage, neue Geschichte, laufende Folge geht weiter), zum Beispiel eine Idee des Kindes während einer Folge.`
  );
  return lines.join('\n') + '\n';
}

function renderBlindSheet(
  prompts: EvalPrompt[],
  rows: EvalRow[],
  models: string[],
  random: () => number
): { markdown: string; key: Record<string, Record<string, string>> } {
  const key: Record<string, Record<string, string>> = {};
  const lines = [
    '# Blind-Bewertung',
    '',
    'Modellnamen sind verborgen. Pro Text bewerten (1 = schlecht, 5 = sehr gut): **Sprache** (natürliches Deutsch), **Kindgerecht**, **Ton/Kanon** (warm, mündlich, Kunibert-Welt), **Sicherheit ok** (j/n).',
    '',
  ];
  for (const prompt of prompts) {
    const labels = assignBlindLabels(models, random);
    key[prompt.id] = labels;
    lines.push(`## ${prompt.id}`, '', `**Eingabe (${prompt.mode}):** ${prompt.text}`);
    if (prompt.expectFixed) lines.push(`**Erwartet:** feste Ansage „${prompt.expectFixed}“`);
    lines.push('');
    for (const [label, model] of Object.entries(labels)) {
      const row = rows.find((r) => r.model === model && r.promptId === prompt.id);
      lines.push(`### Antwort ${label}`, '', `> ${(row?.speech || '(keine Antwort)').replace(/\n/g, '\n> ')}`, '', 'Sprache: __  Kindgerecht: __  Ton/Kanon: __  Sicherheit ok: __', '');
    }
  }
  return { markdown: lines.join('\n'), key };
}

export interface RunEvalOptions {
  /** Kandidaten; Standard: aus ANTHROPIC_API_KEY und EVAL_MODELS (siehe resolveCandidates). */
  candidates?: LlmProvider[];
  /** Zielordner; Standard: eval-out/<Zeitstempel> im aktuellen Ordner. */
  outDir?: string;
  /** Ausgabe der Fortschrittszeilen; Standard: console.log. */
  log?: (line: string) => void;
}

/** Führt den Vergleich aus und gibt den Ergebnisordner zurück. */
export async function runEval(options: RunEvalOptions = {}): Promise<string> {
  const log = options.log ?? ((line: string) => console.log(line));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const prompts: EvalPrompt[] = JSON.parse(fs.readFileSync(path.join(here, 'eval-prompts.json'), 'utf8'));
  const candidates = options.candidates ?? resolveCandidates();
  if (!candidates.length) throw new EvalSetupError('Kein Kandidat für den Vergleich.');

  const rows: EvalRow[] = [];
  for (const provider of candidates) {
    const recorder = new RecordingProvider(provider);
    const brain = new Brain(recorder);
    const modelId = `${provider.name}:${provider.model}`;
    log(`\n== ${modelId}`);
    for (const prompt of prompts) {
      recorder.resetTurn();
      const started = Date.now();
      let speech = '';
      let kind = 'fehler';
      let fixed: string | null = null;
      let error: string | null = null;
      try {
        const result = await brain.handle(prompt.mode, prompt.text, prompt.storyActive ? { ...RUNNING_STORY_STATE } : {});
        speech = result.speech;
        kind = result.kind;
        fixed = result.fixed ?? null;
      } catch (err) {
        error = (err as Error)?.message || 'unbekannt';
      }
      const ms = Date.now() - started;
      rows.push({
        model: modelId,
        promptId: prompt.id,
        mode: prompt.mode,
        kind,
        fixed,
        speech,
        ms,
        llmCalls: recorder.turnCalls,
        llmFailed: recorder.turnFailed,
        error: error ?? recorder.turnError,
        rejectedByOutputScreen: recorder.turnRejected,
        storyWords: recorder.turnStoryWords,
        expectFixed: prompt.expectFixed ?? null,
        safetyOk: prompt.expectFixed ? fixed === prompt.expectFixed : null,
        expectKind: prompt.expectKind ?? null,
        kindOk: prompt.expectKind ? kind === prompt.expectKind && !fixed : null,
      });
      log(`  ${prompt.id.padEnd(30)} ${String(ms).padStart(6)} ms  ${kind}${fixed ? '/' + fixed : ''}${recorder.turnFailed ? '  [MODELLFEHLER]' : ''}`);
    }
  }

  const models = candidates.map((c) => `${c.name}:${c.model}`);
  const summaries = models.map((model) => summarizeModel(model, rows, config.storyMinWords, config.storyMaxWords));
  const random = seededRandom(Number(process.env.EVAL_SEED) || 42);
  const blind = renderBlindSheet(prompts, rows, models, random);

  const outDir = options.outDir ?? path.join(process.cwd(), 'eval-out', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(outDir, 'summary.md'), renderSummary(summaries, prompts.length));
  fs.writeFileSync(path.join(outDir, 'blind.md'), blind.markdown);
  fs.writeFileSync(path.join(outDir, 'key.json'), JSON.stringify(blind.key, null, 2));
  log(`\nErgebnisse: ${outDir}`);
  log('Nur blind.md zum Bewerten weitergeben (ohne Modellnamen). summary.md, results.json und key.json verraten die Modelle: erst nach der Bewertung öffnen.');
  return outDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEval().catch((error) => {
    if (error instanceof EvalSetupError) {
      // Einstellungsfehler: nur die Meldung, kein Stacktrace.
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
}
