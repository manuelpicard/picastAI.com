// Zentrale Konfiguration für alle Kunibert-Umgebungsvariablen
import { normalizePublicBaseUrl, parseTrustProxy, type TrustProxySetting } from './http-utils.js';

export interface KunibertConfig {
  // Server-Netzwerk
  port: number;
  host: string;
  adminToken: string | null;
  /** Ursprung, unter dem Geräte den Server erreichen (für die audio_url); null = aus der Anfrage ableiten. */
  publicBaseUrl: string | null;
  /** Express "trust proxy" (hinter TLS-beendendem Proxy nötig, damit https erkannt wird). */
  trustProxy: TrustProxySetting;

  // KI & Sprachmodelle
  llmProvider: 'gemini' | 'anthropic' | 'none';
  llmTimeoutMs: number;
  geminiApiKey: string | null;
  geminiModel: string;
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicBaseUrl: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  /** Spracherkennung: nur OpenAI-kompatible Schnittstelle (/audio/transcriptions). */
  sttProvider: 'openai' | 'none';
  /** Sprachausgabe: OpenAI-kompatibel (/audio/speech) oder Gemini. */
  ttsProvider: 'openai' | 'gemini' | 'none';
  sttModel: string;
  /** Optionaler Hinweis an die Spracherkennung (PICASTAI_STT_PROMPT); leer = keiner. */
  sttPrompt: string;
  ttsModel: string;
  ttsVoice: string;
  /** Sprechweise für Gemini-TTS (Anweisung in natürlicher Sprache); leer = ohne Anweisung. */
  ttsStyle: string;
  voiceTimeoutMs: number;

  // Erzähl- & Pädagogik-Parameter
  ageBracket: string;
  partsPerEpisode: number;
  storyMinWords: number;
  storyMaxWords: number;
  answerMaxWords: number;

  // Sicherheit & Kinderschutz
  emergencyNumberPrimary: string;
  emergencyNumberKummer: string;

  // Audio & Speicher-Grenzen
  audioTtlSeconds: number;
  audioSampleRate: number;
  rateLimitMaxTurns: number;
  rateLimitWindowSeconds: number;

  // Diagnose & Protokollierung
  diagnosticText: boolean;

  // Geräteliste: 'memory' (flüchtig, Standard) oder 'firestore' (dauerhaft)
  deviceStore: 'memory' | 'firestore';
}

export function isDiagnosticTextEnabled(
  env: { NODE_ENV?: string; KUNIBERT_DIAGNOSTIC_TEXT?: string } = process.env
): boolean {
  return env.NODE_ENV !== 'production' && env.KUNIBERT_DIAGNOSTIC_TEXT?.trim() === '1';
}

/**
 * Wahl des Sprachmodell-Anbieters. Ausdrücklich per PICASTAI_LLM_PROVIDER
 * (gemini | anthropic | none), sonst automatisch nach vorhandenem Key
 * (Gemini zuerst, damit bestehende Installationen unverändert bleiben).
 */
export function resolveLlmProvider(
  env: { PICASTAI_LLM_PROVIDER?: string; GEMINI_API_KEY?: string; ANTHROPIC_API_KEY?: string } = process.env
): 'gemini' | 'anthropic' | 'none' {
  const requested = env.PICASTAI_LLM_PROVIDER?.trim().toLowerCase();
  if (requested === 'gemini' || requested === 'anthropic' || requested === 'none') return requested;
  if (env.GEMINI_API_KEY?.trim()) return 'gemini';
  if (env.ANTHROPIC_API_KEY?.trim()) return 'anthropic';
  return 'none';
}

export const DEFAULT_TTS_STYLE =
  'Erzähle ruhig, warm und freundlich wie ein Märchenerzähler für Kinder. Nicht zu schnell, deutlich betont, mit kleinen Pausen.';

