// Eltern-Seite `/eltern` (Punkt D2): eine HTML-Datei ohne fremde Dienste und ohne externe Schriften
// (`eltern-seite.html`). Sie ruft nur `/v1/eltern/*` auf diesem Server auf. Die Kopfzeilen sind streng:
// Skript und Stil nur genau so, wie sie in der Datei stehen (CSP mit SHA-256), keine Verbindung zu
// anderen Servern, kein Einbetten in fremde Seiten, kein Referrer.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARENT_PAGE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'eltern-seite.html');

/** Platzhalter in der Datei: Version des Elterntexts (`ELTERNTEXT_VERSION` in eltern.ts). */
export const ELTERNTEXT_PLACEHOLDER = '__ELTERNTEXT_VERSION__';

export interface ParentPage {
  html: string;
  headers: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Inhalt aller `<tag>`-Blöcke ohne Attribute, genau so, wie der Browser ihn für den Hash nimmt. */
function inlineBlocks(html: string, tag: 'script' | 'style'): string[] {
  return [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}

/** CSP-Quelle für einen Inline-Block: 'sha256-<Base64>'. */
export function cspHash(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

/**
 * Baut Seite und Kopfzeilen aus der Vorlage. Wirft, wenn die Vorlage etwas enthält, das die CSP nicht
 * abdeckt: Skript oder Stil mit Attributen (zum Beispiel `src`), mehr oder weniger als genau ein
 * Skript und ein Stil, oder ein übrig gebliebener Platzhalter.
 */
export function buildParentPage(template: string, elterntextVersion: string): ParentPage {
  const html = template.split(ELTERNTEXT_PLACEHOLDER).join(escapeHtml(elterntextVersion));
  if (/<(script|style)\b[^>]+>/i.test(html)) throw new Error('Eltern-Seite: <script> und <style> nur ohne Attribute');
  const scripts = inlineBlocks(html, 'script');
  const styles = inlineBlocks(html, 'style');
  if (scripts.length !== 1 || styles.length !== 1) throw new Error('Eltern-Seite: genau ein <script> und ein <style> erwartet');
  const csp = [
    "default-src 'none'",
    `script-src ${cspHash(scripts[0])}`,
    `style-src ${cspHash(styles[0])}`,
    "connect-src 'self'",
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    html,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  };
}

/** Liest die Seite beim Start. Fehlt die Datei, startet der Server nicht (lieber laut als eine kaputte Seite). */
export function loadParentPage(elterntextVersion: string, file: string = PARENT_PAGE_FILE): ParentPage {
  return buildParentPage(fs.readFileSync(file, 'utf8'), elterntextVersion);
}
