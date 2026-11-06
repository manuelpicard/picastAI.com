// Hilfen für die Sprachausgabe über Google Cloud Text-to-Speech (REST, Chirp 3 HD). Reine
// Funktionen ohne Netzwerk, damit Konfiguration und Tests sie ohne den Rest der Sprachkette nutzen können.

/**
 * Feste Adresse im EU-Mehrfachstandort ("eu"). Es gibt bewusst keine einstellbare Adresse:
 * Der Antworttext soll nur in der EU verarbeitet werden, und der Schlüssel darf nur an Google gehen.
 */
export const GOOGLE_TTS_HOST = 'eu-texttospeech.googleapis.com';
export const GOOGLE_TTS_ENDPOINT = `https://${GOOGLE_TTS_HOST}/v1/text:synthesize`;

/** Männliche, tiefe Erzählerstimme; im Hörtest vom 6.11.2026 aus Charon, Orus und Algenib gewählt. */
export const DEFAULT_GOOGLE_VOICE = 'de-DE-Chirp3-HD-Algenib';

/** Tempo wie bei der OpenAI-kompatiblen Sprachausgabe: etwas langsamer als normal. */
export const DEFAULT_GOOGLE_SPEAKING_RATE = 0.95;

/** Google erlaubt höchstens 5000 Bytes Text je Anfrage; hier mit Abstand. */
export const GOOGLE_MAX_INPUT_BYTES = 4000;

/** Stimmenname wie `de-DE-Chirp3-HD-Algenib`: Sprache-Land-Rest. Der Name landet im JSON, nicht in einer URL. */
export function isValidGoogleVoiceName(voice: string): boolean {
  return /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9_-]{1,60}$/.test(voice);
}

/** `de-DE` aus `de-DE-Chirp3-HD-Algenib`; setzt einen gültigen Stimmennamen voraus. */
export function googleLanguageCode(voice: string): string {
  return voice.split('-').slice(0, 2).join('-');
}

/** Google nimmt Tempo von 0,25 bis 2,0; hier höchstens zwei Nachkommastellen. */
export function isValidSpeakingRate(value: string): boolean {
  if (!/^\d(\.\d{1,2})?$/.test(value)) return false;
  const rate = Number(value);
  return rate >= 0.25 && rate <= 2;
}

/**
 * Ein Schlüssel kommt in einen HTTP-Kopf: nur sichtbare ASCII-Zeichen ohne Leerzeichen.
 * Das fängt auch eingefügte Anführungszeichen-Reste, Zeilenumbrüche und Leerzeichen ab.
 */
export function isValidGoogleApiKey(key: string): boolean {
  return /^[\x21-\x7E]{10,256}$/.test(key);
}

export interface GoogleSynthesizeRequest {
  input: { text: string };
  voice: { languageCode: string; name: string };
  audioConfig: { audioEncoding: 'LINEAR16'; speakingRate: number };
}

/**
 * Anfrage an `text:synthesize`. LINEAR16 kommt mit WAV-Kopf zurück; die Abtastrate (bei Chirp 3 HD
 * 24 kHz) legt Google fest, der Server rechnet danach auf die Zielrate um.
 */
export function buildGoogleRequest(text: string, voice: string, speakingRate: number): GoogleSynthesizeRequest {
  return {
    input: { text },
    voice: { languageCode: googleLanguageCode(voice), name: voice },
    audioConfig: { audioEncoding: 'LINEAR16', speakingRate },
  };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
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
 * bevorzugt nach Sätzen, ein zu langer Satz an Wortgrenzen und ein zu langes Wort zeichenweise.
 * Ein Text, der in eine Anfrage passt, bleibt unverändert (außer Steuerzeichen und Rand-Leerraum).
 * Leerer Text ergibt eine leere Liste.
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
  const append = (piece: string): boolean => {
    const candidate = current ? `${current} ${piece}` : piece;
    if (byteLength(candidate) > maxBytes) return false;
    current = candidate;
    return true;
  };

  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    if (append(sentence)) continue;
    flush();
    if (byteLength(sentence) <= maxBytes) {
      current = sentence;
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      if (append(word)) continue;
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
  flush();
  return chunks;
}

export interface GoogleTtsFields {
  googleTtsKey: string | null;
  googleTtsVoice: string;
  googleTtsRate: string;
}

export interface GoogleTtsSettings {
  key: string;
  voice: string;
  speakingRate: number;
}

/**
 * Einstellungen für die Sprachausgabe oder null, wenn Schlüssel oder Stimme fehlen bzw.
 * ungültig sind (dann bleibt die Sprachausgabe aus). Ein ungültiges Tempo wird durch den
 * Standard ersetzt; der Start warnt davor.
 */
export function usableGoogleSettings(fields: GoogleTtsFields): GoogleTtsSettings | null {
  if (!fields.googleTtsKey || !isValidGoogleApiKey(fields.googleTtsKey) || !isValidGoogleVoiceName(fields.googleTtsVoice)) {
    return null;
  }
  return {
    key: fields.googleTtsKey,
    voice: fields.googleTtsVoice,
    speakingRate: isValidSpeakingRate(fields.googleTtsRate) ? Number(fields.googleTtsRate) : DEFAULT_GOOGLE_SPEAKING_RATE,
  };
}
