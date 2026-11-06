import assert from 'node:assert/strict';
import test from 'node:test';
import { INTRO_TEXT_DE, INTRO_VERSION, introVersion } from './ansage.js';

test('Ansage sagt dem Kind, dass Kunibert kein Mensch ist und sich irren kann (KI-Hinweis)', () => {
  assert.match(INTRO_TEXT_DE, /Computer-Ritter, kein echter Mensch/);
  assert.match(INTRO_TEXT_DE, /Manchmal irre ich mich/);
});

test('Ansage nennt Sprechtaste und Lampe, rät von Nachname und Wohnort ab und verweist auf Erwachsene', () => {
  assert.match(INTRO_TEXT_DE, /nur zu, solange du die Taste drückst/);
  assert.match(INTRO_TEXT_DE, /leuchtet meine Lampe/);
  assert.match(INTRO_TEXT_DE, /nicht deinen Nachnamen und nicht, wo du wohnst/);
  assert.match(INTRO_TEXT_DE, /Geh zu einem Erwachsenen, dem du vertraust/);
});

test('Ansage enthält keine offenen Platzhalter und keine Steuerzeichen', () => {
  assert.doesNotMatch(INTRO_TEXT_DE, /[\[\]{}<>]/);
  assert.doesNotMatch(INTRO_TEXT_DE, /[\u0000-\u0009\u000B-\u001F]/, 'außer Zeilenumbruch kein Steuerzeichen');
});

test('Ansage ist vier Absätze lang und passt mit Abstand in eine Sprachanfrage', () => {
  assert.equal(INTRO_TEXT_DE.split('\n\n').length, 4);
  assert.ok(Buffer.byteLength(INTRO_TEXT_DE, 'utf8') < 800, 'unter dem Stückmaß der Sprachausgabe');
});

test('introVersion: 12 Hex-Zeichen, gleich für gleichen Text, anders bei jeder Änderung', () => {
  assert.match(INTRO_VERSION, /^[0-9a-f]{12}$/);
  assert.equal(introVersion(INTRO_TEXT_DE), INTRO_VERSION);
  assert.notEqual(introVersion(INTRO_TEXT_DE + ' '), INTRO_VERSION);
  assert.notEqual(introVersion(INTRO_TEXT_DE.replace('Mensch', 'Mann')), INTRO_VERSION);
});
