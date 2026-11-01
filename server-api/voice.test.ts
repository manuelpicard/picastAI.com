import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav } from './audio.js';
import { loadConfig } from './config.js';
import { VoicePipeline, VoiceProviderError } from './voice.js';

function pipeline(): VoicePipeline {
  return new VoicePipeline({ ...loadConfig(), openaiApiKey: 'test-key', voiceProvider: 'openai' });
}

async function withFetch<T>(response: () => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => response()) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('TTS: HTTP 5xx ist ein wiederholbarer VoiceProviderError (-> 503)', async () => {
  await withFetch(() => new Response('upstream down', { status: 503 }), async () => {
    await assert.rejects(
      () => pipeline().synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true,
    );
  });
});

test('TTS: HTTP 401 ist nicht wiederholbar (-> 502)', async () => {
  await withFetch(() => new Response('bad key', { status: 401 }), async () => {
    await assert.rejects(
      () => pipeline().synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === false,
    );
  });
});

test('TTS: ungültiges Audio vom Provider wird als VoiceProviderError gemeldet, nicht als Geräte-Fehler', async () => {
  await withFetch(() => new Response('das ist kein WAV', { status: 200 }), async () => {
    // Der Provider-Adapter wandelt jeden Fehler in einen VoiceProviderError um,
    // damit die Routen 503/502 statt "bad_audio" (400) antworten.
    await assert.rejects(
      () => pipeline().synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError,
    );
  });
});

test('TTS: gültiges 16-kHz-Mono-WAV wird durchgereicht', async () => {
  const wav = encodeWav(Buffer.alloc(3200), 16000, 1, 16);
  await withFetch(() => new Response(new Uint8Array(wav), { status: 200 }), async () => {
    const result = await pipeline().synthesize('Hallo');
    assert.equal(result.length, wav.length);
  });
});
