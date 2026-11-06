import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSafeConfigSummary,
  isDiagnosticTextEnabled,
  llmConfigWarnings,
  loadConfig,
  normalizeServiceUrl,
  resolveTtsProvider,
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

test('resolveTtsProvider: nur ein ausdrückliches "azure" wählt Azure', () => {
  assert.equal(resolveTtsProvider({}), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: '' }), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: 'openai-compatible' }), 'openai-compatible');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: ' Azure ' }), 'azure');
  assert.equal(resolveTtsProvider({ PICASTAI_TTS_PROVIDER: 'azur' }), 'openai-compatible');
});

test('ttsProviderWarnings: ein unbekannter Wert wird gemeldet, bekannte und leere nicht', () => {
  assert.deepEqual(ttsProviderWarnings({}), []);
  assert.deepEqual(ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'azure' }), []);
  assert.deepEqual(ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'openai-compatible' }), []);
  const unknown = ttsProviderWarnings({ PICASTAI_TTS_PROVIDER: 'azur' });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /azur.*unbekannt/);
});

const AZURE_OK = {
  sttUrl: null,
  ttsUrl: null,
  ttsProvider: 'azure' as const,
  azureTtsRegion: 'germanywestcentral',
  azureTtsKey: 'k',
  azureTtsVoice: 'de-DE-ConradNeural',
  azureTtsPitch: '-10%',
  azureTtsRate: 'slow',
};

test('voiceConfigWarnings: vollständige Azure-Einstellungen in einer EU-Region ergeben keine Warnung', () => {
  assert.deepEqual(voiceConfigWarnings(AZURE_OK), []);
});

test('voiceConfigWarnings: Azure ohne Region, Schlüssel oder Stimme warnt, dass die Sprachausgabe aus bleibt', () => {
  for (const missing of [{ azureTtsRegion: '' }, { azureTtsKey: null }, { azureTtsVoice: '' }]) {
    const warnings = voiceConfigWarnings({ ...AZURE_OK, ...missing });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /müssen alle gesetzt sein/);
  }
});

test('voiceConfigWarnings: Region außerhalb der EU, ungültige Region, Stimme, Tonlage und Tempo', () => {
  const outside = voiceConfigWarnings({ ...AZURE_OK, azureTtsRegion: 'eastus' });
  assert.equal(outside.length, 1);
  assert.match(outside[0], /eastus.*nicht in der EU/);

  const badRegion = voiceConfigWarnings({ ...AZURE_OK, azureTtsRegion: 'bad.host' });
  assert.match(badRegion[0], /Region ist ungültig/);

  const badVoice = voiceConfigWarnings({ ...AZURE_OK, azureTtsVoice: 'x"y' });
  assert.match(badVoice[0], /Stimmenname/);

  const badProsody = voiceConfigWarnings({ ...AZURE_OK, azureTtsPitch: 'tief', azureTtsRate: 'zack' });
  assert.equal(badProsody.length, 2);
  assert.match(badProsody[0], /PITCH.*ignoriert/);
  assert.match(badProsody[1], /RATE.*ignoriert/);
});

test('voiceConfigWarnings: bei Azure wird die Adresse der OpenAI-kompatiblen Sprachausgabe nicht geprüft', () => {
  assert.deepEqual(voiceConfigWarnings({ ...AZURE_OK, ttsUrl: 'https://api.openai.com/v1' }), []);
  // Die Spracherkennung wird weiter geprüft.
  const stt = voiceConfigWarnings({ ...AZURE_OK, sttUrl: 'http://10.0.0.5:8000/v1' });
  assert.equal(stt.length, 1);
  assert.match(stt[0], /Spracherkennung.*unverschlüsselt/);
});

test('getSafeConfigSummary: bei Azure Host und Stimme, nie der Schlüssel', () => {
  const summary = getSafeConfigSummary({ ...loadConfig(), ...AZURE_OK, azureTtsKey: 'azure-geheim' });
  assert.equal(summary.ttsProvider, 'azure');
  assert.equal(summary.ttsHost, 'germanywestcentral.tts.speech.microsoft.com');
  assert.equal(summary.ttsVoice, 'de-DE-ConradNeural');
  assert.equal(JSON.stringify(summary).includes('azure-geheim'), false);
  const broken = getSafeConfigSummary({ ...loadConfig(), ...AZURE_OK, azureTtsRegion: 'bad.host' });
  assert.equal(broken.ttsHost, null);
});
