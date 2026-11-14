// Zeitmessung je Stufe einer Anfrage. Ausgegeben werden ausschließlich Zahlen und feste
// Schlüsselwörter: nie Transkripte, Antworttexte, Geräte-IDs oder Tokens.
import { randomBytes } from 'node:crypto';
import { decodeWavHeader } from './audio.js';
import { addUsage, formatUsd, ZERO_USAGE, type LlmUsage } from './costs.js';

/** Die gemessenen Stufen einer Anfrage, in der Reihenfolge, in der sie ablaufen. */
// vorbereitet: Wartezeit auf einen im Hintergrund vorbereiteten Geschichtenteil (server-api/prefetch.ts).
export const TIMED_STAGES = ['erkennung', 'weiche', 'sprachmodell', 'ausgabecheck', 'sprachausgabe', 'vorbereitet'] as const;
export type TimedStage = (typeof TIMED_STAGES)[number];

/**
 * Gemeinsames Zeitbudget für eine ganze Anfrage (Erkennung, Sprachmodell-Aufrufe, Sprachausgabe
 * zusammen). Es liegt unter der Caddy-Grenze (130 s) und der Geräte-Grenze (140 s), siehe
 * docs/picastAI-Pi-API.md und deploy/EINRICHTUNG.md.
 */
export const TURN_BUDGET_MS = 120_000;
/** Zeit, die ein Sprachmodell-Aufruf für die Sprachausgabe übrig lassen muss. */
export const TTS_RESERVE_MS = 15_000;
/** Weniger Zeit als das lohnt für einen Sprachmodell-Aufruf nicht; dann greift der feste Fallback-Text. */
export const MIN_LLM_MS = 3_000;
/** So viel Zeit bekommt die Sprachausgabe mindestens, auch wenn das Budget schon aufgebraucht ist. */
export const MIN_TTS_MS = 5_000;

/** Das, was die Pipeline zum Messen braucht. Brain bekommt nur diese Schnittstelle zu sehen. */
export interface StageTimer {
  time<T>(stage: TimedStage, fn: () => Promise<T>): Promise<T>;
  timeSync<T>(stage: TimedStage, fn: () => T): T;
  /** Verbleibende Zeit im Zeitbudget der Anfrage in Millisekunden (kann 0 sein; ohne Budget unendlich). */
  remainingMs(): number;
  /** Token-Zahlen und Kosten (US-Dollar, null = Preis unbekannt) eines Sprachmodell-Aufrufs. */
  noteLlm?(usage: LlmUsage, usd: number | null): void;
}

/** Misst nichts und kennt kein Budget. Standard für Aufrufer ohne Zeitmessung (Tests, eval-llm). */
export const NO_TIMER: StageTimer = {
  time: (_stage, fn) => fn(),
  timeSync: (_stage, fn) => fn(),
  remainingMs: () => Number.POSITIVE_INFINITY,
};

/** Zeit in ms für einen Aufruf, oder undefined, wenn es kein Budget gibt (dann gilt nur die eigene Grenze des Aufrufs). */
export function budgetTimeoutMs(timer: StageTimer, reserveMs = 0): number | undefined {
  const left = timer.remainingMs() - reserveMs;
  return Number.isFinite(left) ? Math.max(0, Math.floor(left)) : undefined;
}

/** Länge einer WAV-Datei in Sekunden; null, wenn es keine auswertbare WAV-Datei ist. */
export function wavSeconds(wav: Buffer | null | undefined): number | null {
  if (!wav || wav.length === 0) return null;
  try {
    const { duration } = decodeWavHeader(wav);
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  } catch {
    return null;
  }
}

/**
 * Zeitmessung für genau eine Anfrage. Dieselbe Stufe darf mehrmals laufen (zum Beispiel zwei
 * Sprachmodell-Aufrufe, wenn eine Frage als Geschichtenwunsch erkannt wird); die Zeiten werden
 * addiert. Eine Stufe, die nicht lief, steht in der Zeile als "-" und nicht als 0.
 */
