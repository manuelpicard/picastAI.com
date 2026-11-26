import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { encodeWav, parseWav } from './audio.js';
import { firstSound, PARAGRAPH_PAUSE_MS, PcmStream, StreamingSpeaker, StreamRegistry, streamingWavHeader, streamSynthesizer } from './audio-stream.js';
import { loadConfig } from './config.js';
import { MIN_TTS_MS, TURN_BUDGET_MS, TurnTimer } from './timing.js';
import { VoicePipeline, VoiceProviderError } from './voice.js';

const RATE = 16000;
const tone = (samples: number, value = 1000) => {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(value, i * 2);
  return encodeWav(pcm, RATE, 1, 16);
};

async function collect(stream: PcmStream): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream.read()) parts.push(chunk);
  return Buffer.concat(parts);
}

test('streamingWavHeader: 44 Byte, Länge "bis zum Ende", lesbar für parseWav', () => {
  const header = streamingWavHeader(RATE);
  assert.equal(header.length, 44);
  assert.equal(header.readUInt32LE(4), 0xffffffff);
  assert.equal(header.readUInt32LE(40), 0xffffffff);
  const info = parseWav(Buffer.concat([header, Buffer.alloc(320)]));
  assert.equal(info.sampleRate, RATE);
  assert.equal(info.dataSize, 320);
});

test('PcmStream: ein später Leser bekommt alles von Anfang an und wartet auf den Rest', async () => {
  const stream = new PcmStream(RATE);
  stream.push(Buffer.from([1, 2]));
  const reading = collect(stream);
  stream.push(Buffer.from([3, 4]));
  stream.end();
  assert.deepEqual([...(await reading)], [1, 2, 3, 4]);
});

test('StreamingSpeaker: Absätze der Reihe nach, Pause dazwischen, erster Ton nach dem ersten Absatz', async () => {
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const speaker = new StreamingSpeaker(async (text) => {
    order.push(text);
    if (text === 'zwei') await gate;
    return tone(text === 'eins' ? 100 : 50);
  }, RATE);
  speaker.say('eins');
  speaker.say('zwei');
  await speaker.firstAudio;
  assert.equal(speaker.stream.bytes, 200, 'erster Absatz ist da, bevor der zweite fertig ist');
  release();
  await speaker.finish();
  assert.deepEqual(order, ['eins', 'zwei']);
  const pause = Math.round((RATE * PARAGRAPH_PAUSE_MS) / 1000) * 2;
  assert.equal((await collect(speaker.stream)).length, 200 + pause + 100);
});

test('StreamingSpeaker: merkt sich die Sekunden je gesprochenem Text, ohne die Pausen (Stopp per Taste, B2)', async () => {
  const lengths: Record<string, number> = { eins: RATE, zwei: RATE / 2, Abschluss: RATE / 4 };
  const speaker = new StreamingSpeaker(async (text) => tone(lengths[text]), RATE);
  for (const text of ['eins', 'zwei', 'Abschluss']) speaker.say(text);
  await speaker.finish();
  assert.deepEqual(speaker.segments, [1, 0.5, 0.25]);
  assert.equal(speaker.stream.seconds, 1 + 0.5 + 0.25 + (2 * PARAGRAPH_PAUSE_MS) / 1000, 'der Strom hat dazu die Pausen');
});

test('StreamingSpeaker: Ausfall der Sprachausgabe bricht den Strom ab', async () => {
  const speaker = new StreamingSpeaker(async () => { throw new Error('Pocket weg'); }, RATE);
  speaker.say('eins');
  await assert.rejects(speaker.firstAudio);
  await assert.rejects(speaker.finish());
  await assert.rejects(collect(speaker.stream));
  assert.equal(speaker.stream.ok, false);
});

test('StreamingSpeaker: anderes Format als der Strom wird abgelehnt', async () => {
  const speaker = new StreamingSpeaker(async () => encodeWav(Buffer.alloc(100), 24000, 1, 16), RATE);
  speaker.say('eins');
  await assert.rejects(speaker.firstAudio);
});

// Zeitbudget im Ton-Strom (Punkt N1124-1153-b). Die Attrappen der Sprachausgabe halten sich an die Frist
// wie die echten Anbieter (server-api/voice.ts, withTimeout): Sie brechen nach der kleineren Grenze ab, der
// eigenen je Aufruf oder der mitgegebenen, und werfen dann VoiceProviderError('TTS-Timeout', retryable).

