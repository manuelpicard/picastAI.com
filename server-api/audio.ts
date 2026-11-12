// WAV Audio-Hilfen nach Kunibert Spezifikation (16 kHz, mono, 16-bit PCM)

export const INPUT_RATE = 16000;
export const MAX_INPUT_SECONDS = 30;
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_OUTPUT_SECONDS = 180;
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export class AudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioError';
  }
}

export function encodeWav(pcmData: Buffer, sampleRate: number = 16000, channels: number = 1, bitsPerSample: number = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM = 1
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

// ---------------------------------------------------------------------------
// Abtastrate umrechnen (Sprachausgabe 22,05 oder 24 kHz -> Geräteformat 16 kHz)
// ---------------------------------------------------------------------------

/** Filterlänge je Seite in Nulldurchgängen des Sinc-Kerns (mehr = steilere Flanke, mehr Rechenzeit). */
const RESAMPLE_ZERO_CROSSINGS = 20;
/** Grenzfrequenz als Anteil der halben Zielrate: bei 16 kHz etwa 7,2 kHz. */
const RESAMPLE_ROLLOFF = 0.9;
/** Höchstzahl vorberechneter Filterphasen; übliche Raten brauchen 2 (24 kHz) bis 320 (22,05 kHz). */
const RESAMPLE_MAX_PHASES = 2048;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Rechnet Mono-PCM (16 Bit) auf eine andere Abtastrate um, mit Tiefpass gegen Aliasing
 * (gefensterter Sinc, Blackman-Fenster, Gewichte je Phase vorberechnet).
 *
 * Vorher wurde nur linear zwischen zwei Samples interpoliert. Beim Herunterrechnen von 22,05
 * oder 24 kHz auf 16 kHz klappten dabei Anteile über 8 kHz fast ungedämpft in den hörbaren
 * Bereich zurück (ein Ton mit 10 kHz kam mit -4,6 dB als 6-kHz-Ton heraus, jetzt unter
 * -80 dB), und 6 kHz wurden um 2 dB gedämpft (jetzt 0 dB). Bei Sprache trifft das vor allem
 * s- und sch-Laute. Länge des Ergebnisses wie bisher: round(Quelllänge * Zielrate /
 * Quellrate), mindestens 1. Ganzzahlige Raten werden erwartet.
 */
export function resampleMono16(source: Int16Array, fromRate: number, toRate: number): Int16Array {
  const targetFrames = Math.max(1, Math.round((source.length * toRate) / fromRate));
  if (fromRate === toRate || source.length === 0) {
    const copy = new Int16Array(targetFrames);
    copy.set(source.subarray(0, targetFrames));
    return copy;
  }
  const divisor = gcd(Math.round(fromRate), Math.round(toRate)) || 1;
  const up = Math.round(toRate) / divisor; // Zahl der Phasen
  const down = Math.round(fromRate) / divisor; // Quell-Samples je "up" Ziel-Samples
  const phases = up <= RESAMPLE_MAX_PHASES ? up : RESAMPLE_MAX_PHASES;
  const cutoff = 0.5 * Math.min(1, toRate / fromRate) * RESAMPLE_ROLLOFF; // Zyklen je Quell-Sample
  const halfWidth = RESAMPLE_ZERO_CROSSINGS / (2 * cutoff); // in Quell-Samples
  const reach = Math.ceil(halfWidth); // Abgriffe je Seite
  const taps = 2 * reach;

  const kernel = (x: number): number => {
    const distance = Math.abs(x);
    if (distance >= halfWidth) return 0;
    const arg = 2 * cutoff * distance;
    const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg);
    const u = distance / halfWidth;
    return sinc * (0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u));
  };
  // Gewichte je Phase (Bruchteil zwischen zwei Quell-Samples) für die Abgriffe base-reach+1 .. base+reach.
  const weights = new Float64Array(phases * taps);
  const sums = new Float64Array(phases);
  for (let phase = 0; phase < phases; phase++) {
    const fraction = phase / phases;
    let sum = 0;
    for (let j = 0; j < taps; j++) {
      const w = kernel(fraction - (j - reach + 1));
      weights[phase * taps + j] = w;
      sum += w;
    }
    sums[phase] = sum;
  }

  const out = new Int16Array(targetFrames);
  const last = source.length - 1;
  for (let n = 0; n < targetFrames; n++) {
    let base: number;
    let phase: number;
    if (phases === up) {
      const position = n * down;
      base = Math.floor(position / up);
      phase = position - base * up;
    } else {
      // Sehr ungewöhnliche Raten: nächstgelegene vorberechnete Phase.
      const t = (n * fromRate) / toRate;
      base = Math.floor(t);
      phase = Math.min(phases - 1, Math.round((t - base) * phases));
    }
    const first = base - reach + 1;
    const offset = phase * taps;
    let sum = 0;
    let weight = sums[phase];
    if (first >= 0 && first + taps - 1 <= last) {
      for (let j = 0; j < taps; j++) sum += source[first + j] * weights[offset + j];
    } else {
      // Am Anfang und Ende fehlen Nachbarn: nur vorhandene Samples, Gewichte neu summiert.
      weight = 0;
      for (let j = 0; j < taps; j++) {
        const k = first + j;
        if (k < 0 || k > last) continue;
        sum += source[k] * weights[offset + j];
        weight += weights[offset + j];
      }
    }
    // Durch die Summe der Gewichte teilen: Der Gleichanteil bleibt exakt, und die Ränder
    // werden nicht leiser.
    const value = weight > 0 ? sum / weight : 0;
    out[n] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }
  return out;
}

