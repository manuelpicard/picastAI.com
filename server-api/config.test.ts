import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiagnosticTextEnabled, normalizeServiceUrl, voiceConfigWarnings } from './config.js';

test('diagnosticText is opt-in and disabled in production', async (t) => {
  await t.test('is disabled when the flag is missing', () => {
    assert.equal(
      isDiagnosticTextEnabled({ NODE_ENV: 'development' }),
      false,
    );
  });

  await t.test('is disabled when the flag is 0', () => {
    assert.equal(
      isDiagnosticTextEnabled({ NODE_ENV: 'development', KUNIBERT_DIAGNOSTIC_TEXT: '0' }),
      false,
    );
  });

  await t.test('is enabled by an explicit 1 outside production', () => {
    assert.equal(
      isDiagnosticTextEnabled({ NODE_ENV: 'development', KUNIBERT_DIAGNOSTIC_TEXT: '1' }),
      true,
    );
  });

  await t.test('is disabled in production even when the flag is 1', () => {
    assert.equal(
      isDiagnosticTextEnabled({ NODE_ENV: 'production', KUNIBERT_DIAGNOSTIC_TEXT: '1' }),
      false,
    );
  });

  await t.test('does not treat other truthy strings as opt-in', () => {
    assert.equal(
      isDiagnosticTextEnabled({ NODE_ENV: 'development', KUNIBERT_DIAGNOSTIC_TEXT: 'true' }),
      false,
    );
  });
});

test('normalizeServiceUrl: entfernt Leerzeichen und abschließende Schrägstriche, leer ist nicht gesetzt', () => {
  assert.equal(normalizeServiceUrl(undefined), null);
  assert.equal(normalizeServiceUrl(''), null);
  assert.equal(normalizeServiceUrl('   '), null);
  assert.equal(normalizeServiceUrl(' http://127.0.0.1:8000/v1/ '), 'http://127.0.0.1:8000/v1');
  assert.equal(normalizeServiceUrl('https://sprache.example.org/v1//'), 'https://sprache.example.org/v1');
});

test('voiceConfigWarnings: keine Warnung für den eigenen Rechner oder https', () => {
  assert.deepEqual(voiceConfigWarnings({ sttUrl: null, ttsUrl: null }), []);
  assert.deepEqual(voiceConfigWarnings({ sttUrl: 'http://127.0.0.1:8000/v1', ttsUrl: 'http://localhost:8000/v1' }), []);
  assert.deepEqual(voiceConfigWarnings({ sttUrl: 'https://sprache.example.org/v1', ttsUrl: null }), []);
});

test('voiceConfigWarnings: warnt vor http zu einem anderen Rechner und vor ausgeschlossenen Anbietern', () => {
  const plain = voiceConfigWarnings({ sttUrl: 'http://10.0.0.5:8000/v1', ttsUrl: null });
  assert.equal(plain.length, 1);
  assert.match(plain[0], /Spracherkennung.*10\.0\.0\.5.*unverschlüsselt/);

  const excluded = voiceConfigWarnings({ sttUrl: 'https://api.openai.com/v1', ttsUrl: 'https://generativelanguage.googleapis.com/v1beta' });
  assert.equal(excluded.length, 2);
  assert.match(excluded[0], /api\.openai\.com.*ausgeschlossen/);
  assert.match(excluded[1], /Sprachausgabe.*generativelanguage\.googleapis\.com.*ausgeschlossen/);
});

test('voiceConfigWarnings: eine ungültige Adresse wird gemeldet', () => {
  const warnings = voiceConfigWarnings({ sttUrl: 'kein-url', ttsUrl: null });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /keine gültige URL/);
});
