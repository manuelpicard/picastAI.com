// Integrationstest: startet den echten Server (server.ts) als Kindprozess gegen einen
// lokalen Attrappen-Sprachdienst und prüft den API-Vertrag von außen. Ohne API-Keys für
// Sprachmodelle, dadurch laufen Antworten über die festen Fallback-Texte und sind
// deterministisch.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeWavHeader, encodeWav } from './audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN = 'test-admin-token-0123456789-abcdefghijklmnop';
const ENV_DEVICE_ID = 'env-device';
const ENV_DEVICE_TOKEN = 'env-device-token-0123456789';
const PUBLIC_BASE_URL = 'https://kunibert.test';
const SAFETY_START = 'Danke, dass du mir das sagst';

interface FakeSpeechService {
  speechInputs: string[];
  transcriptions: number;
  speechFails: boolean;
  transcript: string;
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

/** Attrappe für den OpenAI-kompatiblen Sprachdienst (STT und TTS). */
function startFakeSpeechService(): Promise<{ server: http.Server; state: FakeSpeechService; port: number }> {
  const state: FakeSpeechService = {
    speechInputs: [],
    transcriptions: 0,
    speechFails: false,
    transcript: 'warum ist der himmel blau',
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/audio/speech') {
        if (state.speechFails) {
          res.writeHead(500);
          res.end('absichtlicher Testfehler');
          return;
        }
        const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: string };
        state.speechInputs.push(input);
        // 24 kHz wie bei echten TTS-Diensten: der Server muss auf 16 kHz umrechnen.
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(12_000), 24_000, 1, 16));
        return;
      }
      if (req.url === '/audio/transcriptions') {
        state.transcriptions++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: state.transcript }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, state, port: (server.address() as net.AddressInfo).port });
    });
  });
}

const wav16k = (seconds = 0.5) => encodeWav(Buffer.alloc(Math.round(16_000 * 2 * seconds)), 16_000, 1, 16);

function questionForm(wav: Buffer | null, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  if (wav) form.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'question.wav');
  return form;
}

