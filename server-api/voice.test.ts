import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeWavHeader, encodeWav } from './audio.js';
import { loadConfig } from './config.js';
import { VoicePipeline, VoiceProviderError } from './voice.js';
import type { KunibertConfig } from './config.js';

function pipeline(): VoicePipeline {
  return new VoicePipeline({ ...loadConfig(), openaiApiKey: 'test-key', sttProvider: 'openai', ttsProvider: 'openai' });
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
  const voice = new VoicePipeline({ ...loadConfig(), openaiApiKey: null, sttProvider: 'none', ttsProvider: 'none' });
  await assert.rejects(() => voice.synthesizeCached('Hallo'), VoiceProviderError);
});

/** Mono-Sinus als 16-Bit-PCM, damit die Umrechnung echte Werte statt Stille verarbeitet. */
function sinePcm(frames: number, channels: number, rate: number): Buffer {
  const pcm = Buffer.alloc(frames * channels * 2);
  for (let frame = 0; frame < frames; frame++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * frame) / rate) * 8000);
    for (let channel = 0; channel < channels; channel++) pcm.writeInt16LE(sample, (frame * channels + channel) * 2);
  }
  return pcm;
}

test('TTS: 24-kHz-WAV wird auf 16 kHz Mono mit gültigem 16-Bit-Header umgerechnet', async () => {
  // Echte TTS-Dienste liefern 24 kHz. Der Header der Umrechnung war einmal kaputt
  // (Bittiefe 2), der Pi-Client lehnt solche Antworten ab.
  const source = encodeWav(sinePcm(2400, 1, 24_000), 24_000, 1, 16);
  await withFetch(() => new Response(new Uint8Array(source), { status: 200 }), async () => {
    const result = await pipeline().synthesize('Hallo');
    const header = decodeWavHeader(result);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.channels, 1);
    assert.equal(header.bitsPerSample, 16);
    assert.equal(header.dataSize, 1600 * 2, '0,1 s bei 16 kHz');
    assert.equal(result.length, 44 + header.dataSize);
    // Blockgröße und Byterate müssen zum Format passen, sonst lehnen Player die Datei ab.
    assert.equal(result.readUInt16LE(32), 2, 'block align');
    assert.equal(result.readUInt32LE(28), 32_000, 'byte rate');
    // Der Ton bleibt erhalten (kein Nullsignal).
    let peak = 0;
    for (let offset = 44; offset < result.length; offset += 2) peak = Math.max(peak, Math.abs(result.readInt16LE(offset)));
    assert.ok(peak > 4000, `Spitzenwert ${peak}`);
  });
});

test('TTS: Stereo-WAV wird zu Mono gemischt', async () => {
  const source = encodeWav(sinePcm(1600, 2, 16_000), 16_000, 2, 16);
  await withFetch(() => new Response(new Uint8Array(source), { status: 200 }), async () => {
    const result = await pipeline().synthesize('Hallo');
    const header = decodeWavHeader(result);
    assert.equal(header.channels, 1);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.bitsPerSample, 16);
    assert.equal(header.dataSize, 1600 * 2);
  });
});

// ---------------------------------------------------------------------------
// Robustes WAV-Lesen
// ---------------------------------------------------------------------------