export class TurnTimer implements StageTimer {
  /** Zufällige Anfrage-ID; hat nichts mit Gerät, Token oder Inhalt zu tun. */
  readonly id: string;
  /** Modus der Anfrage (frage, geschichte, weiter); "-" solange er nicht feststeht. */
  mode = '-';
  private audioSeconds: number | null = null;
  private usage: LlmUsage | null = null;
  private usd: number | null = null;
  private readonly startedAt: number;
  private readonly durations = new Map<TimedStage, number>();
  private readonly calls = new Map<TimedStage, number>();

  constructor(
    private readonly now: () => number = () => performance.now(),
    id: string = randomBytes(4).toString('hex'),
    private readonly budgetMs: number = TURN_BUDGET_MS
  ) {
    this.id = id;
    this.startedAt = now();
  }

  remainingMs(): number {
    return Math.max(0, this.budgetMs - (this.now() - this.startedAt));
  }

  async time<T>(stage: TimedStage, fn: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await fn();
    } finally {
      this.add(stage, this.now() - started);
    }
  }

  timeSync<T>(stage: TimedStage, fn: () => T): T {
    const started = this.now();
    try {
      return fn();
    } finally {
      this.add(stage, this.now() - started);
    }
  }

  /** Merkt sich die Länge des Antwort-Audios; der Inhalt wird nicht aufbewahrt. */
  noteAudio(wav: Buffer | null | undefined): void {
    this.audioSeconds = wavSeconds(wav);
  }

  /** Summiert Token und Kosten aller Sprachmodell-Aufrufe dieser Anfrage (nur Zahlen). */
  noteLlm(usage: LlmUsage, usd: number | null): void {
    this.usage = addUsage(this.usage ?? ZERO_USAGE, usage);
    if (usd !== null) this.usd = (this.usd ?? 0) + usd;
  }

  /** Ob mindestens eine Stufe gelaufen ist. Abgewiesene Anfragen (401, 429, 400) sollen keine Zeile erzeugen. */
  get measured(): boolean {
    return this.durations.size > 0;
  }

  /**
   * Die Logzeile, zum Beispiel:
   * Zeitmessung id=3f9a1c2b modus=frage status=200 erkennung_ms=1204 weiche_ms=0 sprachmodell_ms=3480
   * ausgabecheck_ms=0 sprachausgabe_ms=2210 gesamt_ms=7050 sprachmodell_aufrufe=1 audio_s=12.4
   * Gibt null zurück, wenn keine Stufe gemessen wurde.
   */
  logLine(status: number | 'abgebrochen'): string | null {
    if (!this.measured) return null;
    const parts = [`Zeitmessung id=${this.id}`, `modus=${this.mode}`, `status=${status}`];
    for (const stage of TIMED_STAGES) {
      const duration = this.durations.get(stage);
      parts.push(`${stage}_ms=${duration === undefined ? '-' : Math.round(duration)}`);
    }
    parts.push(`gesamt_ms=${Math.round(this.now() - this.startedAt)}`);
    parts.push(`sprachmodell_aufrufe=${this.calls.get('sprachmodell') ?? 0}`);
    parts.push(`audio_s=${this.audioSeconds === null ? '-' : this.audioSeconds.toFixed(1)}`);
    if (this.usage) {
      parts.push(`tokens_ein=${this.usage.input}`, `tokens_aus=${this.usage.output}`);
      parts.push(`cache_lesen=${this.usage.cacheRead}`, `cache_schreiben=${this.usage.cacheWrite}`);
      parts.push(`kosten_usd=${this.usd === null ? '-' : formatUsd(this.usd)}`);
    }
    return parts.join(' ');
  }

  private add(stage: TimedStage, duration: number): void {
    this.durations.set(stage, (this.durations.get(stage) ?? 0) + Math.max(0, duration));
    this.calls.set(stage, (this.calls.get(stage) ?? 0) + 1);
  }
}