test('Ton-Strom: hängt die Sprachausgabe beim ersten Absatz, endet das Warten auf den ersten Ton mit dem Budget (echte VoicePipeline, Zeiten verkürzt)', async () => {
  // Verkürzt: Budget 300 ms statt 120 s, Mindestzeit 50 ms statt 5 s, Grenze je Aufruf 4 s statt 90 s.
  // Die Schranke unten lässt 1 s Spielraum für eine langsame CI und liegt weit unter der Grenze je Aufruf.
  // Die Sprachausgabe ist die echte VoicePipeline wie in server.ts; nur der Sprachserver ist eine Attrappe,
  // die nie antwortet. Die Frist muss also bis zur HTTP-Anfrage durchkommen (Befund 1 der Prüfung von PR #127).
  const BUDGET_MS = 300;
  const MIN_MS = 50;
  const PER_CALL_MS = 4_000;
  let requests = 0;
  const hanging = http.createServer((req) => {
    requests++;
    req.resume(); // liest die Anfrage und antwortet nie
  });
  const port = await new Promise<number>((resolve) => hanging.listen(0, '127.0.0.1', () => resolve((hanging.address() as AddressInfo).port)));
  const voice = new VoicePipeline({
    ...loadConfig(),
    ttsProvider: 'openai-compatible',
    ttsUrl: `http://127.0.0.1:${port}`,
    ttsApiKey: null,
    ttsModel: 'test-tts',
    ttsVoice: 'test-stimme',
    voiceTimeoutMs: PER_CALL_MS,
    audioSampleRate: RATE,
  });
  const timers: NodeJS.Timeout[] = [];
  const timer = new TurnTimer(undefined, 'a1b2c3d4', BUDGET_MS);
  const started = performance.now();
  const speaker = new StreamingSpeaker(streamSynthesizer(voice, timer, MIN_MS), RATE);
  // Wie Brain mit Ton-Strom: Der erste Absatz geht an den Sprecher, Claude schreibt danach noch weiter.
  const result = new Promise<{ streamed: boolean }>((resolve) => {
    timers.push(setTimeout(() => speaker.say('Erster Absatz.'), 20));
    timers.push(setTimeout(() => { speaker.say('Zweiter Absatz.'); resolve({ streamed: true }); }, 100));
  });
  try {
    const error = await firstSound(speaker, result).then(() => null, (caught: unknown) => caught);
    const elapsed = performance.now() - started;
    assert.ok(error instanceof VoiceProviderError && error.retryable && error.message === 'TTS-Timeout',
      'Frist abgelaufen, wie ohne Strom: 503 voice_provider_failed, retryable (Routen in server.ts)');
    assert.ok(elapsed < BUDGET_MS + MIN_MS + 1_000, `Antwort nach ${Math.round(elapsed)} ms, erwartet innerhalb des Budgets (${BUDGET_MS} ms), nicht erst nach der Grenze je Aufruf (${PER_CALL_MS} ms)`);
    await assert.rejects(speaker.finish());
    assert.equal(speaker.stream.ok, false);
    assert.equal(requests, 1, 'nach dem Ausfall wird nichts mehr vertont');
  } finally {
    for (const pending of timers) clearTimeout(pending);
    hanging.closeAllConnections();
    await new Promise<void>((resolve) => hanging.close(() => resolve()));
  }
});

