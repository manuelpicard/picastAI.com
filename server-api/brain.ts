import { createLlmProvider, type JsonSchema, type LlmProvider } from './llm.js';
import {
  ANSWER_SYSTEM,
  EPISODE_CLOSING,
  EPISODE_SEEDS,
  EPISODE_SPARKS,
  seasonOf,
  seedsForSeason,
  STORY_PAUSE_TEXT,
  BEDTIME_HINT,
  IDEA_HINT,
  NEXT_PHASE_PREVIEW,
  PHASE_HINTS,
  STORY_CLOSING,
  STORY_CLOSING_FIRST,
  STORYTELLER_SYSTEM,
  type StoryPhase,
} from './prompts.js';
import {
  ERROR_RESPONSE_DE,
  normalize,
  SAFETY_RESPONSE_DE,
  screen,
  screenOutput,
  UNCLEAR_RESPONSE_DE,
} from './safety.js';
import { generateMelodyWav, generateToneWav } from './audio.js';
import { config, type KunibertConfig } from './config.js';
import { costUsd, formatUsd, pricesFor, type LlmPrices, type LlmUsage } from './costs.js';
import { budgetTimeoutMs, MIN_LLM_MS, NO_TIMER, TTS_RESERVE_MS, type StageTimer } from './timing.js';

/** Fester Ersatztext, wenn das Sprachmodell fehlt, ausfällt oder seine Antwort abgelehnt wurde. */
export const FALLBACK_ANSWER_DE =
  'Das ist eine gute Frage. Die kann ich dir gerade leider nicht beantworten. ' +
  'Frag am besten deine Eltern oder eine Lehrerin, die wissen darüber oft ganz Erstaunliches. ' +
  'Wenn du eine Geschichte hören willst, drück die Erzähltaste.';

export interface StoryState {
  v: number;
  ep: number;
  part: number;
  target: number;
  /** Stimmung und Anlass zum Einstieg der Folge. */
  seed: string;
  /** Zusammenfassung der ganzen Folge bis einschließlich des letzten Teils. */
  summary: string;
  threads: string;
  hook: string;
  done: boolean;
  /** Plan der Folge aus Teil 1 (Ziel, Hinweis der Hexe, Lösung, Nebenfigur); hält den roten Faden. */
  plan: string;
  /** Wunsch des Kindes zu dieser Folge (gilt für alle Teile, nicht nur für Teil 1). */
  wish: string;
  /** Die letzten Sätze des vorigen Teils, damit der nächste nahtlos anschließt. */
  last: string;
  /** Kernideen der letzten Folgen (Trank, Hinweis, Lösung), damit sie sich nicht wiederholen. */
  recent: string;
  /** Wie oft Claude für den anstehenden Teil schon ausgefallen ist (0 oder 1, siehe STORY_PAUSE_TEXT). */
  miss: number;
  /** Zeitpunkt des letzten erzählten Teils (ms seit 1970), 0 = unbekannt. Für die Erinnerung nach langer Pause. */
  at: number;
  /** Bisherige Kosten der laufenden Folge für Claude in US-Dollar (nur fürs Protokoll, Punkt 72b). */
  usd: number;
}

/** Nach so langer Pause zwischen zwei Teilen erinnert der nächste Teil kurz an das Wichtigste. */
export const RECAP_AFTER_MS = 6 * 60 * 60 * 1000;

/** Längen der Textfelder im Zustand (Zeichen). */
const STATE_LIMITS = { seed: 300, summary: 900, threads: 400, hook: 300, plan: 800, wish: 200, last: 400, recent: 600 } as const;

/** Ein zweiter Versuch nach einem abgelehnten Teil lohnt nur mit so viel Restzeit (Modell plus lange Sprachausgabe). */
export const STORY_RETRY_MIN_MS = 75_000;

export interface TurnResult {
  kind: 'frage' | 'geschichte' | 'weiter' | 'hinweis';
  speech: string;
  story_state: StoryState;
  fixed?: string;
  wav?: Buffer;
  /** Der Text wurde schon Absatz für Absatz an einen StorySink gegeben (Ton-Strom, Punkt 71). */
  streamed?: boolean;
}

/**
 * Empfänger für den Ton-Strom (Punkt 71): Jeder Absatz kommt hierher, sobald Claude ihn fertig
 * geschrieben und der Ausgabe-Check ihn freigegeben hat. `begin` kommt einmal vor dem ersten Absatz.
 */
export interface StorySink {
  begin(info: { done: boolean }): void;
  say(text: string): void;
}

const PARAGRAPH_SPLIT = /\n\s*\n+/;

/** Längste Äußerung, die ins Sprachmodell geht (Kosten- und Missbrauchsgrenze; die Spracherkennung liefert höchstens 1000 Zeichen). */
export const MAX_UTTERANCE_CHARS = 1000;

/**
 * Macht fremden Text prompt-tauglich: Steuerzeichen und Zeilenumbrüche werden zu
 * Leerzeichen, die Anführungszeichen « », mit denen der Prompt Kinderäußerungen
 * einrahmt, werden entschärft, und die Länge ist begrenzt.
 */
