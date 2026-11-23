import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAudioUrl, normalizePublicBaseUrl, parentCookieSecure, parseTrustProxy } from './http-utils.js';

test('parseTrustProxy: Standard ist aus', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(null), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('  '), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('FALSE'), false);
  assert.equal(parseTrustProxy('0'), false);
});

test('parseTrustProxy: true, Hop-Zahl und Express-Schlüsselwörter', () => {
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy(' True '), true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('10.0.0.0/8, 192.168.0.1'), '10.0.0.0/8, 192.168.0.1');
});

test('normalizePublicBaseUrl: nur http(s)-Ursprung, ohne Pfad und Schrägstrich', () => {
  assert.equal(normalizePublicBaseUrl('https://kunibert.example'), 'https://kunibert.example');
  assert.equal(normalizePublicBaseUrl('https://kunibert.example/'), 'https://kunibert.example');
  assert.equal(normalizePublicBaseUrl('  https://kunibert.example/pfad?x=1#frag '), 'https://kunibert.example');
  assert.equal(normalizePublicBaseUrl('http://192.168.1.20:3000'), 'http://192.168.1.20:3000');
});

test('normalizePublicBaseUrl: Schreibweise des Hosts und Port bleiben wie getippt', () => {
  // Der Pi-Standard lautet https://picastAI.com; ein kleingeschriebener Host
  // würde dort als anderer Origin gelten.
  assert.equal(normalizePublicBaseUrl('https://picastAI.com'), 'https://picastAI.com');
  assert.equal(normalizePublicBaseUrl('https://picastAI.com/'), 'https://picastAI.com');
  assert.equal(normalizePublicBaseUrl('HTTPS://Kunibert.Example/pfad'), 'https://Kunibert.Example');
  assert.equal(normalizePublicBaseUrl('https://kunibert.example:443'), 'https://kunibert.example:443');
  assert.equal(normalizePublicBaseUrl('http://[::1]:3000/x'), 'http://[::1]:3000');
});

test('normalizePublicBaseUrl: leer oder ungültig ergibt null', () => {
  assert.equal(normalizePublicBaseUrl(undefined), null);
  assert.equal(normalizePublicBaseUrl(''), null);
  assert.equal(normalizePublicBaseUrl('kunibert.example'), null);
  assert.equal(normalizePublicBaseUrl('ftp://kunibert.example'), null);
  assert.equal(normalizePublicBaseUrl('javascript:alert(1)'), null);
  assert.equal(normalizePublicBaseUrl('https://'), null);
  assert.equal(normalizePublicBaseUrl('https://kunibert .example'), null);
  assert.equal(normalizePublicBaseUrl('https://kunibert.example:abc'), null);
});

test('normalizePublicBaseUrl: Zugangsdaten in der Adresse werden abgelehnt', () => {
  assert.equal(normalizePublicBaseUrl('https://nutzer:geheim@kunibert.example'), null);
  assert.equal(normalizePublicBaseUrl('https://nutzer@kunibert.example'), null);
});

test('buildAudioUrl: festes Public-Base-URL hat Vorrang vor der Anfrage', () => {
  const url = buildAudioUrl(
    { publicBaseUrl: 'https://kunibert.example', protocol: 'http', host: '127.0.0.1:3000' },
    't_abc'
  );
  assert.equal(url, 'https://kunibert.example/v1/device/audio/t_abc');
});

test('buildAudioUrl: ohne Public-Base-URL aus Schema und Host der Anfrage', () => {
  assert.equal(
    buildAudioUrl({ publicBaseUrl: null, protocol: 'https', host: 'kunibert.example' }, 't_abc'),
    'https://kunibert.example/v1/device/audio/t_abc'
  );
  assert.equal(
    buildAudioUrl({ publicBaseUrl: null, protocol: 'http', host: undefined }, 't_abc'),
    'http://localhost/v1/device/audio/t_abc'
  );
});

test('buildAudioUrl: Turn-ID wird URL-kodiert, Präfix ist überschreibbar', () => {
  assert.equal(
    buildAudioUrl({ publicBaseUrl: 'https://a.example', protocol: 'https', host: 'a.example' }, 'a/b c', '/v1/turn'),
    'https://a.example/v1/turn/a%2Fb%20c'
  );
});

test('parentCookieSecure: Secure über HTTPS und im Betrieb hinter einem Proxy auf diesem Rechner', () => {
  const base = { secure: false, forwardedProto: undefined as string | string[] | undefined, remoteAddress: '192.168.1.30', production: true };
  // Test im eigenen WLAN: http direkt vom Handy, auch im Betrieb ohne Secure.
  assert.equal(parentCookieSecure(base), false);
  assert.equal(parentCookieSecure({ ...base, production: false }), false);
  // Über HTTPS immer: direkt oder laut Proxy, auch in einer Liste oder als Feld mehrerer Köpfe.
  assert.equal(parentCookieSecure({ ...base, secure: true }), true);
  assert.equal(parentCookieSecure({ ...base, forwardedProto: 'https' }), true);
  assert.equal(parentCookieSecure({ ...base, forwardedProto: ' HTTPS ' }), true);
  assert.equal(parentCookieSecure({ ...base, forwardedProto: 'http, https' }), true);
  assert.equal(parentCookieSecure({ ...base, forwardedProto: ['http', 'https'], production: false }), true);
  assert.equal(parentCookieSecure({ ...base, forwardedProto: 'http' }), false);
  // Im Betrieb von diesem Rechner (Caddy, auch ohne X-Forwarded-Proto): Secure.
  for (const local of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(parentCookieSecure({ ...base, remoteAddress: local }), true, local);
    assert.equal(parentCookieSecure({ ...base, remoteAddress: local, production: false }), false, `${local} ohne Betrieb`);
  }
  assert.equal(parentCookieSecure({ ...base, remoteAddress: undefined }), false);
});
