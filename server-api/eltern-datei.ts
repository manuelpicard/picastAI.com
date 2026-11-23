import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Dauerhafte Ablage der Eltern-Steuerung (Punkt E2 der Arbeitsliste, seit 23.11.2026).
 *
 * Eine JSON-Datei auf dem Server (KUNIBERT_ELTERN_DATEI). Darin steht je Gerät nur ein Pseudonym:
 * HMAC-SHA-256 der Geräte-ID mit einem geheimen Schlüssel aus der Umgebung (KUNIBERT_ELTERN_SCHLUESSEL).
 * Ein einfacher Hash ließe sich bei frei gewählten Kennungen wie „prototype-001“ leicht zurückrechnen.
 * Einschätzung (keine Rechtsberatung): Auch das Pseudonym bleibt ein Personenbezug.
 *
 * Je Gerät stehen in der Datei nur:
 * - die Einwilligung: erteilt oder widerrufen, Zeitpunkt, Version des Elterntexts, Weg (Code vom Gerät
 *   oder über die Betreiber-Route); nur der letzte Stand, kein Verlauf,
 * - Schlafmodus und Ruhezeiten,
 * - die SHA-256-Hashes der Eltern-Tokens mit Zeitpunkt und Weg der Kopplung (nie die Tokens selbst).
 * Keine Namen, keine E-Mail-Adressen, keine Aufnahmen, keine Texte, keine Kopplungscodes.
 *
 * Geschrieben wird die ganze Datei auf einmal: erst in eine neue Datei (Rechte 600), dann umbenannt.
 * So liegt nach einem Absturz immer ein vollständiger Stand da.
 */

/** Mindestlänge des Schlüssels für die Pseudonyme (wie das Admin-Token: openssl rand -hex 32). */
export const ELTERN_SCHLUESSEL_MIN_LAENGE = 32;
/** Format der Datei; ein anderes Format liest der Server nicht (er startet dann nicht). */
export const ELTERN_DATEI_FORMAT = 1;

/** Auf welchem Weg der Kopplungscode kam: vom Gerät gesprochen oder über die Betreiber-Route. */
export type ConsentPath = 'geraet' | 'betreiber';

export interface StoredConsent {
  erteilt: boolean;
  /** Zeitpunkt der letzten Änderung (Erteilung oder Widerruf), ISO 8601 in UTC. */
  zeitpunkt: string;
  elterntextVersion: string;
  weg: ConsentPath;
}

export interface StoredParentToken {
  /** SHA-256 des Eltern-Tokens (hex). */
  sha256: string;
  /** Zeitpunkt der Kopplung, ISO 8601 in UTC. */
  seit: string;
  weg: ConsentPath;
}

export interface StoredParentEntry {
  einwilligung: StoredConsent | null;
  schlafmodus: boolean;
  ruhezeiten: { von: string; bis: string } | null;
  elternTokens: StoredParentToken[];
}

/** Datei fehlt nicht, ist aber nicht lesbar oder nicht gültig. Die Meldung enthält nie den Inhalt. */
export class ParentStateFileError extends Error {
  constructor(public readonly code: string) {
    super(`Die Datei der Eltern-Steuerung (KUNIBERT_ELTERN_DATEI) ist nicht lesbar oder ungültig (${code}).`);
    this.name = 'ParentStateFileError';
  }
}

/** Ist der Schlüssel brauchbar? Mindestens 32 Zeichen, ohne Leer- und Steuerzeichen. */
export function isValidParentKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length >= ELTERN_SCHLUESSEL_MIN_LAENGE && /^[\x21-\x7e]+$/.test(value);
}

/** Pseudonym einer Geräte-ID: HMAC-SHA-256 mit dem Schlüssel des Servers (hex, 64 Zeichen). */
export function pseudonymFor(key: string, deviceId: string): string {
  return crypto.createHmac('sha256', key).update(`kunibert-eltern\0${deviceId}`, 'utf8').digest('hex');
}

const HEX64 = /^[0-9a-f]{64}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Version des Elterntexts: kurz, ohne Sonderzeichen (siehe ELTERNTEXT_VERSION in eltern.ts). */
export const TEXT_VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isPath(value: unknown): value is ConsentPath {
  return value === 'geraet' || value === 'betreiber';
}

