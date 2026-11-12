import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioError, decodeWavHeader, encodeWav, isPcmFormat, isSilentPcm16, parseWav, resampleMono16, SILENCE_PEAK } from './audio.js';

function sine(frequency: number, rate: number, seconds: number, amplitude = 10_000): Int16Array {
  const samples = new Int16Array(Math.round(rate * seconds));
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * amplitude);
  return samples;
}

/** Effektivwert im mittleren Teil (die Ränder sind beim Filtern nie ganz vollständig). */
function rms(samples: Int16Array): number {
  const from = Math.floor(samples.length * 0.2);
  const to = Math.floor(samples.length * 0.8);
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

const db = (value: number, reference: number) => 20 * Math.log10(Math.max(value, 1e-9) / reference);

test('Umrechnung: Sprachfrequenzen bleiben gleich laut (22,05 und 24 kHz auf 16 kHz)', () => {
  for (const from of [22_050, 24_000]) {
    for (const frequency of [300, 1_000, 3_000, 6_000]) {
      const source = sine(frequency, from, 1);
      const result = resampleMono16(source, from, 16_000);
      assert.equal(result.length, 16_000);
      const change = db(rms(result), rms(source));
      assert.ok(Math.abs(change) < 0.3, `${frequency} Hz von ${from} Hz: ${change.toFixed(2)} dB`);
    }
  }
});

test('Umrechnung: Anteile über 8 kHz klappen nicht in den hörbaren Bereich zurück', () => {
  // Mit linearer Interpolation (bis 12.11.2026) kamen diese Töne mit etwa -4 dB als Spiegelton heraus.
  for (const [from, frequency] of [[22_050, 9_000], [22_050, 10_000], [24_000, 10_000], [24_000, 11_000]] as const) {
    const source = sine(frequency, from, 1);
    const attenuation = db(rms(resampleMono16(source, from, 16_000)), rms(source));
    assert.ok(attenuation < -60, `${frequency} Hz von ${from} Hz: nur ${attenuation.toFixed(1)} dB gedämpft`);
  }
});

test('Umrechnung: Länge, Gleichanteil, Ränder, gleiche Rate und Hochrechnen', () => {
  assert.equal(resampleMono16(new Int16Array(2_400), 24_000, 16_000).length, 1_600);
  assert.equal(resampleMono16(new Int16Array(1), 22_050, 16_000).length, 1);
  const constant = resampleMono16(new Int16Array(1_000).fill(1_234), 22_050, 16_000);
  assert.deepEqual([constant[0], constant[constant.length >> 1], constant[constant.length - 1]], [1_234, 1_234, 1_234]);
  const same = resampleMono16(Int16Array.from([1, -2, 3]), 16_000, 16_000);
  assert.deepEqual(Array.from(same), [1, -2, 3]);
  const up = resampleMono16(sine(1_000, 8_000, 0.5), 8_000, 16_000);
  assert.equal(up.length, 8_000);
  assert.ok(Math.abs(db(rms(up), rms(sine(1_000, 8_000, 0.5)))) < 0.3);
  // Übersteuerung wird begrenzt, nicht umgeklappt.
  const loud = resampleMono16(Int16Array.from({ length: 200 }, (_v, i) => (i % 2 ? 32_767 : -32_768)), 22_050, 16_000);
  assert.ok(loud.every((value) => value >= -32_768 && value <= 32_767));
});

test('Umrechnung: zwei Minuten Ton dauern unter zwei Sekunden', () => {
  const source = sine(440, 22_050, 120);
  const started = performance.now();
  resampleMono16(source, 22_050, 16_000);
  assert.ok(performance.now() - started < 2_000);
});

const wavOf = (samples: number[]) => {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => pcm.writeInt16LE(value, index * 2));
  return encodeWav(pcm, 16_000, 1, 16);
};

test('Stille: nur eine praktisch stumme Aufnahme gilt als stumm', () => {
  assert.equal(isSilentPcm16(wavOf(new Array(16_000).fill(0))), true);
  assert.equal(isSilentPcm16(wavOf([0, 5, -7, SILENCE_PEAK - 1, -(SILENCE_PEAK - 1)])), true);
  assert.equal(isSilentPcm16(wavOf([0, 0, SILENCE_PEAK, 0])), false);
  assert.equal(isSilentPcm16(wavOf([0, -SILENCE_PEAK, 0])), false);
  assert.equal(isSilentPcm16(wavOf(Array.from(sine(440, 16_000, 0.1, 200)))), false, 'leiser Ton ist nicht stumm');
  assert.equal(isSilentPcm16(wavOf([])), false, 'leer ist kein Fall für die Stille-Regel');
  assert.equal(isSilentPcm16(Buffer.from('kein wav')), false);
  assert.equal(isSilentPcm16(encodeWav(Buffer.alloc(100), 16_000, 1, 8)), false, 'nur 16 Bit');
});

