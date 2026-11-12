import crypto from 'crypto';

export interface DeviceEntry {
  deviceId: string;
  tokenSha256: string;
  created: number;
  revoked: boolean;
  name?: string;
}

/** Dauerhafte Ablage der Geräteliste (z. B. Firestore). Ohne Store bleibt die Registry flüchtig. */
export interface DeviceStore {
  loadAll(): Promise<DeviceEntry[]>;
  save(entry: DeviceEntry): Promise<void>;
  markRevoked(deviceId: string): Promise<void>;
}

export class DeviceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceStoreError';
  }
}

export class DeviceRegistry {
  private devices: Map<string, DeviceEntry> = new Map();

  constructor(private readonly store: DeviceStore | null = null) {
    // Entwicklungsgeräte mit bekannten Tokens gibt es nur außerhalb von
    // Produktion. Für das erste Gerät wird ein eigener Token über
    // Umgebungsvariablen provisioniert; echte Tokens stehen nicht im Quellcode.
    if (process.env.NODE_ENV !== 'production') {
      this.addDeviceWithRawToken('prototype-1', 'test-token-kunibert-2026', 'Raspberry Pi Prototyp #1');
      this.addDeviceWithRawToken('simulator-web', 'sim-web-token-xyz-123', 'Web Client Simulator');
    }

    const configuredDeviceId = process.env.PICASTAI_DEVICE_ID || process.env.KUNIBERT_DEVICE_ID;
    const configuredToken = process.env.PICASTAI_DEVICE_TOKEN || process.env.KUNIBERT_DEVICE_TOKEN;
    if (configuredDeviceId && configuredToken) {
      this.addDeviceWithRawToken(
        configuredDeviceId,
        configuredToken,
        process.env.PICASTAI_DEVICE_NAME || 'picastAI Prototyp'
      );
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  public add(deviceId: string, name?: string): { deviceId: string; token: string } {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(deviceId)) {
      throw new Error('Geräte-ID: nur Buchstaben, Ziffern, - und _ (max. 80 Zeichen)');
    }
    const token = 'tok_' + crypto.randomBytes(24).toString('base64url');
    this.devices.set(deviceId, {
      deviceId,
      tokenSha256: this.hashToken(token),
      created: Math.floor(Date.now() / 1000),
      revoked: false,
      name: name || deviceId,
    });
    return { deviceId, token };
  }

  public addDeviceWithRawToken(deviceId: string, token: string, name?: string): void {
    this.devices.set(deviceId, {
      deviceId,
      tokenSha256: this.hashToken(token),
      created: Math.floor(Date.now() / 1000),
      revoked: false,
      name: name || deviceId,
    });
  }

  public revoke(deviceId: string): boolean {
    const entry = this.devices.get(deviceId);
    if (!entry) return false;
    entry.revoked = true;
    return true;
  }

  /**
   * Lädt persistierte Geräte beim Start. Bereits im Code oder per Umgebung
   * provisionierte Geräte behalten ihren Token; ein gespeicherter Widerruf
   * gilt aber auch für sie (Widerruf ist dauerhaft). Einträge ohne Token-Hash
   * (z. B. reine Widerrufsvermerke) können sich nicht authentifizieren.
   */
  public async loadFromStore(): Promise<number> {
    if (!this.store) return 0;
    const entries = await this.store.loadAll();
    for (const entry of entries) {
      if (!entry.deviceId) continue;
      const existing = this.devices.get(entry.deviceId);
      if (existing) {
        if (entry.revoked) existing.revoked = true;
        continue;
      }
      if (!entry.tokenSha256) continue;
      this.devices.set(entry.deviceId, { ...entry });
    }
    return entries.length;
  }

  /** Neues Gerät anlegen und dauerhaft speichern; bei Speicherfehler wird zurückgerollt. */
  public async register(deviceId: string, name?: string): Promise<{ deviceId: string; token: string }> {
    const previous = this.devices.get(deviceId);
    // Ein Widerruf ist dauerhaft (siehe docs/picastAI-Pi-API.md). Ohne diese Sperre würde ein
    // erneutes Anlegen derselben ID das Gerät still wieder zulassen.
    if (previous?.revoked) {
      throw new Error('Diese Geräte-ID ist widerrufen. Bitte eine neue Geräte-ID verwenden.');
    }
    const created = this.add(deviceId, name);
    if (this.store) {
      try {
        await this.store.save(this.devices.get(deviceId)!);
      } catch (err) {
        if (previous) this.devices.set(deviceId, previous);
        else this.devices.delete(deviceId);
        throw new DeviceStoreError(`Gerät konnte nicht gespeichert werden: ${(err as Error)?.message || 'unbekannt'}`);
      }
    }
    return created;
  }

  /**
   * Gerät widerrufen. Der Widerruf wirkt sofort im Speicher und bleibt auch
   * bestehen, wenn die Ablage nicht erreichbar ist (fail-safe); `persisted`
   * sagt, ob er dauerhaft gespeichert werden konnte.
   */
  public async revokeAndPersist(deviceId: string): Promise<{ success: boolean; persisted: boolean }> {
    const success = this.revoke(deviceId);
    if (!success || !this.store) return { success, persisted: false };
    try {
      await this.store.markRevoked(deviceId);
      return { success, persisted: true };
    } catch (err) {
      console.warn(`Widerruf von ${deviceId} konnte nicht dauerhaft gespeichert werden:`, err);
      return { success, persisted: false };
    }
  }

  public list(): Array<{ deviceId: string; created: number; revoked: boolean; name?: string }> {
    return Array.from(this.devices.values()).map((d) => ({
      deviceId: d.deviceId,
      created: d.created,
      revoked: d.revoked,
      name: d.name,
    }));
  }

  public verify(deviceId: string, token: string): boolean {
    if (!deviceId || !token) return false;
    const entry = this.devices.get(deviceId);
    if (!entry || entry.revoked) return false;

    const expected = entry.tokenSha256;
    const given = this.hashToken(token);
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
    } catch {
      return false;
    }
  }
}

