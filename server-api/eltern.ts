import crypto from 'crypto';
import { MAX_PARENT_TOKENS_PER_DEVICE, type ConsentChangePath, type ConsentPath, type ParentStateFile, type StoredParentEntry } from './eltern-datei.js';

export type { ConsentChangePath, ConsentPath } from './eltern-datei.js';
export { MAX_PARENT_TOKENS_PER_DEVICE } from './eltern-datei.js';

/**
 * Eltern-Steuerung je Gerät (Server-Teil der Eltern-App, „PR A“).
 *
 * - Kopplung: Das Gerät fordert einen sechsstelligen Code an und spricht ihn. Die Eltern geben
 *   ihn ein und bekommen ein Eltern-Token (im Cookie). Der Server speichert nur den SHA-256-Hash.
 * - Einwilligung: erteilt oder widerrufen. Gespeichert wird nur der letzte Stand mit Zeitpunkt,
 *   Version des Elterntexts und Weg der Kopplung, kein Verlauf.
 * - Schlafmodus und Ruhezeiten: In dieser Zeit antwortet Kunibert nur mit einem festen Satz.
 *
 * Dauerhaft (seit 23.11.2026, Punkt E2): Mit KUNIBERT_ELTERN_DATEI und KUNIBERT_ELTERN_SCHLUESSEL
 * übersteht all das einen Neustart (server-api/eltern-datei.ts; je Gerät nur ein Pseudonym). Nur die
 * Kopplungscodes (10 Minuten gültig) bleiben im Arbeitsspeicher. Ohne die beiden Werte liegt alles
 * nur im Arbeitsspeicher: Nach einem Neustart müssen die Eltern neu koppeln und neu einwilligen.
 * Es gibt keinen Verlauf, keine Mitschriften und keine Statistik je Kind.
 */

/**
 * Version des Elterntexts, der zur Einwilligung gehört; sie steht bei jeder Einwilligung mit in der
 * Datei. "0": Es gibt noch keinen Elterntext (Punkt I3), es testen nur Erwachsene. Ändert sich der
 * Text (Seite /eltern, Punkt D2), steigt die Version. Vorläufig zählt eine Einwilligung unabhängig
 * von ihrer Version (offen: neu einwilligen lassen bei einem neuen Text).
 */
export const ELTERNTEXT_VERSION = '0';

/** Gültigkeit eines Kopplungscodes. */
export const PAIRING_CODE_TTL_SECONDS = 10 * 60;
/** Zeitzone für Ruhezeiten (vorläufig fest). */
export const QUIET_HOURS_TIME_ZONE = 'Europe/Berlin';

export interface QuietHours {
  /** Beginn "HH:MM" (24 Stunden). */
  von: string;
  /** Ende "HH:MM"; liegt es vor dem Beginn, gehen die Ruhezeiten über Mitternacht. */
  bis: string;
}

export interface ParentSettings {
  /** Letzter Stand: `zeitpunkt` ist der Zeitpunkt der Erteilung oder des Widerrufs; alles null, wenn nie entschieden. */
  einwilligung: { erteilt: boolean; zeitpunkt: string | null; elterntextVersion: string | null; weg: ConsentChangePath | null };
  schlafmodus: boolean;
  ruhezeiten: QuietHours | null;
}

/** Warum ein Gerät gerade nicht antworten darf. */
export type BlockReason = 'einwilligung' | 'schlaf' | null;

interface ConsentRecord {
  erteilt: boolean;
  atMs: number;
  elterntextVersion: string;
  weg: ConsentChangePath;
}

/** Was `load` beim Start vorfand (nur Zahlen, für das Protokoll). */
export interface ParentStateLoad {
  /** Übernommene Geräte. */
  geraete: number;
  /** Gelöschte Einträge ohne angemeldetes Gerät. */
  verworfen: number;
  /** Einträge, die zu keinem Gerät passten und trotzdem bleiben (es passte gar keiner: falscher Schlüssel?). */
  behalten: number;
  /** Einwilligungen, die als widerrufen gelten, weil die Markierung „nicht gespeichert“ da war; sonst null. */
  widerrufen: number | null;
  /** Fehlercode, wenn die Datei beim Start nicht beschreibbar war; dann ruhen alle Einwilligungen. */
  schreibfehler: string | null;
}

interface DeviceControls {
  consent: ConsentRecord | null;
  sleep: boolean;
  quietHours: QuietHours | null;
}

