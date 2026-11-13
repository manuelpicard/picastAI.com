import crypto from 'crypto';

/**
 * Eltern-Steuerung je Gerät (Server-Teil der Eltern-App, „PR A“).
 *
 * - Kopplung: Das Gerät fordert einen sechsstelligen Code an und spricht ihn. Die Eltern geben
 *   ihn ein und bekommen ein Eltern-Token (im Cookie). Der Server speichert nur den SHA-256-Hash.
 * - Einwilligung: erteilt oder nicht. Gespeichert wird nur der aktuelle Stand mit Zeitpunkt,
 *   kein Verlauf.
 * - Schlafmodus und Ruhezeiten: In dieser Zeit antwortet Kunibert nur mit einem festen Satz.
 *
 * Vorläufig liegt alles nur im Arbeitsspeicher. Nach einem Neustart des Servers müssen die
 * Eltern neu koppeln und neu einwilligen. Es gibt keinen Verlauf, keine Mitschriften und keine
 * Statistik je Kind.
 */

/** Gültigkeit eines Kopplungscodes. */
export const PAIRING_CODE_TTL_SECONDS = 10 * 60;
/** Höchstens so viele Eltern-Tokens je Gerät; das älteste fällt heraus. */
export const MAX_PARENT_TOKENS_PER_DEVICE = 5;
/** Zeitzone für Ruhezeiten (vorläufig fest). */
export const QUIET_HOURS_TIME_ZONE = 'Europe/Berlin';

export interface QuietHours {
  /** Beginn "HH:MM" (24 Stunden). */
  von: string;
  /** Ende "HH:MM"; liegt es vor dem Beginn, gehen die Ruhezeiten über Mitternacht. */
  bis: string;
}

export interface ParentSettings {
  einwilligung: { erteilt: boolean; zeitpunkt: string | null };
  schlafmodus: boolean;
  ruhezeiten: QuietHours | null;
}

/** Warum ein Gerät gerade nicht antworten darf. */
export type BlockReason = 'einwilligung' | 'schlaf' | null;

interface DeviceControls {
  consentAt: number | null;
  sleep: boolean;
  quietHours: QuietHours | null;
}

interface PairingCode {
  deviceId: string;
  expiresMs: number;
}

