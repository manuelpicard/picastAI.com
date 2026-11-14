// Nächsten Geschichtenteil vorbereiten, während das Kind den aktuellen hört.
//
// Warum: Ein Teil braucht Claude (rund 20 bis 30 s) und die Sprachausgabe (bei Pocket auf zwei
// Kernen rund 37 s für 80 s Ton, gemessen am 13.11.2026). Ohne Vorbereitung wartet das Kind nach
// jedem Druck auf die Erzähltaste etwa eine Minute. Mit Vorbereitung ist der nächste Teil meist
// fertig, wenn der aktuelle zu Ende gesprochen ist.
//
// Wie: Nach jedem ausgelieferten Teil einer laufenden Folge startet der Server im Hintergrund den
// nächsten (Sprachmodell und Sprachausgabe). Drückt das Kind die Erzähltaste, nimmt der Server das
// vorbereitete Ergebnis, wenn es zum aktuellen Stand der Folge passt (Folge, Teil, Ausfallzähler).
// Läuft die Vorbereitung noch, wartet er darauf statt neu anzufangen. Hat sich der Stand geändert
// (zum Beispiel durch eine Idee des Kindes über die Sprechtaste), wird das Vorbereitete verworfen.
//
// Datenschutz: Vorbereitet wird nur Text und Ton eines Geschichtenteils, keine Äußerung des Kindes.
// Er liegt nur im Arbeitsspeicher und wird beim Abholen gelöscht. Ein Teil mitten in einer Folge
// gilt 30 Minuten (wer später weiterhört, bekommt einen frischen Teil mit kurzer Erinnerung), ein
// vorbereiteter Folgenanfang 24 Stunden (die nächste Folge kommt oft erst am nächsten Tag).
import type { StoryState, TurnResult } from './brain.js';

export interface PrefetchEntry {
  key: string;
  createdAt: number;
  /** Gültigkeit dieses Eintrags in ms. */
  ttlMs: number;
  promise: Promise<TurnResult | null>;
}

/** Schlüssel für den Stand, auf dem eine Vorbereitung aufbaut. */
export function prefetchKey(state: StoryState): string {
  return `${state.ep}:${state.part}:${state.target}:${state.miss}:${state.done ? 'ende' : 'läuft'}`;
}

export class StoryPrefetcher {
  private readonly entries = new Map<string, PrefetchEntry>();

  constructor(
    /** Erzeugt den nächsten Teil fertig mit Ton; null oder Fehler = nichts vorbereiten. */
    private readonly produce: (state: StoryState) => Promise<TurnResult | null>,
    private readonly options: {
      /** Gültigkeit eines vorbereiteten Teils mitten in einer Folge (danach soll ein neuer Teil z. B. kurz erinnern). */
      ttlMs: number;
      /** Gültigkeit eines vorbereiteten Folgenanfangs (kein laufender Stand; Standard: wie ttlMs). */
      nextEpisodeTtlMs?: number;
      now?: () => number;
      enabled?: boolean;
    } = { ttlMs: 30 * 60 * 1000 }
  ) {}

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  /**
   * Startet die Vorbereitung des Teils nach `state`: in einer laufenden Folge den nächsten Teil,
   * nach dem letzten Teil den Anfang der nächsten Folge (die Erzähltaste beginnt dann eine neue).
   * Ohne bisherige Geschichte (Teil 0) wird nichts vorbereitet.
   */
  start(deviceId: string, state: StoryState): void {
    if (this.options.enabled === false) return;
    if (state.part <= 0) {
      this.entries.delete(deviceId);
      return;
    }
    const key = prefetchKey(state);
    const existing = this.entries.get(deviceId);
    if (existing && existing.key === key && !this.expired(existing)) return;
    const promise = this.produce(state)
      .then((result) => {
        // Eine Pause ("Kunibert muss kurz überlegen") oder ein fester Text taugt nicht als
        // Vorbereitung: Dann soll die echte Anfrage es selbst noch einmal versuchen.
        if (!result || result.fixed || !result.wav || result.wav.length === 0) return null;
        return result;
      })
      .catch(() => null);
    const ttlMs = state.done ? this.options.nextEpisodeTtlMs ?? this.options.ttlMs : this.options.ttlMs;
    this.entries.set(deviceId, { key, createdAt: this.now(), ttlMs, promise });
  }

  /**
   * Holt den vorbereiteten Teil für `state`, wartet dafür höchstens `waitMs`. Gibt null zurück, wenn
   * nichts Passendes da ist; der Eintrag ist danach in jedem Fall weg.
   */
  async take(deviceId: string, state: StoryState, waitMs: number): Promise<TurnResult | null> {
    const entry = this.entries.get(deviceId);
    if (!entry) return null;
    this.entries.delete(deviceId);
    if (entry.key !== prefetchKey(state) || this.expired(entry)) return null;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, waitMs));
    });
    try {
      return await Promise.race([entry.promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Ob für dieses Gerät etwas vorbereitet wird oder bereitliegt. */
  has(deviceId: string): boolean {
    return this.entries.has(deviceId);
  }

  /** Verwirft eine Vorbereitung (zum Beispiel nach einer neuen Folge über die Sprechtaste). */
  cancel(deviceId: string): void {
    this.entries.delete(deviceId);
  }

  /** Für Tests und Statusanzeige. */
  get size(): number {
    return this.entries.size;
  }

  private expired(entry: PrefetchEntry): boolean {
    return this.now() - entry.createdAt > entry.ttlMs;
  }
}
