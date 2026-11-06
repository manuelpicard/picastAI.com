// Zeitmessung je Stufe einer Anfrage. Ausgegeben werden ausschließlich Zahlen und feste
// Schlüsselwörter: nie Transkripte, Antworttexte, Geräte-IDs oder Tokens.
import { randomBytes } from 'node:crypto';
import { decodeWavHeader } from './audio.js';

/** Die gemessenen Stufen einer Anfrage, in der Reihenfolge, in der sie ablaufen. */
export const TIMED_STAGES = ['erkennung', 'weiche', 'sprachmodell', 'ausgabecheck', 'sprachausgabe'] as const;
export type TimedStage = (typeof TIMED_STAGES)[number];

/** Das, was die Pipeline zum Messen braucht. Brain bekommt nur diese Schnittstelle zu sehen. */
export interface StageTimer {
  time<T>(stage: TimedStage, fn: () => Promise<T>): Promise<T>;
  timeSync<T>(stage: TimedStage, fn: () => T): T;
}

/** Misst nichts. Standard für Aufrufer ohne Zeitmessung (Tests, eval-llm). */
export const NO_TIMER: StageTimer = {
  time: (_stage, fn) => fn(),
  timeSync: (_stage, fn) => fn(),
};

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
  private readonly startedAt: number;
  private readonly durations = new Map<TimedStage, number>();
  private readonly calls = new Map<TimedStage, number>();

  constructor(private readonly now: () => number = () => performance.now(), id: string = randomBytes(4).toString('hex')) {
    this.id = id;
    this.startedAt = now();
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
    return parts.join(' ');
  }

  private add(stage: TimedStage, duration: number): void {
    this.durations.set(stage, (this.durations.get(stage) ?? 0) + Math.max(0, duration));
    this.calls.set(stage, (this.calls.get(stage) ?? 0) + 1);
  }
}
