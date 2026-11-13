import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSafeConfigSummary,
  isDiagnosticTextEnabled,
  isTestTranscriptEnabled,
  isValidWorkspaceId,
  llmConfigWarnings,
  loadConfig,
  normalizeServiceUrl,
  resolveTtsProvider,
  testSwitchWarnings,
  ttsProviderWarnings,
  voiceConfigWarnings,
} from './config.js';

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

test('llmConfigWarnings: warnt vor Gemini-Einstellungen, die nicht mehr wirken', () => {
  assert.deepEqual(llmConfigWarnings({}), []);
  assert.deepEqual(llmConfigWarnings({ PICASTAI_LLM_PROVIDER: 'anthropic' }), []);

  const provider = llmConfigWarnings({ PICASTAI_LLM_PROVIDER: 'gemini' });
  assert.equal(provider.length, 1);
  assert.match(provider[0], /PICASTAI_LLM_PROVIDER=gemini.*nicht mehr unterstützt/);

  const leftovers = llmConfigWarnings({ GEMINI_API_KEY: 'g' });
  assert.equal(leftovers.length, 1);
  assert.match(leftovers[0], /GEMINI_API_KEY.*nicht mehr gelesen/);

  assert.equal(llmConfigWarnings({ PICASTAI_LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }).length, 2);
});

test('resolveTtsProvider: nur ein ausdrückliches "google" wählt Google', () => {
  assert.equal(resolveTtsProvider({}), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: '' }), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: 'openai-compatible' }), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: ' Google ' }), 'google');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: 'googel' }), 'openai-compatible');
  // Azure gibt es nicht (der Versuch wurde abgebrochen); der Wert wird als unbekannt gemeldet.
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: 'azure' }), 'openai-compatible');
});

test('ttsProviderWarnings: ein unbekannter Wert wird gemeldet, bekannte und leere nicht', () => {
  assert.deepEqual(ttsProviderWarnings({}), []);
  assert.deepEqual(ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'google' }), []);
  assert.deepEqual(ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'openai-compatible' }), []);
  const unknown = ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'googel' });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /googel.*unbekannt/);
});

const GOOGLE_OK = {
  sttUrl: null,
  ttsUrl: null,
  ttsProvider: 'google' as const,
  googleTtsKey: 'test-schluessel-123456',
  googleTtsVoice: 'de-DE-Chirp3-HD-Algenib',
  googleTtsRate: '0.9',
};

test('voiceConfigWarnings: vollständige Google-Einstellungen ergeben keine Warnung', () => {
  assert.deepEqual(voiceConfigWarnings(GOOGLE_OK), []);
  assert.deepEqual(voiceConfigWarnings({ ...GOOGLE_OK, googleTtsRate: '' }), []);
});

test('voiceConfigWarnings: Google ohne Schlüssel oder Stimme warnt, dass die Sprachausgabe aus bleibt', () => {
  for (const missing of [{ googleTtsKey: null }, { googleTtsVoice: '' }]) {
    const warnings = voiceConfigWarnings({ ...GOOGLE_OK, ...missing });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /müssen gesetzt sein/);
  }
});

test('voiceConfigWarnings: ungültiger Schlüssel, ungültige Stimme und ungültiges Tempo bei Google', () => {
  const badKey = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsKey: 'mit Leerzeichen drin' });
  assert.equal(badKey.length, 1);
  assert.match(badKey[0], /KEY.*ungültige Zeichen/);
  assert.equal(JSON.stringify(badKey).includes('mit Leerzeichen drin'), false);

  const badVoice = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsVoice: 'Algenib' });
  assert.equal(badVoice.length, 1);
  assert.match(badVoice[0], /Stimmenname/);

  const badRate = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsRate: 'schnell' });
  assert.equal(badRate.length, 1);
  assert.match(badRate[0], /RATE.*ignoriert/);
});

test('voiceConfigWarnings: bei Google wird die Adresse der OpenAI-kompatiblen Sprachausgabe nicht geprüft', () => {
  assert.deepEqual(voiceConfigWarnings({ ...GOOGLE_OK, ttsUrl: 'https://api.openai.com/v1' }), []);
  // Die Spracherkennung wird weiter geprüft.
  const stt = voiceConfigWarnings({ ...GOOGLE_OK, sttUrl: 'http://10.0.0.5:8000/v1' });
  assert.equal(stt.length, 1);
  assert.match(stt[0], /Spracherkennung.*unverschlüsselt/);
});

test('getSafeConfigSummary: bei Google Host und Stimme, nie der Schlüssel', () => {
  const summary = getSafeConfigSummary({ ...loadConfig(), ...GOOGLE_OK, googleTtsKey: 'google-geheim-123456' });
  assert.equal(summary.ttsProvider, 'google');
  assert.equal(summary.ttsHost, 'eu-texttospeech.googleapis.com');
  assert.equal(summary.ttsVoice, 'de-DE-Chirp3-HD-Algenib');
  assert.equal(summary.ttsModel, '');
  assert.equal(JSON.stringify(summary).includes('google-geheim'), false);
});

test('Testfeld transcript: in Entwicklung an, im Betrieb nur mit KUNIBERT_TEST_TRANSCRIPT=1', () => {
  assert.equal(isTestTranscriptEnabled({}), true, 'ohne NODE_ENV (Probelauf am Rechner)');
  assert.equal(isTestTranscriptEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isTestTranscriptEnabled({ NODE_ENV: 'production' }), false, 'Betrieb: aus');
  assert.equal(isTestTranscriptEnabled({ NODE_ENV: 'production', KUNIBERT_TEST_TRANSCRIPT: '0' }), false);
  assert.equal(isTestTranscriptEnabled({ NODE_ENV: 'production', KUNIBERT_TEST_TRANSCRIPT: 'ja' }), false, 'nur genau 1 schaltet ein');
  assert.equal(isTestTranscriptEnabled({ NODE_ENV: 'production', KUNIBERT_TEST_TRANSCRIPT: ' 1 ' }), true);
});

test('Startwarnung nur, wenn das Testfeld im Betrieb an ist', () => {
  assert.deepEqual(testSwitchWarnings({ NODE_ENV: 'production' }), []);
  assert.deepEqual(testSwitchWarnings({ NODE_ENV: 'development', KUNIBERT_TEST_TRANSCRIPT: '1' }), []);
  const [warning] = testSwitchWarnings({ NODE_ENV: 'production', KUNIBERT_TEST_TRANSCRIPT: '1' });
  assert.match(warning, /KUNIBERT_TEST_TRANSCRIPT=1/);
  assert.match(warning, /vor dem ersten Kind/);
});

test('Arbeitsbereichs-ID: Format geprüft, ungültige wird mit Warnung ignoriert', () => {
  assert.equal(isValidWorkspaceId('wrkspc_014T6HKPx3kPyKLYf48XXvXj'), true);
  assert.equal(isValidWorkspaceId('wrkspc_'), false);
  assert.equal(isValidWorkspaceId('sk-ant-usr-abc'), false);
  assert.equal(isValidWorkspaceId('wrkspc_abc def'), false);
  assert.deepEqual(llmConfigWarnings({ PICASTAI_ANTHROPIC_WORKSPACE_ID: 'wrkspc_014T6HKPx3kPyKLYf48XXvXj' }), []);
  assert.match(llmConfigWarnings({ PICASTAI_ANTHROPIC_WORKSPACE_ID: 'falsch' })[0], /PICASTAI_ANTHROPIC_WORKSPACE_ID ist ungültig/);
});
