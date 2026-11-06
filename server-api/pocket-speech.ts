// Hilfen für die Sprachausgabe über Pocket TTS (Kyutai, läuft auf dem eigenen Server). Reine Funktionen
// ohne Netzwerk, damit Konfiguration und Tests sie ohne den Rest der Sprachkette nutzen können.

import { isValidPauseMs } from './speech-text.js';

/**
 * Eingebaute deutsche Stimme von Pocket TTS. Im Hörtest vom 6.11.2026 gefiel sie ("klingt echt gut,
 * bisschen zu schnell"). Herkunft und Lizenz der Stimme sind bei Kyutai nicht dokumentiert: vor dem
 * Kinderbetrieb klären (docs/LLM-Anbieter.md).
 */
export const DEFAULT_POCKET_VOICE = 'juergen';

/** Tempo als Faktor: 1 = unverändert, 0,9 = zehn Prozent langsamer (Tonhöhe bleibt gleich). */
export const DEFAULT_POCKET_TEMPO = 0.9;

/** Grundpause nach einem Satz in Millisekunden; 0 schaltet die Pausen aus. */
export const DEFAULT_POCKET_PAUSE_MS = 500;

/** Pocket TTS hat kein Tempo-Feld und setzt keine Pausen: beides macht der Server selbst. */
export const MIN_POCKET_TEMPO = 0.7;
export const MAX_POCKET_TEMPO = 1.3;

/** Obergrenze für einen einzelnen Satz in einer Anfrage (Bytes); längere Sätze werden an Wortgrenzen geteilt. */
export const POCKET_MAX_SEGMENT_BYTES = 800;

/**
 * Stimme für `voice_url`: ein eingebauter Name (`juergen`), eine `hf://`-Adresse oder eine
 * `https://`-Adresse auf eine eigene Stimmprobe. Unverschlüsseltes `http://` ist bewusst nicht erlaubt.
 */
export function isValidPocketVoice(voice: string): boolean {
  if (/^[a-z][a-z0-9_]{0,39}$/.test(voice)) return true;
  return /^(hf|https):\/\/[^\s\u0000-\u001F"'<>\\]{1,300}$/.test(voice);
}

/** Tempo-Faktor von 0,7 bis 1,3 mit höchstens zwei Nachkommastellen. */
export function isValidTempo(value: string): boolean {
  if (!/^\d(\.\d{1,2})?$/.test(value)) return false;
  const tempo = Number(value);
  return tempo >= MIN_POCKET_TEMPO && tempo <= MAX_POCKET_TEMPO;
}

/** Adresse des Pocket-Servers (`pocket-tts serve`): http oder https, ohne Pfad, Zugangsdaten und Suchteil. */
export function isValidPocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !url.search && !url.hash && (url.pathname === '/' || url.pathname === '');
  } catch {
    return false;
  }
}

/** Typografische Apostrophe sind für das Modell eine bekannte Stolperstelle (Kyutai, Issue 118): glätten. */
export function preparePocketText(text: string): string {
  return text.replace(/[‘’]/g, "'");
}

export interface PocketTtsFields {
  pocketTtsUrl: string | null;
  pocketTtsVoice: string;
  pocketTtsTempo: string;
  pocketTtsPauseMs: string;
}

export interface PocketTtsSettings {
  /** Basisadresse ohne abschließenden Schrägstrich, z. B. http://127.0.0.1:8003. */
  url: string;
  voice: string;
  tempo: number;
  pauseMs: number;
}

/**
 * Einstellungen für die Sprachausgabe oder null, wenn Adresse oder Stimme fehlen bzw. ungültig sind
 * (dann bleibt die Sprachausgabe aus). Ungültiges Tempo und ungültige Pause werden durch die
 * Standardwerte ersetzt; der Start warnt davor.
 */
export function usablePocketSettings(fields: PocketTtsFields): PocketTtsSettings | null {
  if (!fields.pocketTtsUrl || !isValidPocketUrl(fields.pocketTtsUrl) || !isValidPocketVoice(fields.pocketTtsVoice)) return null;
  return {
    url: fields.pocketTtsUrl.replace(/\/+$/, ''),
    voice: fields.pocketTtsVoice,
    tempo: isValidTempo(fields.pocketTtsTempo) ? Number(fields.pocketTtsTempo) : DEFAULT_POCKET_TEMPO,
    pauseMs: isValidPauseMs(fields.pocketTtsPauseMs) ? Number(fields.pocketTtsPauseMs) : DEFAULT_POCKET_PAUSE_MS,
  };
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

/** Stille als 16-Bit-PCM (Mono) in der angegebenen Länge. */
export function silencePcm16(sampleRate: number, durationMs: number): Buffer {
  return Buffer.alloc(Math.round((sampleRate * durationMs) / 1000) * 2);
}

/**
 * Verlängert oder verkürzt Sprache, ohne die Tonhöhe zu ändern (WSOLA: überlappende Fenster, deren Lage
 * so gewählt wird, dass die Schwingung nahtlos weiterläuft). `tempo` 0,9 macht die Aufnahme etwa 11 %
 * länger, 1 lässt sie unverändert. Aufnahmen unter 64 ms bleiben unverändert.
 */
export function timeStretchPcm16(input: Int16Array, tempo: number, sampleRate: number): Int16Array {
  if (!(tempo > 0) || !Number.isFinite(tempo)) throw new RangeError('tempo muss eine positive Zahl sein');
  const frame = 2 * Math.max(8, Math.round((sampleRate * 0.032) / 2)); // 32 ms, gerade
  const hop = frame / 2;
  const count = input.length;
  if (Math.abs(tempo - 1) < 0.005 || count < frame * 2) return input.slice();

  const tolerance = Math.max(4, Math.round(sampleRate * 0.008)); // Suchbereich ±8 ms
  const padded = new Float32Array(count + frame * 2 + tolerance * 2);
  for (let index = 0; index < count; index++) padded[index] = input[index];

  // Periodisches Hann-Fenster: bei halber Überlappung summieren sich benachbarte Fenster zu 1.
  const window = new Float32Array(frame);
  for (let index = 0; index < frame; index++) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / frame);

  const outLength = Math.max(1, Math.round(count / tempo));
  const out = new Float32Array(outLength + frame * 2);
  // Erstes Fenster: die erste Hälfte unverändert (kein Einblenden des Anfangs).
  for (let index = 0; index < frame; index++) out[index] = index < hop ? padded[index] : window[index] * padded[index];

  let previous = 0;
  for (let k = 1; k * hop < outLength; k++) {
    const outStart = k * hop;
    const center = Math.round(outStart * tempo);
    const low = Math.max(0, center - tolerance);
    const high = center + tolerance;
    // Die Fortsetzung des vorigen Stücks ist die Vorlage; gesucht wird die Stelle, die ihr am ähnlichsten ist.
    const reference = previous + hop;
    let best = Math.min(Math.max(center, low), high);
    let bestScore = -Infinity;
    const evaluate = (offset: number): void => {
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
    };
    evaluate(Math.min(Math.max(center, low), high));
    for (let offset = low; offset <= high; offset++) evaluate(offset);
    for (let index = 0; index < frame; index++) out[outStart + index] += window[index] * padded[best + index];
    previous = best;
  }

  const result = new Int16Array(outLength);
  for (let index = 0; index < outLength; index++) {
    result[index] = Math.max(-32768, Math.min(32767, Math.round(out[index])));
  }
  return result;
}