export function cleanText(text: unknown, maxChars: number): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/[«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/**
 * Typische Fehlerkennungen von Whisper bei Stille oder Rauschen: Untertitel-Abspänne aus den
 * Trainingsdaten. Belegt: „Untertitel im Auftrag des ZDF, 2017“ bei 23 s Stille
 * (https://gist.github.com/riotbib/3b3c5f817b55b68801d14b8bdb02df09) und die deutsche Liste in
 * scraibe (https://huggingface.co/spaces/Hyathi/Stem-Extractor/blob/main/scraibe/hallucinations.py).
 * Geprüft wird nach normalize(): klein, ohne Satzzeichen. Nur ganze Äußerungen, die genau so
 * aussehen; eine Kinderfrage wie „Was sind Untertitel?“ trifft keines der Muster.
 */
const STT_ARTIFACTS: RegExp[] = [
  /^untertitel(ung)? (im auftrag des zdf|aufgrund der amara org community|der amara org community|von stephanie geiges)( für funk)?( \d{4})?$/,
  /^copyright wdr( \d{4})?$/,
  /^swr \d{4}$/,
];

/**
 * true, wenn die Erkennung sehr wahrscheinlich nichts Gesprochenes enthält: ein bekannter
 * Untertitel-Abspann oder nur der Erkennungshinweis selbst (PICASTAI_STT_PROMPT, zum Beispiel
 * „Ritter Kunibert“), den Whisper bei Rauschen nachsprechen kann. Dann bittet Kunibert um
 * Wiederholung, statt auf etwas zu antworten, das das Kind nicht gesagt hat.
 */
export function isLikelySttArtifact(transcript: string, sttPrompt = ''): boolean {
  const text = normalize(transcript).trim();
  if (!text) return false;
  if (STT_ARTIFACTS.some((pattern) => pattern.test(text))) return true;
  const prompt = normalize(sttPrompt).trim();
  if (!prompt) return false;
  // Auch mehrfach hintereinander („Ritter Kunibert. Ritter Kunibert.“).
  return text.split(prompt).every((rest) => rest.trim() === '');
}

const WISH_FILLER = new Set([
  'bitte', 'erzähl', 'erzähle', 'erzählst', 'erzählt', 'mir', 'mal', 'doch', 'noch', 'gerne', 'gern',
  'ich', 'will', 'möchte', 'möchten', 'kannst', 'kann', 'du', 'hören', 'höre', 'wir',
  'eine', 'ein', 'einen', 'einem', 'einer', 'der', 'die', 'das', 'dem', 'den', 'des',
  'geschichte', 'geschichten', 'märchen', 'neue', 'neues', 'neuen', 'andere', 'weitere',
  'von', 'vom', 'über', 'mit', 'und', 'zum', 'zur', 'im', 'in', 'auf', 'ritter', 'kunibert',
]);

/**
 * Das Stichwort aus einem Geschichtenwunsch für den Notfall-Erzähler ohne Sprachmodell:
 * höchstens drei Wörter, ohne Füllwörter, und nur wenn der Ausgabe-Check es erlaubt.
 */
export function extractWishKeyword(wish: string): string {
  const words = cleanText(wish, 200)
    .split(' ')
    .map((word) => word.replace(/^[^a-zA-ZäöüÄÖÜß]+|[^a-zA-ZäöüÄÖÜß]+$/g, ''))
    .filter((word) => word && !WISH_FILLER.has(word.toLowerCase()));
  const keyword = words.slice(0, 3).join(' ');
  return keyword && !screenOutput(keyword, 'story') ? keyword : '';
}

export function cleanState(raw: any): StoryState {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) {
    return {
      v: 1,
      ep: 1,
      part: 0,
      target: config.partsPerEpisode,
      seed: '',
      summary: '',
      threads: '',
      hook: '',
      done: false,
      plan: '',
      wish: '',
      last: '',
      recent: '',
      miss: 0,
      at: 0,
      usd: 0,
    };
  }
  const ep = Number(raw.ep) || 1;
  const part = Number(raw.part) || 0;
  const target = Math.max(3, Math.min(12, Number(raw.target) || config.partsPerEpisode));
  return {
    v: 1,
    ep: Math.max(1, Math.min(10000, ep)),
    part: Math.max(0, Math.min(50, part)),
    target,
    seed: cleanText(raw.seed, STATE_LIMITS.seed),
    summary: cleanText(raw.summary, STATE_LIMITS.summary),
    threads: cleanText(raw.threads, STATE_LIMITS.threads),
    hook: cleanText(raw.hook, STATE_LIMITS.hook),
    done: Boolean(raw.done),
    plan: cleanText(raw.plan, STATE_LIMITS.plan),
    wish: cleanText(raw.wish, STATE_LIMITS.wish),
    last: cleanText(raw.last, STATE_LIMITS.last),
    recent: cleanText(raw.recent, STATE_LIMITS.recent),
    miss: Math.max(0, Math.min(3, Math.floor(Number(raw.miss) || 0))),
    at: Math.max(0, Math.floor(Number(raw.at) || 0)),
    usd: Math.max(0, Math.min(1000, Number(raw.usd) || 0)),
  };
}

export function storyActive(state: StoryState): boolean {
  return state.part > 0 && !state.done;
}

export function trimWords(text: string, maxWords: number): string {
  const words = (text || '').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= maxWords) return text;
  const cut = words.slice(0, maxWords).join(' ');
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('“'));
  return end > cut.length / 2 ? cut.slice(0, end + 1) : cut + ' ...';
}

export const QUESTION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['frage', 'geschichte', 'weiter', 'idee', 'sicherheit', 'unklar'] },
    speech: { type: 'string' },
  },
  required: ['category', 'speech'],
};

export const STORY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    episode_plan: {
      type: 'string',
      description:
        'Nur im ersten Teil einer Folge, sonst leer. Der Plan für die ganze Folge in drei bis fünf knappen Sätzen, nur für dich, wird nicht vorgelesen: ' +
        'Anlass und Ziel; Nebenfigur mit Namen; der Hinweis der Hexe wörtlich in „…“; die kluge Lösung am Ende und wie der Hinweis dazu passt; wie der Wunsch des Kindes vorkommt.',
    },
    text: {
      type: 'string',
      description: 'Der vorzulesende Teil der Geschichte, in drei bis fünf Absätzen, getrennt durch eine Leerzeile. Nur Erzähltext.',
    },
    summary: {
      type: 'string',
      description:
        'Zusammenfassung der GANZEN Folge bis einschließlich dieses Teils (nicht nur dieses Teils), in höchstens sechs kurzen Sätzen. ' +
        'Nenne Namen neuer Figuren, wichtige Gegenstände und was die Hexe wörtlich gesagt hat.',
    },
    open_threads: { type: 'string', description: 'Was noch offen ist und bis zum Ende aufgelöst werden muss, kurz. Leer, wenn nichts offen ist.' },
    next_hook: { type: 'string', description: 'Ein Satz: Wo und in welcher Lage der nächste Teil beginnt.' },
    episode_finished: { type: 'boolean', description: 'true nur im letzten Teil der Folge.' },
    episode_motif: {
      type: 'string',
      description: 'Nur im letzten Teil: in einem kurzen Satz Anlass, Trank oder Hinweis der Hexe und die Lösung dieser Folge, damit die nächste Folge etwas anderes erfindet.',
    },
  },
  required: ['text', 'summary', 'open_threads', 'next_hook', 'episode_finished'],
};