export class RateLimiter {
  private events: Map<string, number[]> = new Map();

  constructor(private maxTurns: number = 30, private windowSeconds: number = 600) {}

  public allow(deviceId: string): boolean {
    const now = Date.now() / 1000;
    let list = this.events.get(deviceId) || [];
    list = list.filter((t) => now - t <= this.windowSeconds);

    if (list.length >= this.maxTurns) {
      this.events.set(deviceId, list);
      return false;
    }
    list.push(now);
    this.events.set(deviceId, list);
    return true;
  }

  public getStatus(deviceId: string): { remaining: number; max: number; windowSeconds: number } {
    const now = Date.now() / 1000;
    const list = (this.events.get(deviceId) || []).filter((t) => now - t <= this.windowSeconds);
    return {
      remaining: Math.max(0, this.maxTurns - list.length),
      max: this.maxTurns,
      windowSeconds: this.windowSeconds,
    };
  }
}

interface StoredAudio {
  deviceId: string;
  wav: Buffer;
  expires: number;
}

export class AudioStore {
  private items: Map<string, StoredAudio> = new Map();

  constructor(private ttlSeconds: number = 120, private maxPerDevice: number = 5) {}

  private purge(): void {
    const now = Date.now() / 1000;
    for (const [key, item] of this.items.entries()) {
      if (item.expires < now) {
        this.items.delete(key);
      }
    }
  }

  public put(deviceId: string, wav: Buffer): string {
    this.purge();
    const turnId = 't_' + crypto.randomBytes(12).toString('base64url');
    const now = Date.now() / 1000;

    // Begrenze Einträge pro Gerät
    const deviceEntries = Array.from(this.items.entries())
      .filter(([_, item]) => item.deviceId === deviceId)
      .sort((a, b) => a[1].expires - b[1].expires);

    while (deviceEntries.length >= this.maxPerDevice) {
      const oldest = deviceEntries.shift();
      if (oldest) this.items.delete(oldest[0]);
    }

    this.items.set(turnId, {
      deviceId,
      wav,
      expires: now + this.ttlSeconds,
    });

    return turnId;
  }

  public take(deviceId: string, turnId: string): Buffer | null {
    this.purge();
    const entry = this.items.get(turnId);
    if (!entry || entry.deviceId !== deviceId) {
      return null;
    }
    // Nach einmaligem Abruf löschen (exakt wie im Python-Server)
    this.items.delete(turnId);
    return entry.wav;
  }

  public peek(deviceId: string, turnId: string): Buffer | null {
    this.purge();
    const entry = this.items.get(turnId);
    if (!entry || entry.deviceId !== deviceId) {
      return null;
    }
    return entry.wav;
  }

  public get count(): number {
    this.purge();
    return this.items.size;
  }
}
