import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanState, type StoryState } from './brain.js';
import { STORY_STATE_TTL_MS, StoryStateStore } from './story-states.js';

const HOUR = 60 * 60 * 1000;
const state = (over: Partial<StoryState> = {}): StoryState => ({ ...cleanState({}), ep: 3, part: 2, target: 5, ...over });

test('Frist (vorläufig, M9): 24 Stunden', () => {
  assert.equal(STORY_STATE_TTL_MS, 24 * HOUR);
});

test('ohne gespeicherten Stand: undefined (die Erzähltaste beginnt eine neue Folge)', () => {
  const store = new StoryStateStore();
  assert.equal(store.get('geraet-a'), undefined);
  assert.equal(store.count, 0);
});

test('Stand verfällt 24 Stunden nach dem letzten Speichern, nicht früher', () => {
  let now = 0;
  const store = new StoryStateStore(STORY_STATE_TTL_MS, () => now);
  store.set('geraet-a', state());
  now = 24 * HOUR - 1;
  assert.equal(store.get('geraet-a')?.ep, 3, 'kurz vor Ablauf noch da');
  now = 24 * HOUR;
  assert.equal(store.get('geraet-a'), undefined, 'nach 24 Stunden weg');
  assert.equal(store.count, 0);
});

test('Nutzung verlängert: jedes Speichern setzt die Frist neu', () => {
  let now = 0;
  const store = new StoryStateStore(STORY_STATE_TTL_MS, () => now);
  store.set('geraet-a', state({ part: 1 }));
  now = 20 * HOUR;
  store.set('geraet-a', state({ part: 2 }));
  now = 40 * HOUR;
  assert.equal(store.get('geraet-a')?.part, 2, '20 Stunden nach dem letzten Teil noch da');
  now = 44 * HOUR;
  assert.equal(store.get('geraet-a'), undefined);
});

test('Lesen allein verlängert nicht', () => {
  let now = 0;
  const store = new StoryStateStore(STORY_STATE_TTL_MS, () => now);
  store.set('geraet-a', state());
  now = 23 * HOUR;
  assert.ok(store.get('geraet-a'));
  now = 24 * HOUR;
  assert.equal(store.get('geraet-a'), undefined);
});

test('purge räumt auch Geräte auf, die sich nie wieder melden, und nennt sie', () => {
  let now = 0;
  const store = new StoryStateStore(STORY_STATE_TTL_MS, () => now);
  store.set('alt', state());
  now = 10 * HOUR;
  store.set('neu', state());
  now = 25 * HOUR;
  assert.deepEqual(store.purge(), ['alt']);
  assert.equal(store.count, 1);
  assert.ok(store.get('neu'));
  assert.deepEqual(store.purge(), []);
});

test('delete vergisst den Stand; eine Antwort, die vorher begonnen hat, speichert danach nichts mehr', () => {
  const store = new StoryStateStore();
  store.set('geraet-a', state());
  store.set('geraet-b', state());
  const before = store.generation('geraet-a');
  store.delete('geraet-a');
  assert.equal(store.get('geraet-a'), undefined);
  assert.ok(store.get('geraet-b'), 'andere Geräte bleiben');
  assert.equal(store.set('geraet-a', state({ part: 3 }), before), false, 'alte Anfrage speichert nichts');
  assert.equal(store.get('geraet-a'), undefined);
  // Eine neue Anfrage (mit dem aktuellen Zähler) speichert wieder.
  assert.equal(store.set('geraet-a', state({ part: 1 }), store.generation('geraet-a')), true);
  assert.equal(store.get('geraet-a')?.part, 1);
  assert.equal(store.generation('geraet-b'), 0, 'der Zähler gilt je Gerät');
});
