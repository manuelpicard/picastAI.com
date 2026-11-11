// Trockenlauf gegen einen lokal laufenden Server: /health, /v1/device/question, /v1/device/audio/:turn_id.
// Erwartet Umgebungsvariablen: BASE_URL, DEVICE_ID, DEVICE_TOKEN, SPEACHES_URL, TTS_MODEL, TTS_VOICE.
// Es werden keine Schlüssel gebraucht. Die Test-Frage ("Warum ist der Himmel blau?") wird mit Piper erzeugt.
import { writeFileSync } from 'node:fs';

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`Umgebungsvariable ${n} fehlt`);
    process.exit(2);
  }
  return v;
};
const base = need('BASE_URL').replace(/\/$/, '');
const deviceId = need('DEVICE_ID');
const token = need('DEVICE_TOKEN');
const speaches = need('SPEACHES_URL').replace(/\/$/, '');
const auth = { Authorization: `Bearer ${token}`, 'X-Device-ID': deviceId };

/** Mono, 16 Bit, 16 kHz aus einer WAV-Datei (16 Bit PCM, beliebige Rate), lineare Umrechnung. */
function toMono16k(wav) {
  const channels = wav.readUInt16LE(22);
  const rate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  if (bits !== 16) throw new Error(`Test-WAV: ${bits} Bit nicht unterstützt`);
  let off = 12;
  let dataStart = -1;
  let dataLen = 0;
  while (off + 8 <= wav.length) {
    const id = wav.toString('ascii', off, off + 4);
    const len = wav.readUInt32LE(off + 4);
    if (id === 'data') {
      dataStart = off + 8;
      dataLen = Math.min(len, wav.length - dataStart);
      break;
    }
    off += 8 + len + (len % 2);
  }
  if (dataStart < 0) throw new Error('Test-WAV ohne data-Block');
  const frames = Math.floor(dataLen / 2 / channels);
  const mono = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += wav.readInt16LE(dataStart + (i * channels + c) * 2);
    mono[i] = s / channels;
  }
  const outFrames = Math.floor((frames * 16000) / rate);
  const out = Buffer.alloc(44 + outFrames * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + outFrames * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(16000, 24);
  out.writeUInt32LE(32000, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(outFrames * 2, 40);
  for (let i = 0; i < outFrames; i++) {
    const pos = (i * rate) / 16000;
    const a = Math.floor(pos);
    const f = pos - a;
    const v = mono[a] * (1 - f) + (mono[Math.min(a + 1, frames - 1)] ?? 0) * f;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 44 + i * 2);
  }
  return out;
}

const ms = (t0) => Math.round(performance.now() - t0);
let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${text}`);
  if (!ok) failed++;
};

// 0. Test-WAV: gesprochene Frage von Piper, auf mono / 16 Bit / 16 kHz gebracht.
const tts = await fetch(`${speaches}/v1/audio/speech`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: need('TTS_MODEL'),
    voice: need('TTS_VOICE'),
    input: 'Warum ist der Himmel blau?',
    response_format: 'wav',
  }),
});
check(tts.ok, `Test-WAV von Piper erzeugt (HTTP ${tts.status})`);
if (!tts.ok) process.exit(1);
const testWav = toMono16k(Buffer.from(await tts.arrayBuffer()));
writeFileSync(process.env.TEST_WAV_OUT || 'test-frage.wav', testWav);
console.log(`       Test-WAV: ${(testWav.length - 44) / 32000} s, ${testWav.length} Bytes, mono 16 Bit 16 kHz`);

// 1. GET /health
let t0 = performance.now();
const health = await fetch(`${base}/health`);
const hb = await health.json().catch(() => ({}));
check(health.status === 200 && hb.status === 'ok', `GET /health -> ${health.status} ${JSON.stringify(hb)} (${ms(t0)} ms)`);

// 2. POST /v1/device/question
const form = new FormData();
form.append('audio', new Blob([testWav], { type: 'audio/wav' }), 'frage.wav');
form.append('locale', 'de-DE');
form.append('age_band', '6-10');
form.append('session_id', 'trockenlauf');
t0 = performance.now();
const q = await fetch(`${base}/v1/device/question`, { method: 'POST', headers: auth, body: form });
const qMs = ms(t0);
const qb = await q.json().catch(() => ({}));
check(
  q.status === 200 && qb.type === 'answer' && typeof qb.audio_url === 'string',
  `POST /v1/device/question -> ${q.status} type=${qb.type} session_end=${qb.session_end} (${qMs} ms)`
);
if (q.status !== 200) {
  console.log('       Antwort:', JSON.stringify(qb));
  process.exit(1);
}
console.log(`       audio_url: ${qb.audio_url}`);

// 3. GET /v1/device/audio/:turn_id (der zweite Abruf muss 404 sein: Audio ist einmalig)
const audioPath = qb.audio_url.replace(/^https?:\/\/[^/]+/, '');
t0 = performance.now();
const a = await fetch(`${base}${audioPath}`, { headers: auth });
const aMs = ms(t0);
const audio = Buffer.from(await a.arrayBuffer());
check(
  a.status === 200 && a.headers.get('content-type') === 'audio/wav' && audio.toString('ascii', 0, 4) === 'RIFF',
  `GET /v1/device/audio/:turn_id -> ${a.status} ${a.headers.get('content-type')} ${audio.length} Bytes (${aMs} ms)`
);
if (a.status === 200) writeFileSync(process.env.ANSWER_WAV_OUT || 'antwort.wav', audio);
const a2 = await fetch(`${base}${audioPath}`, { headers: auth });
check(a2.status === 404, `zweiter Abruf derselben Audio-URL -> ${a2.status} (erwartet 404)`);

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
