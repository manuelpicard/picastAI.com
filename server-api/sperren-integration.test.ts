// Integrationstest: Nach dem Sperren geht nichts mehr an Claude (Punkt N1120-1610-b der Arbeitsliste).
//
// Der Server (server.ts) läuft als Kindprozess. Als Sprachmodell dient eine Attrappe, die jeden Aufruf
// mitschreibt und Aufrufe anhalten kann; als Sprachdienst eine zweite Attrappe, deren Erkennung und
// Sprachausgabe sich ebenfalls anhalten lassen. Geprüft wird von außen, dass nach dem Sperren, nach
// einem Widerruf der Einwilligung und im Schlafmodus kein neuer Aufruf an Claude hinausgeht:
//   1. während der Spracherkennung (Sprechtaste und /v1/turn),
//   2. während die Erzähltaste auf die Vorbereitung des nächsten Teils wartet,
//   3. im Ton-Strom, vor dem ersten Ton und während der Strom läuft.
// Es gibt keine echten Aufrufe und keine echten Schlüssel; alle Werte unten sind erfunden.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeWav } from './audio.js';
import { pairAndConsent } from './eltern-testhilfe.js';
import { CONSENT_MISSING_DE, SLEEPING_DE } from './eltern.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN = 'test-admin-token-sperren-0123456789-abcdefghij';
const FAKE_ANTHROPIC_KEY = 'attrappen-schluessel-sperren-4711';
const PUBLIC_BASE_URL = 'https://kunibert.test';

// Teil N der Attrappe: zwei Absätze mit je zwei Sätzen, Zahlwörter statt Ziffern (wie stopp-integration.test.ts).
const WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];
const storyText = (part: number) =>
  `Teil ${WORDS[part]} beginnt im Gasthaus. Kunibert zog die Stiefel an.\n\nDie Kutsche fuhr zum Wald. Dort endete Teil ${WORDS[part]}.`;
/** Steht nur im zweiten Absatz jedes Teils: Daran hält die Attrappe der Sprachausgabe an. */
const SECOND_PARAGRAPH = 'Kutsche';
/** Steht in jedem Auftrag für einen späteren Teil („Bisher …“): So zeigt ein Auftrag, ob der alte Stand darin steckt. */
const summaryOf = (part: number) => `Zusammenfassung bis Teil ${part}.`;

interface ClaudeCall {
  schema: string;
  user: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
  });
}

async function waitFor(condition: () => boolean, what: string, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Zeit abgelaufen: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attrappe für die Messages-API. Fragen beantwortet sie („Das weiß ich.“), Geschichten erzählt sie als
 * Teil N, den der Auftrag nennt (mit Ton-Strom als Server-Sent Events). `holdIf`: Diese Aufrufe warten,
 * bis `release` sie freigibt; mit `fail` antworten sie dann mit HTTP 400. Ein bleibender Fehler: `llm.ts`
 * wiederholt ihn nicht (anders als 429 und 5xx).
 */
function startFakeClaude() {
  const calls: ClaudeCall[] = [];
  const held: Array<(fail: boolean) => void> = [];
  const state = { holdIf: null as null | ((call: ClaudeCall) => boolean) };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        tools?: Array<{ name: string }>;
        messages: Array<{ content: string }>;
        stream?: boolean;
      };
      const call = { schema: body.tools?.[0]?.name ?? '', user: String(body.messages[0]?.content ?? '') };
      calls.push(call);
      if (state.holdIf?.(call)) {
        const fail = await new Promise<boolean>((resolve) => held.push(resolve));
        if (fail) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end('{"type":"error","error":{"type":"invalid_request_error"}}');
          return;
        }
      }
      let input: Record<string, unknown>;
      if (call.schema === 'kunibert_antwort') {
        input = { category: 'frage', speech: 'Das weiß ich.' };
      } else {
        const part = Number(call.user.match(/Teil (\d+) von/)?.[1] ?? 1);
        input = {
          episode_plan: part === 1 ? 'Plan: Kunibert findet heute den Weg zur Hexe.' : '',
          text: storyText(part),
          summary: summaryOf(part),
          open_threads: 'offen',
          next_hook: `Haken nach Teil ${part}.`,
          episode_finished: false,
        };
      }
      const usage = { input_tokens: 10, output_tokens: 10 };
      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'tool_use', name: call.schema, input }], usage }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (event: Record<string, unknown>) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      send({ type: 'message_start', message: { usage } });
      send({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: call.schema, input: {} } });
      const json = JSON.stringify(input);
      for (let i = 0; i < json.length; i += 20) send({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 20) } });
      send({ type: 'content_block_stop', index: 0 });
      send({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage });
      send({ type: 'message_stop' });
      res.end();
    });
  });
  return {
    server,
    calls,
    state,
    get waiting() {
      return held.length;
    },
    /** Gibt alle angehaltenen Aufrufe frei. */
    release(fail = false) {
      for (const resolve of held.splice(0)) resolve(fail);
    },
    listening: listen(server),
  };
}

