import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidPauseMs,
  paragraphPauseMs,
  planSpeechSegments,
  sentencePauseMs,
  splitSpeechText,
  wordCount,
} from './speech-text.js';

const words = (count: number): string => Array.from({ length: count }, (_, index) => `wort${index}`).join(' ') + '.';

test('isValidPauseMs: ganze Millisekunden von 0 bis 2000', () => {
  for (const ok of ['0', '300', '500', '2000']) assert.equal(isValidPauseMs(ok), true, ok);
  for (const bad of ['', '-1', '2001', '12345', '1.5', '500ms', 'kurz', ' 5']) assert.equal(isValidPauseMs(bad), false, bad);
});

test('wordCount und sentencePauseMs: kurze Sätze kürzer, lange länger, dazwischen die Grundpause', () => {
  assert.equal(wordCount('  Wer  ist da? '), 3);
  assert.equal(wordCount(''), 0);
  assert.equal(sentencePauseMs(words(3), 500), 300);
  assert.equal(sentencePauseMs(words(4), 500), 500);
  assert.equal(sentencePauseMs(words(14), 500), 500);
  assert.equal(sentencePauseMs(words(15), 500), 600);
  assert.equal(sentencePauseMs(words(8), 0), 0);
});

test('paragraphPauseMs: Absatzpause ist 1,8-mal die Grundpause', () => {
  assert.equal(paragraphPauseMs(500), 900);
  assert.equal(paragraphPauseMs(0), 0);
  assert.equal(paragraphPauseMs(300), 540);
});

test('splitSpeechText: Standardgröße 4000 Bytes, kurzer Text bleibt ein Stück', () => {
  assert.deepEqual(splitSpeechText(''), []);
  assert.deepEqual(splitSpeechText(' Es war einmal. '), ['Es war einmal.']);
});

test('planSpeechSegments: leerer Text ergibt nichts', () => {
  assert.deepEqual(planSpeechSegments('', 500), []);
  assert.deepEqual(planSpeechSegments(' \n \t\n', 500), []);
});

test('planSpeechSegments: ein Satz je Stück, Pause nach Satzlänge, nach dem letzten Satz keine', () => {
  const long = words(15);
  assert.deepEqual(planSpeechSegments(`Es war einmal ein Ritter. ${long} Er ritt durch den dunklen Wald.`, 500), [
    { text: 'Es war einmal ein Ritter.', pauseAfterMs: 500 },
    { text: long, pauseAfterMs: 600 },
    { text: 'Er ritt durch den dunklen Wald.', pauseAfterMs: 0 },
  ]);
});

test('planSpeechSegments: sehr kurze Sätze werden mit dem Nachbarn zusammen gesprochen', () => {
  assert.deepEqual(planSpeechSegments('Es blieb still. Zwischen den Bäumen funkelten zwei große Augen. Kunibert holte tief Luft.', 500), [
    { text: 'Es blieb still. Zwischen den Bäumen funkelten zwei große Augen.', pauseAfterMs: 500 },
    { text: 'Kunibert holte tief Luft.', pauseAfterMs: 0 },
  ]);
  // Ein kurzer letzter Satz geht zum vorigen.
  assert.deepEqual(planSpeechSegments('Kunibert ritt heim und schlief tief. Gute Nacht!', 500), [
    { text: 'Kunibert ritt heim und schlief tief. Gute Nacht!', pauseAfterMs: 0 },
  ]);
  // Ein einzelner kurzer Satz bleibt, wie er ist.
  assert.deepEqual(planSpeechSegments('Hallo!', 500), [{ text: 'Hallo!', pauseAfterMs: 0 }]);
});

test('planSpeechSegments: wörtliche Rede wird nicht mitten im Satz zerschnitten', () => {
  assert.deepEqual(planSpeechSegments('„Wer ist da?“, rief er. Niemand antwortete heute Nacht.', 500), [
    { text: '„Wer ist da?“, rief er.', pauseAfterMs: 500 },
    { text: 'Niemand antwortete heute Nacht.', pauseAfterMs: 0 },
  ]);
});

test('planSpeechSegments: nach dem letzten Satz eines Absatzes die längere Absatzpause', () => {
  assert.deepEqual(
    planSpeechSegments('Eins zwei drei vier fünf. Sechs sieben acht neun zehn.\n\nElf zwölf dreizehn vierzehn fünfzehn.\n', 500),
    [
      { text: 'Eins zwei drei vier fünf.', pauseAfterMs: 500 },
      { text: 'Sechs sieben acht neun zehn.', pauseAfterMs: 900 },
      { text: 'Elf zwölf dreizehn vierzehn fünfzehn.', pauseAfterMs: 0 },
    ]
  );
});

test('planSpeechSegments: Pause 0 ergibt überall 0', () => {
  const segments = planSpeechSegments('Eins zwei drei vier fünf. Sechs sieben acht neun zehn.\nElf zwölf dreizehn vierzehn fünfzehn.', 0);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((segment) => segment.pauseAfterMs), [0, 0, 0]);
});

test('planSpeechSegments: ein zu langer Satz wird an Wortgrenzen geteilt, ohne Pause mitten im Satz; nichts geht verloren', () => {
  const sentence = Array.from({ length: 300 }, (_, index) => `wort${index}`).join(' ') + '.';
  const text = `Zuerst kommt ein kurzer Satz hier. ${sentence} Danach noch ein Satz zum Schluss.`;
  const segments = planSpeechSegments(text, 500, 200);
  assert.ok(segments.length > 4);
  for (const segment of segments) assert.ok(Buffer.byteLength(segment.text, 'utf8') <= 200);
  // Pausen gibt es nur nach ganzen Sätzen.
  const pauses = segments.filter((segment) => segment.pauseAfterMs > 0);
  assert.equal(pauses.length, 2);
  assert.equal(segments.map((segment) => segment.text).join(' '), text);
});

test('planSpeechSegments: Steuerzeichen werden zu Leerzeichen', () => {
  assert.deepEqual(planSpeechSegments('Es\u0000war einmal ein Ritter.', 500), [{ text: 'Es war einmal ein Ritter.', pauseAfterMs: 0 }]);
});
