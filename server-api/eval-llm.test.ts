import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assignBlindLabels,
  countWords,
  DEFAULT_EVAL_MODELS,
  EvalSetupError,
  median,
  resolveCandidates,
  runEval,
  seededRandom,
  summarizeModel,
  type EvalPrompt,
  type EvalRow,
} from './eval-llm.js';
import type { LlmJsonRequest, LlmProvider } from './llm.js';

test('countWords und median', () => {
  assert.equal(countWords('  eins   zwei drei '), 3);
  assert.equal(countWords(''), 0);
  assert.equal(median([]), 0);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 3);
});

test('Blind-Labels: deterministisch pro Seed, jedes Modell genau einmal', () => {
  const models = ['a:1', 'b:2', 'c:3'];
  const first = assignBlindLabels(models, seededRandom(7));
  const second = assignBlindLabels(models, seededRandom(7));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['A', 'B', 'C']);
  assert.deepEqual(Object.values(first).sort(), models);
});

test('Blind-Labels: verschiedene Prompts mischen unterschiedlich (nicht immer dieselbe Reihenfolge)', () => {
  const models = ['a:1', 'b:2', 'c:3', 'd:4'];
  const random = seededRandom(42);
  const orders = new Set(Array.from({ length: 12 }, () => JSON.stringify(assignBlindLabels(models, random))));
  assert.ok(orders.size > 1);
});

const row = (over: Partial<EvalRow>): EvalRow => ({
  model: 'm',
  promptId: 'p',
  mode: 'frage',
  kind: 'frage',
  fixed: null,
  speech: '',
  ms: 100,
  llmCalls: 1,
  llmFailed: false,
  error: null,
  rejectedByOutputScreen: false,
  storyWords: 0,
  expectFixed: null,
  safetyOk: null,
  expectKind: null,
  kindOk: null,
  ...over,
});

test('summarizeModel zählt Fehler, Ablehnungen, Geschichtenlänge und Sicherheitsfälle', () => {
  const rows = [
    row({ ms: 100 }),
    row({ ms: 300, llmFailed: true }),
    row({ ms: 200, rejectedByOutputScreen: true }),
    row({ storyWords: 200, mode: 'geschichte' }),
    row({ storyWords: 120, mode: 'geschichte' }),
    row({ expectFixed: 'sicherheit', safetyOk: true }),
    row({ expectFixed: 'sicherheit', safetyOk: false }),
    row({ model: 'anderes', ms: 9999, llmFailed: true }),
  ];
  const summary = summarizeModel('m', rows, 170, 230);
  assert.equal(summary.turns, 7);
  assert.equal(summary.llmFailedTurns, 1);
  assert.equal(summary.rejectedByOutputScreen, 1);
  assert.equal(summary.storyTurns, 2);
  assert.equal(summary.avgStoryWords, 160);
  assert.equal(summary.storyInRange, 1);
  assert.equal(summary.safetyOk, 1);
  assert.equal(summary.safetyTotal, 2);
  assert.equal(summary.maxMs, 300);
});

test('Prompt-Datei ist gültig: eindeutige IDs, bekannte Modi, Sicherheitsfälle vorhanden', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const prompts: EvalPrompt[] = JSON.parse(fs.readFileSync(path.join(here, 'eval-prompts.json'), 'utf8'));
  assert.ok(prompts.length >= 25);
  assert.equal(new Set(prompts.map((p) => p.id)).size, prompts.length);
  for (const prompt of prompts) {
    assert.ok(['frage', 'geschichte', 'weiter'].includes(prompt.mode), prompt.id);
    assert.ok(prompt.text.trim().length > 0, prompt.id);
  }
  assert.ok(prompts.filter((p) => p.expectFixed === 'sicherheit').length >= 4);
});

// ---------------------------------------------------------------------------
// Einstellungen, Abbruch ohne Schlüssel und Trockenlauf mit Attrappe (kein Netzwerk, kein echter Aufruf)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SONNET = 'anthropic:claude-sonnet-5-5';
const HAIKU = 'anthropic:claude-haiku-5-5';

