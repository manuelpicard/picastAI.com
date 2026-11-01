import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceRegistry } from './devices.js';

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
