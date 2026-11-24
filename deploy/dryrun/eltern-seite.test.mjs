// Browser-Test der Eltern-Seite /eltern (Punkt D2): echter Server (server.ts mit NODE_ENV=production),
// echter Browser (Chromium über Playwright). Es geht nichts nach außen; Sprachdienste braucht der Test nicht.
//
//   node --test deploy/dryrun/eltern-seite.test.mjs     (läuft auch in npm run test:e2e)
//
// Ohne Playwright wird der Test übersprungen (so bisher in der CI; in der Cloud-Sitzung von Claude ist
// Playwright mit Chromium installiert). Was er prüft: koppeln (zu kurzer, falscher, richtiger Code),
// Einwilligung erteilen und widerrufen, Wartezeit bei 429 (echt und mit grund "insgesamt"), ehrliche
// Meldungen bei 503, 401 und ohne Verbindung, keine Verstöße gegen die CSP, keine Anfrage an andere
// Pfade als /eltern und /v1/eltern/*, kein Code und kein Cookie im Protokoll des Servers.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEVICE_ID = 'eltern-seite-test';
const DEVICE_TOKEN = 'eltern-seite-geraete-token-nur-fuer-diesen-test';
const ADMIN_TOKEN = 'eltern-seite-admin-token-nur-fuer-diesen-test';

let playwright = null;
try {
  // CommonJS-Auflösung: findet auch ein global installiertes Playwright (NODE_PATH).
  playwright = createRequire(import.meta.url)('playwright');
} catch {
  playwright = null;
}
const skip = playwright ? false : 'Playwright fehlt (npm-Paket playwright mit Chromium)';

