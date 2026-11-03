import assert from 'node:assert/strict';
import test from 'node:test';
import { Brain, cleanState, trimWords } from './brain.js';
import type { LlmJsonRequest, LlmProvider } from './llm.js';
import { EPISODE_CLOSING, STORY_CLOSING } from './prompts.js';
import { SAFETY_RESPONSE_DE, UNCLEAR_RESPONSE_DE } from './safety.js';

/** Fake-Anbieter: liefert vorbereitete Antworten oder wirft vorbereitete Fehler. */
class FakeLlm implements LlmProvider {
  readonly name = 'gemini' as const;
  readonly model = 'fake';
  calls: LlmJsonRequest[] = [];
  constructor(private responses: Array<Record<string, unknown> | Error>) {}
  async generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (!next) throw new Error('keine Antwort vorbereitet');
    if (next instanceof Error) throw next;
    return next;
  }
}

const answer = (speech: string, category = 'frage') => ({ category, speech });
const story = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  summary: 'Zusammenfassung',
  open_threads: 'offener Faden',
  next_hook: 'Anknüpfung',
  episode_finished: false,
  ...extra,
});

const silent = <T>(fn: () => Promise<T>) => async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
};

test('Sicherheitsweiche greift vor dem Sprachmodell: es wird nie gefragt', async () => {
  const llm = new FakeLlm([]);
  const result = await new Brain(llm).handle('frage', 'ich will nicht mehr leben', {});
  assert.equal(result.kind, 'hinweis');
  assert.equal(result.fixed, 'sicherheit');
  assert.equal(result.speech, SAFETY_RESPONSE_DE);
  assert.equal(llm.calls.length, 0);
});

test('Auch im Geschichten-Modus gilt die Sicherheitsweiche für den Wunsch des Kindes', async () => {
  const llm = new FakeLlm([]);
  const result = await new Brain(llm).handle('geschichte', 'mein papa schlägt mich', {});
  assert.equal(result.fixed, 'sicherheit');
  assert.equal(llm.calls.length, 0);
});

test('Leere Frage: freundliche Rückfrage ohne Sprachmodell', async () => {
  const llm = new FakeLlm([]);
  const result = await new Brain(llm).handle('frage', '   ', {});
  assert.equal(result.fixed, 'unklar');
  assert.equal(result.speech, UNCLEAR_RESPONSE_DE);
  assert.equal(llm.calls.length, 0);
});

test('Frage: Antwort des Modells wird gekürzt ausgeliefert und enthält Audio', async () => {
  const llm = new FakeLlm([answer('Der Himmel ist blau, weil Licht gestreut wird.')]);
  const result = await new Brain(llm).handle('frage', 'warum ist der himmel blau', {});
  assert.equal(result.kind, 'frage');
  assert.equal(result.speech, 'Der Himmel ist blau, weil Licht gestreut wird.');
  assert.ok(result.wav && result.wav.length > 44);
  assert.equal(llm.calls.length, 1);
  assert.match(llm.calls[0].user, /warum ist der himmel blau/);
  assert.equal(llm.calls[0].schemaName, 'kunibert_antwort');
});

test('Modell stuft als Sicherheitsfall ein: feste Sicherheitsansage statt Modelltext', async () => {
  const llm = new FakeLlm([answer('irgendwas', 'sicherheit')]);
  const result = await new Brain(llm).handle('frage', 'es ist so komisch zu hause', {});
  assert.equal(result.fixed, 'sicherheit');
  assert.equal(result.speech, SAFETY_RESPONSE_DE);
});

test('Modell erkennt Geschichtenwunsch: zweiter Aufruf erzählt Teil 1', async () => {
  const llm = new FakeLlm([answer('', 'geschichte'), story('Kunibert ging über die Brücke.')]);
  const result = await new Brain(llm).handle('frage', 'erzähl mir was vom ritter', {});
  assert.equal(result.kind, 'geschichte');
  assert.equal(result.story_state.part, 1);
  assert.equal(result.story_state.done, false);
  assert.ok(result.speech.endsWith(STORY_CLOSING));
  assert.equal(llm.calls.length, 2);
  assert.equal(llm.calls[1].schemaName, 'kunibert_geschichte');
});

test('Ausgabe-Check: Link in der Antwort wird verworfen, es kommt der feste Fallback',
  silent(async () => {
    const llm = new FakeLlm([answer('Schau mal auf https://example.com nach.')]);
    const result = await new Brain(llm).handle('frage', 'wer ist ritter kunibert', {});
    assert.equal(result.kind, 'frage');
    assert.ok(!result.speech.includes('http'));
    assert.match(result.speech, /Ritter Kunibert ist ein mutiger/);
  })
);

