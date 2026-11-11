// Integrationstest für PICASTAI_DEVICE_STORE=firestore gegen den Firestore-Emulator.
//
// Läuft NICHT in "npm test" (dort gibt es keinen Emulator), sondern über "npm run test:firestore"
// innerhalb von "firebase emulators:exec" (siehe .github/workflows/tests.yml und
// docs/Firestore-Emulator-Test.md). Ohne Emulator schlägt der Test laut fehl, statt still zu
// überspringen: ein grüner Lauf ohne Prüfung wäre trügerisch.
//
// Der Test startet den echten Server (server.ts) als Kindprozess, genau wie api.test.ts, aber mit
// dem Gerätespeicher in Firestore. Es gehen keine Anfragen an Claude, Spracherkennung oder
// Sprachausgabe und keine an das echte Firestore: Die Adresse des Emulators ist fest eingestellt.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN = 'test-admin-token-0123456789-abcdefghijklmnop';

const appletConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-applet-config.json'), 'utf8')) as {
  projectId: string;
  firestoreDatabaseId?: string;
};
const PROJECT = appletConfig.projectId;
const DATABASE = appletConfig.firestoreDatabaseId || '(default)';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';

/** REST-Adresse eines Dokuments (oder einer Sammlung) im Emulator. */
const documentUrl = (documentPath: string) =>
  `http://${EMULATOR_HOST}/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${documentPath}`;
/** REST-Adresse für Abfragen (runQuery). */
const RUN_QUERY_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT}/databases/${DATABASE}/documents:runQuery`;
/** Der Emulator behandelt diesen Kopf als Administrator: die Regeln gelten dann nicht. So prüfen wir den Inhalt. */
const OWNER = { Authorization: 'Bearer owner' };

const sha256 = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

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

interface RunningServer {
  base: string;
  output: () => string;
  stop: () => Promise<void>;
}

/** Nur ein lokaler Emulator ist erlaubt. */
function isLocalEmulator(hostAndPort: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostAndPort.replace(/:\d+$/, ''));
}

/** Startet den echten Server mit Firestore-Gerätespeicher gegen den Emulator. */
async function startServer(): Promise<RunningServer> {
  // Sicherung: Ohne Emulator-Adresse würde der Server das echte Firestore ansprechen, falls auf dem Rechner
  // Zugangsdaten hinterlegt sind (und das Anlegen eines Testgeräts würde dort schreiben). Das darf nie passieren.
  assert.ok(EMULATOR_HOST && isLocalEmulator(EMULATOR_HOST), 'Server wird nur gegen einen lokalen Firestore-Emulator gestartet');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
    PICASTAI_DEVICE_STORE: 'firestore',
    // Ausdrücklich nur der Emulator. Es gibt keine Zugangsdaten für das echte Firestore.
    FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
    KUNIBERT_RATE_LIMIT: '500',
  };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;

  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk));

  const stop = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  };

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Server vorzeitig beendet (Code ${child.exitCode}):\n${output}`);
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) break;
    } catch {
      // noch nicht bereit
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`Server nicht rechtzeitig bereit:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { base, output: () => output, stop };
}

const adminHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' };

async function registerDevice(server: RunningServer, deviceId: string): Promise<string> {
  const res = await fetch(`${server.base}/api/devices`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ deviceId, name: 'Emulator-Testgerät' }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { deviceId: string; token: string };
  assert.equal(body.deviceId, deviceId);
  assert.match(body.token, /^tok_/);
  return body.token;
}

/** Ein Aufruf, für den das Gerät angemeldet sein muss (Erzähltaste, ohne Sprachdienste mit festem Text). */
const callAsDevice = (server: RunningServer, deviceId: string, token: string | null) =>
  fetch(`${server.base}/v1/device/kunibert-story`, {
    method: 'POST',
    headers: {
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      'X-Device-ID': deviceId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locale: 'de-DE', age_band: '6-10', length: 'short' }),
  });

const listDevices = async (server: RunningServer) => {
  const res = await fetch(`${server.base}/api/devices`, { headers: adminHeaders });
  assert.equal(res.status, 200);
  return ((await res.json()) as { devices: Array<{ deviceId: string; revoked: boolean }> }).devices;
};

interface FirestoreDocument {
  fields?: Record<string, { stringValue?: string; booleanValue?: boolean; integerValue?: string }>;
}

async function readDocumentAsAdmin(deviceId: string): Promise<FirestoreDocument | null> {
  const res = await fetch(documentUrl(`devices/${deviceId}`), { headers: OWNER });
  if (res.status === 404) return null;
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as FirestoreDocument;
}

// Eindeutige Gerätenamen je Lauf: der Test braucht keinen leeren Emulator.
const RUN = crypto.randomBytes(4).toString('hex');
const DEVICE_ID = `emu-test-${RUN}`;
const REVOKED_DEVICE_ID = `emu-test-widerruf-${RUN}`;

const running: RunningServer[] = [];
async function start(): Promise<RunningServer> {
  const server = await startServer();
  running.push(server);
  return server;
}
async function stop(server: RunningServer): Promise<void> {
  await server.stop();
  running.splice(running.indexOf(server), 1);
}

after(async () => {
  for (const server of [...running]) await server.stop();
  // Aufräumen, soweit der Emulator erreichbar ist; sein Speicher ist ohnehin flüchtig.
  if (EMULATOR_HOST) {
    for (const id of [DEVICE_ID, REVOKED_DEVICE_ID]) {
      await fetch(documentUrl(`devices/${id}`), { method: 'DELETE', headers: OWNER }).catch(() => undefined);
    }
  }
});

describe('Voraussetzungen', () => {
  it('Der Emulator läuft, und der Test spricht nur mit dem eigenen Rechner', async () => {
    assert.ok(
      EMULATOR_HOST,
      'FIRESTORE_EMULATOR_HOST fehlt. Dieser Test läuft über: firebase emulators:exec --only firestore --project <projectId> "npm run test:firestore" (siehe docs/Firestore-Emulator-Test.md)'
    );
    assert.ok(isLocalEmulator(EMULATOR_HOST), `Der Test läuft nur gegen einen lokalen Emulator, nicht gegen ${EMULATOR_HOST}`);
    const res = await fetch(`http://${EMULATOR_HOST}/`);
    assert.equal(res.status, 200, 'Emulator antwortet nicht');
  });

  it('firebase.json weist der Datenbank der App die Regeldatei firestore.rules zu', () => {
    // Ohne diese Zuordnung legt der Emulator die Datenbank mit offenen Regeln an, und die Sperrprobe unten wäre wertlos.
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')) as {
      firestore?: Array<{ database: string; rules: string }>;
    };
    const entry = firebaseJson.firestore?.find((item) => item.database === DATABASE);
    assert.ok(entry, `firebase.json kennt die Datenbank "${DATABASE}" aus firebase-applet-config.json nicht`);
    assert.equal(entry.rules, 'firestore.rules');
    const rules = fs.readFileSync(path.join(ROOT, entry.rules), 'utf8');
    assert.match(rules, /allow read, write: if false;/);
  });
});

