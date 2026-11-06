import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { decodeWavHeader, encodeWav } from './audio.js';
import { loadConfig, type KunibertConfig } from './config.js';
import { SAMPLE_STORY, parseSprachprobeArgs, runSprachprobe } from './sprachprobe.js';

test('parseSprachprobeArgs: Standard ist die Beispielgeschichte und hoerprobe.wav', () => {
  assert.deepEqual(parseSprachprobeArgs([]), { output: 'hoerprobe.wav', text: SAMPLE_STORY });
  assert.deepEqual(parseSprachprobeArgs(['probe.wav']), { output: 'probe.wav', text: SAMPLE_STORY });
});

test('parseSprachprobeArgs: eigener Text und Textdatei', () => {
  assert.equal(parseSprachprobeArgs(['--text', 'Hallo zusammen.']).text, 'Hallo zusammen.');
  assert.equal(parseSprachprobeArgs(['a.wav', '--datei', 'geschichte.txt'], (file) => `Inhalt von ${file}`).text, 'Inhalt von geschichte.txt');
});

test('parseSprachprobeArgs: falsche Eingaben ergeben verständliche Fehler', () => {
  assert.throws(() => parseSprachprobeArgs(['--text']), /braucht einen Wert/);
  assert.throws(() => parseSprachprobeArgs(['--unbekannt']), /Unbekannte Option/);
  assert.throws(() => parseSprachprobeArgs(['a.wav', 'b.wav']), /Nur eine Ausgabedatei/);
  assert.throws(() => parseSprachprobeArgs(['probe.mp3']), /\.wav/);
  assert.throws(() => parseSprachprobeArgs(['--text', '   ']), /leer/);
});

const POCKET: Partial<KunibertConfig> = {
  ttsProvider: 'pocket',
  pocketTtsUrl: 'http://127.0.0.1:8003',
  pocketTtsVoice: 'juergen',
  pocketTtsTempo: '1',
  pocketTtsPauseMs: '',
};

async function withPocketFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array(encodeWav(Buffer.alloc(4800, 1), 24_000, 1, 16)), { status: 200 })) as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('runSprachprobe: schreibt eine WAV-Datei mit 16 kHz Mono und meldet Dauer und Pfad', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprachprobe-'));
  try {
    const output = path.join(dir, 'unterordner', 'probe.wav');
    const messages: string[] = [];
    const code = await withPocketFetch(() => runSprachprobe([output], { ...loadConfig(), ...POCKET }, (message) => messages.push(message)));
    assert.equal(code, 0);
    const wav = fs.readFileSync(output);
    const header = decodeWavHeader(wav);
    assert.equal(header.sampleRate, 16_000);
    assert.equal(header.channels, 1);
    assert.ok(messages.some((message) => message.includes('Fertig')));
    assert.ok(messages.some((message) => /Dauer der Aufnahme/.test(message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runSprachprobe: ohne konfigurierte Sprachausgabe oder bei einem Fehler Rückgabewert 1, bei falschem Aufruf 2', async () => {
  const messages: string[] = [];
  const log = (message: string): void => { messages.push(message); };
  assert.equal(await runSprachprobe(['x.wav'], { ...loadConfig(), ...POCKET, pocketTtsUrl: null }, log), 1);
  assert.ok(messages.some((message) => /nicht konfiguriert/.test(message)));

  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('kaputt', { status: 503 })) as unknown as typeof fetch;
  try {
    assert.equal(await runSprachprobe(['x.wav'], { ...loadConfig(), ...POCKET }, log), 1);
    assert.ok(messages.some((message) => /fehlgeschlagen/.test(message)));
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(await runSprachprobe(['x.mp3'], { ...loadConfig(), ...POCKET }, log), 2);
  assert.equal(fs.existsSync('x.wav'), false);
});