/** Fügt vor dem data-Block einen weiteren Block ein (wie der LIST-Block, den ffmpeg schreibt). */
function withExtraChunk(wav: Buffer, id: string, body: Buffer): Buffer {
  const pad = body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  const chunk = Buffer.concat([Buffer.from(id, 'ascii'), Buffer.alloc(4), body, pad]);
  chunk.writeUInt32LE(body.length, 4);
  const out = Buffer.concat([wav.subarray(0, 36), chunk, wav.subarray(36)]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

test('WAV-Kopf: zusätzliche Blöcke vor den Daten werden übersprungen', () => {
  const pcm = Buffer.alloc(3_200);
  pcm.writeInt16LE(1_000, 100);
  // Ungerade Länge (5 Byte) mit Füllbyte, wie es RIFF verlangt.
  const wav = withExtraChunk(withExtraChunk(encodeWav(pcm, 16_000, 1, 16), 'LIST', Buffer.from('INFOx')), 'junk', Buffer.alloc(30));
  const info = parseWav(wav);
  assert.equal(info.channels, 1);
  assert.equal(info.sampleRate, 16_000);
  assert.equal(info.bitsPerSample, 16);
  assert.equal(info.formatTag, 1);
  assert.equal(info.dataSize, 3_200);
  assert.equal(info.dataOffset, wav.length - 3_200);
  assert.equal(info.duration, 0.1);
  assert.deepEqual(decodeWavHeader(wav), { formatTag: 1, channels: 1, sampleRate: 16_000, bitsPerSample: 16, dataSize: 3_200, duration: 0.1 });
});

test('Stille: auch mit zusätzlichem Block vor den Daten erkannt (Fund im Probelauf vom 12.11.2026)', () => {
  const silent = withExtraChunk(encodeWav(Buffer.alloc(16_000), 16_000, 1, 16), 'LIST', Buffer.from('INFOISFT\x0e\x00\x00\x00Lavf61.7.100\x00\x00'));
  assert.equal(isSilentPcm16(silent), true, 'die Kopf-Bytes des LIST-Blocks sind kein Ton');
  const loud = Buffer.alloc(16_000);
  loud.writeInt16LE(5_000, 8_000);
  assert.equal(isSilentPcm16(withExtraChunk(encodeWav(loud, 16_000, 1, 16), 'LIST', Buffer.from('INFO'))), false);
});

test('WAV-Kopf: Länge 0, 0xFFFFFFFF oder zu groß heißt "bis zum Ende der Datei"', () => {
  for (const declared of [0, 0xffff_ffff, 1_000_000]) {
    const wav = encodeWav(Buffer.alloc(640), 16_000, 1, 16);
    wav.writeUInt32LE(declared, 40);
    assert.equal(parseWav(wav).dataSize, 640, `angegeben ${declared}`);
  }
});

test('WAV-Kopf: kaputte Dateien ergeben einen AudioError', () => {
  assert.throws(() => parseWav(Buffer.from('kein wav')), AudioError);
  const noFormat = encodeWav(Buffer.alloc(100), 16_000, 1, 16);
  noFormat.write('xxxx', 12, 'ascii');
  assert.throws(() => parseWav(noFormat), AudioError, 'ohne fmt-Block');
  const noData = encodeWav(Buffer.alloc(100), 16_000, 1, 16);
  noData.write('xxxx', 36, 'ascii');
  assert.throws(() => parseWav(noData), AudioError, 'ohne data-Block');
  const shortFormat = encodeWav(Buffer.alloc(100), 16_000, 1, 16);
  shortFormat.writeUInt32LE(8, 16);
  assert.throws(() => parseWav(shortFormat), AudioError, 'fmt-Block zu kurz');
});

test('Formatkennung: PCM und WAVE_FORMAT_EXTENSIBLE sind PCM, Gleitkomma nicht', () => {
  assert.equal(isPcmFormat(1), true);
  assert.equal(isPcmFormat(0xfffe), true);
  assert.equal(isPcmFormat(3), false);
  const float = encodeWav(Buffer.alloc(100), 16_000, 1, 16);
  float.writeUInt16LE(3, 20);
  assert.equal(isSilentPcm16(float), false, 'kein PCM: keine Stille-Regel');
});
