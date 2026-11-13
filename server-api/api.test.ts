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
  /** Antwortet wie ein FastAPI-Prüffehler (422) und gibt dabei den Eingabetext zurück. */
  speechRejectsWithInput: boolean;
  transcript: string;
  /** Spracherkennung antwortet mit HTTP 500. */
  transcriptionFails: boolean;
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
    speechRejectsWithInput: false,
    transcript: 'warum ist der himmel blau',
    transcriptionFails: false,
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
        if (state.speechRejectsWithInput) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ detail: [{ type: 'string_too_long', loc: ['body', 'input'], msg: 'String should have at most 10 characters', input }] }));
          return;
        }
        state.speechInputs.push(input);
        // 24 kHz wie bei echten TTS-Diensten: der Server muss auf 16 kHz umrechnen.
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        res.end(encodeWav(Buffer.alloc(12_000), 24_000, 1, 16));
        return;
      }
      if (req.url === '/audio/transcriptions') {
        state.transcriptions++;
        if (state.transcriptionFails) {
          res.writeHead(500);
          res.end('absichtlicher Testfehler');
          return;
        }
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

/** Leiser Ton (440 Hz): klingt für den Server wie eine Aufnahme mit Inhalt. */
const wav16k = (seconds = 0.5) => {
  const frames = Math.round(16_000 * seconds);
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) pcm.writeInt16LE(Math.round(2000 * Math.sin((2 * Math.PI * 440 * i) / 16_000)), i * 2);
  return encodeWav(pcm, 16_000, 1, 16);
};
/** Digitale Stille: Mikrofon aus oder Zugriff gesperrt. */
const silentWav16k = (seconds = 0.5) => encodeWav(Buffer.alloc(Math.round(16_000 * 2 * seconds)), 16_000, 1, 16);

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

  /** Die Zeitmessungs-Zeilen im Protokoll des Servers ab einer Position. Der Server schreibt sie erst nach der Antwort, daher wird kurz gewartet. */
  async function timingLinesSince(since: number, expected: number): Promise<string[]> {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const lines = output.slice(since).split('\n').map((line) => line.trim()).filter((line) => line.startsWith('Zeitmessung '));
      if (lines.length >= expected || Date.now() > deadline) return lines;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

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
      // Testfeld transcript (Text statt Aufnahme) ist im Betrieb nur mit diesem Schalter an.
      KUNIBERT_TEST_TRANSCRIPT: '1',
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

  it('Stumme Aufnahme: keine Spracherkennung, sofort "nicht verstanden"', async () => {
    const device = await registerDevice();
    const before = fake.state.transcriptions;
    const since = output.length;
    const res = await postQuestion(device, questionForm(silentWav16k()));
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(fake.state.transcriptions, before, 'Stille geht nicht an die Spracherkennung');
    const body = (await res.json()) as { audio_url: string };
    assert.equal((await fetchAudio(device, body.audio_url)).status, 200);
    const [line] = await timingLinesSince(since, 1);
    assert.match(line, / modus=frage status=200 erkennung_ms=- weiche_ms=- sprachmodell_ms=- /);
  });

  it('Stumme Aufnahme mit zusätzlichem Block vor den Daten (wie von ffmpeg) geht auch nicht an die Erkennung', async () => {
    // Fund im Probelauf vom 12.11.2026: Der Server las die Länge an der festen Stelle des
    // 44-Byte-Kopfs und hielt die Kopf-Bytes des LIST-Blocks für Ton.
    const device = await registerDevice();
    const plain = silentWav16k();
    const list = Buffer.from('LIST\x1a\x00\x00\x00INFOISFT\x0e\x00\x00\x00Lavf61.7.100\x00\x00', 'latin1');
    const wav = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
    wav.writeUInt32LE(wav.length - 8, 4);
    const before = fake.state.transcriptions;
    const res = await postQuestion(device, questionForm(wav));
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(fake.state.transcriptions, before, 'Stille geht nicht an die Spracherkennung');
    assert.equal((await fetchAudio(device, ((await res.json()) as { audio_url: string }).audio_url)).status, 200);
  });

  it('/v1/turn: Ausfall der Spracherkennung ist 503, keine kaputte Aufnahme (400)', async () => {
    const device = await registerDevice();
    fake.state.transcriptionFails = true;
    try {
      const res = await fetch(`${base}/v1/turn`, {
        method: 'POST',
        headers: deviceHeaders(device.id, device.token),
        body: questionForm(wav16k(), { mode: 'frage' }),
      });
      assert.equal(res.status, 503, await res.clone().text());
      assert.equal(((await res.json()) as { error: string }).error, 'voice_provider_failed');
    } finally {
      fake.state.transcriptionFails = false;
    }
    const broken = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: deviceHeaders(device.id, device.token),
      body: questionForm(Buffer.from('kein wav '.repeat(10)), { mode: 'frage' }),
    });
    assert.equal(broken.status, 400);
    assert.equal(((await broken.json()) as { error: string }).error, 'bad_audio');
  });

  it('Untertitel-Abspann aus der Erkennung (Whisper bei Rauschen) ergibt "nicht verstanden"', async () => {
    const device = await registerDevice();
    const original = fake.state.transcript;
    fake.state.transcript = 'Untertitel im Auftrag des ZDF, 2017';
    const spokenBefore = fake.state.speechInputs.length;
    try {
      const res = await postQuestion(device, questionForm(wav16k()));
      assert.equal(res.status, 200, await res.clone().text());
      await fetchAudio(device, ((await res.json()) as { audio_url: string }).audio_url);
    } finally {
      fake.state.transcript = original;
    }
    const spoken = fake.state.speechInputs.slice(spokenBefore);
    assert.ok(!spoken.some((text) => text.startsWith('Das ist eine gute Frage')), 'kein Ersatztext auf einen Abspann');
  });

  it('Fehlertext des Sprachservers mit dem Antworttext (Prüffehler 422) kommt nicht ins Protokoll', async () => {
    const device = await registerDevice();
    const since = output.length;
    fake.state.speechRejectsWithInput = true;
    try {
      const res = await postStory(device);
      assert.equal(res.status, 502, 'ein 4xx des Sprachservers ist nicht wiederholbar');
      assert.equal(((await res.json()) as { retryable: boolean }).retryable, false);
    } finally {
      fake.state.speechRejectsWithInput = false;
    }
    const newOutput = output.slice(since);
    for (const secret of ['Kunibert erwachte', 'Dachzimmer', 'Erzähltaste', device.id, device.token]) {
      assert.ok(!newOutput.includes(secret), `"${secret}" darf nicht im Protokoll stehen`);
    }
    assert.match(newOutput, /HTTP 422 \(string_too_long\)/, `Status und Code gehören ins Protokoll: ${newOutput}`);
  });

  // Vertrag mit der ESP32-Firmware (firmware/esp32-s3/main/kb_api.c): Sie baut den multipart-Body
  // von Hand und prüft die Antwort strenger als der Pi-Client. Ändert der Server eines dieser
  // Details, läuft die Firmware nicht mehr; dieser Test schlägt dann vorher an.
  it('Firmware-Format: von Hand gebauter multipart-Body wird angenommen, Antwort hat den WAV-Kopf, den die Firmware verlangt', async () => {
    const device = await registerDevice();
    const boundary = '----kunibert7f3a9c1e5b2d';
    const part = (name: string, value: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const head =
      part('locale', 'de-DE') +
      part('age_band', '6-10') +
      part('session_id', '0123456789abcdef0123456789abcdef') +
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="frage.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(head, 'utf8'), wav16k(), Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')]);

    const res = await fetch(`${base}/v1/device/question`, {
      method: 'POST',
      headers: {
        ...deviceHeaders(device.id, device.token),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    });
    assert.equal(res.status, 200, await res.clone().text());
    const turn = (await res.json()) as { audio_url: string; session_end: boolean };
    assert.equal(typeof turn.session_end, 'boolean');
    // Die Firmware lehnt eine audio_url mit anderem Ursprung als ihre API-Adresse ab.
    assert.equal(new URL(turn.audio_url).origin, new URL(PUBLIC_BASE_URL).origin);
    assert.ok(turn.audio_url.length < 256, 'audio_url passt in den Puffer der Firmware (KB_URL_MAX)');

    const audio = await fetchAudio(device, turn.audio_url);
    assert.equal(audio.status, 200);
    assert.ok((audio.headers.get('content-type') || '').toLowerCase().startsWith('audio/wav'));
    const wav = Buffer.from(await audio.arrayBuffer());
    // kb_wav_check_header: einfacher 44-Byte-Kopf, fmt-Block mit 16 Byte, PCM, mono, 16 Bit, 16 kHz, nicht leer.
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt32LE(16), 16);
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 16_000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.ok(wav.readUInt32LE(40) > 0);
    assert.equal(wav.readUInt32LE(40), wav.length - 44, 'Länge im Kopf passt zur Datei (die Firmware liest genau so viele Byte)');
  });

  it('Firmware-Format: Geschichte mit session_id im JSON wird angenommen', async () => {
    const device = await registerDevice();
    const res = await fetch(`${base}/v1/device/kunibert-story`, {
      method: 'POST',
      headers: { ...deviceHeaders(device.id, device.token), 'Content-Type': 'application/json' },
      body: '{"locale":"de-DE","age_band":"6-10","length":"short","session_id":"0123456789abcdef0123456789abcdef"}',
    });
    assert.equal(res.status, 200, await res.clone().text());
    const turn = (await res.json()) as { audio_url: string; session_end: boolean };
    assert.equal(new URL(turn.audio_url).origin, new URL(PUBLIC_BASE_URL).origin);
    assert.equal(turn.session_end, false);
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

    // 16 Bit, aber kein PCM (Formatkennung 3 = Gleitkomma): wird nicht als Ton gelesen.
    const notPcm = encodeWav(Buffer.alloc(8_000), 16_000, 1, 16);
    notPcm.writeUInt16LE(3, 20);
    const wrongFormat = await postQuestion(device, questionForm(notPcm));
    assert.equal(wrongFormat.status, 400);
    assert.equal(((await wrongFormat.json()) as { error: string }).error, 'unsupported_audio_format');
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

  it('Zeitmessung: je Anfrage eine Zeile mit allen Werten, aber ohne Texte, Geräte-ID oder Token', async () => {
    const device = await registerDevice();
    const original = fake.state.transcript;
    // Der Satz des Kindes wird seit dem 12.11.2026 nicht mehr nachgesprochen (fester Ersatztext ohne Zitat). Er darf auch nicht ins Protokoll.
    fake.state.transcript = 'Geheimwort-Quokka was ist das';
    const since = output.length;
    try {
      const question = await postQuestion(device, questionForm(wav16k(1.5)));
      assert.equal(question.status, 200, await question.clone().text());
    } finally {
      fake.state.transcript = original;
    }
    const story = await postStory(device);
    assert.equal(story.status, 200, await story.clone().text());
    assert.ok(
      fake.state.speechInputs.some((text) => text.startsWith('Das ist eine gute Frage')),
      'Vorbedingung: ohne Sprachmodell wird der feste Ersatztext gesprochen'
    );
    assert.ok(
      !fake.state.speechInputs.some((text) => text.includes('Quokka')),
      'der Satz des Kindes darf nicht nachgesprochen werden'
    );

    const lines = await timingLinesSince(since, 2);
    assert.equal(lines.length, 2, `Zeilen: ${lines.join(' | ')}\nProtokoll: ${output.slice(since)}`);
    const [questionLine, storyLine] = lines;

    // Frage über Spracherkennung: alle Stufen außer dem Sprachmodell (ohne Schlüssel greift der feste Text).
    assert.match(questionLine, /^Zeitmessung id=[0-9a-f]{8} modus=frage status=200 /);
    for (const key of ['erkennung_ms', 'weiche_ms', 'sprachausgabe_ms', 'gesamt_ms']) {
      assert.match(questionLine, new RegExp(` ${key}=\\d+ ?`), `${key} fehlt: ${questionLine}`);
    }
    assert.match(questionLine, / sprachmodell_ms=- ausgabecheck_ms=- /);
    assert.match(questionLine, / sprachmodell_aufrufe=0 audio_s=\d+\.\d$/);
    assert.ok(Number(/ audio_s=([\d.]+)$/.exec(questionLine)![1]) > 0, 'Audiolänge muss größer als 0 sein');

    // Erzähltaste: keine Erkennung, keine Weiche (es gibt keinen Kindertext).
    assert.match(storyLine, /^Zeitmessung id=[0-9a-f]{8} modus=weiter status=200 erkennung_ms=- weiche_ms=- /);
    assert.match(storyLine, / sprachausgabe_ms=\d+ gesamt_ms=\d+ /);
    assert.match(storyLine, / audio_s=\d+\.\d$/);
    assert.notEqual(questionLine.split(' ')[1], storyLine.split(' ')[1], 'jede Anfrage hat ihre eigene ID');

    // Keine Inhalte: weder Satz des Kindes noch gesprochener Text noch Geräte-ID oder Token irgendwo im neuen Protokoll.
    const newOutput = output.slice(since);
    for (const secret of ['Quokka', 'gute Frage', 'Dachzimmer', 'Kunibert erwachte', device.id, device.token]) {
      assert.ok(!newOutput.includes(secret), `"${secret}" darf nicht im Protokoll stehen`);
    }
  });

  it('Zeitmessung: Notlage ergibt eine Zeile, in der der Wortlaut fehlt', async () => {
    const device = await registerDevice();
    const since = output.length;
    const res = await postQuestion(device, questionForm(wav16k(), { transcript: 'ich will nicht mehr leben, sagt Geheimwort-Okapi' }));
    assert.equal(res.status, 200, await res.clone().text());
    const [line] = await timingLinesSince(since, 1);
    assert.ok(line, `keine Zeile im Protokoll: ${output.slice(since)}`);
    assert.match(line, / modus=frage status=200 erkennung_ms=- weiche_ms=\d+ sprachmodell_ms=- ausgabecheck_ms=- sprachausgabe_ms=\d+ /);
    const newOutput = output.slice(since);
    for (const secret of ['Okapi', 'nicht mehr leben', SAFETY_START, device.token]) {
      assert.ok(!newOutput.includes(secret), `"${secret}" darf nicht im Protokoll stehen`);
    }
  });

  it('Zeitmessung: abgewiesene Anfragen erzeugen keine Zeile, ein Ausfall der Sprachausgabe erscheint mit Status 503', async () => {
    const device = await registerDevice();
    const since = output.length;
    const unauthorized = await fetch(`${base}/v1/device/kunibert-story`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    const noAudio = await postQuestion(device, questionForm(null, { transcript: 'hallo' }));
    assert.equal(noAudio.status, 400);
    const badMode = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers: deviceHeaders(device.id, device.token),
      body: questionForm(null, { mode: 'unsinn' }),
    });
    assert.equal(badMode.status, 400);

    fake.state.speechFails = true;
    try {
      const failed = await postStory(device);
      assert.equal(failed.status, 503);
    } finally {
      fake.state.speechFails = false;
    }

    const lines = await timingLinesSince(since, 1);
    assert.equal(lines.length, 1, `nur die Anfrage mit Ausfall darf eine Zeile erzeugen: ${lines.join(' | ')}`);
    assert.match(lines[0], / modus=weiter status=503 /);
    assert.match(lines[0], / sprachausgabe_ms=\d+ /);
    assert.match(lines[0], / audio_s=-$/);
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

// Ohne KUNIBERT_TEST_TRANSCRIPT=1 überhört der Server im Betrieb das Testfeld transcript
// (Punkt 60 der Aufgabenliste, seit 12.11.2026). Eigener Server mit eigener Attrappe.
describe('picastAI-API im Betrieb ohne Testschalter', () => {
  let child: ChildProcess;
  let fake: { server: http.Server; state: FakeSpeechService; port: number };
  let base = '';
  let output = '';

  before(async () => {
    fake = await startFakeSpeechService();
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const env: Record<string, string> = {
      PATH: process.env.PATH || '',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_DEVICE_ID: ENV_DEVICE_ID,
      PICASTAI_DEVICE_TOKEN: ENV_DEVICE_TOKEN,
      PICASTAI_PUBLIC_BASE_URL: PUBLIC_BASE_URL,
      PICASTAI_STT_URL: `http://127.0.0.1:${fake.port}`,
      PICASTAI_STT_MODEL: 'test-stt',
      PICASTAI_TTS_URL: `http://127.0.0.1:${fake.port}`,
      PICASTAI_TTS_MODEL: 'test-tts',
      PICASTAI_TTS_VOICE: 'test-voice',
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
        if ((await fetch(`${base}/health`)).ok) break;
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

  it('das Feld transcript wird überhört: Es zählt, was die Spracherkennung aus der Aufnahme macht', async () => {
    const headers = { Authorization: `Bearer ${ENV_DEVICE_TOKEN}`, 'X-Device-ID': ENV_DEVICE_ID };
    const res = await fetch(`${base}/v1/device/question`, {
      method: 'POST',
      headers,
      body: questionForm(wav16k(), { transcript: 'ich will nicht mehr leben' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(fake.state.transcriptions, 1, 'die Aufnahme ging an die Spracherkennung');
    const audio = await fetch(base + new URL(((await res.json()) as { audio_url: string }).audio_url).pathname, { headers });
    assert.equal(audio.status, 200);
    // Der Sicherheitshinweis wird beim Start ohnehin vorbereitet (steht deshalb auch in den
    // Eingaben der Attrappe). Entscheidend: Gesprochen wurde die Antwort auf das, was die
    // Spracherkennung geliefert hat ("warum ist der himmel blau"), nicht auf den Testtext.
    assert.ok(
      fake.state.speechInputs.some((text) => text.startsWith('Der Himmel wirkt blau')),
      `gesprochen wurde: ${fake.state.speechInputs.join(' | ').slice(0, 300)}`
    );
    assert.ok(!output.includes('KUNIBERT_TEST_TRANSCRIPT'), 'ohne Schalter keine Startwarnung');
  });

  it('auch die alte Route /v1/turn nimmt im Betrieb keinen Text statt Aufnahme', async () => {
    // Im Heimnetz ohne Caddy (Pi im selben WLAN) ist /v1/turn erreichbar.
    const headers = { Authorization: `Bearer ${ENV_DEVICE_TOKEN}`, 'X-Device-ID': ENV_DEVICE_ID };
    const res = await fetch(`${base}/v1/turn`, {
      method: 'POST',
      headers,
      body: questionForm(null, { mode: 'frage', text: 'ich will nicht mehr leben' }),
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'audio_required');
  });
});
