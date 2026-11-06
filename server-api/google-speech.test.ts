import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GOOGLE_PAUSE_MS,
  DEFAULT_GOOGLE_PITCH,
  DEFAULT_GOOGLE_SPEAKING_RATE,
  DEFAULT_GOOGLE_VOICE,
  GOOGLE_MAX_INPUT_BYTES,
  GOOGLE_MAX_SSML_BYTES,
  GOOGLE_TTS_ENDPOINT,
  buildGoogleRequest,
  buildGoogleSsml,
  escapeXml,
  googleLanguageCode,
  isValidGoogleApiKey,
  isValidGoogleVoiceName,
  isValidPauseMs,
  isValidPitch,
  isValidSpeakingRate,
  planGoogleInputs,
  sentencePauseMs,
  splitSpeechText,
  usableGoogleSettings,
  usesSsml,
  type GoogleInput,
  type GoogleVoiceStyle,
} from './google-speech.js';

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

const NARRATOR: GoogleVoiceStyle = { speakingRate: 0.9, pitchSemitones: -2, pauseMs: 500 };
const PLAIN: GoogleVoiceStyle = { speakingRate: 0.9, pitchSemitones: 0, pauseMs: 0 };

/** Sagt der Server wirklich nur den Text und nichts dazu? Marken entfernen, Pausen als Leerzeichen, Leerraum glätten. */
function spokenText(input: GoogleInput): string {
  const raw = 'ssml' in input ? input.ssml : input.text;
  return raw
    .replace(/<break [^>]*\/>/g, ' ')
    .replace(/<\/?(speak|prosody)[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

test('Der Endpunkt ist fest der EU-Endpunkt von Google', () => {
  assert.equal(GOOGLE_TTS_ENDPOINT, 'https://eu-texttospeech.googleapis.com/v1/text:synthesize');
});

test('Standardstimme ist Algieba (Chirp 3 HD, Deutsch), Tempo 0,9, zwei Halbtöne tiefer, 500 ms Pause', () => {
  assert.equal(DEFAULT_GOOGLE_VOICE, 'de-DE-Chirp3-HD-Algieba');
  assert.ok(isValidGoogleVoiceName(DEFAULT_GOOGLE_VOICE));
  assert.equal(googleLanguageCode(DEFAULT_GOOGLE_VOICE), 'de-DE');
  assert.equal(DEFAULT_GOOGLE_SPEAKING_RATE, 0.9);
  assert.equal(DEFAULT_GOOGLE_PITCH, -2);
  assert.equal(DEFAULT_GOOGLE_PAUSE_MS, 500);
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

test('isValidPitch: -6 bis +6 Halbtöne mit höchstens einer Nachkommastelle', () => {
  for (const ok of ['0', '-2', '+2', '1.5', '-0.5', '-6', '6', '+6']) assert.equal(isValidPitch(ok), true, ok);
  for (const bad of ['', '7', '-7', '6.1', '-6.5', '10', '1.55', 'tief', '2st', '1,5', ' 2', '--2', '+', '-']) assert.equal(isValidPitch(bad), false, bad);
});

test('isValidPauseMs: ganze Millisekunden von 0 bis 2000', () => {
  for (const ok of ['0', '300', '500', '2000']) assert.equal(isValidPauseMs(ok), true, ok);
  for (const bad of ['', '-1', '2001', '10000', '12345', '1.5', '500ms', 'kurz', ' 5']) assert.equal(isValidPauseMs(bad), false, bad);
});

test('isValidGoogleApiKey: sichtbare ASCII-Zeichen ohne Leerzeichen, passend für einen HTTP-Kopf', () => {
  assert.equal(isValidGoogleApiKey('test-schluessel-A1234567890_abcdefghijklmnopqrstu'), true);
  for (const bad of ['', 'kurz', 'test mit Leerzeichen 123', 'test-schluessel\n1234567890', '"test-schluessel-1234567890"x ', 'test-äöü-1234567890', 'x'.repeat(257)]) {
    assert.equal(isValidGoogleApiKey(bad), false, JSON.stringify(bad));
  }
});

test('buildGoogleRequest: einfacher Text mit Stimme, Sprachcode, LINEAR16 und Tempo', () => {
  assert.deepEqual(buildGoogleRequest({ text: 'Hallo' }, 'de-DE-Chirp3-HD-Algieba', 0.9), {
    input: { text: 'Hallo' },
    voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Algieba' },
    audioConfig: { audioEncoding: 'LINEAR16', speakingRate: 0.9 },
  });
});

test('buildGoogleRequest: bei SSML kein speakingRate (das Tempo steckt im Text)', () => {
  const request = buildGoogleRequest({ ssml: '<speak>Hallo</speak>' }, 'de-DE-Chirp3-HD-Algieba', null);
  assert.deepEqual(request, {
    input: { ssml: '<speak>Hallo</speak>' },
    voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Algieba' },
    audioConfig: { audioEncoding: 'LINEAR16' },
  });
  assert.equal('speakingRate' in request.audioConfig, false);
});

test('escapeXml: spitze Klammern, kaufmännisches Und und Anführungszeichen werden maskiert', () => {
  assert.equal(escapeXml(`Tom & "Jerry" <b>it's</b>`), 'Tom &amp; &quot;Jerry&quot; &lt;b&gt;it&apos;s&lt;/b&gt;');
  assert.equal(escapeXml('„Wer ist da?“'), '„Wer ist da?“');
});

test('usesSsml: nur mit Tonlage oder Pause', () => {
  assert.equal(usesSsml(PLAIN), false);
  assert.equal(usesSsml({ ...PLAIN, pitchSemitones: -2 }), true);
  assert.equal(usesSsml({ ...PLAIN, pauseMs: 500 }), true);
  assert.equal(usesSsml(NARRATOR), true);
});

test('sentencePauseMs: kurze Sätze kürzer, lange länger, dazwischen die Grundpause', () => {
  const words = (count: number): string => Array.from({ length: count }, (_, index) => `wort${index}`).join(' ') + '.';
  assert.equal(sentencePauseMs('Wer ist da?', 500), 300);
  assert.equal(sentencePauseMs(words(1), 500), 300);
  assert.equal(sentencePauseMs(words(3), 500), 300);
  assert.equal(sentencePauseMs(words(4), 500), 500);
  assert.equal(sentencePauseMs(words(14), 500), 500);
  assert.equal(sentencePauseMs(words(15), 500), 600);
  assert.equal(sentencePauseMs(words(40), 500), 600);
  assert.equal(sentencePauseMs(words(8), 0), 0);
  assert.equal(sentencePauseMs(words(3), 250), 150);
});

test('buildGoogleSsml: Tonlage und Tempo im prosody-Element, Standardwerte der Erzählstimme', () => {
  assert.equal(
    buildGoogleSsml('Es war einmal ein Ritter.', NARRATOR),
    '<speak><prosody pitch="-2st" rate="90%">Es war einmal ein Ritter.</prosody></speak>'
  );
  assert.match(buildGoogleSsml('Hallo zusammen.', { ...NARRATOR, pitchSemitones: 1.5, speakingRate: 0.85 }), /pitch="\+1\.5st" rate="85%"/);
  assert.match(buildGoogleSsml('Hallo zusammen.', { ...NARRATOR, pitchSemitones: 0, speakingRate: 1 }), /pitch="\+0st" rate="100%"/);
});

test('buildGoogleSsml: Pausen nach Sätzen richten sich nach der Satzlänge (kurz 300, normal 500, lang 600)', () => {
  const long = Array.from({ length: 15 }, (_, index) => `wort${index}`).join(' ') + '.';
  assert.equal(
    buildGoogleSsml(`Wer ist da? Niemand antwortete heute Nacht. ${long} Ende gut.`, NARRATOR),
    '<speak><prosody pitch="-2st" rate="90%">' +
      'Wer ist da?<break time="300ms"/>' +
      'Niemand antwortete heute Nacht.<break time="500ms"/>' +
      `${long}<break time="600ms"/>` +
      'Ende gut.' +
      '</prosody></speak>'
  );
});

test('buildGoogleSsml: Absätze bekommen die längste Pause, nach dem letzten Satz keine', () => {
  assert.equal(
    buildGoogleSsml('Eins zwei drei vier. Fünf sechs sieben acht.\n\nNeun zehn elf zwölf.\n', NARRATOR),
    '<speak><prosody pitch="-2st" rate="90%">' +
      'Eins zwei drei vier.<break time="500ms"/>Fünf sechs sieben acht.<break time="900ms"/>Neun zehn elf zwölf.' +
      '</prosody></speak>'
  );
});

test('buildGoogleSsml: wörtliche Rede wird nicht mitten im Satz zerschnitten', () => {
  const ssml = buildGoogleSsml('„Wer ist da?“, rief er. Niemand antwortete.', NARRATOR);
  assert.ok(ssml.includes('„Wer ist da?“, rief er.<break time="500ms"/>Niemand antwortete.'), ssml);
  assert.equal((ssml.match(/<break/g) ?? []).length, 1);
});

test('buildGoogleSsml: Pause 0 setzt keine break-Marken, die Sätze bleiben durch Leerzeichen getrennt', () => {
  const ssml = buildGoogleSsml('Eins zwei drei vier. Fünf sechs sieben acht.\nNeun zehn elf zwölf.', { ...NARRATOR, pauseMs: 0 });
  assert.equal(ssml.includes('<break'), false);
  assert.ok(ssml.includes('Eins zwei drei vier. Fünf sechs sieben acht. Neun zehn elf zwölf.'), ssml);
});

test('buildGoogleSsml: Eingaben mit spitzen Klammern können keine eigenen SSML-Marken einschleusen', () => {
  const ssml = buildGoogleSsml('Hör zu <break time="10s"/> & </prosody><audio src="http://x"/> fertig.', NARRATOR);
  assert.equal(ssml.includes('<audio'), false);
  assert.equal(ssml.includes('<break time="10s"'), false);
  assert.equal((ssml.match(/<prosody/g) ?? []).length, 1);
  assert.equal((ssml.match(/<\/prosody>/g) ?? []).length, 1);
  assert.ok(ssml.includes('&lt;break time=&quot;10s&quot;/&gt; &amp; &lt;/prosody&gt;'), ssml);
});

test('buildGoogleSsml: Steuerzeichen werden zu Leerzeichen', () => {
  assert.equal(
    buildGoogleSsml('a\u0000b\u0007c', NARRATOR),
    '<speak><prosody pitch="-2st" rate="90%">a b c</prosody></speak>'
  );
});

test('splitSpeechText: lange Texte werden bevorzugt an Absätzen geteilt, der Absatz bleibt erhalten', () => {
  const paragraph = Array.from({ length: 40 }, () => 'Der mutige Ritter ritt durch den dunklen Wald und sang.').join(' ');
  const text = [paragraph, paragraph, paragraph].join('\n');
  const chunks = splitSpeechText(text, 3000);
  assert.ok(bytes(paragraph) < 3000 && bytes(`${paragraph}\n${paragraph}`) > 3000);
  assert.deepEqual(chunks, [paragraph, paragraph, paragraph]);
  assert.equal(chunks.join('\n'), text);
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

test('planGoogleInputs: ohne Tonlage und Pausen einfacher Text, kurze Texte in einem Stück', () => {
  assert.deepEqual(planGoogleInputs('', PLAIN), []);
  assert.deepEqual(planGoogleInputs('Es war einmal.', PLAIN), [{ text: 'Es war einmal.' }]);
});

test('planGoogleInputs: lange Texte ohne SSML als Text-Stücke bis 4000 Bytes', () => {
  const text = Array.from({ length: 200 }, () => 'Der mutige Ritter ritt durch den dunklen Wald, und die Vögel sangen laut.').join(' ');
  const inputs = planGoogleInputs(text, PLAIN);
  assert.ok(inputs.length > 1);
  for (const input of inputs) {
    assert.ok('text' in input);
    assert.ok(bytes((input as { text: string }).text) <= GOOGLE_MAX_INPUT_BYTES);
  }
  assert.equal(inputs.map(spokenText).join(' '), text);
});

test('planGoogleInputs: mit Erzählstimme SSML, kurze Texte in einem Stück', () => {
  assert.deepEqual(planGoogleInputs('', NARRATOR), []);
  const inputs = planGoogleInputs('Es war einmal ein Ritter. Er ritt los.', NARRATOR);
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0], {
    ssml: '<speak><prosody pitch="-2st" rate="90%">Es war einmal ein Ritter.<break time="500ms"/>Er ritt los.</prosody></speak>',
  });
});

test('planGoogleInputs: lange Texte mit SSML bleiben samt Marken unter 4800 Bytes, der Wortlaut bleibt gleich', () => {
  const text = Array.from({ length: 200 }, (_, index) => `Der mutige Ritter ${index} ritt durch den dunklen Wald, und die Vögel sangen laut.`).join(' ');
  const inputs = planGoogleInputs(text, NARRATOR);
  assert.ok(inputs.length > 1);
  for (const input of inputs) {
    assert.ok('ssml' in input);
    const ssml = (input as { ssml: string }).ssml;
    assert.ok(bytes(ssml) <= GOOGLE_MAX_SSML_BYTES, `Stück zu groß: ${bytes(ssml)}`);
    assert.ok(ssml.startsWith('<speak><prosody pitch="-2st" rate="90%">') && ssml.endsWith('</prosody></speak>'));
  }
  assert.equal(inputs.map(spokenText).join(' '), text);
});

test('planGoogleInputs: sehr viele winzige Sätze (viele Pausen-Marken) werden so lange geteilt, bis jedes Stück passt', () => {
  const text = Array.from({ length: 1500 }, () => 'Ja.').join(' ');
  const inputs = planGoogleInputs(text, NARRATOR);
  assert.ok(inputs.length > 1);
  for (const input of inputs) assert.ok(bytes((input as { ssml: string }).ssml) <= GOOGLE_MAX_SSML_BYTES);
  assert.equal(inputs.map(spokenText).join(' '), text);
});

test('planGoogleInputs: ein einzelnes riesiges Wort wird mit SSML ebenfalls geteilt', () => {
  const inputs = planGoogleInputs('ä'.repeat(9000), NARRATOR);
  assert.ok(inputs.length > 1);
  for (const input of inputs) assert.ok(bytes((input as { ssml: string }).ssml) <= GOOGLE_MAX_SSML_BYTES);
  assert.equal(inputs.map(spokenText).join(''), 'ä'.repeat(9000).replace(/\s/g, ''));
});

test('usableGoogleSettings: ohne Schlüssel oder mit ungültigem Schlüssel oder Stimme keine Sprachausgabe', () => {
  const ok = { googleTtsKey: 'test-schluessel-1234567890', googleTtsVoice: DEFAULT_GOOGLE_VOICE, googleTtsRate: '', googleTtsPitch: '', googleTtsPauseMs: '' };
  assert.deepEqual(usableGoogleSettings(ok), {
    key: ok.googleTtsKey,
    voice: DEFAULT_GOOGLE_VOICE,
    speakingRate: DEFAULT_GOOGLE_SPEAKING_RATE,
    pitchSemitones: DEFAULT_GOOGLE_PITCH,
    pauseMs: DEFAULT_GOOGLE_PAUSE_MS,
  });
  assert.equal(usableGoogleSettings({ ...ok, googleTtsKey: null }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsKey: 'mit leerzeichen drin' }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsVoice: '' }), null);
  assert.equal(usableGoogleSettings({ ...ok, googleTtsVoice: 'Algenib' }), null);
});

test('usableGoogleSettings: gültiges Tempo, gültige Tonlage und Pause werden übernommen, ungültige durch den Standard ersetzt', () => {
  const base = {
    googleTtsKey: 'test-schluessel-1234567890',
    googleTtsVoice: DEFAULT_GOOGLE_VOICE,
    googleTtsRate: '',
    googleTtsPitch: '',
    googleTtsPauseMs: '',
  };
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: '0.8' })?.speakingRate, 0.8);
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: 'schnell' })?.speakingRate, DEFAULT_GOOGLE_SPEAKING_RATE);
  assert.equal(usableGoogleSettings({ ...base, googleTtsRate: '5' })?.speakingRate, DEFAULT_GOOGLE_SPEAKING_RATE);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPitch: '-3' })?.pitchSemitones, -3);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPitch: '0' })?.pitchSemitones, 0);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPitch: 'tief' })?.pitchSemitones, DEFAULT_GOOGLE_PITCH);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPitch: '9' })?.pitchSemitones, DEFAULT_GOOGLE_PITCH);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPauseMs: '300' })?.pauseMs, 300);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPauseMs: '0' })?.pauseMs, 0);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPauseMs: 'lang' })?.pauseMs, DEFAULT_GOOGLE_PAUSE_MS);
  assert.equal(usableGoogleSettings({ ...base, googleTtsPauseMs: '99999' })?.pauseMs, DEFAULT_GOOGLE_PAUSE_MS);
});
