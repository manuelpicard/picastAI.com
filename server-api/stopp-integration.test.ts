// Integrationstest: Stopp per Taste (Punkt B2) am echten Server.
//
// Der Server (server.ts) läuft als Kindprozess. Als Sprachmodell dient eine Attrappe, die jeden Aufruf
// mitschreibt; als Sprachdienst eine zweite Attrappe, deren Ton so lang ist wie der Text (20 ms je
// Zeichen). Geprüft wird von außen:
//   1. Hält das Kind einen Teil an und sagt dann eine Idee, bekommt Claude den Teil noch einmal, mit
//      der gehörten Stelle und auf dem Stand davor. Die Folge rückt dabei nicht vor.
//   2. Ohne Meldung und nach „alles gehört“ bleibt alles wie bisher: Die Idee erzählt den nächsten Teil.
//   3. Die Erzähltaste nach einem Stopp erzählt wie bisher den nächsten Teil.
//   4. Die Route prüft Anmeldung und Felder; das Protokoll enthält nur Zahlen.
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
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        tools?: Array<{ name: string }>;
        messages: Array<{ content: string }>;
      };
      const schema = body.tools?.[0]?.name ?? '';
      const user = String(body.messages[0]?.content ?? '');
      calls.push({ schema, user });
      let input: Record<string, unknown>;
      if (schema === 'kunibert_antwort') {
        const said = user.match(/«([^»]*)»/)?.[1] ?? '';
        input = /\bsoll\b/.test(said) ? { category: 'idee', speech: '' } : { category: 'frage', speech: 'Das weiß ich.' };
      } else {
        const part = Number(user.match(/Teil (\d+) von/)?.[1] ?? 1);
        input = {
          episode_plan: part === 1 ? 'Plan: Kunibert findet heute den Weg zur Hexe. Die Hexe sagt: „Leise Schritte wecken keinen Drachen.“' : '',
          text: storyText(part),
          // Das Kennzeichen wandert über „Bisher“ in alle späteren Teile: So zeigt der Auftrag für Teil 3,
          // ob Teil 2 auf dem neu erzählten Teil 1 aufbaut oder auf einer veralteten Vorbereitung.
          summary: `Zusammenfassung bis Teil ${part}${user.includes('Von diesem Teil hat das Kind schon gehört') || user.includes(RETOLD) ? ` ${RETOLD}` : ''}.`,
          open_threads: 'offen',
          next_hook: `Haken nach Teil ${part}.`,
          episode_finished: false,
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'tool_use', name: schema, input }], usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  return { server, calls, listening: listen(server) };
}

/** Attrappe für Erkennung und Sprachausgabe: Der Ton ist 20 ms je Zeichen lang (16 kHz, stumm). */
function startFakeSpeech() {
  const state = { transcript: IDEA };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/audio/speech') {
        const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: string };
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

  it('Stopp, dann die Erzähltaste: wie bisher der nächste Teil; eine spätere Idee erzählt nicht zurück', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    const mark = k.claude.calls.length;
    await k.storyButton();
    assert.match(k.storyCallsSince(mark)[0].user, /Erzähle jetzt Teil 2 von 5/);
    const mark2 = k.claude.calls.length;
    await k.speak();
    assert.match(k.storyCallsSince(mark2)[0].user, /Erzähle jetzt Teil 3 von 5/);
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

  it('Neue Geschichte (Eltern) und Sperren vergessen die gemerkte Stelle', async () => {
    await k.freshStory();
    const { turnId } = await k.storyButton();
    await k.reportStop({ turn_id: turnId, heard_seconds: afterFirstSentence(1) });
    await k.freshStory();
    await k.storyButton();
    const mark = k.claude.calls.length;
    await k.speak();
    assert.match(k.storyCallsSince(mark)[0].user, /Erzähle jetzt Teil 2 von 5/, 'nach der neuen Geschichte gilt die alte Stelle nicht');

    const status = async () => {
      const res = await fetch(`${k.base}/api/status`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
      return (await res.json()) as { storyStops: number };
    };
    assert.equal((await status()).storyStops, 1, 'der letzte Teil ist gemerkt');
    const revoked = await fetch(`${k.base}/api/devices/${DEVICE_ID}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    assert.equal(revoked.status, 200);
    assert.equal((await status()).storyStops, 0, 'Sperren löscht ihn');
    assert.equal((await k.reportStop({ turn_id: turnId, heard_seconds: 1 })).status, 401, 'gesperrtes Gerät');
  });

  it('Protokoll: Stopp-Zeilen enthalten nur Zahlen, keine Texte, Geräte-ID oder Token', () => {
    const lines = k.output.split('\n').filter((line) => line.startsWith('Stopp per Taste:'));
    assert.ok(lines.some((line) => /^Stopp per Taste: gemerkt teil=1\/5 saetze=1\/4$/.test(line)), lines.join(' | '));
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
});