test('server.ts baut den Sprecher des Ton-Stroms mit streamSynthesizer(voice, timer)', () => {
  // Das Budget von 120 s ist fest im Code; ein Test über HTTP am echten Server bräuchte Minuten. Darum prüft
  // dieser Test die Verdrahtung im Quelltext: Ein Sprecher ohne streamSynthesizer oder mit einer eigenen
  // Funktion um `voice` verlöre die Frist des ersten Absatzes unbemerkt (Befund 1 der Prüfung von PR #127).
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.deepEqual(source.match(/new StreamingSpeaker\([^;]*;/g), ['new StreamingSpeaker(streamSynthesizer(voice, timer), config.audioSampleRate);']);
  assert.match(source, /\bconst voice = new VoicePipeline\(config\);/, '`voice` ist die VoicePipeline');
});

test('Ton-Strom: ein später Absatz bekommt nicht nur den Rest des Budgets (Befund 4 der Prüfung von PR #111)', async () => {
  // Echte Zahlen, eigene Uhr: Jeder Absatz braucht 8 s. Absatz 5 beginnt bei 118 s, 2 s vor dem Ende des
  // Budgets. Bekäme er nur den Rest (mindestens 5 s), bräche er ab, und die Folge rückte nicht vor. Die
  // 130 s von Caddy gelten nur bis zur Antwort auf den POST; der GET schickt seinen Kopf sofort.
  const NEED_MS = 8_000;
  let now = 1_000;
  const timer = new TurnTimer(() => now, 'e5f6a7b8');
  const asked: Array<number | undefined> = [];
  const slow = async (text: string, timeoutMs?: number) => {
    asked.push(timeoutMs);
    if (timeoutMs !== undefined && timeoutMs < NEED_MS) {
      now += timeoutMs;
      throw new VoiceProviderError('TTS-Timeout', true);
    }
    now += NEED_MS;
    if (text === 'Absatz 4') now = 1_000 + 118_000;
    return tone(160);
  };
  const speaker = new StreamingSpeaker(streamSynthesizer({ synthesize: slow }, timer), RATE);
  for (let i = 0; i <= 5; i++) speaker.say(`Absatz ${i}`);
  await speaker.firstAudio;
  await speaker.finish();
  assert.equal(speaker.stream.ok, true);
  assert.equal(speaker.segments.length, 6, 'alle sechs Absätze sind vertont');
  assert.deepEqual(asked, [TURN_BUDGET_MS, undefined, undefined, undefined, undefined, undefined],
    'nur der erste Absatz hat die Frist aus dem Budget; danach gilt die Grenze je Aufruf');
  assert.equal(timer.remainingMs(), 0, 'Absatz 5 endete nach dem Budget, ohne Abbruch');
});

test('Ton-Strom: die Frist des ersten Absatzes zählt ab dem Beginn seiner Vertonung, mindestens MIN_TTS_MS', async () => {
  let now = 0;
  const timer = new TurnTimer(() => now, 'c9d0e1f2');
  const asked: Array<number | undefined> = [];
  const synth = streamSynthesizer({ synthesize: async (_text, timeoutMs) => { asked.push(timeoutMs); return tone(16); } }, timer);
  now = 60_000;
  await synth('früh', 0);
  now = 117_000;
  await synth('spät', 0);
  await synth('danach', 1);
  assert.deepEqual(asked, [60_000, MIN_TTS_MS, undefined]);
});

test('firstSound: „ton“ mit dem ersten Absatz, „fertig“ für eine Antwort ohne Strom', async () => {
  const speaker = new StreamingSpeaker(async () => tone(16), RATE);
  const pending = new Promise<{ streamed?: boolean }>(() => {});
  const ton = firstSound(speaker, pending);
  speaker.say('eins');
  assert.equal(await ton, 'ton');
  const quiet = new StreamingSpeaker(async () => tone(16), RATE);
  assert.equal(await firstSound(quiet, Promise.resolve({})), 'fertig');
  const failing = new StreamingSpeaker(async () => tone(16), RATE);
  await assert.rejects(firstSound(failing, Promise.reject(new Error('Brain'))));
});

test('StreamRegistry: nur einmal abrufbar, nur für das eigene Gerät, mit Ablauf', () => {
  let now = 0;
  const registry = new StreamRegistry(1000, () => now);
  const stream = new PcmStream(RATE);
  const id = registry.put('dev-a', stream);
  assert.equal(registry.take('dev-b', id), null);
  assert.equal(registry.take('dev-a', id), stream);
  assert.equal(registry.take('dev-a', id), null);
  const late = registry.put('dev-a', stream);
  now = 2000;
  assert.equal(registry.take('dev-a', late), null);
});

test('StreamRegistry.dropDevice: löscht nur die Ströme dieses Geräts', () => {
  const registry = new StreamRegistry(60_000);
  const a1 = registry.put('dev-a', new PcmStream(RATE));
  registry.put('dev-a', new PcmStream(RATE));
  const b1 = registry.put('dev-b', new PcmStream(RATE));
  assert.equal(registry.dropDevice('dev-a'), 2);
  assert.equal(registry.take('dev-a', a1), null);
  assert.ok(registry.take('dev-b', b1));
  assert.equal(registry.dropDevice('dev-a'), 0);
});
