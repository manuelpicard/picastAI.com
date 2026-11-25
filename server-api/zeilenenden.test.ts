// Zeilenenden (Punkt N1123-1937-b): Dateien, die auf dem Pi oder dem Server laufen oder dort gelesen
// werden, haben im Repo und im Arbeitsordner LF. Die Regeln stehen in .gitattributes. Mit
// Windows-Zeilenenden (CRLF) bricht bash ab ("$'\r': command not found"), systemd nimmt "\r" in
// einen Wert auf, und die CSP-Hashes der Eltern-Seite passen nicht mehr.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Git = (args: string[], input?: string) => string;

function gitIn(cwd: string, env: NodeJS.ProcessEnv = process.env): Git {
  return (args, input) => {
    const r = spawnSync('git', args, { cwd, env, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${args[0]} endete mit ${r.status}: ${(r.stderr ?? '').trim()}`);
    return r.stdout;
  };
}

const git = gitIn(ROOT);

// Eine Kopie ohne .git (zum Beispiel ein ZIP) hat nichts zu prüfen. In der CI muss Git da sein.
function imGitOrdner(): boolean {
  try {
    return git(['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}
const skip = imGitOrdner() || process.env.CI ? false : 'kein Git-Ordner';

function verfolgteDateien(g: Git): string[] {
  return g(['ls-files', '-z']).split('\0').filter(Boolean);
}

// Pfad -> Wert eines Attributs ("lf", "set", "unspecified" …). Die Pfade müssen nicht existieren.
function attribut(g: Git, name: string, pfade: string[]): Map<string, string> {
  const teile = g(['check-attr', '-z', '--stdin', name], pfade.map((p) => `${p}\0`).join('')).split('\0');
  const werte = new Map<string, string>();
  for (let i = 0; i + 2 < teile.length; i += 3) werte.set(teile[i], teile[i + 2]);
  return werte;
}

function beginntMitShebang(datei: string): boolean {
  try {
    const fd = fs.openSync(datei, 'r');
    try {
      const b = Buffer.alloc(2);
      return fs.readSync(fd, b, 0, 2, 0) === 2 && b.toString('latin1') === '#!';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

// Verfolgte Dateien mit "#!" in der ersten Zeile, für die .gitattributes kein eol=lf setzt.
function skripteOhneRegel(g: Git, cwd: string): string[] {
  const skripte = verfolgteDateien(g).filter((d) => beginntMitShebang(path.join(cwd, d)));
  const eol = attribut(g, 'eol', skripte);
  return skripte.filter((d) => eol.get(d) !== 'lf');
}

// Dateien mit eol=lf, die im Index (i/) oder im Arbeitsordner (w/) etwas anderes als LF haben.
// "none" heißt: kein Zeilenende in der Datei; leer heißt: Datei fehlt im Arbeitsordner.
function crlfBefunde(g: Git): { lfDateien: number; befunde: string[] } {
  let lfDateien = 0;
  const befunde: string[] = [];
  const passt = (wert: string) => wert === 'lf' || wert === 'none' || wert === '';
  for (const eintrag of g(['ls-files', '--eol', '-z']).split('\0').filter(Boolean)) {
    const tab = eintrag.indexOf('\t');
    const info = eintrag.slice(0, tab);
    const pfad = eintrag.slice(tab + 1);
    if (!/\beol=lf\b/.test(info)) continue;
    lfDateien += 1;
    const index = /(?:^|\s)i\/(\S*)/.exec(info)?.[1] ?? '';
    const arbeit = /(?:^|\s)w\/(\S*)/.exec(info)?.[1] ?? '';
    if (!passt(index)) befunde.push(`${pfad} (Index: ${index})`);
    if (!passt(arbeit)) befunde.push(`${pfad} (Arbeitsordner: ${arbeit})`);
  }
  return { lfDateien, befunde };
}

// Diese Dateien laufen auf Pi oder Server oder werden dort gelesen.
const PFLICHT = [
  'pi-client/install_raspberry_pi.sh',
  'pi-client/kunibert_client.py',
  'pi-client/test_alsa_audio.sh',
  'deploy/setup-server.sh',
  'deploy/smoke-test.sh',
  'deploy/kunibert-server.service',
  'deploy/kunibert.env.example',
  '.env.example',
  'deploy/Caddyfile',
  'deploy/eltern-einwilligung.mjs',
  'server-api/eltern-seite.html',
  'demo/bin/aplay',
];
// Gibt es noch nicht; neue Dateien dieser Art bekommen dieselbe Regel.
const NEU = [
  'pi-client/neu.sh',
  'pi-client/neu.py',
  'pi-client/kunibert-neu.service',
  'deploy/neu.env.example',
  'deploy/neu/Caddyfile',
  'server-api/neu.html',
];

test('Dateien für Pi und Server haben in .gitattributes die Regel eol=lf', { skip }, () => {
  const verfolgt = new Set(verfolgteDateien(git));
  for (const datei of PFLICHT) assert.ok(verfolgt.has(datei), `${datei} fehlt im Repo: Liste im Test anpassen`);
  const eol = attribut(git, 'eol', [...PFLICHT, ...NEU]);
  const ohne = [...PFLICHT, ...NEU].filter((d) => eol.get(d) !== 'lf');
  assert.deepEqual(ohne, [], 'ohne eol=lf: Regel in .gitattributes ergänzen');
});

test('jede Datei mit "#!" in der ersten Zeile hat die Regel eol=lf', { skip }, () => {
  assert.deepEqual(skripteOhneRegel(git, ROOT), [], 'Skript ohne eol=lf: Regel in .gitattributes ergänzen');
});

test('Dateien mit eol=lf haben im Index und im Arbeitsordner LF', { skip }, () => {
  const { lfDateien, befunde } = crlfBefunde(git);
  assert.ok(lfDateien >= PFLICHT.length, `nur ${lfDateien} Dateien mit eol=lf gefunden`);
  assert.deepEqual(
    befunde,
    [],
    'Windows-Zeilenenden. Arbeitsordner: Datei löschen und mit "git checkout -- <Datei>" neu holen ' +
      '(oder neu klonen). Index: "git add --renormalize <Datei>" und committen.',
  );
});

test('Binärdateien bekommen keine Text-Regel', { skip }, () => {
  const text = attribut(git, 'text', ['hoerproben/neu.mp3', 'neu.wav', 'docs/neu.png', 'neu.pdf']);
  for (const [datei, wert] of text) assert.notEqual(wert, 'set', `${datei}: text wäre gesetzt`);
});

test('Gegenprobe: CRLF im Index, CRLF im Arbeitsordner und Skript ohne Regel fallen auf', { skip }, () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-zeilenenden-'));
  // Ohne GIT_DIR und Co. aus der Umgebung, sonst träfe Git womöglich das echte Repo.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const g = gitIn(ordner, env);
  const schreibe = (name: string, inhalt: string) => fs.writeFileSync(path.join(ordner, name), inhalt);
  try {
    g(['init', '-q']);
    g(['config', 'core.autocrlf', 'false']);
    fs.copyFileSync(path.join(ROOT, '.gitattributes'), path.join(ordner, '.gitattributes'));
    schreibe('gut.sh', '#!/bin/sh\necho gut\n');
    schreibe('arbeitsordner.sh', '#!/bin/sh\necho arbeitsordner\n');
    schreibe('ohne-endung', '#!/bin/sh\necho ohne\n');
    g(['add', '.gitattributes', 'gut.sh', 'arbeitsordner.sh', 'ohne-endung']);
    // So stünde die Datei im Index, wenn ein Windows-Klon sie ohne .gitattributes committet hätte.
    schreibe('index.sh', '#!/bin/sh\r\necho index\r\n');
    const blob = g(['hash-object', '-w', '--no-filters', 'index.sh']).trim();
    g(['update-index', '--add', '--cacheinfo', `100644,${blob},index.sh`]);
    // Nach dem Kopieren von einem Windows-Rechner: im Index LF, im Arbeitsordner CRLF.
    schreibe('arbeitsordner.sh', '#!/bin/sh\r\necho arbeitsordner\r\n');

    const { lfDateien, befunde } = crlfBefunde(g);
    assert.equal(lfDateien, 3);
    assert.deepEqual(befunde.sort(), [
      'arbeitsordner.sh (Arbeitsordner: crlf)',
      'index.sh (Arbeitsordner: crlf)',
      'index.sh (Index: crlf)',
    ]);
    assert.deepEqual(skripteOhneRegel(g, ordner), ['ohne-endung']);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});