interface ParentToken {
  deviceId: string;
  createdMs: number;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minuten seit Mitternacht in der angegebenen Zeitzone. */
export function localMinutes(date: Date, timeZone: string = QUIET_HOURS_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** Liegt `date` in den Ruhezeiten? Beginn zählt dazu, Ende nicht. Gleicher Beginn und Ende: keine Ruhezeit. */
export function inQuietHours(quiet: QuietHours | null, date: Date, timeZone: string = QUIET_HOURS_TIME_ZONE): boolean {
  if (!quiet) return false;
  const start = minutesOf(quiet.von);
  const end = minutesOf(quiet.bis);
  if (start === end) return false;
  const now = localMinutes(date, timeZone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export class ParentControls {
  private controls = new Map<string, DeviceControls>();
  private codes = new Map<string, PairingCode>();
  private tokens = new Map<string, ParentToken>();

  constructor(private now: () => number = Date.now) {}

  private purgeCodes(): void {
    const nowMs = this.now();
    for (const [code, entry] of this.codes.entries()) {
      if (entry.expiresMs <= nowMs) this.codes.delete(code);
    }
  }

  private controlsFor(deviceId: string): DeviceControls {
    let entry = this.controls.get(deviceId);
    if (!entry) {
      entry = { consentAt: null, sleep: false, quietHours: null };
      this.controls.set(deviceId, entry);
    }
    return entry;
  }

  /** Neuer Kopplungscode für das Gerät. Ein älterer Code desselben Geräts verfällt. */
  public createPairingCode(deviceId: string): { code: string; expiresInSeconds: number } {
    this.purgeCodes();
    for (const [code, entry] of this.codes.entries()) {
      if (entry.deviceId === deviceId) this.codes.delete(code);
    }
    let code = '';
    do {
      code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    } while (this.codes.has(code));
    this.codes.set(code, { deviceId, expiresMs: this.now() + PAIRING_CODE_TTL_SECONDS * 1000 });
    return { code, expiresInSeconds: PAIRING_CODE_TTL_SECONDS };
  }

  /**
   * Löst einen Kopplungscode ein (nur einmal). Liefert das Eltern-Token im Klartext genau
   * einmal zurück; gespeichert wird nur sein Hash.
   */
  public redeemPairingCode(code: unknown): { deviceId: string; token: string } | null {
    this.purgeCodes();
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const entry = this.codes.get(code);
    if (!entry) return null;
    this.codes.delete(code);

    const own = Array.from(this.tokens.entries())
      .filter(([, t]) => t.deviceId === entry.deviceId)
      .sort((a, b) => a[1].createdMs - b[1].createdMs);
    while (own.length >= MAX_PARENT_TOKENS_PER_DEVICE) {
      const oldest = own.shift();
      if (oldest) this.tokens.delete(oldest[0]);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    this.tokens.set(hashToken(token), { deviceId: entry.deviceId, createdMs: this.now() });
    return { deviceId: entry.deviceId, token };
  }

  /** Gerät zu einem Eltern-Token oder null. */
  public deviceForToken(token: unknown): string | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    return this.tokens.get(hashToken(token))?.deviceId ?? null;
  }

  public settings(deviceId: string): ParentSettings {
    const c = this.controls.get(deviceId);
    return {
      einwilligung: {
        erteilt: Boolean(c?.consentAt),
        zeitpunkt: c?.consentAt ? new Date(c.consentAt).toISOString() : null,
      },
      schlafmodus: Boolean(c?.sleep),
      ruhezeiten: c?.quietHours ? { ...c.quietHours } : null,
    };
  }

  public grantConsent(deviceId: string): void {
    this.controlsFor(deviceId).consentAt = this.now();
  }

  public revokeConsent(deviceId: string): void {
    const c = this.controls.get(deviceId);
    if (c) c.consentAt = null;
  }

  public hasConsent(deviceId: string): boolean {
    return Boolean(this.controls.get(deviceId)?.consentAt);
  }

  public setSleep(deviceId: string, sleep: boolean): void {
    this.controlsFor(deviceId).sleep = sleep;
  }

  /** Setzt die Ruhezeiten (null: keine). Wirft bei ungültiger Uhrzeit. */
  public setQuietHours(deviceId: string, quiet: QuietHours | null): void {
    if (quiet !== null && (!isValidTime(quiet.von) || !isValidTime(quiet.bis))) {
      throw new Error('invalid_quiet_hours');
    }
    this.controlsFor(deviceId).quietHours = quiet ? { von: quiet.von, bis: quiet.bis } : null;
  }

  /**
   * Darf das Gerät jetzt antworten? `requireConsent` ist im Betrieb immer an.
   * Die fehlende Einwilligung geht vor: dann gilt nichts anderes.
   */
  public blockReason(deviceId: string, requireConsent: boolean, date: Date = new Date(this.now())): BlockReason {
    if (requireConsent && !this.hasConsent(deviceId)) return 'einwilligung';
    const c = this.controls.get(deviceId);
    if (c?.sleep || inQuietHours(c?.quietHours ?? null, date)) return 'schlaf';
    return null;
  }

  /** Vergisst alles zu einem Gerät: Einwilligung, Einstellungen, Codes und Eltern-Tokens. */
  public forgetDevice(deviceId: string): void {
    this.controls.delete(deviceId);
    for (const [code, entry] of this.codes.entries()) {
      if (entry.deviceId === deviceId) this.codes.delete(code);
    }
    for (const [hash, entry] of this.tokens.entries()) {
      if (entry.deviceId === deviceId) this.tokens.delete(hash);
    }
  }

  /** Nur Zahlen, für /api/status. */
  public get counts(): { geraete: number; codes: number; elternTokens: number } {
    this.purgeCodes();
    return { geraete: this.controls.size, codes: this.codes.size, elternTokens: this.tokens.size };
  }
}

// ------------------------------------------------------------
// Feste Sätze, die das Kind hört (ohne Spracherkennung und ohne Sprachmodell)
// ------------------------------------------------------------

/** Ohne Einwilligung der Eltern. */
export const CONSENT_MISSING_DE =
  'Hallo, ich bin Ritter Kunibert! Bevor wir uns unterhalten, müssen mich deine Eltern einmal einrichten. Bitte sag ihnen Bescheid.';

/** Im Schlafmodus und in den Ruhezeiten. */
export const SLEEPING_DE = 'Psst! Ritter Kunibert schläft gerade. Wir hören uns später wieder.';

const DIGIT_WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];

/** Sprechtext für den Kopplungscode: jede Ziffer als Wort, der Code zweimal. */
export function pairingCodeSpeech(code: string): string {
  const spoken = code.split('').map((d) => DIGIT_WORDS[Number(d)]).join(', ');
  return `Hier ist der Code für deine Eltern: ${spoken}. Noch einmal: ${spoken}.`;
}
