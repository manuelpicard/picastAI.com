// Integrationstest: Stopp per Taste (Punkt B2) am echten Server.
//
// Der Server (server.ts) läuft als Kindprozess. Als Sprachmodell dient eine Attrappe, die jeden Aufruf
// mitschreibt; als Sprachdienst eine zweite Attrappe, deren Ton so lang ist wie der Text (20 ms je
// Zeichen). Geprüft wird von außen:
//   1. Hält das Kind einen Teil an und sagt dann eine Idee, bekommt Claude den Teil noch einmal, mit
//      der gehörten Stelle und auf dem Stand davor. Die Folge rückt dabei nicht vor.
//   2. Ohne Meldung und nach „alles gehört“ bleibt alles wie bisher: Die Idee erzählt den nächsten Teil.
//   3. Auch die Erzähltaste und „weiter“ erzählen nach einem Stopp denselben Teil ab der gehörten Stelle
//      weiter (vorläufig entschieden am 21.11.2026).
//   4. Die Route prüft Anmeldung, Felder und die Grenze von 60 Meldungen in 10 Minuten. Ohne Einwilligung
//      merkt sie sich nichts, im Schlafmodus schon. Das Protokoll enthält nur Zahlen.
//   5. Mit Ton-Strom: Meldungen, solange der Teil entsteht, und abgebrochene Ströme (auch eine Meldung
//      erst nach dem Abbruch).
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
import { STORY_CLOSING_FIRST } from './prompts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN = 'test-admin-token-stopp-0123456789-abcdefghijklm';
const DEVICE_ID = 'geraet-stopp-4711';
const DEVICE_TOKEN = 'geraetetoken-stopp-4711-geheim';
const FAKE_ANTHROPIC_KEY = 'attrappen-schluessel-stopp-4711';
const PUBLIC_BASE_URL = 'https://kunibert.test';
const IDEA = 'kunibert soll einen drachen aus papier basteln';

// Teil N der Attrappe: zwei Absätze mit je zwei Sätzen. Zahlwörter statt Ziffern: Der Server spricht
// Ziffern als Wörter aus (spellOutForSpeech in brain.ts), der Text bliebe sonst nicht gleich.
const WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs'];
const sentence = (part: number, index: number) =>
  [`Teil ${WORDS[part]} beginnt im Gasthaus.`, `Kunibert zog die Stiefel an.`, `Die Kutsche fuhr zum Wald.`, `Dort endete Teil ${WORDS[part]}.`][index];
/** Kennzeichen in der Zusammenfassung: Dieser Teil (oder ein früherer) wurde nach einem Stopp neu erzählt. */
const RETOLD = 'neu erzählt';
const storyText = (part: number) => `${sentence(part, 0)} ${sentence(part, 1)}\n\n${sentence(part, 2)} ${sentence(part, 3)}`;
/** 20 ms Ton je Zeichen, wie die Attrappe der Sprachausgabe unten. */
const SECONDS_PER_CHAR = 0.02;

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

/** Attrappe für die Messages-API: ordnet Ideen („soll“) ein und erzählt Teil N, den der Auftrag nennt. */
function startFakeClaude() {
  const calls: ClaudeCall[] = [];
  /** true: Der zweite Absatz jedes Teils fällt durch den Ausgabe-Check („Blut“ in einer Geschichte). */
  const state = { blockSecondParagraph: false, failStories: false };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        tools?: Array<{ name: string }>;
        messages: Array<{ content: string }>;
        stream?: boolean;
      };
      const schema = body.tools?.[0]?.name ?? '';
      const user = String(body.messages[0]?.content ?? '');
      calls.push({ schema, user });
      if (state.failStories && schema === 'kunibert_geschichte') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"type":"error","error":{"type":"api_error"}}');
        return;
      }
      let input: Record<string, unknown>;
      if (schema === 'kunibert_antwort') {
        const said = user.match(/«([^»]*)»/)?.[1] ?? '';
        input = /\bsoll\b/.test(said) ? { category: 'idee', speech: '' }
          : /geschichte/.test(said) ? { category: 'geschichte', speech: '' }
            : { category: 'frage', speech: 'Das weiß ich.' };
      } else {
        const part = Number(user.match(/Teil (\d+) von/)?.[1] ?? 1);
        input = {
          episode_plan: part === 1 ? 'Plan: Kunibert findet heute den Weg zur Hexe. Die Hexe sagt: „Leise Schritte wecken keinen Drachen.“' : '',
          text: state.blockSecondParagraph ? `${storyText(part).split('\n\n')[0]}\n\nDa floss Blut.` : storyText(part),
          // Das Kennzeichen wandert über „Bisher“ in alle späteren Teile: So zeigt der Auftrag für Teil 3,
          // ob Teil 2 auf dem neu erzählten Teil 1 aufbaut oder auf einer veralteten Vorbereitung.
          summary: `Zusammenfassung bis Teil ${part}${user.includes('Von diesem Teil hat das Kind schon gehört') || user.includes(RETOLD) ? ` ${RETOLD}` : ''}.`,
          open_threads: 'offen',
          next_hook: `Haken nach Teil ${part}.`,
          episode_finished: false,
        };
      }
      const usage = { input_tokens: 10, output_tokens: 10 };
      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'tool_use', name: schema, input }], usage }));
        return;
      }
      // Ton-Strom: Claude schreibt im Streaming (Server-Sent Events), Stück für Stück.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (event: Record<string, unknown>) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      send({ type: 'message_start', message: { usage } });
      send({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: schema, input: {} } });
      const json = JSON.stringify(input);
      for (let i = 0; i < json.length; i += 20) send({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 20) } });
      send({ type: 'content_block_stop', index: 0 });
      send({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage });
      send({ type: 'message_stop' });
      res.end();
    });
  });
  return { server, calls, state, listening: listen(server) };
}

