import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeWavHeader, encodeWav } from './audio.js';
import { loadConfig } from './config.js';
import { GOOGLE_TTS_ENDPOINT } from './google-speech.js';
import { VoicePipeline, VoiceProviderError } from './voice.js';
import type { KunibertConfig } from './config.js';

/** Beide Dienste mit eigenen Adressen; die Netzwerkaufrufe werden in den Tests ersetzt. */
const SERVICES: Partial<KunibertConfig> = {
  sttUrl: 'http://127.0.0.1:8001/v1',
  sttApiKey: null,
  sttModel: 'stt-test-modell',
  ttsUrl: 'http://127.0.0.1:8002/v1',
  ttsApiKey: null,
  ttsModel: 'tts-test-modell',
  ttsVoice: 'test-stimme',
};

function pipeline(overrides: Partial<KunibertConfig> = {}): VoicePipeline {
  return new VoicePipeline({ ...loadConfig(), ...SERVICES, ...overrides });
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
  const voice = new VoicePipeline({ ...loadConfig(), sttUrl: null, ttsUrl: null });
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
// Getrennte Dienste: Adresse, Schlüssel und Parameter
// ---------------------------------------------------------------------------

interface SeenRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Zeichnet alle Anfragen auf und antwortet je nach Pfad wie ein Sprachdienst. */
async function recordRequests<T>(fn: (seen: SeenRequest[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const seen: SeenRequest[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
    if (url.endsWith('/audio/transcriptions')) return new Response(JSON.stringify({ text: ' Hallo Kunibert ' }), { status: 200 });
    return okWav();
  }) as unknown as typeof fetch;
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = original;
  }
}

const silentWav = () => encodeWav(Buffer.alloc(3200), 16_000, 1, 16);

test('STT: sendet Modell und language=de an die Adresse der Spracherkennung, ohne Schlüssel kein Authorization-Header', async () => {
  await recordRequests(async (seen) => {
    const text = await pipeline().transcribe(silentWav());
    assert.equal(text, 'Hallo Kunibert');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://127.0.0.1:8001/v1/audio/transcriptions');
    assert.equal('Authorization' in seen[0].headers, false);
    const form = seen[0].body as FormData;
    assert.equal(form.get('model'), 'stt-test-modell');
    assert.equal(form.get('language'), 'de');
    assert.equal(form.get('prompt'), null);
  });
});

test('STT: optionaler Hinweistext und Schlüssel werden mitgesendet', async () => {
  await recordRequests(async (seen) => {
    await pipeline({ sttPrompt: 'Kunibert, Ritter', sttApiKey: 'geheim' }).transcribe(silentWav());
    assert.equal(seen[0].headers.Authorization, 'Bearer geheim');
    assert.equal((seen[0].body as FormData).get('prompt'), 'Kunibert, Ritter');
  });
});

test('TTS: Anfrage geht an die Adresse der Sprachausgabe mit Modell und Stimme, nicht an die der Erkennung', async () => {
  await recordRequests(async (seen) => {
    const result = await pipeline({ ttsApiKey: 'tts-geheim' }).synthesize('Es war einmal ein Ritter.');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://127.0.0.1:8002/v1/audio/speech');
    assert.equal(seen[0].headers.Authorization, 'Bearer tts-geheim');
    const body = JSON.parse(String(seen[0].body));
    assert.equal(body.model, 'tts-test-modell');
    assert.equal(body.voice, 'test-stimme');
    assert.equal(body.input, 'Es war einmal ein Ritter.');
    assert.equal(body.response_format, 'wav');
    assert.equal(decodeWavHeader(result).sampleRate, 16_000);
  });
});

test('STT: eine ungültige JSON-Antwort ist ein wiederholbarer Fehler, kein Absturz', async () => {
  await withFetch(() => new Response('<html>', { status: 200 }), async () => {
    await assert.rejects(
      () => pipeline().transcribe(silentWav()),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true
    );
  });
});

test('Ein Dienst ist nur mit Adresse und Modell konfiguriert, die Sprachausgabe zusätzlich mit Stimme', () => {
  const both = pipeline();
  assert.equal(both.sttConfigured, true);
  assert.equal(both.ttsConfigured, true);

  assert.equal(pipeline({ sttUrl: null }).sttConfigured, false);
  assert.equal(pipeline({ sttModel: '' }).sttConfigured, false);
  assert.equal(pipeline({ ttsUrl: null }).ttsConfigured, false);
  assert.equal(pipeline({ ttsModel: '' }).ttsConfigured, false);
  assert.equal(pipeline({ ttsVoice: '' }).ttsConfigured, false);
});

test('Die Dienste sind unabhängig: nur Erkennung oder nur Sprachausgabe ist möglich', () => {
  const sttOnly = pipeline({ ttsUrl: null });
  assert.equal(sttOnly.sttConfigured, true);
  assert.equal(sttOnly.ttsConfigured, false);

  const ttsOnly = pipeline({ sttUrl: null });
  assert.equal(ttsOnly.sttConfigured, false);
  assert.equal(ttsOnly.ttsConfigured, true);
});

test('STT: ein leerer Text (Stille, Rauschen) ist kein Fehler, sondern ergibt einen leeren Text', async () => {
  for (const text of ['', '   ', '\n']) {
    await withFetch(() => new Response(JSON.stringify({ text }), { status: 200 }), async () => {
      assert.equal(await pipeline().transcribe(silentWav()), '');
    });
  }
});

test('STT: eine Antwort ohne Textfeld ist weiter ein Fehler des Dienstes', async () => {
  for (const payload of [{}, { text: null }, { text: 42 }]) {
    await withFetch(() => new Response(JSON.stringify(payload), { status: 200 }), async () => {
      await assert.rejects(
        () => pipeline().transcribe(silentWav()),
        (error: unknown) => error instanceof VoiceProviderError && error.retryable === false
      );
    });
  }
});

const GOOGLE_KEY = 'test-geheimer-schluessel-123456';

const GOOGLE: Partial<KunibertConfig> = {
  ttsProvider: 'google',
  googleTtsKey: GOOGLE_KEY,
  googleTtsVoice: 'de-DE-Chirp3-HD-Algieba',
  googleTtsRate: '',
  googleTtsPitch: '',
  googleTtsPauseMs: '',
  // Die Adresse der OpenAI-kompatiblen Sprachausgabe darf bei Google keine Rolle spielen.
  ttsUrl: 'http://127.0.0.1:8002/v1',
  ttsModel: 'tts-test-modell',
  ttsVoice: 'test-stimme',
};

/** Antwort wie bei Google: JSON mit base64-kodiertem WAV (LINEAR16 mit Kopf, Chirp 3 HD liefert 24 kHz). */
function googleResponse(frames = 2400, sampleRate = 24_000): Response {
  const wav = encodeWav(Buffer.alloc(frames * 2, 1), sampleRate, 1, 16);
  return new Response(JSON.stringify({ audioContent: wav.toString('base64') }), { status: 200 });
}

async function recordGoogleRequests<T>(
  respond: () => Response,
  fn: (seen: SeenRequest[]) => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  const seen: SeenRequest[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
    return respond();
  }) as unknown as typeof fetch;
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = original;
  }
}

