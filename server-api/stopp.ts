// Stopp per Taste (Punkt B2 der Arbeitsliste).
//
// Warum: Hält das Kind Kunibert mitten in einem Geschichtenteil per Taste an, hat es nur den Anfang
// gehört. Bisher wusste der Server das nicht. Eine Idee des Kindes setzte dann am Ende des ganzen
// Teils an, also an einer Stelle, die das Kind nie gehört hat.
//
// Wie: Das Gerät meldet nach dem Stopp die Kennung der Antwort (aus der audio_url) und die Sekunden,
// die es davon gespielt hat (`POST /v1/device/playback-stopped`). Der Server schätzt daraus, bis zu
// welchem Satz das Kind den Teil ganz gehört hat. Die nächste Idee erzählt denselben Teil ab dieser
// Stelle weiter, auf dem Stand vor dem Teil (`StoryResume` in brain.ts). Ohne Meldung bleibt alles
// wie bisher. Die Erzähltaste erzählt nach einem Stopp wie bisher den nächsten Teil.
//
// Datenschutz: Gemerkt wird nur der Text des Geschichtenteils, den der Server selbst erzeugt hat,
// seine Tonlänge und eine Zahl vom Gerät (Sekunden). Keine Äußerung des Kindes, keine Aufnahme.
// Alles liegt nur im Arbeitsspeicher und verfällt wie der Stand der Geschichte nach 24 Stunden.
// Sperren, Widerruf und die Eltern-Routen löschen es mit dem Stand (`forgetDeviceStory` in server.ts).
import type { StoryState } from './brain.js';
import { STORY_STATE_TTL_MS } from './story-states.js';

/** Höchstens so viel gehörter Text geht an Claude (Zeichen). Ein Teil hat meist unter 2500 Zeichen. */
export const MAX_HEARD_CHARS = 4000;

/** Größter Wert, den das Gerät für die gehörten Sekunden melden darf (eine Stunde). */
export const MAX_HEARD_SECONDS = 3600;

/** So lange wartet eine Meldung auf ihren Teil, wenn er noch entsteht (Ton-Strom). */
export const PENDING_STOP_TTL_MS = 10 * 60 * 1000;

/** Kennung einer Antwort: "t_" und 16 Zeichen base64url (AudioStore und StreamRegistry). */
export const TURN_ID_PATTERN = /^t_[A-Za-z0-9_-]{16}$/;

/** Ein Geschichtenteil, wie das Kind ihn hört: Absätze in der Reihenfolge des Tons. */
export interface SpokenPart {
  /** Absätze des Teils; der letzte ist der feste Abschluss („Wenn du wissen willst …“). */
  paragraphs: string[];
  /** Sekunden je Absatz, wenn bekannt (Ton-Strom); sonst null: Dann zählt die Länge des Texts. */
  seconds: number[] | null;
  /** Länge des ganzen Tons in Sekunden. */
  totalSeconds: number;
  /** Stille zwischen zwei Absätzen in Sekunden (Ton-Strom 0,9 s; eine ganze Datei 0). */
  pauseSeconds: number;
}

export interface HeardResult {
  /** Die Sätze des Teils, die das Kind ganz gehört hat ('' = noch keinen). */
  heard: string;
  /** true: Das Kind hat alle Sätze des Teils gehört (Stopp erst im Abschluss oder danach). */
  complete: boolean;
  /** Ganz gehörte Sätze und alle Sätze des Teils (ohne Abschluss); nur Zahlen fürs Protokoll. */
  sentences: number;
  total: number;
}

