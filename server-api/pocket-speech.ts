// Sprachausgabe über Pocket TTS (Kyutai, CC BY 4.0), läuft als eigener Dienst (`pocket-tts serve`)
// auf demselben Rechner. Diese Datei enthält nur reine Funktionen ohne Netzwerk: Einstellungen,
// Sätze, Pausen und Zeitdehnung. Der Netzwerkteil steht in voice.ts (PocketTextToSpeech).
// Übernommen und angepasst aus dem geparkten PR #16 (12.11.2026 neu auf main aufgesetzt).

/**
 * Stimme: Stuart Bell, eingebaute Pocket-Stimme aus Kyutais Ordner `voice-zero` (CC0, frei auch
 * für Produkte; https://huggingface.co/kyutai/tts-voices). Entscheidung des Betreibers vom
 * 13.11.2026, 16:46, nach dem Hörtest. Der Sprecher ist englischsprachig; das deutsche Modell
 * spricht mit seiner Stimmfarbe Deutsch.
 */
export const DEFAULT_POCKET_VOICE = 'stuart_bell';

/** Tempo als Faktor: 1 = unverändert, 0,92 = acht Prozent langsamer (Tonhöhe bleibt gleich). Wie im Hörtest. */
export const DEFAULT_POCKET_TEMPO = 0.92;

/** Grundpause nach einem Satz in Millisekunden; 0 schaltet die Pausen aus. Wie im Hörtest. */
export const DEFAULT_POCKET_PAUSE_MS = 450;

export const MIN_POCKET_TEMPO = 0.7;
export const MAX_POCKET_TEMPO = 1.3;

/** Längere Sätze werden an Wortgrenzen geteilt (Pocket wird bei sehr langen Eingaben unruhig). */
export const POCKET_MAX_SENTENCE_CHARS = 400;

/** Eingebauter Name (`stuart_bell`), `hf://`- oder `https://`-Adresse. Kein unverschlüsseltes http. */
export function isValidPocketVoice(voice: string): boolean {
  if (/^[a-z][a-z0-9_]{0,39}$/.test(voice)) return true;
  return /^(hf|https):\/\/[^\s\u0000-\u001F"'<>\\]{1,300}$/.test(voice);
}

/** Tempo von 0,7 bis 1,3 mit höchstens zwei Nachkommastellen. */
export function isValidTempo(value: string): boolean {
  if (!/^\d(\.\d{1,2})?$/.test(value)) return false;
  const tempo = Number(value);
  return tempo >= MIN_POCKET_TEMPO && tempo <= MAX_POCKET_TEMPO;
}

/** Pause in ganzen Millisekunden von 0 bis 2000. */
export function isValidPauseMs(value: string): boolean {
  return /^\d{1,4}$/.test(value) && Number(value) <= 2000;
}

/** Adresse von `pocket-tts serve`: http oder https, ohne Pfad, Zugangsdaten und Suchteil. */
export function isValidPocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      && !url.search && !url.hash && (url.pathname === '/' || url.pathname === '');
  } catch {
    return false;
  }
}

export interface PocketTtsFields {
  pocketTtsUrl: string | null;
  pocketTtsVoice: string;
  pocketTtsTempo: string;
  pocketTtsPauseMs: string;
}

export interface PocketTtsSettings {
  /** Basisadresse ohne abschließenden Schrägstrich, z. B. http://127.0.0.1:8001. */
  url: string;
  voice: string;
  tempo: number;
  pauseMs: number;
}

/** Einstellungen oder null (dann bleibt die Sprachausgabe aus). Ungültiges Tempo oder Pause: Standardwert. */
export function usablePocketSettings(fields: PocketTtsFields): PocketTtsSettings | null {
  if (!fields.pocketTtsUrl || !isValidPocketUrl(fields.pocketTtsUrl) || !isValidPocketVoice(fields.pocketTtsVoice)) return null;
  return {
    url: fields.pocketTtsUrl.replace(/\/+$/, ''),
    voice: fields.pocketTtsVoice,
    tempo: fields.pocketTtsTempo && isValidTempo(fields.pocketTtsTempo) ? Number(fields.pocketTtsTempo) : DEFAULT_POCKET_TEMPO,
    pauseMs: fields.pocketTtsPauseMs && isValidPauseMs(fields.pocketTtsPauseMs) ? Number(fields.pocketTtsPauseMs) : DEFAULT_POCKET_PAUSE_MS,
  };
}

/** Typografische Apostrophe und Steuerzeichen glätten (bekannte Stolperstelle des Modells). */
export function preparePocketText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
}

/**
 * Teilt Text in Sätze. Ein Satzende ist . ! ? oder …, gefolgt von Leerraum; schließende
 * Anführungszeichen bleiben beim Satz („Hallo!“, rief er. bleibt bis „er.“ beisammen, wenn kein
 * Großbuchstabe folgt). Absätze (Leerzeile) werden gemerkt, damit dort eine längere Pause kommt.
 * Zu lange Sätze werden an Wortgrenzen geteilt.
 */
