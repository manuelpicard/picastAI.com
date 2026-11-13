import type { StoryState } from './brain.js';

/** Vorläufig: Ein Geschichten-Stand verfällt nach 24 Stunden ohne Nutzung (Maßnahme M9). */
export const STORY_STATE_TTL_SECONDS = 24 * 60 * 60;

interface Entry {
  state: StoryState;
  lastUsedMs: number;
}

/**
 * Stand der laufenden Kunibert-Geschichte je Gerät, nur im Arbeitsspeicher.
 *
 * Jeder Eintrag verfällt nach `ttlSeconds` ohne Nutzung. Abgelaufene Einträge
 * räumt die Ablage bei jedem Zugriff auf und zusätzlich über `purge()`, das der
 * Server regelmäßig aufruft. So bleibt auch der Stand eines Geräts nicht liegen,
 * das sich nie wieder meldet.
 */
export class StoryStateStore {
  private items = new Map<string, Entry>();

  constructor(
    private ttlSeconds: number = STORY_STATE_TTL_SECONDS,
    private now: () => number = Date.now
  ) {}

  private expired(entry: Entry, nowMs: number): boolean {
    return nowMs - entry.lastUsedMs >= this.ttlSeconds * 1000;
  }

  /** Löscht alle abgelaufenen Einträge und gibt zurück, wie viele es waren. */
  public purge(): number {
    const nowMs = this.now();
    let removed = 0;
    for (const [deviceId, entry] of this.items.entries()) {
      if (this.expired(entry, nowMs)) {
        this.items.delete(deviceId);
        removed++;
      }
    }
    return removed;
  }

  /** Liefert den Stand des Geräts oder einen leeren Stand, wenn keiner da oder er abgelaufen ist. */
  public get(deviceId: string): Partial<StoryState> {
    this.purge();
    return this.items.get(deviceId)?.state ?? {};
  }

  /** Speichert den Stand und setzt die Ablaufzeit neu. */
  public set(deviceId: string, state: StoryState): void {
    this.purge();
    this.items.set(deviceId, { state, lastUsedMs: this.now() });
  }

  /** Vergisst den Stand eines Geräts (zum Beispiel beim Sperren). */
  public delete(deviceId: string): boolean {
    return this.items.delete(deviceId);
  }

  public get count(): number {
    this.purge();
    return this.items.size;
  }
}
