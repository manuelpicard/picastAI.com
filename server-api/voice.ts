import { decodeWavHeader, encodeWav, isPcmFormat, parseWav, resampleMono16, type WavInfo } from './audio.js';
import type { KunibertConfig } from './config.js';
import { summarizeErrorResponse } from './provider-errors.js';
import {
  GOOGLE_TTS_ENDPOINT,
  buildGoogleRequest,
  splitSpeechText,
  usableGoogleSettings,
  type GoogleTtsSettings,
} from './google-speech.js';

export interface SpeechToTextProvider {
  /** timeoutMs: Obergrenze aus dem Zeitbudget der Anfrage; die eigene Grenze des Dienstes gilt zusätzlich. */
  transcribe(wav: Buffer, timeoutMs?: number): Promise<string>;
}

export interface TextToSpeechProvider {
  synthesize(text: string, timeoutMs?: number): Promise<Buffer>;
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


/**
 * Liest das WAV des Anbieters chunkweise (parseWav in audio.ts). Anbieter liefern nicht immer
 * den kanonischen 44-Byte-Kopf (zusätzliche Chunks, Streaming-Kopf mit Länge 0 oder
 * 0xFFFFFFFF); feste Offsets würden dann Header-Bytes als Ton lesen.
 */
function parsePcmWav(audio: Buffer): WavInfo {
  try {
    return parseWav(audio);
  } catch {
    // Nur ein fester Text: Die Meldung landet im Protokoll.
    throw new VoiceProviderError('TTS-Provider lieferte kein lesbares WAV');
  }
}

function normalizePcmWav(audio: Buffer, targetRate: number): Buffer {
  const wav = parsePcmWav(audio);
  if (!isPcmFormat(wav.formatTag) || wav.bitsPerSample !== 16 || (wav.channels !== 1 && wav.channels !== 2) || wav.sampleRate <= 0) {
    throw new VoiceProviderError('TTS-Provider lieferte kein unterstütztes PCM-WAV');
  }
  const bytesPerFrame = wav.channels * 2;
  const availableFrames = Math.floor(wav.dataSize / bytesPerFrame);
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
  // Mit Tiefpass statt linearer Interpolation (siehe resampleMono16): sonst klingen s-Laute rau.
  const resampled = resampleMono16(source, wav.sampleRate, targetRate);
  const pcm = Buffer.alloc(resampled.length * 2);
  for (let index = 0; index < resampled.length; index++) pcm.writeInt16LE(resampled[index], index * 2);
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

  async transcribe(wav: Buffer, timeoutMs?: number): Promise<string> {
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

    const timeout = withTimeout(Math.min(this.endpoint.timeoutMs, timeoutMs ?? Infinity));
    try {
      const response = await fetch(`${this.endpoint.url}/audio/transcriptions`, {
        method: 'POST',
        headers: requestHeaders(this.endpoint),
        body: form,
        signal: timeout.signal,
      });
      if (!response.ok) {
        // Nur Status und Fehlercode, nie der Fließtext: Er kann gesendeten Text enthalten (provider-errors.ts).
        throw new VoiceProviderError(`STT-Provider antwortete mit ${await summarizeErrorResponse(response)}`, response.status >= 500 || response.status === 429);
      }
      let payload: { text?: unknown };
      try {
        payload = await response.json() as { text?: unknown };
      } catch {
        throw new VoiceProviderError('STT-Provider lieferte keine gültige JSON-Antwort', true);
      }
      // Ein leerer Text ist kein Fehler: Stille, Rauschen oder eine zu leise Äußerung ergeben
      // keinen Text. Die Pipeline antwortet dann mit "Das habe ich leider nicht richtig verstanden"
      // statt mit einem Fehler (502). Ein Antwortfeld ohne Text ist dagegen ein Fehler des Dienstes.
      if (typeof payload.text !== 'string') throw new VoiceProviderError('STT-Provider lieferte keine Textantwort');
      return payload.text.trim().slice(0, 1000);
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

  async synthesize(text: string, timeoutMs?: number): Promise<Buffer> {
    const timeout = withTimeout(Math.min(this.endpoint.timeoutMs, timeoutMs ?? Infinity));
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
        // Ein Prüffehler (422) von Speaches enthielte sonst den Antworttext für das Kind.
        throw new VoiceProviderError(`TTS-Provider antwortete mit ${await summarizeErrorResponse(response)}`, response.status >= 500 || response.status === 429);
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
 * Sprachausgabe über Google Cloud Text-to-Speech (REST, Chirp 3 HD, EU-Endpunkt). Es geht nur der
 * Antworttext des Sprachmodells hinaus, nie die Kinderstimme. Der Schlüssel steht im Kopf
 * `X-Goog-Api-Key`, nie in der Adresse, damit er in keinem Protokoll auftaucht. Google nimmt
 * höchstens 5000 Bytes je Anfrage: längere Texte werden an Satzgrenzen geteilt und die Teile
 * hintereinander zu einem WAV zusammengesetzt.
 */
export class GoogleTextToSpeech implements TextToSpeechProvider {
  constructor(
    private readonly settings: GoogleTtsSettings,
    private readonly timeoutMs: number,
    private readonly targetSampleRate: number
  ) {}

  async synthesize(text: string, timeoutMs?: number): Promise<Buffer> {
    const chunks = splitSpeechText(text.slice(0, 12_000));
    if (chunks.length === 0) throw new VoiceProviderError('TTS: kein Text zum Sprechen');
    const wavs: Buffer[] = [];
    // Die Frist aus dem Zeitbudget gilt für alle Teilstücke zusammen, nicht je Teilstück.
    const deadline = timeoutMs === undefined ? Infinity : Date.now() + timeoutMs;
    for (const chunk of chunks) wavs.push(await this.synthesizeChunk(chunk, Math.max(1, deadline - Date.now())));
    if (wavs.length === 1) return wavs[0];
    // normalizePcmWav liefert immer ein WAV mit kanonischem 44-Byte-Kopf in der Zielrate.
    return encodeWav(Buffer.concat(wavs.map((wav) => wav.subarray(44))), this.targetSampleRate, 1, 16);
  }

  private async synthesizeChunk(text: string, budgetMs: number): Promise<Buffer> {
    const timeout = withTimeout(Math.min(this.timeoutMs, budgetMs));
    try {
      const response = await fetch(GOOGLE_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Goog-Api-Key': this.settings.key,
          'Content-Type': 'application/json',
          'User-Agent': 'picastAI-ritter-kunibert',
        },
        body: JSON.stringify(buildGoogleRequest(text, this.settings.voice, this.settings.speakingRate)),
        signal: timeout.signal,
      });
      if (!response.ok) {
        throw new VoiceProviderError(`TTS-Provider (Google) antwortete mit ${await summarizeErrorResponse(response)}`, response.status >= 500 || response.status === 429);
      }
      let payload: { audioContent?: unknown };
      try {
        payload = await response.json() as { audioContent?: unknown };
      } catch {
        throw new VoiceProviderError('TTS-Provider (Google) lieferte keine gültige JSON-Antwort', true);
      }
      if (typeof payload.audioContent !== 'string' || !payload.audioContent) {
        throw new VoiceProviderError('TTS-Provider (Google) lieferte kein Audio');
      }
      // LINEAR16 kommt mit WAV-Kopf (bei Chirp 3 HD 24 kHz); auf das Pi-Format 16 kHz Mono umrechnen.
      return normalizePcmWav(Buffer.from(payload.audioContent, 'base64'), this.targetSampleRate);
    } catch (error) {
      if (error instanceof VoiceProviderError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new VoiceProviderError('TTS-Timeout', true);
      throw new VoiceProviderError(`TTS-Netzwerkfehler (Google): ${(error as Error)?.message || 'unbekannt'}`, true);
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
    if (config.ttsProvider === 'google') {
      const google = usableGoogleSettings(config);
      this.tts = google ? new GoogleTextToSpeech(google, config.voiceTimeoutMs, config.audioSampleRate) : null;
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

  async transcribe(wav: Buffer, timeoutMs?: number): Promise<string> {
    if (!this.stt) throw new VoiceProviderError('Kein STT-Provider konfiguriert');
    return this.stt.transcribe(wav, timeoutMs);
  }

  async synthesize(text: string, timeoutMs?: number): Promise<Buffer> {
    if (!this.tts) throw new VoiceProviderError('Kein TTS-Provider konfiguriert');
    return this.tts.synthesize(text, timeoutMs);
  }

  /**
   * Für feste Sprechtexte (Sicherheitshinweis, "nicht verstanden", Fehlerhinweis):
   * Derselbe Text ergibt dieselbe Sprachausgabe. Der erste Abruf synthetisiert, danach
   * kommt das WAV aus dem Speicher. Das spart Kosten und Wartezeit, und der
   * Sicherheitshinweis bleibt nach dem Aufwärmen auch bei einem Ausfall des Anbieters
   * hörbar. Gleichzeitige Abrufe teilen sich eine Anfrage, Fehler werden nicht
   * gespeichert. Das zurückgegebene Buffer-Objekt darf nicht verändert werden.
   */
  synthesizeCached(text: string, timeoutMs?: number): Promise<Buffer> {
    const cached = this.fixedCache.get(text);
    if (cached) return cached;
    const pending = this.synthesize(text, timeoutMs);
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

  /**
   * Wie warmUp, aber mit neuen Versuchen, bis alle Texte im Speicher sind. Nach einem Neustart
   * des Rechners startet der Sprachserver (Docker) oft später als dieser Dienst. Mit nur einem
   * Versuch blieb der Sicherheitshinweis dann ungewärmt und hing beim ersten Kind an einem
   * Sprachserver, der vielleicht gerade nicht antwortet. Schon gespeicherte Texte kosten bei
   * jeder Runde nichts. Rückgabe: Anzahl der gespeicherten Texte nach der letzten Runde.
   */
  async warmUpWithRetry(
    texts: string[],
    options: {
      delaysMs?: number[];
      sleep?: (ms: number) => Promise<void>;
      log?: (line: string) => void;
    } = {}
  ): Promise<number> {
    const delays = options.delaysMs ?? WARM_UP_DELAYS_MS;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref()));
    const log = options.log ?? ((line: string) => console.log(line));
    let done = await this.warmUp(texts);
    for (const delay of delays) {
      if (done >= texts.length) break;
      log(`Feste Sprechtexte: ${done} von ${texts.length} vorbereitet, neuer Versuch in ${Math.round(delay / 1000)} s.`);
      await sleep(delay);
      done = await this.warmUp(texts);
    }
    return done;
  }
}

/** Wartezeiten zwischen den Aufwärm-Runden: zusammen gut sechs Minuten, dann gibt der Dienst auf. */
const WARM_UP_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 60_000, 60_000];
