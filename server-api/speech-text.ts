// Anbieterunabhängige Hilfen für die Sprachausgabe: Text in Sätze und Stücke teilen und Pausen
// bemessen. Reine Funktionen ohne Netzwerk. Genutzt von der Sprachausgabe über Google (google-speech.ts)
// und über Pocket TTS (pocket-speech.ts).

/** Steuerzeichen außer Tab, Zeilenumbruch und Wagenrücklauf. */
export const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/** Trennt an Satzenden (. ! ? …), wenn danach Leerraum folgt; "?“, rief er." bleibt zusammen. */
export const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/;

/** Standardgröße der Stücke beim Teilen langer Texte (Bytes in UTF-8). */
export const DEFAULT_SPEECH_CHUNK_BYTES = 4000;

export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Pausen im Verhältnis zur Satzpause. Gleich lange Pausen nach jedem Satz klingen abgehackt:
 * nach sehr kurzen Sätzen ("Wer ist da?") ist die Pause kürzer, nach langen Sätzen länger,
 * bei Absätzen am längsten. Reine Annahme, im Hörtest noch nicht gegengeprüft: die Länge der
 * Grundpause lässt sich je Anbieter über PICASTAI_*_PAUSE_MS einstellen.
 */
const PARAGRAPH_PAUSE_FACTOR = 1.8;
const SHORT_SENTENCE_PAUSE_FACTOR = 0.6;
const LONG_SENTENCE_PAUSE_FACTOR = 1.2;
const SHORT_SENTENCE_MAX_WORDS = 3;
const LONG_SENTENCE_MIN_WORDS = 15;

/** Pause in ganzen Millisekunden von 0 (aus) bis 2000. */
export function isValidPauseMs(value: string): boolean {
  return /^\d{1,4}$/.test(value) && Number(value) <= 2000;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Pause nach einem Satz in Millisekunden: kürzer nach sehr kurzen, länger nach langen Sätzen. */
export function sentencePauseMs(sentence: string, basePauseMs: number): number {
  const words = wordCount(sentence);
  const factor = words <= SHORT_SENTENCE_MAX_WORDS
    ? SHORT_SENTENCE_PAUSE_FACTOR
    : words >= LONG_SENTENCE_MIN_WORDS
      ? LONG_SENTENCE_PAUSE_FACTOR
      : 1;
  return Math.round(basePauseMs * factor);
}

/** Pause zwischen zwei Absätzen in Millisekunden. */
export function paragraphPauseMs(basePauseMs: number): number {
  return Math.round(basePauseMs * PARAGRAPH_PAUSE_FACTOR);
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
 * Teilt einen Text in Stücke von höchstens `maxBytes` Bytes (UTF-8). Geteilt wird bevorzugt nach
 * Absätzen, dann nach Sätzen, ein zu langer Satz an Wortgrenzen und ein zu langes Wort
 * zeichenweise. Ein Text, der in ein Stück passt, bleibt unverändert (außer Steuerzeichen und
 * Rand-Leerraum). Leerer Text ergibt eine leere Liste.
 */
export function splitSpeechText(text: string, maxBytes: number = DEFAULT_SPEECH_CHUNK_BYTES): string[] {
  const clean = text.replace(CONTROL_CHARACTERS, ' ').trim();
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

/** Ein Stück Text für eine einzelne Anfrage und die Stille, die danach folgt (0 nach dem letzten). */
export interface SpeechSegment {
  text: string;
  pauseAfterMs: number;
}

/** Sätze mit höchstens so vielen Wörtern werden mit dem nächsten (oder, am Ende, dem vorigen) zusammen gesprochen. */
const MIN_WORDS_PER_SEGMENT = 3;

/**
 * Zerlegt einen Text für Anbieter, die Pausen nicht selbst setzen: Absätze, darin Sätze, jeder Satz
 * ein Stück; danach folgt die Pause nach Satzlänge (kürzer nach kurzen, länger nach langen Sätzen)
 * bzw. die längere Absatzpause. Sehr kurze Sätze ("Still.") werden mit dem Nachbarn zusammengefasst, weil
 * einzelne Wörter als eigene Anfrage unnatürlich klingen und die Pause dort ohnehin kurz wäre.
 * Ein Satz über `maxBytes` wird an Wortgrenzen geteilt (ohne Pause dazwischen). Mit `pauseMs` 0 gibt es
 * keine Pausen. Leerer Text ergibt eine leere Liste.
 */
export function planSpeechSegments(text: string, pauseMs: number, maxBytes: number = 800): SpeechSegment[] {
  const paragraphs = text
    .replace(CONTROL_CHARACTERS, ' ')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const segments: SpeechSegment[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    // Kurze Sätze mit dem Nachbarn verbinden.
    const merged: string[] = [];
    for (const sentence of paragraph.split(SENTENCE_BOUNDARY).filter(Boolean)) {
      const previous = merged[merged.length - 1];
      if (previous !== undefined && wordCount(previous) <= MIN_WORDS_PER_SEGMENT) {
        merged[merged.length - 1] = `${previous} ${sentence}`;
      } else {
        merged.push(sentence);
      }
    }
    // Ein kurzer letzter Satz geht zum vorigen.
    if (merged.length > 1 && wordCount(merged[merged.length - 1]) <= MIN_WORDS_PER_SEGMENT) {
      const last = merged.pop() as string;
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${last}`;
    }

    merged.forEach((sentence, index) => {
      const parts = splitSpeechText(sentence, maxBytes);
      parts.forEach((part, partIndex) => {
        const lastPart = partIndex === parts.length - 1;
        const lastInParagraph = index === merged.length - 1;
        let pauseAfterMs = 0;
        if (lastPart) {
          if (!lastInParagraph) pauseAfterMs = sentencePauseMs(sentence, pauseMs);
          else if (paragraphIndex < paragraphs.length - 1) pauseAfterMs = paragraphPauseMs(pauseMs);
        }
        segments.push({ text: part, pauseAfterMs });
      });
    });
  });
  return segments;
}