/** Was der Server tatsächlich sprechen lässt: Marken weg, Pausen als Leerzeichen, Leerraum geglättet. */
function spokenFrom(input: { text?: string; ssml?: string }): string {
  return (input.ssml ?? input.text ?? '')
    .replace(/<break [^>]*\/>/g, ' ')
    .replace(/<\/?(speak|prosody)[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

test('Google: Erzählstimme als SSML an den EU-Endpunkt, Schlüssel nur im Kopf, Algieba, 2 Halbtöne tiefer, Tempo 90 %', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const result = await pipeline(GOOGLE).synthesize('Es war einmal ein Ritter. Er ritt los.');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://eu-texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(seen[0].url, GOOGLE_TTS_ENDPOINT);
    assert.equal(seen[0].headers['X-Goog-Api-Key'], GOOGLE_KEY);
    assert.equal(seen[0].headers['Content-Type'], 'application/json');
    assert.equal('Authorization' in seen[0].headers, false);
    assert.equal(seen[0].url.includes(GOOGLE_KEY), false);
    assert.deepEqual(JSON.parse(String(seen[0].body)), {
      input: {
        ssml: '<speak><prosody pitch="-2st" rate="90%">Es war einmal ein Ritter.<break time="500ms"/>Er ritt los.</prosody></speak>',
      },
      voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Algieba' },
      // Bei SSML steckt das Tempo im Text; speakingRate wird nicht mitgeschickt.
      audioConfig: { audioEncoding: 'LINEAR16' },
    });
    // 2400 Bilder bei 24 kHz sind 0,1 s; bei 16 kHz Mono sind es 1600 Bilder.
    const header = decodeWavHeader(result);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(result.length, 44 + 1600 * 2);
  });
});

