// Stopp per Taste (Punkt B2 der Arbeitsliste).
//
// Warum: Hält das Kind Kunibert mitten in einem Geschichtenteil per Taste an, hat es nur den Anfang
// gehört. Bisher wusste der Server das nicht. Eine Idee des Kindes setzte dann am Ende des ganzen
// Teils an, also an einer Stelle, die das Kind nie gehört hat.
//
// Wie: Das Gerät meldet nach dem Stopp die Kennung der Antwort (aus der audio_url) und die Sekunden,
// die es davon gespielt hat (`POST /v1/device/playback-stopped`). Der Server schätzt daraus, bis zu
// welchem Satz das Kind den Teil ganz gehört hat. Danach setzt die Geschichte dort an: Eine Idee,
// „weiter“ über die Sprechtaste und die Erzähltaste erzählen denselben Teil ab dieser Stelle weiter,
// auf dem Stand vor dem Teil (`StoryResume` in brain.ts). Ohne Meldung bleibt alles wie bisher.
//
// Datenschutz: Gemerkt werden der Text des letzten Geschichtenteils (vom Server erzeugt), seine
// Tonlänge und der Stand der Geschichte vor diesem Teil. Der Stand enthält wie immer den Wunsch des
// Kindes zur Folge (`wish`, höchstens 200 Zeichen). Neu hinzu kommt nur eine Zahl vom Gerät (Sekunden).
// Den Text des Teils hält der Server 15 Minuten bereit (`PART_HOLD_MS`), so lange kann eine Meldung
// kommen. Kam keine, ist danach alles weg. Kam eine, bleiben nur die gehörten Sätze und der Stand davor,
// bis die Geschichte weitergeht, längstens 24 Stunden. Abgelaufenes löscht das Aufräumen alle fünf
// Minuten (`purgeExpired`), also spätestens fünf Minuten nach der Frist. Nach dem letzten Teil einer
// Folge merkt sich der Server nichts. Alles liegt nur im Arbeitsspeicher; Sperren, Widerruf und die Eltern-Routen
// löschen es mit dem Stand (`forgetDeviceStory` in server.ts).
import type { StoryState } from './brain.js';
import { STORY_STATE_TTL_MS } from './story-states.js';

/** Höchstens so viel gehörter Text geht an Claude (Zeichen). Ein Teil hat meist unter 2500 Zeichen. */
export const MAX_HEARD_CHARS = 4000;

/** Größter Wert, den das Gerät für die gehörten Sekunden melden darf (eine Stunde). */
export const MAX_HEARD_SECONDS = 3600;

/** So lange wartet eine Meldung auf ihren Teil, wenn er noch entsteht (Ton-Strom). */
export const PENDING_STOP_TTL_MS = 10 * 60 * 1000;