describe('picastAI-API (echter Server)', () => {
  let child: ChildProcess;
  let fake: { server: http.Server; state: FakeSpeechService; port: number };
  let base = '';
  let output = '';
  let deviceCounter = 0;

  const deviceHeaders = (deviceId: string, token: string) => ({ Authorization: `Bearer ${token}`, 'X-Device-ID': deviceId });

  async function registerDevice(): Promise<{ id: string; token: string }> {
    const id = `test-device-${++deviceCounter}`;
    const res = await fetch(`${base}/api/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: id, name: id }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as { token: string };
    return { id, token: body.token };
  }

  const postStory = (device: { id: string; token: string }) =>
    fetch(`${base}/v1/device/kunibert-story`, {
      method: 'POST',
      headers: { ...deviceHeaders(device.id, device.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short' }),
    });

  const postQuestion = (device: { id: string; token: string }, form: FormData) =>
    fetch(`${base}/v1/device/question`, {
      method: 'POST',
      headers: deviceHeaders(device.id, device.token),
      body: form,
    });

  const fetchAudio = (device: { id: string; token: string }, audioUrl: string) =>
    fetch(base + new URL(audioUrl).pathname, { headers: deviceHeaders(device.id, device.token) });

  before(async () => {
    fake = await startFakeSpeechService();
    const port = await freePort();
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
      PICASTAI_STT_URL: `http://127.0.0.1:${fake.port}`,
      PICASTAI_STT_MODEL: 'test-stt',
      PICASTAI_TTS_URL: `http://127.0.0.1:${fake.port}`,
      PICASTAI_TTS_MODEL: 'test-tts',
      PICASTAI_TTS_VOICE: 'test-voice',
      KUNIBERT_RATE_LIMIT: '500',
    };
    if (process.env.HOME) env.HOME = process.env.HOME;
    if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;

    child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk));

    const deadline = Date.now() + 60_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`Server vorzeitig beendet (Code ${child.exitCode}):\n${output}`);
      try {
        const res = await fetch(`${base}/health`);
        if (res.ok) break;
      } catch {
        // noch nicht bereit
      }
      if (Date.now() > deadline) throw new Error(`Server nicht rechtzeitig bereit:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  });

  after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  });

  it('Health ist öffentlich, die Antwort verrät das Framework nicht', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, 'ok');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('Geräte-Routen verlangen Anmeldung, auch vor dem Einlesen eines Uploads', async () => {
    const story = await fetch(`${base}/v1/device/kunibert-story`, { method: 'POST' });
    assert.equal(story.status, 401);
    const question = await fetch(`${base}/v1/device/question`, { method: 'POST', body: questionForm(wav16k()) });
    assert.equal(question.status, 401);
    const wrong = await fetch(`${base}/v1/device/kunibert-story`, {
      method: 'POST',
      headers: deviceHeaders(ENV_DEVICE_ID, 'falsches-token'),
    });
    assert.equal(wrong.status, 401);
    const audio = await fetch(`${base}/v1/device/audio/t_gibt_es_nicht`);
    assert.equal(audio.status, 401);
  });

  it('Erzähltaste setzt die Folge fort: Teile 1 bis 5, session_end erst am Ende, danach neue Folge', async () => {
    const device = await registerDevice();
    const ends: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await postStory(device);
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as { type: string; audio_url: string; session_end: boolean };
      assert.equal(body.type, 'kunibert_story');
      assert.ok(body.audio_url.startsWith(`${PUBLIC_BASE_URL}/v1/device/audio/`), body.audio_url);
      ends.push(body.session_end);
    }
    assert.deepEqual(ends, [false, false, false, false, true, false]);
  });

  it('Audio wird einmalig und nur an das eigene Gerät ausgeliefert, als 16-kHz-Mono-WAV', async () => {
    const owner = await registerDevice();
    const other = await registerDevice();
    const res = await postStory(owner);
    const { audio_url } = (await res.json()) as { audio_url: string };

    const foreign = await fetchAudio(other, audio_url);
    assert.equal(foreign.status, 404, 'fremdes Gerät darf das Audio nicht abholen');

    const first = await fetchAudio(owner, audio_url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'audio/wav');
    const wav = Buffer.from(await first.arrayBuffer());
    const header = decodeWavHeader(wav);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.channels, 1);
    assert.equal(header.bitsPerSample, 16);

    const second = await fetchAudio(owner, audio_url);
    assert.equal(second.status, 404, 'zweiter Abruf muss scheitern');
  });

  it('Frage mit Transkript-Feld: Notlage ergibt den Sicherheitshinweis, der nur einmal synthetisiert wird', async () => {
    const first = await registerDevice();
    const second = await registerDevice();
    for (const device of [first, second]) {
      const res = await postQuestion(device, questionForm(wav16k(), { transcript: 'ich will nicht mehr leben' }));
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as { type: string; audio_url: string };
      assert.equal(body.type, 'answer');
      const audio = await fetchAudio(device, body.audio_url);
      assert.equal(audio.status, 200);
    }
    const spoken = fake.state.speechInputs.filter((text) => text.startsWith(SAFETY_START));
    assert.equal(spoken.length, 1, 'fester Text kommt nach dem ersten Mal aus dem Speicher');
  });

  it('Frage ohne Transkript läuft über Spracherkennung, Erzählmotor und Sprachsynthese', async () => {
    const device = await registerDevice();
    const before = fake.state.transcriptions;
    const res = await postQuestion(device, questionForm(wav16k()));
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(fake.state.transcriptions, before + 1);
    assert.ok(
      fake.state.speechInputs.some((text) => text.startsWith('Der Himmel wirkt blau')),
      `gesprochen wurde: ${fake.state.speechInputs.join(' | ').slice(0, 300)}`
    );
  });

  it('Frage, bei der die Erkennung keinen Text liefert (Stille), ergibt "nicht verstanden" statt eines Fehlers', async () => {
    const device = await registerDevice();
    const original = fake.state.transcript;
    fake.state.transcript = '';
    try {
      const res = await postQuestion(device, questionForm(wav16k()));
      assert.equal(res.status, 200, await res.clone().text());
      const body = (await res.json()) as { type: string; audio_url: string };
      assert.equal(body.type, 'answer');
      const audio = await fetchAudio(device, body.audio_url);
      assert.equal(audio.status, 200);
      assert.ok(
        fake.state.speechInputs.some((text) => text.startsWith('Das habe ich leider nicht richtig verstanden')),
        `gesprochen wurde: ${fake.state.speechInputs.join(' | ').slice(0, 300)}`
      );
    } finally {
      fake.state.transcript = original;
    }
  });

  it('fehlerhafte Aufnahmen ergeben 400 mit klarem Fehlercode', async () => {
    const device = await registerDevice();
    const noAudio = await postQuestion(device, questionForm(null, { transcript: 'hallo' }));
    assert.equal(noAudio.status, 400);
    assert.equal(((await noAudio.json()) as { error: string }).error, 'audio_required');

    const garbage = await postQuestion(device, questionForm(Buffer.from('das ist kein wav, nur Text '.repeat(10))));
    assert.equal(garbage.status, 400);
    assert.equal(((await garbage.json()) as { error: string }).error, 'bad_audio');

    const wrongRate = await postQuestion(device, questionForm(encodeWav(Buffer.alloc(8_000), 44_100, 1, 16)));
    assert.equal(wrongRate.status, 400);
    assert.equal(((await wrongRate.json()) as { error: string }).error, 'unsupported_audio_format');
  });

  it('zu große Aufnahme ergibt 413 als JSON statt 500', async () => {
    const device = await registerDevice();
    const res = await postQuestion(device, questionForm(Buffer.alloc(3 * 1024 * 1024, 1)));
    assert.equal(res.status, 413);
    assert.equal(((await res.json()) as { error: string }).error, 'audio_too_large');
  });

  it('Ausfall des Sprachdienstes: 503 retryable, und die Folge rückt nicht vor', async () => {
    const device = await registerDevice();
    const ends: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await postStory(device);
      assert.equal(res.status, 200);
      ends.push(((await res.json()) as { session_end: boolean }).session_end);
    }
    assert.deepEqual(ends, [false, false, false, false]);

    fake.state.speechFails = true;
    try {
      const failed = await postStory(device);
      assert.equal(failed.status, 503);
      const body = (await failed.json()) as { error: string; retryable: boolean };
      assert.equal(body.error, 'voice_provider_failed');
      assert.equal(body.retryable, true);
    } finally {
      fake.state.speechFails = false;
    }

    // Wäre die Folge trotz Fehler vorgerückt, wäre dies jetzt Teil 1 einer neuen Folge.
    const last = await postStory(device);
    assert.equal(last.status, 200);
    assert.equal(((await last.json()) as { session_end: boolean }).session_end, true, 'Teil 5 muss das Ende sein');
  });

  it('ungültig kodierter Pfad bleibt ein 400 als JSON, kein 500 und kein Fehlerprotokoll', async () => {
    const device = await registerDevice();
    const logged = output.length;
    const res = await fetch(`${base}/v1/device/audio/%zz`, { headers: deviceHeaders(device.id, device.token) });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'bad_request');
    assert.ok(!output.slice(logged).includes('Unbehandelter Fehler'), output.slice(logged));
  });

  it('Admin-Routen verlangen das Admin-Token; kaputtes JSON ergibt 400', async () => {
    const without = await fetch(`${base}/api/devices`);
    assert.equal(without.status, 401);

    const wrong = await fetch(`${base}/api/devices`, { headers: { Authorization: 'Bearer falsch' } });
    assert.equal(wrong.status, 401);

    const list = await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    assert.equal(list.status, 200);
    const devices = ((await list.json()) as { devices: Array<{ deviceId: string }> }).devices;
    assert.ok(devices.some((entry) => entry.deviceId === ENV_DEVICE_ID));
    assert.ok(!devices.some((entry) => entry.deviceId === 'simulator-web'), 'Entwicklungsgerät darf in Produktion nicht existieren');

    const broken = await fetch(`${base}/api/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: '{kaputt',
    });
    assert.equal(broken.status, 400);
    assert.equal(((await broken.json()) as { error: string }).error, 'bad_json');
  });

  it('Entwicklungs-Token funktioniert in Produktion nicht', async () => {
    const res = await fetch(`${base}/v1/device/kunibert-story`, {
      method: 'POST',
      headers: deviceHeaders('simulator-web', 'sim-web-token-xyz-123'),
    });
    assert.equal(res.status, 401);
  });
});
