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
  googleTtsVoice: 'de-DE-Chirp3-HD-Algieba',
  googleTtsRate: '0.9',
  googleTtsPitch: '-2',
  googleTtsPauseMs: '500',
};

test('voiceConfigWarnings: vollständige Google-Einstellungen ergeben keine Warnung', () => {
  assert.deepEqual(voiceConfigWarnings(GOOGLE_OK), []);
  // Leer heißt: es gelten die Standardwerte (Tempo 0,9, Tonlage -2, Pause 500 ms).
  assert.deepEqual(voiceConfigWarnings({ ...GOOGLE_OK, googleTtsRate: '', googleTtsPitch: '', googleTtsPauseMs: '' }), []);
  // 0 ist gültig: keine Absenkung, keine Pausen.
  assert.deepEqual(voiceConfigWarnings({ ...GOOGLE_OK, googleTtsPitch: '0', googleTtsPauseMs: '0' }), []);
});

test('voiceConfigWarnings: Google ohne Schlüssel oder Stimme warnt, dass die Sprachausgabe aus bleibt', () => {
  for (const missing of [{ googleTtsKey: null }, { googleTtsVoice: '' }]) {
    const warnings = voiceConfigWarnings({ ...GOOGLE_OK, ...missing });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /müssen gesetzt sein/);
  }
});

test('voiceConfigWarnings: ungültiger Schlüssel, ungültige Stimme, ungültiges Tempo, ungültige Tonlage und Pause bei Google', () => {
  const badKey = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsKey: 'mit Leerzeichen drin' });
  assert.equal(badKey.length, 1);
  assert.match(badKey[0], /KEY.*ungültige Zeichen/);
  assert.equal(JSON.stringify(badKey).includes('mit Leerzeichen drin'), false);

  const badVoice = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsVoice: 'Algieba' });
  assert.equal(badVoice.length, 1);
  assert.match(badVoice[0], /Stimmenname/);

  const badRate = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsRate: 'schnell' });
  assert.equal(badRate.length, 1);
  assert.match(badRate[0], /RATE.*ignoriert.*0\.9/);

  const badPitch = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsPitch: 'tief' });
  assert.equal(badPitch.length, 1);
  assert.match(badPitch[0], /PITCH.*ignoriert.*-2/);
  assert.equal(voiceConfigWarnings({ ...GOOGLE_OK, googleTtsPitch: '9' }).length, 1);

  const badPause = voiceConfigWarnings({ ...GOOGLE_OK, googleTtsPauseMs: 'lang' });
  assert.equal(badPause.length, 1);
  assert.match(badPause[0], /PAUSE_MS.*ignoriert.*500/);
  assert.equal(voiceConfigWarnings({ ...GOOGLE_OK, googleTtsPauseMs: '5000' }).length, 1);
});

test('loadConfig: Standardstimme Algieba, Tempo/Tonlage/Pause aus der Umgebung', () => {
  const keys = ['PICASTAI_GOOGLE_TTS_VOICE', 'PICASTAI_GOOGLE_TTS_RATE', 'PICASTAI_GOOGLE_TTS_PITCH', 'PICASTAI_GOOGLE_TTS_PAUSE_MS'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const defaults = loadConfig();
    assert.equal(defaults.googleTtsVoice, 'de-DE-Chirp3-HD-Algieba');
    assert.equal(defaults.googleTtsRate, '');
    assert.equal(defaults.googleTtsPitch, '');
    assert.equal(defaults.googleTtsPauseMs, '');

    process.env.PICASTAI_GOOGLE_TTS_RATE = ' 0.85 ';
    process.env.PICASTAI_GOOGLE_TTS_PITCH = '-3';
    process.env.PICASTAI_GOOGLE_TTS_PAUSE_MS = '300';
    const set = loadConfig();
    assert.equal(set.googleTtsRate, '0.85');
    assert.equal(set.googleTtsPitch, '-3');
    assert.equal(set.googleTtsPauseMs, '300');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
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
  assert.equal(summary.ttsVoice, 'de-DE-Chirp3-HD-Algieba');
  assert.equal(summary.ttsModel, '');
  assert.equal(JSON.stringify(summary).includes('google-geheim'), false);
});
