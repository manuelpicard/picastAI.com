// Hilfen für die Sprachausgabe über Google Cloud Text-to-Speech (REST, Chirp 3 HD). Reine
// Funktionen ohne Netzwerk, damit Konfiguration und Tests sie ohne den Rest der Sprachkette nutzen können.

/**
 * Feste Adresse im EU-Mehrfachstandort ("eu"). Es gibt bewusst keine einstellbare Adresse:
 * Der Antworttext soll nur in der EU verarbeitet werden, und der Schlüssel darf nur an Google gehen.
 */
export const GOOGLE_TTS_HOST = 'eu-texttospeech.googleapis.com';
export const GOOGLE_TTS_ENDPOINT = `https://${GOOGLE_TTS_HOST}/v1/text:synthesize`;

/**
 * Männliche Erzählerstimme. Hörtest vom 6.11.2026 unter allen 16 männlichen Chirp-3-HD-Stimmen:
 * Algieba gefiel wegen der Stimmlage (etwas Vibrato, aber leicht zu hoch, daher die Absenkung unten),
 * Algenib hatte keinen guten Sprechrhythmus.
 */
export const DEFAULT_GOOGLE_VOICE = 'de-DE-Chirp3-HD-Algieba';

/** Tempo: im Hörtest war 0,9 (mit Pausen) die passende Erzählgeschwindigkeit. */
export const DEFAULT_GOOGLE_SPEAKING_RATE = 0.9;

/** Tonlage in Halbtönen (SSML `prosody pitch`): im Hörtest klang "2 Halbtöne tiefer" gut. */
export const DEFAULT_GOOGLE_PITCH = -2;

/** Pause nach jedem Satz in Millisekunden; bei Absätzen länger. 0 schaltet die Pausen aus. */
export const DEFAULT_GOOGLE_PAUSE_MS = 500;

/**
 * Pausen im Verhältnis zur Satzpause. Gleich lange Pausen nach jedem Satz klingen abgehackt:
 * nach sehr kurzen Sätzen ("Wer ist da?") ist die Pause kürzer, nach langen Sätzen länger,
 * bei Absätzen am längsten. Reine Annahme, im Hörtest noch nicht gegengeprüft: Länge mit
 * PICASTAI_GOOGLE_TTS_PAUSE_MS einstellen.
 */
const PARAGRAPH_PAUSE_FACTOR = 1.8;
const SHORT_SENTENCE_PAUSE_FACTOR = 0.6;
const LONG_SENTENCE_PAUSE_FACTOR = 1.2;
const SHORT_SENTENCE_MAX_WORDS = 3;
const LONG_SENTENCE_MIN_WORDS = 15;

/** Google erlaubt höchstens 5000 Bytes je Anfrage; hier mit Abstand. */
export const GOOGLE_MAX_INPUT_BYTES = 4000;
/** Obergrenze für die fertige SSML-Anfrage (Marken zählen mit). */
export const GOOGLE_MAX_SSML_BYTES = 4800;
/** Stücke für SSML werden zuerst kleiner geschnitten, weil die Pausen-Marken den Text aufblähen. */
const SSML_CHUNK_BYTES = 2500;

/** Stimmenname wie `de-DE-Chirp3-HD-Algieba`: Sprache-Land-Rest. Der Name landet im JSON, nicht in einer URL. */
export function isValidGoogleVoiceName(voice: string): boolean {
  return /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9_-]{1,60}$/.test(voice);
}

/** `de-DE` aus `de-DE-Chirp3-HD-Algieba`; setzt einen gültigen Stimmennamen voraus. */
export function googleLanguageCode(voice: string): string {
  return voice.split('-').slice(0, 2).join('-');
}

/** Google nimmt Tempo von 0,25 bis 2,0; hier höchstens zwei Nachkommastellen. */
export function isValidSpeakingRate(value: string): boolean {
  if (!/^\d(\.\d{1,2})?$/.test(value)) return false;
  const rate = Number(value);
  return rate >= 0.25 && rate <= 2;
}

/** Tonlage in Halbtönen von -6 bis +6, höchstens eine Nachkommastelle (z. B. "-2" oder "1.5"). */
export function isValidPitch(value: string): boolean {
  if (!/^[+-]?\d(\.\d)?$/.test(value)) return false;
  return Math.abs(Number(value)) <= 6;
}

/** Pause in ganzen Millisekunden von 0 (aus) bis 2000. */
export function isValidPauseMs(value: string): boolean {
  return /^\d{1,4}$/.test(value) && Number(value) <= 2000;
}