describe('Firestore-Gerätespeicher gegen den Emulator', () => {
  let token = '';

  it('Ein angelegtes Gerät funktioniert, und in Firestore steht nur der Hash des Tokens', async () => {
    const server = await start();
    try {
      token = await registerDevice(server, DEVICE_ID);
      const ok = await callAsDevice(server, DEVICE_ID, token);
      assert.equal(ok.status, 200, await ok.clone().text());

      const stored = await readDocumentAsAdmin(DEVICE_ID);
      assert.ok(stored, 'Das Gerät steht nach dem Anlegen nicht in Firestore');
      assert.equal(stored.fields?.deviceId?.stringValue, DEVICE_ID);
      assert.equal(stored.fields?.revoked?.booleanValue, false);
      assert.equal(stored.fields?.tokenSha256?.stringValue, sha256(token));
      assert.match(stored.fields?.tokenSha256?.stringValue || '', /^[0-9a-f]{64}$/);
      assert.ok(!JSON.stringify(stored).includes(token), 'Der Token selbst darf nicht in Firestore stehen');
    } finally {
      await stop(server);
    }
  });

  it('Nach einem Neustart ist das Gerät noch da und der Token gilt weiter', async () => {
    const server = await start();
    try {
      assert.match(server.output(), /Geräteliste aus Firestore geladen \(\d+ Einträge\)/);
      const device = (await listDevices(server)).find((entry) => entry.deviceId === DEVICE_ID);
      assert.ok(device, 'Das Gerät fehlt nach dem Neustart');
      assert.equal(device.revoked, false);
      const res = await callAsDevice(server, DEVICE_ID, token);
      assert.equal(res.status, 200, await res.clone().text());
    } finally {
      await stop(server);
    }
  });

  it('Ein falsches Token wird abgelehnt, auch nach einem Neustart', async () => {
    const server = await start();
    try {
      const wrongToken = await callAsDevice(server, DEVICE_ID, 'tok_falsch-falsch-falsch');
      assert.equal(wrongToken.status, 401);
      // Ein Token, das nur fast stimmt (ein Zeichen vertauscht), gilt ebenfalls nicht.
      const almost = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
      assert.equal((await callAsDevice(server, DEVICE_ID, almost)).status, 401);
      assert.equal((await callAsDevice(server, DEVICE_ID, null)).status, 401);
      // Das richtige Token an einem unbekannten Gerät gilt nicht.
      assert.equal((await callAsDevice(server, `${DEVICE_ID}-unbekannt`, token)).status, 401);
      // Und das richtige Gerät funktioniert weiterhin.
      assert.equal((await callAsDevice(server, DEVICE_ID, token)).status, 200);
    } finally {
      await stop(server);
    }
  });

  it('Ein Widerruf wird gespeichert und gilt nach einem Neustart weiter', async () => {
    const first = await start();
    let revokedToken = '';
    try {
      revokedToken = await registerDevice(first, REVOKED_DEVICE_ID);
      assert.equal((await callAsDevice(first, REVOKED_DEVICE_ID, revokedToken)).status, 200);
      const revoke = await fetch(`${first.base}/api/devices/${REVOKED_DEVICE_ID}/revoke`, { method: 'POST', headers: adminHeaders });
      assert.equal(revoke.status, 200);
      assert.deepEqual(await revoke.json(), { success: true, persisted: true });
      assert.equal((await callAsDevice(first, REVOKED_DEVICE_ID, revokedToken)).status, 401);
    } finally {
      await stop(first);
    }

    const second = await start();
    try {
      const device = (await listDevices(second)).find((entry) => entry.deviceId === REVOKED_DEVICE_ID);
      assert.ok(device, 'Das widerrufene Gerät fehlt nach dem Neustart');
      assert.equal(device.revoked, true);
      assert.equal((await callAsDevice(second, REVOKED_DEVICE_ID, revokedToken)).status, 401);
      // Das andere Gerät ist vom Widerruf nicht betroffen.
      assert.equal((await callAsDevice(second, DEVICE_ID, token)).status, 200);
    } finally {
      await stop(second);
    }
  });
});