test('Google: ohne Tonlage und Pausen einfacher Text mit speakingRate; Tempo und Stimme sind einstellbar, Ungültiges ergibt den Standard', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const plain = { googleTtsPitch: '0', googleTtsPauseMs: '0' };
    await pipeline({ ...GOOGLE, ...plain, googleTtsRate: '0.8', googleTtsVoice: 'de-DE-Chirp3-HD-Charon' }).synthesize('Hallo');
    await pipeline({ ...GOOGLE, ...plain, googleTtsRate: 'schnell' }).synthesize('Hallo');
    assert.deepEqual(JSON.parse(String(seen[0].body)), {
      input: { text: 'Hallo' },
      voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Charon' },
      audioConfig: { audioEncoding: 'LINEAR16', speakingRate: 0.8 },
    });
    assert.equal(JSON.parse(String(seen[1].body)).audioConfig.speakingRate, 0.9);
  });
});

test('Google: Tonlage, Tempo und Pause aus der Konfiguration landen im SSML; ungültige Werte ergeben die Standardwerte', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await pipeline({ ...GOOGLE, googleTtsPitch: '-3', googleTtsRate: '0.85', googleTtsPauseMs: '300' }).synthesize('Eins zwei drei vier. Fünf sechs sieben acht.');
    await pipeline({ ...GOOGLE, googleTtsPitch: 'tief', googleTtsRate: 'schnell', googleTtsPauseMs: 'lang' }).synthesize('Eins zwei drei vier. Fünf sechs sieben acht.');
    assert.equal(
      JSON.parse(String(seen[0].body)).input.ssml,
      '<speak><prosody pitch="-3st" rate="85%">Eins zwei drei vier.<break time="300ms"/>Fünf sechs sieben acht.</prosody></speak>'
    );
    assert.equal(
      JSON.parse(String(seen[1].body)).input.ssml,
      '<speak><prosody pitch="-2st" rate="90%">Eins zwei drei vier.<break time="500ms"/>Fünf sechs sieben acht.</prosody></speak>'
    );
  });
});

test('Google: Text mit spitzen Klammern kann kein eigenes SSML einschleusen', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await pipeline(GOOGLE).synthesize('Hör zu <break time="10s"/> & </prosody><audio src="http://x"/> fertig.');
    const ssml = JSON.parse(String(seen[0].body)).input.ssml as string;
    assert.equal(ssml.includes('<audio'), false);
    assert.equal(ssml.includes('<break time="10s"'), false);
    assert.equal((ssml.match(/<speak>/g) ?? []).length, 1);
    assert.equal((ssml.match(/<\/prosody>/g) ?? []).length, 1);
  });
});