/**
 * Ein Schlüssel kommt in einen HTTP-Kopf: nur sichtbare ASCII-Zeichen ohne Leerzeichen.
 * Das fängt auch eingefügte Anführungszeichen-Reste, Zeilenumbrüche und Leerzeichen ab.
 */
export function isValidGoogleApiKey(key: string): boolean {
  return /^[\x21-\x7E]{10,256}$/.test(key);
}

/** Wie die Stimme klingen soll: Tempo, Tonlage (Halbtöne) und Pause nach Sätzen (Millisekunden). */
export interface GoogleVoiceStyle {
  speakingRate: number;
  pitchSemitones: number;
  pauseMs: number;
}

/** Tonlage oder Pausen verlangen SSML; ohne beides genügt einfacher Text mit `speakingRate`. */
export function usesSsml(style: GoogleVoiceStyle): boolean {
  return style.pitchSemitones !== 0 || style.pauseMs > 0;
}

export type GoogleInput = { text: string } | { ssml: string };

export interface GoogleSynthesizeRequest {
  input: GoogleInput;
  voice: { languageCode: string; name: string };
  audioConfig: { audioEncoding: 'LINEAR16'; speakingRate?: number };
}

/**
 * Anfrage an `text:synthesize`. LINEAR16 kommt mit WAV-Kopf zurück; die Abtastrate (bei Chirp 3 HD
 * 24 kHz) legt Google fest, der Server rechnet danach auf die Zielrate um. Bei SSML steckt das
 * Tempo im Text (`prosody rate`), `speakingRate` wird dann nicht mitgeschickt.
 */
export function buildGoogleRequest(input: GoogleInput, voice: string, speakingRate: number | null): GoogleSynthesizeRequest {
  const audioConfig: GoogleSynthesizeRequest['audioConfig'] = { audioEncoding: 'LINEAR16' };
  if (speakingRate !== null) audioConfig.speakingRate = speakingRate;
  return { input, voice: { languageCode: googleLanguageCode(voice), name: voice }, audioConfig };
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Trennt an Satzenden (. ! ? …), wenn danach Leerraum folgt; "?“, rief er." bleibt zusammen. */
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/;

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** Pause nach einem Satz in Millisekunden: kürzer nach sehr kurzen, länger nach langen Sätzen. */
export function sentencePauseMs(sentence: string, basePauseMs: number): number {
  const words = sentence.split(/\s+/).filter(Boolean).length;
  const factor = words <= SHORT_SENTENCE_MAX_WORDS
    ? SHORT_SENTENCE_PAUSE_FACTOR
    : words >= LONG_SENTENCE_MIN_WORDS
      ? LONG_SENTENCE_PAUSE_FACTOR
      : 1;
  return Math.round(basePauseMs * factor);
}

/**
 * SSML für Google: ganzer Text in `prosody` (Tonlage in Halbtönen, Tempo in Prozent), nach jedem
 * Satz eine Pause (je nach Satzlänge), bei Zeilenumbrüchen eine längere. Der Text wird maskiert;
 * Eingaben mit spitzen Klammern können so keine eigenen Marken einschleusen.
 */
export function buildGoogleSsml(text: string, style: GoogleVoiceStyle): string {
  const pause = (ms: number): string => (style.pauseMs > 0 ? `<break time="${ms}ms"/>` : ' ');
  const body = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const sentences = paragraph.split(SENTENCE_BOUNDARY);
      return sentences
        .map((sentence, index) =>
          escapeXml(sentence) + (index < sentences.length - 1 ? pause(sentencePauseMs(sentence, style.pauseMs)) : '')
        )
        .join('');
    })
    .join(pause(Math.round(style.pauseMs * PARAGRAPH_PAUSE_FACTOR)));
  const pitch = `${style.pitchSemitones >= 0 ? '+' : ''}${style.pitchSemitones}st`;
  const rate = `${Math.round(style.speakingRate * 100)}%`;
  return `<speak><prosody pitch="${pitch}" rate="${rate}">${body}</prosody></speak>`;
}

