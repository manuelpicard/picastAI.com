/**
 * Schutz vor dem Raten von Kopplungscodes (`POST /v1/eltern/koppeln`, Punkt D2, Teil 1).
 * Vorläufig festgelegt am 23.11.2026, 13:50 (Wochen-Autopilot).
 *
 * Ein Kopplungscode hat sechs Ziffern (eine Million Möglichkeiten) und gilt 10 Minuten. Der Schutz
 * hat zwei Stufen:
 *
 * - Je Absender: Nach dem dritten Fehlversuch wartet ein Absender 2 Sekunden, nach jedem weiteren
 *   doppelt so lange, höchstens 10 Minuten. Wer sich vertippt, kann also gleich weitermachen; wer
 *   rät, wird schnell langsam. Es gibt keine harte Sperre: Ein Absender bremst nur sich selbst.
 *   Je 10 Minuten ohne Fehlversuch zählt einer weniger: Wer sich einmal vertippt, ist nach 10 Minuten
 *   vergessen; wer rät und dann Pause macht, fängt nicht wieder bei null an.
 * - Insgesamt: höchstens 200 Fehlversuche in 10 Minuten, von allen Absendern zusammen (Angreifer mit
 *   vielen Adressen). Darüber darf ein Absender nur noch den Code eines Geräts einlösen, das in den
 *   letzten 10 Minuten aus seinem Netz einen Code geholt hat: Eltern, die zu Hause beim Gerät stehen,
 *   sperrt so niemand aus, und ein eigenes Gerät in vielen Netzen hilft nicht beim Raten fremder
 *   Codes. Die übrigen warten, bis die Zahl wieder unter 200 fällt.
 *
 * Absender ist die IPv4-Adresse oder bei IPv6 das Netz aus den ersten 56 Bit (oft ein Anschluss;
 * sonst hätte ein einzelner Haushalt Milliarden Adressen). Im Mobilfunk und hinter Carrier-NAT teilen
 * sich auch fremde Kunden einen Absender. Hinter Caddy auf demselben Rechner stimmt die Adresse nur mit
 * `PICASTAI_TRUST_PROXY=loopback`; ohne sind alle Absender 127.0.0.1 und teilen sich die Wartezeit.
 *
 * Datenschutz: Im Speicher liegen keine Adressen, nur Pseudonyme (HMAC-SHA-256 mit einem zufälligen
 * Schlüssel, der nur im Arbeitsspeicher liegt und bei jedem Start neu ist), dazu die Zahl der
 * Fehlversuche, der Zeitpunkt des letzten und für die Netze der Geräte die Geräte-ID. Mit dem Schlüssel
 * ließen sich die Pseudonyme durch Ausprobieren zurückrechnen: Es ist Pseudonymisierung, keine
 * Anonymisierung. Nichts davon kommt ins Protokoll oder in eine Datei.
 */
import crypto from 'node:crypto';
import net from 'node:net';
import { performance } from 'node:perf_hooks';

export interface PairingGuardOptions {
  /** Ab diesem Fehlversuch beginnt die Wartezeit. */
  waitFromFailure: number;
  /** Wartezeit nach dem Fehlversuch `waitFromFailure`; danach doppelt sie sich mit jedem weiteren. */
  firstWaitMs: number;
  /** Längste Wartezeit je Absender. */
  maxWaitMs: number;
  /** Je so viel Zeit ohne Fehlversuch zählt ein Fehlversuch weniger; bei null ist der Absender vergessen. */
  decayMs: number;
  /** Höchstens so viele Fehlversuche aller Absender zusammen im Zeitfenster. */
  maxFailuresAll: number;
  windowAllMs: number;
}

export const PAIRING_GUARD_DEFAULTS: PairingGuardOptions = {
  waitFromFailure: 3,
  firstWaitMs: 2_000,
  maxWaitMs: 10 * 60_000,
  decayMs: 10 * 60_000,
  maxFailuresAll: 200,
  windowAllMs: 10 * 60_000,
};

/** Präfixlänge, die bei IPv6 als ein Absender gilt. */
export const IPV6_SENDER_PREFIX_BITS = 56;

