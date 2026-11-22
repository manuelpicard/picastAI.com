import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanState, type StoryState } from './brain.js';
import { STORY_CLOSING } from './prompts.js';
import { heardUpTo, joinHeard, MAX_HEARD_CHARS, PART_HOLD_MS, PENDING_STOP_TTL_MS, speechParagraphs, StopPoints, TURN_ID_PATTERN, type SpokenPart } from './stopp.js';

// Ein Teil mit drei Absätzen und dem festen Abschluss. Alle Sätze sind gleich lang (20 Zeichen).
const P1 = 'Kunibert stand auf. Er aß einen Brei.';
const P2 = 'Die Kutsche fuhr los. Der Weg war weit.';
const P3 = 'Die Hexe winkte ihm. Sie gab ihm Brot.';
const SPEECH = `${P1}\n\n${P2}\n\n${P3}\n\n${STORY_CLOSING}`;

/** Ton-Strom: je Absatz 10 s, dazwischen 1 s Pause; der Abschluss 4 s. */
const streamed: SpokenPart = { paragraphs: speechParagraphs(SPEECH), seconds: [10, 10, 10, 4], totalSeconds: 37, pauseSeconds: 1 };

const state = (over: Partial<StoryState> = {}): StoryState => ({ ...cleanState({}), ep: 3, part: 2, target: 5, plan: 'Plan', at: 1, ...over });
const before = state({ part: 1, summary: 'Teil 1' });
const TURN = 't_AAAAAAAAAAAAAAAA';
const OTHER = 't_BBBBBBBBBBBBBBBB';

test('speechParagraphs: Absätze in der Reihenfolge des Tons, der Abschluss zuletzt', () => {
  assert.deepEqual(speechParagraphs(SPEECH), [P1, P2, P3, STORY_CLOSING]);
  assert.deepEqual(speechParagraphs(''), []);
});

test('heardUpTo mit Ton-Strom: nur ganz gehörte Sätze zählen', () => {
  assert.deepEqual(heardUpTo(streamed, 0), { heard: '', complete: false, sentences: 0, total: 6 });
  assert.equal(heardUpTo(streamed, 4).heard, '', 'der erste Satz endet erst bei etwa 5 s');
  assert.equal(heardUpTo(streamed, 6).heard, 'Kunibert stand auf.');
  assert.equal(heardUpTo(streamed, 10.5).heard, P1, 'in der Pause nach dem ersten Absatz');
  // Zweiter Absatz von 11 s bis 21 s: Sein erster Satz endet bei etwa 16 s.
  assert.equal(heardUpTo(streamed, 15).heard, P1);
  assert.equal(heardUpTo(streamed, 17).heard, `${P1} Die Kutsche fuhr los.`);
  const nearlyAll = heardUpTo(streamed, 30);
  assert.equal(nearlyAll.complete, false);
  assert.equal(nearlyAll.sentences, 5);
});

test('heardUpTo: Stopp erst im Abschluss oder danach heißt „alles gehört“', () => {
  assert.equal(heardUpTo(streamed, 32.5).complete, true, 'im Abschluss');
  assert.equal(heardUpTo(streamed, 500).complete, true, 'nach dem Ende');
  assert.equal(heardUpTo(streamed, 32.5).sentences, 6);
});

test('heardUpTo ohne Ton-Strom: Die Tonlänge verteilt sich nach der Länge des Texts', () => {
  const whole: SpokenPart = { ...streamed, seconds: null, totalSeconds: 40 };
  const chars = streamed.paragraphs.reduce((sum, p) => sum + p.length, 0);
  const firstParagraphEnd = (40 * P1.length) / chars;
  assert.equal(heardUpTo(whole, firstParagraphEnd - 0.5).heard, 'Kunibert stand auf.');
  assert.equal(heardUpTo(whole, firstParagraphEnd + 0.01).heard, P1);
  assert.equal(heardUpTo(whole, 40).complete, true);
});

test('heardUpTo: Sekunden je Absatz passen nicht zu den Absätzen: wie ohne Ton-Strom', () => {
  const mismatch: SpokenPart = { ...streamed, seconds: [10, 10] };
  assert.deepEqual(heardUpTo(mismatch, 12), heardUpTo({ ...streamed, seconds: null }, 12));
});

