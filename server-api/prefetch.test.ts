import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanState, type StoryState, type TurnResult } from './brain.js';
import { prefetchKey, StoryPrefetcher } from './prefetch.js';

const state = (over: Partial<StoryState> = {}): StoryState => ({ ...cleanState({}), ep: 2, part: 2, target: 5, ...over });
const result = (over: Partial<TurnResult> = {}): TurnResult => ({
  kind: 'weiter',
  speech: 'Teil',
  story_state: state({ part: 3 }),
  wav: Buffer.from('RIFF0000WAVE'),
  ...over,
});

test('prefetchKey: Folge, Teil, Teilezahl und Ausfallzähler', () => {
  assert.equal(prefetchKey(state()), '2:2:5:0');
  assert.notEqual(prefetchKey(state({ miss: 1 })), prefetchKey(state()));
});

test('vorbereiteter Teil wird zum passenden Stand genau einmal abgeholt', async () => {
  let calls = 0;
  const prefetcher = new StoryPrefetcher(async () => { calls++; return result(); }, { ttlMs: 60_000 });
  prefetcher.start('d', state());
  prefetcher.start('d', state()); // gleicher Stand: keine zweite Erzeugung
  assert.equal(calls, 1);
  assert.equal(prefetcher.has('d'), true);
  const taken = await prefetcher.take('d', state(), 1000);
  assert.equal(taken?.speech, 'Teil');
  assert.equal(prefetcher.has('d'), false);
  assert.equal(await prefetcher.take('d', state(), 1000), null);
});

test('anderer Stand (zum Beispiel nach einer Idee des Kindes): verworfen', async () => {
  const prefetcher = new StoryPrefetcher(async () => result(), { ttlMs: 60_000 });
  prefetcher.start('d', state());
  assert.equal(await prefetcher.take('d', state({ part: 3 }), 1000), null);
  assert.equal(prefetcher.has('d'), false);
});

test('abgelaufen: verworfen', async () => {
  let now = 0;
  const prefetcher = new StoryPrefetcher(async () => result(), { ttlMs: 1000, now: () => now });
  prefetcher.start('d', state());
  now = 5000;
  assert.equal(await prefetcher.take('d', state(), 1000), null);
});

test('Pause, fester Text, leerer Ton oder Fehler taugen nicht als Vorbereitung', async () => {
  for (const produce of [
    async () => result({ fixed: 'pause' }),
    async () => result({ wav: Buffer.alloc(0) }),
    async () => null,
    async () => { throw new Error('HTTP 529'); },
  ]) {
    const prefetcher = new StoryPrefetcher(produce, { ttlMs: 60_000 });
    prefetcher.start('d', state());
    assert.equal(await prefetcher.take('d', state(), 1000), null);
  }
});

test('noch in Arbeit: take wartet höchstens waitMs', async () => {
  let release: (value: TurnResult) => void = () => undefined;
  const prefetcher = new StoryPrefetcher(() => new Promise<TurnResult>((resolve) => { release = resolve; }), { ttlMs: 60_000 });
  prefetcher.start('d', state());
  const started = Date.now();
  assert.equal(await prefetcher.take('d', state(), 30), null, 'nach der Wartezeit: nichts');
  assert.ok(Date.now() - started < 1000);

  prefetcher.start('d', state());
  const pending = prefetcher.take('d', state(), 5000);
  setTimeout(() => release(result({ speech: 'spät' })), 20);
  assert.equal((await pending)?.speech, 'spät');
});

test('keine Vorbereitung ohne laufende Folge, nach dem Ende oder wenn ausgeschaltet', () => {
  let calls = 0;
  const produce = async () => { calls++; return result(); };
  const prefetcher = new StoryPrefetcher(produce, { ttlMs: 60_000 });
  prefetcher.start('a', cleanState({}));
  prefetcher.start('b', state({ done: true }));
  assert.equal(calls, 0);
  assert.equal(prefetcher.size, 0);
  const off = new StoryPrefetcher(produce, { ttlMs: 60_000, enabled: false });
  off.start('c', state());
  assert.equal(calls, 0);
});

test('Folge beendet: alte Vorbereitung des Geräts wird verworfen', () => {
  const prefetcher = new StoryPrefetcher(async () => result(), { ttlMs: 60_000 });
  prefetcher.start('d', state());
  prefetcher.start('d', state({ done: true }));
  assert.equal(prefetcher.has('d'), false);
});
