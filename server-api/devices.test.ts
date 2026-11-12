import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceRegistry, DeviceStoreError } from './devices.js';
import type { DeviceEntry, DeviceStore } from './devices.js';

/** In-Memory-Attrappe für die dauerhafte Ablage (Firestore). */
class FakeStore implements DeviceStore {
  entries = new Map<string, DeviceEntry>();
  failing = false;

  private check(): void {
    if (this.failing) throw new Error('Store nicht erreichbar');
  }
  async loadAll(): Promise<DeviceEntry[]> {
    this.check();
    return Array.from(this.entries.values()).map((entry) => ({ ...entry }));
  }
  async save(entry: DeviceEntry): Promise<void> {
    this.check();
    this.entries.set(entry.deviceId, { ...entry });
  }
  async markRevoked(deviceId: string): Promise<void> {
    this.check();
    const existing = this.entries.get(deviceId);
    this.entries.set(deviceId, { ...(existing ?? { deviceId, tokenSha256: '', created: 0 }), deviceId, revoked: true });
  }
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  let result: T;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  // Asynchrone Tests: Umgebung erst zurücksetzen, wenn das Promise erledigt ist.
  if (result instanceof Promise) return result.finally(restore) as T;
  restore();
  return result;
}

const CLEAN = {
  PICASTAI_DEVICE_ID: undefined,
  PICASTAI_DEVICE_TOKEN: undefined,
  KUNIBERT_DEVICE_ID: undefined,
  KUNIBERT_DEVICE_TOKEN: undefined,
};

test('in Produktion gibt es keine Entwicklungsgeräte mit bekannten Tokens', () => {
  withEnv({ ...CLEAN, NODE_ENV: 'production' }, () => {
    const registry = new DeviceRegistry();
    assert.equal(registry.verify('simulator-web', 'sim-web-token-xyz-123'), false);
    assert.equal(registry.verify('prototype-1', 'test-token-kunibert-2026'), false);
    assert.deepEqual(registry.list(), []);
  });
});

test('außerhalb von Produktion stehen die Entwicklungsgeräte bereit', () => {
  withEnv({ ...CLEAN, NODE_ENV: 'development' }, () => {
    const registry = new DeviceRegistry();
    assert.equal(registry.verify('simulator-web', 'sim-web-token-xyz-123'), true);
    assert.equal(registry.verify('prototype-1', 'test-token-kunibert-2026'), true);
  });
});

test('per Umgebung provisioniertes Gerät funktioniert auch in Produktion', () => {
  withEnv({ ...CLEAN, NODE_ENV: 'production', PICASTAI_DEVICE_ID: 'pi-1', PICASTAI_DEVICE_TOKEN: 'geheim-und-lang-genug' }, () => {
    const registry = new DeviceRegistry();
    assert.equal(registry.verify('pi-1', 'geheim-und-lang-genug'), true);
    assert.equal(registry.verify('pi-1', 'falsch'), false);
  });
});

test('widerrufene Geräte werden abgelehnt', () => {
  withEnv({ ...CLEAN, NODE_ENV: 'development' }, () => {
    const registry = new DeviceRegistry();
    const { deviceId, token } = registry.add('neu-1', 'Test');
    assert.equal(registry.verify(deviceId, token), true);
    registry.revoke(deviceId);
    assert.equal(registry.verify(deviceId, token), false);
  });
});

test('Store: neu angelegtes Gerät überlebt einen Neustart (nur der Token-Hash wird gespeichert)', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const first = new DeviceRegistry(store);
    const { deviceId, token } = await first.register('kinderzimmer', 'Kinderzimmer');

    const saved = store.entries.get(deviceId)!;
    assert.notEqual(saved.tokenSha256, '');
    assert.equal(JSON.stringify(saved).includes(token), false);

    const restarted = new DeviceRegistry(store);
    assert.equal(restarted.verify(deviceId, token), false, 'vor dem Laden unbekannt');
    assert.equal(await restarted.loadFromStore(), 1);
    assert.equal(restarted.verify(deviceId, token), true);
    assert.equal(restarted.verify(deviceId, 'falsch'), false);
  });
});