test('joinHeard: hängt an und kürzt vom Anfang her', () => {
  assert.equal(joinHeard('', 'B.'), 'B.');
  assert.equal(joinHeard('A.', ''), 'A.');
  assert.equal(joinHeard('A.', 'B.'), 'A. B.');
  const long = joinHeard('x'.repeat(MAX_HEARD_CHARS), 'Ende.');
  assert.equal(long.length, MAX_HEARD_CHARS);
  assert.ok(long.endsWith('Ende.'));
});

test('TURN_ID_PATTERN: nur Kennungen, wie AudioStore und StreamRegistry sie vergeben', () => {
  assert.ok(TURN_ID_PATTERN.test(TURN));
  assert.ok(TURN_ID_PATTERN.test('t_a-b_c0123456789Z'));
  assert.ok(!TURN_ID_PATTERN.test('t_kurz'));
  assert.ok(!TURN_ID_PATTERN.test('../t_AAAAAAAAAAAAAAAA'));
  assert.ok(!TURN_ID_PATTERN.test('t_AAAAAAAAAAAAAAAA\n'));
});

test('StopPoints: Stopp mitten im Teil wird zur Stelle für die nächste Idee', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  assert.equal(stops.resumeFor('d', state()), undefined, 'ohne Meldung keine Stelle');
  const outcome = stops.stopped('d', TURN, 17);
  assert.deepEqual(outcome, { outcome: 'gemerkt', part: 2, target: 5, sentences: 3, total: 6 });
  const resume = stops.resumeFor('d', state());
  assert.equal(resume?.before, before);
  assert.equal(resume?.heard, `${P1} Die Kutsche fuhr los.`);
  assert.ok(resume && resume.at > 0, 'mit dem Zeitpunkt des Stopps');
});

test('StopPoints: Stopp im Abschluss ändert nichts', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  assert.deepEqual(stops.stopped('d', TURN, 33), { outcome: 'ganz_gehoert', part: 2, target: 5 });
  assert.equal(stops.resumeFor('d', state()), undefined);
});

test('StopPoints: Meldung zu einer anderen Antwort (zum Beispiel einer Frage) ändert nichts', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  assert.deepEqual(stops.stopped('d', OTHER, 3), { outcome: 'wartet' });
  assert.equal(stops.resumeFor('d', state()), undefined);
  // Eine Frage danach ändert die gemerkte Stelle nicht; eine Meldung zum Teil gilt weiter.
  stops.stopped('d', TURN, 6);
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf.');
});

test('StopPoints: Ton-Strom: Meldung kommt vor dem Ende des Teils und gilt, sobald er fertig ist', () => {
  const stops = new StopPoints();
  assert.deepEqual(stops.stopped('d', TURN, 6), { outcome: 'wartet' });
  const applied = stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  assert.deepEqual(applied, { outcome: 'gemerkt', part: 2, target: 5, sentences: 1, total: 6 });
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf.');
});

test('StopPoints: wartende Meldung für einen anderen Teil oder zu alt: gilt nicht', () => {
  let now = 0;
  const stops = new StopPoints(24 * 60 * 60 * 1000, () => now);
  stops.stopped('d', OTHER, 6);
  assert.equal(stops.delivered('d', TURN, state(), { before, heard: '' }, streamed), null);
  assert.equal(stops.resumeFor('d', state()), undefined);
  stops.stopped('d', 't_CCCCCCCCCCCCCCCC', 6);
  now += PENDING_STOP_TTL_MS + 1;
  assert.equal(stops.delivered('d', 't_CCCCCCCCCCCCCCCC', state(), { before, heard: '' }, streamed), null, 'zu alt');
});

test('StopPoints: ein neuer Teil ersetzt die gemerkte Stelle', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  stops.delivered('d', OTHER, state({ part: 3 }), { before: state(), heard: '' }, streamed);
  assert.equal(stops.resumeFor('d', state({ part: 3 })), undefined);
});

