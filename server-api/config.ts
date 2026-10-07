// Zentrale Konfiguration für alle Kunibert-Umgebungsvariablen

export interface KunibertConfig {
  // Server-Netzwerk
  port: number;
  host: string;

  // KI & Sprachmodelle
  geminiApiKey: string | null;
  openaiApiKey: string | null;

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
  devicesFilePath: string;
}

export function loadConfig(): KunibertConfig {
  const parseNum = (val: string | undefined, fallback: number): number => {
    if (!val) return fallback;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    port: parseNum(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',

    geminiApiKey: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null,
    openaiApiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : null,

    ageBracket: process.env.KUNIBERT_AGE || 'sechs bis zehn',
    partsPerEpisode: Math.min(12, Math.max(3, parseNum(process.env.KUNIBERT_PARTS_PER_EPISODE, 5))),
    storyMinWords: parseNum(process.env.KUNIBERT_STORY_MIN_WORDS, 170),
    storyMaxWords: parseNum(process.env.KUNIBERT_STORY_MAX_WORDS, 230),
    answerMaxWords: parseNum(process.env.KUNIBERT_ANSWER_MAX_WORDS, 80),

    emergencyNumberPrimary: process.env.KUNIBERT_EMERGENCY_NUMBER_PRIMARY || 'Eins Eins Zwei',
    emergencyNumberKummer: process.env.KUNIBERT_EMERGENCY_NUMBER_KUMMER || 'Eins Eins Sechs, Eins Eins Eins',

    audioTtlSeconds: parseNum(process.env.KUNIBERT_AUDIO_TTL, 120),
    audioSampleRate: parseNum(process.env.KUNIBERT_AUDIO_SAMPLE_RATE, 16000),
    rateLimitMaxTurns: parseNum(process.env.KUNIBERT_RATE_LIMIT, 30),
    rateLimitWindowSeconds: parseNum(process.env.KUNIBERT_RATE_LIMIT_WINDOW, 600),

    diagnosticText: process.env.KUNIBERT_DIAGNOSTIC_TEXT !== '0',
    devicesFilePath: process.env.KUNIBERT_DEVICES_FILE || './devices.json',
  };
}

/**
 * Gibt eine sichere, maskierte Übersicht für das Dashboard zurück (niemals Secrets!).
 */
export function getSafeConfigSummary(config: KunibertConfig) {
  return {
    port: config.port,
    host: config.host,
    hasGeminiKey: Boolean(config.geminiApiKey),
    hasOpenAiKey: Boolean(config.openaiApiKey),
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
  };
}

export const config = loadConfig();