/** So lange nach dem Ausliefern hält der Server den Text eines Teils für eine Meldung bereit. */
export const PART_HOLD_MS = 15 * 60 * 1000;

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
/** Satzgrenzen wie bei der Pocket-Stimme (`splitSentences` in pocket-speech.ts): nur vor einem neuen Satzanfang. */
const SENTENCE_SPLIT = /(?<=[.!?…][“”"»«)]?)\s+(?=[„“"»«(]?[A-ZÄÖÜ0-9])/;

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

/**
 * Sekunden je Absatz eines Ton-Stroms, dessen Vertonung nach einem Stopp endete (N1126-1338-f): für die
 * vertonten Absätze die echten Sekunden, für die übrigen eine Schätzung nach der Länge des Texts (im Tempo
 * der vertonten Absätze). Die übrigen hat das Kind nie gehört; sie liegen hinter der gemeldeten Stelle,
 * die Schätzung ändert also nur, dass der Teil nicht „ganz gehört“ ist. null, wenn mehr Sekunden als
 * Absätze da sind (dann passt etwas nicht zusammen, und es zählt wie sonst die Länge des Texts).
 */
export function withEstimatedRest(seconds: number[], paragraphs: string[]): number[] | null {
  if (seconds.length > paragraphs.length) return null;
  const voicedChars = paragraphs.slice(0, seconds.length).reduce((sum, paragraph) => sum + paragraph.length, 0);
  const voicedSeconds = seconds.reduce((sum, value) => sum + Math.max(0, value), 0);
  const perChar = voicedChars > 0 && voicedSeconds > 0 ? voicedSeconds / voicedChars : 0.06;
  return [...seconds, ...paragraphs.slice(seconds.length).map((paragraph) => Math.max(0.1, paragraph.length * perChar))];
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

/** Was ein Teil nach einem Stopp braucht (StoryResume in brain.ts). */
export interface StopResume extends PartBasis {
  /** Zeitpunkt der Meldung (ms seit 1970): Danach richtet sich die Erinnerung nach langer Pause. */
  at: number;
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
  /** Text und Tonlänge des Teils; null nach PART_HOLD_MS (danach kann keine Meldung mehr gelten). */
  spoken: SpokenPart | null;
  /** Gehörter Text nach einer Meldung; null, solange keine kam oder das Kind alles gehört hat. */
  heard: string | null;
  deliveredMs: number;
  /** Zeitpunkt der letzten Meldung (oder Fortschreibung) für diesen Teil. */
  stoppedMs: number;
  /**
   * true: `spoken` ist nur der Anfang eines neu erzählten Teils, dessen Ton-Strom abbrach (`appendHeard`),
   * und `basis.heard` die Stelle davor. Eine Meldung zu diesem Strom kürzt die Stelle auf das Gehörte.
   * „Alles gehört“ heißt hier nur: alles Gesprochene. Der Teil selbst ist dann noch nicht zu Ende.
   */
  broken: boolean;
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
    // Nach dem letzten Teil einer Folge gibt es an dieser Stelle nichts weiterzuerzählen: nichts merken.
    if (state.done || state.part < 1) {
      this.delete(deviceId);
      return null;
    }
    this.parts.set(deviceId, {
      turnId,
      ep: state.ep,
      part: state.part,
      target: state.target,
      basis,
      spoken,
      heard: null,
      deliveredMs: this.now(),
      stoppedMs: 0,
      broken: false,
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
    const part = this.current(deviceId);
    if (!part || part.turnId !== turnId || !part.spoken) {
      this.pending.set(deviceId, { turnId, seconds, atMs: this.now() });
      return { outcome: 'wartet' };
    }
    const result = heardUpTo(part.spoken, seconds);
    if (result.complete && !part.broken) {
      part.heard = null;
      return { outcome: 'ganz_gehoert', part: part.part, target: part.target };
    }
    part.heard = joinHeard(part.basis.heard, result.heard);
    part.stoppedMs = this.now();
    return { outcome: 'gemerkt', part: part.part, target: part.target, sentences: result.sentences, total: result.total };
  }

  /**
   * Ein Teil, der nach einem Stopp neu erzählt wurde, brach mitten im Ton-Strom `turnId` ab (Ausgabe-Check,
   * Claude oder Sprachausgabe). Das Kind hört dann auch dessen gesprochene Absätze (`spoken`, ohne feste
   * Sätze; der letzte Absatz zählt wie sonst als Abschluss und nicht mit): Sie kommen zur gemerkten Stelle
   * dazu. Hat das Kind auch diesen Strom angehalten und es schon gemeldet, nur bis dahin. Sonst kann die
   * Meldung noch kommen: Der Server ist schneller als die Wiedergabe, das Gerät spielt den Strom oft noch.
   * Deshalb gilt ab jetzt dieser Strom als der Teil, zu dem eine Meldung gehört (`broken`); eine Meldung
   * zum ursprünglichen Teil zählt nicht mehr (sein Text ist weg).
   */
  appendHeard(deviceId: string, turnId: string, spoken: SpokenPart): void {
    const part = this.current(deviceId);
    const waiting = this.pending.get(deviceId);
    const stoppedThere = waiting !== undefined && waiting.turnId === turnId && this.now() - waiting.atMs <= PENDING_STOP_TTL_MS;
    if (stoppedThere) this.pending.delete(deviceId);
    if (!part || part.heard === null) return;
    const heardBefore = part.heard;
    part.turnId = turnId;
    part.basis = { before: part.basis.before, heard: heardBefore };
    part.spoken = spoken;
    part.broken = true;
    part.deliveredMs = this.now();
    part.heard = joinHeard(heardBefore, heardUpTo(spoken, stoppedThere ? waiting.seconds : Number.POSITIVE_INFINITY).heard);
    part.stoppedMs = this.now();
  }

  /**
   * Die gehörte Stelle für eine Idee, oder undefined. Nur, wenn das Gerät noch genau bei dem
   * angehaltenen Teil steht und die Folge läuft (nicht nach dem letzten Teil einer Folge).
   */
  resumeFor(deviceId: string, state: StoryState | undefined): StopResume | undefined {
    const part = this.current(deviceId);
    if (!part || part.heard === null || !state) return undefined;
    if (state.ep !== part.ep || state.part !== part.part || state.part < 1 || state.done) return undefined;
    return { before: part.basis.before, heard: part.heard, at: part.stoppedMs };
  }

  /** Vergisst alles zum Gerät (Sperren, Widerruf, Eltern, neue Geschichte). */
  delete(deviceId: string): void {
    this.parts.delete(deviceId);
    this.pending.delete(deviceId);
  }

  /** Löscht Abgelaufenes, auch bei Geräten, die sich nicht mehr melden. */
  purge(): void {
    const nowMs = this.now();
    for (const deviceId of [...this.parts.keys()]) this.current(deviceId);
    for (const [deviceId, waiting] of this.pending) if (nowMs - waiting.atMs > PENDING_STOP_TTL_MS) this.pending.delete(deviceId);
  }

  /**
   * Der Eintrag des Geräts nach dem Aufräumen: Der Text des Teils fällt nach PART_HOLD_MS weg; ohne
   * Meldung ist dann der ganze Eintrag weg. Eine gemerkte Stelle hält höchstens `ttlMs` nach der Meldung.
   */
  private current(deviceId: string): DeliveredPart | undefined {
    const part = this.parts.get(deviceId);
    if (!part) return undefined;
    const nowMs = this.now();
    if (part.spoken && nowMs - part.deliveredMs > PART_HOLD_MS) part.spoken = null;
    const gone = part.heard === null ? !part.spoken : nowMs - part.stoppedMs >= this.ttlMs;
    if (gone) {
      this.parts.delete(deviceId);
      return undefined;
    }
    return part;
  }

  /** Anzahl der gemerkten Teile und Stellen (nur eine Zahl, für /api/status). */
  get count(): number {
    this.purge();
    return this.parts.size;
  }
}
