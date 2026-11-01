import assert from 'node:assert/strict';
import test from 'node:test';
import { screen, screenOutput } from './safety.js';

// Sätze, bei denen die Sicherheitsweiche anschlagen MUSS.
const MUST_TRIGGER = [
  'ich will nicht mehr leben',
  'ich möchte sterben',
  'ich will mir wehtun',
  'ich bring mich um',
  'ich bringe mich um',
  'ich wäre lieber tot',
  'ich will nicht mehr da sein',
  'mein papa schlägt mich',
  'er hat mich geschlagen',
  'jemand hat mich angefasst',
  'mein onkel fasst mich immer an',
  'keiner darf wissen was er mit mir macht',
  'ich soll es niemandem sagen',
  'ich hab mich verlaufen',
  'es brennt',
  'ich habe keine luft',
  'ich kann nicht atmen',
  'ich hab tabletten geschluckt',
  'ich habe tabletten genommen',
  'mama bewegt sich nicht',
  'mama liegt am boden und bewegt sich nicht',
];

// Alltägliche Sätze, die NICHT anschlagen dürfen (Fehlalarme sind für Kinder
// verunsichernd und gehören deshalb ebenfalls getestet).
const MUST_NOT_TRIGGER = [
  'wie hoch ist der himmel',
  'warum ist der himmel blau',
  'ich will nicht sterben',
  'der drache hat den ritter geschlagen',
  'mein bauch tut mir weh',
  'der drache bewegt sich nicht',
  'mama küsst mich',
  'mama zieht mich an',
  'der ritter fasst den drachen an',
  'ich bring mich um den schlaf',
  'was macht ein drache den ganzen tag',
  'ich möchte nicht mehr warten',
  'erzähl mir eine geschichte',
];

test('Eingabe-Weiche erkennt Notlagen', async (t) => {
  for (const sentence of MUST_TRIGGER) {
    await t.test(sentence, () => assert.equal(screen(sentence), true));
  }
});

test('Eingabe-Weiche lässt Alltagssätze durch', async (t) => {
  for (const sentence of MUST_NOT_TRIGGER) {
    await t.test(sentence, () => assert.equal(screen(sentence), false));
  }
});

test('Eingabe-Weiche ist robust gegen Groß-/Kleinschreibung und Satzzeichen', () => {
  assert.equal(screen('Ich WILL nicht mehr leben!!!'), true);
  assert.equal(screen('  Ich,  hab   mich   verlaufen. '), true);
  assert.equal(screen(''), false);
});

test('Ausgabe-Check weist ungeeignete Texte ab', () => {
  assert.equal(screenOutput('Der Drache war tot.', 'story'), true);
  assert.equal(screenOutput('Der Ritter blutete am Arm.', 'story'), true);
  assert.equal(screenOutput('Schau auf https://example.com', 'answer'), true);
  assert.equal(screenOutput('Wie heißt du eigentlich?', 'answer'), true);
});

test('Ausgabe-Check lässt kindgerechte Texte durch', () => {
  assert.equal(screenOutput('Kunibert ging über die Brücke und sah den Drachen.', 'story'), false);
  assert.equal(screenOutput('Der Drache war müde und schlief ein.', 'story'), false);
  assert.equal(screenOutput('Der Himmel ist blau, weil das Licht gestreut wird.', 'answer'), false);
  assert.equal(screenOutput('', 'story'), false);
});