/**
 * Attrappe für Erkennung und Sprachausgabe: Der Ton ist 20 ms je Zeichen lang (16 kHz, stumm).
 * `failIf`: Texte mit diesem Stück lässt die Sprachausgabe ausfallen (HTTP 500). `hold`: Die
 * Sprachausgabe wartet, bis das Versprechen erfüllt ist (`waiting` zählt die wartenden Anfragen).
 */
function startFakeSpeech() {
  const state = { transcript: IDEA, failIf: '', hold: null as Promise<void> | null, holdIf: '', waiting: 0 };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      if (req.url === '/audio/speech') {
        const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: string };
        if (state.hold && (!state.holdIf || input.includes(state.holdIf))) {
          state.waiting++;
          await state.hold;
          state.waiting--;
        }
        if (state.failIf && input.includes(state.failIf)) {
          res.writeHead(500);
          res.end();
          return;
        }
        const samples = Math.round(input.length * SECONDS_PER_CHAR * 16_000);
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(samples * 2), 16_000, 1, 16));
        return;
      }
      if (req.url === '/audio/transcriptions') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: state.transcript }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return { server, state, listening: listen(server) };
}

// Hörbare Aufnahme (Rechteckton): Stille würde der Server als „unklar“ abweisen.
const wav16k = () => {
  const pcm = Buffer.alloc(16_000);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.floor(i / 32) % 2 === 0 ? 8000 : -8000, i);
  return encodeWav(pcm, 16_000, 1, 16);
};

/**
 * Sekunden, nach denen das Kind den ersten Satz von Teil 1 ganz, den zweiten aber noch nicht gehört
 * hat. Der Server verteilt die Tonlänge nach der Länge der Absätze (ganze Datei, kein Ton-Strom).
 */
function afterFirstSentence(part: number): number {
  const paragraphs = [...storyText(part).split('\n\n'), STORY_CLOSING_FIRST];
  const speechChars = paragraphs.join('\n\n').length;
  const total = speechChars * SECONDS_PER_CHAR;
  const chars = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const firstEnd = (total * sentence(part, 0).length) / chars;
  const secondEnd = (total * paragraphs[0].length) / chars;
  return (firstEnd + secondEnd) / 2;
}

