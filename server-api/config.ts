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
  llmProvider: 'anthropic' | 'none';
  llmTimeoutMs: number;
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicBaseUrl: string;
  /**
   * Spracherkennung über eine OpenAI-kompatible Schnittstelle (POST {sttUrl}/audio/transcriptions),
   * z. B. ein eigener Speaches-Server. null = aus. Es gibt keinen Voreinstellungsdienst:
   * Kinderstimmen sollen nur an einen Dienst gehen, den der Betreiber bewusst gewählt hat.
   */
  sttUrl: string | null;
  /** Optionaler Schlüssel; ein eigener Server im eigenen Netz braucht keinen. */
  sttApiKey: string | null;
  sttModel: string;
  /** Optionaler Hinweis an die Spracherkennung (PICASTAI_STT_PROMPT); leer = keiner. */
  sttPrompt: string;
  /** Sprachausgabe über eine OpenAI-kompatible Schnittstelle (POST {ttsUrl}/audio/speech). null = aus. */
  ttsUrl: string | null;
  ttsApiKey: string | null;
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
 * Wahl des Sprachmodell-Anbieters: PICASTAI_LLM_PROVIDER=anthropic | none, ohne Angabe
 * Anthropic, wenn ein Key da ist. Gemini gibt es nicht mehr: Googles Bedingungen schließen
 * Anwendungen aus, die sich an unter 18-Jährige richten. Ein ausdrückliches "gemini" ergibt
 * "none" (feste Erzähltexte) statt eines stillen Wechsels des Anbieters; llmConfigWarnings
 * meldet es beim Start.
 */
export function resolveLlmProvider(
  env: { PICASTAI_LLM_PROVIDER?: string; ANTHROPIC_API_KEY?: string } = process.env
): 'anthropic' | 'none' {
  const requested = env.PICASTAI_LLM_PROVIDER?.trim().toLowerCase();
  if (requested === 'anthropic' || requested === 'none') return requested;
  if (requested === 'gemini') return 'none';
  if (env.ANTHROPIC_API_KEY?.trim()) return 'anthropic';
  return 'none';
}

/** Warnung beim Start, wenn noch Gemini-Einstellungen vorhanden sind (sie wirken nicht mehr). */
export function llmConfigWarnings(
  env: { PICASTAI_LLM_PROVIDER?: string; GEMINI_API_KEY?: string; PICASTAI_GEMINI_MODEL?: string } = process.env
): string[] {
  const warnings: string[] = [];
  if (env.PICASTAI_LLM_PROVIDER?.trim().toLowerCase() === 'gemini') {
    warnings.push('Sprachmodell: PICASTAI_LLM_PROVIDER=gemini wird nicht mehr unterstützt (Gemini ist für Kinderprodukte nicht zulässig). Es greifen die festen Erzähltexte; auf anthropic umstellen.');
  }
  if (env.GEMINI_API_KEY?.trim() || env.PICASTAI_GEMINI_MODEL?.trim()) {
    warnings.push('GEMINI_API_KEY und PICASTAI_GEMINI_MODEL werden nicht mehr gelesen und können aus der Umgebung entfernt werden.');
  }
  return warnings;
}

/** Adresse eines Sprachdienstes: ohne Leerzeichen und ohne abschließenden Schrägstrich; leer = nicht gesetzt. */
export function normalizeServiceUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  return trimmed ? trimmed : null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Anbieter, die für ein Produkt für Kinder bewusst ausgeschlossen sind (Entscheidung vom 5.11.2026). */
const EXCLUDED_VOICE_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com'];

/**
 * Warnungen beim Start für Sprachdienst-Einstellungen, die Kinderstimmen gefährden:
 * unverschlüsselte Verbindung zu einem anderen Rechner und ausgeschlossene Anbieter.
 */
export function voiceConfigWarnings(config: Pick<KunibertConfig, 'sttUrl' | 'ttsUrl'>): string[] {
  const warnings: string[] = [];
  const services: Array<[string, string | null]> = [
    ['Spracherkennung', config.sttUrl],
    ['Sprachausgabe', config.ttsUrl],
  ];
  for (const [name, url] of services) {
    if (!url) continue;
    const host = hostnameOf(url);
    if (!host) {
      warnings.push(`${name}: Die Adresse ist keine gültige URL und wird nicht funktionieren.`);
      continue;
    }
    if (url.toLowerCase().startsWith('http://') && !LOOPBACK_HOSTS.has(host)) {
      warnings.push(`${name}: ${host} wird unverschlüsselt (http) angesprochen. Außerhalb des eigenen Rechners nur https verwenden.`);
    }
    if (EXCLUDED_VOICE_HOSTS.some((excluded) => host === excluded || host.endsWith(`.${excluded}`))) {
      warnings.push(`${name}: ${host} ist für Kinderprodukte ausgeschlossen (Anbieterbedingungen bzw. Entscheidung vom 5.11.2026).`);
    }
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

  return {
    port: parseNum(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    adminToken: process.env.PICASTAI_ADMIN_TOKEN?.trim() || null,
    publicBaseUrl: normalizePublicBaseUrl(process.env.PICASTAI_PUBLIC_BASE_URL),
    trustProxy: parseTrustProxy(process.env.PICASTAI_TRUST_PROXY),

    llmProvider: resolveLlmProvider(),
    llmTimeoutMs: Math.min(120_000, Math.max(3_000, parseNum(process.env.PICASTAI_LLM_TIMEOUT_MS, 30_000))),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicModel: process.env.PICASTAI_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
    sttUrl: normalizeServiceUrl(process.env.PICASTAI_STT_URL),
    sttApiKey: process.env.PICASTAI_STT_API_KEY?.trim() || null,
    sttModel: process.env.PICASTAI_STT_MODEL?.trim() || '',
    sttPrompt: process.env.PICASTAI_STT_PROMPT?.trim() || '',
    ttsUrl: normalizeServiceUrl(process.env.PICASTAI_TTS_URL),
    ttsApiKey: process.env.PICASTAI_TTS_API_KEY?.trim() || null,
    ttsModel: process.env.PICASTAI_TTS_MODEL?.trim() || '',
    ttsVoice: process.env.PICASTAI_TTS_VOICE?.trim() || '',
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
    hasAnthropicKey: Boolean(config.anthropicApiKey),
    llmProvider: config.llmProvider,
    llmModel: config.llmProvider === 'anthropic' ? config.anthropicModel : null,
    // Nur der Rechnername, nie Pfad, Zugangsdaten oder Schlüssel.
    sttHost: config.sttUrl ? hostnameOf(config.sttUrl) : null,
    ttsHost: config.ttsUrl ? hostnameOf(config.ttsUrl) : null,
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
