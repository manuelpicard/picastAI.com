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
  const body = JSON.parse(String(seen!.init.body));
  assert.equal(body.model, 'claude-test');
  assert.equal(body.max_tokens, 700);
  assert.equal(body.system, 'Du bist Kunibert.');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Hallo' }]);
  assert.deepEqual(body.tool_choice, { type: 'tool', name: 'antwort' });
  assert.equal(body.tools[0].name, 'antwort');
  assert.deepEqual(body.tools[0].input_schema, SCHEMA);
});

test('AnthropicProvider: HTTP-Fehler, fehlendes Tool-Ergebnis und Netzwerkfehler sind LlmError', async () => {
  const make = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    new AnthropicProvider({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch(handler) });

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