/**
 * Wahl der Sprachdienste. PICASTAI_VOICE_PROVIDER=none schaltet beide ab; "openai" wählt wie
 * früher OpenAI für beides. Sonst bestimmt PICASTAI_TTS_PROVIDER die Sprachausgabe
 * (openai | gemini | none), und ohne Angabe gilt: Gemini, wenn ein Gemini-Key da ist,
 * sonst OpenAI mit Key. Hintergrund: OpenAI schaltet tts-1 am 6.1.2027 ab.
 */
export function resolveVoiceProviders(
  env: {
    PICASTAI_VOICE_PROVIDER?: string;
    PICASTAI_TTS_PROVIDER?: string;
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
  } = process.env
): { stt: 'openai' | 'none'; tts: 'openai' | 'gemini' | 'none' } {
  const master = env.PICASTAI_VOICE_PROVIDER?.trim().toLowerCase();
  const hasOpenAi = Boolean(env.OPENAI_API_KEY?.trim());
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  if (master === 'none') return { stt: 'none', tts: 'none' };

  const stt = master === 'openai' || hasOpenAi ? 'openai' : 'none';

  const requested = env.PICASTAI_TTS_PROVIDER?.trim().toLowerCase();
  if (requested === 'openai' || requested === 'gemini' || requested === 'none') return { stt, tts: requested };
  if (master === 'openai') return { stt, tts: 'openai' };
  if (hasGemini) return { stt, tts: 'gemini' };
  return { stt, tts: hasOpenAi ? 'openai' : 'none' };
}

/** Warnungen für Modelle, die der Anbieter bereits zur Abschaltung angekündigt hat (Stand 11/2026). */
export function voiceDeprecationWarnings(
  config: Pick<KunibertConfig, 'sttProvider' | 'sttModel' | 'ttsProvider' | 'ttsModel'>
): string[] {
  const warnings: string[] = [];
  if (config.ttsProvider === 'openai' && ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'].some((m) => config.ttsModel.startsWith(m))) {
    warnings.push(
      `Sprachausgabe: ${config.ttsModel} wird von OpenAI am 6.1.2027 abgeschaltet. Auf Gemini umstellen (GEMINI_API_KEY setzen, PICASTAI_TTS_PROVIDER=gemini).`
    );
  }
  if (config.sttProvider === 'openai' && ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].some((m) => config.sttModel.startsWith(m))) {
    warnings.push(
      `Spracherkennung: ${config.sttModel} wird von OpenAI am 26.2.2027 abgeschaltet. Auf gpt-transcribe umstellen (PICASTAI_STT_MODEL).`
    );
  }
  return warnings;
}

