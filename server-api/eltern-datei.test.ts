// Einheitstests für die dauerhafte Eltern-Steuerung (Punkt E2): Pseudonyme, Datei, Neustart,
// Widerruf, Löschen, kaputte Datei und Speicherfehler. Alle Schlüssel und Kennungen sind erfunden.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ParentStateFile,
  ParentStateFileError,
  isValidParentKey,
  parseParentStateFile,
  pseudonymFor,
} from './eltern-datei.js';
import { ELTERNTEXT_VERSION, MAX_PARENT_TOKENS_PER_DEVICE, ParentControls, ParentStateWriteError, hashToken } from './eltern.js';

const KEY = 'test-schluessel-eltern-0123456789abcdef0123456789';
const OTHER_KEY = 'anderer-schluessel-eltern-9876543210fedcba98765';

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kunibert-eltern-'));
  return path.join(dir, 'eltern.json');
}

function clock(start = Date.UTC(2026, 10, 23, 6, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

/** Fängt console.warn ab (für Prüfungen, dass Meldungen keine Kennungen enthalten). */
function captureWarnings<T>(fn: () => T): { result: T | undefined; error: unknown; warnings: string[] } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    return { result: fn(), error: null, warnings };
  } catch (error) {
    return { result: undefined, error, warnings };
  } finally {
    console.warn = original;
  }
}

test('Schlüssel: mindestens 32 Zeichen, ohne Leer- und Steuerzeichen', () => {
  assert.ok(isValidParentKey(KEY));
  assert.ok(isValidParentKey(crypto.randomBytes(32).toString('hex')));
  for (const bad of ['', 'kurz', 'a'.repeat(31), `${'a'.repeat(32)} b`, `${'a'.repeat(32)}\n`, `${'ä'.repeat(40)}`, null, undefined]) {
    assert.ok(!isValidParentKey(bad as string), String(bad));
  }
  assert.throws(() => new ParentStateFile(tempFile(), 'zu-kurz'));
});

test('Pseudonym: HMAC mit dem Schlüssel, je Gerät verschieden, kein einfacher Hash der Geräte-ID', () => {
  const p = pseudonymFor(KEY, 'prototype-001');
  assert.match(p, /^[0-9a-f]{64}$/);
  assert.equal(pseudonymFor(KEY, 'prototype-001'), p, 'gleich bei gleichem Schlüssel (übersteht den Neustart)');
  assert.notEqual(pseudonymFor(KEY, 'prototype-002'), p);
  assert.notEqual(pseudonymFor(OTHER_KEY, 'prototype-001'), p, 'anderer Schlüssel, anderes Pseudonym');
  assert.notEqual(crypto.createHash('sha256').update('prototype-001').digest('hex'), p);
});

test('Neustart: Einwilligung, Weg, Version, Schlafmodus, Ruhezeiten und Eltern-Tokens bleiben', () => {
  const file = tempFile();
  const c = clock();
  const first = new ParentControls(c.now, new ParentStateFile(file, KEY));
  assert.equal(first.persistent, true);
  const pairing = first.redeemPairingCode(first.createPairingCode('prototype-001', 'betreiber').code);
  assert.ok(pairing);
  first.grantConsent('prototype-001', 'betreiber');
  first.updateSettings('prototype-001', { schlafmodus: true, ruhezeiten: { von: '19:00', bis: '07:00' } });
  const before = first.settings('prototype-001');

  const second = new ParentControls(c.now, new ParentStateFile(file, KEY));
  assert.deepEqual(second.load(['prototype-001', 'anderes-geraet']), { geraete: 1, verworfen: 0, schreibfehler: null });
  assert.deepEqual(second.settings('prototype-001'), before);
  assert.deepEqual(before.einwilligung, {
    erteilt: true,
    zeitpunkt: new Date(c.now()).toISOString(),
    elterntextVersion: ELTERNTEXT_VERSION,
    weg: 'betreiber',
  });
  assert.equal(second.hasConsent('prototype-001'), true);
  assert.equal(second.blockReason('prototype-001', true), 'schlaf');
  assert.deepEqual(second.sessionForToken(pairing.token), { deviceId: 'prototype-001', weg: 'betreiber' });
});

test('Datei: nur Pseudonym und Token-Hash, keine Geräte-ID, kein Token; Rechte 600', () => {
  const file = tempFile();
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  const pairing = p.redeemPairingCode(p.createPairingCode('prototype-001').code);
  assert.ok(pairing);
  p.grantConsent('prototype-001', 'geraet');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('prototype-001'), 'Geräte-ID im Klartext');
  assert.ok(!text.includes(pairing.token), 'Eltern-Token im Klartext');
  assert.ok(!text.includes(KEY), 'Schlüssel in der Datei');
  assert.ok(text.includes(pseudonymFor(KEY, 'prototype-001')));
  assert.ok(text.includes(hashToken(pairing.token)));
  const data = JSON.parse(text) as { format: number; geraete: Record<string, unknown> };
  assert.equal(data.format, 1);
  assert.deepEqual(Object.keys(data.geraete), [pseudonymFor(KEY, 'prototype-001')]);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!fs.existsSync(`${file}.neu`), 'keine Zwischendatei übrig');
});

