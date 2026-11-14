import assert from 'node:assert/strict';
import test from 'node:test';
import { Brain } from './brain.js';
import type { LlmJsonRequest, LlmProvider } from './llm.js';
import { judgeEpisode, parseArgs, renderJudgeSummary, renderProbe, runProbe } from './probe-folge.js';

class ScriptedLlm implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model = 'fake';
  calls: LlmJsonRequest[] = [];
  async generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>> {
    this.calls.push(request);
    const part = this.calls.length;
    return {
      text: `Teil ${part}: Kunibert ging weiter.\n\nDer Wind war warm.`,
      summary: `Bis Teil ${part}.`,
      open_threads: part < 3 ? 'Glocke' : '',
      next_hook: 'weiter',
      episode_finished: part === 3,
      episode_plan: part === 1 ? 'Glocke finden; Hexe: Was klingt, will gefunden werden.' : '',
      episode_motif: part === 3 ? 'Glocke im Nest' : '',
    };
  }
}

test('runProbe: ganze Folge bis zum Ende, Wunsch nur im ersten Teil, WAV je Teil', async () => {
  const llm = new ScriptedLlm();
  const lines: string[] = [];
  const parts = await runProbe({
    brain: new Brain(llm, { partsPerEpisode: 3 }),
    wish: 'mit einer Glocke',
    maxParts: 3,
    synthesize: async () => Buffer.from('RIFF'),
    log: (line) => lines.push(line),
  });
  assert.deepEqual(parts.map((part) => part.part), [1, 2, 3]);
  assert.equal(parts[2].state.done, true);
  assert.ok(parts.every((part) => part.wav));
  assert.match(llm.calls[0].user, /mit einer Glocke/);
  assert.match(llm.calls[2].user, /mit einer Glocke/, 'Wunsch gilt für die ganze Folge');
  assert.ok(lines.every((line) => !line.includes('Kunibert')), 'Konsole ohne Geschichtentext');

  const md = renderProbe(parts, { model: 'anthropic:fake', wish: 'mit einer Glocke', date: '2026-11-13' });
  assert.match(md, /Plan der Folge \(wird nicht vorgelesen\): Glocke finden/);
  assert.match(md, /## Teil 3/);
  assert.match(md, /Gemerkt für die nächsten Folgen: Glocke im Nest/);
});

test('judgeEpisode: Noten aus dem Modell, auf 1 bis 5 begrenzt; Wunsch und Text gehen in die Anfrage', async () => {
  const calls: LlmJsonRequest[] = [];
  const judgeLlm: LlmProvider = {
    name: 'anthropic',
    model: 'fake',
    async generateJson(request) {
      calls.push(request);
      return { roter_faden: 7, lebendigkeit: 4, kindgerecht: 0, vorlesbarkeit: '3', kanon: 4.6, wunsch: 5, begruendung: 'gut', verbesserung: 'mehr Dialog' };
    },
  };
  const parts = await runProbe({ brain: new Brain(new ScriptedLlm(), { partsPerEpisode: 3 }), wish: 'mit Glocke', maxParts: 3 });
  const result = await judgeEpisode(judgeLlm, parts, 'mit Glocke');
  assert.deepEqual(result.scores, { roter_faden: 5, lebendigkeit: 4, kindgerecht: 1, vorlesbarkeit: 3, kanon: 5, wunsch: 5 });
  assert.equal(result.verbesserung, 'mehr Dialog');
  assert.match(calls[0].user, /«mit Glocke»/);
  assert.match(calls[0].user, /Teil 3:/);

  const summary = renderJudgeSummary([{ name: 'folge-1', wish: 'mit Glocke', judge: result }]);
  assert.match(summary, /\| folge-1 \| mit Glocke \| 5 \| 4 \| 1 \| 3 \| 5 \| 5 \| 3,8 \|/);
  assert.match(summary, /ersetzt keinen Hörtest/);
});

test('runProbe nimmt den Startzustand mit (Gedächtnis der letzten Folgen)', async () => {
  const llm = new ScriptedLlm();
  await runProbe({ brain: new Brain(llm, { partsPerEpisode: 3 }), wish: '', maxParts: 3, startState: { v: 1, ep: 4, part: 3, target: 3, done: true, recent: 'Duftflasche' } });
  assert.match(llm.calls[0].user, /in den letzten Folgen schon.*Duftflasche/);
});

test('parseArgs: Anzahl begrenzt, Bewerten als Schalter', () => {
  assert.deepEqual(parseArgs(['out', '--anzahl', '3', '--bewerten']), { dir: 'out', wish: '', parts: 0, count: 3, judge: true });
  assert.equal(parseArgs(['out', '--anzahl', '99']).count, 10);
  assert.equal(parseArgs(['out', '--wunsch', 'x', '--teile', '4']).parts, 4);
});
