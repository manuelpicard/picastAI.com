import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PARENT_TOKENS_PER_DEVICE,
  PAIRING_CODE_TTL_SECONDS,
  ParentControls,
  hashToken,
  inQuietHours,
  isValidTime,
  localMinutes,
  pairingCodeSpeech,
} from './eltern.js';

function clock(start = Date.UTC(2026, 10, 13, 12, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('Kopplungscode hat sechs Ziffern und gilt nur einmal', () => {
  const p = new ParentControls();
  const { code, expiresInSeconds } = p.createPairingCode('g1');
  assert.match(code, /^\d{6}$/);
  assert.equal(expiresInSeconds, PAIRING_CODE_TTL_SECONDS);
  const first = p.redeemPairingCode(code);
  assert.ok(first);
  assert.equal(first.deviceId, 'g1');
  assert.equal(p.redeemPairingCode(code), null);
});

test('Kopplungscode verfällt nach 10 Minuten', () => {
  const c = clock();
  const p = new ParentControls(c.now);
  const { code } = p.createPairingCode('g1');
  c.advance(PAIRING_CODE_TTL_SECONDS * 1000);
  assert.equal(p.redeemPairingCode(code), null);
});

test('neuer Code macht den alten Code desselben Geräts ungültig', () => {
  const p = new ParentControls();
  const old = p.createPairingCode('g1').code;
  const fresh = p.createPairingCode('g1').code;
  if (old !== fresh) assert.equal(p.redeemPairingCode(old), null);
  assert.ok(p.redeemPairingCode(fresh));
});

test('falsche oder kaputte Codes werden abgelehnt', () => {
  const p = new ParentControls();
  for (const bad of [undefined, null, 123456, '', '12345', '1234567', 'abcdef', ' 12345']) {
    assert.equal(p.redeemPairingCode(bad), null);
  }
});

test('Eltern-Token: nur der Hash wird gespeichert, das Token findet sein Gerät', () => {
  const p = new ParentControls();
  const { code } = p.createPairingCode('g1');
  const redeemed = p.redeemPairingCode(code);
  assert.ok(redeemed);
  assert.equal(p.deviceForToken(redeemed.token), 'g1');
  assert.equal(p.deviceForToken('x'.repeat(43)), null);
  assert.equal(p.deviceForToken(undefined), null);
  // Die interne Ablage kennt das Token nicht im Klartext.
  const internals = JSON.stringify(Array.from((p as unknown as { tokens: Map<string, unknown> }).tokens.keys()));
  assert.ok(!internals.includes(redeemed.token));
  assert.ok(internals.includes(hashToken(redeemed.token)));
});

test('höchstens fünf Eltern-Tokens je Gerät, das älteste fällt heraus', () => {
  const c = clock();
  const p = new ParentControls(c.now);
  const tokens: string[] = [];
  for (let i = 0; i < MAX_PARENT_TOKENS_PER_DEVICE + 1; i++) {
    c.advance(1000);
    const r = p.redeemPairingCode(p.createPairingCode('g1').code);
    assert.ok(r);
    tokens.push(r.token);
  }
  assert.equal(p.deviceForToken(tokens[0]), null);
  assert.equal(p.deviceForToken(tokens[tokens.length - 1]), 'g1');
});

test('Einwilligung: ohne Einwilligung gesperrt, erteilen und widerrufen', () => {
  const c = clock();
  const p = new ParentControls(c.now);
  assert.equal(p.blockReason('g1', true), 'einwilligung');
  assert.equal(p.blockReason('g1', false), null);
  p.grantConsent('g1');
  assert.equal(p.blockReason('g1', true), null);
  assert.equal(p.settings('g1').einwilligung.erteilt, true);
  assert.equal(p.settings('g1').einwilligung.zeitpunkt, new Date(c.now()).toISOString());
  p.revokeConsent('g1');
  assert.equal(p.blockReason('g1', true), 'einwilligung');
  assert.deepEqual(p.settings('g1').einwilligung, { erteilt: false, zeitpunkt: null });
});

test('Schlafmodus sperrt, fehlende Einwilligung geht vor', () => {
  const p = new ParentControls();
  p.setSleep('g1', true);
  assert.equal(p.blockReason('g1', true), 'einwilligung');
  p.grantConsent('g1');
  assert.equal(p.blockReason('g1', true), 'schlaf');
  p.setSleep('g1', false);
  assert.equal(p.blockReason('g1', true), null);
});

test('Uhrzeiten werden geprüft', () => {
  for (const ok of ['00:00', '07:30', '19:05', '23:59']) assert.ok(isValidTime(ok), ok);
  for (const bad of ['24:00', '7:30', '07:60', '0730', '', null, 730]) assert.ok(!isValidTime(bad), String(bad));
  const p = new ParentControls();
  assert.throws(() => p.setQuietHours('g1', { von: '25:00', bis: '07:00' }));
});

test('Ruhezeiten in Berliner Zeit, auch über Mitternacht und bei Sommerzeit', () => {
  // 13.11.2026 ist Winterzeit (UTC+1): 20:30 UTC = 21:30 in Berlin.
  assert.equal(localMinutes(new Date(Date.UTC(2026, 10, 13, 20, 30))), 21 * 60 + 30);
  // 1.7.2026 ist Sommerzeit (UTC+2): 05:00 UTC = 07:00 in Berlin.
  assert.equal(localMinutes(new Date(Date.UTC(2026, 6, 1, 5, 0))), 7 * 60);

  const night = { von: '19:00', bis: '07:00' };
  assert.equal(inQuietHours(night, new Date(Date.UTC(2026, 10, 13, 20, 30))), true); // 21:30
  assert.equal(inQuietHours(night, new Date(Date.UTC(2026, 10, 13, 4, 0))), true); // 05:00
  assert.equal(inQuietHours(night, new Date(Date.UTC(2026, 10, 13, 6, 0))), false); // 07:00, Ende zählt nicht
  assert.equal(inQuietHours(night, new Date(Date.UTC(2026, 10, 13, 18, 0))), true); // 19:00, Beginn zählt
  assert.equal(inQuietHours(night, new Date(Date.UTC(2026, 10, 13, 11, 0))), false); // 12:00

  const lunch = { von: '12:00', bis: '14:00' };
  assert.equal(inQuietHours(lunch, new Date(Date.UTC(2026, 10, 13, 12, 0))), true); // 13:00
  assert.equal(inQuietHours(lunch, new Date(Date.UTC(2026, 10, 13, 14, 0))), false); // 15:00
  assert.equal(inQuietHours({ von: '08:00', bis: '08:00' }, new Date()), false);
  assert.equal(inQuietHours(null, new Date()), false);
});

test('Ruhezeiten sperren das Gerät', () => {
  const c = clock(Date.UTC(2026, 10, 13, 20, 30)); // 21:30 in Berlin
  const p = new ParentControls(c.now);
  p.grantConsent('g1');
  p.setQuietHours('g1', { von: '19:00', bis: '07:00' });
  assert.equal(p.blockReason('g1', true), 'schlaf');
  p.setQuietHours('g1', null);
  assert.equal(p.blockReason('g1', true), null);
});

test('forgetDevice löscht alles zum Gerät, andere Geräte bleiben', () => {
  const p = new ParentControls();
  const t1 = p.redeemPairingCode(p.createPairingCode('g1').code);
  const t2 = p.redeemPairingCode(p.createPairingCode('g2').code);
  assert.ok(t1 && t2);
  p.grantConsent('g1');
  p.grantConsent('g2');
  p.setSleep('g1', true);
  const pending = p.createPairingCode('g1').code;
  p.forgetDevice('g1');
  assert.equal(p.deviceForToken(t1.token), null);
  assert.equal(p.redeemPairingCode(pending), null);
  assert.deepEqual(p.settings('g1'), { einwilligung: { erteilt: false, zeitpunkt: null }, schlafmodus: false, ruhezeiten: null });
  assert.equal(p.deviceForToken(t2.token), 'g2');
  assert.equal(p.hasConsent('g2'), true);
});

test('Kopplungscode wird Ziffer für Ziffer zweimal gesprochen', () => {
  assert.equal(
    pairingCodeSpeech('047913'),
    'Hier ist der Code für deine Eltern: null, vier, sieben, neun, eins, drei. Noch einmal: null, vier, sieben, neun, eins, drei.'
  );
});
