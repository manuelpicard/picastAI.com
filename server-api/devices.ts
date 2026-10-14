import crypto from 'crypto';

export interface DeviceEntry {
  deviceId: string;
  tokenSha256: string;
  created: number;
  revoked: boolean;
  name?: string;
}

export class DeviceRegistry {
  private devices: Map<string, DeviceEntry> = new Map();

  constructor() {
    // Entwicklungsgeräte bleiben für den Simulator verfügbar. Für den Pi Zero 2 W-
    // Prototyp kann ein eigener Token über Umgebungsvariablen provisioniert
    // werden; echte Tokens stehen nicht im Quellcode.
    if (process.env.NODE_ENV !== 'production') {
      this.addDeviceWithRawToken('prototype-1', 'test-token-kunibert-2026', 'Raspberry Pi Prototyp #1');
    }
    this.addDeviceWithRawToken('simulator-web', 'sim-web-token-xyz-123', 'Web Client Simulator');

    const configuredDeviceId = process.env.PICASTAI_DEVICE_ID || process.env.KUNIBERT_DEVICE_ID;
    const configuredToken = process.env.PICASTAI_DEVICE_TOKEN || process.env.KUNIBERT_DEVICE_TOKEN;
    if (configuredDeviceId && configuredToken) {
      this.addDeviceWithRawToken(
        configuredDeviceId,
        configuredToken,
        process.env.PICASTAI_DEVICE_NAME || 'picastAI Pi Zero 2 W Prototyp'
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
