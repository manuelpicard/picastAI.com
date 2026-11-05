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

async function withCountingFetch<T>(
  responses: Array<() => Response>,
  fn: (calls: () => number) => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    const next = responses[Math.min(count, responses.length - 1)];
    count++;
    return next();
  }) as typeof fetch;
  try {
    return await fn(() => count);
  } finally {
    globalThis.fetch = original;
  }
}

const okWav = () => new Response(new Uint8Array(encodeWav(Buffer.alloc(3200), 16000, 1, 16)), { status: 200 });

test('Fester Text wird nur einmal synthetisiert', async () => {
  await withCountingFetch([okWav], async (calls) => {
    const voice = pipeline();
    const first = await voice.synthesizeCached('Sicherheitshinweis');
    const second = await voice.synthesizeCached('Sicherheitshinweis');
    assert.equal(calls(), 1);
    assert.equal(first, second);
    await voice.synthesizeCached('Anderer Text');
    assert.equal(calls(), 2);
  });
});

test('Ohne Cache synthetisiert jeder Aufruf neu', async () => {
  await withCountingFetch([okWav], async (calls) => {
    const voice = pipeline();
    await voice.synthesize('Hallo');
    await voice.synthesize('Hallo');
    assert.equal(calls(), 2);
  });
});

test('Gleichzeitige Abrufe desselben festen Textes teilen sich eine Anfrage', async () => {
  await withCountingFetch([okWav], async (calls) => {
    const voice = pipeline();
    const results = await Promise.all([1, 2, 3].map(() => voice.synthesizeCached('Hinweis')));
    assert.equal(calls(), 1);
    assert.equal(results[0], results[2]);
  });
});

test('Ein Fehler wird nicht zwischengespeichert: der nächste Abruf versucht es erneut', async () => {
  await withCountingFetch([() => new Response('down', { status: 503 }), okWav], async (calls) => {
    const voice = pipeline();
    await assert.rejects(() => voice.synthesizeCached('Hinweis'), VoiceProviderError);
    const wav = await voice.synthesizeCached('Hinweis');
    assert.ok(wav.length > 44);
    assert.equal(calls(), 2);
  });
});

test('warmUp zählt Erfolge und wirft bei Ausfall nicht', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await withCountingFetch([okWav, () => new Response('down', { status: 503 })], async () => {
      const voice = pipeline();
      assert.equal(await voice.warmUp(['eins', 'zwei']), 1);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('Ohne Provider: synthesizeCached meldet einen VoiceProviderError', async () => {
  const voice = new VoicePipeline({ ...loadConfig(), openaiApiKey: null, voiceProvider: 'none' });
  await assert.rejects(() => voice.synthesizeCached('Hallo'), VoiceProviderError);
});
