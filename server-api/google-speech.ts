// Hilfen für die Sprachausgabe über Google Cloud Text-to-Speech (REST, Chirp 3 HD). Reine
// Funktionen ohne Netzwerk, damit Konfiguration und Tests sie ohne den Rest der Sprachkette nutzen können.

import {
  CONTROL_CHARACTERS,
  SENTENCE_BOUNDARY,
  byteLength,
  isValidPauseMs,
  paragraphPauseMs,
  sentencePauseMs,
  splitSpeechText,
} from './speech-text.js';

// Die Text-Hilfen sind anbieterunabhängig (auch die Sprachausgabe über Pocket TTS nutzt sie) und stehen
// in speech-text.ts; hier bleiben sie unter dem alten Namen erreichbar.
export { isValidPauseMs, sentencePauseMs, splitSpeechText };

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

/**
 * SSML für Google: ganzer Text in `prosody` (Tonlage in Halbtönen, Tempo in Prozent), nach jedem
 * Satz eine Pause (je nach Satzlänge), bei Zeilenumbrüchen eine längere. Der Text wird maskiert;
 * Eingaben mit spitzen Klammern können so keine eigenen Marken einschleusen.
 */
export function buildGoogleSsml(text: string, style: GoogleVoiceStyle): string {
  const pause = (ms: number): string => (style.pauseMs > 0 ? `<break time="${ms}ms"/>` : ' ');
  const body = text
    .replace(CONTROL_CHARACTERS, ' ')
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
    .join(pause(paragraphPauseMs(style.pauseMs)));
  const pitch = `${style.pitchSemitones >= 0 ? '+' : ''}${style.pitchSemitones}st`;
  const rate = `${Math.round(style.speakingRate * 100)}%`;
  return `<speak><prosody pitch="${pitch}" rate="${rate}">${body}</prosody></speak>`;
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
