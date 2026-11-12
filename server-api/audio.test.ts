import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav, isSilentPcm16, resampleMono16, SILENCE_PEAK } from './audio.js';

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
