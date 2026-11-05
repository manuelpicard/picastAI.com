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
  voiceProvider: 'openai' | 'none';
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
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

export function loadConfig(): KunibertConfig {
  const parseNum = (val: string | undefined, fallback: number): number => {
    if (!val) return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const storyMinWords = parseNum(process.env.KUNIBERT_STORY_MIN_WORDS, 170);
  // Verdrehte Grenzen (Minimum über Maximum) würden im Prompt widersprüchlich lauten.
  const storyMaxWords = Math.max(storyMinWords, parseNum(process.env.KUNIBERT_STORY_MAX_WORDS, 230));

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
    voiceProvider: (process.env.PICASTAI_VOICE_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'none')) === 'openai' ? 'openai' : 'none',
    sttModel: process.env.PICASTAI_STT_MODEL || 'whisper-1',
    ttsModel: process.env.PICASTAI_TTS_MODEL || 'tts-1',
    ttsVoice: process.env.PICASTAI_TTS_VOICE || 'alloy',
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
    voiceProvider: config.voiceProvider,
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
