import assert from 'node:assert/strict';
import test from 'node:test';
import { Brain } from './brain.js';
import type { LlmJsonRequest, LlmProvider } from './llm.js';
import { renderProbe, runProbe } from './probe-folge.js';

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
