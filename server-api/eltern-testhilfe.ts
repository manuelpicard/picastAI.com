// Testhilfe (kein eigener Test): koppelt ein Gerät über die Betreiber-Route und erteilt die
// Einwilligung, so wie Eltern es in der App täten. Im Betrieb (NODE_ENV=production) antwortet
// der Server ohne Einwilligung nur mit einem festen Hinweis.
import assert from 'node:assert/strict';

/** Koppelt das Gerät und erteilt die Einwilligung. Gibt den Cookie-Wert für weitere Eltern-Anfragen zurück. */
export async function pairAndConsent(base: string, adminToken: string, deviceId: string): Promise<string> {
  const cookie = await pair(base, adminToken, deviceId);
  const consent = await fetch(`${base}/v1/eltern/einwilligung`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(consent.status, 200, await consent.clone().text());
  return cookie;
}

/** Nur koppeln (ohne Einwilligung). Gibt "kb_eltern=<token>" zurück. */
export async function pair(base: string, adminToken: string, deviceId: string): Promise<string> {
  const codeRes = await fetch(`${base}/api/devices/${encodeURIComponent(deviceId)}/kopplungscode`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(codeRes.status, 200, await codeRes.clone().text());
  const { code } = (await codeRes.json()) as { code: string };
  const pairRes = await fetch(`${base}/v1/eltern/koppeln`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  assert.equal(pairRes.status, 200, await pairRes.clone().text());
  const setCookie = pairRes.headers.get('set-cookie') || '';
  const match = setCookie.match(/kb_eltern=([^;]+)/);
  assert.ok(match, 'kein Eltern-Cookie gesetzt');
  return `kb_eltern=${match[1]}`;
}