let server = null;
let serverLog = '';
let base = '';
let browser = null;
const usedCodes = [];
const cspErrors = [];
const foreignRequests = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Kopplungscode über die Betreiber-Route (so wie im Test mit Erwachsenen, deploy/eltern-einwilligung.mjs). */
async function pairingCode() {
  const res = await fetch(`${base}/api/devices/${DEVICE_ID}/kopplungscode`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  assert.equal(res.status, 200, await res.clone().text());
  const { code } = await res.json();
  usedCodes.push(code);
  return code;
}

/** Neuer Browser-Kontext (eigene Cookies) mit Wächtern für CSP-Verstöße und fremde Anfragen. */
async function openPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  page.on('pageerror', (error) => cspErrors.push(`Skriptfehler: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    const allowed = url.origin === base && (url.pathname === '/eltern' || url.pathname.startsWith('/v1/eltern/'));
    if (!allowed && url.protocol !== 'data:') foreignRequests.push(request.url());
  });
  await page.goto(`${base}/eltern`);
  return { context, page };
}

/** Wartet, bis das Element sichtbar ist und sein Text zum Muster passt. */
async function waitText(page, selector, pattern, timeout = 5000) {
  try {
    await page.waitForFunction(
      ([sel, source, flags]) => {
        const element = document.querySelector(sel);
        return Boolean(element && !element.hidden && element.offsetParent !== null && new RegExp(source, flags).test(element.textContent));
      },
      [selector, pattern.source, pattern.flags],
      { timeout }
    );
  } catch (error) {
    const actual = await page.locator(selector).textContent().catch(() => null);
    throw new Error(`${selector}: erwartet ${pattern}, war ${JSON.stringify(actual)} (${error.message.split('\n')[0]})`);
  }
}

const visible = (page, selector) => page.locator(selector).isVisible();

async function submitCode(page, code) {
  await page.fill('#code', code);
  await page.click('#koppeln-knopf');
}

before(async () => {
  if (skip) return;
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  // Keine Einstellungen aus der Shell übernehmen (Sprachdienste, Claude, Datei der Eltern-Steuerung):
  // Sonst bereitete der Server im Betrieb feste Texte bei einem echten Sprachdienst vor.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(PICASTAI_|KUNIBERT_|ANTHROPIC_|GOOGLE_)/.test(name)));
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: {
      ...env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PICASTAI_PUBLIC_BASE_URL: base,
      PICASTAI_ADMIN_TOKEN: ADMIN_TOKEN,
      PICASTAI_DEVICE_ID: DEVICE_ID,
      PICASTAI_DEVICE_TOKEN: DEVICE_TOKEN,
      PICASTAI_DEVICE_STORE: 'memory',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (serverLog += chunk));
  server.stderr.on('data', (chunk) => (serverLog += chunk));
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // Server startet noch.
    }
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Server startet nicht:\n${serverLog.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await playwright.chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});

test('Seite lädt ohne Verstoß gegen die CSP und zeigt das Koppeln mit dem Hinweis auf den Testbetrieb', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await waitText(page, '#koppeln h2', /Handy mit Kunibert verbinden/);
  assert.equal(await visible(page, '#stand'), false);
  // Elterntext Version 0: nur Tests mit Erwachsenen (server-api/eltern.ts, ELTERNTEXT_VERSION).
  await waitText(page, '#testbetrieb', /Kinder dürfen Kunibert noch nicht benutzen\. Bis zur Rechtsprüfung testen nur Erwachsene/);
  await waitText(page, '#koppeln-test', /Code vom Betreiber/);
  // Die Stile greifen (sonst hätte die CSP sie blockiert): Der Knopf hat die Farbe aus dem <style>.
  const background = await page.locator('#koppeln-knopf').evaluate((element) => getComputedStyle(element).backgroundColor);
  assert.equal(background, 'rgb(31, 78, 140)');
  await context.close();
});

test('Koppeln: zu kurzer Code wird nicht geschickt, falscher Code gibt einen klaren Hinweis', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  let pairingRequests = 0;
  page.on('request', (request) => (request.url().endsWith('/v1/eltern/koppeln') ? pairingRequests++ : 0));
  await submitCode(page, '12');
  await waitText(page, '#koppeln-fehler', /genau sechs Ziffern/);
  assert.equal(pairingRequests, 0, 'ein zu kurzer Code zählt nicht als Fehlversuch');
  const code = await pairingCode();
  await submitCode(page, code === '999999' ? '999998' : '999999');
  await waitText(page, '#koppeln-fehler', /stimmt nicht oder ist abgelaufen/);
  assert.equal(pairingRequests, 1);
  await context.close();
});

test('Richtiger Code: verbunden, einwilligen, nach dem Neuladen noch verbunden, widerrufen mit Rückfrage', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  // Eingefügt mit Leerzeichen („123 456“): zählt wie sechs Ziffern.
  const code = await pairingCode();
  await submitCode(page, `${code.slice(0, 3)} ${code.slice(3)}`);
  await waitText(page, '#meldung', /jetzt mit Kunibert verbunden/);
  await waitText(page, '#einwilligung-text', /^Noch nicht erteilt/);
  await waitText(page, '#einwilligen-test', /nur für Tests mit Erwachsenen/);
  await waitText(page, '#elterntext-version', /^0$/);
  await waitText(page, '#schlafmodus-text', /Schlafmodus: aus/);
  await waitText(page, '#ruhezeiten-text', /Ruhezeiten: keine/);
  assert.equal(await page.inputValue('#code'), '', 'der Code bleibt nicht im Feld stehen');

  await page.click('#einwilligen-knopf');
  await waitText(page, '#einwilligung-text', /^Erteilt am \d\d\.\d\d\.\d{4} um \d\d:\d\d Uhr\./);
  await waitText(page, '#einwilligung-weg', /Code vom Betreiber kam \(Elterntext Version 0\)/);
  assert.equal(await visible(page, '#einwilligen-box'), false);

  // Das Cookie hält die Verbindung: Nach dem Neuladen steht gleich der Stand da.
  await page.reload();
  await waitText(page, '#einwilligung-text', /^Erteilt am/);
  const cookies = await context.cookies();
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, 'kb_eltern');
  assert.equal(cookies[0].path, '/v1/eltern');
  assert.equal(cookies[0].httpOnly, true);
  assert.equal(cookies[0].sameSite, 'Strict');

  await page.click('#widerrufen-knopf');
  await waitText(page, '#widerrufen-frage', /Wirklich widerrufen\?/);
  await page.click('#widerrufen-nein');
  assert.equal(await visible(page, '#widerrufen-frage'), false);
  await waitText(page, '#einwilligung-text', /^Erteilt am/);
  await page.click('#widerrufen-knopf');
  await page.click('#widerrufen-ja');
  await waitText(page, '#meldung', /Einwilligung ist widerrufen/);
  await waitText(page, '#einwilligung-text', /^Gilt gerade nicht\. Letzte Änderung am/);
  assert.equal(await visible(page, '#einwilligen-box'), true);
  await context.close();
});

test('Zu viele Fehlversuche (echter Server): Wartezeit, Knopf gesperrt, danach geht der richtige Code', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  const code = await pairingCode();
  const wrong = code === '100000' ? '100001' : '100000';
  // Der Test oben hatte schon einen Fehlversuch von dieser Adresse. Ab dem dritten wartet sie 2 Sekunden.
  let blocked = false;
  for (let attempt = 0; attempt < 5 && !blocked; attempt++) {
    const response = page.waitForResponse((r) => r.url().endsWith('/v1/eltern/koppeln'));
    await submitCode(page, wrong);
    blocked = (await response).status() === 429;
  }
  assert.ok(blocked, 'nach wenigen Fehlversuchen 429');
  await waitText(page, '#koppeln-fehler', /^Zu viele falsche Versuche\. Bitte warte (1 Sekunde|2 Sekunden)\.$/);
  assert.equal(await page.locator('#koppeln-knopf').isDisabled(), true);
  await waitText(page, '#koppeln-knopf', /^Bitte warten \((1 Sekunde|2 Sekunden)\)$/);
  assert.equal(await visible(page, '#insgesamt-rat'), false);
  await waitText(page, '#koppeln-fehler', /^Du kannst es jetzt wieder versuchen\.$/, 6000);
  assert.equal(await page.locator('#koppeln-knopf').isDisabled(), false);
  await waitText(page, '#koppeln-knopf', /^Verbinden$/);
  // Keine harte Sperre: Nach der Wartezeit gilt der richtige Code.
  await submitCode(page, code);
  await waitText(page, '#meldung', /jetzt mit Kunibert verbunden/);
  await context.close();
});

test('Gesperrt für alle (grund "insgesamt"): Rat mit dem WLAN; ohne warten_sekunden zählt Retry-After', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  const answers = [
    { headers: { 'Retry-After': '30' }, body: { error: 'rate_limited', warten_sekunden: 90, grund: 'insgesamt' } },
    { headers: { 'Retry-After': '3' }, body: { error: 'rate_limited' } },
  ];
  let pairingRequests = 0;
  page.on('request', (request) => (request.url().endsWith('/v1/eltern/koppeln') ? pairingRequests++ : 0));
  await page.route('**/v1/eltern/koppeln', (route) => {
    const answer = answers.shift();
    return route.fulfill({ status: 429, contentType: 'application/json', headers: answer.headers, body: JSON.stringify(answer.body) });
  });
  await submitCode(page, '123456');
  await waitText(page, '#koppeln-fehler', /^Gerade versuchen sehr viele, einen Code zu erraten\. .* Bitte warte 2 Minuten\.$/);
  await waitText(page, '#insgesamt-rat', /WLAN, in dem auch Kunibert ist.*mobilen Daten aus.*neuen Code sagen.*Das hilft nicht immer/s);
  // Im Testbetrieb kommt der Code vom Betreiber: Dann hilft der Rat nicht, und die Seite sagt das.
  await waitText(page, '#insgesamt-test', /Im Test kommt der Code vom Betreiber\. Dann hilft nur Warten\./);
  await waitText(page, '#koppeln-knopf', /^Bitte warten \(2 Minuten\)$/);
  // Während der Wartezeit schickt die Seite nichts ab (kurz warten, damit eine Anfrage auch ankäme).
  await page.locator('#koppeln-form').evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(500);
  assert.equal(pairingRequests, 1, 'kein Versuch während der Wartezeit');
  assert.equal(answers.length, 1);

  // Zweiter Fall in einem frischen Kontext: nur Retry-After, grund fehlt.
  await context.close();
  const second = await openPage();
  await second.page.route('**/v1/eltern/koppeln', (route) => {
    const answer = answers.shift();
    return route.fulfill({ status: 429, contentType: 'application/json', headers: answer.headers, body: JSON.stringify(answer.body) });
  });
  await submitCode(second.page, '123456');
  await waitText(second.page, '#koppeln-fehler', /^Zu viele falsche Versuche\. Bitte warte 3 Sekunden\.$/);
  assert.equal(await visible(second.page, '#insgesamt-rat'), false);
  await second.context.close();
});

test('Ehrliche Meldungen: Speichern fehlgeschlagen (503), nicht mehr verbunden (401), keine Verbindung', { skip, timeout: 60_000 }, async () => {
  const { context, page } = await openPage();
  await submitCode(page, await pairingCode());
  // Die Einwilligung gehört zum Gerät, nicht zum Handy: Der Test oben hat sie widerrufen.
  await waitText(page, '#einwilligung-text', /^Gilt gerade nicht\. Letzte Änderung am/);

  // Einwilligung gilt nur gespeichert: wirksam false.
  await page.route('**/v1/eltern/einwilligung', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'parent_store_unavailable', wirksam: false }) })
  );
  await page.click('#einwilligen-knopf');
  await waitText(page, '#meldung', /Der Server konnte nicht speichern/);
  await waitText(page, '#einwilligung-text', /^Gilt gerade nicht/);
  await page.unroute('**/v1/eltern/einwilligung');

  // Widerruf gilt sofort, auch wenn das Speichern fehlschlägt: wirksam true, die Seite holt den Stand neu.
  await page.click('#einwilligen-knopf');
  await waitText(page, '#einwilligung-text', /^Erteilt am/);
  let statusAfter = 0;
  page.on('request', (request) => (request.url().endsWith('/v1/eltern/status') ? statusAfter++ : 0));
  await page.route('**/v1/eltern/einwilligung', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'parent_store_unavailable', wirksam: true }) })
  );
  await page.click('#widerrufen-knopf');
  await page.click('#widerrufen-ja');
  await waitText(page, '#meldung', /Die Änderung gilt\. Der Server konnte sie aber noch nicht speichern/);
  assert.equal(statusAfter, 1, 'Stand neu geholt');
  await page.unroute('**/v1/eltern/einwilligung');

  // Ein anderes Handy hat alles gelöscht: 401, die Seite bietet das Koppeln wieder an.
  await page.route('**/v1/eltern/einwilligung', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) })
  );
  await page.click('#widerrufen-knopf');
  await page.click('#widerrufen-ja');
  await waitText(page, '#meldung', /nicht mehr mit Kunibert verbunden/);
  await waitText(page, '#koppeln h2', /Handy mit Kunibert verbinden/);
  await page.unroute('**/v1/eltern/einwilligung');

  // Keine Verbindung beim Laden: Hinweis und Knopf zum Wiederholen.
  await page.route('**/v1/eltern/status', (route) => route.abort());
  await page.reload();
  await waitText(page, '#laden-text', /Keine Verbindung zum Server/);
  await page.unroute('**/v1/eltern/status');
  await page.click('#neu-laden');
  await waitText(page, '#einwilligung-text', /^Erteilt am/);
  await context.close();
});

test('Ohne Testbetrieb (Elterntext-Version nicht "0"): keine Hinweise auf den Test', { skip, timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => cspErrors.push(`Skriptfehler: ${error.message}`));
  // Nur das Attribut am <body> ändern: Skript und Stil bleiben gleich, die CSP der echten Antwort passt weiter.
  await page.route('**/eltern', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<body data-elterntext="0">', '<body data-elterntext="1">');
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/eltern`);
  await waitText(page, '#koppeln h2', /Handy mit Kunibert verbinden/);
  for (const id of ['#testbetrieb', '#koppeln-test', '#insgesamt-test', '#einwilligen-test']) {
    assert.equal(await page.locator(id).isHidden(), true, id);
  }
  await context.close();
});

test('Keine Verstöße gegen die CSP, keine fremden Anfragen, kein Code und kein Cookie im Protokoll', { skip, timeout: 30_000 }, async () => {
  assert.deepEqual(cspErrors, []);
  assert.deepEqual(foreignRequests, []);
  assert.ok(usedCodes.length >= 4);
  for (const code of usedCodes) assert.ok(!serverLog.includes(code), 'Kopplungscode im Protokoll');
  assert.doesNotMatch(serverLog, /kb_eltern=/);
});