test('Google: ein langer Text geht in mehreren SSML-Anfragen unter 5000 Bytes, der Wortlaut bleibt gleich', async () => {
  const sentence = 'Der mutige Ritter ritt durch den dunklen Wald, und die Vögel sangen laut.';
  // 120 Sätze sind etwa 8800 Zeichen, also unter der Obergrenze von 12.000 Zeichen je Aufruf.
  const text = Array.from({ length: 120 }, () => sentence).join(' ');
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await pipeline({ ...GOOGLE, googleTtsPauseMs: '0' }).synthesize(text);
    assert.ok(seen.length > 1);
    const spoken: string[] = [];
    for (const request of seen) {
      const input = JSON.parse(String(request.body)).input as { ssml: string };
      assert.ok(Buffer.byteLength(input.ssml, 'utf8') <= 4800);
      spoken.push(spokenFrom(input));
    }
    assert.equal(spoken.join(' '), text);
  });
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await pipeline(GOOGLE).synthesize(text);
    assert.ok(seen.length > 1);
    const spoken: string[] = [];
    for (const request of seen) {
      const input = JSON.parse(String(request.body)).input as { ssml: string };
      assert.ok(Buffer.byteLength(input.ssml, 'utf8') <= 4800, `zu groß: ${Buffer.byteLength(input.ssml, 'utf8')}`);
      spoken.push(spokenFrom(input));
    }
    assert.equal(spoken.join(' '), text);
  });
});

test('Google: ein langer Text ohne SSML geht in Text-Stücken bis 4000 Bytes und wird zu einem WAV zusammengesetzt', async () => {
  const sentence = 'Der mutige Ritter ritt durch den dunklen Wald, und die Vögel sangen laut.';
  const text = Array.from({ length: 120 }, () => sentence).join(' ');
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const result = await pipeline({ ...GOOGLE, googleTtsPitch: '0', googleTtsPauseMs: '0' }).synthesize(text);
    assert.ok(seen.length > 1);
    const spoken: string[] = [];
    for (const request of seen) {
      const input = JSON.parse(String(request.body)).input.text as string;
      assert.ok(Buffer.byteLength(input, 'utf8') <= 4000);
      spoken.push(input);
    }
    assert.equal(spoken.join(' '), text);
    const header = decodeWavHeader(result);
    assert.equal(header.sampleRate, 16_000);
    // Ohne Pause nichts dazwischen: jedes Stück liefert 1600 Bilder bei 16 kHz.
    assert.equal(result.length, 44 + seen.length * 1600 * 2);
  });
});

test('Google: zwischen zwei Stücken eines langen Textes steht Stille in Länge der Pause (500 ms = 8000 Bilder bei 16 kHz)', async () => {
  const sentence = 'Der mutige Ritter ritt durch den dunklen Wald, und die Vögel sangen laut.';
  const text = Array.from({ length: 120 }, () => sentence).join(' ');
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const result = await pipeline(GOOGLE).synthesize(text);
    assert.ok(seen.length > 1);
    const speech = seen.length * 1600 * 2;
    const silence = (seen.length - 1) * 8000 * 2;
    assert.equal(result.length, 44 + speech + silence);
  });
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const result = await pipeline({ ...GOOGLE, googleTtsPauseMs: '300' }).synthesize(text);
    assert.equal(result.length, 44 + seen.length * 1600 * 2 + (seen.length - 1) * 4800 * 2);
  });
});

test('Google: leerer Text ist ein Fehler ohne Anfrage', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await assert.rejects(() => pipeline(GOOGLE).synthesize('  \n '), VoiceProviderError);
    assert.equal(seen.length, 0);
  });
});

test('Google: 400/401/403 sind nicht wiederholbar, 429 und 503 wiederholbar; der Schlüssel steht in keiner Fehlermeldung', async () => {
  for (const [status, retryable] of [[400, false], [401, false], [403, false], [429, true], [503, true]] as const) {
    await withFetch(() => new Response('Fehlertext', { status }), async () => {
      await assert.rejects(
        () => pipeline(GOOGLE).synthesize('Hallo'),
        (error: unknown) =>
          error instanceof VoiceProviderError &&
          error.retryable === retryable &&
          /Google/.test(error.message) &&
          !error.message.includes(GOOGLE_KEY)
      );
    });
  }
});