/**
 * Attrappe für Erkennung und Sprachausgabe (16 kHz, stumm, 20 ms Ton je Zeichen). `holdStt`: Die
 * Erkennung wartet auf `releaseStt`. `holdTtsIf`: Texte mit diesem Stück warten auf `releaseTts`.
 */
function startFakeSpeech() {
  const sttHeld: Array<() => void> = [];
  const ttsHeld: Array<() => void> = [];
  const state = { holdStt: false, holdTtsIf: '' };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      if (req.url === '/audio/speech') {
        const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: string };
        if (state.holdTtsIf && input.includes(state.holdTtsIf)) await new Promise<void>((resolve) => ttsHeld.push(resolve));
        const samples = Math.round(input.length * 0.02 * 16_000);
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(samples * 2), 16_000, 1, 16));
        return;
      }
      if (req.url === '/audio/transcriptions') {
        if (state.holdStt) await new Promise<void>((resolve) => sttHeld.push(resolve));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'warum ist der himmel blau' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return {
    server,
    state,
    get sttWaiting() {
      return sttHeld.length;
    },
    get ttsWaiting() {
      return ttsHeld.length;
    },
    releaseStt() {
      state.holdStt = false;
      for (const resolve of sttHeld.splice(0)) resolve();
    },
    releaseTts() {
      state.holdTtsIf = '';
      for (const resolve of ttsHeld.splice(0)) resolve();
    },
    listening: listen(server),
  };
}

// Hörbare Aufnahme (Rechteckton): Stille würde der Server gar nicht erst erkennen lassen.
const wav16k = () => {
  const pcm = Buffer.alloc(16_000);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.floor(i / 32) % 2 === 0 ? 8000 : -8000, i);
  return encodeWav(pcm, 16_000, 1, 16);
};

function audioForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('audio', new Blob([new Uint8Array(wav16k())], { type: 'audio/wav' }), 'question.wav');
  return form;
}

interface Device {
  id: string;
  auth: Record<string, string>;
  /** Eltern-Cookie (gekoppelt, Einwilligung erteilt). */
  cookie: string;
}

/**
 * Server mit Attrappen. Ohne `NODE_ENV=production`, damit die Antworten den gesprochenen Text zeigen
 * (`KUNIBERT_DIAGNOSTIC_TEXT=1`); die Prüfung der Einwilligung ist trotzdem an (Standard).
 */