test('Store: Widerruf bleibt nach Neustart bestehen', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const first = new DeviceRegistry(store);
    const { deviceId, token } = await first.register('kinderzimmer');
    assert.deepEqual(await first.revokeAndPersist(deviceId), { success: true, persisted: true });

    const restarted = new DeviceRegistry(store);
    await restarted.loadFromStore();
    assert.equal(restarted.verify(deviceId, token), false);
  });
});

test('Store: Widerruf eines per Umgebung provisionierten Geräts gilt nach Neustart weiter', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production', PICASTAI_DEVICE_ID: 'pi-1', PICASTAI_DEVICE_TOKEN: 'geheim-und-lang-genug' }, async () => {
    const store = new FakeStore();
    const first = new DeviceRegistry(store);
    assert.equal(first.verify('pi-1', 'geheim-und-lang-genug'), true);
    assert.deepEqual(await first.revokeAndPersist('pi-1'), { success: true, persisted: true });

    const restarted = new DeviceRegistry(store);
    assert.equal(restarted.verify('pi-1', 'geheim-und-lang-genug'), true, 'vor dem Laden gilt der Env-Token');
    await restarted.loadFromStore();
    assert.equal(restarted.verify('pi-1', 'geheim-und-lang-genug'), false);
  });
});

test('Store: Einträge ohne Token-Hash können sich nicht authentifizieren', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    store.entries.set('alt', { deviceId: 'alt', tokenSha256: '', created: 1, revoked: false });
    const registry = new DeviceRegistry(store);
    await registry.loadFromStore();
    assert.equal(registry.verify('alt', ''), false);
    assert.equal(registry.verify('alt', 'irgendwas'), false);
    assert.deepEqual(registry.list(), []);
  });
});

test('Store: fällt das Speichern aus, wird das neue Gerät zurückgerollt', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const registry = new DeviceRegistry(store);
    store.failing = true;
    await assert.rejects(() => registry.register('kinderzimmer'), DeviceStoreError);
    assert.deepEqual(registry.list(), []);
  });
});

test('Store: fällt das Speichern bei erneuter Ausstellung aus, bleibt das alte Gerät gültig', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const registry = new DeviceRegistry(store);
    const { token: oldToken } = await registry.register('kinderzimmer');
    store.failing = true;
    await assert.rejects(() => registry.register('kinderzimmer'), DeviceStoreError);
    assert.equal(registry.verify('kinderzimmer', oldToken), true);
  });
});

test('Store: Widerruf wirkt sofort, auch wenn der Store ausfällt (persisted=false)', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const registry = new DeviceRegistry(store);
    const { deviceId, token } = await registry.register('kinderzimmer');
    store.failing = true;
    assert.deepEqual(await registry.revokeAndPersist(deviceId), { success: true, persisted: false });
    assert.equal(registry.verify(deviceId, token), false);
  });
});

test('Store: unbekanntes Gerät widerrufen meldet success=false', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const registry = new DeviceRegistry(new FakeStore());
    assert.deepEqual(await registry.revokeAndPersist('gibt-es-nicht'), { success: false, persisted: false });
  });
});

test('Store: ohne Store bleibt die Registry flüchtig und loadFromStore ist ein No-op', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const registry = new DeviceRegistry();
    const { deviceId, token } = await registry.register('kinderzimmer');
    assert.equal(registry.verify(deviceId, token), true);
    assert.equal(await registry.loadFromStore(), 0);
  });
});

test('Store: Laden schlägt fehl, wenn der Store nicht erreichbar ist (Server startet dann nicht)', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    store.failing = true;
    await assert.rejects(() => new DeviceRegistry(store).loadFromStore(), /nicht erreichbar/);
  });
});

test('Widerruf ist dauerhaft: dieselbe Geräte-ID lässt sich nicht neu anlegen', async () => {
  await withEnv({ ...CLEAN, NODE_ENV: 'production' }, async () => {
    const store = new FakeStore();
    const registry = new DeviceRegistry(store);
    const { deviceId, token } = await registry.register('kinderzimmer');
    await registry.revokeAndPersist(deviceId);
    await assert.rejects(() => registry.register('kinderzimmer'), /widerrufen/);
    assert.equal(registry.verify(deviceId, token), false);
    assert.equal(store.entries.get(deviceId)!.revoked, true, 'der gespeicherte Widerruf bleibt');
    // Eine neue ID geht weiter.
    const fresh = await registry.register('kinderzimmer-2');
    assert.equal(registry.verify(fresh.deviceId, fresh.token), true);
  });
});
