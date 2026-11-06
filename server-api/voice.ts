import { decodeWavHeader, encodeWav } from './audio.js';
import {
  azureEndpoint,
  azureOutputFormat,
  buildAzureSsml,
  pickAzureSampleRate,
  usableAzureSettings,
  type AzureTtsSettings,
} from './azure-speech.js';
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

interface PcmWavInfo {
  formatTag: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

/**
 * Liest ein WAV chunkweise. Anbieter liefern nicht immer den kanonischen 44-Byte-Kopf
 * (zusätzliche Chunks, Streaming-Kopf mit Länge 0 oder 0xFFFFFFFF); feste Offsets würden
 * dann Header-Bytes als Ton lesen.
 */
function parsePcmWav(audio: Buffer): PcmWavInfo {
  if (audio.length < 12 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new VoiceProviderError('TTS-Provider lieferte kein WAV');
  }
  let format: Omit<PcmWavInfo, 'dataOffset' | 'dataLength'> | null = null;
  let offset = 12;
  while (offset + 8 <= audio.length) {
    const id = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > audio.length) throw new VoiceProviderError('TTS-Provider lieferte ein WAV mit defektem Formatblock');
      format = {
        formatTag: audio.readUInt16LE(body),
        channels: audio.readUInt16LE(body + 2),
        sampleRate: audio.readUInt32LE(body + 4),
        bitsPerSample: audio.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!format) throw new VoiceProviderError('TTS-Provider lieferte ein WAV ohne Formatblock');
      const available = audio.length - body;
      const dataLength = size === 0 || size === 0xffffffff || size > available ? available : size;
      return { ...format, dataOffset: body, dataLength };
    }
    offset = body + size + (size % 2);
  }
  throw new VoiceProviderError('TTS-Provider lieferte ein WAV ohne Audiodaten');
}

function normalizePcmWav(audio: Buffer, targetRate: number): Buffer {
  const wav = parsePcmWav(audio);
  const pcmFormat = wav.formatTag === 1 || wav.formatTag === 0xfffe;
  if (!pcmFormat || wav.bitsPerSample !== 16 || (wav.channels !== 1 && wav.channels !== 2) || wav.sampleRate <= 0) {
    throw new VoiceProviderError('TTS-Provider lieferte kein unterstütztes PCM-WAV');
  }
  const bytesPerFrame = wav.channels * 2;
  const availableFrames = Math.floor(wav.dataLength / bytesPerFrame);
  if (availableFrames <= 0) throw new VoiceProviderError('TTS-Provider lieferte ein leeres WAV');

  if (wav.channels === 1 && wav.sampleRate === targetRate) {
    const dataBytes = availableFrames * 2;
    const canonical = wav.dataOffset === 44 && audio.length === 44 + dataBytes && audio.readUInt32LE(40) === dataBytes;
    // Ein kanonisches WAV geht unverändert durch; sonst mit sauberem Kopf neu verpacken.
    return canonical ? audio : encodeWav(audio.subarray(wav.dataOffset, wav.dataOffset + dataBytes), targetRate, 1, 16);
  }

  const source = new Int16Array(availableFrames);
  for (let index = 0; index < availableFrames; index++) {
    const offset = wav.dataOffset + index * bytesPerFrame;
    const left = audio.readInt16LE(offset);
    const right = wav.channels === 2 ? audio.readInt16LE(offset + 2) : left;
    source[index] = Math.round((left + right) / 2);
  }
  const targetFrames = Math.max(1, Math.round(availableFrames * targetRate / wav.sampleRate));
  const pcm = Buffer.alloc(targetFrames * 2);
  for (let index = 0; index < targetFrames; index++) {
    const sourcePosition = index * (availableFrames - 1) / Math.max(1, targetFrames - 1);
    const lower = Math.floor(sourcePosition);
    const upper = Math.min(availableFrames - 1, lower + 1);
    const fraction = sourcePosition - lower;
    const sample = Math.round(source[lower] * (1 - fraction) + source[upper] * fraction);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), index * 2);
  }
  // Vierter Parameter: Bits pro Sample (16), nicht Bytes. Mit 2 entstand ein kaputter
  // Header (Bittiefe 2), den der Pi-Client als unerwartete Bittiefe ablehnt.
  return encodeWav(pcm, targetRate, 1, 16);
}

/**
 * Verbindung zu einem Sprachdienst mit OpenAI-kompatibler Schnittstelle, in der Regel ein
 * eigener Server (z. B. Speaches). Es gibt bewusst keinen Standarddienst.
 */
export interface SpeechEndpoint {
  /** Basis-URL einschließlich /v1, ohne abschließenden Schrägstrich. */
  url: string;
  /** Optional; ein eigener Server im eigenen Netz braucht keinen Schlüssel. */
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}

function requestHeaders(endpoint: SpeechEndpoint): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'picastAI-ritter-kunibert/0.1' };
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
  return headers;
}

export class OpenAiCompatibleSpeechToText implements SpeechToTextProvider {
  constructor(private readonly endpoint: SpeechEndpoint, private readonly prompt = '') {}