test('Google: eine Antwort ohne Audio oder mit kaputtem JSON ist ein Fehler', async () => {
  await withFetch(() => new Response(JSON.stringify({}), { status: 200 }), async () => {
    await assert.rejects(
      () => pipeline(GOOGLE).synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === false
    );
  });
  await withFetch(() => new Response(JSON.stringify({ audioContent: '' }), { status: 200 }), async () => {
    await assert.rejects(() => pipeline(GOOGLE).synthesize('Hallo'), VoiceProviderError);
  });
  await withFetch(() => new Response('kein json', { status: 200 }), async () => {
    await assert.rejects(
      () => pipeline(GOOGLE).synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true
    );
  });
  // Audio, das kein WAV ist.
  await withFetch(() => new Response(JSON.stringify({ audioContent: Buffer.from('kein wav').toString('base64') }), { status: 200 }), async () => {
    await assert.rejects(() => pipeline(GOOGLE).synthesize('Hallo'), VoiceProviderError);
  });
});

test('Google: Netzwerkfehler und Zeitüberschreitung sind wiederholbare VoiceProviderError', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error('getrennt'); }) as unknown as typeof fetch;
    await assert.rejects(
      () => pipeline(GOOGLE).synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true && /Google/.test(error.message)
    );
    globalThis.fetch = (async () => { const e = new Error('abgebrochen'); e.name = 'AbortError'; throw e; }) as unknown as typeof fetch;
    await assert.rejects(
      () => pipeline(GOOGLE).synthesize('Hallo'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true && error.message === 'TTS-Timeout'
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Google: die Sprachausgabe ist nur mit gültigem Schlüssel und gültiger Stimme konfiguriert; die Erkennung bleibt unberührt', () => {
  const google = pipeline(GOOGLE);
  assert.equal(google.ttsConfigured, true);
  assert.equal(google.sttConfigured, true);

  assert.equal(pipeline({ ...GOOGLE, googleTtsKey: null }).ttsConfigured, false);
  assert.equal(pipeline({ ...GOOGLE, googleTtsKey: 'mit Leerzeichen drin' }).ttsConfigured, false);
  assert.equal(pipeline({ ...GOOGLE, googleTtsVoice: '' }).ttsConfigured, false);
  assert.equal(pipeline({ ...GOOGLE, googleTtsVoice: 'Algenib' }).ttsConfigured, false);
  // Die Einstellungen des OpenAI-kompatiblen Dienstes machen Google nicht startklar.
  assert.equal(pipeline({ ttsProvider: 'google', googleTtsKey: null }).ttsConfigured, false);
  // Und umgekehrt: Google-Werte ohne ausdrücklichen Anbieter ändern nichts am Standard.
  assert.equal(pipeline({ ...GOOGLE, ttsProvider: 'openai-compatible', ttsUrl: null }).ttsConfigured, false);
});

test('Google: die Erkennung geht weiter an den eigenen Server, nie an Google', async () => {
  await recordRequests(async (seen) => {
    await pipeline(GOOGLE).transcribe(silentWav());
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://127.0.0.1:8001/v1/audio/transcriptions');
  });
});

test('Google: feste Texte werden einmal synthetisiert und danach aus dem Speicher gesprochen', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    const voice = pipeline(GOOGLE);
    const first = await voice.synthesizeCached('Das habe ich leider nicht richtig verstanden.');
    const second = await voice.synthesizeCached('Das habe ich leider nicht richtig verstanden.');
    assert.equal(seen.length, 1);
    assert.equal(first, second);
  });
});

test('Google: Text über 12.000 Zeichen wird wie bei der anderen Sprachausgabe begrenzt', async () => {
  await recordGoogleRequests(() => googleResponse(), async (seen) => {
    await pipeline(GOOGLE).synthesize('Wort. '.repeat(5000));
    const spoken = seen
      .map((request) => spokenFrom(JSON.parse(String(request.body)).input as { ssml: string }))
      .join(' ');
    assert.ok(spoken.length <= 12_000);
    assert.ok(spoken.length > 11_000);
  });
});

