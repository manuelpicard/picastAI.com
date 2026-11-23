// Kleine, framework-freie Hilfen für den HTTP-Rand des Servers.
// Bewusst ohne Express-Import, damit sie ohne Server testbar bleiben.
import { isLoopbackAddress } from './kopplungsschutz.js';

export type TrustProxySetting = boolean | number | string;

/**
 * PICASTAI_TRUST_PROXY steuert Expresss Einstellung "trust proxy", also ob
 * X-Forwarded-Proto und Co. geglaubt werden. Hinter einem TLS-beendenden Proxy
 * (nginx, Caddy, Cloud Run) braucht der Server das, um https zu erkennen.
 *
 * - leer, "false", "0": aus (Standard, sicher ohne Proxy)
 * - "true": jedem vorgelagerten Hop glauben (nur hinter einem Proxy, der die
 *   Header selbst setzt)
 * - Zahl N: den letzten N Proxy-Hops glauben
 * - sonst: Express-Schlüsselwörter oder Adresslisten ("loopback", "10.0.0.0/8")
 */
export function parseTrustProxy(value: string | undefined | null): TrustProxySetting {
  const text = (value ?? '').trim();
  if (!text || text.toLowerCase() === 'false') return false;
  if (text.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    return hops > 0 ? hops : false;
  }
  return text;
}

/**
 * PICASTAI_PUBLIC_BASE_URL: der Ursprung, unter dem Geräte den Server erreichen
 * (z. B. https://kunibert.example). Daraus baut der Server die audio_url. Das ist
 * die robusteste Einstellung hinter einem Proxy, der den Host-Header umschreibt.
 * Pfad, Query und Fragment werden verworfen; ungültige Werte und Zugangsdaten in
 * der Adresse ergeben null. Schreibweise des Hosts und Port bleiben, wie der
 * Betreiber sie getippt hat (new URL().origin würde "picastAI.com" kleinschreiben).
 */
export function normalizePublicBaseUrl(value: string | undefined | null): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const typed = /^(https?):\/\/([^/?#\\]+)/i.exec(text);
  if (!typed) return null;
  try {
    const url = new URL(text);
    if (url.username || url.password || !url.hostname) return null;
  } catch {
    return null;
  }
  return `${typed[1].toLowerCase()}://${typed[2]}`;
}

/**
 * Absolute URL, unter der das Gerät die erzeugte Antwort abholt. Der Pi-Client
 * lehnt eine audio_url ab, deren Schema oder Host nicht zur konfigurierten
 * API-Adresse passt. Ohne PICASTAI_PUBLIC_BASE_URL kommen Schema und Host
 * deshalb aus der Anfrage, was hinter einem Proxy PICASTAI_TRUST_PROXY braucht.
 */
export function buildAudioUrl(
  source: { publicBaseUrl: string | null; protocol: string; host: string | undefined },
  turnId: string,
  routePrefix = '/v1/device/audio'
): string {
  const base = source.publicBaseUrl ?? `${source.protocol}://${source.host || 'localhost'}`;
  return `${base}${routePrefix}/${encodeURIComponent(turnId)}`;
}

/**
 * Bekommt das Eltern-Cookie `Secure`? Vorläufig festgelegt am 23.11.2026 (Punkt D2, Teil 1):
 *
 * - ja, wenn die Anfrage über HTTPS kam: direkt (`secure`) oder laut `X-Forwarded-Proto` eines Proxys.
 *   Den Kopf liest der Server dafür auch ohne PICASTAI_TRUST_PROXY: Ein gefälschter Kopf kann nur
 *   `Secure` hinzufügen, und das macht höchstens das eigene Cookie unbrauchbar.
 * - ja, im Betrieb (`production`), wenn die Verbindung von diesem Rechner kommt: Dort steht ein Proxy
 *   wie Caddy, der HTTPS beendet, auch wenn er `X-Forwarded-Proto` nicht setzt.
 * - nein nur bei http direkt von einem anderen Rechner (Test im eigenen WLAN): Sonst behielte der
 *   Browser das Cookie nicht.
 */
export function parentCookieSecure(request: {
  secure: boolean;
  forwardedProto: string | string[] | undefined;
  remoteAddress: string | undefined;
  production: boolean;
}): boolean {
  if (request.secure) return true;
  const forwarded = Array.isArray(request.forwardedProto) ? request.forwardedProto.join(',') : request.forwardedProto || '';
  if (forwarded.split(',').some((value) => value.trim().toLowerCase() === 'https')) return true;
  return request.production && isLoopbackAddress(request.remoteAddress);
}