test('Kopplungscodes stehen nie in der Datei', () => {
  const file = tempFile();
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  p.grantConsent('g1');
  const { code } = p.createPairingCode('g1');
  p.setSleep('g1', true);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(`"${code}"`));
});

test('Neustart nach Widerruf: Das Gerät bleibt gesperrt, der Widerruf steht mit Zeitpunkt in der Datei', () => {
  const file = tempFile();
  const c = clock();
  const first = new ParentControls(c.now, new ParentStateFile(file, KEY));
  first.grantConsent('g1', 'geraet');
  c.advance(3_600_000);
  first.revokeConsent('g1', 'geraet');

  const second = new ParentControls(c.now, new ParentStateFile(file, KEY));
  second.load(['g1']);
  assert.equal(second.hasConsent('g1'), false);
  assert.equal(second.blockReason('g1', true), 'einwilligung');
  assert.deepEqual(second.settings('g1').einwilligung, {
    erteilt: false,
    zeitpunkt: new Date(c.now()).toISOString(),
    elterntextVersion: ELTERNTEXT_VERSION,
    weg: 'geraet',
  });
});

test('Alles löschen: Der Eintrag verschwindet auch aus der Datei, andere Geräte bleiben', () => {
  const file = tempFile();
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  const t1 = p.redeemPairingCode(p.createPairingCode('g1').code);
  assert.ok(t1);
  p.grantConsent('g1');
  p.grantConsent('g2');
  p.forgetDevice('g1');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { geraete: Record<string, unknown> };
  assert.deepEqual(Object.keys(data.geraete), [pseudonymFor(KEY, 'g2')]);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(hashToken(t1.token)), 'Token-Hash gelöscht');

  const again = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  again.load(['g1', 'g2']);
  assert.equal(again.hasConsent('g1'), false);
  assert.equal(again.sessionForToken(t1.token), null);
  assert.equal(again.hasConsent('g2'), true);
});

test('Beim Start: Einträge ohne angemeldetes Gerät löscht der Server aus der Datei', () => {
  const file = tempFile();
  const first = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  first.grantConsent('bleibt');
  first.grantConsent('weg-1');
  first.updateSettings('weg-2', { schlafmodus: true });

  const second = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  assert.deepEqual(second.load(['bleibt']), { geraete: 1, verworfen: 2, schreibfehler: null });
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { geraete: Record<string, unknown> };
  assert.deepEqual(Object.keys(data.geraete), [pseudonymFor(KEY, 'bleibt')]);
});

test('Anderer Schlüssel: Kein Eintrag passt, keine Einwilligung (sicher, aber alle müssen neu einwilligen)', () => {
  const file = tempFile();
  new ParentControls(Date.now, new ParentStateFile(file, KEY)).grantConsent('g1');
  const other = new ParentControls(Date.now, new ParentStateFile(file, OTHER_KEY));
  assert.deepEqual(other.load(['g1']), { geraete: 0, verworfen: 1, schreibfehler: null });
  assert.equal(other.hasConsent('g1'), false);
});

test('Erster Start ohne Datei: leer, und die Datei wird angelegt', () => {
  const file = tempFile();
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  assert.deepEqual(p.load(['g1']), { geraete: 0, verworfen: 0, schreibfehler: null });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { format: 1, geraete: {} });
  assert.equal(new ParentControls().load(['g1']), null, 'ohne Datei nichts zu laden');
});

test('Kaputte oder fremde Datei: Laden wirft, ohne den Inhalt zu nennen, und die Datei bleibt unverändert', () => {
  const file = tempFile();
  const secret = 'geheimer-inhalt-4711';
  const pseudo = 'a'.repeat(64);
  const goodEntry = { einwilligung: null, schlafmodus: false, ruhezeiten: null, elternTokens: [] };
  const cases = [
    `{"format":1,"geraete":{"${secret}"`,
    JSON.stringify({ format: 2, geraete: {} }),
    JSON.stringify({ format: 1, geraete: [] }),
    JSON.stringify({ format: 1, geraete: { [secret]: goodEntry } }),
    JSON.stringify({ format: 1, geraete: { [pseudo]: { ...goodEntry, schlafmodus: 'ja' } } }),
    JSON.stringify({ format: 1, geraete: { [pseudo]: { ...goodEntry, ruhezeiten: { von: '25:00', bis: '07:00' } } } }),
    JSON.stringify({ format: 1, geraete: { [pseudo]: { ...goodEntry, einwilligung: { erteilt: true, zeitpunkt: 'gestern', elterntextVersion: '0', weg: 'geraet' } } } }),
    JSON.stringify({ format: 1, geraete: { [pseudo]: { ...goodEntry, einwilligung: { erteilt: true, zeitpunkt: '2026-11-23T06:00:00.000Z', elterntextVersion: '0', weg: 'post' } } } }),
    JSON.stringify({ format: 1, geraete: { [pseudo]: { ...goodEntry, elternTokens: [{ sha256: secret, seit: '2026-11-23T06:00:00.000Z', weg: 'geraet' }] } } }),
  ];
  for (const content of cases) {
    fs.writeFileSync(file, content);
    const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
    assert.throws(
      () => p.load(['g1']),
      (err: unknown) => err instanceof ParentStateFileError && !err.message.includes(secret) && !String(err.stack).includes(secret),
      content.slice(0, 60)
    );
    assert.equal(fs.readFileSync(file, 'utf8'), content, 'Nachweis bleibt unverändert');
  }
  // Ein gültiger Eintrag geht durch.
  assert.equal(parseParentStateFile(JSON.stringify({ format: 1, geraete: { [pseudo]: goodEntry } })).size, 1);
});

