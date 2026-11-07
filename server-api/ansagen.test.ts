// Tests für "npm run ansagen": Textliste, Dateinamen, Format, Fehlerfälle. Es gibt keine echte
// Sprachausgabe; eine Attrappe liefert kurze WAV-Dateien.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeWavHeader, encodeWav } from './audio.js';
import { ERWARTETE_DATEIEN, STANDARD_LISTE, erzeugeAnsagen, loadAnsagenListe, run } from './ansagen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Der Vertrag mit dem Pi (pi-client/rueckmeldung.py, ALL_ANNOUNCEMENT_FILES). Dieselbe Liste steht
// ausgeschrieben im Pi-Test. Ändert sich ein Name, müssen beide Tests und beide Seiten zusammen angepasst werden.
const VERTRAG = [
  'willkommen.wav',
  'zwischen-1.wav',
  'zwischen-2.wav',
  'zwischen-3.wav',
  'zwischen-4.wav',
  'zwischen-5.wav',
  'zwischen-6.wav',
  'zwischen-lang.wav',
];

// Die vorgegebenen Texte, wörtlich.
const TEXTE = [
  'Sei gegrüßt! Ich bin Ritter Kunibert. Ich bin ein Computer-Ritter, kein echter Mensch. Ich erzähle dir Geschichten und beantworte deine Fragen. Manchmal irre ich mich. Ich höre dir nur zu, solange du die Taste drückst. Dann leuchtet meine Lampe. Sag mir bitte nicht deinen Nachnamen und nicht, wo du wohnst. Das brauche ich nicht. Und wenn dir etwas Schlimmes passiert oder du Angst hast: Geh zu einem Erwachsenen, dem du vertraust. Ich bin nur ein Spielzeug und kann dir dann nicht richtig helfen.',
  'Ich höre dir zu. Einen Moment.',
  'Lass mich kurz nachdenken.',
  'Hmm, einen Augenblick.',
  'Ich überlege.',
  'Gleich bin ich so weit.',
  'Einen Moment bitte.',
  'Das dauert heute etwas länger.',
];

const kurzesWav = (rate = 16_000) => encodeWav(Buffer.alloc(Math.round(rate * 2 * 0.1)), rate, 1, 16);

function tempOrdner(): string {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'ansagen-test-'));
  process.on('exit', () => fs.rmSync(ordner, { recursive: true, force: true }));
  return ordner;
}

function aufnehmen() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, ausgabe: { log: (z: string) => out.push(z), error: (z: string) => err.push(z) } };
}

test('Die Liste im Repo enthält genau die Dateien, die der Pi erwartet, in dieser Reihenfolge', () => {
  assert.deepEqual([...ERWARTETE_DATEIEN], VERTRAG);
  assert.deepEqual(loadAnsagenListe(STANDARD_LISTE).map((eintrag) => eintrag.datei), VERTRAG);
});

test('Die Texte der Liste sind wörtlich die vorgegebenen', () => {
  assert.deepEqual(loadAnsagenListe(STANDARD_LISTE).map((eintrag) => eintrag.text), TEXTE);
});

test('Die Vorstellung sagt, dass Kunibert eine KI ist, und die Zwischensätze sind neutral', () => {
  const liste = loadAnsagenListe(STANDARD_LISTE);
  assert.match(liste[0].text, /Computer-Ritter, kein echter Mensch/);
  for (const { datei, text } of liste.slice(1)) {
    assert.ok(text.length < 60, `${datei} ist zu lang für einen Zwischensatz`);
    assert.doesNotMatch(text, /Notfall|Erwachsene|Polizei|Hilfe/i, `${datei} darf nichts Bedrohliches andeuten`);
  }
});

test('erzeugeAnsagen schreibt je Eintrag eine 16-kHz-Mono-WAV, ruft die Sprachausgabe mit dem Text auf und legt den Ordner an', async () => {
  const ziel = path.join(tempOrdner(), 'tief', 'ansagen');
  const gesprochen: string[] = [];
  const zeilen: string[] = [];
  const dateien = await erzeugeAnsagen({
    liste: loadAnsagenListe(STANDARD_LISTE),
    zielordner: ziel,
    synthesize: async (text) => {
      gesprochen.push(text);
      return kurzesWav();
    },
    log: (zeile) => zeilen.push(zeile),
  });
  assert.deepEqual(dateien, VERTRAG);
  assert.deepEqual(gesprochen, TEXTE);
  assert.deepEqual(fs.readdirSync(ziel).sort(), [...VERTRAG].sort(), 'keine übrig gebliebenen .tmp-Dateien');
  for (const datei of VERTRAG) {
    const kopf = decodeWavHeader(fs.readFileSync(path.join(ziel, datei)));
    assert.deepEqual([kopf.sampleRate, kopf.channels, kopf.bitsPerSample], [16_000, 1, 16], datei);
  }
  assert.equal(zeilen.length, VERTRAG.length);
});

test('bestehende Dateien werden überschrieben (Stimme gewechselt)', async () => {
  const ziel = tempOrdner();
  fs.writeFileSync(path.join(ziel, 'willkommen.wav'), 'alt');
  await erzeugeAnsagen({ liste: loadAnsagenListe(STANDARD_LISTE), zielordner: ziel, synthesize: async () => kurzesWav() });
  assert.equal(decodeWavHeader(fs.readFileSync(path.join(ziel, 'willkommen.wav'))).sampleRate, 16_000);
});

