import type { StoryState } from './brain.js';

/**
 * Vorläufig: Ein Stand der Geschichte verfällt 24 Stunden nach der letzten Nutzung
 * (Maßnahme M9 der Datenschutz-Folgenabschätzung). Danach beginnt die nächste Erzählung
 * eine neue Folge.
 */
export const STORY_STATE_TTL_MS = 24 * 60 * 60 * 1000;

interface Entry {
  state: StoryState;
  lastUsedMs: number;
}

/**
 * Stand der laufenden Kunibert-Geschichte je Gerät, nur im Arbeitsspeicher.
 *
 * - Jeder Eintrag verfällt `ttlMs` nach dem letzten Speichern. Abgelaufene Einträge räumt die
 *   Ablage bei jedem Zugriff auf und zusätzlich über `purge()`, das der Server regelmäßig aufruft.
 *   So bleibt auch der Stand eines Geräts nicht liegen, das sich nie wieder meldet.
 * - `delete()` (zum Beispiel beim Sperren eines Geräts) macht außerdem alle Antworten ungültig,
 *   die zu diesem Zeitpunkt noch im Hintergrund entstehen (Ton-Strom, Vorbereitung): Wer vorher
 *   `generation()` geholt hat, kann danach nichts mehr speichern.
 */
export class StoryStateStore {
  private readonly items = new Map<string, Entry>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly ttlMs: number = STORY_STATE_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  private expired(entry: Entry, nowMs: number): boolean {
    return nowMs - entry.lastUsedMs >= this.ttlMs;
  }

  /** Löscht alle abgelaufenen Einträge und gibt die Geräte zurück, deren Stand verfallen ist. */
  public purge(): string[] {
    const nowMs = this.now();
    const removed: string[] = [];
    for (const [deviceId, entry] of this.items) {
      if (this.expired(entry, nowMs)) {
        this.items.delete(deviceId);
        removed.push(deviceId);
      }
    }
    return removed;
  }

  /** Stand des Geräts oder undefined, wenn keiner da oder er abgelaufen ist. */
  public get(deviceId: string): StoryState | undefined {
    const entry = this.items.get(deviceId);
    if (!entry) return undefined;
    if (this.expired(entry, this.now())) {
      this.items.delete(deviceId);
      return undefined;
    }
    return entry.state;
  }

  /** Zähler, der mit jedem `delete()` des Geräts steigt. */
  public generation(deviceId: string): number {
    return this.generations.get(deviceId) ?? 0;
  }

  /**
   * Speichert den Stand und setzt die Ablaufzeit neu. Mit `generation` nur dann, wenn das Gerät
   * seitdem nicht gelöscht wurde; gibt zurück, ob gespeichert wurde.
   */
  public set(deviceId: string, state: StoryState, generation?: number): boolean {
    if (generation !== undefined && generation !== this.generation(deviceId)) return false;
    this.items.set(deviceId, { state, lastUsedMs: this.now() });
    return true;
  }

  /** Vergisst den Stand eines Geräts; Antworten, die noch entstehen, speichern nichts mehr. */
  public delete(deviceId: string): void {
    this.items.delete(deviceId);
    this.generations.set(deviceId, this.generation(deviceId) + 1);
  }

  /** Anzahl der gültigen Einträge (nur eine Zahl, für /api/status). */
  public get count(): number {
    this.purge();
    return this.items.size;
  }
}
