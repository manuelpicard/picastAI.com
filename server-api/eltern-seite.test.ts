// Eltern-Seite (Punkt D2): Kopfzeilen, CSP-Hashes und was die Datei enthalten darf.
// Der Ablauf im Browser (koppeln, einwilligen, widerrufen, Wartezeit) steht in
// deploy/dryrun/eltern-seite.test.mjs (braucht Playwright).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { ELTERNTEXT_VERSION } from './eltern.js';
import { ELTERNTEXT_PLACEHOLDER, PARENT_PAGE_FILE, buildParentPage, cspHash, loadParentPage } from './eltern-seite.js';

const template = fs.readFileSync(PARENT_PAGE_FILE, 'utf8');
const page = loadParentPage(ELTERNTEXT_VERSION);
const script = page.html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const style = page.html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** Die Routen aus server.ts, die eine Eltern-Seite aufrufen darf (docs/picastAI-Pi-API.md, Abschnitt „Eltern“). */
const PARENT_ROUTES = new Set(['koppeln', 'status', 'einwilligung', 'einstellungen', 'geschichte-neu', 'daten']);

describe('Eltern-Seite: Kopfzeilen', () => {
  it('CSP erlaubt nur genau das Skript und den Stil der Datei (Hash), keine fremden Server', () => {
    const csp = page.headers['Content-Security-Policy'];
    assert.ok(script.length > 100 && style.length > 100, 'Skript und Stil gefunden');
    assert.equal(
      csp,
      `default-src 'none'; script-src ${sha256(script)}; style-src ${sha256(style)}; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    );
    assert.doesNotMatch(csp, /unsafe-|https?:|\*/, 'kein unsafe-inline, kein fremder Ursprung, kein Platzhalter');
  });

  it('kein Einbetten, kein Referrer, kein Raten des Typs, keine Kamera und kein Mikrofon', () => {
    assert.equal(page.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(page.headers['X-Frame-Options'], 'DENY');
    assert.equal(page.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(page.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(page.headers['Cross-Origin-Opener-Policy'], 'same-origin');
    assert.equal(page.headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
    assert.ok(!('Set-Cookie' in page.headers), 'die Seite setzt kein Cookie');
  });

  it('setzt die Version des Elterntexts ein und lässt keinen Platzhalter übrig', () => {
    assert.ok(template.includes(ELTERNTEXT_PLACEHOLDER));
    assert.ok(!page.html.includes(ELTERNTEXT_PLACEHOLDER));
    assert.ok(page.html.includes(`<body data-elterntext="${ELTERNTEXT_VERSION}">`));
    // Die Version steht außerhalb von Skript und Stil: Der Hash hängt nicht an ihr.
    assert.equal(buildParentPage(template, '7').headers['Content-Security-Policy'], page.headers['Content-Security-Policy']);
    assert.ok(buildParentPage(template, '"><b>').html.includes('data-elterntext="&quot;&gt;&lt;b&gt;"'), 'maskiert');
  });

  it('cspHash ist der Hash, den der Browser für einen Inline-Block bildet', () => {
    // Beispiel aus der CSP-Spezifikation (W3C, „hash-source“): alert('Hello, world.');
    assert.equal(cspHash("alert('Hello, world.');"), "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  });
});

describe('Eltern-Seite: was die Datei enthalten darf', () => {
  it('keine fremden Dienste, keine externen Schriften, keine Bilder oder Rahmen von außen', () => {
    assert.doesNotMatch(page.html, /https?:\/\//i, 'keine Adresse mit http(s)');
    assert.doesNotMatch(page.html, /(src|href|action)\s*=\s*["']?\s*\/\//i, 'keine Adresse ohne Schema (//host)');
    assert.doesNotMatch(page.html, /@import|@font-face|url\s*\(/i, 'keine nachgeladenen Stile oder Schriften');
    assert.doesNotMatch(page.html, /<(iframe|img|object|embed|video|audio|source|base)\b/i);
    const links = [...page.html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    assert.deepEqual(links, ['<link rel="icon" href="data:,">'], 'nur das leere Symbol, damit der Browser kein /favicon.ico holt');
  });

  it('nichts, was die CSP blockieren würde: keine Inline-Handler, keine style-Attribute, nur ein Skript und ein Stil', () => {
    assert.doesNotMatch(page.html, /\son[a-z]+\s*=/i, 'kein onclick= und Ähnliches');
    assert.doesNotMatch(page.html, /\sstyle\s*=/i, 'kein style=');
    assert.equal(page.html.match(/<script\b/gi)?.length, 1);
    assert.equal(page.html.match(/<style\b/gi)?.length, 1);
  });

  it('Text nur über textContent, nie als HTML; kein eval', () => {
    assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setTimeout\s*\(\s*['"]/);
  });

  it('ruft nur /v1/eltern/* auf diesem Server auf, ohne Kopplungscode in der Adresse', () => {
    assert.equal(script.match(/fetch\(/g)?.length, 1, 'genau ein fetch');
    assert.match(script, /fetch\('\/v1\/eltern\/' \+ route, optionen\)/);
    assert.doesNotMatch(script, /XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie/);
    // Jede Anfrage steht als 'METHODE', 'route' im Skript (anfrage() direkt oder über aktion()).
    const calls = [...script.matchAll(/'(GET|POST|PUT|PATCH|DELETE)',\s*'([^']*)'/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(calls.sort(), ['DELETE einwilligung', 'GET status', 'POST koppeln', 'PUT einwilligung']);
    // Keine Anfrage an der Liste vorbei: anfrage() 4-mal (Definition, Stand, Koppeln, in aktion), aktion() 3-mal (Definition, Einwilligen, Widerrufen).
    assert.equal(script.match(/\b(anfrage|aktion)\(/g)?.length, 7);
    for (const call of calls) assert.ok(PARENT_ROUTES.has(call.split(' ')[1]), call);
    // Der Code geht nur im JSON-Inhalt mit, nie in der Adresse (Verlauf, Protokolle).
    assert.match(script, /anfrage\('POST', 'koppeln', \{ code: code \}\)/);
    assert.match(page.html, /<form id="koppeln-form" novalidate>/, 'kein action=: Ohne Skript schickt das Formular nichts ab (form-action none)');
  });

  it('Seite ist Deutsch und für das Handy gebaut, ohne Suchmaschinen', () => {
    assert.match(page.html, /<html lang="de">/);
    assert.match(page.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(page.html, /<meta name="robots" content="noindex, nofollow">/);
  });
});

describe('Eltern-Seite: Vorlage wird streng geprüft', () => {
  const minimal = (body: string) => `<html><head><style>a{}</style></head><body>${body}<script>1</script></body></html>`;

  it('baut eine einfache Vorlage', () => {
    const built = buildParentPage(minimal(''), '0');
    assert.match(built.headers['Content-Security-Policy'], new RegExp(`script-src ${sha256('1').replace(/[+/]/g, '\\$&')};`));
  });

  it('wirft bei Skript mit src, zweitem Skript oder fehlendem Stil', () => {
    assert.throws(() => buildParentPage(minimal('<script src="/x.js"></script>'), '0'), /ohne Attribute/);
    assert.throws(() => buildParentPage(minimal('<script>2</script>'), '0'), /genau ein/);
    assert.throws(() => buildParentPage('<html><body><script>1</script></body></html>', '0'), /genau ein/);
    assert.throws(() => buildParentPage(minimal('<style media="x">b{}</style>'), '0'), /ohne Attribute/);
  });
});