export function loadConfig(): KunibertConfig {
  const parseNum = (val: string | undefined, fallback: number): number => {
    if (!val) return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const storyMinWords = parseNum(process.env.KUNIBERT_STORY_MIN_WORDS, 170);
  // Verdrehte Grenzen (Minimum über Maximum) würden im Prompt widersprüchlich lauten.
  const storyMaxWords = Math.max(storyMinWords, parseNum(process.env.KUNIBERT_STORY_MAX_WORDS, 230));

  const voiceProviders = resolveVoiceProviders();

  return {
    port: parseNum(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    adminToken: process.env.PICASTAI_ADMIN_TOKEN?.trim() || null,
    publicBaseUrl: normalizePublicBaseUrl(process.env.PICASTAI_PUBLIC_BASE_URL),
    trustProxy: parseTrustProxy(process.env.PICASTAI_TRUST_PROXY),

    llmProvider: resolveLlmProvider(),
    llmTimeoutMs: Math.min(120_000, Math.max(3_000, parseNum(process.env.PICASTAI_LLM_TIMEOUT_MS, 30_000))),
    geminiApiKey: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null,
    geminiModel: process.env.PICASTAI_GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicModel: process.env.PICASTAI_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
    openaiApiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : null,
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    sttProvider: voiceProviders.stt,
    ttsProvider: voiceProviders.tts,
    sttModel: process.env.PICASTAI_STT_MODEL?.trim() || 'gpt-transcribe',
    sttPrompt: process.env.PICASTAI_STT_PROMPT?.trim() || '',
    ttsModel: process.env.PICASTAI_TTS_MODEL?.trim() || (voiceProviders.tts === 'gemini' ? 'gemini-3.8-flash-tts' : 'tts-1'),
    ttsVoice: process.env.PICASTAI_TTS_VOICE?.trim() || (voiceProviders.tts === 'gemini' ? 'Sulafat' : 'alloy'),
    // Ein ausdrücklich leerer Wert schaltet die Anweisung ab; nicht gesetzt = Standard.
    ttsStyle: process.env.PICASTAI_TTS_STYLE === undefined ? DEFAULT_TTS_STYLE : process.env.PICASTAI_TTS_STYLE.trim(),
    voiceTimeoutMs: Math.min(120_000, Math.max(3_000, parseNum(process.env.PICASTAI_VOICE_TIMEOUT_MS, 45_000))),

    ageBracket: process.env.KUNIBERT_AGE || 'sechs bis zehn',
    partsPerEpisode: Math.min(12, Math.max(3, parseNum(process.env.KUNIBERT_PARTS_PER_EPISODE, 5))),
    storyMinWords,
    storyMaxWords,
    answerMaxWords: parseNum(process.env.KUNIBERT_ANSWER_MAX_WORDS, 80),

    emergencyNumberPrimary: process.env.KUNIBERT_EMERGENCY_NUMBER_PRIMARY || 'Eins Eins Zwei',
    emergencyNumberKummer: process.env.KUNIBERT_EMERGENCY_NUMBER_KUMMER || 'Eins Eins Sechs, Eins Eins Eins',

    audioTtlSeconds: parseNum(process.env.KUNIBERT_AUDIO_TTL, 120),
    audioSampleRate: parseNum(process.env.KUNIBERT_AUDIO_SAMPLE_RATE, 16000),
    rateLimitMaxTurns: parseNum(process.env.KUNIBERT_RATE_LIMIT, 30),
    rateLimitWindowSeconds: parseNum(process.env.KUNIBERT_RATE_LIMIT_WINDOW, 600),

    diagnosticText: isDiagnosticTextEnabled(),
    deviceStore: process.env.PICASTAI_DEVICE_STORE?.trim() === 'firestore' ? 'firestore' : 'memory',
  };
}

/**
 * Gibt eine sichere, maskierte Übersicht für das Dashboard zurück (niemals Secrets!).
 */
export function getSafeConfigSummary(config: KunibertConfig) {
  return {
    port: config.port,
    host: config.host,
    publicBaseUrl: config.publicBaseUrl,
    trustProxy: String(config.trustProxy),
    hasGeminiKey: Boolean(config.geminiApiKey),
    hasAnthropicKey: Boolean(config.anthropicApiKey),
    llmProvider: config.llmProvider,
    llmModel: config.llmProvider === 'gemini'
      ? config.geminiModel
      : config.llmProvider === 'anthropic'
        ? config.anthropicModel
        : null,
    hasOpenAiKey: Boolean(config.openaiApiKey),
    sttProvider: config.sttProvider,
    ttsProvider: config.ttsProvider,
    sttModel: config.sttModel,
    ttsModel: config.ttsModel,
    ttsVoice: config.ttsVoice,
    ageBracket: config.ageBracket,
    partsPerEpisode: config.partsPerEpisode,
    storyWordRange: `${config.storyMinWords}–${config.storyMaxWords} Wörter`,
    answerMaxWords: config.answerMaxWords,
    emergencyNumberPrimary: config.emergencyNumberPrimary,
    emergencyNumberKummer: config.emergencyNumberKummer,
    audioTtlSeconds: `${config.audioTtlSeconds} s (flüchtiger RAM)`,
    audioSampleRate: `${config.audioSampleRate} Hz (16-bit PCM)`,
    rateLimit: `${config.rateLimitMaxTurns} Turns pro ${Math.round(config.rateLimitWindowSeconds / 60)} Minuten`,
    diagnosticText: config.diagnosticText,
    deviceStore: config.deviceStore,
  };
}

export const config = loadConfig();
