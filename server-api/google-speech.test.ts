import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GOOGLE_SPEAKING_RATE,
  DEFAULT_GOOGLE_VOICE,
  GOOGLE_TTS_ENDPOINT,
  buildGoogleRequest,
  googleLanguageCode,
  isValidGoogleApiKey,
  isValidGoogleVoiceName,
  isValidSpeakingRate,
  splitSpeechText,
  usableGoogleSettings,
} from './google-speech.js';

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

test('Der Endpunkt ist fest der EU-Endpunkt von Google', () => {
  assert.equal(GOOGLE_TTS_ENDPOINT, 'https://eu-texttospeech.googleapis.com/v1/text:synthesize');
});

test('Standardstimme ist Algenib (Chirp 3 HD, Deutsch)', () => {
  assert.equal(DEFAULT_GOOGLE_VOICE, 'de-DE-Chirp3-HD-Algenib');
  assert.ok(isValidGoogleVoiceName(DEFAULT_GOOGLE_VOICE));
  assert.equal(googleLanguageCode(DEFAULT_GOOGLE_VOICE), 'de-DE');
});

test('isValidGoogleVoiceName: Sprache-Land-Rest, sonst nichts', () => {
  for (const ok of ['de-DE-Chirp3-HD-Charon', 'de-DE-Neural2-B', 'de-AT-Chirp3-HD-Orus', 'fil-PH-Standard-A']) {
    assert.equal(isValidGoogleVoiceName(ok), true, ok);
  }
  for (const bad of ['', 'Algenib', 'de-Chirp3', 'DE-de-X', 'de-DE-', 'de-DE-x y', 'de-DE-"x"', 'de-DE-x/../y', 'de-DE-' + 'a'.repeat(61)]) {
    assert.equal(isValidGoogleVoiceName(bad), false, bad);
  }
});

test('isValidSpeakingRate: 0,25 bis 2,0 mit höchstens zwei Nachkommastellen', () => {
  for (const ok of ['0.25', '0.9', '0.95', '1', '1.0', '2', '2.0']) assert.equal(isValidSpeakingRate(ok), true, ok);
  for (const bad of ['', '0', '0.2', '0.249', '2.1', '3', '-1', 'slow', '1,5', '1.505', ' 1']) assert.equal(isValidSpeakingRate(bad), false, bad);
});

test('isValidGoogleApiKey: sichtbare ASCII-Zeichen ohne Leerzeichen, passend für einen HTTP-Kopf', () => {
  assert.equal(isValidGoogleApiKey('test-schluessel-A1234567890_abcdefghijklmnopqrstu'), true);
  for (const bad of ['', 'kurz', 'test mit Leerzeichen 123', 'test-schluessel\n1234567890', '"test-schluessel-1234567890"x ', 'test-äöü-1234567890', 'x'.repeat(257)]) {
    assert.equal(isValidGoogleApiKey(bad), false, JSON.stringify(bad));
  }
});

test('buildGoogleRequest: Text, Stimme mit Sprachcode, LINEAR16 und Tempo; keine Tonhöhe', () => {
  assert.deepEqual(buildGoogleRequest('Hallo', 'de-DE-Chirp3-HD-Algenib', 0.9), {
    input: { text: 'Hallo' },
    voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Algenib' },
    audioConfig: { audioEncoding: 'LINEAR16', speakingRate: 0.9 },
  });
});

test('splitSpeechText: leerer Text ergibt nichts, kurzer Text bleibt in einem Stück', () => {
  assert.deepEqual(splitSpeechText(''), []);
  assert.deepEqual(splitSpeechText('  \n\t '), []);
  assert.deepEqual(splitSpeechText('  Es war einmal. Ende.  '), ['Es war einmal. Ende.']);
  // Zeilenumbrüche innerhalb eines passenden Textes bleiben erhalten, Steuerzeichen werden zu Leerzeichen.
  assert.deepEqual(splitSpeechText('Eins.\nZwei.'), ['Eins.\nZwei.']);
  assert.deepEqual(splitSpeechText('a\u0000b'), ['a b']);
});

test('splitSpeechText: lange Texte werden an Satzgrenzen geteilt, nichts geht verloren', () => {
  const sentence = 'Der mutige Ritter ritt durch den dunklen Wald, und die Vögel sangen laut.';
  const text = Array.from({ length: 200 }, () => sentence).join(' ');
  assert.ok(bytes(text) > 4000);
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(bytes(chunk) <= 4000, `Stück zu groß: ${bytes(chunk)}`);
    assert.ok(chunk.endsWith('.'), 'jedes Stück endet an einer Satzgrenze');
  }
  assert.equal(chunks.join(' '), text);
});

test('splitSpeechText: Bytes zählen, nicht Zeichen (Umlaute und Emojis)', () => {
  const text = Array.from({ length: 120 }, () => 'Äpfel öffnen übers Ödland.').join(' ');
  const chunks = splitSpeechText(text, 500);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(bytes(chunk) <= 500);
  assert.equal(chunks.join(' '), text);
});

test('splitSpeechText: ein zu langer Satz wird an Wortgrenzen geteilt', () => {
  const text = Array.from({ length: 300 }, (_, index) => `wort${index}`).join(' ') + '.';
  const chunks = splitSpeechText(text, 400);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(bytes(chunk) <= 400);
  assert.equal(chunks.join(' '), text);
});

test('splitSpeechText: ein einzelnes riesiges Wort wird zeichenweise geteilt, nie mitten in einem Zeichen', () => {
  const word = 'ä😀'.repeat(400);
  const chunks = splitSpeechText(word, 100);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(bytes(chunk) <= 100);
    assert.equal(chunk.includes('�'), false);
    assert.equal(Buffer.from(chunk, 'utf8').toString('utf8'), chunk);
  }
  assert.equal(chunks.join(''), word);
});

test('usableGoogleSettings: ohne Schlüssel oder mit ungültigem Schlüssel oder Stimme keine Sprachausgabe', () => {
  const ok = { googleTtsKey: 'test-schluessel-1234567890', googleTtsVoice: DEFAULT_GOOGLE_VOICE, googleTtsRate: '' };
  assert.deepEqual(usableGoogleSettings(ok), { key: ok.googleTtsKey, voice: DEFAULT_GOOGLE_VOICE, speakingRate: DEFAULT_GOOGLE_SPEAKING_RATE });
  assert.equal(usableGoogleSettings({ ...ok, googleTtsKey: null }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsKey: 'mit leerzeichen drin' }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsVoice: '' }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsVoice: 'Algenib' }), null);
});

test('usableGoogleSettings: gültiges Tempo wird übernommen, ungültiges durch den Standard ersetzt', () => {
  const base = { googleTtsKey: 'test-schluessel-1234567890', googleTtsVoice: DEFAULT_GOOGLE_VOICE };
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: '0.9' })?.speakingRate, 0.9);
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: 'schnell' })?.speakingRate, DEFAULT_GOOGLE_SPEAKING_RATE);
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: '5' })?.speakingRate, DEFAULT_GOOGLE_SPEAKING_RATE);
});
