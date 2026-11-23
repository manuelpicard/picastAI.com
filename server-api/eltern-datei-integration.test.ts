// Integrationstest (Punkt E2): Die Eltern-Steuerung übersteht einen Neustart des echten Servers.
//
// Der Server (server.ts) läuft als Kindprozess im Betrieb (NODE_ENV=production) mit einer Datei für die
// Eltern-Steuerung in einem leeren Ordner und wird mehrmals neu gestartet. Geprüft wird von außen:
// Einwilligung, Ruhezeiten und Eltern-Cookie bleiben; ein Widerruf bleibt; „alles löschen“ löscht auch
// in der Datei; in Datei und Protokoll stehen weder Geräte-ID noch Eltern-Token noch Schlüssel; eine
// kaputte Datei lässt den Server nicht starten. Alle Schlüssel und Kennungen sind erfunden.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeWav } from './audio.js';
import { pseudonymFor } from './eltern-datei.js';
import { ELTERNTEXT_VERSION, localMinutes } from './eltern.js';
import { pair } from './eltern-testhilfe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN = 'test-admin-token-eltern-datei-0123456789-abcdef';
const DEVICE_ID = 'kunibert-dauerhaft-007';
const DEVICE_TOKEN = 'geraete-token-eltern-datei-0123456789';
const KEY = 'test-schluessel-eltern-datei-0123456789abcdef01234';

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

/** Attrappe für Spracherkennung und Sprachausgabe (OpenAI-kompatibel). */
function startFakeSpeech(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url === '/audio/speech') {
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(8_000), 16_000, 1, 16));
        return;
      }
      if (req.url === '/audio/transcriptions') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'warum ist der himmel blau' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port })));
}

/** Leiser Ton: klingt für den Server wie eine Aufnahme mit Inhalt. */
function toneWav(): Buffer {
  const frames = 8_000;
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) pcm.writeInt16LE(Math.round(2000 * Math.sin((2 * Math.PI * 440 * i) / 16_000)), i * 2);
  return encodeWav(pcm, 16_000, 1, 16);
}

/** Ruhezeiten, die gerade nicht gelten (in zwei Stunden für eine Minute, Berliner Zeit). */
function quietHoursLater(): { von: string; bis: string } {
  const now = localMinutes(new Date());
  const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { von: hhmm(now + 120), bis: hhmm(now + 121) };
}