/** Teilt ein einzelnes zu langes Wort zeichenweise (nach Codepunkten, nie mitten in einem Zeichen). */
function splitByCodePoints(text: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const char of text) {
    if (current && byteLength(current + char) > maxBytes) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Teilt einen Text für Google in Stücke von höchstens `maxBytes` Bytes (UTF-8). Geteilt wird
 * bevorzugt nach Absätzen, dann nach Sätzen, ein zu langer Satz an Wortgrenzen und ein zu langes
 * Wort zeichenweise. Ein Text, der in eine Anfrage passt, bleibt unverändert (außer Steuerzeichen
 * und Rand-Leerraum). Leerer Text ergibt eine leere Liste.
 */
export function splitSpeechText(text: string, maxBytes: number = GOOGLE_MAX_INPUT_BYTES): string[] {
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  if (!clean) return [];
  if (byteLength(clean) <= maxBytes) return [clean];

  const chunks: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) chunks.push(current);
    current = '';
  };
  const append = (piece: string, joiner: string): boolean => {
    const candidate = current ? `${current}${joiner}${piece}` : piece;
    if (byteLength(candidate) > maxBytes) return false;
    current = candidate;
    return true;
  };

  for (const paragraph of clean.split(/\n+/).map((part) => part.trim()).filter(Boolean)) {
    if (append(paragraph, '\n')) continue;
    flush();
    if (byteLength(paragraph) <= maxBytes) {
      current = paragraph;
      continue;
    }
    for (const sentence of paragraph.split(SENTENCE_BOUNDARY)) {
      if (append(sentence, ' ')) continue;
      flush();
      if (byteLength(sentence) <= maxBytes) {
        current = sentence;
        continue;
      }
      for (const word of sentence.split(/\s+/)) {
        if (append(word, ' ')) continue;
        flush();
        if (byteLength(word) <= maxBytes) {
          current = word;
          continue;
        }
        for (const part of splitByCodePoints(word, maxBytes)) {
          flush();
          current = part;
        }
      }
    }
  }
  flush();
  return chunks;
}

/**
 * Zerlegt einen Text in die Eingaben für einzelne Anfragen. Ohne Tonlage und Pausen sind das
 * einfache Texte bis 4000 Bytes, sonst SSML-Stücke, die samt Marken höchstens 4800 Bytes haben
 * (zu große Stücke werden weiter halbiert).
 */
export function planGoogleInputs(text: string, style: GoogleVoiceStyle): GoogleInput[] {
  if (!usesSsml(style)) return splitSpeechText(text, GOOGLE_MAX_INPUT_BYTES).map((piece) => ({ text: piece }));
  const inputs: GoogleInput[] = [];
  const emit = (piece: string, limit: number): void => {
    const ssml = buildGoogleSsml(piece, style);
    if (byteLength(ssml) <= GOOGLE_MAX_SSML_BYTES || limit <= 64) {
      inputs.push({ ssml });
      return;
    }
    const half = Math.floor(limit / 2);
    for (const part of splitSpeechText(piece, half)) emit(part, half);
  };
  for (const piece of splitSpeechText(text, SSML_CHUNK_BYTES)) emit(piece, SSML_CHUNK_BYTES);
  return inputs;
}

export interface GoogleTtsFields {
  googleTtsKey: string | null;
  googleTtsVoice: string;
  googleTtsRate: string;
  googleTtsPitch: string;
  googleTtsPauseMs: string;
}

export interface GoogleTtsSettings extends GoogleVoiceStyle {
  key: string;
  voice: string;
}

/**
 * Einstellungen für die Sprachausgabe oder null, wenn Schlüssel oder Stimme fehlen bzw.
 * ungültig sind (dann bleibt die Sprachausgabe aus). Ungültiges Tempo, ungültige Tonlage und
 * ungültige Pause werden durch die Standardwerte ersetzt; der Start warnt davor.
 */
export function usableGoogleSettings(fields: GoogleTtsFields): GoogleTtsSettings | null {
  if (!fields.googleTtsKey || !isValidGoogleApiKey(fields.googleTtsKey) || !isValidGoogleVoiceName(fields.googleTtsVoice)) {
    return null;
  }
  return {
    key: fields.googleTtsKey,
    voice: fields.googleTtsVoice,
    speakingRate: isValidSpeakingRate(fields.googleTtsRate) ? Number(fields.googleTtsRate) : DEFAULT_GOOGLE_SPEAKING_RATE,
    pitchSemitones: isValidPitch(fields.googleTtsPitch) ? Number(fields.googleTtsPitch) : DEFAULT_GOOGLE_PITCH,
    pauseMs: isValidPauseMs(fields.googleTtsPauseMs) ? Number(fields.googleTtsPauseMs) : DEFAULT_GOOGLE_PAUSE_MS,
  };
}
