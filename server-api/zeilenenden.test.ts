// Zeilenenden (Punkt N1123-1937-b): Dateien, die auf dem Pi oder dem Server laufen oder dort gelesen
// werden, haben im Repo und im Arbeitsordner LF. Die Regeln stehen in .gitattributes. Mit
// Windows-Zeilenenden (CRLF) bricht bash ab ("$'\r': command not found"), und die Eltern-Seite hätte
// ohne die Umwandlung in server-api/eltern-seite.ts falsche CSP-Hashes.
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

// Eine Kopie ohne eigenes .git (zum Beispiel ein ZIP, auch in einem anderen Git-Ordner) hat nichts
// zu prüfen. In der CI muss Git da sein.
function imGitOrdner(): boolean {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return false;
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

// Pfad -> Wert eines Attributs ("lf", "set", "auto", "unspecified" …). Die Pfade müssen nicht existieren.
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
// Bei text=auto erkennt Git Binärdateien ("-text") selbst und lässt sie unverändert.
function crlfBefunde(g: Git): { lfDateien: number; befunde: string[] } {
  let lfDateien = 0;
  const befunde: string[] = [];
  const passt = (wert: string) => wert === 'lf' || wert === 'none' || wert === '';
  for (const eintrag of g(['ls-files', '--eol', '-z']).split('\0').filter(Boolean)) {
    const tab = eintrag.indexOf('\t');
    const info = eintrag.slice(0, tab);
    const pfad = eintrag.slice(tab + 1);
    const regeln = (/(?:^|\s)attr\/(.*)$/.exec(info)?.[1] ?? '').trim().split(/\s+/);
    if (!regeln.includes('eol=lf') || regeln.includes('-text')) continue;
    const index = /(?:^|\s)i\/(\S*)/.exec(info)?.[1] ?? '';
    const arbeit = /(?:^|\s)w\/(\S*)/.exec(info)?.[1] ?? '';
    const binaer = index === '-text' || arbeit === '-text';
    if (binaer && regeln.includes('text=auto')) continue;
    lfDateien += 1;
    if (binaer) {
      befunde.push(`${pfad} (Binärdatei mit Text-Regel)`);
      continue;
    }
    if (!passt(index)) befunde.push(`${pfad} (Index: ${index})`);
    if (!passt(arbeit)) befunde.push(`${pfad} (Arbeitsordner: ${arbeit})`);
  }
  return { lfDateien, befunde };
}

// Unsicher für Binärdateien: "text" gesetzt, oder "eol" ohne "text". Dann ändert Git Bytes.
// Sicher: keine Regel, "text=auto" (Git erkennt Binärdateien), "-text" oder "binary".
function unsichereBinaerRegeln(g: Git, pfade: string[]): string[] {
  const text = attribut(g, 'text', pfade);
  const eol = attribut(g, 'eol', pfade);
  return pfade.filter((p) => {
    const t = text.get(p);
    const e = eol.get(p);
    return t === undefined || e === undefined || t === 'set' || (t === 'unspecified' && e !== 'unspecified');
  });
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

test('Binärdateien bekommen keine Regel, die Bytes ändert', { skip }, () => {
  const pfade = ['hoerproben/neu.mp3', 'neu.wav', 'docs/neu.png', 'neu.pdf'];
  assert.deepEqual(unsichereBinaerRegeln(git, pfade), [], 'Regel in .gitattributes trifft Binärdateien');
});

test('Gegenprobe: CRLF, Binärdatei mit Text-Regel und Skript ohne Regel fallen auf', { skip }, () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-zeilenenden-'));
  const repo = path.join(ordner, 'repo');
  const home = path.join(ordner, 'home');
  fs.mkdirSync(repo);
  fs.mkdirSync(home);
  // Ohne GIT_DIR und Co. aus der Umgebung (sonst träfe Git womöglich das echte Repo) und ohne
  // globale Einstellungen oder Attribute des Rechners.
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const g = gitIn(repo, env);
  const schreibe = (name: string, inhalt: string) => fs.writeFileSync(path.join(repo, name), inhalt);
  try {
    g(['init', '-q']);
    g(['config', 'core.autocrlf', 'false']);
    const regeln = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
    schreibe('.gitattributes', `${regeln}\n*.bin text=auto eol=lf\n*.dat eol=lf\n*.raw text\n`);
    schreibe('gut.sh', '#!/bin/sh\necho gut\n');
    schreibe('arbeitsordner.sh', '#!/bin/sh\necho arbeitsordner\n');
    schreibe('ohne-endung', '#!/bin/sh\necho ohne\n');
    schreibe('binaer.sh', '\0\x01\r\n\0');
    schreibe('bild.bin', '\0\x01\r\n\0');
    g(['add', '.gitattributes', 'gut.sh', 'arbeitsordner.sh', 'ohne-endung', 'binaer.sh', 'bild.bin']);
    // So stünde die Datei im Index, wenn ein Windows-Klon mit core.autocrlf=false sie ohne
    // .gitattributes committet hätte.
    schreibe('index.sh', '#!/bin/sh\r\necho index\r\n');
    const blob = g(['hash-object', '-w', '--no-filters', 'index.sh']).trim();
    g(['update-index', '--add', '--cacheinfo', `100644,${blob},index.sh`]);
    // Nach dem Kopieren von einem alten Windows-Klon: im Index LF, im Arbeitsordner CRLF.
    schreibe('arbeitsordner.sh', '#!/bin/sh\r\necho arbeitsordner\r\n');

    const { lfDateien, befunde } = crlfBefunde(g);
    assert.equal(lfDateien, 4);
    assert.deepEqual(befunde.sort(), [
      'arbeitsordner.sh (Arbeitsordner: crlf)',
      'binaer.sh (Binärdatei mit Text-Regel)',
      'index.sh (Arbeitsordner: crlf)',
      'index.sh (Index: crlf)',
    ]);
    assert.deepEqual(skripteOhneRegel(g, repo), ['ohne-endung']);
    assert.deepEqual(unsichereBinaerRegeln(g, ['a.bin', 'a.dat', 'a.raw', 'a.mp3']), ['a.dat', 'a.raw']);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});