test('Ausgabe-Check: Geschichte mit Tod wird verworfen, Fallback-Geschichte rückt den Stand vor',
  silent(async () => {
    const llm = new FakeLlm([story('Der Drache war tot.')]);
    const result = await new Brain(llm).handle('geschichte', 'de-DE 6-10', {});
    assert.match(result.speech, /Dachzimmer/);
    assert.ok(!/\btot\b/i.test(result.speech));
    assert.equal(result.story_state.part, 1);
  })
);

test('Modellfehler: Frage fällt auf feste Antwort zurück, ohne Ausnahme',
  silent(async () => {
    const llm = new FakeLlm([new Error('HTTP 503')]);
    const result = await new Brain(llm).handle('frage', 'warum ist der himmel blau', {});
    assert.equal(result.kind, 'frage');
    assert.match(result.speech, /blau/);
  })
);

test('Modellfehler: Geschichte fällt auf Fallback-Geschichte zurück',
  silent(async () => {
    const llm = new FakeLlm([new Error('Zeitüberschreitung')]);
    const result = await new Brain(llm).handle('geschichte', 'de-DE 6-10', {});
    assert.equal(result.kind, 'geschichte');
    assert.equal(result.story_state.part, 1);
  })
);

test('Ohne Anbieter: Fallbacks funktionieren und llmName ist "none"', async () => {
  const brain = new Brain(null);
  assert.equal(brain.llmName, 'none');
  const question = await brain.handle('frage', 'wer ist ritter kunibert', {});
  assert.equal(question.kind, 'frage');
  const storyResult = await brain.handle('frage', 'erzähl mir eine geschichte', {});
  assert.equal(storyResult.kind, 'geschichte');
});

test('llmName nennt Anbieter und Modell', () => {
  assert.equal(new Brain(new FakeLlm([])).llmName, 'gemini:fake');
});

test('Finale: letzter Teil beendet die Folge und hängt den Folgenabschluss an', async () => {
  const state = { v: 1, ep: 1, part: 4, target: 5, seed: 'Nebel', summary: 'bisher', threads: 'Faden', hook: 'weiter', done: false };
  const llm = new FakeLlm([story('Kunibert schlief im Dachzimmer ein.')]);
  const result = await new Brain(llm).handle('weiter', '', state);
  assert.equal(result.kind, 'weiter');
  assert.equal(result.story_state.part, 5);
  assert.equal(result.story_state.done, true);
  assert.equal(result.story_state.threads, '');
  assert.ok(result.speech.endsWith(EPISODE_CLOSING));
  assert.match(llm.calls[0].user, /Teil 5 von 5/);
});

test('Zwischenteil übernimmt Zusammenfassung, offene Fäden und Anknüpfung in den Stand', async () => {
  const state = { v: 1, ep: 2, part: 1, target: 5, seed: 'Nebel', summary: 'alt', threads: 'alt', hook: 'alt', done: false };
  const llm = new FakeLlm([story('Kunibert traf die Hexe.', { summary: 'neu', open_threads: 'Trank', next_hook: 'Berg' })]);
  const result = await new Brain(llm).handle('weiter', '', state);
  assert.equal(result.story_state.part, 2);
  assert.equal(result.story_state.summary, 'neu');
  assert.equal(result.story_state.threads, 'Trank');
  assert.equal(result.story_state.hook, 'Berg');
  assert.match(llm.calls[0].user, /Bisher: alt/);
});

test('cleanState begrenzt Werte und setzt ungültige Zustände zurück', () => {
  assert.equal(cleanState(null).part, 0);
  assert.equal(cleanState({ v: 2 }).ep, 1);
  const cleaned = cleanState({ v: 1, ep: 99999, part: 99, target: 100, summary: 'x'.repeat(2000) });
  assert.equal(cleaned.ep, 10000);
  assert.equal(cleaned.part, 50);
  assert.equal(cleaned.target, 12);
  assert.equal(cleaned.summary.length, 700);
});

test('trimWords kürzt an einer Satzgrenze', () => {
  assert.equal(trimWords('Eins zwei drei. Vier fünf sechs. Sieben acht neun.', 7), 'Eins zwei drei. Vier fünf sechs.');
  assert.equal(trimWords('kurz', 10), 'kurz');
});