export function splitSentences(text: string): { sentence: string; paragraphEnd: boolean }[] {
  const result: { sentence: string; paragraphEnd: boolean }[] = [];
  const paragraphs = preparePocketText(text).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?…][“”"»«)]?)\s+(?=[„“"»«(]?[A-ZÄÖÜ0-9])/).map((s) => s.trim()).filter(Boolean);
    const pieces: string[] = [];
    for (const sentence of sentences) pieces.push(...splitLong(sentence, POCKET_MAX_SENTENCE_CHARS));
    pieces.forEach((sentence, index) => result.push({ sentence, paragraphEnd: index === pieces.length - 1 }));
  }
  if (result.length) result[result.length - 1].paragraphEnd = false;
  return result;
}

function splitLong(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const parts: string[] = [];
  let current = '';
  // Bevorzugt nach Komma oder Semikolon teilen, sonst an Wortgrenzen.
  for (const word of sentence.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      parts.push(current);
      current = word;
    } else {
      current = next;
      if (current.length > maxChars * 0.6 && /[,;:]$/.test(word)) {
        parts.push(current);
        current = '';
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Pause nach einem Satz: kürzer nach sehr kurzen Sätzen, länger nach langen und am Absatzende. */
export function sentencePauseMs(sentence: string, basePauseMs: number, paragraphEnd = false): number {
  if (paragraphEnd) return Math.round(basePauseMs * 1.8);
  const words = sentence.split(/\s+/).filter(Boolean).length;
  const factor = words <= 3 ? 0.6 : words >= 15 ? 1.2 : 1;
  return Math.round(basePauseMs * factor);
}

export function pcm16ToSamples(pcm: Buffer): Int16Array {
  const samples = new Int16Array(Math.floor(pcm.length / 2));
  for (let index = 0; index < samples.length; index++) samples[index] = pcm.readInt16LE(index * 2);
  return samples;
}

export function samplesToPcm16(samples: Int16Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index++) pcm.writeInt16LE(samples[index], index * 2);
  return pcm;
}

/** Stille als 16-Bit-PCM (Mono). */
export function silencePcm16(sampleRate: number, durationMs: number): Buffer {
  return Buffer.alloc(Math.round((sampleRate * durationMs) / 1000) * 2);
}

/**
 * Verlängert oder verkürzt Sprache, ohne die Tonhöhe zu ändern (WSOLA: überlappende Fenster, deren
 * Lage so gewählt wird, dass die Schwingung nahtlos weiterläuft). tempo 0,92 macht die Aufnahme etwa
 * 9 % länger, 1 lässt sie unverändert. Aufnahmen unter 64 ms bleiben unverändert. Aus PR #16.
 */
export function timeStretchPcm16(input: Int16Array, tempo: number, sampleRate: number): Int16Array {
  if (!(tempo > 0) || !Number.isFinite(tempo)) throw new RangeError('tempo muss eine positive Zahl sein');
  const frame = 2 * Math.max(8, Math.round((sampleRate * 0.032) / 2));
  const hop = frame / 2;
  const count = input.length;
  if (Math.abs(tempo - 1) < 0.005 || count < frame * 2) return input.slice();

  const tolerance = Math.max(4, Math.round(sampleRate * 0.008));
  const padded = new Float32Array(count + frame * 2 + tolerance * 2);
  for (let index = 0; index < count; index++) padded[index] = input[index];

  const window = new Float32Array(frame);
  for (let index = 0; index < frame; index++) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / frame);

  const outLength = Math.max(1, Math.round(count / tempo));
  const out = new Float32Array(outLength + frame * 2);
  for (let index = 0; index < frame; index++) out[index] = index < hop ? padded[index] : window[index] * padded[index];

  let previous = 0;
  for (let k = 1; k * hop < outLength; k++) {
    const outStart = k * hop;
    const center = Math.round(outStart * tempo);
    const low = Math.max(0, center - tolerance);
    const high = center + tolerance;
    const reference = previous + hop;
    let best = Math.min(Math.max(center, low), high);
    let bestScore = -Infinity;
    for (let offset = low; offset <= high; offset++) {
      let cross = 0;
      let energy = 0;
      for (let index = 0; index < hop; index += 2) {
        const sample = padded[offset + index];
        cross += padded[reference + index] * sample;
        energy += sample * sample;
      }
      const score = cross / Math.sqrt(energy + 1);
      if (score > bestScore) {
        bestScore = score;
        best = offset;
      }
    }
    for (let index = 0; index < frame; index++) out[outStart + index] += window[index] * padded[best + index];
    previous = best;
  }

  const result = new Int16Array(outLength);
  for (let index = 0; index < outLength; index++) result[index] = Math.max(-32768, Math.min(32767, Math.round(out[index])));
  return result;
}