/** WAV mit zusätzlichem LIST-Chunk vor den Daten, wie ihn manche Anbieter liefern. */
function wavWithListChunk(pcm: Buffer, rate: number): Buffer {
  const base = encodeWav(pcm, rate, 1, 16);
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO')]);
  const out = Buffer.concat([base.subarray(0, 36), list, base.subarray(36)]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

test('TTS: WAV mit zusätzlichem Chunk wird sauber neu verpackt (keine Kopf-Bytes als Ton)', async () => {
  const pcm = sinePcm(1600, 1, 16_000);
  await withFetch(() => new Response(new Uint8Array(wavWithListChunk(pcm, 16_000)), { status: 200 }), async () => {
    const result = await pipeline().synthesize('Hallo');
    const header = decodeWavHeader(result);
    assert.equal(header.dataSize, pcm.length);
    assert.equal(result.length, 44 + pcm.length);
    assert.deepEqual(result.subarray(44), pcm, 'Audiodaten unverändert');
  });
});

test('TTS: Streaming-Kopf mit Datenlänge 0xFFFFFFFF nimmt den Rest der Datei', async () => {
  const pcm = sinePcm(2400, 1, 24_000);
  const source = encodeWav(pcm, 24_000, 1, 16);
  source.writeUInt32LE(0xffffffff, 40);
  await withFetch(() => new Response(new Uint8Array(source), { status: 200 }), async () => {
    const header = decodeWavHeader(await pipeline().synthesize('Hallo'));
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.dataSize, 1600 * 2);
  });
});

test('TTS: WAV ohne Audiodaten oder mit 8 Bit wird abgelehnt', async () => {
  const noData = encodeWav(Buffer.alloc(0), 16_000, 1, 16);
  await withFetch(() => new Response(new Uint8Array(noData), { status: 200 }), async () => {
    await assert.rejects(() => pipeline().synthesize('Hallo'), VoiceProviderError);
  });
  const eightBit = encodeWav(Buffer.alloc(3200), 16_000, 1, 8);
  await withFetch(() => new Response(new Uint8Array(eightBit), { status: 200 }), async () => {
    await assert.rejects(() => pipeline().synthesize('Hallo'), VoiceProviderError);
  });
});

// ---------------------------------------------------------------------------
// Spracherkennung: Parameter je Modell
// ---------------------------------------------------------------------------

function sttPipeline(overrides: Partial<KunibertConfig>): VoicePipeline {
  return new VoicePipeline({ ...loadConfig(), openaiApiKey: 'test-key', sttProvider: 'openai', ttsProvider: 'none', ...overrides });
}

async function captureSttForm(overrides: Partial<KunibertConfig>): Promise<FormData> {
  const original = globalThis.fetch;
  let form: FormData | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    form = init.body as FormData;
    return new Response(JSON.stringify({ text: ' Hallo Kunibert ' }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const text = await sttPipeline(overrides).transcribe(encodeWav(Buffer.alloc(3200), 16_000, 1, 16));
    assert.equal(text, 'Hallo Kunibert');
    return form as unknown as FormData;
  } finally {
    globalThis.fetch = original;
  }
}

test('STT: whisper-1 bekommt language=de', async () => {
  const form = await captureSttForm({ sttModel: 'whisper-1', sttPrompt: '' });
  assert.equal(form.get('model'), 'whisper-1');
  assert.equal(form.get('language'), 'de');
  assert.equal(form.get('prompt'), null);
});

test('STT: gpt-transcribe bekommt kein language-Feld (nicht dokumentiert), nur den optionalen Hinweis', async () => {
  const plain = await captureSttForm({ sttModel: 'gpt-transcribe', sttPrompt: '' });
  assert.equal(plain.get('model'), 'gpt-transcribe');
  assert.equal(plain.get('language'), null);
  assert.equal(plain.get('prompt'), null);

  const hinted = await captureSttForm({ sttModel: 'gpt-transcribe', sttPrompt: 'Kunibert, Ritter' });
  assert.equal(hinted.get('prompt'), 'Kunibert, Ritter');
  assert.equal(hinted.get('language'), null);
});

// ---------------------------------------------------------------------------
// Sprachausgabe über Gemini
// ---------------------------------------------------------------------------

function geminiPipeline(overrides: Partial<KunibertConfig> = {}): VoicePipeline {
  return new VoicePipeline({
    ...loadConfig(),
    geminiApiKey: 'g-test-key',
    openaiApiKey: null,
    sttProvider: 'none',
    ttsProvider: 'gemini',
    ttsModel: 'gemini-3.8-flash-tts',
    ttsVoice: 'Sulafat',
    ttsStyle: 'ruhig und warm',
    ...overrides,
  });
}

function geminiAnswer(wav: Buffer, extraSteps: unknown[] = []): Response {
  return new Response(
    JSON.stringify({
      steps: [
        ...extraSteps,
        { type: 'model_output', content: [{ type: 'audio', data: wav.toString('base64') }] },
      ],
    }),
    { status: 200 }
  );
}

test('Gemini-TTS: Anfrage enthält Modell, Stimme, Sprechweise und Schlüssel im Header', async () => {
  const original = globalThis.fetch;
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return geminiAnswer(encodeWav(sinePcm(2400, 1, 24_000), 24_000, 1, 16));
  }) as unknown as typeof fetch;
  try {
    const result = await geminiPipeline().synthesize('Es war einmal ein Ritter.');
    assert.equal(seen!.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    const headers = seen!.init.headers as Record<string, string>;
    assert.equal(headers['x-goog-api-key'], 'g-test-key');
    const body = JSON.parse(String(seen!.init.body));
    assert.equal(body.model, 'gemini-3.8-flash-tts');
    assert.deepEqual(body.response_format, { type: 'audio' });
    assert.deepEqual(body.generation_config, { speech_config: [{ voice: 'Sulafat' }] });
    const item = body.input[0].content[0];
    assert.equal(item.text, 'Es war einmal ein Ritter.');
    assert.deepEqual(item.annotations, [{ type: 'speech_metadata', style: 'ruhig und warm' }]);
    // 24 kHz aus Gemini werden auf das Pi-Format 16 kHz umgerechnet.
    const header = decodeWavHeader(result);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.channels, 1);
    assert.equal(header.bitsPerSample, 16);
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini-TTS: ohne Sprechweise entfällt die Anweisung', async () => {
  const original = globalThis.fetch;
  let body: { input: Array<{ content: Array<Record<string, unknown>> }> } | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return geminiAnswer(encodeWav(Buffer.alloc(3200), 16_000, 1, 16));
  }) as unknown as typeof fetch;
  try {
    await geminiPipeline({ ttsStyle: '' }).synthesize('Hallo');
    assert.equal('annotations' in body!.input[0].content[0], false);
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini-TTS: der letzte Audio-Eintrag zählt, andere Schritte werden übersprungen', async () => {
  const quiet = encodeWav(Buffer.alloc(3200), 16_000, 1, 16);
  const loud = encodeWav(sinePcm(1600, 1, 16_000), 16_000, 1, 16);
  const response = () =>
    new Response(
      JSON.stringify({
        steps: [
          { type: 'thought', content: [{ type: 'text', text: 'ignoriert' }] },
          { type: 'model_output', content: [{ type: 'audio', data: quiet.toString('base64') }, { type: 'audio', data: loud.toString('base64') }] },
        ],
      }),
      { status: 200 }
    );
  await withFetch(response, async () => {
    const result = await geminiPipeline().synthesize('Hallo');
    assert.deepEqual(result, loud);
  });
});