/** Rolle eines Teils: 1 Anfang, letzter Teil Finale, vorletzter Wendung, Teil 2 unterwegs (Hexe), sonst Mitte. */
export function storyPhase(part: number, target: number): StoryPhase {
  if (part <= 1) return 'start';
  if (part >= target) return 'finale';
  if (part === target - 1) return 'trick';
  if (part === 2) return 'weg';
  return 'middle';
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
  'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

/** Deutsche Zahlwörter von 0 bis 999 999 („einundzwanzig“, „hundertzwei“, „dreitausend“). */
export function germanNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const unit = n % 10;
    const ten = TENS[Math.floor(n / 10)];
    return unit ? `${unit === 1 ? 'ein' : ONES[unit]}und${ten}` : ten;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundreds === 1 ? 'ein' : ONES[hundreds]}hundert${rest ? germanNumber(rest) : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${thousands === 1 ? 'ein' : germanNumber(thousands)}tausend${rest ? germanNumber(rest) : ''}`;
}

/** Ziffern, Uhrzeiten und gängige Abkürzungen als gesprochene Wörter. */
export function spellOutForSpeech(text: string): string {
  return text
    .replace(/\bz\.\s?B\./g, 'zum Beispiel')
    .replace(/\bu\.\s?a\./g, 'unter anderem')
    .replace(/\busw\./g, 'und so weiter')
    .replace(/\bca\./g, 'ungefähr')
    .replace(/\bNr\.\s?/g, 'Nummer ')
    .replace(/\b(\d{1,2}):(\d{2})\b(?:\s*Uhr\b)?/g, (_m, h: string, min: string) =>
      `${germanNumber(Number(h)) === 'eins' ? 'ein' : germanNumber(Number(h))} Uhr${Number(min) ? ` ${germanNumber(Number(min))}` : ''}`)
    .replace(/(?<![\d.,])(\d{1,6})(?![\d,]|\.\d)/g, (_m, digits: string, offset: number, whole: string) => {
      const word = germanNumber(Number(digits));
      // „1 Apfel“ → „ein Apfel“, alleinstehend „eins“.
      return word === 'eins' && /^\s+\p{L}/u.test(whole.slice(offset + digits.length)) ? 'ein' : word;
    });
}

export interface StoryMetrics {
  words: number;
  paragraphs: number;
  sentences: number;
  /** Durchschnittliche Wörter je Satz, eine Nachkommastelle. */
  wordsPerSentence: number;
  /** Sätze mit mehr als 20 Wörtern (für Kinderohren zu lang). */
  longSentences: number;
  /** Stellen mit wörtlicher Rede („…“). */
  dialogue: number;
  ploetzlich: number;
}

/** Messwerte eines Teils, ohne Text: für das Protokoll und `npm run probe:folge`. */
export function storyMetrics(text: string): StoryMetrics {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const sentences = text.split(/(?<=[.!?…])[“”"]?\s+/).map((x) => x.trim()).filter(Boolean);
  const counts = sentences.map((x) => x.split(/\s+/).filter(Boolean).length);
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    words,
    paragraphs,
    sentences: sentences.length,
    wordsPerSentence: sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0,
    longSentences: counts.filter((c) => c > 20).length,
    dialogue: (text.match(/„/g) || []).length,
    ploetzlich: (text.match(/\bplötzlich\b/gi) || []).length,
  };
}

export function formatMetrics(m: StoryMetrics): string {
  return `${m.words} Wörter, ${m.paragraphs} Absätze, ${m.sentences} Sätze, ${String(m.wordsPerSentence).replace('.', ',')} Wörter je Satz, ` +
    `${m.longSentences} lange Sätze, ${m.dialogue} Redeteile, ${m.ploetzlich}x „plötzlich“`;
}

/**
 * Glättet einen Geschichtentext für die Sprachausgabe: kein Markdown, keine Emojis, keine
 * Gedankenstriche oder Klammern, saubere Absätze (Leerzeile, dort macht die Stimme eine längere
 * Pause). Inhaltlich ändert sich nichts; der Ausgabe-Check läuft danach auf genau diesem Text.
 */
export function prepareStoryText(raw: string): string {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[*_#`~|]+/g, '')
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/[\[\]{}]/g, '')
    .replace(/\s*\(([^()]*)\)/g, ', $1,')
    .replace(/,\s*([.!?,])/g, '$1')
    .replace(/\s+[–—-]\s+/g, ', ')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').replace(/^[\s,]+/, '').trim())
    .filter(Boolean)
    .map(spellOutForSpeech)
    .join('\n\n');
}

