import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiagnosticTextEnabled, resolveVoiceProviders, voiceDeprecationWarnings } from './config.js';

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

test('resolveVoiceProviders: Gemini für die Sprachausgabe, sobald ein Gemini-Key da ist', () => {
  assert.deepEqual(resolveVoiceProviders({}), { stt: 'none', tts: 'none' });
  assert.deepEqual(resolveVoiceProviders({ OPENAI_API_KEY: 'o' }), { stt: 'openai', tts: 'openai' });
  assert.deepEqual(resolveVoiceProviders({ GEMINI_API_KEY: 'g' }), { stt: 'none', tts: 'gemini' });
  assert.deepEqual(resolveVoiceProviders({ OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' }), { stt: 'openai', tts: 'gemini' });
});

test('resolveVoiceProviders: ausdrückliche Wahl gewinnt, VOICE_PROVIDER bleibt kompatibel', () => {
  const both = { OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' };
  assert.deepEqual(resolveVoiceProviders({ ...both, PICASTAI_TTS_PROVIDER: 'openai' }), { stt: 'openai', tts: 'openai' });
  assert.deepEqual(resolveVoiceProviders({ ...both, PICASTAI_TTS_PROVIDER: 'none' }), { stt: 'openai', tts: 'none' });
  assert.deepEqual(resolveVoiceProviders({ ...both, PICASTAI_TTS_PROVIDER: 'unsinn' }), { stt: 'openai', tts: 'gemini' });
  // Alte Einstellung "openai" hieß: OpenAI für beides.
  assert.deepEqual(resolveVoiceProviders({ ...both, PICASTAI_VOICE_PROVIDER: 'openai' }), { stt: 'openai', tts: 'openai' });
  // "none" schaltet alles ab, auch mit Schlüsseln.
  assert.deepEqual(resolveVoiceProviders({ ...both, PICASTAI_VOICE_PROVIDER: 'none' }), { stt: 'none', tts: 'none' });
});

test('voiceDeprecationWarnings: warnt vor den angekündigten Abschaltungen, nicht vor den Nachfolgern', () => {
  const old = voiceDeprecationWarnings({ sttProvider: 'openai', sttModel: 'whisper-1', ttsProvider: 'openai', ttsModel: 'tts-1' });
  assert.equal(old.length, 2);
  assert.match(old[0], /6\.1\.2027/);
  assert.match(old[1], /26\.2\.2027/);
  assert.deepEqual(
    voiceDeprecationWarnings({ sttProvider: 'openai', sttModel: 'gpt-transcribe', ttsProvider: 'gemini', ttsModel: 'gemini-3.8-flash-tts' }),
    []
  );
  assert.deepEqual(voiceDeprecationWarnings({ sttProvider: 'none', sttModel: 'whisper-1', ttsProvider: 'none', ttsModel: 'tts-1' }), []);
});
