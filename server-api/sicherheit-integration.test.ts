// Integrationstest: Sicherheitsweiche und Datensparsamkeit am echten Server.
//
// Der Server (server.ts) läuft als Kindprozess. Als Sprachmodell dient eine Attrappe, die jeden
// Aufruf zählt und mitschreibt, als Sprachdienst (Erkennung und Sprachausgabe) eine zweite Attrappe.
// Geprüft wird von außen:
//   1. Schlägt die Sicherheitsweiche an, wird das Sprachmodell gar nicht aufgerufen.
//   2. Die Anfrage an das Sprachmodell enthält weder Geräte-ID noch Gerätenamen noch Token.
//   3. Das Server-Protokoll enthält keine Äußerungen und keine Tokens.
// Es gibt keine echten Aufrufe und keine echten Schlüssel; alle Werte unten sind erfunden.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeWav } from './audio.js';
import { screen } from './safety.js';
import { pairAndConsent } from './eltern-testhilfe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFETY_START = 'Danke, dass du mir das sagst';

// Erfundene Werte. Sie sind absichtlich auffällig, damit ein Treffer im Text nie Zufall ist.
const ADMIN_TOKEN = 'test-admin-token-sicherheit-0123456789-abcdefghij';
const ENV_DEVICE_ID = 'geraet-umgebung-4711';
const ENV_DEVICE_TOKEN = 'geraetetoken-umgebung-4711-geheim';
const FAKE_ANTHROPIC_KEY = 'attrappen-schluessel-nicht-echt-4711';
const REGISTERED_NAME = 'Kinderzimmer-Ritter-4711';
const PUBLIC_BASE_URL = 'https://kunibert.test';

// Auswahl aus MUST_TRIGGER in safety.test.ts: je ein Satz pro Art von Notlage. Ob jeder Satz die
// Weiche wirklich auslöst, prüft der erste Test selbst, damit die Auswahl nicht unbemerkt veraltet.
const NOTFALL_SAETZE = [
  'ich will nicht mehr leben',
  'ich will mir wehtun',
  'mein papa schlägt mich',
  'jemand hat mich angefasst',
  'ich hab mich verlaufen',
  'ich finde meine mama nicht mehr',
  'mama bewegt sich nicht',
  'opa liegt im flur und reagiert nicht',
  'ich kann nicht atmen',
  'ich hab tabletten geschluckt',
  'es riecht nach gas',
  'Ein fremder Mann hat gesagt, ich soll in sein Auto einsteigen.',
];

const ALLTAGS_SATZ = 'warum ist der himmel blau';

interface ClaudeCall {
  headers: http.IncomingHttpHeaders;
  body: string;
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

/** Attrappe für die Messages-API von Anthropic: zählt und merkt sich jeden Aufruf. */
function startFakeClaude() {
  const calls: ClaudeCall[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      calls.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          content: [
            { type: 'tool_use', input: { category: 'frage', speech: 'Der Himmel wirkt blau, weil das Sonnenlicht in der Luft gestreut wird.' } },
          ],
        })
      );
    });
  });
  return { server, calls, listening: listen(server) };
}

/** Attrappe für den OpenAI-kompatiblen Sprachdienst (Erkennung und Sprachausgabe). */
function startFakeSpeech() {
  const state = { spoken: [] as string[], transcript: ALLTAGS_SATZ };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/audio/speech') {
        state.spoken.push((JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: string }).input);
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(12_000), 24_000, 1, 16));
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

// Eine hörbare Aufnahme (Rechteckton): Stille würde der Server als „unklar“ abweisen, ohne die Weiche zu fragen.
const wav16k = () => {
  const pcm = Buffer.alloc(16_000);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.floor(i / 32) % 2 === 0 ? 8000 : -8000, i);
  return encodeWav(pcm, 16_000, 1, 16);
};

function questionForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('audio', new Blob([new Uint8Array(wav16k())], { type: 'audio/wav' }), 'question.wav');
  return form;
}

