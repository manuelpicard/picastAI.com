import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoryState } from './brain.js';
import { STORY_STATE_TTL_SECONDS, StoryStateStore } from './story-states.js';

/** Testhilfe: ein Stand mit den nötigen Feldern, Rest aus `fields`. */
function st(fields: Partial<StoryState>): StoryState {
  return { v: 1, ep: 1, part: 1, target: 3, seed: '', summary: '', threads: '', hook: '', done: false, ...fields };
}

const HOUR_MS = 60 * 60 * 1000;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('Ablauf ist vorläufig 24 Stunden', () => {
  assert.equal(STORY_STATE_TTL_SECONDS, 24 * 60 * 60);
});

test('unbekanntes Gerät bekommt einen leeren Stand', () => {
  const store = new StoryStateStore();
  assert.deepEqual(store.get('geraet-1'), {});
  assert.equal(store.count, 0);
});

test('Stand bleibt innerhalb der Frist erhalten', () => {
  const c = clock();
  const store = new StoryStateStore(STORY_STATE_TTL_SECONDS, c.now);
  store.set('geraet-1', st({ ep: 2, part: 1 }));
  c.advance(24 * HOUR_MS - 1);
  assert.deepEqual(store.get('geraet-1'), st({ ep: 2, part: 1 }));
});

test('Stand verfällt nach 24 Stunden ohne Nutzung', () => {
  const c = clock();
  const store = new StoryStateStore(STORY_STATE_TTL_SECONDS, c.now);
  store.set('geraet-1', st({ ep: 2, part: 1 }));
  c.advance(24 * HOUR_MS);
  assert.deepEqual(store.get('geraet-1'), {});
  assert.equal(store.count, 0);
});

test('neues Speichern setzt die Frist neu', () => {
  const c = clock();
  const store = new StoryStateStore(STORY_STATE_TTL_SECONDS, c.now);
  store.set('geraet-1', st({ ep: 1, part: 1 }));
  c.advance(20 * HOUR_MS);
  store.set('geraet-1', st({ ep: 1, part: 2 }));
  c.advance(20 * HOUR_MS);
  assert.deepEqual(store.get('geraet-1'), st({ ep: 1, part: 2 }));
});

test('bloßes Lesen verlängert die Frist nicht', () => {
  // Der Server speichert nach jeder Runde neu; ein Lesen ohne Runde soll den Stand nicht am Leben halten.
  const c = clock();
  const store = new StoryStateStore(STORY_STATE_TTL_SECONDS, c.now);
  store.set('geraet-1', st({ ep: 1 }));
  c.advance(20 * HOUR_MS);
  store.get('geraet-1');
  c.advance(5 * HOUR_MS);
  assert.deepEqual(store.get('geraet-1'), {});
});

test('purge räumt abgelaufene Einträge anderer Geräte auf', () => {
  const c = clock();
  const store = new StoryStateStore(STORY_STATE_TTL_SECONDS, c.now);
  store.set('alt', st({ ep: 1 }));
  c.advance(23 * HOUR_MS);
  store.set('neu', st({ ep: 3 }));
  c.advance(2 * HOUR_MS);
  assert.equal(store.purge(), 1);
  assert.equal(store.count, 1);
  assert.deepEqual(store.get('neu'), st({ ep: 3 }));
  assert.deepEqual(store.get('alt'), {});
});

test('delete vergisst den Stand sofort', () => {
  const store = new StoryStateStore();
  store.set('geraet-1', st({ ep: 1 }));
  assert.equal(store.delete('geraet-1'), true);
  assert.deepEqual(store.get('geraet-1'), {});
  assert.equal(store.delete('geraet-1'), false);
});

test('Geräte sehen nur ihren eigenen Stand', () => {
  const store = new StoryStateStore();
  store.set('a', st({ ep: 1 }));
  store.set('b', st({ ep: 2 }));
  assert.deepEqual(store.get('a'), st({ ep: 1 }));
  assert.deepEqual(store.get('b'), st({ ep: 2 }));
});