test('StopPoints: Stelle gilt nur für genau den angehaltenen Teil einer laufenden Folge', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  assert.ok(stops.resumeFor('d', state()));
  assert.ok(stops.resumeFor('d', state({ miss: 1 })), 'nach einer Pause („Kunibert muss kurz überlegen“) gilt sie weiter');
  assert.equal(stops.resumeFor('d', state({ part: 3 })), undefined, 'anderer Teil');
  assert.equal(stops.resumeFor('d', state({ ep: 4 })), undefined, 'andere Folge');
  assert.equal(stops.resumeFor('d', state({ done: true })), undefined, 'Folge zu Ende');
  assert.equal(stops.resumeFor('d', undefined), undefined, 'kein Stand (zum Beispiel abgelaufen)');
  assert.equal(stops.resumeFor('anderes-geraet', state()), undefined);
});

test('StopPoints: zweiter Stopp im neu erzählten Teil hängt an das schon Gehörte an', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: 'Schon gehört.' }, streamed);
  stops.stopped('d', TURN, 6);
  assert.equal(stops.resumeFor('d', state())?.heard, 'Schon gehört. Kunibert stand auf.');
  stops.stopped('d', TURN, 1);
  assert.equal(stops.resumeFor('d', state())?.heard, 'Schon gehört.', 'sofort wieder angehalten: nur das Frühere');
});

test('StopPoints: Löschen und Verfallen 24 Stunden nach dem Stopp', () => {
  let now = 1;
  const stops = new StopPoints(24 * 60 * 60 * 1000, () => now);
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  assert.equal(stops.count, 1);
  stops.delete('d');
  assert.equal(stops.count, 0);
  assert.equal(stops.resumeFor('d', state()), undefined);

  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  now += 60_000;
  stops.stopped('d', TURN, 6);
  now += 24 * 60 * 60 * 1000 - 1;
  assert.ok(stops.resumeFor('d', state()), 'kurz vor Ablauf noch da');
  now += 1;
  assert.equal(stops.resumeFor('d', state()), undefined, 'verfallen');
  stops.purge();
  assert.equal(stops.count, 0);
});

test('StopPoints: Ohne Meldung ist der Teil nach 15 Minuten weg; nach einer Meldung bleibt nur die Stelle', () => {
  let now = 1;
  const stops = new StopPoints(24 * 60 * 60 * 1000, () => now);
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  now += PART_HOLD_MS;
  assert.equal(stops.count, 1, 'bis zum Ende der Frist noch da');
  now += 1;
  assert.equal(stops.count, 0, 'ohne Meldung danach ganz weg');
  assert.deepEqual(stops.stopped('d', TURN, 6), { outcome: 'wartet' }, 'eine späte Meldung findet nichts mehr');

  stops.delivered('d', OTHER, state(), { before, heard: '' }, streamed);
  stops.stopped('d', OTHER, 6);
  now += PART_HOLD_MS + 1;
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf.', 'die Stelle bleibt');
  assert.deepEqual(stops.stopped('d', OTHER, 17), { outcome: 'wartet' }, 'der Text des Teils ist weg: keine neue Schätzung');
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf.');
});

test('StopPoints: Nach dem letzten Teil einer Folge merkt sich der Server nichts', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  assert.equal(stops.delivered('d', OTHER, state({ part: 5, done: true }), { before: state({ part: 4 }), heard: '' }, streamed), null);
  assert.equal(stops.count, 0, 'auch die alte Stelle ist weg');
  assert.deepEqual(stops.stopped('d', OTHER, 6), { outcome: 'wartet' });
});

/** Was ein abgebrochener Strom gesprochen hat: Absätze mit je 10 s, am Ende ein leerer Abschluss (wie spokenStory in server.ts). */
const brokenOff = (...paragraphs: string[]): SpokenPart => ({
  paragraphs: [...paragraphs, ''],
  seconds: [...paragraphs.map(() => 10), 0],
  totalSeconds: paragraphs.length * 11,
  pauseSeconds: 1,
});

test('StopPoints.appendHeard: Gesprochenes aus einem abgebrochenen neu erzählten Teil kommt zur Stelle dazu', () => {
  const stops = new StopPoints();
  stops.appendHeard('d', OTHER, brokenOff('Nichts gemerkt.'));
  assert.equal(stops.count, 0);
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.appendHeard('d', OTHER, brokenOff('Ohne Stopp.'));
  assert.equal(stops.resumeFor('d', state()), undefined, 'ohne Stopp gibt es keine Stelle zum Fortschreiben');
  stops.stopped('d', TURN, 6);
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe. Sie lachte.', ''));
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe. Sie lachte.');
});