describe('Eltern-Steuerung in einer Datei: Neustart des echten Servers (Punkt E2)', () => {
  let speech: { server: http.Server; port: number };
  let dir = '';
  let file = '';
  let output = '';
  let child: ChildProcess | null = null;
  let base = '';
  const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const device = { Authorization: `Bearer ${DEVICE_TOKEN}`, 'X-Device-ID': DEVICE_ID };

  function spawnKunibert(port: number): ChildProcess {
    const env: Record<string, string> = {
      PATH: process.env.PATH || '',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
      PICASTAI_DEVICE_ID: DEVICE_ID,
      PICASTAI_DEVICE_TOKEN: DEVICE_TOKEN,
      PICASTAI_PUBLIC_BASE_URL: 'https://kunibert.test',
      PICASTAI_STT_URL: `http://127.0.0.1:${speech.port}`,
      PICASTAI_STT_MODEL: 'test-stt',
      PICASTAI_TTS_URL: `http://127.0.0.1:${speech.port}`,
      PICASTAI_TTS_MODEL: 'test-tts',
      PICASTAI_TTS_VOICE: 'test-voice',
      KUNIBERT_ELTERN_DATEI: file,
      KUNIBERT_ELTERN_SCHLUESSEL: KEY,
    };
    for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT']) {
      if (process.env[name]) env[name] = process.env[name] as string;
    }
    const proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (chunk: Buffer) => (output += chunk));
    proc.stderr?.on('data', (chunk: Buffer) => (output += chunk));
    return proc;
  }

  async function start(): Promise<void> {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawnKunibert(port);
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`Server vorzeitig beendet (Code ${child.exitCode}):\n${output}`);
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch {
        // noch nicht bereit
      }
      if (Date.now() > deadline) throw new Error(`Server nicht rechtzeitig bereit:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async function stop(): Promise<void> {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child!.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = null;
  }

  async function turn(): Promise<{ kind: string; fixed?: string }> {
    const form = new FormData();
    form.append('mode', 'frage');
    form.append('audio', new Blob([new Uint8Array(toneWav())], { type: 'audio/wav' }), 'frage.wav');
    const res = await fetch(`${base}/v1/turn`, { method: 'POST', headers: device, body: form });
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json()) as { kind: string; fixed?: string };
  }

  const eltern = (cookie: string, method: string, route: string, body?: unknown) =>
    fetch(`${base}/v1/eltern/${route}`, {
      method,
      headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const stored = () => JSON.parse(fs.readFileSync(file, 'utf8')) as { format: number; geraete: Record<string, any> };

  before(async () => {
    speech = await startFakeSpeech();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kunibert-eltern-datei-'));
    file = path.join(dir, 'eltern.json');
  });

  after(async () => {
    await stop();
    await new Promise<void>((resolve) => speech.server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('Einwilligung, Ruhezeiten und Kopplung bleiben; Widerruf und „alles löschen“ auch; nichts davon im Protokoll', async () => {
    await start();
    const status = (await (await fetch(`${base}/api/status`, { headers: admin })).json()) as { eltern: { dauerhaft: boolean } };
    assert.equal(status.eltern.dauerhaft, true);
    assert.ok(!output.includes('Eltern-Steuerung nur im Arbeitsspeicher'), 'keine Warnung, wenn beides gesetzt ist');
    assert.equal((await turn()).fixed, 'einwilligung', 'vor der Einwilligung nur der feste Hinweis');

    // Koppeln über die Betreiber-Route, einwilligen, Ruhezeiten setzen.
    const cookie = await pair(base, ADMIN_TOKEN, DEVICE_ID);
    const granted = await eltern(cookie, 'PUT', 'einwilligung', {});
    assert.equal(granted.status, 200);
    const consent = ((await granted.json()) as { einwilligung: Record<string, unknown> }).einwilligung;
    assert.equal(consent.erteilt, true);
    assert.equal(consent.weg, 'betreiber', 'Code kam über die Betreiber-Route');
    assert.equal(consent.elterntextVersion, ELTERNTEXT_VERSION);
    const quiet = quietHoursLater();
    assert.equal((await eltern(cookie, 'PUT', 'einstellungen', { ruhezeiten: quiet })).status, 200);

    // In der Datei: nur das Pseudonym, kein Klartext.
    const token = cookie.split('=')[1];
    const text = fs.readFileSync(file, 'utf8');
    for (const secret of [DEVICE_ID, token, KEY]) assert.ok(!text.includes(secret), 'Klartext in der Datei');
    const pseudonym = pseudonymFor(KEY, DEVICE_ID);
    assert.deepEqual(Object.keys(stored().geraete), [pseudonym]);
    assert.deepEqual(stored().geraete[pseudonym].einwilligung, consent);

    // Neustart: Das Kind bekommt eine Antwort, das Eltern-Handy bleibt gekoppelt.
    await stop();
    await start();
    assert.match(output, /Eltern-Steuerung aus der Datei geladen \(1 Geräte, 0 ohne angemeldetes Gerät gelöscht\)/);
    assert.notEqual((await turn()).kind, 'hinweis', 'Einwilligung überstand den Neustart');
    const afterRestart = await eltern(cookie, 'GET', 'status');
    assert.equal(afterRestart.status, 200, 'Eltern-Cookie gilt nach dem Neustart');
    const settings = (await afterRestart.json()) as { einwilligung: unknown; ruhezeiten: unknown };
    assert.deepEqual(settings.einwilligung, consent);
    assert.deepEqual(settings.ruhezeiten, quiet);

    // Widerruf, Neustart: Das Gerät bleibt beim festen Hinweis.
    assert.equal((await eltern(cookie, 'DELETE', 'einwilligung')).status, 200);
    await stop();
    await start();
    const hint = await turn();
    assert.equal(hint.kind, 'hinweis');
    assert.equal(hint.fixed, 'einwilligung', 'Widerruf überstand den Neustart');
    const revoked = (await (await eltern(cookie, 'GET', 'status')).json()) as { einwilligung: { erteilt: boolean; zeitpunkt: string | null } };
    assert.equal(revoked.einwilligung.erteilt, false);
    assert.ok(revoked.einwilligung.zeitpunkt, 'Zeitpunkt des Widerrufs steht da');

    // Alles löschen: auch in der Datei. Nach dem nächsten Neustart gilt das alte Cookie nicht mehr.
    assert.equal((await eltern(cookie, 'DELETE', 'daten')).status, 200);
    assert.deepEqual(stored(), { format: 1, geraete: {} });
    await stop();
    await start();
    assert.equal((await eltern(cookie, 'GET', 'status')).status, 401);
    await stop();

    for (const secret of [DEVICE_ID, token, KEY, pseudonym]) assert.ok(!output.includes(secret), 'Kennung oder Schlüssel im Protokoll');
  });

  it('Kaputte Datei: Der Server startet nicht, nennt den Inhalt nicht und lässt die Datei, wie sie ist', async () => {
    const broken = '{"format":1,"geraete":{"geheimer-inhalt-4711"';
    fs.writeFileSync(file, broken);
    output = '';
    child = spawnKunibert(await freePort());
    const code = await new Promise<number | null>((resolve) => child!.once('exit', resolve));
    child = null;
    assert.notEqual(code, 0);
    assert.match(output, /Datei der Eltern-Steuerung \(KUNIBERT_ELTERN_DATEI\) ist nicht lesbar oder ungültig \(kein_json\)/);
    assert.ok(!output.includes('geheimer-inhalt-4711'), 'Inhalt der Datei im Protokoll');
    assert.equal(fs.readFileSync(file, 'utf8'), broken);
  });
});
