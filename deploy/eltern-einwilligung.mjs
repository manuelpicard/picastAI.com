#!/usr/bin/env node
// Nur für Tests mit Erwachsenen: koppelt ein Gerät über die Betreiber-Route und erteilt die
// Einwilligung, so wie Eltern es später in der Eltern-App tun. Ohne Einwilligung antwortet der
// Server im Betrieb (NODE_ENV=production) nur mit einem festen Hinweis.
//
// Nötig nach jedem Neustart des Servers: Die Einwilligung liegt vorläufig nur im Arbeitsspeicher
// (Punkt E2 der Arbeitsliste), und das Gerät spricht den Code noch nicht selbst (Punkt D1).
//
//   PICASTAI_API_BASE_URL=http://127.0.0.1:3000 \
//   PICASTAI_ADMIN_TOKEN=<Betreiber-Token> \
//   PICASTAI_DEVICE_ID=prototype-001 \
//   node deploy/eltern-einwilligung.mjs
//
// Gibt weder den Code noch ein Token aus. Schnittstelle: docs/picastAI-Pi-API.md, Abschnitt „Eltern“.

const base = (process.env.PICASTAI_API_BASE_URL || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
const adminToken = (process.env.PICASTAI_ADMIN_TOKEN || '').trim();
const deviceId = (process.env.PICASTAI_DEVICE_ID || '').trim();

function fail(message, code = 1) {
  console.error(`Fehler: ${message}`);
  process.exit(code);
}

if (!adminToken) fail('PICASTAI_ADMIN_TOKEN fehlt (dasselbe Betreiber-Token wie am Server).', 2);
if (!deviceId) fail('PICASTAI_DEVICE_ID fehlt (zum Beispiel prototype-001).', 2);

let url;
try {
  url = new URL(base);
} catch {
  fail('PICASTAI_API_BASE_URL ist keine gültige Adresse.', 2);
}
if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  console.error('Hinweis: Verbindung ohne Verschlüsselung (http). Nur im eigenen WLAN verwenden.');
}

async function call(path, init) {
  try {
    return await fetch(`${base}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    fail(`Server nicht erreichbar (${err?.name || 'Fehler'}). Läuft er unter ${base}?`);
  }
}

// 1. Kopplungscode über die Betreiber-Route holen (statt ihn vom Gerät sprechen zu lassen).
const codeRes = await call(`/api/devices/${encodeURIComponent(deviceId)}/kopplungscode`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
});
if (codeRes.status === 503) fail('Am Server fehlt PICASTAI_ADMIN_TOKEN, oder es ist kürzer als 32 Zeichen.');
if (codeRes.status === 401) fail('Das Betreiber-Token passt nicht zum Server.');
if (codeRes.status === 404) fail('Das Gerät ist am Server nicht angelegt oder gesperrt.');
if (codeRes.status !== 200) fail(`Kopplungscode: HTTP ${codeRes.status}.`);
const { code } = await codeRes.json();

// 2. Code einlösen wie die Eltern-App: Der Server setzt das Eltern-Cookie.
const pairRes = await call('/v1/eltern/koppeln', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
if (pairRes.status !== 200) fail(`Koppeln: HTTP ${pairRes.status}.`);
const cookie = (pairRes.headers.get('set-cookie') || '').match(/kb_eltern=([^;]+)/);
if (!cookie) fail('Koppeln: Der Server hat kein Eltern-Cookie gesetzt.');

// 3. Einwilligung erteilen.
const consentRes = await call('/v1/eltern/einwilligung', {
  method: 'PUT',
  headers: { Cookie: `kb_eltern=${cookie[1]}`, 'Content-Type': 'application/json' },
  body: '{}',
});
if (consentRes.status !== 200) fail(`Einwilligung: HTTP ${consentRes.status}.`);
const settings = await consentRes.json();
if (settings?.einwilligung?.erteilt !== true) fail('Einwilligung: Der Server meldet sie nicht als erteilt.');

console.log('Einwilligung erteilt. Sie gilt bis zum nächsten Neustart des Servers. Nur Erwachsene testen.');