async function startKunibert(extraEnv: Record<string, string>) {
  const claude = startFakeClaude();
  const speech = startFakeSpeech();
  const [claudePort, speechPort, port] = await Promise.all([claude.listening, speech.listening, freePort()]);
  const base = `http://127.0.0.1:${port}`;
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(port),
    PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
    PICASTAI_PUBLIC_BASE_URL: PUBLIC_BASE_URL,
    PICASTAI_STT_URL: `http://127.0.0.1:${speechPort}`,
    PICASTAI_STT_MODEL: 'test-stt',
    PICASTAI_TTS_URL: `http://127.0.0.1:${speechPort}`,
    PICASTAI_TTS_MODEL: 'test-tts',
    PICASTAI_TTS_VOICE: 'test-voice',
    PICASTAI_LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: FAKE_ANTHROPIC_KEY,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${claudePort}`,
    KUNIBERT_RATE_LIMIT: '500',
    KUNIBERT_STORY_MIN_WORDS: '10',
    KUNIBERT_DIAGNOSTIC_TEXT: '1',
    ...extraEnv,
  };
  for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT']) {
    if (process.env[name]) env[name] = process.env[name] as string;
  }
  let counter = 0;
  const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const kunibert = {
    claude,
    speech,
    base,
    output: '',
    child: spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcess,

    /** Neues Gerät, gekoppelt und mit Einwilligung. */
    async device(): Promise<Device> {
      const id = `sperren-${++counter}`;
      const res = await fetch(`${base}/api/devices`, {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: id, name: id }),
      });
      assert.equal(res.status, 200, await res.clone().text());
      const { token } = (await res.json()) as { token: string };
      const cookie = await pairAndConsent(base, ADMIN_TOKEN, id);
      return { id, auth: { Authorization: `Bearer ${token}`, 'X-Device-ID': id }, cookie };
    },

    lock(device: Device): Promise<Response> {
      return fetch(`${base}/api/devices/${device.id}/revoke`, { method: 'POST', headers: admin });
    },

    withdrawConsent(device: Device): Promise<Response> {
      return fetch(`${base}/v1/eltern/einwilligung`, { method: 'DELETE', headers: { Cookie: device.cookie } });
    },

    parentJson(device: Device, method: string, route: string, body: unknown): Promise<Response> {
      return fetch(`${base}/v1/eltern/${route}`, {
        method,
        headers: { Cookie: device.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    storyButton(device: Device, headers: Record<string, string> = {}): Promise<Response> {
      return fetch(`${base}/v1/device/kunibert-story`, {
        method: 'POST',
        headers: { ...device.auth, ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short' }),
      });
    },

    question(device: Device): Promise<Response> {
      return fetch(`${base}/v1/device/question`, { method: 'POST', headers: device.auth, body: audioForm() });
    },

    turn(device: Device, fields: Record<string, string>): Promise<Response> {
      return fetch(`${base}/v1/turn`, { method: 'POST', headers: device.auth, body: audioForm(fields) });
    },

    /** Aufrufe an Claude ab einer Position. */
    callsSince(mark: number): ClaudeCall[] {
      return claude.calls.slice(mark);
    },
  };
  kunibert.child.stdout?.on('data', (chunk: Buffer) => (kunibert.output += chunk));
  kunibert.child.stderr?.on('data', (chunk: Buffer) => (kunibert.output += chunk));
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (kunibert.child.exitCode !== null) throw new Error(`Server vorzeitig beendet (Code ${kunibert.child.exitCode}):\n${kunibert.output}`);
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // noch nicht bereit
    }
    if (Date.now() > deadline) throw new Error(`Server nicht rechtzeitig bereit:\n${kunibert.output}`);
    await pause(250);
  }
  return kunibert;
}

async function stopKunibert(k: Awaited<ReturnType<typeof startKunibert>> | undefined): Promise<void> {
  if (!k) return;
  k.claude.release();
  k.speech.releaseStt();
  k.speech.releaseTts();
  k.child.kill();
  await Promise.all([
    new Promise((resolve) => k.claude.server.close(resolve)),
    new Promise((resolve) => k.speech.server.close(resolve)),
  ]);
}

/**
 * Erster Teil auf der Erzähltaste; danach bereitet der Server Teil 2 im Hintergrund vor. Diese
 * Vorbereitung hält die Attrappe an, bis der Test sie freigibt.
 */
async function firstPartWithHeldPreparation(k: Awaited<ReturnType<typeof startKunibert>>, device: Device): Promise<void> {
  k.claude.state.holdIf = (call) => call.schema === 'kunibert_geschichte' && /Teil 2 von/.test(call.user);
  const first = await k.storyButton(device);
  assert.equal(first.status, 200, await first.clone().text());
  await waitFor(() => k.claude.waiting === 1, 'Vorbereitung von Teil 2 wartet bei Claude');
  k.claude.state.holdIf = null;
}

describe('Nach dem Sperren nichts mehr an Claude (echter Server, N1120-1610-b)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  before(async () => {
    k = await startKunibert({});
  });
  after(async () => {
    await stopKunibert(k);
  });

  it('Sprechtaste: während der Spracherkennung gesperrt: 401, die Äußerung geht nicht an Claude', async () => {
    const device = await k.device();
    k.speech.state.holdStt = true;
    const pending = k.question(device);
    await waitFor(() => k.speech.sttWaiting === 1, 'Erkennung läuft');
    const mark = k.claude.calls.length;
    assert.equal((await k.lock(device)).status, 200);
    k.speech.releaseStt();
    const res = await pending;
    assert.equal(res.status, 401);
    await pause(200);
    assert.deepEqual(k.callsSince(mark), [], 'kein Aufruf an Claude nach dem Sperren');
  });

  it('Sprechtaste: Einwilligung während der Spracherkennung widerrufen: fester Satz, nichts an Claude', async () => {
    const device = await k.device();
    k.speech.state.holdStt = true;
    const pending = k.question(device);
    await waitFor(() => k.speech.sttWaiting === 1, 'Erkennung läuft');
    const mark = k.claude.calls.length;
    assert.equal((await k.withdrawConsent(device)).status, 200);
    k.speech.releaseStt();
    const res = await pending;
    assert.equal(res.status, 200);
    const body = (await res.json()) as { text: string; session_end: boolean };
    assert.equal(body.text, CONSENT_MISSING_DE);
    assert.equal(body.session_end, true);
    assert.deepEqual(k.callsSince(mark), []);
  });

  it('/v1/turn: während der Spracherkennung gesperrt: 401, nichts an Claude', async () => {
    const device = await k.device();
    k.speech.state.holdStt = true;
    const pending = k.turn(device, { mode: 'frage' });
    await waitFor(() => k.speech.sttWaiting === 1, 'Erkennung läuft');
    const mark = k.claude.calls.length;
    assert.equal((await k.lock(device)).status, 200);
    k.speech.releaseStt();
    const res = await pending;
    assert.equal(res.status, 401);
    await pause(200);
    assert.deepEqual(k.callsSince(mark), [], 'kein Aufruf an Claude nach dem Sperren');
  });

  it('/v1/turn: Schlafmodus beginnt während der Spracherkennung: fester Satz, Stand unverändert, nichts an Claude', async () => {
    const device = await k.device();
    const sent = { part: 2, summary: 'Bisher geschah etwas.' };
    k.speech.state.holdStt = true;
    const pending = k.turn(device, { mode: 'frage', story_state: JSON.stringify(sent) });
    await waitFor(() => k.speech.sttWaiting === 1, 'Erkennung läuft');
    const mark = k.claude.calls.length;
    assert.equal((await k.parentJson(device, 'PUT', 'einstellungen', { schlafmodus: true })).status, 200);
    k.speech.releaseStt();
    const res = await pending;
    assert.equal(res.status, 200);
    const body = (await res.json()) as { kind: string; fixed: string; story_state: unknown; text: string };
    assert.equal(body.kind, 'hinweis');
    assert.equal(body.fixed, 'schlaf');
    assert.equal(body.text, SLEEPING_DE);
    assert.deepEqual(body.story_state, sent, 'der mitgeschickte Stand kommt unverändert zurück');
    assert.deepEqual(k.callsSince(mark), []);
  });

  it('Erzähltaste: beim Warten auf die Vorbereitung gesperrt: 401, kein neuer Aufruf an Claude', async () => {
    const device = await k.device();
    await firstPartWithHeldPreparation(k, device);
    const pending = k.storyButton(device);
    // Der Server wartet jetzt auf die Vorbereitung (prefetcher.take).
    await pause(300);
    const mark = k.claude.calls.length;
    assert.equal((await k.lock(device)).status, 200);
    k.claude.release(true); // Die Vorbereitung scheitert: Ohne Prüfung käme jetzt ein frischer Aufruf an Claude.
    const res = await pending;
    assert.equal(res.status, 401);
    await pause(200);
    assert.deepEqual(k.callsSince(mark), [], 'kein Aufruf an Claude nach dem Sperren');
  });

  it('Erzähltaste: Einwilligung beim Warten auf die Vorbereitung widerrufen: fester Satz, kein neuer Aufruf an Claude', async () => {
    const device = await k.device();
    await firstPartWithHeldPreparation(k, device);
    const pending = k.storyButton(device);
    await pause(300);
    const mark = k.claude.calls.length;
    assert.equal((await k.withdrawConsent(device)).status, 200);
    k.claude.release(true);
    const res = await pending;
    assert.equal(res.status, 200);
    const body = (await res.json()) as { text: string; session_end: boolean };
    assert.equal(body.text, CONSENT_MISSING_DE);
    assert.equal(body.session_end, true);
    await pause(200);
    assert.deepEqual(k.callsSince(mark), [], 'der alte Stand geht nach dem Widerruf nicht mehr an Claude');
  });

  it('Erzähltaste: Schlafmodus beim Warten auf die Vorbereitung: fester Satz, kein neuer Aufruf an Claude', async () => {
    const device = await k.device();
    await firstPartWithHeldPreparation(k, device);
    const pending = k.storyButton(device);
    await pause(300);
    const mark = k.claude.calls.length;
    assert.equal((await k.parentJson(device, 'PUT', 'einstellungen', { schlafmodus: true })).status, 200);
    k.claude.release(true);
    const res = await pending;
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { text: string }).text, SLEEPING_DE);
    await pause(200);
    assert.deepEqual(k.callsSince(mark), []);
  });

  it('Erzähltaste: Geschichte beim Warten neu begonnen: der alte Stand geht nicht mehr an Claude', async () => {
    const device = await k.device();
    await firstPartWithHeldPreparation(k, device);
    const pending = k.storyButton(device);
    await pause(300);
    const mark = k.claude.calls.length;
    assert.equal((await k.parentJson(device, 'POST', 'geschichte-neu', {})).status, 200);
    k.claude.release(true);
    const res = await pending;
    assert.equal(res.status, 200, await res.clone().text());
    const calls = k.callsSince(mark);
    assert.equal(calls.length, 1, 'genau ein frischer Aufruf');
    assert.match(calls[0].user, /Teil 1 von/, 'eine neue Folge beginnt');
    assert.ok(!calls[0].user.includes(summaryOf(1)), 'ohne den gelöschten Stand');
  });
});

describe('Nach dem Sperren nichts mehr an Claude, mit Ton-Strom (echter Server, N1120-1610-b)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  const stream = { 'X-Kunibert-Audio-Stream': '1' };
  before(async () => {
    k = await startKunibert({ PICASTAI_AUDIO_STREAM: '1' });
  });
  after(async () => {
    await stopKunibert(k);
  });

  it('gesperrt, bevor der erste Ton da ist: 401, kein Strom, keine Vorbereitung', async () => {
    const device = await k.device();
    k.claude.state.holdIf = (call) => call.schema === 'kunibert_geschichte';
    const pending = k.storyButton(device, stream);
    await waitFor(() => k.claude.waiting === 1, 'Claude schreibt Teil 1');
    k.claude.state.holdIf = null;
    const mark = k.claude.calls.length;
    assert.equal((await k.lock(device)).status, 200);
    k.claude.release();
    const res = await pending;
    assert.equal(res.status, 401);
    await pause(300);
    assert.deepEqual(k.callsSince(mark), [], 'keine Vorbereitung von Teil 2');
  });

  it('gesperrt, während der Strom läuft: kein Stand, keine Vorbereitung, also kein Aufruf an Claude', async () => {
    const device = await k.device();
    k.speech.state.holdTtsIf = SECOND_PARAGRAPH;
    const res = await k.storyButton(device, stream);
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as { audio_url: string; audio_stream?: boolean };
    assert.equal(body.audio_stream, true);
    // Das Gerät holt den Strom ab, bevor gesperrt wird (danach antwortet die Route mit 401).
    const audio = await fetch(k.base + new URL(body.audio_url).pathname, { headers: device.auth });
    assert.equal(audio.status, 200);
    const played = audio.arrayBuffer();
    await waitFor(() => k.speech.ttsWaiting === 1, 'zweiter Absatz wartet auf die Sprachausgabe');
    const mark = k.claude.calls.length;
    assert.equal((await k.lock(device)).status, 200);
    k.speech.releaseTts();
    assert.ok((await played).byteLength > 0, 'der schon begonnene Strom läuft zu Ende');
    await pause(500);
    assert.deepEqual(k.callsSince(mark), [], 'nach dem Strom keine Vorbereitung von Teil 2');
  });
});
