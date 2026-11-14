// Messung zum Ton-Strom (Punkt 71): Wie lange dauert es von der Erzähltaste bis zum ersten Ton,
// ohne und mit PICASTAI_AUDIO_STREAM? Claude ist eine Attrappe, die so lange schreibt wie Claude
// im Probelauf vom 14.11.2026 (MOCK_WRITE_MS, Standard 14 000 ms für einen Teil); die Stimme ist das
// echte Pocket (pocket-tts serve auf POCKET_URL, Standard http://127.0.0.1:8001).
// Start: node deploy/dryrun/strom-messung.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const writeMs = Number(process.env.MOCK_WRITE_MS || 14_000);
const pocketUrl = process.env.POCKET_URL || 'http://127.0.0.1:8001';
const TOKEN = 'test-token-kunibert-2026'; // Entwicklungsgerät, nur ohne NODE_ENV=production (devices.ts)
const DEVICE = 'prototype-1';

const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

async function startServer(stream) {
  const mockPort = await freePort();
  const port = await freePort();
  const mock = spawn(process.execPath, [path.join(root, 'deploy', 'dryrun', 'mock-anthropic.mjs')], {
    env: { ...process.env, MOCK_PORT: String(mockPort), MOCK_WRITE_MS: String(writeMs), MOCK_LONG_STORY: '1' },
    stdio: 'ignore',
  });
  let log = '';
  const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_DEVICE_STORE: 'memory',
      PICASTAI_TTS_PROVIDER: 'pocket',
      PICASTAI_POCKET_TTS_URL: pocketUrl,
      PICASTAI_LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'attrappe-kein-echter-schluessel',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
      PICASTAI_STORY_PREFETCH: '0',
      PICASTAI_VOICE_TIMEOUT_MS: '110000',
      PICASTAI_AUDIO_STREAM: stream ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (c) => (log += c));
  server.stderr.on('data', (c) => (log += c));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, stop: () => { server.kill(); mock.kill(); }, log: () => log };
}

async function measure(stream) {
  const server = await startServer(stream);
  const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Device-ID': DEVICE, 'Content-Type': 'application/json', 'X-Kunibert-Audio-Stream': '1' };
  try {
    const started = performance.now();
    const response = await fetch(`${server.base}/v1/device/kunibert-story`, { method: 'POST', headers, body: JSON.stringify({ length: 'short' }) });
    const body = await response.json();
    if (!body.audio_url) throw new Error(`Antwort ohne audio_url: HTTP ${response.status} ${JSON.stringify(body)}\n${server.log().slice(-1500)}`);
    const answered = performance.now();
    const audio = await fetch(body.audio_url, { headers });
    const reader = audio.body.getReader();
    let bytes = 0;
    let firstSound = null;
    // Vorsprung: wie viele Sekunden Ton schon da sind, aber noch nicht gespielt wären. Unter 0 = Aussetzer.
    let minLeadS = Infinity;
    for (;;) {
      const before = (bytes - 44) / 32000;
      if (firstSound !== null) minLeadS = Math.min(minLeadS, before - (performance.now() - firstSound) / 1000);
      const { value, done } = await reader.read();
      if (value) {
        bytes += value.length;
        if (firstSound === null && bytes > 44) firstSound = performance.now();
      }
      if (done) break;
    }
    const finished = performance.now();
    await new Promise((r) => setTimeout(r, 300));
    const timing = server.log().split('\n').filter((line) => line.startsWith('Zeitmessung')).join('\n');
    return {
      modus: stream ? 'mit Ton-Strom' : 'ohne Ton-Strom',
      antwort_s: ((answered - started) / 1000).toFixed(1),
      erster_ton_s: ((firstSound - started) / 1000).toFixed(1),
      alles_geladen_s: ((finished - started) / 1000).toFixed(1),
      audio_s: ((bytes - 44) / 32000).toFixed(1),
      strom: body.audio_stream === true,
      kleinster_vorsprung_s: Number.isFinite(minLeadS) ? minLeadS.toFixed(1) : '-',
      timing,
    };
  } finally {
    server.stop();
  }
}

// Einmal Pocket aufwärmen (das erste Modell-Laden zählt nicht).
await fetch(`${pocketUrl}/tts`, { method: 'POST', body: new URLSearchParams({ text: 'Hallo.', voice_url: 'stuart_bell' }) }).catch(() => undefined);
for (const stream of process.env.NUR_STROM === '1' ? [true] : [false, true]) {
  const result = await measure(stream);
  console.log(JSON.stringify(result, null, 1));
}
