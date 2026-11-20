// Messung: Wie lange wartet das Kind nach der Sprechtaste auf den ersten Ton, wenn es sich eine
// Geschichte wünscht oder eine Idee für die laufende Folge sagt (Punkt B1 der Arbeitsliste)?
//
//   node deploy/dryrun/sprechtaste-messung.mjs
//
// Alles läuft auf diesem Rechner, nichts geht nach außen: Claude ist eine Attrappe
// (deploy/dryrun/mock-anthropic.mjs) mit 4 s für die Einordnung und 14 s Schreibzeit für einen Teil
// von rund 210 Wörtern; die Sprachausgabe ist eine Attrappe, die so schnell ist wie Pocket auf zwei
// Kernen (rund 0,46 s Rechenzeit je Sekunde Ton, gemessen am 13.11.2026). Der Server läuft wie im
// Probelauf am Rechner (ohne NODE_ENV=production) mit Ton-Strom, einmal ohne und einmal mit
// KUNIBERT_EINORDNUNG_PARALLEL=1. Zahlen aus Attrappen: Sie zeigen den Unterschied, nicht die
// Wartezeit mit dem echten Claude.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEVICE = 'prototype-1';
const TOKEN = 'test-token-kunibert-2026'; // Entwicklungsgerät, nur ohne NODE_ENV=production (devices.ts)
const ANSWER_MS = Number(process.env.EINORDNUNG_MS || 4000);
const WRITE_MS = Number(process.env.SCHREIBZEIT_MS || 14000);
const TTS_FACTOR = Number(process.env.TTS_FAKTOR || 0.46);

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

/** WAV mit `seconds` leisem Ton (16 kHz, mono, 16 Bit). */
function wav(seconds) {
  const rate = 16000;
  const samples = Math.max(1, Math.round(rate * seconds));
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(1500 * Math.sin((2 * Math.PI * 330 * i) / rate)), i * 2);
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

/** Sprachausgabe-Attrappe (OpenAI-kompatibel wie Speaches): 0,4 s Ton je Wort, Rechenzeit wie Pocket. */
async function startFakeTts() {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.url !== '/v1/audio/speech') {
        res.writeHead(404).end();
        return;
      }
      const { input } = JSON.parse(raw);
      const seconds = Math.max(0.5, String(input).split(/\s+/).filter(Boolean).length * 0.4);
      setTimeout(() => {
        const body = wav(seconds);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': body.length });
        res.end(body);
      }, seconds * TTS_FACTOR * 1000);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function startServer(parallel, ttsPort) {
  const mockPort = await freePort();
  const port = await freePort();
  const mock = spawn(process.execPath, [path.join(root, 'deploy', 'dryrun', 'mock-anthropic.mjs')], {
    env: { ...process.env, MOCK_PORT: String(mockPort), MOCK_WRITE_MS: String(WRITE_MS), MOCK_ANSWER_MS: String(ANSWER_MS), MOCK_LONG_STORY: '1', MOCK_CATEGORIES: '1' },
    stdio: 'ignore',
  });
  let log = '';
  const env = { ...process.env };
  delete env.NODE_ENV;
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: {
      ...env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_DEVICE_STORE: 'memory',
      PICASTAI_STT_URL: `http://127.0.0.1:${ttsPort}/v1`,
      PICASTAI_STT_MODEL: 'attrappe-stt',
      PICASTAI_TTS_URL: `http://127.0.0.1:${ttsPort}/v1`,
      PICASTAI_TTS_MODEL: 'attrappe-tts',
      PICASTAI_TTS_VOICE: 'attrappe',
      PICASTAI_LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'attrappe-kein-echter-schluessel',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
      PICASTAI_STORY_PREFETCH: '0',
      PICASTAI_AUDIO_STREAM: '1',
      PICASTAI_VOICE_TIMEOUT_MS: '110000',
      KUNIBERT_EINWILLIGUNG_PRUEFEN: '0',
      KUNIBERT_EINORDNUNG_PARALLEL: parallel ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (log += chunk));
  server.stderr.on('data', (chunk) => (log += chunk));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // startet noch
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { base, stop: () => { server.kill(); mock.kill(); }, log: () => log };
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Device-ID': DEVICE, 'X-Kunibert-Audio-Stream': '1' };

/** Eine Anfrage wie vom Pi: Antwort abwarten, dann den Ton abholen; Zeiten in Sekunden ab dem Absenden. */
async function timed(base, route, init) {
  const started = performance.now();
  const response = await fetch(`${base}${route}`, init);
  const body = await response.json();
  if (!body.audio_url) throw new Error(`Antwort ohne audio_url: HTTP ${response.status} ${JSON.stringify(body)}`);
  const answered = performance.now();
  const audio = await fetch(body.audio_url, { headers });
  const reader = audio.body.getReader();
  let bytes = 0;
  let firstSound = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      bytes += value.length;
      if (firstSound === null && bytes > 44) firstSound = performance.now();
    }
    if (done) break;
  }
  const finished = performance.now();
  const s = (t) => ((t - started) / 1000).toFixed(1);
  return { antwort_s: s(answered), erster_ton_s: s(firstSound ?? finished), alles_geladen_s: s(finished), audio_s: ((bytes - 44) / 32000).toFixed(1), strom: body.audio_stream === true };
}

function questionForm(transcript) {
  const form = new FormData();
  form.append('transcript', transcript);
  form.append('audio', new Blob([new Uint8Array(wav(0.5))], { type: 'audio/wav' }), 'frage.wav');
  return form;
}

const ask = (base, transcript) => timed(base, '/v1/device/question', { method: 'POST', headers, body: questionForm(transcript) });
const story = (base) => timed(base, '/v1/device/kunibert-story', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ length: 'short' }) });

const tts = await startFakeTts();
try {
  for (const parallel of [false, true]) {
    const server = await startServer(parallel, tts.port);
    try {
      const results = {
        geschichtenwunsch: await ask(server.base, 'Erzähl mir eine Geschichte von einem Einhorn'),
        frage: await ask(server.base, 'Warum ist der Himmel blau'),
      };
      // Idee mitten in einer Folge: erst Teil 1 über die Erzähltaste, dann die Idee.
      await story(server.base);
      results.idee = await ask(server.base, 'Kunibert soll den Drachen kitzeln');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const timing = server.log().split('\n').filter((line) => line.startsWith('Zeitmessung')).join('\n');
      console.log(JSON.stringify({ einordnung_parallel: parallel, ...results, timing }, null, 1));
    } finally {
      server.stop();
    }
  }
} finally {
  tts.server.close();
}