test('Fällt die Sprachausgabe mittendrin aus, wird nichts geschrieben, und die Meldung nennt die Datei, nicht den Text', async () => {
  const ziel = path.join(tempOrdner(), 'neu');
  let aufrufe = 0;
  await assert.rejects(
    erzeugeAnsagen({
      liste: loadAnsagenListe(STANDARD_LISTE),
      zielordner: ziel,
      synthesize: async (text) => {
        if (++aufrufe === 3) throw new Error(`Dienst antwortete mit HTTP 503 zu "${text}"`);
        return kurzesWav();
      },
    }),
    (fehler: Error) => {
      assert.match(fehler.message, /zwischen-2\.wav/);
      assert.match(fehler.message, /nichts geschrieben/);
      assert.ok(!fehler.message.includes('Lass mich kurz nachdenken'), 'der Text steht nicht in der Meldung');
      return true;
    }
  );
  assert.equal(fs.existsSync(ziel), false, 'der Zielordner wird erst nach dem letzten Erfolg angelegt');
});

test('Falsches Format (24 kHz) wird abgelehnt, mit Hinweis auf die Einstellung, und nichts geschrieben', async () => {
  const ziel = path.join(tempOrdner(), 'neu');
  await assert.rejects(
    erzeugeAnsagen({ liste: loadAnsagenListe(STANDARD_LISTE), zielordner: ziel, synthesize: async () => kurzesWav(24_000) }),
    /willkommen\.wav.*24000 Hz.*KUNIBERT_AUDIO_SAMPLE_RATE/
  );
  assert.equal(fs.existsSync(ziel), false);
  await assert.rejects(
    erzeugeAnsagen({ liste: loadAnsagenListe(STANDARD_LISTE), zielordner: ziel, synthesize: async () => Buffer.from('keine WAV') }),
    /keine gültige WAV-Datei/
  );
});

test('Eine unvollständige, doppelte oder fremde Textliste wird abgelehnt', () => {
  const ordner = tempOrdner();
  const gueltig = loadAnsagenListe(STANDARD_LISTE);
  const schreibe = (name: string, ansagen: unknown) => {
    const datei = path.join(ordner, name);
    fs.writeFileSync(datei, JSON.stringify({ ansagen }));
    return datei;
  };
  assert.throws(() => loadAnsagenListe(schreibe('fehlt.json', gueltig.slice(1))), /fehlen: willkommen\.wav/);
  assert.throws(() => loadAnsagenListe(schreibe('doppelt.json', [...gueltig, gueltig[0]])), /mehrfach/);
  assert.throws(() => loadAnsagenListe(schreibe('fremd.json', [...gueltig, { datei: 'extra.wav', text: 'Hallo' }])), /Unbekannte Dateien.*extra\.wav/);
  assert.throws(() => loadAnsagenListe(schreibe('leer.json', gueltig.map((e, i) => (i === 2 ? { ...e, text: '  ' } : e)))), /zwischen-2\.wav ist leer/);
  assert.throws(() => loadAnsagenListe(path.join(ordner, 'gibt-es-nicht.json')), /nicht lesbar/);
  fs.writeFileSync(path.join(ordner, 'kaputt.json'), '{kaputt');
  assert.throws(() => loadAnsagenListe(path.join(ordner, 'kaputt.json')), /nicht lesbar/);
});

test('run: erfolgreicher Lauf gibt 0 zurück, nennt Dateinamen und Längen, aber keine Sprechtexte', async () => {
  const ziel = tempOrdner();
  const { out, err, ausgabe } = aufnehmen();
  const code = await run([ziel], ausgabe, () => ({ synthesize: async () => kurzesWav() }));
  assert.equal(code, 0, err.join('\n'));
  const alles = out.join('\n');
  for (const datei of VERTRAG) assert.ok(alles.includes(datei), datei);
  for (const text of TEXTE) assert.ok(!alles.includes(text.slice(0, 20)), 'die Ausgabe enthält einen Sprechtext');
  assert.deepEqual(fs.readdirSync(ziel).sort(), [...VERTRAG].sort());
});

test('run: ohne Zielordner gibt es einen Hinweis und den Rückgabewert 1', async () => {
  const { err, ausgabe } = aufnehmen();
  assert.equal(await run([], ausgabe, () => ({ synthesize: async () => kurzesWav() })), 1);
  assert.match(err.join('\n'), /genau einen Zielordner/);
  assert.match(err.join('\n'), /npm run ansagen/);
});

test('run: --help gibt die Hilfe aus', async () => {
  const { out, ausgabe } = aufnehmen();
  assert.equal(await run(['--help'], ausgabe), 0);
  assert.match(out.join('\n'), /npm run ansagen/);
});

test('run: ohne konfigurierte Sprachausgabe gibt es eine verständliche Meldung und nichts wird geschrieben', async () => {
  const ziel = path.join(tempOrdner(), 'neu');
  const { err, ausgabe } = aufnehmen();
  const code = await run([ziel], ausgabe, () => ({ fehler: 'Die Sprachausgabe ist nicht konfiguriert, deshalb ...' }));
  assert.equal(code, 1);
  assert.match(err.join('\n'), /Sprachausgabe ist nicht konfiguriert/);
  assert.equal(fs.existsSync(ziel), false);
});

test('Der echte Befehl ohne Sprachausgabe: Rückgabewert 1, klare Meldung, kein Absturz mit Stapelausgabe', () => {
  const ziel = path.join(tempOrdner(), 'neu');
  const env: Record<string, string> = { PATH: process.env.PATH || '' };
  for (const name of ['HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT']) {
    if (process.env[name]) env[name] = process.env[name] as string;
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'server-api/ansagen.ts', ziel], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Sprachausgabe ist nicht konfiguriert/);
  assert.match(result.stderr, /PICASTAI_TTS_/);
  assert.doesNotMatch(result.stderr, /\n\s+at /, 'keine Stapelausgabe');
  assert.equal(fs.existsSync(ziel), false);
});
