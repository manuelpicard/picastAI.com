// Ton-Strom (Punkt 71): Der Server vertont eine Geschichte Absatz für Absatz, während Claude noch
// schreibt, und das Gerät spielt schon den ersten Absatz. Nur für Geräte, die es ausdrücklich
// anfragen (Kopf X-Kunibert-Audio-Stream: 1), und nur mit PICASTAI_AUDIO_STREAM=1. Alle anderen
// bekommen wie bisher eine ganze WAV-Datei.
import crypto from 'node:crypto';
import { encodeWav, isPcmFormat, parseWav } from './audio.js';

/** Pause zwischen zwei getrennt vertonten Absätzen (Pocket setzt innerhalb eines Absatzes eigene Pausen). */
export const PARAGRAPH_PAUSE_MS = 900;

/** Kopf einer WAV-Datei unbekannter Länge: RIFF- und data-Länge 0xFFFFFFFF ("bis zum Ende lesen"). */
export function streamingWavHeader(sampleRate: number): Buffer {
  const header = encodeWav(Buffer.alloc(0), sampleRate, 1, 16);
  header.writeUInt32LE(0xffffffff, 4);
  header.writeUInt32LE(0xffffffff, 40);
  return header;
}

/**
 * PCM-Stücke in der Reihenfolge, in der sie entstehen. Ein Leser bekommt alles von Anfang an, auch
 * wenn er später kommt; es gibt nur einen Leser (die audio_url ist einmal abrufbar).
 */
export class PcmStream {
  private readonly chunks: Buffer[] = [];
  private finished = false;
  private failed = false;
  private wake: (() => void) | null = null;
  bytes = 0;

  constructor(readonly sampleRate: number) {}

  push(chunk: Buffer): void {
    if (this.finished || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    this.notify();
  }

  end(): void {
    this.finished = true;
    this.notify();
  }

  /** Abbruch (Sprachausgabe ausgefallen): Der Leser hört auf, das Gerät spielt, was es schon hat. */
  fail(): void {
    this.failed = true;
    this.finished = true;
    this.notify();
  }

  get ok(): boolean {
    return !this.failed;
  }

  get seconds(): number {
    return this.bytes / (this.sampleRate * 2);
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    if (wake) wake();
  }

  /** Liefert alle Stücke, wartet auf neue, bis end() oder fail(). Wirft bei fail(). */
  async *read(): AsyncGenerator<Buffer> {
    let index = 0;
    for (;;) {
      while (index < this.chunks.length) yield this.chunks[index++];
      if (this.failed) throw new Error('Ton-Strom abgebrochen');
      if (this.finished) return;
      await new Promise<void>((resolve) => { this.wake = resolve; });
    }
  }
}

/** Schnittstelle der Sprachausgabe, die der Sprecher braucht (VoicePipeline.synthesize). */
export type Synthesize = (text: string) => Promise<Buffer>;

/**
 * Vertont Texte der Reihe nach (Pocket rechnet ohnehin nur eine Anfrage zur Zeit) und hängt den Ton
 * an einen PcmStream. `firstAudio` erfüllt sich, sobald das erste Stück Ton da ist.
 */
export class StreamingSpeaker {
  readonly stream: PcmStream;
  private queue: Promise<void> = Promise.resolve();
  private said = 0;
  private resolveFirst!: () => void;
  private rejectFirst!: (error: unknown) => void;
  readonly firstAudio: Promise<void>;
  private error: unknown = null;

  constructor(private readonly synthesize: Synthesize, sampleRate: number, private readonly onSynth?: (ms: number) => void) {
    this.stream = new PcmStream(sampleRate);
    this.firstAudio = new Promise<void>((resolve, reject) => { this.resolveFirst = resolve; this.rejectFirst = reject; });
    this.firstAudio.catch(() => undefined);
  }

  get started(): boolean {
    return this.said > 0;
  }

  say(text: string): void {
    const index = this.said++;
    this.queue = this.queue.then(async () => {
      if (this.error) return;
      try {
        const started = performance.now();
        const wav = await this.synthesize(text);
        this.onSynth?.(performance.now() - started);
        const info = parseWav(wav);
        if (!isPcmFormat(info.formatTag) || info.channels !== 1 || info.bitsPerSample !== 16 || info.sampleRate !== this.stream.sampleRate) {
          throw new Error('Sprachausgabe lieferte ein anderes Format als der Strom');
        }
        if (index > 0) this.stream.push(Buffer.alloc(Math.round((this.stream.sampleRate * PARAGRAPH_PAUSE_MS) / 1000) * 2));
        this.stream.push(wav.subarray(info.dataOffset, info.dataOffset + info.dataSize - (info.dataSize % 2)));
        if (index === 0) this.resolveFirst();
      } catch (error) {
        this.error = error;
        this.stream.fail();
        this.rejectFirst(error);
      }
    });
  }

  /** Wartet, bis alles vertont ist, und schließt den Strom. Wirft, wenn die Sprachausgabe ausfiel. */
  async finish(): Promise<void> {
    await this.queue;
    if (this.error) throw this.error;
    this.stream.end();
  }

  /** Bricht ab (zum Beispiel, wenn Brain mit einem Fehler endet). */
  abort(): void {
    this.error = this.error ?? new Error('abgebrochen');
    this.stream.fail();
    this.rejectFirst(this.error);
  }
}

/** Einmal abrufbare Ströme je Gerät, wie AudioStore (devices.ts) für ganze Dateien. */
export class StreamRegistry {
  private readonly items = new Map<string, { deviceId: string; stream: PcmStream; expires: number }>();

  constructor(private readonly ttlMs = 120_000, private readonly now: () => number = Date.now) {}

  put(deviceId: string, stream: PcmStream): string {
    this.purge();
    const turnId = 't_' + crypto.randomBytes(12).toString('base64url');
    this.items.set(turnId, { deviceId, stream, expires: this.now() + this.ttlMs });
    return turnId;
  }

  take(deviceId: string, turnId: string): PcmStream | null {
    this.purge();
    const entry = this.items.get(turnId);
    if (!entry || entry.deviceId !== deviceId) return null;
    this.items.delete(turnId);
    return entry.stream;
  }

  get count(): number {
    this.purge();
    return this.items.size;
  }

  private purge(): void {
    const now = this.now();
    for (const [key, item] of this.items) if (item.expires < now) this.items.delete(key);
  }
}
