import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POCKET_PAUSE_MS,
  DEFAULT_POCKET_TEMPO,
  DEFAULT_POCKET_VOICE,
  isValidPocketUrl,
  isValidPocketVoice,
  isValidTempo,
  pcm16ToSamples,
  preparePocketText,
  samplesToPcm16,
  silencePcm16,
  timeStretchPcm16,
  usablePocketSettings,
} from './pocket-speech.js';

const RATE = 16_000;

test('Standardwerte: Stimme juergen, Tempo 0,9, Pause 500 ms', () => {
  assert.equal(DEFAULT_POCKET_VOICE, 'juergen');
  assert.equal(DEFAULT_POCKET_TEMPO, 0.9);
  assert.equal(DEFAULT_POCKET_PAUSE_MS, 500);
  assert.ok(isValidPocketVoice(DEFAULT_POCKET_VOICE));
});

test('isValidPocketVoice: eingebaute Namen, hf:// und https://, sonst nichts', () => {
  for (const ok of ['juergen', 'alba', 'bill_boerst', 'hf://kyutai/tts-voices/voice-zero/stimme.wav', 'https://example.org/stimme.wav']) {
    assert.equal(isValidPocketVoice(ok), true, ok);
  }
  for (const bad of ['', 'Juergen', 'jürgen', '1abc', 'mit leerzeichen', '../x', 'a'.repeat(41), 'http://example.org/x.wav', 'hf://x y', 'https://', 'https://example.org/"x"', `https://${'a'.repeat(301)}`]) {
    assert.equal(isValidPocketVoice(bad), false, bad);
  }
});

test('isValidTempo: 0,7 bis 1,3 mit höchstens zwei Nachkommastellen', () => {
  for (const ok of ['0.7', '0.85', '0.9', '1', '1.0', '1.3']) assert.equal(isValidTempo(ok), true, ok);
  for (const bad of ['', '0.69', '1.31', '2', '0', 'schnell', '1,1', '0.855', ' 1', '-1']) assert.equal(isValidTempo(bad), false, bad);
});

test('isValidPocketUrl: http oder https auf einen Rechner, ohne Pfad, Zugangsdaten und Suchteil', () => {
  for (const ok of ['http://127.0.0.1:8003', 'https://tts.example.org', 'http://localhost:8003/']) assert.equal(isValidPocketUrl(ok), true, ok);
  for (const bad of ['', '127.0.0.1:8003', 'localhost:8003', 'ftp://host', 'http://user:pass@host', 'http://host/v1', 'http://host/?a=1', 'http://host/#x']) {
    assert.equal(isValidPocketUrl(bad), false, bad);
  }
});

test('preparePocketText: typografische Apostrophe werden geglättet, sonst bleibt der Text', () => {
  assert.equal(preparePocketText('Das gibt’s doch nicht, sagte ‘er’.'), "Das gibt's doch nicht, sagte 'er'.");
  assert.equal(preparePocketText('„Wer ist da?“, rief er.'), '„Wer ist da?“, rief er.');
});

test('usablePocketSettings: ohne gültige Adresse oder Stimme keine Sprachausgabe', () => {
  const ok = { pocketTtsUrl: 'http://127.0.0.1:8003', pocketTtsVoice: DEFAULT_POCKET_VOICE, pocketTtsTempo: '', pocketTtsPauseMs: '' };
  assert.deepEqual(usablePocketSettings(ok), { url: 'http://127.0.0.1:8003', voice: 'juergen', tempo: 0.9, pauseMs: 500 });
  assert.equal(usablePocketSettings({ ...ok, pocketTtsUrl: null }), null);
  assert.equal(usablePocketSettings({ ...ok, pocketTtsUrl: 'kein-url' }), null);
  assert.equal(usablePocketSettings({ ...ok, pocketTtsUrl: 'http://host/v1' }), null);
  assert.equal(usablePocketSettings({ ...ok, pocketTtsVoice: '' }), null);
  assert.equal(usablePocketSettings({ ...ok, pocketTtsVoice: 'Jürgen' }), null);
  // Ein abschließender Schrägstrich fällt weg.
  assert.equal(usablePocketSettings({ ...ok, pocketTtsUrl: 'http://127.0.0.1:8003/' })?.url, 'http://127.0.0.1:8003');
});

test('usablePocketSettings: gültiges Tempo und gültige Pause werden übernommen, ungültige durch den Standard ersetzt', () => {
  const base = { pocketTtsUrl: 'http://127.0.0.1:8003', pocketTtsVoice: 'juergen', pocketTtsTempo: '', pocketTtsPauseMs: '' };
  assert.equal(usablePocketSettings({ ...base, pocketTtsTempo: '0.8' })?.tempo, 0.8);
  assert.equal(usablePocketSettings({ ...base, pocketTtsTempo: '1' })?.tempo, 1);
  assert.equal(usablePocketSettings({ ...base, pocketTtsTempo: 'langsam' })?.tempo, DEFAULT_POCKET_TEMPO);
  assert.equal(usablePocketSettings({ ...base, pocketTtsTempo: '3' })?.tempo, DEFAULT_POCKET_TEMPO);
  assert.equal(usablePocketSettings({ ...base, pocketTtsPauseMs: '300' })?.pauseMs, 300);
  assert.equal(usablePocketSettings({ ...base, pocketTtsPauseMs: '0' })?.pauseMs, 0);
  assert.equal(usablePocketSettings({ ...base, pocketTtsPauseMs: 'lang' })?.pauseMs, DEFAULT_POCKET_PAUSE_MS);
  assert.equal(usablePocketSettings({ ...base, pocketTtsPauseMs: '9999' })?.pauseMs, DEFAULT_POCKET_PAUSE_MS);
});