  async transcribe(wav: Buffer): Promise<string> {
    try {
      decodeWavHeader(wav);
    } catch {
      throw new VoiceProviderError('Ungültige WAV-Datei für STT');
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'question.wav');
    form.append('model', this.endpoint.model);
    // Whisper-Modelle erkennen die Sprache sonst selbst und raten bei kurzen Kinderäußerungen falsch.
    form.append('language', 'de');
    if (this.prompt) form.append('prompt', this.prompt);
    form.append('response_format', 'json');

    const timeout = withTimeout(this.endpoint.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint.url}/audio/transcriptions`, {
        method: 'POST',
        headers: requestHeaders(this.endpoint),
        body: form,
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new VoiceProviderError(`STT-Provider antwortete mit HTTP ${response.status}: ${await readError(response)}`, response.status >= 500 || response.status === 429);
      }
      let payload: { text?: unknown };
      try {
        payload = await response.json() as { text?: unknown };
      } catch {
        throw new VoiceProviderError('STT-Provider lieferte keine gültige JSON-Antwort', true);
      }
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
}

export class OpenAiCompatibleTextToSpeech implements TextToSpeechProvider {
  constructor(
    private readonly endpoint: SpeechEndpoint,
    private readonly voice: string,
    private readonly targetSampleRate: number
  ) {}

  async synthesize(text: string): Promise<Buffer> {
    const timeout = withTimeout(this.endpoint.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint.url}/audio/speech`, {
        method: 'POST',
        headers: { ...requestHeaders(this.endpoint), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.endpoint.model,
          voice: this.voice,
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
      // Eigene Server liefern oft 22,05 kHz; das Pi-Format ist 16 kHz Mono.
      return normalizePcmWav(audio, this.targetSampleRate);
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new VoiceProviderError('TTS-Timeout', true);
      throw new VoiceProviderError(`TTS-Netzwerkfehler: ${(error as Error)?.message || 'unbekannt'}`, true);
    } finally {
      timeout.cancel();
    }
  }
}

/**
 * Sprachausgabe über Azure AI Speech (REST, SSML). Es geht nur der Antworttext des
 * Sprachmodells hinaus, nie die Kinderstimme. Azure liefert rohes PCM; der Server verpackt es
 * als WAV und rechnet bei Bedarf auf die Zielrate um.
 */
export class AzureTextToSpeech implements TextToSpeechProvider {
  constructor(
    private readonly settings: AzureTtsSettings,
    private readonly timeoutMs: number,
    private readonly targetSampleRate: number
  ) {}

  async synthesize(text: string): Promise<Buffer> {
    const sampleRate = pickAzureSampleRate(this.targetSampleRate);
    const ssml = buildAzureSsml(text.slice(0, 12_000), {
      voice: this.settings.voice,
      pitch: this.settings.pitch,
      rate: this.settings.rate,
    });
    const timeout = withTimeout(this.timeoutMs);
    try {
      const response = await fetch(azureEndpoint(this.settings.region), {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.settings.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': azureOutputFormat(sampleRate),
          'User-Agent': 'picastAI-ritter-kunibert',
        },
        body: ssml,
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new VoiceProviderError(`TTS-Provider (Azure) antwortete mit HTTP ${response.status}: ${await readError(response)}`, response.status >= 500 || response.status === 429);
      }
      const raw = Buffer.from(await response.arrayBuffer());
      // 16-Bit-Samples: ein halbes Sample am Ende abschneiden; ohne Audio ist es ein Fehler.
      const pcm = raw.subarray(0, raw.length - (raw.length % 2));
      if (pcm.length === 0) throw new VoiceProviderError('TTS-Provider (Azure) lieferte kein Audio');
      return normalizePcmWav(encodeWav(pcm, sampleRate, 1, 16), this.targetSampleRate);
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new VoiceProviderError('TTS-Timeout', true);
      throw new VoiceProviderError(`TTS-Netzwerkfehler (Azure): ${(error as Error)?.message || 'unbekannt'}`, true);
    } finally {
      timeout.cancel();
    }
  }
}

/** Obergrenze für zwischengespeicherte feste Texte (es gibt nur eine Handvoll). */
const MAX_FIXED_CACHE_ENTRIES = 16;

export class VoicePipeline {
  private readonly stt: SpeechToTextProvider | null;
  private readonly tts: TextToSpeechProvider | null;
  private readonly fixedCache = new Map<string, Promise<Buffer>>();

  constructor(config: KunibertConfig) {
    // Ein Dienst gilt nur als konfiguriert, wenn Adresse und Modell (Sprachausgabe: auch Stimme)
    // ausdrücklich gesetzt sind. Ohne Angabe bleibt er aus.
    this.stt = config.sttUrl && config.sttModel
      ? new OpenAiCompatibleSpeechToText(
          { url: config.sttUrl, apiKey: config.sttApiKey, model: config.sttModel, timeoutMs: config.voiceTimeoutMs },
          config.sttPrompt
        )
      : null;
    if (config.ttsProvider === 'azure') {
      const azure = usableAzureSettings(config);
      this.tts = azure ? new AzureTextToSpeech(azure, config.voiceTimeoutMs, config.audioSampleRate) : null;
    } else {
      this.tts = config.ttsUrl && config.ttsModel && config.ttsVoice
        ? new OpenAiCompatibleTextToSpeech(
            { url: config.ttsUrl, apiKey: config.ttsApiKey, model: config.ttsModel, timeoutMs: config.voiceTimeoutMs },
            config.ttsVoice,
            config.audioSampleRate
          )
        : null;
    }
  }

  get sttConfigured(): boolean {
    return Boolean(this.stt);
  }

  get ttsConfigured(): boolean {
    return Boolean(this.tts);
  }

  async transcribe(wav: Buffer): Promise<string> {
    if (!this.stt) throw new VoiceProviderError('Kein STT-Provider konfiguriert');
    return this.stt.transcribe(wav);
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.tts) throw new VoiceProviderError('Kein TTS-Provider konfiguriert');
    return this.tts.synthesize(text);
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