export function decodeWavHeader(buffer: Buffer) {
  if (buffer.length < 44) {
    throw new AudioError('WAV-Datei zu kurz');
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new AudioError('Keine gültige RIFF/WAVE Datei');
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataSize = buffer.readUInt32LE(40);
  const duration = dataSize / ((sampleRate * channels * bitsPerSample) / 8);

  return { channels, sampleRate, bitsPerSample, dataSize, duration };
}

/** Spitzenwert, unter dem eine 16-Bit-Aufnahme als stumm gilt (32 von 32767, etwa -60 dBFS). */
export const SILENCE_PEAK = 32;

/**
 * true, wenn eine Aufnahme (16 Bit PCM mit dem 44-Byte-Kopf der Geräte) praktisch stumm ist:
 * Mikrofon aus oder defekt, falsches Gerät, unter Windows der Zugriff gesperrt. Dann gibt es
 * nichts zu erkennen, und Whisper erfindet bei Stille gern Text. Der Wert ist bewusst niedrig
 * (Einschätzung, nicht gemessen: auch leises Sprechen in ein ungeregeltes I2S-Mikrofon liegt
 * deutlich darüber). Andere Formate gelten nicht als stumm.
 */
export function isSilentPcm16(wav: Buffer, peakLimit: number = SILENCE_PEAK): boolean {
  let header: ReturnType<typeof decodeWavHeader>;
  try {
    header = decodeWavHeader(wav);
  } catch {
    return false;
  }
  if (header.bitsPerSample !== 16) return false;
  const end = Math.min(wav.length, 44 + header.dataSize) & ~1;
  if (end <= 44) return false;
  for (let offset = 44; offset + 1 < end; offset += 2) {
    const sample = wav.readInt16LE(offset);
    if (sample >= peakLimit || sample <= -peakLimit) return false;
  }
  return true;
}

/**
 * Erzeugt einen sanften, kindgerechten Begleitton (oder Hörsignal) als 16kHz PCM WAV.
 */
export function generateToneWav(frequency: number = 440, durationSeconds: number = 2.0, sampleRate: number = 16000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Hüllkurve mit sanftem Fade-in / Fade-out
    let envelope = 1.0;
    const fade = 0.05;
    if (t < fade) envelope = t / fade;
    else if (t > durationSeconds - fade) envelope = (durationSeconds - t) / fade;

    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.25 * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    pcm.writeInt16LE(intSample, i * 2);
  }

  return encodeWav(pcm, sampleRate);
}

/**
 * Erzeugt eine kindgerechte Melodie-Antwort als WAV
 */
export function generateMelodyWav(notes: number[], durations: number[], sampleRate: number = 16000): Buffer {
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const pcm = Buffer.alloc(totalSamples * 2);

  let currentSample = 0;
  for (let n = 0; n < notes.length; n++) {
    const freq = notes[n];
    const dur = durations[n];
    const noteSamples = Math.floor(sampleRate * dur);

    for (let i = 0; i < noteSamples; i++) {
      const t = i / sampleRate;
      let env = 1.0;
      if (t < 0.03) env = t / 0.03;
      else if (t > dur - 0.03) env = Math.max(0, (dur - t) / 0.03);

      const s = freq > 0 ? (Math.sin(2 * Math.PI * freq * t) * 0.3 * env) : 0;
      const val = Math.max(-32768, Math.min(32767, Math.floor(s * 32767)));
      pcm.writeInt16LE(val, (currentSample + i) * 2);
    }
    currentSample += noteSamples;
  }

  return encodeWav(pcm, sampleRate);
}
