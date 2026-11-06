// Zentrale Konfiguration für alle Kunibert-Umgebungsvariablen
import {
  DEFAULT_GOOGLE_VOICE,
  GOOGLE_TTS_HOST,
  isValidGoogleApiKey,
  isValidGoogleVoiceName,
  isValidPauseMs,
  isValidPitch,
  isValidSpeakingRate,
} from './google-speech.js';
import {
  DEFAULT_POCKET_VOICE,
  isValidPocketUrl,
  isValidPocketVoice,
  isValidTempo,
} from './pocket-speech.js';
import { normalizePublicBaseUrl, parseTrustProxy, type TrustProxySetting } from './http-utils.js';

export type TtsProviderName = 'openai-compatible' | 'google' | 'pocket';

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
  /**
   * Anbieter der Sprachausgabe: 'openai-compatible' (ttsUrl/ttsModel/ttsVoice, Standard),
   * 'google' (Google Cloud Text-to-Speech, Chirp 3 HD, EU-Endpunkt) oder 'pocket' (Pocket TTS auf dem
   * eigenen Server, pocketTtsUrl). Die Spracherkennung bleibt
   * davon unberührt und geht immer an den Dienst unter sttUrl: die Kinderstimme verlässt den
   * eigenen Server nicht.
   */
  ttsProvider: TtsProviderName;
  googleTtsKey: string | null;
  /** Google: Stimmenname, Standard de-DE-Chirp3-HD-Algieba. */
  googleTtsVoice: string;
  /** Google: Tempo 0,25 bis 2,0 (PICASTAI_GOOGLE_TTS_RATE); leer = Standard 0,9. */
  googleTtsRate: string;
  /** Google: Tonlage in Halbtönen -6 bis +6 (PICASTAI_GOOGLE_TTS_PITCH); leer = Standard -2, 0 = unverändert. */
  googleTtsPitch: string;
  /** Google: Pause nach jedem Satz in ms, 0 bis 2000 (PICASTAI_GOOGLE_TTS_PAUSE_MS); leer = Standard 500, 0 = keine. */
  googleTtsPauseMs: string;
  /** Pocket TTS: Adresse des Servers (`pocket-tts serve`), ohne Pfad (PICASTAI_POCKET_TTS_URL); null = aus. */
  pocketTtsUrl: string | null;
  /** Pocket TTS: eingebaute Stimme oder hf://-/https://-Adresse, Standard juergen. */
  pocketTtsVoice: string;
  /** Pocket TTS: Tempo-Faktor 0,7 bis 1,3 (PICASTAI_POCKET_TTS_TEMPO); leer = Standard 0,9. */
  pocketTtsTempo: string;
  /** Pocket TTS: Grundpause nach einem Satz in ms, 0 bis 2000 (PICASTAI_POCKET_TTS_PAUSE_MS); leer = Standard 500, 0 = keine. */
  pocketTtsPauseMs: string;
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

/** Anbieter der Sprachausgabe: nur ein ausdrückliches "google" oder "pocket" wählt diesen, sonst der OpenAI-kompatible Dienst. */
export function resolveTtsProvider(env: { PICASTAI_TTS_PROVIDER?: string } = process.env): TtsProviderName {
  const requested = env.PICASTAI_TTS_PROVIDER?.trim().toLowerCase();
  return requested === 'google' || requested === 'pocket' ? requested : 'openai-compatible';
}