/**
 * `allowed: false`: `retryAfterSeconds` (mindestens 1) und `grund` sagen, wie lange und warum.
 * `onlyDevices`: Über der Grenze für alle darf der Absender nur den Code dieser Geräte einlösen; ein
 * anderer Code zählt wie ein falscher (und bleibt gültig). `null`: jeder Code.
 */
export interface PairingVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
  grund: 'absender' | 'insgesamt' | null;
  onlyDevices: string[] | null;
}

const ALLOWED: PairingVerdict = Object.freeze({ allowed: true, retryAfterSeconds: 0, grund: null, onlyDevices: null });

interface SenderEntry {
  failures: number;
  lastFailureMs: number;
}

/** Die acht 16-Bit-Gruppen einer gültigen IPv6-Adresse (ohne Zone), auch mit eingebetteter IPv4-Adresse. */
function ipv6Groups(address: string): number[] | null {
  if (!net.isIPv6(address)) return null;
  let text = address;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const zeros = halves.length > 1 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array<string>(Math.max(0, zeros)).fill('0'), ...tail].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

/**
 * Das Netz, das als ein Absender zählt: `v4:<Adresse>` oder `v6:<die ersten 56 Bit>`. IPv4 in IPv6
 * (`::ffff:192.0.2.1`) zählt als IPv4. Eine Zone (`%eth0`) zählt nicht mit.
 */