describe('Sicherheitsweiche und Datensparsamkeit (echter Server, Attrappen)', () => {
  let child: ChildProcess;
  let claude: ReturnType<typeof startFakeClaude>;
  let speech: ReturnType<typeof startFakeSpeech>;
  let base = '';
  let output = '';
  let registered = { id: '', token: '' };

  const headers = (id: string, token: string) => ({ Authorization: `Bearer ${token}`, 'X-Device-ID': id });

  const postQuestion = (id: string, token: string, form: FormData) =>
    fetch(`${base}/v1/device/question`, { method: 'POST', headers: headers(id, token), body: form });

  before(async () => {
    claude = startFakeClaude();
    speech = startFakeSpeech();
    const [claudePort, speechPort, port] = await Promise.all([claude.listening, speech.listening, freePort()]);
    base = `http://127.0.0.1:${port}`;
    const env: Record<string, string> = {
      PATH: process.env.PATH || '',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
      PICASTAI_DEVICE_ID: ENV_DEVICE_ID,
      PICASTAI_DEVICE_TOKEN: ENV_DEVICE_TOKEN,
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
    };
    for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT']) {
      if (process.env[name]) env[name] = process.env[name] as string;
    }

    child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk));

    const deadline = Date.now() + 60_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`Server vorzeitig beendet (Code ${child.exitCode}):\n${output}`);
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        // noch nicht bereit
      }
      if (Date.now() > deadline) throw new Error(`Server nicht rechtzeitig bereit:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Ein zweites Gerät mit eigenem Namen, wie es das Dashboard anlegt.
    const res = await fetch(`${base}/api/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'geraet-registriert-4711', name: REGISTERED_NAME }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    registered = { id: 'geraet-registriert-4711', token: ((await res.json()) as { token: string }).token };
    // Im Betrieb antwortet der Server erst nach der Einwilligung der Eltern.
    await pairAndConsent(base, ADMIN_TOKEN, ENV_DEVICE_ID);
    await pairAndConsent(base, ADMIN_TOKEN, registered.id);
  });

  after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await Promise.all(
      [claude, speech].map((fake) => (fake ? new Promise<void>((resolve) => fake.server.close(() => resolve())) : undefined))
    );
  });

  it('die gewählten Notfall-Sätze lösen die Weiche tatsächlich aus', () => {
    for (const satz of NOTFALL_SAETZE) assert.equal(screen(satz), true, satz);
  });

  it('Notfall-Sätze: Sicherheitshinweis, und das Sprachmodell wird nicht aufgerufen', async () => {
    const vorher = claude.calls.length;
    const original = speech.state.transcript;
    for (const satz of NOTFALL_SAETZE) {
      speech.state.transcript = satz; // im Betrieb ist das Testfeld "transcript" aus; die Erkennung liefert den Satz
      const res = await postQuestion(ENV_DEVICE_ID, ENV_DEVICE_TOKEN, questionForm());
      assert.equal(res.status, 200, `${satz}: ${await res.clone().text()}`);
      assert.equal(((await res.json()) as { type: string }).type, 'answer');
    }
    speech.state.transcript = original;
    assert.equal(claude.calls.length, vorher, 'bei einer Notlage darf kein Aufruf an das Sprachmodell gehen');
    assert.ok(
      speech.state.spoken.some((text) => text.startsWith(SAFETY_START)),
      'gesprochen wurde der feste Sicherheitshinweis'
    );
  });

  it('Notfall-Satz aus der Spracherkennung: ebenfalls kein Aufruf an das Sprachmodell', async () => {
    const vorher = claude.calls.length;
    const original = speech.state.transcript;
    try {
      for (const satz of ['ich bin ganz allein im kaufhaus', 'er hat mich geschlagen', 'ich habe keine luft']) {
        assert.equal(screen(satz), true, satz);
        speech.state.transcript = satz;
        const res = await postQuestion(registered.id, registered.token, questionForm());
        assert.equal(res.status, 200, `${satz}: ${await res.clone().text()}`);
      }
    } finally {
      speech.state.transcript = original;
    }
    assert.equal(claude.calls.length, vorher);
  });

  it('Alltagssatz: das Sprachmodell wird aufgerufen, und die Anfrage enthält keine Gerätedaten', async () => {
    const vorher = claude.calls.length;
    speech.state.transcript = ALLTAGS_SATZ;
    const res = await postQuestion(registered.id, registered.token, questionForm());
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(claude.calls.length, vorher + 1, 'ein Alltagssatz geht genau einmal an das Sprachmodell');
    assertKeineGeraetedaten(claude.calls[vorher], ALLTAGS_SATZ);
  });

  it('Geschichte: die Anfrage an das Sprachmodell enthält ebenfalls keine Gerätedaten', async () => {
    const vorher = claude.calls.length;
    const res = await fetch(`${base}/v1/device/kunibert-story`, {
      method: 'POST',
      headers: { ...headers(registered.id, registered.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short', session_id: 'sitzung-4711' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.ok(claude.calls.length > vorher, 'für die Geschichte wird das Sprachmodell gefragt');
    for (const call of claude.calls.slice(vorher)) assertKeineGeraetedaten(call);
  });

  it('Server-Protokoll enthält keine Äußerungen und keine Tokens', () => {
    const verboten: Array<[string, string]> = [
      ['Alltagssatz', ALLTAGS_SATZ],
      ['Geräte-Token (Umgebung)', ENV_DEVICE_TOKEN],
      ['Geräte-Token (angelegt)', registered.token],
      ['Admin-Token', ADMIN_TOKEN],
      ['Schlüssel des Sprachmodells', FAKE_ANTHROPIC_KEY],
      ...NOTFALL_SAETZE.map((satz): [string, string] => [`Notfall-Satz "${satz.slice(0, 20)}…"`, satz]),
    ];
    for (const [was, wert] of verboten) {
      assert.ok(!output.includes(wert), `${was} steht im Server-Protokoll`);
    }
  });
});

/** Prüft eine aufgezeichnete Anfrage an das Sprachmodell auf Gerätedaten und unerwartete Felder. */
function assertKeineGeraetedaten(call: ClaudeCall, erwarteteAeusserung?: string): void {
  const geheim: Array<[string, string]> = [
    ['Geräte-ID (Umgebung)', ENV_DEVICE_ID],
    ['Geräte-Token (Umgebung)', ENV_DEVICE_TOKEN],
    ['Geräte-ID (angelegt)', 'geraet-registriert-4711'],
    ['Gerätename', REGISTERED_NAME],
    ['Admin-Token', ADMIN_TOKEN],
    ['Sitzungskennung', 'sitzung-4711'],
  ];
  const alles = JSON.stringify(call.headers) + call.body;
  for (const [was, wert] of geheim) {
    assert.ok(!alles.includes(wert), `Die Anfrage an das Sprachmodell enthält: ${was}`);
  }
  assert.equal(call.headers.authorization, undefined, 'kein Authorization-Header an das Sprachmodell');
  assert.equal(call.headers['x-device-id'], undefined, 'kein Geräte-Header an das Sprachmodell');

  // Nur diese Felder sind erlaubt. Ein neues Feld (z. B. metadata.user_id mit der Geräte-ID) fällt hier auf.
  const body = JSON.parse(call.body) as Record<string, unknown> & { messages: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'system', 'tool_choice', 'tools']);
  assert.equal(body.messages.length, 1);
  assert.deepEqual(Object.keys(body.messages[0]).sort(), ['content', 'role']);
  if (erwarteteAeusserung) {
    assert.ok(String(body.messages[0].content).includes(erwarteteAeusserung), 'die Äußerung des Kindes ist Teil der Anfrage');
  }
}