const PARAGRAPHS = /\n\s*\n+/;
const SENTENCE_SPLIT = /(?<=[.!?…][“”"]?)\s+/;

/** Teilt den Sprechtext eines Teils in die Absätze, die die Sprachausgabe nacheinander spricht. */
export function speechParagraphs(speech: string): string[] {
  return String(speech || '').split(PARAGRAPHS).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/**
 * Bis zu welchem Satz hat das Kind den Teil gehört, wenn es nach `heardSeconds` angehalten hat?
 * Ein Satz zählt nur, wenn er ganz vorbei war. Die Zeit eines Satzes wird geschätzt: Mit Ton-Strom
 * sind die Sekunden je Absatz bekannt, innerhalb eines Absatzes zählt die Länge des Texts. Ohne
 * Ton-Strom verteilt sich die ganze Tonlänge nach der Länge des Texts auf die Absätze.
 */
export function heardUpTo(part: SpokenPart, heardSeconds: number): HeardResult {
  const paragraphs = part.paragraphs;
  const story = paragraphs.slice(0, -1);
  const spans: Array<[number, number]> = [];
  if (part.seconds && part.seconds.length === paragraphs.length) {
    let time = 0;
    part.seconds.forEach((seconds, index) => {
      const start = time + (index > 0 ? part.pauseSeconds : 0);
      time = start + Math.max(0, seconds);
      spans.push([start, time]);
    });
  } else {
    const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) || 1;
    let time = 0;
    for (const paragraph of paragraphs) {
      const start = time;
      time = start + (Math.max(0, part.totalSeconds) * paragraph.length) / totalChars;
      spans.push([start, time]);
    }
  }
  const heard: string[] = [];
  let total = 0;
  let stopped = false;
  story.forEach((paragraph, index) => {
    const [start, end] = spans[index];
    const chars = paragraph.length || 1;
    let position = 0;
    for (const sentence of paragraph.split(SENTENCE_SPLIT).filter(Boolean)) {
      total++;
      const found = paragraph.indexOf(sentence, position);
      position = (found >= 0 ? found : position) + sentence.length;
      const sentenceEnd = start + ((end - start) * position) / chars;
      if (!stopped && sentenceEnd <= heardSeconds) heard.push(sentence);
      else stopped = true;
    }
  });
  return { heard: heard.join(' '), complete: !stopped, sentences: heard.length, total };
}

/** Hängt neu Gehörtes an den schon gehörten Anfang eines Teils an (höchstens MAX_HEARD_CHARS, vom Ende her). */
export function joinHeard(prefix: string, heard: string): string {
  const joined = [prefix, heard].map((text) => text.trim()).filter(Boolean).join(' ');
  return joined.length <= MAX_HEARD_CHARS ? joined : joined.slice(joined.length - MAX_HEARD_CHARS);
}

/** Grundlage eines erzählten Teils (TurnResult.basis in brain.ts). */
export interface PartBasis {
  /** Stand der Geschichte vor diesem Teil. */
  before: StoryState;
  /** Anfang des Teils, den das Kind schon vorher gehört hatte (Teil nach einem Stopp neu erzählt), sonst ''. */
  heard: string;
}

/** Was eine Idee nach einem Stopp braucht (StoryResume in brain.ts). */
export interface StopResume {
  before: StoryState;
  heard: string;
}

/** Ergebnis einer Meldung, nur fürs Protokoll (keine Texte, keine Kennungen). */
export type StopOutcome =
  | { outcome: 'gemerkt'; part: number; target: number; sentences: number; total: number }
  | { outcome: 'ganz_gehoert'; part: number; target: number }
  | { outcome: 'wartet' };

interface DeliveredPart {
  turnId: string;
  ep: number;
  part: number;
  target: number;
  basis: PartBasis;
  spoken: SpokenPart;
  /** Gehörter Text nach einer Meldung; null, solange keine kam oder das Kind alles gehört hat. */
  heard: string | null;
  deliveredMs: number;
}

/**
 * Letzter Geschichtenteil je Gerät und, nach einer Meldung, die gehörte Stelle. Nur Arbeitsspeicher.
 * Je Gerät höchstens ein Teil und eine wartende Meldung.
 */
export class StopPoints {
  private readonly parts = new Map<string, DeliveredPart>();
  private readonly pending = new Map<string, { turnId: string; seconds: number; atMs: number }>();

  constructor(
    private readonly ttlMs: number = STORY_STATE_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Ein Geschichtenteil ist beim Gerät angekommen (ganze Datei) oder fertig gesprochen (Ton-Strom).
   * Er ersetzt den vorigen Teil samt dessen gehörter Stelle. Wartet eine Meldung genau für diesen
   * Teil (Ton-Strom: das Kind hielt an, bevor der Server fertig war), gilt sie jetzt.
   */
  delivered(deviceId: string, turnId: string, state: StoryState, basis: PartBasis, spoken: SpokenPart): StopOutcome | null {
    this.parts.set(deviceId, {
      turnId,
      ep: state.ep,
      part: state.part,
      target: state.target,
      basis,
      spoken,
      heard: null,
      deliveredMs: this.now(),
    });
    const waiting = this.pending.get(deviceId);
    this.pending.delete(deviceId);
    if (!waiting || waiting.turnId !== turnId || this.now() - waiting.atMs > PENDING_STOP_TTL_MS) return null;
    return this.stopped(deviceId, turnId, waiting.seconds);
  }

  /**
   * Das Gerät meldet: Es hat die Antwort `turnId` nach `seconds` Sekunden angehalten. Gehört sie zum
   * letzten Geschichtenteil, merkt sich der Server die Stelle. Sonst wartet die Meldung kurz: Mit
   * Ton-Strom entsteht der Teil vielleicht noch. Meldungen zu Antworten auf Fragen verfallen so.
   */
  stopped(deviceId: string, turnId: string, seconds: number): StopOutcome {
    const part = this.parts.get(deviceId);
    if (!part || part.turnId !== turnId || this.expired(part)) {
      this.pending.set(deviceId, { turnId, seconds, atMs: this.now() });
      return { outcome: 'wartet' };
    }
    const result = heardUpTo(part.spoken, seconds);
    if (result.complete) {
      part.heard = null;
      return { outcome: 'ganz_gehoert', part: part.part, target: part.target };
    }
    part.heard = joinHeard(part.basis.heard, result.heard);
    return { outcome: 'gemerkt', part: part.part, target: part.target, sentences: result.sentences, total: result.total };
  }

  /**
   * Die gehörte Stelle für eine Idee, oder undefined. Nur, wenn das Gerät noch genau bei dem
   * angehaltenen Teil steht und die Folge läuft (nicht nach dem letzten Teil einer Folge).
   */
  resumeFor(deviceId: string, state: StoryState | undefined): StopResume | undefined {
    const part = this.parts.get(deviceId);
    if (!part || part.heard === null || !state || this.expired(part)) return undefined;
    if (state.ep !== part.ep || state.part !== part.part || state.part < 1 || state.done) return undefined;
    return { before: part.basis.before, heard: part.heard };
  }

  /** Vergisst alles zum Gerät (Sperren, Widerruf, Eltern, neue Geschichte). */
  delete(deviceId: string): void {
    this.parts.delete(deviceId);
    this.pending.delete(deviceId);
  }

  /** Löscht Abgelaufenes, auch bei Geräten, die sich nicht mehr melden. */
  purge(): void {
    const nowMs = this.now();
    for (const [deviceId, part] of this.parts) if (this.expired(part)) this.parts.delete(deviceId);
    for (const [deviceId, waiting] of this.pending) if (nowMs - waiting.atMs > PENDING_STOP_TTL_MS) this.pending.delete(deviceId);
  }

  /** Anzahl der gemerkten Teile (nur eine Zahl, für /api/status). */
  get count(): number {
    this.purge();
    return this.parts.size;
  }

  private expired(part: DeliveredPart): boolean {
    return this.now() - part.deliveredMs >= this.ttlMs;
  }
}