/** Attrappe statt Claude: antwortet mit einem festen, je Modell erkennbaren Text und zählt ihre Aufrufe. */
class DryRunLlm implements LlmProvider {
  readonly name = 'anthropic' as const;
  calls = 0;
  constructor(readonly model: string, private readonly marker: string) {}
  async generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>> {
    this.calls++;
    if (request.schemaName === 'kunibert_geschichte') {
      return {
        text: `${this.marker}. ` + 'Kunibert ritt durch den stillen Wald und lächelte. '.repeat(30),
        summary: 'Zusammenfassung',
        open_threads: 'Faden',
        next_hook: 'Anknüpfung',
        episode_finished: false,
      };
    }
    return { category: 'frage', speech: `${this.marker}: Das ist eine freundliche Antwort für ein Kind.` };
  }
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kunibert-eval-'));

test('Ohne Schlüssel: verständliche Meldung statt Aufruf, auch mit EVAL_MODELS und bei leerem oder blankem Wert', () => {
  let created = 0;
  const make = () => {
    created++;
    return new DryRunLlm('x', 'x');
  };
  for (const env of [
    {},
    { ANTHROPIC_API_KEY: '' },
    { ANTHROPIC_API_KEY: '   ' },
    { EVAL_MODELS: `${SONNET},${HAIKU}` },
  ]) {
    assert.throws(
      () => resolveCandidates(env, make),
      (error: unknown) => {
        assert.ok(error instanceof EvalSetupError);
        assert.match(error.message, /ANTHROPIC_API_KEY ist nicht gesetzt/);
        assert.match(error.message, /npm run eval:llm/);
        assert.match(error.message, /nichts aufgerufen/);
        return true;
      }
    );
  }
  assert.equal(created, 0, 'ohne Schlüssel darf kein Anbieter angelegt werden');
});

test('Standardvergleich: claude-sonnet-5-5 gegen claude-haiku-5-5, jeweils mit dem Schlüssel', () => {
  const seen: Array<[string, string]> = [];
  const candidates = resolveCandidates({ ANTHROPIC_API_KEY: ' sk-test ' }, (model, apiKey) => {
    seen.push([model, apiKey]);
    return new DryRunLlm(model, model);
  });
  assert.deepEqual([...DEFAULT_EVAL_MODELS], ['claude-sonnet-5-5', 'claude-haiku-5-5']);
  assert.deepEqual(seen, [['claude-sonnet-5-5', 'sk-test'], ['claude-haiku-5-5', 'sk-test']]);
  assert.deepEqual(candidates.map((c) => `${c.name}:${c.model}`), [SONNET, HAIKU]);
});

test('EVAL_MODELS: eigene Auswahl wird übernommen, Fehler werden verständlich gemeldet', () => {
  const make = (model: string) => new DryRunLlm(model, model);
  const custom = resolveCandidates({ ANTHROPIC_API_KEY: 'k', EVAL_MODELS: ' anthropic:claude-haiku-5-5 , anthropic:claude-sonnet-5-5 ' }, make);
  assert.deepEqual(custom.map((c) => c.model), ['claude-haiku-5-5', 'claude-sonnet-5-5']);

  const messageOf = (evalModels: string) => {
    try {
      resolveCandidates({ ANTHROPIC_API_KEY: 'k', EVAL_MODELS: evalModels }, make);
    } catch (error) {
      assert.ok(error instanceof EvalSetupError, String(error));
      return error.message;
    }
    return assert.fail(`kein Fehler für ${evalModels}`);
  };
  assert.match(messageOf('anthropic:'), /hat kein Modell/);
  assert.match(messageOf('claude-haiku-5-5'), /Anbieter "claude-haiku-5-5".*nur "anthropic"/);
  assert.match(messageOf('anthropic:claude-haiku-5-5,anthropic:claude-haiku-5-5'), /mehrfach/);
  // Es gibt nur noch Claude: andere Anbieter werden nicht still akzeptiert.
  assert.match(messageOf('andere:modell'), /Erlaubt ist nur "anthropic"/);
});

test('Skript ohne ANTHROPIC_API_KEY: Abbruch mit Code 1, nur die Meldung, kein Stacktrace, nichts geschrieben', () => {
  const outRoot = path.join(ROOT, 'eval-out');
  const before = fs.existsSync(outRoot) ? fs.readdirSync(outRoot).sort() : null;
  for (const extra of [{}, { EVAL_MODELS: `${SONNET},${HAIKU}` }, { ANTHROPIC_API_KEY: '' }]) {
    // Nur das Nötigste in der Umgebung: kein Schlüssel von diesem Rechner.
    const env: Record<string, string> = { PATH: process.env.PATH || '', ...extra };
    if (process.env.HOME) env.HOME = process.env.HOME;
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'server-api/eval-llm.ts'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /ANTHROPIC_API_KEY ist nicht gesetzt/);
    assert.ok(!/\n\s+at /.test(run.stderr), `Stacktrace in der Ausgabe:\n${run.stderr}`);
    assert.ok(!/EvalSetupError/.test(run.stderr), 'der Fehlername gehört nicht in die Meldung');
    assert.equal(run.stdout.trim(), '', 'es darf nichts ausgeführt worden sein');
  }
  const after = fs.existsSync(outRoot) ? fs.readdirSync(outRoot).sort() : null;
  assert.deepEqual(after, before, 'es darf kein Ergebnisordner entstanden sein');
});

