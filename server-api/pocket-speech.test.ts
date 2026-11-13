import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, parseWav } from './audio.js';
import {
  DEFAULT_POCKET_PAUSE_MS,
  DEFAULT_POCKET_TEMPO,
  DEFAULT_POCKET_VOICE,
  isValidPocketUrl,
  isValidPocketVoice,
  sentencePauseMs,
  splitSentences,
  timeStretchPcm16,
  usablePocketSettings,
} from './pocket-speech.js';
import { PocketTextToSpeech, VoiceProviderError } from './voice.js';

test('Pocket: Standard ist die freie Stimme stuart_bell (Entscheidung 13.11.2026), Tempo 0,92, Pause 450 ms', () => {
  assert.equal(DEFAULT_POCKET_VOICE, 'stuart_bell');
  assert.equal(DEFAULT_POCKET_TEMPO, 0.92);
  assert.equal(DEFAULT_POCKET_PAUSE_MS, 450);
});

test('Pocket: Adressen und Stimmen prüfen', () => {
  assert.equal(isValidPocketUrl('http://127.0.0.1:8001'), true);
  assert.equal(isValidPocketUrl('http://127.0.0.1:8001/'), true);
  assert.equal(isValidPocketUrl('http://127.0.0.1:8001/tts'), false);
  assert.equal(isValidPocketUrl('http://nutzer:pw@127.0.0.1:8001'), false);
  assert.equal(isValidPocketVoice('stuart_bell'), true);
  assert.equal(isValidPocketVoice('hf://kyutai/tts-voices/voice-zero/stuart_bell.wav'), true);
  assert.equal(isValidPocketVoice('http://example.com/a.wav'), false);
  assert.equal(isValidPocketVoice('Stuart Bell'), false);
});

test('Pocket: Einstellungen mit Standardwerten bei ungültigem Tempo oder Pause', () => {
  assert.equal(usablePocketSettings({ pocketTtsUrl: null, pocketTtsVoice: 'stuart_bell', pocketTtsTempo: '', pocketTtsPauseMs: '' }), null);
  assert.deepEqual(
    usablePocketSettings({ pocketTtsUrl: 'http://127.0.0.1:8001/', pocketTtsVoice: 'stuart_bell', pocketTtsTempo: '5', pocketTtsPauseMs: 'x' }),
    { url: 'http://127.0.0.1:8001', voice: 'stuart_bell', tempo: 0.92, pauseMs: 450 }
  );
  assert.deepEqual(
    usablePocketSettings({ pocketTtsUrl: 'http://127.0.0.1:8001', pocketTtsVoice: 'stuart_bell', pocketTtsTempo: '0.85', pocketTtsPauseMs: '600' }),
    { url: 'http://127.0.0.1:8001', voice: 'stuart_bell', tempo: 0.85, pauseMs: 600 }
  );
});

test('Pocket: Sätze, wörtliche Rede und Absätze', () => {
  const parts = splitSentences('Kunibert lachte. „Was ist denn los?“, fragte er. „Nichts!“\n\nDann ging die Sonne unter.');
  assert.deepEqual(parts.map((p) => p.sentence), ['Kunibert lachte.', '„Was ist denn los?“, fragte er.', '„Nichts!“', 'Dann ging die Sonne unter.']);
  assert.deepEqual(parts.map((p) => p.paragraphEnd), [false, false, true, false]);
  assert.deepEqual(splitSentences('   '), []);
  const long = splitSentences(`${'Wort '.repeat(150)}Ende.`);
  assert.ok(long.length >= 2, 'sehr lange Sätze werden geteilt');
  assert.ok(long.every((p) => p.sentence.length <= 400));
});

test('Pocket: Pausen kürzer nach kurzen Sätzen, länger am Absatz', () => {
  assert.equal(sentencePauseMs('Ja.', 450), 270);
  assert.equal(sentencePauseMs('Kunibert ging langsam über die Brücke.', 450), 450);
  assert.equal(sentencePauseMs('Kunibert ging langsam über die Brücke.', 450, true), 810);
});