// ---------------------------------------------------------------------------
// Pocket TTS (eigener Server, POST /tts mit Formularfeldern)
// ---------------------------------------------------------------------------

const POCKET: Partial<KunibertConfig> = {
  ttsProvider: 'pocket',
  pocketTtsUrl: 'http://127.0.0.1:8003',
  pocketTtsVoice: 'juergen',
  pocketTtsTempo: '1',
  pocketTtsPauseMs: '',
  // Die Adresse der OpenAI-kompatiblen Sprachausgabe darf bei Pocket keine Rolle spielen.
  ttsUrl: 'http://127.0.0.1:8002/v1',
  ttsModel: 'tts-test-modell',
  ttsVoice: 'test-stimme',
};

/** Antwort wie bei Pocket TTS: WAV, 24 kHz Mono; mit `streaming` steht im Kopf eine unbekannte Länge (0xFFFFFFFF). */
function pocketResponse(frames = 2400, streaming = false): Response {
  const wav = encodeWav(Buffer.alloc(frames * 2, 1), 24_000, 1, 16);
  if (streaming) {
    wav.writeUInt32LE(0xffffffff, 4);
    wav.writeUInt32LE(0xffffffff, 40);
  }
  return new Response(new Uint8Array(wav), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
}

async function recordPocketRequests<T>(respond: () => Response, fn: (seen: SeenRequest[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const seen: SeenRequest[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
    return respond();
  }) as unknown as typeof fetch;
  try {
    return await fn(seen);
  } finally {
    globalThis.fetch = original;
  }
}

const formField = (request: SeenRequest, name: string): string | null => {
  const value = (request.body as FormData).get(name);
  return typeof value === 'string' ? value : null;
};

test('Pocket: ein Satz geht als Formular an /tts, Stimme juergen, Ergebnis 16 kHz Mono', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    const result = await pipeline(POCKET).synthesize('Es war einmal ein mutiger Ritter.');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://127.0.0.1:8003/tts');
    assert.ok(seen[0].body instanceof FormData);
    assert.equal(formField(seen[0], 'text'), 'Es war einmal ein mutiger Ritter.');
    assert.equal(formField(seen[0], 'voice_url'), 'juergen');
    assert.equal('Authorization' in seen[0].headers, false);
    // 2400 Bilder bei 24 kHz sind 0,1 s; bei 16 kHz Mono sind es 1600 Bilder (Tempo 1: unverändert).
    const header = decodeWavHeader(result);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(result.length, 44 + 1600 * 2);
  });
});

test('Pocket: der Stream-Kopf mit unbekannter Länge wird gelesen', async () => {
  await recordPocketRequests(() => pocketResponse(2400, true), async () => {
    const result = await pipeline(POCKET).synthesize('Es war einmal ein mutiger Ritter.');
    assert.equal(decodeWavHeader(result).sampleRate, 16_000);
    assert.equal(result.length, 44 + 1600 * 2);
  });
});

test('Pocket: jeder Satz ist eine Anfrage, dazwischen Stille nach Satzlänge (500 ms = 8000 Bilder bei 16 kHz)', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    const result = await pipeline(POCKET).synthesize('Es war einmal ein mutiger Ritter. Er ritt durch den dunklen Wald.');
    assert.equal(seen.length, 2);
    assert.equal(formField(seen[0], 'text'), 'Es war einmal ein mutiger Ritter.');
    assert.equal(formField(seen[1], 'text'), 'Er ritt durch den dunklen Wald.');
    assert.equal(result.length, 44 + (1600 + 8000 + 1600) * 2);
    // Die Stille steht zwischen den beiden Sätzen und besteht aus Nullen.
    const pcm = result.subarray(44);
    assert.ok(pcm.subarray(1600 * 2, (1600 + 8000) * 2).every((byte) => byte === 0));
    assert.ok(pcm.subarray(0, 1600 * 2).some((byte) => byte !== 0));
    assert.ok(pcm.subarray((1600 + 8000) * 2).some((byte) => byte !== 0));
  });
});