test('Trockenlauf mit Attrappe: Sonnet gegen Haiku, Blind-Blatt ohne Modellnamen, Schlüssel passt zu den Texten, kein Netzwerk', async () => {
  const sonnet = new DryRunLlm('claude-sonnet-5-5', 'Text-Eins');
  const haiku = new DryRunLlm('claude-haiku-5-5', 'Text-Zwei');
  const outDir = path.join(tempDir(), 'ergebnis');
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = (() => {
    throw new Error('Im Trockenlauf darf es keinen Netzaufruf geben');
  }) as typeof fetch;
  console.warn = () => {};
  const lines: string[] = [];
  try {
    const returned = await runEval({ candidates: [sonnet, haiku], outDir, log: (line) => lines.push(line) });
    assert.equal(returned, outDir);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }

  const prompts: EvalPrompt[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'server-api', 'eval-prompts.json'), 'utf8'));
  const read = (name: string) => fs.readFileSync(path.join(outDir, name), 'utf8');
  assert.deepEqual(fs.readdirSync(outDir).sort(), ['blind.md', 'key.json', 'results.json', 'summary.md']);

  // Beide Modelle haben alle Prompts durchlaufen, ohne Modellfehler.
  const rows = JSON.parse(read('results.json')) as EvalRow[];
  assert.equal(rows.length, prompts.length * 2);
  for (const model of [SONNET, HAIKU]) assert.equal(rows.filter((row) => row.model === model).length, prompts.length);
  assert.ok(rows.every((row) => !row.llmFailed && row.error === null));
  assert.ok(sonnet.calls > 0 && haiku.calls > 0);

  // Das Blind-Blatt verrät keinen Modellnamen.
  const blind = read('blind.md');
  assert.ok(!/claude|anthropic|sonnet|haiku|opus/i.test(blind), 'Modellname im Blind-Blatt');

  // Zu jedem Prompt: genau die Antworten A und B, und der Schlüssel ordnet sie dem richtigen Modell zu.
  const key = JSON.parse(read('key.json')) as Record<string, Record<string, string>>;
  assert.deepEqual(Object.keys(key).sort(), prompts.map((p) => p.id).sort());
  const sections = blind.split(/\n## /).slice(1);
  assert.equal(sections.length, prompts.length);
  let sonnetFirst = 0;
  let markedAnswers = 0;
  for (const section of sections) {
    const id = section.split('\n')[0].trim();
    const labels = key[id];
    assert.deepEqual(Object.keys(labels).sort(), ['A', 'B'], id);
    assert.deepEqual(Object.values(labels).sort(), [HAIKU, SONNET], id);
    if (labels.A === SONNET) sonnetFirst++;
    for (const match of section.matchAll(/### Antwort ([AB])\n\n> ([^\n]*)/g)) {
      const [, label, text] = match;
      if (text.startsWith('Text-Eins')) {
        assert.equal(labels[label], SONNET, `${id}: Antwort ${label} stammt von Sonnet`);
        markedAnswers++;
      } else if (text.startsWith('Text-Zwei')) {
        assert.equal(labels[label], HAIKU, `${id}: Antwort ${label} stammt von Haiku`);
        markedAnswers++;
      }
    }
  }
  assert.ok(markedAnswers >= prompts.length, `zu wenige zuordenbare Antworten: ${markedAnswers}`);
  assert.ok(sonnetFirst > 0 && sonnetFirst < prompts.length, 'die Reihenfolge muss je Prompt wechseln');

  // Die Messwerte nennen beide Modelle; die Anleitung am Ende sagt, was weitergegeben wird.
  const summary = read('summary.md');
  assert.ok(summary.includes(SONNET) && summary.includes(HAIKU));
  assert.match(summary, new RegExp(`${prompts.length} Prompts pro Modell`));
  assert.ok(lines.some((line) => line.includes(`== ${SONNET}`)) && lines.some((line) => line.includes(`== ${HAIKU}`)));
  assert.ok(lines.at(-1)!.includes('Nur blind.md'));

  // Keine Reste anderer Anbieter in den Ergebnissen.
  for (const name of fs.readdirSync(outDir)) assert.ok(!/gemini|openai|whisper|google/i.test(read(name)), name);
  fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
});

test('Keine Gemini- oder OpenAI-Reste im Vergleichsskript und in den Prompts', () => {
  for (const file of ['eval-llm.ts', 'eval-prompts.json']) {
    const content = fs.readFileSync(path.join(ROOT, 'server-api', file), 'utf8');
    assert.ok(!/gemini|openai|google|whisper|gpt-/i.test(content), file);
  }
});

test('summarizeModel zählt die Einordnung (Frage, neue Geschichte, Folge geht weiter)', () => {
  const summary = summarizeModel('m', [row({ expectKind: 'weiter', kindOk: true }), row({ expectKind: 'frage', kindOk: false }), row({})], 170, 230);
  assert.equal(summary.kindOk, 1);
  assert.equal(summary.kindTotal, 2);
});