export function senderNetwork(address: string | undefined | null): string {
  const text = (address ?? '').trim().split('%')[0];
  if (net.isIPv4(text)) return `v4:${text}`;
  const groups = ipv6Groups(text);
  if (!groups) return 'unbekannt';
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return `v4:${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }
  const fullGroups = Math.floor(IPV6_SENDER_PREFIX_BITS / 16);
  const restBits = IPV6_SENDER_PREFIX_BITS % 16;
  const prefix = groups.slice(0, fullGroups).map((group) => group.toString(16));
  if (restBits) prefix.push((groups[fullGroups] >> (16 - restBits)).toString(16));
  return `v6:${prefix.join(':')}/${IPV6_SENDER_PREFIX_BITS}`;
}

/** Kommt die Verbindung von diesem Rechner (127.0.0.0/8, ::1, auch als IPv4 in IPv6)? */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  const network = senderNetwork(address);
  if (network.startsWith('v4:')) return network.startsWith('v4:127.');
  const groups = ipv6Groups((address ?? '').trim().split('%')[0]);
  return !!groups && groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
}

function secondsUntil(targetMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((targetMs - nowMs) / 1000));
}

export class PairingGuard {
  private readonly options: PairingGuardOptions;
  /** Nur im Arbeitsspeicher, bei jedem Start neu: Ohne ihn lassen sich die Pseudonyme nicht auf Adressen zurückführen. */
  private readonly secret = crypto.randomBytes(32);
  private senders = new Map<string, SenderEntry>();
  /** Zeitpunkte der letzten Fehlversuche aller Absender, höchstens `maxFailuresAll` (die ältesten fallen heraus). */
  private failuresAll: number[] = [];
  /** Netze von Geräten, die gerade einen Code geholt haben (Pseudonym des Netzes → Geräte-ID → gültig bis). */
  private deviceNetworks = new Map<string, Map<string, number>>();

  /** `now`: Millisekunden einer Uhr, die nicht springt (Standard: seit dem Start des Prozesses). */
  constructor(private readonly now: () => number = () => performance.now(), options: Partial<PairingGuardOptions> = {}) {
    this.options = { ...PAIRING_GUARD_DEFAULTS, ...options };
  }

  private keyFor(address: string | undefined | null): string {
    return crypto.createHmac('sha256', this.secret).update(senderNetwork(address)).digest('base64url').slice(0, 22);
  }

  /** Wartezeit nach `failures` Fehlversuchen in Folge. */
  public waitAfter(failures: number): number {
    const { waitFromFailure, firstWaitMs, maxWaitMs } = this.options;
    if (failures < waitFromFailure) return 0;
    // Ab 2^30 wäre die Zahl ohnehin weit über der Obergrenze.
    return Math.min(maxWaitMs, firstWaitMs * 2 ** Math.min(30, failures - waitFromFailure));
  }

  /** Fehlversuche, die jetzt noch zählen (je `decayMs` ohne Fehlversuch einer weniger). */
  private remainingFailures(entry: SenderEntry, nowMs: number): number {
    return entry.failures - Math.floor(Math.max(0, nowMs - entry.lastFailureMs) / this.options.decayMs);
  }

  private liveEntry(key: string, nowMs: number): SenderEntry | null {
    const entry = this.senders.get(key);
    if (!entry) return null;
    if (this.remainingFailures(entry, nowMs) <= 0) {
      this.senders.delete(key);
      return null;
    }
    return entry;
  }

  private exhaustedAll(nowMs: number): boolean {
    return this.failuresAll.length >= this.options.maxFailuresAll && nowMs - this.failuresAll[0] < this.options.windowAllMs;
  }

  /** Geräte, die aus diesem Netz gerade einen gültigen Code geholt haben. */
  private devicesInNetwork(key: string, nowMs: number): string[] {
    const devices = this.deviceNetworks.get(key);
    if (!devices) return [];
    return [...devices].filter(([, until]) => until > nowMs).map(([deviceId]) => deviceId);
  }

  /** Vor dem Prüfen des Codes: Darf dieser Absender jetzt einen Code versuchen? */
  public check(address: string | undefined | null): PairingVerdict {
    const nowMs = this.now();
    const key = this.keyFor(address);
    const entry = this.liveEntry(key, nowMs);
    if (entry) {
      // Die Wartezeit läuft ab dem letzten Fehlversuch, mit der Zahl von damals.
      const readyMs = entry.lastFailureMs + this.waitAfter(entry.failures);
      if (readyMs > nowMs) {
        return { allowed: false, retryAfterSeconds: secondsUntil(readyMs, nowMs), grund: 'absender', onlyDevices: null };
      }
    }
    if (this.exhaustedAll(nowMs)) {
      const devices = this.devicesInNetwork(key, nowMs);
      if (devices.length) return { ...ALLOWED, onlyDevices: devices };
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil(this.failuresAll[0] + this.options.windowAllMs, nowMs),
        grund: 'insgesamt',
        onlyDevices: null,
      };
    }
    return ALLOWED;
  }

  /** Ein falscher, abgelaufener oder schon benutzter Code. */
  public recordFailure(address: string | undefined | null): void {
    const nowMs = this.now();
    const key = this.keyFor(address);
    const entry = this.liveEntry(key, nowMs);
    this.senders.set(key, { failures: (entry ? this.remainingFailures(entry, nowMs) : 0) + 1, lastFailureMs: nowMs });
    this.failuresAll.push(nowMs);
    if (this.failuresAll.length > this.options.maxFailuresAll) this.failuresAll.shift();
  }

  /** Ein Gerät hat einen Code geholt: Aus seinem Netz darf man diesen Code so lange auch über der Grenze für alle einlösen. */
  public noteDeviceNetwork(address: string | undefined | null, deviceId: string, validForMs: number): void {
    const key = this.keyFor(address);
    const devices = this.deviceNetworks.get(key) ?? new Map<string, number>();
    devices.set(deviceId, this.now() + validForMs);
    this.deviceNetworks.set(key, devices);
  }

  /** Vergisst alte Absender, alte Fehlversuche und abgelaufene Gerätenetze (der Server ruft das regelmäßig auf). */
  public purge(): void {
    const nowMs = this.now();
    for (const [key, entry] of this.senders) {
      if (this.remainingFailures(entry, nowMs) <= 0) this.senders.delete(key);
    }
    this.failuresAll = this.failuresAll.filter((t) => nowMs - t < this.options.windowAllMs);
    for (const [key, devices] of this.deviceNetworks) {
      for (const [deviceId, until] of devices) if (until <= nowMs) devices.delete(deviceId);
      if (!devices.size) this.deviceNetworks.delete(key);
    }
  }

  /** Nur Zahlen (für `GET /api/status` und Tests): keine Adressen, keine Pseudonyme. */
  public get counts(): { absender: number; fehlversucheInsgesamt: number; geraeteNetze: number } {
    const nowMs = this.now();
    return {
      absender: [...this.senders.values()].filter((entry) => this.remainingFailures(entry, nowMs) > 0).length,
      fehlversucheInsgesamt: this.failuresAll.filter((t) => nowMs - t < this.options.windowAllMs).length,
      geraeteNetze: [...this.deviceNetworks.values()].filter((devices) => [...devices.values()].some((until) => until > nowMs)).length,
    };
  }
}