/** Server mit Attrappen, gekoppelt und mit Einwilligung (Betrieb, NODE_ENV=production). */
async function startKunibert(extraEnv: Record<string, string>) {
  const claude = startFakeClaude();
  const speech = startFakeSpeech();
  const [claudePort, speechPort, port] = await Promise.all([claude.listening, speech.listening, freePort()]);
  const base = `http://127.0.0.1:${port}`;
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
    PICASTAI_DEVICE_ID: DEVICE_ID,
    PICASTAI_DEVICE_TOKEN: DEVICE_TOKEN,
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
    // Kurze Teile (die Attrappe schreibt nur vier Sätze), damit kein zweiter Versuch „zu kurz“ kommt.
    KUNIBERT_STORY_MIN_WORDS: '10',
    ...extraEnv,
  };
  for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT']) {
    if (process.env[name]) env[name] = process.env[name] as string;
  }
  const kunibert = {
    claude,
    speech,
    base,
    output: '',
    parentCookie: '',
    child: spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcess,
    auth: { Authorization: `Bearer ${DEVICE_TOKEN}`, 'X-Device-ID': DEVICE_ID } as Record<string, string>,

    async storyButton(): Promise<{ turnId: string }> {
      const res = await fetch(`${base}/v1/device/kunibert-story`, {
        method: 'POST',
        headers: { ...kunibert.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short', session_id: 'sitzung-stopp' }),
      });
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as Record<string, unknown>;
      return { turnId: String(body.audio_url).split('/').pop() || '' };
    },

    async speak(): Promise<{ turnId: string }> {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array(wav16k())], { type: 'audio/wav' }), 'question.wav');
      const res = await fetch(`${base}/v1/device/question`, { method: 'POST', headers: kunibert.auth, body: form });
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as Record<string, unknown>;
      return { turnId: String(body.audio_url).split('/').pop() || '' };
    },

    reportStop(body: unknown, headers: Record<string, string> = kunibert.auth): Promise<Response> {
      return fetch(`${base}/v1/device/playback-stopped`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },

    /** Neue Geschichte über die Eltern-Route: Jeder Test beginnt bei Folge 1, Teil 1. */
    async freshStory(): Promise<void> {
      const res = await fetch(`${base}/v1/eltern/geschichte-neu`, {
        method: 'POST',
        headers: { Cookie: kunibert.parentCookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 200, await res.clone().text());
    },

    storyCallsSince(index: number): ClaudeCall[] {
      return claude.calls.slice(index).filter((call) => call.schema === 'kunibert_geschichte');
    },

    async stop(): Promise<void> {
      if (kunibert.child.exitCode === null) {
        const exited = new Promise((resolve) => kunibert.child.once('exit', resolve));
        kunibert.child.kill('SIGTERM');
        await exited;
      }
      await Promise.all([claude, speech].map((fake) => new Promise<void>((resolve) => fake.server.close(() => resolve()))));
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  kunibert.parentCookie = await pairAndConsent(base, ADMIN_TOKEN, DEVICE_ID);
  return kunibert;
}

describe('Stopp per Taste (echter Server, Attrappen, Punkt B2)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  // Ohne Vorbereitung des nächsten Teils: Jeder Teil kommt sichtbar als Aufruf bei der Attrappe an.
  before(async () => { k = await startKunibert({ PICASTAI_STORY_PREFETCH: '0' }); });
  after(async () => { await k?.stop(); });

  it('Route verlangt die Geräte-Anmeldung und gültige Felder; Antwort 204 ohne Inhalt', async () => {
    const valid = { turn_id: 't_AAAAAAAAAAAAAAAA', heard_seconds: 3.5 };
    assert.equal((await k.reportStop(valid, {})).status, 401);
    assert.equal((await k.reportStop(valid, { Authorization: 'Bearer falsch', 'X-Device-ID': DEVICE_ID })).status, 401);
    for (const bad of [
      {},
      { turn_id: 't_AAAAAAAAAAAAAAAA' },
      { heard_seconds: 3 },
      { turn_id: '../geheim', heard_seconds: 3 },
      { turn_id: 't_AAAAAAAAAAAAAAAA', heard_seconds: -1 },
      { turn_id: 't_AAAAAAAAAAAAAAAA', heard_seconds: '3' },
      { turn_id: 't_AAAAAAAAAAAAAAAA', heard_seconds: 3601 },
      { turn_id: 't_AAAAAAAAAAAAAAAA', heard_seconds: null },
    ]) {
      const res = await k.reportStop(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.deepEqual(await res.json(), { error: 'bad_request' });
    }
    const ok = await k.reportStop(valid);
    assert.equal(ok.status, 204);
    assert.equal(await ok.text(), '');
  });

  it('Stopp mitten in Teil 1, dann eine Idee: Claude erzählt Teil 1 ab der gehörten Stelle weiter', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    const stop = await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    assert.equal(stop.status, 204);

    const mark = k.claude.calls.length;
    await k.speak();
    const [retold] = k.storyCallsSince(mark);
    assert.ok(retold, 'die Idee führt zu einem Geschichtenaufruf');
    assert.match(retold.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil, kein Sprung zum nächsten');
    assert.ok(retold.user.includes(`Von diesem Teil hat das Kind schon gehört: «${sentence(1, 0)}» Dann hat es angehalten.`), retold.user);
    assert.ok(!retold.user.includes(sentence(1, 1)), 'den zweiten Satz hat das Kind nicht mehr gehört');
    assert.match(retold.user, /Beginne genau an der Stelle, an der das Kind angehalten hat/);
    assert.ok(retold.user.includes(IDEA), 'die Idee steht im Auftrag');

    // Danach geht die Folge normal weiter: Teil 2 baut auf dem neu erzählten Teil 1 auf.
    const mark2 = k.claude.calls.length;
    await k.storyButton();
    const [next] = k.storyCallsSince(mark2);
    assert.match(next.user, /Erzähle jetzt Teil 2 von 5/);
    assert.ok(!next.user.includes('Von diesem Teil hat das Kind schon gehört'));
  });

  it('ohne Meldung erzählt eine Idee wie bisher den nächsten Teil', async () => {
    await k.freshStory();
    await k.storyButton();
    const mark = k.claude.calls.length;
    await k.speak();
    const [idea] = k.storyCallsSince(mark);
    assert.match(idea.user, /Erzähle jetzt Teil 2 von 5/);
    assert.match(idea.user, /Beginne genau dort, wo der vorige Teil aufgehört hat/);
    assert.ok(!idea.user.includes('Von diesem Teil hat das Kind schon gehört'));
  });

  it('Stopp erst im Abschluss (alles gehört): Die Idee erzählt den nächsten Teil', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: 3599 })).status, 204);
    const mark = k.claude.calls.length;
    await k.speak();
    const [idea] = k.storyCallsSince(mark);
    assert.match(idea.user, /Erzähle jetzt Teil 2 von 5/);
  });

  it('Stopp, dann die Erzähltaste: Teil 1 geht an der Stelle weiter, danach Teil 2 und eine Idee in Teil 3', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [resumed] = k.storyCallsSince(mark);
    assert.match(resumed.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil ab der Stelle, nichts übersprungen');
    assert.ok(resumed.user.includes(`«${sentence(1, 0)}»`));
    assert.ok(!resumed.user.includes(IDEA), 'ohne Idee');
    const mark2 = k.claude.calls.length;
    await k.storyButton();
    assert.match(k.storyCallsSince(mark2)[0].user, /Erzähle jetzt Teil 2 von 5/);
    const mark3 = k.claude.calls.length;
    await k.speak();
    assert.match(k.storyCallsSince(mark3)[0].user, /Erzähle jetzt Teil 3 von 5/, 'die Stelle gilt nach dem neu erzählten Teil nicht mehr');
  });

  it('ohne Einwilligung merkt sich der Server keine Stelle', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    const consent = (method: 'PUT' | 'DELETE') =>
      fetch(`${k.base}/v1/eltern/einwilligung`, { method, headers: { Cookie: k.parentCookie, 'Content-Type': 'application/json' }, body: method === 'PUT' ? '{}' : undefined });
    assert.equal((await consent('DELETE')).status, 200);
    try {
      const linesBefore = k.output.split('\n').filter((line) => line.startsWith('Stopp per Taste:')).length;
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) })).status, 204);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const linesAfter = k.output.split('\n').filter((line) => line.startsWith('Stopp per Taste:')).length;
      assert.equal(linesAfter, linesBefore, 'nichts verarbeitet, keine Zeile');
    } finally {
      assert.equal((await consent('PUT')).status, 200);
    }
  });

  it('eine Antwort, deren Stand nicht gespeichert wird (Geschichte neu, während sie entsteht), wird auch nicht gemerkt', async () => {
    await k.freshStory();
    const status = async () => {
      const res = await fetch(`${k.base}/api/status`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
      return ((await res.json()) as { storyStops: number }).storyStops;
    };
    assert.equal(await status(), 0);
    let release!: () => void;
    k.speech.state.hold = new Promise<void>((resolve) => (release = resolve));
    try {
      const pending = k.storyButton();
      await waitFor(() => k.speech.state.waiting > 0, 'Sprachausgabe wartet');
      await k.freshStory();
      k.speech.state.hold = null;
      release();
      const { turnId } = await pending;
      assert.equal(await status(), 0, 'nichts gemerkt');
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) })).status, 204);
      assert.equal(await status(), 0);
    } finally {
      k.speech.state.hold = null;
      release?.();
    }
  });

  it('Stopp, dann eine Frage, dann eine Idee: Die Idee setzt trotzdem an der gehörten Stelle an', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    k.speech.state.transcript = 'wo wohnt die hexe';
    try {
      const answer = await k.speak();
      // Hält das Kind auch die Antwort an, ändert das an der Stelle in der Geschichte nichts.
      assert.equal((await k.reportStop({ turn_id: answer.turnId, heard_seconds: 0.2 })).status, 204);
    } finally {
      k.speech.state.transcript = IDEA;
    }
    const mark = k.claude.calls.length;
    await k.speak();
    const [retold] = k.storyCallsSince(mark);
    assert.match(retold.user, /Erzähle jetzt Teil 1 von 5/);
    assert.ok(retold.user.includes(`«${sentence(1, 0)}»`));
  });

  it('im Schlafmodus merkt sich der Server die Stelle trotzdem (ein begonnener Teil kann noch laufen)', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    const sleep = (schlafmodus: boolean) =>
      fetch(`${k.base}/v1/eltern/einstellungen`, {
        method: 'PUT',
        headers: { Cookie: k.parentCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schlafmodus }),
      });
    assert.equal((await sleep(true)).status, 200);
    try {
      const outputBefore = k.output.length;
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) })).status, 204);
      await waitFor(() => k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt teil=1/5 saetze=1/4'), 'Stelle im Schlafmodus gemerkt');
    } finally {
      assert.equal((await sleep(false)).status, 200);
    }
  });

  it('Neue Geschichte (Eltern) und Sperren vergessen die gemerkte Stelle', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    const status = async () => {
      const res = await fetch(`${k.base}/api/status`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
      return (await res.json()) as { storyStops: number };
    };
    assert.equal((await status()).storyStops, 1, 'die Stelle ist gemerkt');
    await k.freshStory();
    assert.equal((await status()).storyStops, 0, 'neue Geschichte (Eltern) löscht sie');
    await k.storyButton();
    const mark = k.claude.calls.length;
    await k.speak();
    assert.match(k.storyCallsSince(mark)[0].user, /Erzähle jetzt Teil 2 von 5/, 'nach der neuen Geschichte gilt die alte Stelle nicht');
    assert.equal((await status()).storyStops, 1, 'der letzte Teil ist für eine Meldung bereit');
    const revoked = await fetch(`${k.base}/api/devices/${DEVICE_ID}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    assert.equal(revoked.status, 200);
    assert.equal((await status()).storyStops, 0, 'Sperren löscht ihn');
    assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: 1 })).status, 401, 'gesperrtes Gerät');
  });

  it('Protokoll: Stopp-Zeilen enthalten nur Zahlen, keine Texte, Geräte-ID oder Token', () => {
    const lines = k.output.split('\n').filter((line) => line.startsWith('Stopp per Taste:'));
    assert.ok(lines.some((line) => /^Stopp per Taste: gemerkt teil=1\/5 saetze=1\/4$/.test(line)), lines.join(' | '));
    assert.ok(!lines.some((line) => /teil=5\/5/.test(line)), 'nach dem Finale wird nichts gemerkt');
    assert.ok(lines.some((line) => /^Stopp per Taste: ganz_gehoert teil=1\/5$/.test(line)), lines.join(' | '));
    assert.ok(lines.some((line) => line === 'Stopp per Taste: wartet'), lines.join(' | '));
    for (const line of lines) assert.match(line, /^Stopp per Taste: (gemerkt teil=\d+\/\d+ saetze=\d+\/\d+|ganz_gehoert teil=\d+\/\d+|wartet)$/);
    for (const secret of [DEVICE_ID, DEVICE_TOKEN, ADMIN_TOKEN, FAKE_ANTHROPIC_KEY, IDEA, sentence(1, 0)]) {
      assert.ok(!k.output.includes(secret), `steht im Server-Protokoll: ${secret.slice(0, 12)}…`);
    }
  });
});

/** Wartet, bis die Bedingung gilt (höchstens 15 s). */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Zeit abgelaufen: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Stopp per Taste mit Vorbereitung des nächsten Teils (echter Server, Punkt B2)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  // Vorbereitung an (Standard): Nach jedem Teil entsteht der nächste schon im Hintergrund.
  before(async () => { k = await startKunibert({}); });
  after(async () => { await k?.stop(); });

  it('nach dem neu erzählten Teil nimmt die Erzähltaste nicht die alte Vorbereitung', async () => {
    const part2Calls = () => k.storyCallsSince(0).filter((call) => /Erzähle jetzt Teil 2 von 5/.test(call.user));
    const { turnId } = await k.storyButton();
    await waitFor(() => part2Calls().length === 1, 'Vorbereitung von Teil 2 auf dem ersten Teil 1');
    assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) })).status, 204);
    await k.speak();
    assert.ok(k.storyCallsSince(0).some((call) => /Erzähle jetzt Teil 1 von 5/.test(call.user) && call.user.includes(IDEA)), 'Teil 1 neu erzählt');
    await waitFor(() => part2Calls().length === 2, 'neue Vorbereitung von Teil 2 auf dem neu erzählten Teil 1');
    assert.match(part2Calls()[1].user, new RegExp(`Bisher: Zusammenfassung bis Teil 1 ${RETOLD}\\.`));

    await k.storyButton();
    // Der Auftrag für Teil 3 (wieder im Hintergrund) zeigt, auf welchem Teil 2 er aufbaut.
    const part3Calls = () => k.storyCallsSince(0).filter((call) => /Erzähle jetzt Teil 3 von 5/.test(call.user));
    await waitFor(() => part3Calls().length === 1, 'Vorbereitung von Teil 3');
    assert.match(part3Calls()[0].user, new RegExp(`Bisher: Zusammenfassung bis Teil 2 ${RETOLD}\\.`), 'Teil 2 baut auf dem neu erzählten Teil 1 auf');
  });

  it('Pause nach einem Ausfall beim neu erzählten Teil: keine neue Vorbereitung, der nächste Druck erzählt ab der Stelle', async () => {
    await k.freshStory();
    const part2Calls = () => k.storyCallsSince(0).filter((call) => /Erzähle jetzt Teil 2 von 5/.test(call.user)).length;
    const initial = part2Calls();
    const { turnId } = await k.storyButton();
    await waitFor(() => part2Calls() === initial + 1, 'Vorbereitung von Teil 2 läuft');
    const before = part2Calls();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    k.claude.state.failStories = true;
    try {
      await k.storyButton();
    } finally {
      k.claude.state.failStories = false;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(part2Calls(), before, 'nach der Pause wird Teil 2 nicht noch einmal vorbereitet');
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [again] = k.storyCallsSince(mark);
    assert.match(again.user, /Erzähle jetzt Teil 1 von 5/, 'der nächste Druck versucht es noch einmal ab der Stelle');
    assert.ok(again.user.includes(`«${sentence(1, 0)}»`));
  });
});

describe('Stopp per Taste mit Ton-Strom (echter Server, Punkt B2)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  before(async () => {
    k = await startKunibert({ PICASTAI_STORY_PREFETCH: '0', PICASTAI_AUDIO_STREAM: '1' });
    k.auth['X-Kunibert-Audio-Stream'] = '1';
  });
  after(async () => { await k?.stop(); });

  /** Mit Ton-Strom kennt der Server die Sekunden je Absatz: Mitte zwischen dem Ende von Satz 1 und Satz 2. */
  const afterFirstSentenceStreamed = (part: number) => (SECONDS_PER_CHAR * (sentence(part, 0).length + storyText(part).split('\n\n')[0].length)) / 2;

  it('Meldung, solange der Strom noch entsteht: Sie gilt, sobald der Teil fertig ist', async () => {
    await k.freshStory();
    let release!: () => void;
    k.speech.state.holdIf = sentence(1, 2);
    k.speech.state.hold = new Promise<void>((resolve) => (release = resolve));
    try {
      const { turnId } = await k.storyButton();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz wartet auf die Sprachausgabe');
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) })).status, 204);
    } finally {
      k.speech.state.hold = null;
      k.speech.state.holdIf = '';
      release?.();
    }
    const mark = k.claude.calls.length;
    await k.speak();
    const [retold] = k.storyCallsSince(mark);
    assert.match(retold.user, /Erzähle jetzt Teil 1 von 5/);
    assert.ok(retold.user.includes(`«${sentence(1, 0)}»`), retold.user);
    const lines = k.output.split('\n').filter((line) => line.startsWith('Stopp per Taste:'));
    assert.deepEqual(lines.slice(-2), ['Stopp per Taste: wartet', 'Stopp per Taste: gemerkt teil=1/5 saetze=1/4']);
  });

  it('Stopp beendet die Vertonung: Die nächste Anfrage wartet nicht auf den Rest des alten Teils (N1126-1338-f)', async () => {
    // Die Vertonung des zweiten Absatzes hängt bis zum Ende des Tests. Das Kind hält nach dem ersten Satz an
    // und sagt gleich eine Idee. Bisher wartete die Idee, bis der alte Teil ganz vertont war. Hing die Stimme,
    // verbrauchte das Warten das Budget (Ersatztext statt Claude) oder die Antwort kam nach den 130 s von Caddy.
    await k.freshStory();
    let release!: () => void;
    k.speech.state.holdIf = sentence(1, 2);
    k.speech.state.hold = new Promise<void>((resolve) => (release = resolve));
    try {
      const outputBefore = k.output.length;
      const { turnId } = await k.storyButton();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz wartet auf die Sprachausgabe');
      // Ab hier hält die Attrappe nichts Neues mehr fest; der zweite Absatz des alten Teils hängt weiter.
      k.speech.state.holdIf = 'kommt in keinem Text vor';
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) })).status, 204);
      await waitFor(() => k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt teil=1/5 saetze=1/4'), 'die Meldung gilt sofort');
      const mark = k.claude.calls.length;
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array(wav16k())], { type: 'audio/wav' }), 'question.wav');
      const res = await fetch(`${k.base}/v1/device/question`, { method: 'POST', headers: k.auth, body: form, signal: AbortSignal.timeout(15_000) });
      assert.equal(res.status, 200, await res.clone().text());
      const [retold] = k.storyCallsSince(mark);
      assert.ok(retold, 'Claude erzählt, kein Ersatztext');
      assert.match(retold.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil, ab der gehörten Stelle');
      assert.ok(retold.user.includes(`«${sentence(1, 0)}»`), retold.user);
      assert.equal(k.speech.state.waiting, 1, 'der alte Absatz hängt noch: Die Idee hat nicht auf ihn gewartet');
    } finally {
      k.speech.state.hold = null;
      k.speech.state.holdIf = '';
      release?.();
    }
  });

  it('neu erzählter Teil bricht im Strom ab: Das schon Gesprochene kommt zur Stelle dazu', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await waitFor(() => k.output.includes('Zeitmessung'), 'erster Teil fertig');
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) });
    // Die Idee erzählt Teil 1 ab der Stelle neu; die Sprachausgabe fällt beim zweiten Absatz aus.
    k.speech.state.failIf = sentence(1, 2);
    try {
      const outputBefore = k.output.length;
      await k.speak();
      await waitFor(() => k.output.slice(outputBefore).includes('modus=frage_strom status=abgebrochen'), 'Strom bricht ab');
      const mark = k.claude.calls.length;
      k.speech.state.failIf = '';
      await k.storyButton();
      const [again] = k.storyCallsSince(mark);
      assert.match(again.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil, nichts übersprungen');
      assert.ok(again.user.includes(`«${sentence(1, 0)} ${sentence(1, 0)} ${sentence(1, 1)}»`), again.user);
    } finally {
      k.speech.state.failIf = '';
    }
  });

  it('neu erzählter Teil bricht im Strom ab, danach hält das Kind ihn an: Es zählt nur das Gehörte', async () => {
    // Der Server ist schneller als die Wiedergabe: Die Meldung zum abgebrochenen Strom kommt erst nach
    // dem Abbruch an (Prüfung von PR #75, Befund 1).
    await k.freshStory();
    const start = k.output.length;
    const { turnId } = await k.storyButton();
    await waitFor(() => k.output.slice(start).includes('Zeitmessung'), 'erster Teil fertig');
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) });
    k.speech.state.failIf = sentence(1, 2);
    let retold = '';
    try {
      const outputBefore = k.output.length;
      retold = (await k.speak()).turnId;
      await waitFor(() => k.output.slice(outputBefore).includes('modus=frage_strom status=abgebrochen'), 'Strom bricht ab');
    } finally {
      k.speech.state.failIf = '';
    }
    const outputBefore = k.output.length;
    assert.equal((await k.reportStop({ turn_id: retold, heard_seconds: afterFirstSentenceStreamed(1) })).status, 204);
    await waitFor(() => k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt'), 'Meldung zum abgebrochenen Strom zählt');
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [again] = k.storyCallsSince(mark);
    assert.match(again.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil, nichts übersprungen');
    assert.ok(again.user.includes(`«${sentence(1, 0)} ${sentence(1, 0)}»`), again.user);
  });

  it('anderer Teil bricht im Strom ab, nachdem das Kind schon etwas gehört hat: Die alte Stelle gilt nicht mehr', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) });
    k.speech.state.transcript = 'erzähl mir eine neue geschichte';
    k.speech.state.failIf = sentence(1, 2);
    try {
      const outputBefore = k.output.length;
      await k.speak();
      await waitFor(() => k.output.slice(outputBefore).includes('modus=frage_strom status=abgebrochen'), 'Strom der neuen Folge bricht ab');
    } finally {
      k.speech.state.transcript = IDEA;
      k.speech.state.failIf = '';
    }
    const mark = k.claude.calls.length;
    await k.speak();
    const [idea] = k.storyCallsSince(mark);
    assert.match(idea.user, /Erzähle jetzt Teil 2 von 5/, 'kein Sprung zurück in den angehaltenen Teil');
    assert.ok(!idea.user.includes('Von diesem Teil hat das Kind schon gehört'));
    assert.ok(!idea.user.includes('Wunsch des Kindes'), 'die abgebrochene neue Folge wurde nicht gespeichert');
  });

  it('Ton-Strom: Es zählen die Sekunden je Absatz und die Pausen dazwischen', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    // Kurz vor dem Ende von Satz 3: Absatz 1, die Pause von 0,9 s, dann Satz 3 bis kurz vor Schluss.
    const paragraph1 = storyText(1).split('\n\n')[0];
    const seconds = SECONDS_PER_CHAR * paragraph1.length + 0.9 + SECONDS_PER_CHAR * sentence(1, 2).length - 0.1;
    const outputBefore = k.output.length;
    await k.reportStop({ turn_id: turnId, heard_seconds: seconds });
    await waitFor(() => k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt'), 'Stelle gemerkt');
    assert.ok(k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt teil=1/5 saetze=2/4'), 'Satz 3 war noch nicht zu Ende');
  });

  it('Ausgabe-Check hält einen neu erzählten Teil im Strom an: Das Gesprochene kommt zur Stelle dazu', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) });
    k.claude.state.blockSecondParagraph = true;
    try {
      const outputBefore = k.output.length;
      await k.storyButton();
      await waitFor(() => /modus=weiter_strom status=200/.test(k.output.slice(outputBefore)), 'Strom mit Pause fertig');
    } finally {
      k.claude.state.blockSecondParagraph = false;
    }
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [again] = k.storyCallsSince(mark);
    assert.match(again.user, /Erzähle jetzt Teil 1 von 5/);
    assert.ok(again.user.includes(`«${sentence(1, 0)} ${sentence(1, 0)} ${sentence(1, 1)}»`), again.user);
  });

  it('Ausgabe-Check hält einen anderen Teil im Strom an: Die alte Stelle gilt nicht mehr', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceStreamed(1) });
    k.speech.state.transcript = 'erzähl mir eine neue geschichte';
    k.claude.state.blockSecondParagraph = true;
    try {
      const outputBefore = k.output.length;
      await k.speak();
      await waitFor(() => /modus=frage_strom status=200/.test(k.output.slice(outputBefore)), 'Strom mit Pause fertig');
    } finally {
      k.speech.state.transcript = IDEA;
      k.claude.state.blockSecondParagraph = false;
    }
    const mark = k.claude.calls.length;
    await k.speak();
    const [idea] = k.storyCallsSince(mark);
    assert.match(idea.user, /Erzähle jetzt Teil 2 von 5/);
    assert.ok(!idea.user.includes('Von diesem Teil hat das Kind schon gehört'));
  });
});

/** Mit Ton-Strom kennt der Server die Sekunden je Absatz: Mitte zwischen dem Ende von Satz 1 und Satz 2. */
const afterFirstSentenceInStream = (part: number) => (SECONDS_PER_CHAR * (sentence(part, 0).length + storyText(part).split('\n\n')[0].length)) / 2;

/** Hält die Vertonung des zweiten Absatzes jedes Teils fest, bis `release` kommt. */
function holdSecondParagraph(k: Awaited<ReturnType<typeof startKunibert>>): () => void {
  let release!: () => void;
  k.speech.state.holdIf = sentence(1, 2);
  k.speech.state.hold = new Promise<void>((resolve) => (release = resolve));
  return () => {
    k.speech.state.hold = null;
    k.speech.state.holdIf = '';
    release();
  };
}

describe('Stopp im Ton-Strom mit Vorbereitung des nächsten Teils (echter Server, Prüfung von PR #134, Befund 1)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  // Vorbereitung an (Standard) und Ton-Strom an.
  before(async () => {
    k = await startKunibert({ PICASTAI_AUDIO_STREAM: '1' });
    k.auth['X-Kunibert-Audio-Stream'] = '1';
  });
  after(async () => { await k?.stop(); });

  it('Stopp, solange der Teil entsteht: kein Aufruf an Claude für den nächsten Teil; ohne Stopp wieder Vorbereitung', async () => {
    const part2Calls = () => k.storyCallsSince(0).filter((call) => /Erzähle jetzt Teil 2 von 5/.test(call.user)).length;
    const release = holdSecondParagraph(k);
    try {
      const outputBefore = k.output.length;
      const { turnId } = await k.storyButton();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz wartet auf die Sprachausgabe');
      assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceInStream(1) })).status, 204);
      await waitFor(() => /modus=weiter_strom status=200/.test(k.output.slice(outputBefore)), 'der angehaltene Teil gilt als ausgeliefert');
      assert.ok(k.output.slice(outputBefore).includes('Stopp per Taste: gemerkt teil=1/5 saetze=1/4'), 'Stelle gemerkt');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(part2Calls(), 0, 'nach dem Stopp wird Teil 2 nicht vorbereitet: Der nächste Druck erzählt Teil 1 ab der Stelle');
    } finally {
      release();
    }
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [retold] = k.storyCallsSince(mark);
    assert.match(retold.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil ab der gehörten Stelle');
    assert.ok(retold.user.includes(`«${sentence(1, 0)}»`), retold.user);
    await waitFor(() => part2Calls() === 1, 'ohne Stopp wird Teil 2 wie bisher im Hintergrund vorbereitet');
  });
});

describe('Verwerfen eines alten Ton-Stroms (echter Server, Sicherheitsnetz N1126-1338-f, Prüfung von PR #134)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  // Nur außerhalb von NODE_ENV=production lässt sich die Grenze von 30 s kürzer stellen (pendingWaitLimitMs).
  const WAIT_MS = 1_500;
  before(async () => {
    k = await startKunibert({
      NODE_ENV: 'development',
      KUNIBERT_TEST_STROM_WARTEN_MS: String(WAIT_MS),
      PICASTAI_STORY_PREFETCH: '0',
      PICASTAI_AUDIO_STREAM: '1',
    });
    k.auth['X-Kunibert-Audio-Stream'] = '1';
  });
  after(async () => { await k?.stop(); });

  it('Vertonung hängt ohne Stopp-Meldung: Nach der Grenze erzählt Claude; der alte Teil zählt nicht (Befund 2)', async () => {
    await k.freshStory();
    const release = holdSecondParagraph(k);
    const outputBefore = k.output.length;
    try {
      await k.storyButton();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz wartet auf die Sprachausgabe');
      // Ab hier hält die Attrappe nichts Neues mehr fest; der zweite Absatz des alten Teils hängt weiter.
      k.speech.state.holdIf = 'kommt in keinem Text vor';
      const mark = k.claude.calls.length;
      const started = Date.now();
      const res = await fetch(`${k.base}/v1/device/kunibert-story`, {
        method: 'POST',
        headers: { ...k.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short', session_id: 'sitzung-stopp' }),
        signal: AbortSignal.timeout(15_000),
      });
      const tookMs = Date.now() - started;
      assert.equal(res.status, 200, await res.clone().text());
      assert.ok(tookMs >= WAIT_MS - 100, `die neue Anfrage hat bis zur Grenze gewartet (${tookMs} ms)`);
      const [told] = k.storyCallsSince(mark);
      assert.ok(told, 'Claude erzählt, kein Ersatztext');
      assert.match(told.user, /Erzähle jetzt Teil 1 von 5/, 'der verworfene Teil wurde nicht gespeichert: wieder Teil 1');
      assert.equal(k.speech.state.waiting, 1, 'der alte Absatz hängt noch: Die neue Anfrage hat nicht auf ihn gewartet');
      await waitFor(() => /modus=weiter_strom status=verworfen/.test(k.output.slice(outputBefore)), 'Zeile für den verworfenen Strom');
    } finally {
      release();
    }
    await waitFor(() => /modus=weiter_strom status=200/.test(k.output.slice(outputBefore)), 'der neue Teil 1 ist fertig');
    const lines = k.output.slice(outputBefore).split('\n').filter((line) => line.includes('status=verworfen'));
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.match(lines[0], /^Zeitmessung id=[0-9a-f]{8} modus=weiter_strom status=verworfen( [a-z_]+=(-|\d+(\.\d+)?))+$/, 'nur Zahlen und feste Wörter');
    assert.ok(!k.output.slice(outputBefore).includes('Stopp per Taste:'), 'keine Stelle');
    const mark = k.claude.calls.length;
    await k.storyButton();
    const [next] = k.storyCallsSince(mark);
    assert.match(next.user, /Erzähle jetzt Teil 2 von 5/, 'danach geht es wie gewohnt weiter');
    assert.ok(!next.user.includes('Von diesem Teil hat das Kind schon gehört'));
  });

  it('verworfener Strom einer neuen Folge nach einem Stopp: Die alte Stelle gilt nicht mehr, wie beim Abbruch (Befund 3)', async () => {
    await k.freshStory();
    const start = k.output.length;
    const { turnId } = await k.storyButton();
    await waitFor(() => /modus=weiter_strom status=200/.test(k.output.slice(start)), 'erster Teil fertig');
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceInStream(1) });
    await waitFor(() => k.output.slice(start).includes('Stopp per Taste: gemerkt'), 'Stelle gemerkt');
    k.speech.state.transcript = 'erzähl mir eine neue geschichte';
    const release = holdSecondParagraph(k);
    try {
      await k.speak();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz der neuen Folge wartet');
      k.speech.state.holdIf = 'kommt in keinem Text vor';
      k.speech.state.transcript = IDEA;
      const mark = k.claude.calls.length;
      await k.speak();
      const [idea] = k.storyCallsSince(mark);
      assert.match(idea.user, /Erzähle jetzt Teil 2 von 5/, 'kein Sprung zurück in den angehaltenen Teil');
      assert.ok(!idea.user.includes('Von diesem Teil hat das Kind schon gehört'));
      assert.ok(!idea.user.includes('Wunsch des Kindes'), 'die verworfene neue Folge wurde nicht gespeichert');
    } finally {
      k.speech.state.transcript = IDEA;
      release();
    }
  });

  it('verworfener Strom eines neu erzählten Teils: Das Gesprochene kommt zur Stelle dazu, wie beim Abbruch (Befund 3)', async () => {
    await k.freshStory();
    const start = k.output.length;
    const { turnId } = await k.storyButton();
    await waitFor(() => /modus=weiter_strom status=200/.test(k.output.slice(start)), 'erster Teil fertig');
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentenceInStream(1) });
    await waitFor(() => k.output.slice(start).includes('Stopp per Taste: gemerkt'), 'Stelle gemerkt');
    const release = holdSecondParagraph(k);
    try {
      // Die Idee erzählt Teil 1 ab der Stelle neu; dessen zweiter Absatz hängt, und es kommt keine Meldung.
      await k.speak();
      await waitFor(() => k.speech.state.waiting > 0, 'zweiter Absatz des neu erzählten Teils wartet');
      k.speech.state.holdIf = 'kommt in keinem Text vor';
      const mark = k.claude.calls.length;
      await k.storyButton();
      const [again] = k.storyCallsSince(mark);
      assert.match(again.user, /Erzähle jetzt Teil 1 von 5/, 'derselbe Teil, nichts übersprungen');
      assert.ok(again.user.includes(`«${sentence(1, 0)} ${sentence(1, 0)} ${sentence(1, 1)}»`), again.user);
    } finally {
      release();
    }
  });

  it('Protokoll: keine Geräte-ID, kein Token, kein Text', () => {
    for (const secret of [DEVICE_ID, DEVICE_TOKEN, ADMIN_TOKEN, FAKE_ANTHROPIC_KEY, IDEA, sentence(1, 0), 'erzähl mir eine neue geschichte']) {
      assert.ok(!k.output.includes(secret), `steht im Server-Protokoll: ${secret.slice(0, 12)}…`);
    }
  });
});

describe('Stopp per Taste: Grenze für Meldungen (echter Server, Punkt B2)', () => {
  let k: Awaited<ReturnType<typeof startKunibert>>;
  // Eigener Server: Nach diesem Test nimmt er zehn Minuten lang keine Meldung des Geräts mehr an.
  before(async () => { k = await startKunibert({ PICASTAI_STORY_PREFETCH: '0' }); });
  after(async () => { await k?.stop(); });

  it('60 Meldungen eines Geräts in 10 Minuten gehen durch, die 61. bekommt 429 rate_limited', async () => {
    for (let sent = 1; sent <= 60; sent++) {
      assert.equal((await k.reportStop({ turn_id: 't_ZZZZZZZZZZZZZZZZ', heard_seconds: 1 })).status, 204, `Meldung ${sent}`);
    }
    const limited = await k.reportStop({ turn_id: 't_ZZZZZZZZZZZZZZZZ', heard_seconds: 1 });
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  });
});