/** Warnung beim Start bei einem unbekannten Wert für PICASTAI_TTS_PROVIDER (er würde sonst still ignoriert). */
export function ttsProviderWarnings(env: { PICASTAI_TTS_PROVIDER?: string } = process.env): string[] {
  const requested = env.PICASTAI_TTS_PROVIDER?.trim().toLowerCase();
  if (requested && requested !== 'google' && requested !== 'pocket' && requested !== 'openai-compatible') {
    return [`Sprachausgabe: PICASTAI_TTS_PROVIDER=${requested} ist unbekannt (erlaubt: openai-compatible, google, pocket). Es gilt openai-compatible.`];
  }
  return [];
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
export function voiceConfigWarnings(
  config: Pick<KunibertConfig, 'sttUrl' | 'ttsUrl'> &
    Partial<Pick<KunibertConfig, 'ttsProvider' | 'googleTtsKey' | 'googleTtsVoice' | 'googleTtsRate' | 'googleTtsPitch' | 'googleTtsPauseMs' | 'pocketTtsUrl' | 'pocketTtsVoice' | 'pocketTtsTempo' | 'pocketTtsPauseMs'>>
): string[] {
  const warnings: string[] = [];
  const google = config.ttsProvider === 'google';
  const pocket = config.ttsProvider === 'pocket';
  const services: Array<[string, string | null]> = [
    ['Spracherkennung', config.sttUrl],
    // Bei Google und Pocket ist die Adresse der OpenAI-kompatiblen Sprachausgabe nicht in Gebrauch.
    ['Sprachausgabe', google || pocket ? null : config.ttsUrl],
    ['Sprachausgabe (Pocket)', pocket ? config.pocketTtsUrl ?? null : null],
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
  if (google) warnings.push(...googleConfigWarnings(config));
  if (pocket) warnings.push(...pocketConfigWarnings(config));
  return warnings;
}

function pocketConfigWarnings(
  config: Partial<Pick<KunibertConfig, 'pocketTtsUrl' | 'pocketTtsVoice' | 'pocketTtsTempo' | 'pocketTtsPauseMs'>>
): string[] {
  const warnings: string[] = [];
  const voice = config.pocketTtsVoice ?? '';
  if (!config.pocketTtsUrl || !voice) {
    warnings.push('Sprachausgabe (Pocket): Adresse und Stimme (PICASTAI_POCKET_TTS_URL, _VOICE) müssen gesetzt sein, sonst bleibt die Sprachausgabe aus.');
    return warnings;
  }
  if (!isValidPocketUrl(config.pocketTtsUrl)) {
    warnings.push('Sprachausgabe (Pocket): PICASTAI_POCKET_TTS_URL ist keine gültige Adresse (erwartet z. B. http://127.0.0.1:8003, ohne Pfad und Zugangsdaten). Die Sprachausgabe bleibt aus.');
  }
  if (!isValidPocketVoice(voice)) {
    warnings.push('Sprachausgabe (Pocket): Die Stimme ist ungültig (erwartet z. B. juergen, hf://… oder https://…). Die Sprachausgabe bleibt aus.');
  }
  if (config.pocketTtsTempo && !isValidTempo(config.pocketTtsTempo)) {
    warnings.push('Sprachausgabe (Pocket): PICASTAI_POCKET_TTS_TEMPO ist ungültig (erlaubt 0.7 bis 1.3, z. B. 0.9) und wird ignoriert; es gilt 0.9.');
  }
  if (config.pocketTtsPauseMs && !isValidPauseMs(config.pocketTtsPauseMs)) {
    warnings.push('Sprachausgabe (Pocket): PICASTAI_POCKET_TTS_PAUSE_MS ist ungültig (erlaubt 0 bis 2000, z. B. 500) und wird ignoriert; es gilt 500.');
  }
  return warnings;
}

function googleConfigWarnings(
  config: Partial<Pick<KunibertConfig, 'googleTtsKey' | 'googleTtsVoice' | 'googleTtsRate' | 'googleTtsPitch' | 'googleTtsPauseMs'>>
): string[] {
  const warnings: string[] = [];
  const voice = config.googleTtsVoice ?? '';
  if (!config.googleTtsKey || !voice) {
    warnings.push('Sprachausgabe (Google): Schlüssel und Stimme (PICASTAI_GOOGLE_TTS_KEY, _VOICE) müssen gesetzt sein, sonst bleibt die Sprachausgabe aus.');
    return warnings;
  }
  if (!isValidGoogleApiKey(config.googleTtsKey)) {
    warnings.push('Sprachausgabe (Google): PICASTAI_GOOGLE_TTS_KEY enthält ungültige Zeichen (Leerzeichen, Zeilenumbruch oder Anführungszeichen mit eingefügt?). Die Sprachausgabe bleibt aus.');
  }
  if (!isValidGoogleVoiceName(voice)) {
    warnings.push('Sprachausgabe (Google): Der Stimmenname ist ungültig (erwartet z. B. de-DE-Chirp3-HD-Algieba). Die Sprachausgabe bleibt aus.');
  }
  if (config.googleTtsRate && !isValidSpeakingRate(config.googleTtsRate)) {
    warnings.push('Sprachausgabe (Google): PICASTAI_GOOGLE_TTS_RATE ist ungültig (erlaubt 0.25 bis 2.0, z. B. 0.9) und wird ignoriert; es gilt 0.9.');
  }
  if (config.googleTtsPitch && !isValidPitch(config.googleTtsPitch)) {
    warnings.push('Sprachausgabe (Google): PICASTAI_GOOGLE_TTS_PITCH ist ungültig (erlaubt -6 bis 6 Halbtöne, z. B. -2) und wird ignoriert; es gilt -2.');
  }
  if (config.googleTtsPauseMs && !isValidPauseMs(config.googleTtsPauseMs)) {
    warnings.push('Sprachausgabe (Google): PICASTAI_GOOGLE_TTS_PAUSE_MS ist ungültig (erlaubt 0 bis 2000, z. B. 500) und wird ignoriert; es gilt 500.');
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
    ttsProvider: resolveTtsProvider(),
    googleTtsKey: process.env.PICASTAI_GOOGLE_TTS_KEY?.trim() || null,
    googleTtsVoice: process.env.PICASTAI_GOOGLE_TTS_VOICE?.trim() || DEFAULT_GOOGLE_VOICE,
    googleTtsRate: process.env.PICASTAI_GOOGLE_TTS_RATE?.trim() || '',
    googleTtsPitch: process.env.PICASTAI_GOOGLE_TTS_PITCH?.trim() || '',
    googleTtsPauseMs: process.env.PICASTAI_GOOGLE_TTS_PAUSE_MS?.trim() || '',
    pocketTtsUrl: normalizeServiceUrl(process.env.PICASTAI_POCKET_TTS_URL),
    pocketTtsVoice: process.env.PICASTAI_POCKET_TTS_VOICE?.trim() || DEFAULT_POCKET_VOICE,
    pocketTtsTempo: process.env.PICASTAI_POCKET_TTS_TEMPO?.trim() || '',
    pocketTtsPauseMs: process.env.PICASTAI_POCKET_TTS_PAUSE_MS?.trim() || '',
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
    ttsProvider: config.ttsProvider,
    ttsHost: config.ttsProvider === 'google'
      ? GOOGLE_TTS_HOST
      : config.ttsProvider === 'pocket'
        ? (config.pocketTtsUrl ? hostnameOf(config.pocketTtsUrl) : null)
        : (config.ttsUrl ? hostnameOf(config.ttsUrl) : null),
    sttModel: config.sttModel,
    ttsModel: config.ttsProvider === 'openai-compatible' ? config.ttsModel : '',
    ttsVoice: config.ttsProvider === 'google'
      ? config.googleTtsVoice
      : config.ttsProvider === 'pocket'
        ? config.pocketTtsVoice
        : config.ttsVoice,
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