test('StopPoints.appendHeard: hat das Kind auch den neu erzählten Strom angehalten, zählt nur bis dahin', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  // Meldung zum neu erzählten Strom OTHER nach 6 s: Er ist noch nicht fertig, die Meldung wartet.
  assert.deepEqual(stops.stopped('d', OTHER, 6), { outcome: 'wartet' });
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe. Sie lachte laut und lange.', 'Das hörte das Kind nicht mehr.'));
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe.');
});

test('StopPoints.appendHeard: danach zählt keine späte Meldung zum ursprünglichen Teil mehr', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe.'));
  assert.deepEqual(stops.stopped('d', TURN, 17), { outcome: 'wartet' });
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe.', 'nichts Angehängtes geht verloren');
});

test('StopPoints.appendHeard: erst der Abbruch, dann die Meldung zum abgebrochenen Strom: Es zählt nur das Gehörte', () => {
  // Der Server ist schneller als die Wiedergabe: Der Strom bricht beim Server ab, während das Gerät ihn
  // noch spielt. Hält das Kind ihn dann an, kommt die Meldung erst nach dem Abbruch (Prüfung von PR #75).
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe. Sie lachte laut und lange.', 'Das hörte das Kind nicht mehr.'));
  assert.equal(
    stops.resumeFor('d', state())?.heard,
    'Kunibert stand auf. Dann kam die Hexe. Sie lachte laut und lange. Das hörte das Kind nicht mehr.',
    'ohne Meldung zählt alles Gesprochene'
  );
  assert.deepEqual(stops.stopped('d', OTHER, 6), { outcome: 'gemerkt', part: 2, target: 5, sentences: 1, total: 3 });
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe.');
  assert.equal(stops.resumeFor('d', state())?.before, before, 'weiter auf dem Stand vor dem Teil');
});

test('StopPoints.appendHeard: Meldung nach dem Abbruch, aber erst nach allem Gesprochenen: Die Stelle bleibt', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe.'));
  // Alles Gesprochene gehört heißt hier nicht „ganzer Teil gehört“: Der Teil selbst ist nicht zu Ende.
  assert.equal(stops.stopped('d', OTHER, 3599).outcome, 'gemerkt');
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe.');
  assert.equal(stops.stopped('d', OTHER, 0).outcome, 'gemerkt', 'eine zweite Meldung zum selben Strom rechnet neu');
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf.', 'die Stelle vor dem Strom geht nie verloren');
});

test('StopPoints.appendHeard: zweimal abgebrochen, dann gemeldet: Die Stellen hängen sich richtig an', () => {
  const stops = new StopPoints();
  stops.delivered('d', TURN, state(), { before, heard: '' }, streamed);
  stops.stopped('d', TURN, 6);
  stops.appendHeard('d', OTHER, brokenOff('Dann kam die Hexe.'));
  const THIRD = 't_CCCCCCCCCCCCCCCC';
  stops.appendHeard('d', THIRD, brokenOff('Sie lachte laut und lange.', 'Das hörte das Kind nicht mehr.'));
  assert.equal(stops.stopped('d', OTHER, 6).outcome, 'wartet', 'der vorige Strom zählt nicht mehr');
  assert.equal(stops.stopped('d', THIRD, 0).outcome, 'gemerkt');
  assert.equal(stops.resumeFor('d', state())?.heard, 'Kunibert stand auf. Dann kam die Hexe.');
});

test('heardUpTo: Satzgrenzen wie bei der Pocket-Stimme (wörtliche Rede, Kleinbuchstabe danach)', () => {
  const quoted: SpokenPart = {
    paragraphs: ['„Hallo!“ rief er. Dann ging er los.', STORY_CLOSING],
    seconds: [10, 4],
    totalSeconds: 15,
    pauseSeconds: 1,
  };
  assert.equal(heardUpTo(quoted, 3).heard, '', 'mitten im ersten Satz');
  assert.equal(heardUpTo(quoted, 6).heard, '„Hallo!“ rief er.', 'der ganze erste Satz, nicht nur „Hallo!“');
  assert.equal(heardUpTo(quoted, 6).total, 2);
});