interface PairingCode {
  deviceId: string;
  expiresMs: number;
  weg: ConsentPath;
}

interface ParentToken {
  deviceId: string;
  createdMs: number;
  weg: ConsentPath;
}

/** Eine Änderung ließ sich nicht dauerhaft speichern. Die Meldung enthält keine Geräte-ID. */
export class ParentStateWriteError extends Error {
  constructor(
    public readonly code: string,
    /** Gilt die Änderung trotzdem (bis zum nächsten Neustart)? Einwilligung und Kopplung nie. */
    public readonly inEffect: boolean
  ) {
    super(`Eltern-Steuerung: Speichern fehlgeschlagen (${code}).`);
    this.name = 'ParentStateWriteError';
  }
}

function fileErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(code) ? code : 'unbekannt';
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
  /** Eine Änderung steht noch nicht in der Datei (Speichern schlug fehl); `purge` versucht es erneut. */
  private dirty = false;
  /**
   * Die Datei war beim Start nicht beschreibbar: Dann ruhen alle Einwilligungen, bis das Speichern
   * klappt. Sonst ginge ein Widerruf, den der Server nicht speichern kann, beim nächsten Neustart verloren.
   */
  private suspended = false;
  /** Einträge der Datei ohne passendes Gerät, die bleiben (nur wenn beim Start gar keiner passte). */
  private orphans = new Map<string, StoredParentEntry>();

  constructor(
    private now: () => number = Date.now,
    /** Dauerhafte Ablage (KUNIBERT_ELTERN_DATEI); null = nur Arbeitsspeicher. */
    private readonly file: ParentStateFile | null = null
  ) {}

  /** Übersteht die Eltern-Steuerung einen Neustart? */
  public get persistent(): boolean {
    return this.file !== null;
  }

  /**
   * Lädt den gespeicherten Stand beim Start, bevor der Server Anfragen annimmt. Eine kaputte Datei wirft
   * `ParentStateFileError`: Dann startet der Server nicht. Übernommen werden Einträge, deren Pseudonym zu
   * einem angemeldeten Gerät passt. Die übrigen löscht der Server aus der Datei (zum Beispiel Geräte, die
   * nach dem Neustart nicht mehr angemeldet sind), außer es passt gar keiner: Dann ist wohl der Schlüssel
   * oder die Geräte-ID falsch eingetragen, und die Einträge bleiben als Nachweis (sie gelten aber nicht).
   * Liegt die Markierung „nicht gespeichert“ da, gelten alle Einwilligungen als widerrufen.
   */
  public load(deviceIds: Iterable<string>): ParentStateLoad | null {
    if (!this.file) return null;
    const unsaved = this.file.hasMarker();
    const stored = this.file.read();
    let adopted = 0;
    for (const deviceId of new Set(deviceIds)) {
      const pseudonym = this.file.pseudonym(deviceId);
      const entry = stored.get(pseudonym);
      if (!entry) continue;
      stored.delete(pseudonym);
      this.adopt(deviceId, entry);
      adopted++;
    }
    const kept = adopted === 0 ? stored.size : 0;
    if (kept > 0) this.orphans = stored;

    let revoked: number | null = null;
    if (unsaved) {
      // Beim letzten Lauf ließ sich eine Änderung nicht speichern (Widerruf, Löschen, Einstellungen). Welche,
      // weiß der Server nicht mehr: Lieber alle Einwilligungen widerrufen, als einen Widerruf zu verlieren.
      revoked = 0;
      const atMs = this.now();
      for (const c of this.controls.values()) {
        if (!c.consent?.erteilt) continue;
        c.consent = { erteilt: false, atMs, elterntextVersion: ELTERNTEXT_VERSION, weg: 'server' };
        revoked++;
      }
      for (const entry of this.orphans.values()) {
        if (!entry.einwilligung?.erteilt) continue;
        entry.einwilligung = { erteilt: false, zeitpunkt: new Date(atMs).toISOString(), elterntextVersion: ELTERNTEXT_VERSION, weg: 'server' };
        revoked++;
      }
    }

    // Gleich einmal schreiben: Das löscht Einträge ohne Gerät, hält Widerrufe fest und zeigt beim Start,
    // ob die Datei beschreibbar ist. Ist sie es nicht, startet der Server trotzdem (er meldet es laut);
    // alle Einwilligungen ruhen dann, und Einwilligungen und Kopplungen antworten mit 503.
    let writeError: string | null = null;
    try {
      this.file.write(this.snapshot(this.file));
      this.dirty = false;
      this.file.clearMarker();
    } catch (err) {
      writeError = fileErrorCode(err);
      this.dirty = true;
      this.suspended = true;
    }
    return { geraete: adopted, verworfen: adopted === 0 ? 0 : stored.size, behalten: kept, widerrufen: revoked, schreibfehler: writeError };
  }

  private adopt(deviceId: string, entry: StoredParentEntry): void {
    const consent = entry.einwilligung;
    this.controls.set(deviceId, {
      consent: consent
        ? { erteilt: consent.erteilt, atMs: Date.parse(consent.zeitpunkt), elterntextVersion: consent.elterntextVersion, weg: consent.weg }
        : null,
      sleep: entry.schlafmodus,
      quietHours: entry.ruhezeiten ? { ...entry.ruhezeiten } : null,
    });
    for (const t of entry.elternTokens) {
      this.tokens.set(t.sha256, { deviceId, createdMs: Date.parse(t.seit), weg: t.weg });
    }
  }

  /** Der ganze Stand für die Datei: je Gerät das Pseudonym, ohne Geräte-ID; leere Einträge fallen weg. */
  private snapshot(file: ParentStateFile): Map<string, StoredParentEntry> {
    const entries = new Map<string, StoredParentEntry>();
    const entryFor = (deviceId: string): StoredParentEntry => {
      const pseudonym = file.pseudonym(deviceId);
      let entry = entries.get(pseudonym);
      if (!entry) {
        entry = { einwilligung: null, schlafmodus: false, ruhezeiten: null, elternTokens: [] };
        entries.set(pseudonym, entry);
      }
      return entry;
    };
    for (const [deviceId, c] of this.controls) {
      if (!c.consent && !c.sleep && !c.quietHours) continue;
      const entry = entryFor(deviceId);
      entry.einwilligung = c.consent
        ? { erteilt: c.consent.erteilt, zeitpunkt: new Date(c.consent.atMs).toISOString(), elterntextVersion: c.consent.elterntextVersion, weg: c.consent.weg }
        : null;
      entry.schlafmodus = c.sleep;
      entry.ruhezeiten = c.quietHours ? { ...c.quietHours } : null;
    }
    for (const [sha256, t] of this.tokens) {
      entryFor(t.deviceId).elternTokens.push({ sha256, seit: new Date(t.createdMs).toISOString(), weg: t.weg });
    }
    for (const entry of entries.values()) entry.elternTokens.sort((a, b) => a.seit.localeCompare(b.seit) || a.sha256.localeCompare(b.sha256));
    // Behaltene Einträge ohne Gerät unverändert dazu (siehe load).
    for (const [pseudonym, entry] of this.orphans) {
      if (!entries.has(pseudonym)) entries.set(pseudonym, entry);
    }
    return entries;
  }

  /**
   * Bekommt ein Gerät neuen Stand, gilt nur noch dieser: Ein behaltener Eintrag mit demselben Pseudonym
   * fällt weg (zum Beispiel ein Gerät, das nach dem Neustart neu angelegt wurde). true, wenn einer wegfiel.
   */
  private claim(deviceId: string): boolean {
    return Boolean(this.file && this.orphans.size > 0 && this.orphans.delete(this.file.pseudonym(deviceId)));
  }

  /**
   * Schreibt den Stand in die Datei. Schlägt das fehl, bleibt die Änderung bei `inEffect` im Speicher
   * (Widerruf, Löschen, Einstellungen: bis zum nächsten Neustart, neuer Versuch alle fünf Minuten).
   * Sonst nimmt `undo` sie zurück (Einwilligung und Kopplung gelten nur, wenn sie gespeichert sind).
   */
  private save(inEffect: boolean, undo?: () => void): void {
    if (!this.file) return;
    try {
      this.file.write(this.snapshot(this.file));
      this.dirty = false;
      this.suspended = false;
      this.file.clearMarker();
    } catch (err) {
      const code = fileErrorCode(err);
      if (inEffect) {
        this.dirty = true;
        // Die Markierung sorgt dafür, dass ein Neustart vor dem nächsten gelungenen Speichern diese
        // Änderung nicht still zurücknimmt: Dann gelten alle Einwilligungen als widerrufen.
        this.file.setMarker();
      } else undo?.();
      // Ohne Geräte-ID, ohne Pfad und ohne Fehlertext.
      console.warn(
        inEffect
          ? `Eltern-Steuerung: Speichern fehlgeschlagen (${code}). Die Änderung gilt bis zum nächsten Neustart; neuer Versuch in fünf Minuten.`
          : `Eltern-Steuerung: Speichern fehlgeschlagen (${code}). Die Änderung gilt nicht.`
      );
      throw new ParentStateWriteError(code, inEffect);
    }
  }

  /** Löscht abgelaufene Kopplungscodes und speichert, was noch nicht in der Datei steht (der Server ruft das regelmäßig auf). */
  public purge(): void {
    this.purgeCodes();
    this.flush();
  }

  /** Speichert, was noch nicht in der Datei steht (beim Aufräumen und beim Beenden). Wirft nie. */
  public flush(): void {
    if (!this.dirty) return;
    try {
      this.save(true);
    } catch {
      // Schon gemeldet; nächster Versuch beim nächsten Aufräumen.
    }
  }

  private purgeCodes(): void {
    const nowMs = this.now();
    for (const [code, entry] of this.codes.entries()) {
      if (entry.expiresMs <= nowMs) this.codes.delete(code);
    }
  }

  private controlsFor(deviceId: string): DeviceControls {
    this.claim(deviceId);
    let entry = this.controls.get(deviceId);
    if (!entry) {
      entry = { consent: null, sleep: false, quietHours: null };
      this.controls.set(deviceId, entry);
    }
    return entry;
  }

  /**
   * Neuer Kopplungscode für das Gerät. Ein älterer Code desselben Geräts verfällt. `weg`: Spricht das
   * Gerät den Code ("geraet") oder bekommt ihn der Betreiber als Text ("betreiber")? Das steht später
   * bei der Einwilligung, die mit dieser Kopplung erteilt wird.
   */
  public createPairingCode(deviceId: string, weg: ConsentPath = 'geraet'): { code: string; expiresInSeconds: number } {
    this.purgeCodes();
    for (const [code, entry] of this.codes.entries()) {
      if (entry.deviceId === deviceId) this.codes.delete(code);
    }
    let code = '';
    do {
      code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    } while (this.codes.has(code));
    this.codes.set(code, { deviceId, expiresMs: this.now() + PAIRING_CODE_TTL_SECONDS * 1000, weg });
    return { code, expiresInSeconds: PAIRING_CODE_TTL_SECONDS };
  }

  /**
   * Löst einen Kopplungscode ein (nur einmal). Liefert das Eltern-Token im Klartext genau
   * einmal zurück; gespeichert wird nur sein Hash. Lässt sich die Kopplung nicht speichern, wirft
   * es `ParentStateWriteError`; dann gilt die Kopplung nicht, und der Code bleibt gültig.
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
    const evicted: Array<[string, ParentToken]> = [];
    while (own.length >= MAX_PARENT_TOKENS_PER_DEVICE) {
      const oldest = own.shift();
      if (oldest) {
        this.tokens.delete(oldest[0]);
        evicted.push(oldest);
      }
    }

    this.claim(entry.deviceId);
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = hashToken(token);
    this.tokens.set(hash, { deviceId: entry.deviceId, createdMs: this.now(), weg: entry.weg });
    this.save(false, () => {
      this.tokens.delete(hash);
      for (const [h, t] of evicted) this.tokens.set(h, t);
      this.codes.set(code, entry);
    });
    return { deviceId: entry.deviceId, token };
  }

  /** Gerät und Weg der Kopplung zu einem Eltern-Token, oder null. */
  public sessionForToken(token: unknown): { deviceId: string; weg: ConsentPath } | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const entry = this.tokens.get(hashToken(token));
    return entry ? { deviceId: entry.deviceId, weg: entry.weg } : null;
  }

  /** Gerät zu einem Eltern-Token oder null. */
  public deviceForToken(token: unknown): string | null {
    return this.sessionForToken(token)?.deviceId ?? null;
  }

  public settings(deviceId: string): ParentSettings {
    const c = this.controls.get(deviceId);
    const consent = c?.consent ?? null;
    return {
      einwilligung: {
        erteilt: Boolean(consent?.erteilt),
        zeitpunkt: consent ? new Date(consent.atMs).toISOString() : null,
        elterntextVersion: consent?.elterntextVersion ?? null,
        weg: consent?.weg ?? null,
      },
      schlafmodus: Boolean(c?.sleep),
      ruhezeiten: c?.quietHours ? { ...c.quietHours } : null,
    };
  }

  private consentRecord(erteilt: boolean, weg: ConsentPath): ConsentRecord {
    return { erteilt, atMs: this.now(), elterntextVersion: ELTERNTEXT_VERSION, weg };
  }

  /**
   * Einwilligung erteilen. `weg`: woher der Kopplungscode des Eltern-Tokens kam. Mit Datei gilt sie erst,
   * wenn sie gespeichert ist; sonst wirft es `ParentStateWriteError`, und es bleibt beim alten Stand.
   */
  public grantConsent(deviceId: string, weg: ConsentPath = 'geraet'): void {
    const c = this.controlsFor(deviceId);
    const previous = c.consent;
    c.consent = this.consentRecord(true, weg);
    this.save(false, () => {
      c.consent = previous;
    });
  }

  /**
   * Einwilligung widerrufen. Gilt sofort, auch wenn das Speichern fehlschlägt (dann wirft es
   * `ParentStateWriteError` mit `inEffect`). Ohne erteilte Einwilligung bleibt der Stand, wie er ist
   * (ein zweiter Widerruf versucht nur, was noch nicht gespeichert ist, erneut zu speichern).
   */
  public revokeConsent(deviceId: string, weg: ConsentPath = 'geraet'): void {
    const c = this.controls.get(deviceId);
    if (c?.consent?.erteilt) c.consent = this.consentRecord(false, weg);
    else if (!this.dirty) return;
    this.save(true);
  }

  /** Gilt die Einwilligung jetzt? Nicht, solange alle Einwilligungen ruhen (Datei beim Start nicht beschreibbar). */
  public hasConsent(deviceId: string): boolean {
    return !this.suspended && Boolean(this.controls.get(deviceId)?.consent?.erteilt);
  }

  public setSleep(deviceId: string, sleep: boolean): void {
    this.updateSettings(deviceId, { schlafmodus: sleep });
  }

  /** Setzt die Ruhezeiten (null: keine). Wirft bei ungültiger Uhrzeit. */
  public setQuietHours(deviceId: string, quiet: QuietHours | null): void {
    this.updateSettings(deviceId, { ruhezeiten: quiet });
  }

  /**
   * Schlafmodus und Ruhezeiten zusammen ändern (ein Speichervorgang). Wirft bei ungültiger Uhrzeit,
   * ohne etwas zu ändern. Schlägt das Speichern fehl, gilt die Änderung bis zum nächsten Neustart.
   */
  public updateSettings(deviceId: string, change: { schlafmodus?: boolean; ruhezeiten?: QuietHours | null }): void {
    const quiet = change.ruhezeiten;
    if (quiet !== undefined && quiet !== null && (!isValidTime(quiet.von) || !isValidTime(quiet.bis))) {
      throw new Error('invalid_quiet_hours');
    }
    const c = this.controlsFor(deviceId);
    if (change.schlafmodus !== undefined) c.sleep = change.schlafmodus;
    if (quiet !== undefined) c.quietHours = quiet ? { von: quiet.von, bis: quiet.bis } : null;
    this.save(true);
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

  /**
   * Vergisst alles zu einem Gerät: Einwilligung, Einstellungen, Codes und Eltern-Tokens, auch in der
   * Datei. Gilt sofort, auch wenn das Speichern fehlschlägt (dann `ParentStateWriteError` mit `inEffect`).
   */
  public forgetDevice(deviceId: string): void {
    const known = this.controls.delete(deviceId);
    const claimed = this.claim(deviceId);
    for (const [code, entry] of this.codes.entries()) {
      if (entry.deviceId === deviceId) this.codes.delete(code);
    }
    let hadTokens = false;
    for (const [hash, entry] of this.tokens.entries()) {
      if (entry.deviceId === deviceId) {
        this.tokens.delete(hash);
        hadTokens = true;
      }
    }
    if (known || claimed || hadTokens || this.dirty) this.save(true);
  }

  /** Nur Zahlen, für /api/status; `dauerhaft`: Übersteht die Eltern-Steuerung einen Neustart? `ungespeichert`: Wartet eine Änderung auf das Speichern? */
  public get counts(): { geraete: number; codes: number; elternTokens: number; dauerhaft: boolean; ungespeichert: boolean } {
    this.purgeCodes();
    return { geraete: this.controls.size, codes: this.codes.size, elternTokens: this.tokens.size, dauerhaft: this.persistent, ungespeichert: this.dirty };
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