test('pcm16ToSamples, samplesToPcm16 und silencePcm16', () => {
  const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
  assert.deepEqual(Array.from(pcm16ToSamples(samplesToPcm16(samples))), Array.from(samples));
  assert.equal(pcm16ToSamples(Buffer.from([1, 0, 2])).length, 1);
  assert.equal(silencePcm16(16_000, 500).length, 16_000);
  assert.equal(silencePcm16(16_000, 0).length, 0);
  assert.ok(silencePcm16(16_000, 300).every((byte) => byte === 0));
});

// ---------------------------------------------------------------------------
// Zeitdehnung
// ---------------------------------------------------------------------------

function sine(frequency: number, seconds: number, amplitude = 10_000, startSeconds = 0): Int16Array {
  const samples = new Int16Array(Math.round(RATE * seconds));
  for (let index = Math.round(RATE * startSeconds); index < samples.length; index++) {
    samples[index] = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * (index - RATE * startSeconds)) / RATE));
  }
  return samples;
}

function rms(samples: Int16Array, from: number, to: number): number {
  let sum = 0;
  for (let index = from; index < to; index++) sum += samples[index] * samples[index];
  return Math.sqrt(sum / (to - from));
}

/** Frequenz über die steigenden Nulldurchgänge im mittleren Bereich. */
function measuredFrequency(samples: Int16Array, fromSeconds: number, toSeconds: number): number {
  const from = Math.round(RATE * fromSeconds);
  const to = Math.round(RATE * toSeconds);
  let crossings = 0;
  for (let index = from + 1; index < to; index++) {
    if (samples[index - 1] < 0 && samples[index] >= 0) crossings++;
  }
  return crossings / (toSeconds - fromSeconds);
}

test('timeStretchPcm16: Tempo 0,9 macht die Aufnahme um ein Neuntel länger', () => {
  const input = sine(200, 2);
  const output = timeStretchPcm16(input, 0.9, RATE);
  assert.equal(output.length, Math.round(input.length / 0.9));
});

test('timeStretchPcm16: die Tonhöhe bleibt gleich (200 Hz bleiben 200 Hz) und die Lautstärke ebenso', () => {
  const input = sine(200, 2);
  for (const tempo of [0.8, 0.9, 1.2]) {
    const output = timeStretchPcm16(input, tempo, RATE);
    const seconds = output.length / RATE;
    const frequency = measuredFrequency(output, seconds * 0.25, seconds * 0.75);
    assert.ok(Math.abs(frequency - 200) < 6, `Tempo ${tempo}: ${frequency} Hz`);
    const level = rms(output, Math.round(output.length * 0.25), Math.round(output.length * 0.75));
    assert.ok(Math.abs(level - 7071) < 700, `Tempo ${tempo}: Pegel ${level}`);
  }
});

test('timeStretchPcm16: Tempo 1 lässt die Aufnahme unverändert, Tempo über 1 verkürzt sie', () => {
  const input = sine(200, 1);
  assert.deepEqual(Array.from(timeStretchPcm16(input, 1, RATE)), Array.from(input));
  assert.equal(timeStretchPcm16(input, 1.25, RATE).length, Math.round(input.length / 1.25));
});

test('timeStretchPcm16: Stille bleibt Stille, ein Ton behält seine Lage zeitlich im selben Verhältnis', () => {
  assert.ok(timeStretchPcm16(new Int16Array(RATE), 0.9, RATE).every((value) => value === 0));

  // Ton von 0,3 s bis 0,6 s in einer Sekunde Stille.
  const burst = sine(200, 0.6, 10_000, 0.3);
  const input = new Int16Array(RATE);
  input.set(burst);
  const output = timeStretchPcm16(input, 0.9, RATE);
  let first = -1;
  let last = -1;
  for (let index = 0; index < output.length; index++) {
    if (Math.abs(output[index]) > 1000) {
      if (first < 0) first = index;
      last = index;
    }
  }
  assert.ok(Math.abs(first / RATE - 0.3 / 0.9) < 0.04, `Anfang ${first / RATE}`);
  assert.ok(Math.abs(last / RATE - 0.6 / 0.9) < 0.05, `Ende ${last / RATE}`);
});

test('timeStretchPcm16: nichts läuft über, auch bei voller Aussteuerung', () => {
  const input = sine(150, 1, 32_767);
  const output = timeStretchPcm16(input, 0.8, RATE);
  for (const value of output) assert.ok(value >= -32768 && value <= 32767);
  assert.ok(rms(output, 2000, output.length - 2000) > 20_000);
});

test('timeStretchPcm16: sehr kurze Aufnahmen bleiben unverändert, ungültiges Tempo ist ein Fehler', () => {
  const short = sine(200, 0.05);
  assert.deepEqual(Array.from(timeStretchPcm16(short, 0.9, RATE)), Array.from(short));
  assert.deepEqual(Array.from(timeStretchPcm16(new Int16Array(0), 0.9, RATE)), []);
  assert.throws(() => timeStretchPcm16(sine(200, 1), 0, RATE), RangeError);
  assert.throws(() => timeStretchPcm16(sine(200, 1), Number.NaN, RATE), RangeError);
});
