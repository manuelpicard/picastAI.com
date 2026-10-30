import assert from 'node:assert/strict';
import test from 'node:test';
import { screen } from './safety.js';

test('screen flags child statements that match the safety patterns', () => {
  const flagged = [
    'Mama hat mich gehauen',
    'Es brennt in der Küche',
    'Ich habe mich verlaufen',
    'Ich habe Tabletten genommen',
    'Papa schlägt mich manchmal',
  ];
  for (const text of flagged) {
    assert.equal(screen(text), true, `expected flag for: ${text}`);
  }
});

test('screen does not flag ordinary child questions and story requests', () => {
  const ordinary = [
    'Wie viele Sterne gibt es am Himmel?',
    'Erzähl mir eine Geschichte über einen Drachen',
    'Warum ist der Himmel blau?',
    'Ich habe Hunger',
  ];
  for (const text of ordinary) {
    assert.equal(screen(text), false, `unexpected flag for: ${text}`);
  }
});

test('screen returns false for empty input', () => {
  assert.equal(screen(''), false);
});
