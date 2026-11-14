import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLlmProvider } from './config.js';
import { AnthropicProvider, createLlmProvider, LlmError, parseJsonObject, type JsonSchema } from './llm.js';

const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['frage', 'geschichte'] },
    done: { type: 'boolean' },
  },
  required: ['category', 'done'],
};

const REQUEST = { system: 'Du bist Kunibert.', user: 'Hallo', schemaName: 'antwort', schema: SCHEMA };

test('parseJsonObject: Objekt, Codeblock, leer, kaputt, Liste', () => {
  assert.deepEqual(parseJsonObject('{"a":1}', 'T'), { a: 1 });
  assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```', 'T'), { a: 1 });
  assert.throws(() => parseJsonObject('', 'T'), LlmError);
  assert.throws(() => parseJsonObject(undefined, 'T'), LlmError);
  assert.throws(() => parseJsonObject('kein json', 'T'), LlmError);
  assert.throws(() => parseJsonObject('[1,2]', 'T'), LlmError);
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string, init: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

test('AnthropicProvider sendet erzwungenen Tool-Aufruf und liefert das Tool-Ergebnis', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const provider = new AnthropicProvider({
    apiKey: 'sk-test',
    model: 'claude-test',
    baseUrl: 'https://api.example.test/',
    fetchImpl: fakeFetch((url, init) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'ignoriert' }, { type: 'tool_use', name: 'antwort', input: { category: 'frage', done: true } }] }),
        { status: 200 }
      );
    }),
  });
  const result = await provider.generateJson({ ...REQUEST, maxOutputTokens: 700 });
  assert.deepEqual(result, { category: 'frage', done: true });

  assert.equal(seen!.url, 'https://api.example.test/v1/messages');
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'sk-test');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(headers['anthropic-workspace-id'], undefined, 'ohne Einstellung kein Arbeitsbereich-Kopf');
  const body = JSON.parse(String(seen!.init.body));
  assert.equal(body.model, 'claude-test');
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.system, [{ type: 'text', text: 'Du bist Kunibert.', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Hallo' }]);
  assert.deepEqual(body.tool_choice, { type: 'auto' }, 'erzwungenes Werkzeug lehnt claude-sonnet-5-5 mit HTTP 400 ab');
  assert.equal(body.tools[0].name, 'antwort');
  assert.deepEqual(body.tools[0].input_schema, SCHEMA);
});

test('AnthropicProvider: HTTP-Fehler, fehlendes Tool-Ergebnis und Netzwerkfehler sind LlmError', async () => {
  const make = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    new AnthropicProvider({ apiKey: 'k', model: 'm', retryDelayMs: 0, fetchImpl: fakeFetch(handler) });

  await assert.rejects(
    () => make(() => new Response('overloaded', { status: 529 })).generateJson(REQUEST),
    (error: unknown) => error instanceof LlmError && /529/.test(error.message)
  );
  await assert.rejects(
    () => make(() => new Response(JSON.stringify({ content: [{ type: 'text', text: 'nur Text' }] }), { status: 200 })).generateJson(REQUEST),
    LlmError
  );
  await assert.rejects(
    () => make(() => { throw new Error('ECONNRESET'); }).generateJson(REQUEST),
    (error: unknown) => error instanceof LlmError && /Netzwerkfehler/.test(error.message)
  );
});

test('AnthropicProvider: Zeitüberschreitung wird als LlmError gemeldet', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'k',
    model: 'm',
    timeoutMs: 20,
    fetchImpl: ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('abgebrochen'), { name: 'AbortError' })));
      })) as unknown as typeof fetch,
  });
  await assert.rejects(
    () => provider.generateJson(REQUEST),
    (error: unknown) => error instanceof LlmError && /Zeitüberschreitung/.test(error.message)
  );
});

test('resolveLlmProvider: ausdrücklich, sonst Anthropic nach Key; Gemini gibt es nicht mehr', () => {
  assert.equal(resolveLlmProvider({}), 'none');
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a' }), 'anthropic');
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a', PICASTAI_LLM_PROVIDER: 'anthropic' }), 'anthropic');
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a', PICASTAI_LLM_PROVIDER: 'none' }), 'none');
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a', PICASTAI_LLM_PROVIDER: 'unsinn' }), 'anthropic');
  assert.equal(resolveLlmProvider({ PICASTAI_LLM_PROVIDER: 'unsinn' }), 'none');
  // Ein ausdrückliches "gemini" wechselt nicht still zu Anthropic, sondern schaltet das Sprachmodell ab.
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a', PICASTAI_LLM_PROVIDER: 'gemini' }), 'none');
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a', PICASTAI_LLM_PROVIDER: ' Gemini ' }), 'none');
});

test('createLlmProvider: liefert den Anbieter nur mit passendem Key', () => {
  const base = {
    anthropicModel: 'a-model',
    anthropicBaseUrl: 'https://api.anthropic.com',
    llmTimeoutMs: 30_000,
    anthropicApiKey: null,
    anthropicWorkspaceId: null,
  };
  assert.equal(createLlmProvider({ ...base, llmProvider: 'none' }), null);
  assert.equal(createLlmProvider({ ...base, llmProvider: 'anthropic' }), null, 'Anthropic ohne Key');
  const claude = createLlmProvider({ ...base, llmProvider: 'anthropic', anthropicApiKey: 'a' });
  assert.equal(claude?.name, 'anthropic');
  assert.equal(claude?.model, 'a-model');
});

test('AnthropicProvider: eine kürzere Frist aus dem Zeitbudget der Anfrage gilt vor der eigenen Grenze', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'k',
    model: 'm',
    timeoutMs: 60_000,
    fetchImpl: ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('abgebrochen'), { name: 'AbortError' })));
      })) as unknown as typeof fetch,
  });
  const started = Date.now();
  await assert.rejects(
    () => provider.generateJson({ ...REQUEST, timeoutMs: 20 }),
    (error: unknown) => error instanceof LlmError && /Zeitüberschreitung/.test(error.message)
  );
  assert.ok(Date.now() - started < 5_000);
});

const OK_BODY = JSON.stringify({ content: [{ type: 'tool_use', name: 'antwort', input: { category: 'frage', done: true } }] });

test('AnthropicProvider: vorübergehender Fehler (529, 429, Netzwerk) wird genau einmal wiederholt', async () => {
  for (const first of [() => new Response('overloaded', { status: 529 }), () => new Response('rate', { status: 429 }), () => { throw new Error('ECONNRESET'); }]) {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: 'k', model: 'm', retryDelayMs: 0,
      fetchImpl: fakeFetch(() => (++calls === 1 ? first() : new Response(OK_BODY, { status: 200 }))),
    });
    assert.deepEqual(await provider.generateJson(REQUEST), { category: 'frage', done: true });
    assert.equal(calls, 2);
  }
  let calls = 0;
  const always = new AnthropicProvider({
    apiKey: 'k', model: 'm', retryDelayMs: 0,
    fetchImpl: fakeFetch(() => { calls++; return new Response('overloaded', { status: 529 }); }),
  });
  await assert.rejects(() => always.generateJson(REQUEST), LlmError);
  assert.equal(calls, 2, 'höchstens ein zweiter Versuch');
});

test('AnthropicProvider: keine Wiederholung bei 400/401, bei fehlendem Tool-Ergebnis oder zu wenig Restzeit', async () => {
  for (const status of [400, 401, 404]) {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: 'k', model: 'm', retryDelayMs: 0,
      fetchImpl: fakeFetch(() => { calls++; return new Response('nein', { status }); }),
    });
    await assert.rejects(() => provider.generateJson(REQUEST), LlmError);
    assert.equal(calls, 1, `HTTP ${status}`);
  }
  let calls = 0;
  const short = new AnthropicProvider({
    apiKey: 'k', model: 'm', retryDelayMs: 0,
    fetchImpl: fakeFetch(() => { calls++; return new Response('overloaded', { status: 529 }); }),
  });
  await assert.rejects(() => short.generateJson({ ...REQUEST, timeoutMs: 2_000 }), LlmError);
  assert.equal(calls, 1, 'unter 3 s Restzeit kein zweiter Versuch');
});

test('AnthropicProvider: Arbeitsbereich-Kopf bei gesetzter ID; fehlender Arbeitsbereich wird als fester Hinweis gemeldet, ohne Fließtext', async () => {
  let headers: Record<string, string> = {};
  const ok = new AnthropicProvider({
    apiKey: 'k', model: 'm', workspaceId: 'wrkspc_01ABCDEFGHJK',
    fetchImpl: fakeFetch((_url, init) => {
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { ok: true } }] }), { status: 200 });
    }),
  });
  await ok.generateJson(REQUEST);
  assert.equal(headers['anthropic-workspace-id'], 'wrkspc_01ABCDEFGHJK');

  const body = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-workspace-id is required when authenticating with an identity-linked API key; GEHEIMER TEXT' } });
  const missing = new AnthropicProvider({ apiKey: 'k', model: 'm', retryDelayMs: 0, fetchImpl: fakeFetch(() => new Response(body, { status: 400 })) });
  await assert.rejects(
    () => missing.generateJson(REQUEST),
    (error: unknown) => error instanceof LlmError && /HTTP 400 \(invalid_request_error\)/.test(error.message)
      && /PICASTAI_ANTHROPIC_WORKSPACE_ID/.test(error.message) && !/GEHEIMER/.test(error.message) && !error.transient
  );
});

test('AnthropicProvider meldet die Token-Zahlen der Antwort (onUsage)', async () => {
  const provider = new AnthropicProvider({
    apiKey: 'sk-test',
    model: 'claude-test',
    fetchImpl: fakeFetch(() => new Response(JSON.stringify({
      content: [{ type: 'tool_use', name: 'antwort', input: { ok: true } }],
      usage: { input_tokens: 7, output_tokens: 8, cache_creation_input_tokens: 9, cache_read_input_tokens: 10 },
    }), { status: 200 })),
  });
  const seen: unknown[] = [];
  await provider.generateJson({ ...REQUEST, onUsage: (usage) => seen.push(usage) });
  assert.deepEqual(seen, [{ input: 7, output: 8, cacheWrite: 9, cacheRead: 10 }]);
});
