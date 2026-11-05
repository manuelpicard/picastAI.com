import { decodeWavHeader, encodeWav } from './audio.js';
import type { KunibertConfig } from './config.js';

export interface SpeechToTextProvider {
  transcribe(wav: Buffer): Promise<string>;
}

export interface TextToSpeechProvider {
  synthesize(text: string): Promise<Buffer>;
}

export class VoiceProviderError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 300) || response.statusText;
  } catch {
    return response.statusText;
  }
}

function normalizePcmWav(audio: Buffer, targetRate: number): Buffer {
  const header = decodeWavHeader(audio);
  if (header.bitsPerSample !== 16 || (header.channels !== 1 && header.channels !== 2)) {
    throw new VoiceProviderError('TTS-Provider lieferte kein unterstütztes PCM-WAV');
  }
  const dataOffset = 44;
  const bytesPerFrame = header.channels * 2;
  const availableFrames = Math.floor(Math.min(header.dataSize, audio.length - dataOffset) / bytesPerFrame);
  if (availableFrames <= 0) throw new VoiceProviderError('TTS-Provider lieferte ein leeres WAV');
  if (header.channels === 1 && header.sampleRate === targetRate) return audio;

  const source = new Int16Array(availableFrames);
  for (let index = 0; index < availableFrames; index++) {
    const offset = dataOffset + index * bytesPerFrame;
    const left = audio.readInt16LE(offset);
    const right = header.channels === 2 ? audio.readInt16LE(offset + 2) : left;
    source[index] = Math.round((left + right) / 2);
  }
  const targetFrames = Math.max(1, Math.round(availableFrames * targetRate / header.sampleRate));
  const pcm = Buffer.alloc(targetFrames * 2);
  for (let index = 0; index < targetFrames; index++) {
    const sourcePosition = index * (availableFrames - 1) / Math.max(1, targetFrames - 1);
    const lower = Math.floor(sourcePosition);
    const upper = Math.min(availableFrames - 1, lower + 1);
    const fraction = sourcePosition - lower;
    const sample = Math.round(source[lower] * (1 - fraction) + source[upper] * fraction);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), index * 2);
  }
  return encodeWav(pcm, targetRate, 1, 2);
}

export class OpenAiCompatibleVoiceProvider implements SpeechToTextProvider, TextToSpeechProvider {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: KunibertConfig) {
    this.baseUrl = config.openaiBaseUrl.replace(/\/$/, '');
    this.headers = {
      Authorization: `Bearer ${config.openaiApiKey || ''}`,
      'User-Agent': 'picastAI-ritter-kunibert/0.1',
    };
  }

  async transcribe(wav: Buffer): Promise<string> {
    if (!this.config.openaiApiKey) throw new VoiceProviderError('STT-API-Key fehlt');
    try {
      decodeWavHeader(wav);
    } catch {
      throw new VoiceProviderError('Ungültige WAV-Datei für STT');
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'question.wav');
    form.append('model', this.config.sttModel);
    form.append('language', 'de');
    form.append('response_format', 'json');

    const timeout = withTimeout(this.config.voiceTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.headers,
        body: form,
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new VoiceProviderError(`STT-Provider antwortete mit HTTP ${response.status}: ${await readError(response)}`, response.status >= 500 || response.status === 429);
      }
      const payload = await response.json() as { text?: unknown };
      const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 1000) : '';
      if (!text) throw new VoiceProviderError('STT-Provider lieferte kein Transcript');
      return text;
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new VoiceProviderError('STT-Timeout', true);
      throw new VoiceProviderError(`STT-Netzwerkfehler: ${(error as Error)?.message || 'unbekannt'}`, true);
    } finally {
      timeout.cancel();
    }
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.config.openaiApiKey) throw new VoiceProviderError('TTS-API-Key fehlt');
    const timeout = withTimeout(this.config.voiceTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ttsModel,
          voice: this.config.ttsVoice,
          input: text.slice(0, 12_000),
          response_format: 'wav',
          speed: 0.95,
        }),
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new VoiceProviderError(`TTS-Provider antwortete mit HTTP ${response.status}: ${await readError(response)}`, response.status >= 500 || response.status === 429);
      }
      const audio = Buffer.from(await response.arrayBuffer());
      return normalizePcmWav(audio, this.config.audioSampleRate);
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new VoiceProviderError('TTS-Timeout', true);
      throw new VoiceProviderError(`TTS-Netzwerkfehler: ${(error as Error)?.message || 'unbekannt'}`, true);
    } finally {
      timeout.cancel();
    }
  }
}

/** Obergrenze für zwischengespeicherte feste Texte (es gibt nur eine Handvoll). */
const MAX_FIXED_CACHE_ENTRIES = 16;

export class VoicePipeline {
  private readonly provider: OpenAiCompatibleVoiceProvider | null;
  private readonly fixedCache = new Map<string, Promise<Buffer>>();

  constructor(private readonly config: KunibertConfig) {
    this.provider = config.openaiApiKey && config.voiceProvider === 'openai'
      ? new OpenAiCompatibleVoiceProvider(config)
      : null;
  }

  get sttConfigured(): boolean {
    return Boolean(this.provider);
  }

  get ttsConfigured(): boolean {
    return Boolean(this.provider);
  }

  async transcribe(wav: Buffer): Promise<string> {
    if (!this.provider) throw new VoiceProviderError('Kein STT-Provider konfiguriert');
    return this.provider.transcribe(wav);
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.provider) throw new VoiceProviderError('Kein TTS-Provider konfiguriert');
    return this.provider.synthesize(text);
  }

  /**
   * Für feste Sprechtexte (Sicherheitshinweis, "nicht verstanden", Fehlerhinweis):
   * Derselbe Text ergibt dieselbe Sprachausgabe. Der erste Abruf synthetisiert, danach
   * kommt das WAV aus dem Speicher. Das spart Kosten und Wartezeit, und der
   * Sicherheitshinweis bleibt nach dem Aufwärmen auch bei einem Ausfall des Anbieters
   * hörbar. Gleichzeitige Abrufe teilen sich eine Anfrage, Fehler werden nicht
   * gespeichert. Das zurückgegebene Buffer-Objekt darf nicht verändert werden.
   */
  synthesizeCached(text: string): Promise<Buffer> {
    const cached = this.fixedCache.get(text);
    if (cached) return cached;
    const pending = this.synthesize(text);
    if (this.fixedCache.size < MAX_FIXED_CACHE_ENTRIES) {
      this.fixedCache.set(text, pending);
      pending.catch(() => {
        if (this.fixedCache.get(text) === pending) this.fixedCache.delete(text);
      });
    }
    return pending;
  }

  /** Füllt den Cache vor dem ersten Kontakt mit einem Kind. Fehler sind unkritisch; Rückgabe: Anzahl der Erfolge. */
  async warmUp(texts: string[]): Promise<number> {
    let succeeded = 0;
    for (const text of texts) {
      try {
        await this.synthesizeCached(text);
        succeeded++;
      } catch (error) {
        console.warn('Aufwärmen der festen Sprechtexte fehlgeschlagen:', (error as Error)?.message || error);
      }
    }
    return succeeded;
  }
}
