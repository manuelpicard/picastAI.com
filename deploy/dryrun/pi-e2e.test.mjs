// Ende-zu-Ende-Test ohne Hardware und ohne fremde Dienste:
// der echte Pi-Client (pi-client/kunibert_client.py) spricht mit dem echten Server (server.ts).
// Sprachmodell, Spracherkennung und Sprachausgabe sind lokale Attrappen. Es geht nichts nach außen.
//
//   npm run test:e2e
//
// Der Test fängt Brüche zwischen Pi-Client und Server ab (Adressen, Header, Formularfelder,
// audio_url, einmaliger Audio-Abruf), bevor der echte Pi da ist. Er sagt nichts über Ton,
// Tasten, WLAN oder Wartezeiten.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const client = path.join(root, 'pi-client', 'kunibert_client.py');

const DEVICE_ID = 'pi-e2e';
const DEVICE_TOKEN = 'e2e-geraete-token-nur-fuer-diesen-test';
const HEARD = 'Warum ist der Himmel blau?';

/** Kurze WAV-Datei: mono, 16 Bit, 16 kHz, leiser Ton. */
function makeWav(seconds = 0.5) {
  const rate = 16000;
  const samples = Math.floor(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const seen = { transcriptions: 0, speech: 0, sttFields: '' };
let voiceServer;
let children = [];
let base = '';
let serverLog = '';

function clientEnv() {
  return {
    ...process.env,
    PICASTAI_API_BASE_URL: base,
    PICASTAI_DEVICE_ID: DEVICE_ID,
    PICASTAI_DEVICE_TOKEN: DEVICE_TOKEN,
    KUNIBERT_RETRY_COUNT: '0',
    KUNIBERT_REQUEST_TIMEOUT: '20',
  };
}

before(async () => {
  // Attrappe für Spracherkennung und Sprachausgabe (OpenAI-kompatible Schnittstelle wie Speaches).
  voiceServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
        seen.transcriptions += 1;
        seen.sttFields = Buffer.concat(chunks).toString('latin1');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ text: HEARD }));
      }
      if (req.method === 'POST' && req.url === '/v1/audio/speech') {
        seen.speech += 1;
        const wav = makeWav();
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
        return res.end(wav);
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise((resolve) => voiceServer.listen(0, '127.0.0.1', resolve));
  const voicePort = voiceServer.address().port;

  const mockPort = await freePort();
  const serverPort = await freePort();
  base = `http://127.0.0.1:${serverPort}`;

  const mock = spawn(process.execPath, [path.join(root, 'deploy', 'dryrun', 'mock-anthropic.mjs')], {
    env: { ...process.env, MOCK_PORT: String(mockPort) },
    stdio: 'ignore',
  });
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(serverPort),
      PICASTAI_PUBLIC_BASE_URL: base,
      PICASTAI_ADMIN_TOKEN: 'e2e-admin-token-nur-fuer-diesen-test',
      PICASTAI_DEVICE_ID: DEVICE_ID,
      PICASTAI_DEVICE_TOKEN: DEVICE_TOKEN,
      PICASTAI_DEVICE_STORE: 'memory',
      PICASTAI_STT_URL: `http://127.0.0.1:${voicePort}/v1`,
      PICASTAI_STT_MODEL: 'attrappe-stt',
      PICASTAI_TTS_URL: `http://127.0.0.1:${voicePort}/v1`,
      PICASTAI_TTS_MODEL: 'attrappe-tts',
      PICASTAI_TTS_VOICE: 'attrappe',
      PICASTAI_LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'attrappe-kein-echter-schluessel',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (serverLog += chunk));
  server.stderr.on('data', (chunk) => (serverLog += chunk));
  children = [mock, server];

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) break;
    } catch {
      // Server startet noch.
    }
    if (server.exitCode !== null || Date.now() > deadline) {
      throw new Error(`Server startet nicht:\n${serverLog.slice(-2000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // Im Betrieb antwortet der Server erst nach der Einwilligung der Eltern: koppeln wie die
  // Eltern-App (Code über die Betreiber-Route) und einwilligen.
  const admin = { Authorization: 'Bearer e2e-admin-token-nur-fuer-diesen-test' };
  const { code } = await (await fetch(`${base}/api/devices/${DEVICE_ID}/kopplungscode`, { method: 'POST', headers: admin })).json();
  const paired = await fetch(`${base}/v1/eltern/koppeln`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  assert.equal(paired.status, 200);
  const cookie = (paired.headers.get('set-cookie') || '').split(';')[0];
  const consent = await fetch(`${base}/v1/eltern/einwilligung`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(consent.status, 200);
});

after(async () => {
  for (const child of children) child.kill('SIGTERM');
  await new Promise((resolve) => voiceServer.close(resolve));
});

test('Pi-Client: --once health meldet OK', async () => {
  const { stdout } = await run('python3', [client, '--once', 'health'], { env: clientEnv() });
  assert.match(stdout, /^OK\s*$/);
});

test('Pi-Client: falsches Token wird abgelehnt', async () => {
  const env = { ...clientEnv(), PICASTAI_DEVICE_TOKEN: 'falsch' };
  await assert.rejects(run('python3', [client, '--once', 'story'], { env }));
});

test('Pi-Client: --once story holt eine WAV-Datei über die audio_url', async () => {
  const before = seen.speech;
  const { stdout } = await run('python3', [client, '--once', 'story'], { env: clientEnv() });
  const match = stdout.match(/Story-Audio empfangen: (\d+) Bytes/);
  assert.ok(match, `unerwartete Ausgabe: ${stdout}`);
  assert.ok(Number(match[1]) > 44, 'WAV ist leer');
  assert.ok(seen.speech > before, 'Sprachausgabe wurde nicht aufgerufen');
});

test('Pi-Client: Frage mit Aufnahme läuft durch Erkennung, Sprachmodell und Sprachausgabe', async () => {
  const script = [
    'import sys, base64',
    `sys.path.insert(0, ${JSON.stringify(path.join(root, 'pi-client'))})`,
    'import kunibert_client as k',
    'config = k.ClientConfig.from_env(dry_run=True)',
    'wav = base64.b64decode(sys.argv[1])',
    'answer = k.PicastApi(config).ask_question(wav)',
    'print("RIFF" if answer[:4] == b"RIFF" and answer[8:12] == b"WAVE" else "KEIN-WAV", len(answer))',
  ].join('\n');
  const before = seen.transcriptions;
  const { stdout } = await run('python3', ['-c', script, makeWav(1).toString('base64')], { env: clientEnv() });
  assert.match(stdout, /^RIFF \d+\s*$/);
  assert.equal(seen.transcriptions, before + 1, 'Spracherkennung wurde nicht genau einmal aufgerufen');
  // Der Server gibt Sprache und Hinweiswort an die Erkennung weiter.
  assert.match(seen.sttFields, /name="language"\r\n\r\nde/);
});

test('Server-Protokoll enthält weder Token noch erkannten Text', () => {
  assert.ok(!serverLog.includes(DEVICE_TOKEN), 'Geräte-Token im Protokoll');
  assert.ok(!serverLog.includes(HEARD), 'erkannter Text im Protokoll');
  assert.match(serverLog, /Zeitmessung/);
});