function parseEntry(value: unknown): StoredParentEntry | null {
  if (!isRecord(value)) return null;
  const { einwilligung, schlafmodus, ruhezeiten, elternTokens } = value;
  let consent: StoredConsent | null = null;
  if (einwilligung !== null) {
    if (!isRecord(einwilligung)) return null;
    const { erteilt, zeitpunkt, elterntextVersion, weg } = einwilligung;
    if (typeof erteilt !== 'boolean' || !isIsoTime(zeitpunkt) || !isPath(weg)) return null;
    if (typeof elterntextVersion !== 'string' || !TEXT_VERSION_RE.test(elterntextVersion)) return null;
    consent = { erteilt, zeitpunkt, elterntextVersion, weg };
  }
  if (typeof schlafmodus !== 'boolean') return null;
  let quiet: { von: string; bis: string } | null = null;
  if (ruhezeiten !== null) {
    if (!isRecord(ruhezeiten)) return null;
    const { von, bis } = ruhezeiten;
    if (typeof von !== 'string' || typeof bis !== 'string' || !TIME_RE.test(von) || !TIME_RE.test(bis)) return null;
    quiet = { von, bis };
  }
  if (!Array.isArray(elternTokens) || elternTokens.length > 20) return null;
  const tokens: StoredParentToken[] = [];
  for (const t of elternTokens) {
    if (!isRecord(t)) return null;
    const { sha256, seit, weg } = t;
    if (typeof sha256 !== 'string' || !HEX64.test(sha256) || !isIsoTime(seit) || !isPath(weg)) return null;
    tokens.push({ sha256, seit, weg });
  }
  return { einwilligung: consent, schlafmodus, ruhezeiten: quiet, elternTokens: tokens };
}

/**
 * Prüft den Inhalt der Datei streng. Ein einziger ungültiger Eintrag macht die ganze Datei ungültig:
 * Der Server startet dann nicht (fail-closed), statt Widerrufe oder Ruhezeiten still zu verlieren.
 */
export function parseParentStateFile(text: string): Map<string, StoredParentEntry> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Ohne die Meldung von JSON.parse: Sie kann einen Ausschnitt des Inhalts enthalten.
    throw new ParentStateFileError('kein_json');
  }
  if (!isRecord(data) || data.format !== ELTERN_DATEI_FORMAT || !isRecord(data.geraete)) {
    throw new ParentStateFileError('format');
  }
  const entries = new Map<string, StoredParentEntry>();
  for (const [pseudonym, value] of Object.entries(data.geraete)) {
    const entry = HEX64.test(pseudonym) ? parseEntry(value) : null;
    if (!entry) throw new ParentStateFileError('eintrag');
    entries.set(pseudonym, entry);
  }
  return entries;
}

export function serializeParentState(entries: Map<string, StoredParentEntry>): string {
  const geraete: Record<string, StoredParentEntry> = {};
  for (const pseudonym of Array.from(entries.keys()).sort()) geraete[pseudonym] = entries.get(pseudonym)!;
  return `${JSON.stringify({ format: ELTERN_DATEI_FORMAT, geraete }, null, 1)}\n`;
}

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(code) ? code : 'unbekannt';
}

/** Datei und Schlüssel der Eltern-Steuerung. Alles synchron: Die Datei ist klein, Änderungen sind selten. */
export class ParentStateFile {
  constructor(
    public readonly filePath: string,
    private readonly key: string
  ) {
    if (!isValidParentKey(key)) throw new Error('KUNIBERT_ELTERN_SCHLUESSEL ist zu kurz oder ungültig.');
  }

  public pseudonym(deviceId: string): string {
    return pseudonymFor(this.key, deviceId);
  }

  /** Liest die Datei. Fehlt sie, gibt es noch nichts (erster Start). Sonst wirft jeder Fehler. */
  public read(): Map<string, StoredParentEntry> {
    let text: string;
    try {
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return new Map();
      throw new ParentStateFileError(errorCode(err));
    }
    return parseParentStateFile(text);
  }

  /** Schreibt den ganzen Stand: neue Datei mit Rechten 600, auf die Platte bringen, dann umbenennen. */
  public write(entries: Map<string, StoredParentEntry>): void {
    const data = serializeParentState(entries);
    const tmp = `${this.filePath}.neu`;
    try {
      fs.rmSync(tmp, { force: true });
      const fd = fs.openSync(tmp, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, data, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // Aufräumen ist nur ein Versuch.
      }
      throw err;
    }
    // Damit auch das Umbenennen einen Stromausfall übersteht (nur ein Versuch, nicht überall möglich).
    try {
      const dir = fs.openSync(path.dirname(this.filePath), 'r');
      try {
        fs.fsyncSync(dir);
      } finally {
        fs.closeSync(dir);
      }
    } catch {
      // ohne
    }
  }
}