test('Gemini-TTS: Fehlerfälle werden zu VoiceProviderError mit richtiger Wiederholbarkeit', async () => {
  await withFetch(() => new Response('overloaded', { status: 503 }), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), (e: unknown) => e instanceof VoiceProviderError && e.retryable === true);
  });
  await withFetch(() => new Response('rate', { status: 429 }), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), (e: unknown) => e instanceof VoiceProviderError && e.retryable === true);
  });
  await withFetch(() => new Response('bad key', { status: 403 }), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), (e: unknown) => e instanceof VoiceProviderError && e.retryable === false);
  });
  await withFetch(() => new Response('<html>', { status: 200 }), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), VoiceProviderError);
  });
  await withFetch(() => new Response(JSON.stringify({ steps: [] }), { status: 200 }), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), /kein Audio/);
  });
  // Kein WAV, sondern rohe Bytes: lieber ablehnen als Rauschen an ein Kind senden.
  await withFetch(() => geminiAnswer(Buffer.alloc(3200, 7)), async () => {
    await assert.rejects(() => geminiPipeline().synthesize('Hallo'), /kein WAV/);
  });
});

test('Gemini-TTS: ohne Gemini-Key ist die Sprachausgabe nicht konfiguriert', () => {
  const voice = geminiPipeline({ geminiApiKey: null });
  assert.equal(voice.ttsConfigured, false);
  assert.equal(voice.sttConfigured, false);
});

test('Sprachdienste sind getrennt: STT über OpenAI, TTS über Gemini', () => {
  const voice = geminiPipeline({ openaiApiKey: 'o', sttProvider: 'openai' });
  assert.equal(voice.sttConfigured, true);
  assert.equal(voice.ttsConfigured, true);
});