test('Pocket: Zeitdehnung macht 0,92 etwa 9 % länger und lässt die Tonhöhe', () => {
  const rate = 24_000;
  const input = new Int16Array(rate);
  for (let i = 0; i < input.length; i++) input[i] = Math.round(8000 * Math.sin((2 * Math.PI * 200 * i) / rate));
  const out = timeStretchPcm16(input, 0.92, rate);
  assert.equal(out.length, Math.round(rate / 0.92));
  // Nulldurchgänge im mittleren Teil zählen: Frequenz bleibt bei etwa 200 Hz.
  let crossings = 0;
  const from = 2000;
  const to = out.length - 2000;
  for (let i = from + 1; i < to; i++) if (out[i - 1] < 0 && out[i] >= 0) crossings++;
  const hz = crossings / ((to - from) / rate);
  assert.ok(Math.abs(hz - 200) < 6, `Frequenz ${hz}`);
});

/** WAV wie aus `pocket-tts serve`: Längen im Kopf als Platzhalter 0xFFFFFFFF (gestreamt). */
function streamedWav(seconds: number, rate = 24_000): Buffer {
  const pcm = Buffer.alloc(Math.round(seconds * rate) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin(i / 10)), i * 2);
  const wav = encodeWav(pcm, rate, 1, 16);
  wav.writeUInt32LE(0xffffffff, 4);
  wav.writeUInt32LE(0xffffffff, 40);
  return wav;
}

test('Pocket: Satz für Satz an den Dienst, Pausen dazwischen, Ergebnis 16 kHz mono', async () => {
  const calls: { url: string; text: string; voice: string }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    calls.push({ url, text: form.get('text') || '', voice: form.get('voice_url') || '' });
    return new Response(new Uint8Array(streamedWav(0.5)), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
  }) as unknown as typeof fetch;
  const tts = new PocketTextToSpeech({ url: 'http://127.0.0.1:8001', voice: 'stuart_bell', tempo: 1, pauseMs: 500 }, 10_000, 16_000, fakeFetch);
  const wav = await tts.synthesize('Erster Satz mit mehreren Wörtern. Zweiter Satz mit mehreren Wörtern.');
  assert.deepEqual(calls.map((c) => c.text), ['Erster Satz mit mehreren Wörtern.', 'Zweiter Satz mit mehreren Wörtern.']);
  assert.ok(calls.every((c) => c.url === 'http://127.0.0.1:8001/tts' && c.voice === 'stuart_bell'));
  const info = parseWav(wav);
  assert.equal(info.sampleRate, 16_000);
  assert.equal(info.channels, 1);
  // 2 × 0,5 s Ton + 0,5 s Pause (keine Pause nach dem letzten Satz).
  assert.ok(Math.abs(info.duration - 1.5) < 0.02, `Dauer ${info.duration}`);
});

test('Pocket: Fehler des Dienstes nur als Status, ohne Text', async () => {
  const fakeFetch = (async () => new Response('Kunibert sagt etwas Geheimes', { status: 500 })) as unknown as typeof fetch;
  const tts = new PocketTextToSpeech({ url: 'http://127.0.0.1:8001', voice: 'stuart_bell', tempo: 1, pauseMs: 0 }, 10_000, 16_000, fakeFetch);
  await assert.rejects(tts.synthesize('Ein Satz.'), (error: unknown) => {
    assert.ok(error instanceof VoiceProviderError);
    assert.equal(error.retryable, true);
    assert.ok(!error.message.includes('Geheimes'));
    return true;
  });
  const down = (async () => { throw new TypeError('connect ECONNREFUSED Kunibert'); }) as unknown as typeof fetch;
  const tts2 = new PocketTextToSpeech({ url: 'http://127.0.0.1:8001', voice: 'stuart_bell', tempo: 1, pauseMs: 0 }, 10_000, 16_000, down);
  await assert.rejects(tts2.synthesize('Ein Satz.'), (error: unknown) => error instanceof VoiceProviderError && !error.message.includes('Kunibert'));
});