describe('Firestore-Regeln "deny all" sperren Clients', () => {
  const denied = (response: Response) => assert.equal(response.status, 403, `erwartet 403 (gesperrt), erhalten ${response.status}`);

  it('Kontrolle: Als Administrator ist das Gerät lesbar, die Adresse stimmt also', async () => {
    const res = await fetch(documentUrl('devices'), { headers: OWNER });
    assert.equal(res.status, 200, await res.clone().text());
    const body = (await res.json()) as { documents?: Array<{ name: string }> };
    assert.ok(
      body.documents?.some((document) => document.name.endsWith(`/devices/${DEVICE_ID}`)),
      'Das Testgerät fehlt in der Sammlung devices'
    );
  });

  it('Lesen ist gesperrt: einzelnes Dokument, ganze Sammlung, Abfrage und fremde Sammlung', async () => {
    denied(await fetch(documentUrl(`devices/${DEVICE_ID}`)));
    denied(await fetch(documentUrl('devices')));
    denied(await fetch(documentUrl('irgendeine-andere-sammlung')));
    denied(
      await fetch(RUN_QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'devices' }] } }),
      })
    );
  });

  it('Schreiben ist gesperrt: Anlegen, Ändern und Löschen, und es ändert sich nichts', async () => {
    const forgedId = `emu-test-gefaelscht-${RUN}`;
    denied(
      await fetch(documentUrl(`devices/${forgedId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { deviceId: { stringValue: forgedId }, revoked: { booleanValue: false } } }),
      })
    );
    denied(
      await fetch(`${documentUrl('devices')}?documentId=${forgedId}-2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { deviceId: { stringValue: forgedId } } }),
      })
    );
    denied(
      await fetch(documentUrl(`devices/${DEVICE_ID}?updateMask.fieldPaths=revoked`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { revoked: { booleanValue: true } } }),
      })
    );
    denied(await fetch(documentUrl(`devices/${DEVICE_ID}`), { method: 'DELETE' }));

    // Wirkung prüfen: nichts angelegt, nichts geändert, nichts gelöscht.
    assert.equal(await readDocumentAsAdmin(forgedId), null);
    assert.equal(await readDocumentAsAdmin(`${forgedId}-2`), null);
    const stored = await readDocumentAsAdmin(DEVICE_ID);
    assert.ok(stored, 'Das Gerät wurde trotz Sperre gelöscht');
    assert.equal(stored.fields?.revoked?.booleanValue, false, 'Das Gerät wurde trotz Sperre geändert');
  });
});
