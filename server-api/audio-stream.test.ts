import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav, parseWav } from './audio.js';
import { PARAGRAPH_PAUSE_MS, PcmStream, StreamingSpeaker, StreamRegistry, streamingWavHeader } from './audio-stream.js';

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
