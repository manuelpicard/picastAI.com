import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt, normalizeRequest } from './lib/prompt.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.MODEL || 'gpt-5-mini';
const BASE_URL = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
const API_KEY = process.env.OPENAI_API_KEY || '';
const DEMO_TOKEN = process.env.DEMO_TOKEN || '';
const MAX_BODY_BYTES = 24 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 18;
const buckets = new Map();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(data));
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0]).trim() || req.socket.remoteAddress || 'unknown';
}

function rateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_PER_WINDOW;
}

function authorized(req) {
  return Boolean(DEMO_TOKEN) && req.headers.authorization === `Bearer ${DEMO_TOKEN}`;
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('Anfrage zu groß.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 });
  }
}

async function generateReply(request) {
  if (!API_KEY) throw Object.assign(new Error('Der Modellzugang ist nicht konfiguriert.'), { status: 503 });
  const messages = [
    { role: 'system', content: buildSystemPrompt(request.mode, request.narrator) },
    ...request.history,
    { role: 'user', content: request.message },
  ];
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_completion_tokens: 1200,
      reasoning: { effort: 'minimal' },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result?.error?.message || `Modellantwort fehlgeschlagen (${response.status}).`;
    throw Object.assign(new Error(detail), { status: 502 });
  }
  const text = result?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw Object.assign(new Error('Das Modell hat keine Textantwort geliefert.'), { status: 502 });
  }
  return text.trim().slice(0, 7000);
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, model: MODEL, modelReady: Boolean(API_KEY), accessProtected: Boolean(DEMO_TOKEN) });
  }
  if (req.method === 'POST' && url.pathname === '/api/unlock') {
    if (rateLimited(req)) return sendJson(res, 429, { error: 'Zu viele Versuche. Bitte später erneut probieren.' });
    if (!DEMO_TOKEN) return sendJson(res, 503, { error: 'Für diese Vorschau ist noch kein Zugangscode gesetzt.' });
    const body = await readJson(req);
    if (body?.token !== DEMO_TOKEN) return sendJson(res, 401, { error: 'Der Zugangscode stimmt nicht.' });
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    return authorized(req)
      ? sendJson(res, 200, { ok: true })
      : sendJson(res, 401, { error: 'Bitte entsperre die Vorschau.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (rateLimited(req)) return sendJson(res, 429, { error: 'Das Vorschau-Limit ist erreicht. Bitte warte einige Minuten.' });
    if (!authorized(req)) return sendJson(res, 401, { error: 'Bitte entsperre die Vorschau erneut.' });
    if (!API_KEY) return sendJson(res, 503, { error: 'Der Modellzugang ist in dieser Laufzeit nicht gesetzt.' });
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host;
      try {
        if (new URL(origin).host !== host) return sendJson(res, 403, { error: 'Anfrage von einer anderen Website abgelehnt.' });
      } catch {
        return sendJson(res, 403, { error: 'Ungültiger Website-Ursprung.' });
      }
    }
    const body = await readJson(req);
    let input;
    try {
      input = normalizeRequest(body);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    const text = await generateReply(input);
    return sendJson(res, 200, { text, model: MODEL });
  }
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API-Endpunkt nicht gefunden.' });

  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC, `.${requested}`);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`)) return sendJson(res, 400, { error: 'Ungültiger Dateipfad.' });
  try {
    const bytes = await readFile(filePath);
    const type = mimeTypes[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'",
    });
    return res.end(bytes);
  } catch {
    return sendJson(res, 404, { error: 'Datei nicht gefunden.' });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    const status = error.status || 500;
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'Die Antwort konnte gerade nicht erzeugt werden.' : error.message });
    else res.destroy();
    if (status >= 500) console.error(`[Erzählerschmiede] Anfrage fehlgeschlagen (${status}).`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Erzählerschmiede läuft auf http://${HOST}:${PORT} (Modell: ${MODEL}; Code-Schutz: ${DEMO_TOKEN ? 'aktiv' : 'nicht gesetzt'}).`);
});
