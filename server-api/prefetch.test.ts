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

test('prefetchKey: Folge, Teil, Teilezahl, Ausfallzähler und Zeitpunkt des letzten Teils', () => {
  assert.equal(prefetchKey(state()), '2:2:5:0:läuft:0');
  assert.notEqual(prefetchKey(state({ done: true })), prefetchKey(state()));
  assert.notEqual(prefetchKey(state({ miss: 1 })), prefetchKey(state()));
  // Punkt B2: Derselbe Teil, nach einem Stopp per Taste neu erzählt, hat einen anderen Zeitpunkt.
  assert.notEqual(prefetchKey(state({ at: 1_000 })), prefetchKey(state({ at: 2_000 })));
});

test('Teil nach einem Stopp neu erzählt (gleicher Teil, neuer Zeitpunkt): die alte Vorbereitung gilt nicht mehr (B2)', async () => {
  const made: number[] = [];
  const prefetcher = new StoryPrefetcher(async (s) => { made.push(s.at); return result({ speech: `nach ${s.at}` }); }, { ttlMs: 60_000 });
  prefetcher.start('d', state({ at: 1_000 }));
  prefetcher.start('d', state({ at: 2_000 }));
  assert.deepEqual(made, [1_000, 2_000], 'der neu erzählte Teil bekommt eine eigene Vorbereitung');
  assert.equal(await prefetcher.take('d', state({ at: 1_000 }), 1000), null, 'die Vorbereitung zum alten Teil passt nicht');
  prefetcher.start('d', state({ at: 2_000 }));
  assert.equal((await prefetcher.take('d', state({ at: 2_000 }), 1000))?.speech, 'nach 2000');
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

test('keine Vorbereitung ohne bisherige Geschichte oder wenn ausgeschaltet', () => {
  let calls = 0;
  const produce = async () => { calls++; return result(); };
  const prefetcher = new StoryPrefetcher(produce, { ttlMs: 60_000 });
  prefetcher.start('a', cleanState({}));
  assert.equal(calls, 0);
  assert.equal(prefetcher.size, 0);
  const off = new StoryPrefetcher(produce, { ttlMs: 60_000, enabled: false });
  off.start('c', state());
  assert.equal(calls, 0);
});

test('Folge beendet: der Anfang der nächsten Folge wird vorbereitet, die alte Vorbereitung ersetzt', async () => {
  const seen: StoryState[] = [];
  const prefetcher = new StoryPrefetcher(async (s) => { seen.push(s); return result({ speech: s.done ? 'neue Folge' : 'Teil' }); }, { ttlMs: 60_000 });
  prefetcher.start('d', state());
  const ended = state({ part: 5, done: true });
  prefetcher.start('d', ended);
  assert.equal(seen.length, 2);
  assert.equal(await prefetcher.take('d', state(), 100), null, 'alter Stand passt nicht mehr');
  prefetcher.start('d', ended);
  assert.equal((await prefetcher.take('d', ended, 1000))?.speech, 'neue Folge');
});

test('Folgenanfang gilt länger als ein Teil mitten in der Folge', async () => {
  let now = 0;
  const prefetcher = new StoryPrefetcher(async () => result(), { ttlMs: 1000, nextEpisodeTtlMs: 100_000, now: () => now });
  const ended = state({ part: 5, done: true });
  prefetcher.start('a', ended);
  prefetcher.start('b', state());
  now = 50_000;
  assert.ok(await prefetcher.take('a', ended, 100), 'Folgenanfang nach 50 s noch da');
  assert.equal(await prefetcher.take('b', state(), 100), null, 'Teil mitten in der Folge verfallen');
});

test('purge löscht abgelaufene Vorbereitungen auch ohne Abholen, gültige bleiben', async () => {
  let now = 0;
  const prefetcher = new StoryPrefetcher(async () => result(), { ttlMs: 1000, nextEpisodeTtlMs: 100_000, now: () => now });
  const ended = state({ part: 5, done: true });
  prefetcher.start('mitten', state());
  prefetcher.start('ende', ended);
  now = 5000;
  assert.equal(prefetcher.purge(), 1);
  assert.equal(prefetcher.has('mitten'), false, 'Teil mitten in der Folge nach 30-min-Frist (hier 1 s) weg');
  assert.equal(prefetcher.has('ende'), true, 'Folgenanfang mit längerer Frist bleibt');
  now = 200_000;
  assert.equal(prefetcher.purge(), 1);
  assert.equal(prefetcher.size, 0);
});
