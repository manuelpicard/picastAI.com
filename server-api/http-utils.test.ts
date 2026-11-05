import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAudioUrl, normalizePublicBaseUrl, parseTrustProxy } from './http-utils.js';

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

test('normalizePublicBaseUrl: leer oder ungültig ergibt null', () => {
  assert.equal(normalizePublicBaseUrl(undefined), null);
  assert.equal(normalizePublicBaseUrl(''), null);
  assert.equal(normalizePublicBaseUrl('kunibert.example'), null);
  assert.equal(normalizePublicBaseUrl('ftp://kunibert.example'), null);
  assert.equal(normalizePublicBaseUrl('javascript:alert(1)'), null);
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