test('Pocket: Absätze bekommen die längere Pause (900 ms), Pause 0 schaltet alle Pausen aus', async () => {
  const text = 'Eins zwei drei vier fünf. Sechs sieben acht neun zehn.\nElf zwölf dreizehn vierzehn fünfzehn.';
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    const result = await pipeline(POCKET).synthesize(text);
    assert.equal(seen.length, 3);
    assert.equal(result.length, 44 + (3 * 1600 + 8000 + 14_400) * 2);
  });
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    const result = await pipeline({ ...POCKET, pocketTtsPauseMs: '0' }).synthesize(text);
    assert.equal(seen.length, 3);
    assert.equal(result.length, 44 + 3 * 1600 * 2);
  });
  await recordPocketRequests(() => pocketResponse(), async () => {
    const result = await pipeline({ ...POCKET, pocketTtsPauseMs: '300' }).synthesize(text);
    // Satz 1: 300 ms, Absatzende: 540 ms.
    assert.equal(result.length, 44 + (3 * 1600 + 4800 + 8640) * 2);
  });
});

test('Pocket: das Tempo verlängert jeden Satz, ohne die Pause zu verändern', async () => {
  // 2400 Bilder bei 24 kHz sind 1600 Bilder bei 16 kHz; bei Tempo 0,8 werden daraus 2000.
  await recordPocketRequests(() => pocketResponse(), async () => {
    const result = await pipeline({ ...POCKET, pocketTtsTempo: '0.8' }).synthesize('Es war einmal ein mutiger Ritter. Er ritt durch den dunklen Wald.');
    assert.equal(result.length, 44 + (2000 + 8000 + 2000) * 2);
  });
  // Standard ohne Angabe: 0,9, aus 1600 werden 1778.
  await recordPocketRequests(() => pocketResponse(), async () => {
    const result = await pipeline({ ...POCKET, pocketTtsTempo: '' }).synthesize('Es war einmal ein mutiger Ritter.');
    assert.equal(result.length, 44 + 1778 * 2);
  });
  // Ungültiges Tempo ergibt den Standard.
  await recordPocketRequests(() => pocketResponse(), async () => {
    const result = await pipeline({ ...POCKET, pocketTtsTempo: 'langsam' }).synthesize('Es war einmal ein mutiger Ritter.');
    assert.equal(result.length, 44 + 1778 * 2);
  });
});

test('Pocket: eigene Stimme und Adresse mit abschließendem Schrägstrich werden übernommen', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    await pipeline({ ...POCKET, pocketTtsUrl: 'http://127.0.0.1:8003/', pocketTtsVoice: 'hf://kyutai/tts-voices/voice-zero/stimme.wav' }).synthesize('Hallo zusammen.');
    assert.equal(seen[0].url, 'http://127.0.0.1:8003/tts');
    assert.equal(formField(seen[0], 'voice_url'), 'hf://kyutai/tts-voices/voice-zero/stimme.wav');
  });
});

test('Pocket: typografische Apostrophe werden geglättet', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    await pipeline(POCKET).synthesize('Das gibt’s doch gar nicht.');
    assert.equal(formField(seen[0], 'text'), "Das gibt's doch gar nicht.");
  });
});

test('Pocket: leerer Text ist ein Fehler ohne Anfrage', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    await assert.rejects(() => pipeline(POCKET).synthesize('  \n '), VoiceProviderError);
    assert.equal(seen.length, 0);
  });
});

test('Pocket: Text über 12.000 Zeichen wird wie bei den anderen Sprachausgaben begrenzt', async () => {
  await recordPocketRequests(() => pocketResponse(240), async (seen) => {
    await pipeline({ ...POCKET, pocketTtsPauseMs: '0' }).synthesize('Wort wort wort wort. '.repeat(2000));
    const spoken = seen.map((request) => formField(request, 'text') ?? '').join(' ');
    assert.ok(spoken.length <= 12_000);
    assert.ok(spoken.length > 11_000);
  });
});