/** Letzte ein bis drei Sätze eines Teils (höchstens maxChars), als Anschluss für den nächsten Teil. */
export function lastSentences(text: string, maxChars = STATE_LIMITS.last): string {
  const flat = cleanText(text, 5000);
  const sentences = flat.split(/(?<=[.!?…][“”"]?)\s+/).filter(Boolean);
  let out = '';
  for (let index = sentences.length - 1; index >= 0 && index >= sentences.length - 3; index--) {
    const next = out ? `${sentences[index]} ${out}` : sentences[index];
    if (next.length > maxChars) break;
    out = next;
  }
  return out || flat.slice(-maxChars);
}

/** Hängt die Kernidee einer beendeten Folge an und behält die letzten drei. */
export function rememberMotif(recent: string, motif: string): string {
  const entry = cleanText(motif, 180).replace(/\|/g, '/');
  if (!entry) return recent;
  const list = recent ? recent.split(' | ').filter(Boolean) : [];
  list.push(entry);
  let joined = list.slice(-3).join(' | ');
  while (joined.length > STATE_LIMITS.recent && joined.includes(' | ')) joined = joined.slice(joined.indexOf(' | ') + 3);
  return joined.slice(0, STATE_LIMITS.recent);
}

/** Abends (19 bis 6 Uhr deutscher Zeit) gilt Schlafenszeit: ruhigere Teile (Kanon, Abschnitt 7). */
export function isBedtime(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return hour >= 19 || hour < 6;
}

/** Der Hinweis der Hexe aus dem Plan: der erste Text in „…“ (oder "…"), sonst leer. */
export function hintFromPlan(plan: string): string {
  const match = /[„"]([^“”"]{4,200})[“”"]/.exec(plan || '');
  return match ? match[1].trim() : '';
}

/** Kommt der Hinweis im Text vor? Mindestens die Hälfte seiner längeren Wörter (ab vier Buchstaben). */
export function usesHint(text: string, hint: string): boolean {
  const words = (hint.toLowerCase().match(/\p{L}{4,}/gu) || []);
  if (!words.length) return false;
  const lower = text.toLowerCase();
  return words.filter((word) => lower.includes(word)).length * 2 >= words.length;
}

/** Baut die Anfrage für einen Teil. Exportiert für Tests. */
export function buildStoryPrompt(
  state: StoryState,
  part: number,
  settings: { storyMinWords: number; storyMaxWords: number; bedtime?: boolean; nowMs?: number; idea?: string },
  retryNote = ''
): string {
  const target = state.target;
  const phase = storyPhase(part, target);
  const lines: string[] = [];
  lines.push(part === 1 ? `Erzähle jetzt Teil 1 von ${target} einer neuen Folge.` : `Erzähle jetzt Teil ${part} von ${target} der laufenden Folge.`);
  lines.push(`Länge: ${settings.storyMinWords} bis ${settings.storyMaxWords} Wörter.`);
  lines.push(`Aufgabe dieses Teils: ${PHASE_HINTS[phase]}`);
  if (target <= 3 && phase === 'start') {
    lines.push('Die Folge ist kurz: Kunibert trifft schon in diesem Teil die Hexe und bekommt ihren Hinweis.');
  }
  if (part === 1) {
    lines.push(`Stimmung und Anlass zum Einstieg: ${state.seed}`);
    if (state.recent) lines.push(`Diese Ideen gab es in den letzten Folgen schon; erfinde diesmal etwas anderes: ${state.recent}`);
  } else {
    lines.push(`Plan der Folge: ${state.plan || 'nicht festgehalten; bleib bei dem, was bisher geschah'}`);
    const hint = hintFromPlan(state.plan);
    if (hint && phase === 'trick') {
      lines.push(`Die Worte der Hexe lauteten: „${hint}“. Kunibert erinnert sich in diesem Teil an genau diese Worte, und die Lösung ergibt sich daraus.`);
    }
    lines.push(`Bisher: ${state.summary}`);
    lines.push(`Offene Fäden: ${state.threads || 'keine'}`);
    if (state.last) lines.push(`So endete der vorige Teil: ${state.last}`);
    if (state.at && settings.nowMs && settings.nowMs - state.at >= RECAP_AFTER_MS) {
      lines.push('Das Kind hat lange nicht zugehört (in der Geschichte ist keine Zeit vergangen, es ist derselbe Tag). Beginne mit zwei kurzen Sätzen, die wie beim Erzählen am Bett an das Wichtigste erinnern (wo Kunibert ist, was er sucht), ohne „Im letzten Teil“. Dann geht es nahtlos weiter.');
    }
    if (state.hook) lines.push(`Anknüpfen an: ${state.hook}`);
  }
  if (state.wish) lines.push(`Wunsch des Kindes für diese Folge: «${state.wish}»`);
  if (settings.bedtime) lines.push(BEDTIME_HINT);
  if (settings.idea) lines.push(IDEA_HINT(cleanText(settings.idea, STATE_LIMITS.wish)));
  const preview = phase === 'finale' ? '' : NEXT_PHASE_PREVIEW[storyPhase(part + 1, target)];
  if (preview) lines.push(preview);
  if (retryNote) lines.push(retryNote);
  lines.push('Antworte strikt im vorgegebenen Format.');
  return lines.join('\n');
}

export type BrainSettings = Pick<KunibertConfig, 'ageBracket' | 'partsPerEpisode' | 'storyMinWords' | 'storyMaxWords' | 'answerMaxWords' | 'sttPrompt' | 'llmPrices'> & {
  /** Uhr für die Jahreszeit der Stimmung (austauschbar für Tests). */
  now: () => Date;
};

/**
 * Bausteine der Ersatzgeschichte (ohne Sprachmodell): drei verschiedene Geschenke der Hexe und
 * drei Listen. Welche gilt, hängt an der Folgennummer, damit Kinder ohne Claude nicht immer
 * dieselbe Folge hören.
 */
export const FALLBACK_VARIANTS = [
  {
    gift: 'Sie füllte etwas Goldenes in eine kleine grüne Flasche und gab sie ihm.',
    hint: 'Nicht trinken. Wenn der Drache schnaubt, halte sie gegen den Wind.',
    item: 'die grüne Flasche',
    itemCap: 'Die grüne Flasche',
    trick:
      `Der Drache holte tief Luft. Gleich würde er schnauben. Da fielen Kunibert die Worte der Hexe ein: ` +
      `„Wenn der Drache schnaubt, halte sie gegen den Wind.“\n\n` +
      `Er zog die grüne Flasche hervor und zog den Korken heraus. Ein Duft nach Pfefferminz und Sommerblumen ` +
      `wehte mit dem Bergwind direkt in die Nase des Drachen. Der Drache schnupperte, blinzelte und musste gewaltig niesen. „Hatschi!“\n\n` +
      `Er nieste und nieste und konnte kein Feuer mehr fauchen. Wütend brüllend kroch er zurück in seine Höhle. ` +
      `Besiegt war er nicht. Aber für heute war der Berg frei, und Kunibert wusste jetzt: Mit Klugheit kommt er dem Drachen näher als mit Kraft.`,
  },
  {
    gift: 'Sie nahm ein kleines silbernes Glöckchen von einem Haken und legte es ihm in die Hand.',
    hint: 'Läute es erst, wenn der Drache gähnt. Vorher nützt es nichts.',
    item: 'das silberne Glöckchen',
    itemCap: 'Das silberne Glöckchen',
    trick:
      `Der Drache streckte sich vor seiner Höhle. Die Sonne wärmte die Felsen. Da riss er sein riesiges Maul auf und gähnte, ` +
      `so laut, dass die Steine wackelten. „Läute es erst, wenn der Drache gähnt“, hatte die Hexe gesagt.\n\n` +
      `Kunibert zog das silberne Glöckchen hervor und läutete, ganz leise. Bimm, bimm. Der Ton schwebte über den Berg wie ein Schlaflied.\n\n` +
      `Die Augen des Drachen wurden schwer. Er knurrte noch einmal böse, dann sank sein Kopf auf den Felsen, und er schnarchte, dass die Grashalme zitterten. ` +
      `Kunibert schlich auf Zehenspitzen an ihm vorbei. Besiegt war der Drache nicht. Aber heute hatte Kunibert gelernt, wie man ihn einschlafen lässt.`,
  },
  {
    gift: 'Sie gab ihm einen glatten, runden Stein mit einem Loch in der Mitte.',
    hint: 'Schau durch den Stein, bevor du kämpfst. Dann siehst du, was der Drache wirklich will.',
    item: 'den runden Stein',
    itemCap: 'Der runde Stein',
    trick:
      `Der Drache stampfte vor seiner Höhle und schnaubte. Kunibert wollte schon sein Schwert ziehen. Doch dann dachte er an die Hexe: ` +
      `„Schau durch den Stein, bevor du kämpfst.“\n\n` +
      `Er hielt den runden Stein vor sein Auge und schaute hindurch. Da sah er etwas, das er vorher nicht bemerkt hatte. ` +
      `Der Drache blickte immer wieder auf einen glänzenden Haufen hinter sich. Er bewachte etwas. Er wollte nur, dass niemand an seinen Schatz kam.\n\n` +
      `„Ach so!“, flüsterte Kunibert. Er warf einen Kiesel weit nach links, so dass er laut klapperte. Sofort fuhr der Drache herum und fauchte in die falsche Richtung. ` +
      `Kunibert huschte auf der anderen Seite den Pfad hinunter. Besiegt war der Drache nicht. Aber jetzt kannte Kunibert seine schwache Stelle.`,
  },
] as const;

export class Brain {
  private readonly age: string;
  private readonly partsPerEpisode: number;
  private readonly storyMinWords: number;
  private readonly storyMaxWords: number;
  private readonly answerMaxWords: number;
  private readonly sttPrompt: string;
  private readonly now: () => Date;
  private readonly prices: LlmPrices | null;

  /**
   * Ohne Anbieter (kein Key) greifen die festen Fallback-Texte. Die Einstellungen
   * (Altersgruppe, Teile pro Folge, Wortgrenzen) kommen standardmäßig aus der Konfiguration.
   */
  constructor(private readonly llm: LlmProvider | null = createLlmProvider(config), settings: Partial<BrainSettings> = {}) {
    this.age = settings.ageBracket ?? config.ageBracket;
    this.partsPerEpisode = settings.partsPerEpisode ?? config.partsPerEpisode;
    this.storyMinWords = settings.storyMinWords ?? config.storyMinWords;
    this.storyMaxWords = settings.storyMaxWords ?? config.storyMaxWords;
    this.answerMaxWords = settings.answerMaxWords ?? config.answerMaxWords;
    this.sttPrompt = settings.sttPrompt ?? config.sttPrompt;
    this.now = settings.now ?? (() => new Date());
    this.prices = llm ? pricesFor(llm.model, settings.llmPrices ?? config.llmPrices) : null;
  }

  /** Zählt Token und Kosten eines Aufrufs für die Zeitmessung (und optional für die Folge). Nur Zahlen. */
  private meter(timer: StageTimer, onCost?: (usd: number) => void): (usage: LlmUsage) => void {
    return (usage) => {
      const usd = this.prices ? costUsd(usage, this.prices) : null;
      timer.noteLlm?.(usage, usd);
      if (onCost && usd !== null) onCost(usd);
    };
  }

  /**
   * Zeit für den nächsten Sprachmodell-Aufruf aus dem gemeinsamen Zeitbudget der Anfrage, mit Reserve
   * für die Sprachausgabe. Bleibt zu wenig übrig, wird kein Aufruf mehr gestartet (der Aufrufer
   * fängt den Fehler und nimmt den festen Fallback-Text). Ohne Budget (undefined) gilt nur die
   * eigene Grenze des Anbieters.
   */
  private llmTimeoutMs(timer: StageTimer): number | undefined {
    const left = budgetTimeoutMs(timer, TTS_RESERVE_MS);
    if (left !== undefined && left < MIN_LLM_MS) throw new Error('Zeitbudget der Anfrage aufgebraucht, kein weiterer Sprachmodell-Aufruf');
    return left;
  }

  /** Für Statusanzeige und Logs, z. B. "anthropic:claude-sonnet-5-5". */
  public get llmName(): string {
    return this.llm ? `${this.llm.name}:${this.llm.model}` : 'none';
  }

  /** Der optionale Zeitmesser misst nur die Dauer von Weiche, Sprachmodell und Ausgabe-Check; am Ablauf ändert er nichts. */
  public async handle(
    mode: 'frage' | 'geschichte' | 'weiter',
    rawTranscript: string,
    rawState: any,
    timer: StageTimer = NO_TIMER,
    sink?: StorySink
  ): Promise<TurnResult> {
    const state = cleanState(rawState);
    const transcript = cleanText(rawTranscript, MAX_UTTERANCE_CHARS);

    // 1. Deterministische Sicherheitsweiche
    if (transcript && timer.timeSync('weiche', () => screen(transcript))) {
      return {
        kind: 'hinweis',
        speech: SAFETY_RESPONSE_DE,
        story_state: state,
        fixed: 'sicherheit',
        wav: this.synthesizeWav(SAFETY_RESPONSE_DE, 'hinweis'),
      };
    }

    try {
      if (mode === 'frage') {
        return await this.handleQuestion(transcript, state, timer, sink);
      }
      if (mode === 'geschichte') {
        return await this.handleStory(true, state, transcript, timer, '', sink);
      }
      if (mode === 'weiter') {
        return await this.handleStory(!storyActive(state), state, '', timer, '', sink);
      }
    } catch (err) {
      console.error('Brain execution error:', err);
      return {
        kind: 'hinweis',
        speech: ERROR_RESPONSE_DE,
        story_state: state,
        fixed: 'fehler',
        wav: this.synthesizeWav(ERROR_RESPONSE_DE, 'hinweis'),
      };
    }

    throw new Error('Unbekannter Modus');
  }

  private async handleQuestion(transcript: string, state: StoryState, timer: StageTimer, sink?: StorySink): Promise<TurnResult> {
    // Die Sicherheitsweiche lief schon (handle). Ein Abspann oder nur der Erkennungshinweis
    // ist keine Äußerung des Kindes: wie eine leere Erkennung behandeln.
    if (!transcript || isLikelySttArtifact(transcript, this.sttPrompt)) {
      return {
        kind: 'hinweis',
        speech: UNCLEAR_RESPONSE_DE,
        story_state: state,
        fixed: 'unklar',
        wav: this.synthesizeWav(UNCLEAR_RESPONSE_DE, 'hinweis'),
      };
    }

    // Wenn ein Sprachmodell konfiguriert ist, befragen
    const llm = this.llm;
    if (llm) {
      try {
        const systemPrompt = ANSWER_SYSTEM(this.age, this.answerMaxWords);
        const active = storyActive(state);
        // Läuft eine Folge, bekommt Claude ihren bisherigen Inhalt (nur die Zusammenfassung, nicht den
        // Plan), damit Fragen zur Geschichte passend beantwortet werden, ohne die Auflösung zu verraten.
        const storyContext = active && state.summary ? `\nBisher in der laufenden Geschichte: ${state.summary}` : '';
        const userPrompt = `Läuft gerade eine Kunibert-Geschichte: ${active ? 'ja' : 'nein'}${storyContext}\nErkannte Äußerung des Kindes: «${transcript}»`;

        const parsed = await timer.time('sprachmodell', () => llm.generateJson({
          system: systemPrompt,
          user: userPrompt,
          schemaName: 'kunibert_antwort',
          schema: QUESTION_SCHEMA,
          timeoutMs: this.llmTimeoutMs(timer),
          onUsage: this.meter(timer),
        })) as { category?: string; speech?: string };
        if (parsed.category === 'sicherheit') {
          return {
            kind: 'hinweis',
            speech: SAFETY_RESPONSE_DE,
            story_state: state,
            fixed: 'sicherheit',
            wav: this.synthesizeWav(SAFETY_RESPONSE_DE, 'hinweis'),
          };
        }
        if (parsed.category === 'geschichte') {
          return await this.handleStory(true, state, transcript, timer, '', sink);
        }
        if (parsed.category === 'weiter') {
          return await this.handleStory(!storyActive(state), state, '', timer, '', sink);
        }
        if (parsed.category === 'idee') {
          // Idee für die laufende Folge: weitererzählen und die Idee einbauen. Läuft keine Folge,
          // ist die Idee der Wunsch für eine neue.
          return storyActive(state)
            ? await this.handleStory(false, state, '', timer, transcript, sink)
            : await this.handleStory(true, state, transcript, timer, '', sink);
        }
        if (parsed.category === 'unklar') {
          // Das Sprachmodell hat die Äußerung als leer oder unverständlich eingestuft: um
          // Wiederholung bitten, statt mit dem Ersatztext unten auf Unverstandenes zu antworten.
          return {
            kind: 'hinweis',
            speech: UNCLEAR_RESPONSE_DE,
            story_state: state,
            fixed: 'unklar',
            wav: this.synthesizeWav(UNCLEAR_RESPONSE_DE, 'hinweis'),
          };
        }
        if (parsed.category === 'frage' && parsed.speech) {
          // Gleiche Vorlese-Glättung wie bei Geschichten: kein Markdown, Zahlen als Wörter.
          const speech = prepareStoryText(trimWords(parsed.speech, this.answerMaxWords + 20));
          if (!speech) throw new Error('Antwort des Sprachmodells ist leer');
          // Ausgabe-Check: bei Treffer greift der Fallback unten (catch-Pfad).
          if (timer.timeSync('ausgabecheck', () => screenOutput(speech, 'answer'))) {
            throw new Error('Antwort des Sprachmodells durch Ausgabe-Check abgelehnt');
          }
          return {
            kind: 'frage',
            speech,
            story_state: state,
            wav: this.synthesizeWav(speech, 'frage'),
          };
        }
      } catch (llmErr) {
        console.warn(`LLM-Antwort (${this.llmName}) fehlgeschlagen, verwende Fallback:`, llmErr);
      }
    }

    // Fallback Beantwortung
    return this.fallbackQuestion(transcript, state);
  }

  private fallbackQuestion(transcript: string, state: StoryState): TurnResult {
    // Ganze Wörter statt Teilwörter: "Schwein" enthält "wein", "Weiterbildung" enthält "weiter".
    const words = new Set(transcript.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean));
    const has = (...candidates: string[]) => candidates.some((word) => words.has(word));

    if (has('geschichte', 'geschichten', 'märchen', 'erzähl', 'erzähle', 'erzählst', 'erzählen')) {
      return this.fallbackStory(true, state, transcript);
    }
    if (has('weiter', 'weitererzählen', 'nochmal')) {
      return this.fallbackStory(!storyActive(state), state, '');
    }

    // Feste Antworten ohne Sprachmodell. Die Äußerung des Kindes wird nie nachgesprochen:
    // Sie käme sonst ungeprüft am Ausgabe-Check vorbei in den Lautsprecher, auch mit
    // Erkennungsfehlern oder Wörtern, die Kunibert nicht sagen soll.
    let speech = '';
    if (has('kunibert', 'kuniberts')) {
      speech =
        'Ritter Kunibert ist ein mutiger, höflicher und großzügiger Ritter. ' +
        'Er wohnt im Dachzimmer eines Gasthauses, fährt mit einem Kutscher über holprige Pflastersteine, ' +
        'trifft im düsteren Wald eine geheimnisvolle Hexe und zieht immer wieder auf den Berg zum Drachen. ' +
        'Manchmal verliert er, dann isst er Suppe, schläft und versucht es am nächsten Tag wieder. ' +
        'Am Ende hilft ihm seine Klugheit. Wenn du eine Geschichte hören willst, drück die Erzähltaste.';
    } else if (has('himmel') && has('blau')) {
      speech =
        'Der Himmel wirkt blau, weil das weiße Sonnenlicht in der Luft auf winzig kleine Teilchen trifft ' +
        'und dabei in alle Richtungen gestreut wird. Blaues Licht wird dabei viel stärker gestreut als ' +
        'rotes Licht, deshalb sehen wir den Himmel blau leuchten.';
    } else if (has('traurig', 'weine', 'weinen', 'geweint', 'allein', 'alleine', 'einsam')) {
      speech =
        'Es ist ganz in Ordnung, manchmal traurig zu sein. Jeder von uns fühlt sich ab und zu so, ' +
        'sogar Ritter Kunibert, wenn er vom Drachenberg zurückkehrt. ' +
        'Sprich am besten mit einem Erwachsenen, den du lieb hast, oder nimm ein Kuscheltier in den Arm.';
    } else if (has('drache', 'drachen')) {
      speech =
        'Der Drache wohnt oben auf dem Berg in einer dunklen Höhle. Er ist gewaltig und spuckt Rauch, ' +
        'aber Ritter Kunibert besiegt ihn nie mit Gewalt, sondern immer mit Klugheit und ein bisschen Geduld.';
    } else {
      speech = FALLBACK_ANSWER_DE;
    }

    return {
      kind: 'frage',
      speech,
      story_state: state,
      // Alle Texte hier sind fest: Die Sprachausgabe kommt nach dem ersten Mal aus dem
      // Zwischenspeicher. Das hilft gerade dann, wenn das Sprachmodell ausfällt.
      fixed: 'ersatz',
      wav: this.synthesizeWav(speech, 'frage'),
    };
  }

  /** Neue Folge: Zähler weiter, Stimmung und Anlass auslosen, Wunsch und Gedächtnis der letzten Folgen mitnehmen. */
  private startEpisode(state: StoryState, wish: string): StoryState {
    return {
      v: 1,
      ep: (state.ep || 0) + 1,
      part: 0,
      target: this.partsPerEpisode,
      seed: `${pick(seedsForSeason(seasonOf(this.now())))} ${pick(EPISODE_SPARKS)}`,
      summary: '',
      threads: '',
      hook: '',
      done: false,
      plan: '',
      wish: cleanText(wish, STATE_LIMITS.wish),
      last: '',
      recent: state.recent,
      miss: 0,
      at: 0,
      usd: 0,
    };
  }

  private async handleStory(
    newEpisode: boolean,
    state: StoryState,
    wish: string,
    timer: StageTimer,
    idea = '',
    sink?: StorySink
  ): Promise<TurnResult> {
    const current = newEpisode ? this.startEpisode(state, wish) : { ...state };
    const part = current.part + 1;
    const phase = storyPhase(part, current.target);

    const llm = this.llm;
    if (llm) {
      const now = this.now();
      const settings = { storyMinWords: this.storyMinWords, storyMaxWords: this.storyMaxWords, bedtime: isBedtime(now), nowMs: now.getTime(), idea };
      let retryNote = '';
      let spent = 0;
      // Ton-Strom: schon gesprochene Absätze. Sobald einer gesprochen ist, gibt es keinen zweiten
      // Versuch mehr; ein Fehler danach endet mit der kurzen Pause (streamAbort).
      const spoken: string[] = [];
      let spokenWords = 0;
      let rawDone = 0;
      let blocked = false;
      const speak = (raw: string): boolean => {
        const paragraph = prepareStoryText(raw);
        if (!paragraph) return true;
        const words = paragraph.split(/\s+/).length;
        if (spokenWords + words > this.storyMaxWords + 50) return false;
        if (timer.timeSync('ausgabecheck', () => screenOutput(paragraph, 'story'))) {
          blocked = true;
          return false;
        }
        if (!spoken.length) sink!.begin({ done: phase === 'finale' });
        spoken.push(paragraph);
        spokenWords += words;
        sink!.say(paragraph);
        return true;
      };
      // Höchstens zwei Versuche: Lehnt der Ausgabe-Check einen Teil ab, bekommt das Modell einen
      // Hinweis und schreibt ihn neu, wenn noch genug Zeit bleibt. Sonst greift die Ersatzgeschichte.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const parsed = await timer.time('sprachmodell', () => llm.generateJson({
            system: STORYTELLER_SYSTEM(this.age),
            user: buildStoryPrompt(current, part, settings, retryNote),
            schemaName: 'kunibert_geschichte',
            schema: STORY_SCHEMA,
            maxOutputTokens: 2000,
            timeoutMs: this.llmTimeoutMs(timer),
            onUsage: this.meter(timer, (usd) => { spent += usd; }),
            // Nur im ersten Versuch und nur mit Empfänger: fertige Absätze sofort weitergeben.
            ...(sink && attempt === 1 ? {
              onText: (partial: string) => {
                const pieces = partial.split(PARAGRAPH_SPLIT);
                while (!blocked && rawDone < pieces.length - 1) {
                  if (!speak(pieces[rawDone++])) { blocked = true; break; }
                }
              },
            } : {}),
          })) as {
            text?: string; summary?: string; open_threads?: string; next_hook?: string;
            episode_finished?: boolean; episode_plan?: string; episode_motif?: string;
          };
          if (spoken.length || blocked) {
            // Ton-Strom: den Rest sprechen; der Text des Teils ist genau das Gesprochene.
            const pieces = String(parsed.text || '').split(PARAGRAPH_SPLIT);
            while (!blocked && rawDone < pieces.length) {
              if (!speak(pieces[rawDone++])) break;
            }
            if (blocked || !spoken.length) {
              if (!spoken.length) {
                // Nichts gesprochen: wie ein abgelehnter Teil behandeln (zweiter Versuch ohne Strom).
                blocked = false;
                rawDone = 0;
                if (attempt === 1 && timer.remainingMs() >= STORY_RETRY_MIN_MS) {
                  console.warn(`LLM-Geschichte (${this.llmName}) durch Ausgabe-Check abgelehnt, zweiter Versuch`);
                  retryNote = 'Wichtig: Ein erster Entwurf wurde vom automatischen Prüfer abgelehnt. Schreib den Teil neu und vermeide jedes Wort über Blut, Tod, Sterben, Töten und Verletzungen, auch in Redewendungen.';
                  continue;
                }
                throw new Error('Geschichte des Sprachmodells durch Ausgabe-Check abgelehnt');
              }
              console.warn(`LLM-Geschichte (${this.llmName}) mitten im Strom angehalten (${spoken.length} Absätze gesprochen)`);
              return this.streamAbort(state, current, newEpisode, spoken, sink!);
            }
          }
          const text = spoken.length
            ? spoken.join('\n\n')
            : prepareStoryText(trimWords(String(parsed.text || ''), this.storyMaxWords + 50));
          if (!text) {
            // Ohne erzwungenes Werkzeug (PR #55) kann eine Antwort leer sein: einmal neu, wenn Zeit bleibt.
            if (attempt === 1 && timer.remainingMs() >= STORY_RETRY_MIN_MS) {
              console.warn(`LLM-Geschichte (${this.llmName}) leer, zweiter Versuch`);
              retryNote = 'Wichtig: Rufe das Werkzeug auf und schreibe den ganzen Teil in das Feld text.';
              continue;
            }
            throw new Error('Geschichte des Sprachmodells ist leer');
          }
          const metrics = storyMetrics(text);
          // Nur Zahlen ins Protokoll, nie der Text (CLAUDE.md).
          const hint = phase === 'trick' ? hintFromPlan(current.plan) : '';
          const hintNote = hint ? `, Hinweis der Hexe ${usesHint(text, hint) ? 'aufgegriffen' : 'nicht erkennbar'}` : '';
          console.log(`Geschichte Teil ${part}/${current.target}: ${formatMetrics(metrics)}${hintNote}`);
          // Viel zu kurz (abgeschnitten oder Zusammenfassung statt Szene): einmal neu, wenn Zeit bleibt.
          // Nur mit echtem Zeitbudget (jede Geräteanfrage hat eins); ohne Budget gilt der Text, wie er ist.
          const left = timer.remainingMs();
          if (!spoken.length && metrics.words < this.storyMinWords * 0.5 && attempt === 1 && Number.isFinite(left) && left >= STORY_RETRY_MIN_MS) {
            retryNote = `Wichtig: Ein erster Entwurf war viel zu kurz. Erzähle diesen Teil als lebendige Szene mit ${this.storyMinWords} bis ${this.storyMaxWords} Wörtern.`;
            continue;
          }
          if (timer.timeSync('ausgabecheck', () => screenOutput(text, 'story'))) {
            // Treffer erst im ganzen Text (über Absätze hinweg): schon gesprochen, also anhalten.
            if (spoken.length) return this.streamAbort(state, current, newEpisode, spoken, sink!);
            if (attempt === 1 && timer.remainingMs() >= STORY_RETRY_MIN_MS) {
              console.warn(`LLM-Geschichte (${this.llmName}) durch Ausgabe-Check abgelehnt, zweiter Versuch`);
              retryNote =
                'Wichtig: Ein erster Entwurf wurde vom automatischen Prüfer abgelehnt. Schreib den Teil neu und vermeide ' +
                'jedes Wort über Blut, Tod, Sterben, Töten und Verletzungen, auch in Redewendungen.';
              continue;
            }
            throw new Error('Geschichte des Sprachmodells durch Ausgabe-Check abgelehnt');
          }
          // Ende nur im Finale: Eine Folge ist ein ganzer Tag und endet am Abend im Gasthaus (Wort des
          // Betreibers 14.11., 10:42). Ein früheres "fertig" von Claude zählt nicht; es gilt die Teilezahl.
          const done = phase === 'finale';
          const plan = part === 1 ? cleanText(parsed.episode_plan, STATE_LIMITS.plan) : current.plan;
          const updatedState: StoryState = {
            ...current,
            part,
            done,
            plan: done ? '' : plan,
            summary: done ? '' : cleanText(parsed.summary, STATE_LIMITS.summary),
            threads: done ? '' : cleanText(parsed.open_threads, STATE_LIMITS.threads),
            hook: done ? '' : cleanText(parsed.next_hook, STATE_LIMITS.hook),
            last: done ? '' : lastSentences(text),
            wish: done ? '' : current.wish,
            recent: done ? rememberMotif(current.recent, String(parsed.episode_motif || plan || '')) : current.recent,
            miss: 0,
            at: now.getTime(),
            usd: current.usd + spent,
          };
          // Kosten der ganzen Folge, wenn sie endet (Punkt 72b). Nur Zahlen.
          if (done) console.log(`Folge fertig: teile=${part} kosten_usd=${formatUsd(updatedState.usd)}`);
          return this.storyResult(text, part, updatedState, spoken.length ? sink : undefined);
        } catch (err) {
          if (spoken.length) {
            console.warn(`LLM-Geschichte (${this.llmName}) mitten im Strom abgebrochen (${spoken.length} Absätze gesprochen):`, (err as Error)?.message || err);
            return this.streamAbort(state, current, newEpisode, spoken, sink!);
          }
          console.warn(`LLM-Geschichte (${this.llmName}) fehlgeschlagen, verwende Fallback:`, err);
          break;
        }
      }
    }

    // Fällt Claude mitten in einer laufenden Claude-Folge aus (sie hat einen Plan), rückt die Folge
    // einmal nicht weiter: eine kurze Pause, und der nächste Druck versucht denselben Teil. Erst beim
    // zweiten Ausfall in Folge übernimmt die Ersatzgeschichte.
    if (llm && !newEpisode && current.plan && !current.done && current.part >= 1 && current.miss < 1) {
      return {
        kind: 'weiter',
        speech: STORY_PAUSE_TEXT,
        story_state: { ...current, miss: current.miss + 1 },
        fixed: 'pause',
        wav: this.synthesizeWav(STORY_PAUSE_TEXT, 'hinweis'),
      };
    }

    return this.fallbackStory(newEpisode, state, wish);
  }

  /**
   * Ton-Strom angehalten, nachdem schon Absätze gesprochen wurden (Ausgabe-Check schlägt an, Claude
   * bricht ab). Gesagtes lässt sich nicht zurücknehmen: Kunibert macht die kurze Pause, und die Folge
   * rückt nicht vor. Der nächste Druck erzählt den Teil neu; fällt Claude dann wieder aus, greift
   * wie sonst die Ersatzfolge (STORY_PAUSE_TEXT, miss). Bei einer neuen Folge bleibt der alte Stand.
   */
  private streamAbort(state: StoryState, current: StoryState, newEpisode: boolean, spoken: string[], sink: StorySink): TurnResult {
    sink.say(STORY_PAUSE_TEXT);
    const base = newEpisode ? state : current;
    return {
      kind: 'weiter',
      speech: [...spoken, STORY_PAUSE_TEXT].join('\n\n'),
      story_state: { ...base, miss: Math.min(3, base.miss + 1) },
      fixed: 'pause',
      streamed: true,
      wav: this.synthesizeWav(STORY_PAUSE_TEXT, 'hinweis'),
    };
  }

  private storyResult(text: string, part: number, state: StoryState, sink?: StorySink): TurnResult {
    // Den Hinweis auf die Sprechtaste hören Kinder in den ersten beiden Folgen; danach kennen sie ihn.
    const closing = state.done ? EPISODE_CLOSING : part === 1 && state.ep <= 2 ? STORY_CLOSING_FIRST : STORY_CLOSING;
    // Leerzeile vor dem Abschluss: Die Stimme setzt dort eine längere Pause.
    const fullSpeech = `${text}\n\n${closing}`;
    if (sink) sink.say(closing);
    return {
      kind: part === 1 ? 'geschichte' : 'weiter',
      speech: fullSpeech,
      story_state: state,
      ...(sink ? { streamed: true } : {}),
      wav: this.synthesizeWav(fullSpeech, 'geschichte'),
    };
  }

  /**
   * Feste Ersatzgeschichte ohne Sprachmodell. Die Bausteine folgen der Rolle des Teils (Anfang,
   * Hexe, Berg, Wendung, Heimkehr), damit auch eine Folge mit drei oder acht Teilen sauber endet.
   */
  private fallbackStory(newEpisode: boolean, state: StoryState, wish: string): TurnResult {
    const current = newEpisode ? this.startEpisode(state, wish) : { ...state };
    const part = current.part + 1;
    const phase = storyPhase(part, current.target);
    const wishKeyword = extractWishKeyword(current.wish || wish);
    const mood = EPISODE_SEEDS.find((seed) => current.seed.startsWith(seed)) ?? '';
    const variant = FALLBACK_VARIANTS[(current.ep || 1) % FALLBACK_VARIANTS.length];

    let text = '';
    let summary = '';
    let threads = '';
    let hook = '';

    if (phase === 'start') {
      text =
        `Kunibert erwachte im Dachzimmer des Gasthauses. ${mood}\n\n` +
        `Der schiefe Balken hing wie immer über seinem Bett. Durch das kleine Fenster sah er ` +
        `die Dächer des Dorfes und ganz hinten den hohen Berg mit dem dunklen Fleck. Das war die Drachenhöhle. ` +
        `Er zog seine Stiefel an, nahm sein Schwert und ging die knarrende Treppe hinunter.\n\n` +
        `In der Gaststube roch es nach frischem Brot und warmem Brei. Die Wirtin stellte ` +
        `ihm eine Schale hin. „Iss, Kunibert“, sagte sie. Er aß, bezahlte und bedankte sich.\n\n` +
        `An der steinernen Brücke hielt ein Kutscher die Pferde an. „Steig auf, Ritter“, brummte er. ` +
        `Die Räder rumpelten über das grobe Pflaster, und Kuniberts Helm wackelte bei jedem Stein. ` +
        `Am Rand des düsteren Waldes stieg Kunibert ab und gab dem Kutscher ein paar Münzen, obwohl der abwinkte.\n\n` +
        (wishKeyword
          ? `Zwischen den hohen Tannen entdeckte er eine seltsame Spur. Sie schien etwas mit „${wishKeyword}“ zu tun zu haben.`
          : `Ein leiser Wind raschelte im Moos, und etwas silbern Schimmerndes lockte ihn tiefer zwischen die Bäume.`);
      summary = `Kunibert ist aus dem Gasthaus aufgebrochen, mit dem Kutscher gefahren und steht am Waldrand.`;
      threads = wishKeyword ? `Die Spur zu „${wishKeyword}“ im Wald ergründen.` : `Das Schimmern im Wald erkunden.`;
      hook = `Kunibert betritt den Pfad zur Hexe.`;
    } else if (phase === 'weg') {
      text =
        `Kunibert ging vorsichtig in den düsteren Wald hinein. Tropfen perlten von den Farnen, und ` +
        `im Dickicht knackte ein Zweig. Dann sah er die Hütte der Hexe. Aus dem Schornstein stieg blauer Rauch.\n\n` +
        `Die Hexe stand an ihrem Topf und rührte. „Du gehst zum Drachen“, sagte sie, ohne aufzusehen. ` +
        `${variant.gift} „${variant.hint}“, sagte sie.\n\n` +
        `„Habt Dank“, sagte Kunibert und verbeugte sich. Er steckte ${variant.item} gut ein. ` +
        `Bald wurde der Weg steiler. Die Bäume wurden weniger, und die Felsen des Berges kamen näher.`;
      summary = `Die Hexe gab Kunibert ${variant.item} und sagte: „${variant.hint}“`;
      threads = `${variant.itemCap} der Hexe am Berg benutzen.`;
      hook = `Kunibert erreicht den Aufstieg zur Drachenhöhle.`;
    } else if (phase === 'middle') {
      text =
        `Der Weg am Berg war steil und steinig. Kleine Kiesel rollten unter Kuniberts Stiefeln ins Tal. ` +
        `Je näher er der Höhle kam, desto wärmer wurde die Luft.\n\n` +
        `Da grollte es tief im Berg. Der Drache schob seinen großen Kopf aus der Höhle. Rauch kam aus seinen Nüstern, ` +
        `und seine goldenen Augen funkelten. Mit einem Schwung seines Schwanzes schob er Kunibert sanft, aber bestimmt den Hang hinunter.\n\n` +
        `Kunibert setzte sich auf einen Stein und atmete tief durch. „Mit Kraft geht das heute nicht“, murmelte er. ` +
        `Er tastete nach seiner Tasche. ${variant.itemCap} war noch da.`;
      summary = `Kunibert traf am Berg auf den Drachen und merkte, dass er eine List braucht.`;
      threads = `${variant.itemCap} der Hexe im richtigen Moment benutzen.`;
      hook = `Kunibert überlegt sich eine List.`;
    } else if (phase === 'trick') {
      text = variant.trick;
      summary = `Kunibert beruhigte den Drachen mit Klugheit und dem Geschenk der Hexe.`;
      threads = ``;
      hook = `Kunibert kehrt ins Dorf zurück.`;
    } else {
      text =
        `Mit leichten Schritten stieg Kunibert den Berg hinab. Im Wald winkte ihm die Hexe aus ihrem Fenster zu. ` +
        `An der Brücke wartete wieder der Kutscher und nahm ihn mit zurück ins Dorf.\n\n` +
        `Im Gasthaus stellte die Wirtin ihm eine dampfende Schale Gemüsesuppe hin. ` +
        `Kunibert aß mit großem Hunger und bedankte sich. Dann stieg er die knarrende Treppe hinauf in sein Dachzimmer.\n\n` +
        `Er legte sich unter den schiefen Balken und schloss die Augen. Draußen war es still. ` +
        `Und als er die Augen wieder öffnete, war es Morgen, und durch das kleine Fenster sah er den Berg.`;
    }

    const done = phase === 'finale';
    const updatedState: StoryState = {
      ...current,
      part,
      done,
      summary: done ? '' : summary,
      threads: done ? '' : threads,
      hook: done ? '' : hook,
      last: done ? '' : lastSentences(text),
      plan: done ? '' : current.plan,
      wish: done ? '' : current.wish,
      miss: 0,
      at: this.now().getTime(),
    };
    return this.storyResult(text, part, updatedState);
  }

  private synthesizeWav(text: string, kind: string): Buffer {
    const rate = config.audioSampleRate;
    // Generiert ein sanftes akustisches Bestätigungssignal / Glockenklang
    if (kind === 'hinweis') {
      return generateMelodyWav([523.25, 440], [0.3, 0.4], rate); // C5 -> A4 (sanftes Melodie-Signal)
    }
    if (kind === 'geschichte') {
      return generateMelodyWav([440, 554.37, 659.25], [0.25, 0.25, 0.5], rate); // A4 -> C#5 -> E5 (Erzähl-Fanfare)
    }
    return generateToneWav(523.25, 0.6, rate); // C5 Glockenton
  }
}
