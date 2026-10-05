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