test('Pocket: 400 ist nicht wiederholbar, 429 und 503 wiederholbar; ein Fehler bricht die ganze Ausgabe ab', async () => {
  for (const [status, retryable] of [[400, false], [500, true], [429, true], [503, true]] as const) {
    await withFetch(() => new Response('Fehlertext', { status }), async () => {
      await assert.rejects(
        () => pipeline(POCKET).synthesize('Es war einmal ein mutiger Ritter. Er ritt los und sang.'),
        (error: unknown) => error instanceof VoiceProviderError && error.retryable === retryable && /Pocket/.test(error.message)
      );
    });
  }
  // Der zweite Satz scheitert: kein halbes Ergebnis.
  let calls = 0;
  await withFetch(() => (++calls === 1 ? pocketResponse() : new Response('kaputt', { status: 503 })), async () => {
    await assert.rejects(() => pipeline(POCKET).synthesize('Es war einmal ein mutiger Ritter. Er ritt durch den dunklen Wald.'), VoiceProviderError);
    assert.equal(calls, 2);
  });
});

test('Pocket: Antwort ohne WAV oder ohne Audio ist ein Fehler', async () => {
  await withFetch(() => new Response('kein wav', { status: 200 }), async () => {
    await assert.rejects(() => pipeline(POCKET).synthesize('Hallo zusammen.'), VoiceProviderError);
  });
  await withFetch(() => pocketResponse(0), async () => {
    await assert.rejects(() => pipeline(POCKET).synthesize('Hallo zusammen.'), VoiceProviderError);
  });
});

test('Pocket: Netzwerkfehler und Zeitüberschreitung sind wiederholbare VoiceProviderError', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error('getrennt'); }) as unknown as typeof fetch;
    await assert.rejects(
      () => pipeline(POCKET).synthesize('Hallo zusammen.'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true && /Pocket/.test(error.message)
    );
    globalThis.fetch = (async () => { const e = new Error('abgebrochen'); e.name = 'AbortError'; throw e; }) as unknown as typeof fetch;
    await assert.rejects(
      () => pipeline(POCKET).synthesize('Hallo zusammen.'),
      (error: unknown) => error instanceof VoiceProviderError && error.retryable === true && error.message === 'TTS-Timeout'
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Pocket: die Sprachausgabe ist nur mit gültiger Adresse und Stimme konfiguriert; die Erkennung bleibt unberührt', async () => {
  assert.equal(pipeline(POCKET).ttsConfigured, true);
  assert.equal(pipeline(POCKET).sttConfigured, true);
  assert.equal(pipeline({ ...POCKET, pocketTtsUrl: null }).ttsConfigured, false);
  assert.equal(pipeline({ ...POCKET, pocketTtsUrl: 'kein-url' }).ttsConfigured, false);
  assert.equal(pipeline({ ...POCKET, pocketTtsUrl: 'http://127.0.0.1:8003/v1' }).ttsConfigured, false);
  assert.equal(pipeline({ ...POCKET, pocketTtsVoice: '' }).ttsConfigured, false);
  assert.equal(pipeline({ ...POCKET, pocketTtsVoice: 'Jürgen' }).ttsConfigured, false);
  // Die Einstellungen des OpenAI-kompatiblen Dienstes machen Pocket nicht startklar.
  assert.equal(pipeline({ ttsProvider: 'pocket', pocketTtsUrl: null }).ttsConfigured, false);
  // Die Erkennung geht weiter an den eigenen Server, nie an Pocket.
  await recordRequests(async (seen) => {
    await pipeline(POCKET).transcribe(silentWav());
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'http://127.0.0.1:8001/v1/audio/transcriptions');
  });
});

test('Pocket: feste Texte werden einmal synthetisiert und danach aus dem Speicher gesprochen', async () => {
  await recordPocketRequests(() => pocketResponse(), async (seen) => {
    const voice = pipeline(POCKET);
    const first = await voice.synthesizeCached('Das habe ich leider nicht richtig verstanden.');
    const second = await voice.synthesizeCached('Das habe ich leider nicht richtig verstanden.');
    assert.equal(seen.length, 1);
    assert.equal(first, second);
  });
});