test('Speicherfehler: Einwilligung und Kopplung gelten nicht, Widerruf und Löschen sofort; neuer Versuch beim Aufräumen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kunibert-eltern-'));
  const file = path.join(dir, 'fehlt', 'eltern.json'); // Ordner fehlt: Schreiben schlägt fehl
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));

  // Einwilligung: nicht gespeichert, also nicht erteilt.
  let run: { result: unknown; error: unknown; warnings: string[] } = captureWarnings(() => p.grantConsent('geheim-geraet-1'));
  assert.ok(run.error instanceof ParentStateWriteError && run.error.inEffect === false);
  assert.equal(p.hasConsent('geheim-geraet-1'), false);
  assert.ok(run.warnings.length === 1 && !run.warnings[0].includes('geheim-geraet-1') && !run.warnings[0].includes(file));
  assert.match(run.warnings[0], /Speichern fehlgeschlagen \(ENOENT\)/);

  // Kopplung: nicht gespeichert, kein Token, der Code bleibt einlösbar.
  const { code } = p.createPairingCode('geheim-geraet-1');
  run = captureWarnings(() => p.redeemPairingCode(code));
  assert.ok(run.error instanceof ParentStateWriteError && run.error.inEffect === false);
  assert.equal(p.counts.elternTokens, 0);

  // Ordner da: Kopplung und Einwilligung klappen.
  fs.mkdirSync(path.dirname(file));
  const pairing = p.redeemPairingCode(code);
  assert.ok(pairing, 'Code nach dem Fehler noch gültig');
  p.grantConsent('geheim-geraet-1');
  assert.equal(p.hasConsent('geheim-geraet-1'), true);

  // Widerruf bei Speicherfehler: gilt sofort, steht als ungespeichert in den Zahlen.
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  run = captureWarnings(() => p.revokeConsent('geheim-geraet-1'));
  assert.ok(run.error instanceof ParentStateWriteError && run.error.inEffect === true);
  assert.equal(p.hasConsent('geheim-geraet-1'), false);
  assert.equal(p.counts.ungespeichert, true);
  assert.ok(!run.warnings.join(' ').includes('geheim-geraet-1'));

  // Aufräumen holt das Speichern nach, sobald es wieder geht.
  captureWarnings(() => p.purge());
  assert.equal(p.counts.ungespeichert, true, 'Ordner fehlt noch');
  fs.mkdirSync(path.dirname(file));
  p.purge();
  assert.equal(p.counts.ungespeichert, false);
  const reloaded = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  reloaded.load(['geheim-geraet-1']);
  assert.equal(reloaded.hasConsent('geheim-geraet-1'), false, 'Widerruf steht in der Datei');
  assert.equal(reloaded.settings('geheim-geraet-1').einwilligung.zeitpunkt !== null, true);
});

test('Beim Start nicht beschreibbar: Laden klappt, Schreibfehler wird gemeldet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kunibert-eltern-'));
  const file = path.join(dir, 'fehlt', 'eltern.json');
  const p = new ParentControls(Date.now, new ParentStateFile(file, KEY));
  assert.deepEqual(p.load(['g1']), { geraete: 0, verworfen: 0, schreibfehler: 'ENOENT' });
  assert.equal(p.counts.ungespeichert, true);
});

test('Höchstens fünf Eltern-Tokens auch in der Datei', () => {
  const file = tempFile();
  const c = clock();
  const p = new ParentControls(c.now, new ParentStateFile(file, KEY));
  for (let i = 0; i < MAX_PARENT_TOKENS_PER_DEVICE + 2; i++) {
    c.advance(1000);
    assert.ok(p.redeemPairingCode(p.createPairingCode('g1').code));
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { geraete: Record<string, { elternTokens: unknown[] }> };
  assert.equal(data.geraete[pseudonymFor(KEY, 'g1')].elternTokens.length, MAX_PARENT_TOKENS_PER_DEVICE);
});

test('Ohne Datei: alles wie bisher nur im Arbeitsspeicher', () => {
  const p = new ParentControls();
  assert.equal(p.persistent, false);
  p.grantConsent('g1');
  p.revokeConsent('g1');
  p.forgetDevice('g1');
  assert.equal(p.counts.dauerhaft, false);
  assert.equal(p.counts.ungespeichert, false);
});
