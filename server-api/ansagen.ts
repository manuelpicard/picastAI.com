// Erzeugt die festen Sprachdateien für den Pi (Vorstellung und Zwischensätze) über die gerade
// konfigurierte Sprachausgabe:
//
//   npm run ansagen -- <zielordner>
//
// Die Texte stehen in deploy/ansagen.json, die Dateinamen sind der Vertrag mit
// pi-client/rueckmeldung.py. Das Skript benutzt nur die bestehende Sprachausgabe
// (VoicePipeline.synthesize) und ändert keinen Anbieter. Die WAV-Dateien selbst liegen nicht im Repo.
//
// Alles oder nichts: Es wird erst geschrieben, wenn alle Dateien erfolgreich erzeugt wurden.
// Die Ausgabe nennt Dateinamen und Längen, nie die gesprochenen Texte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeWavHeader } from './audio.js';
import { loadConfig } from './config.js';
import { VoicePipeline } from './voice.js';

export interface Ansage {
  datei: string;
  text: string;
}

/**
 * Feste Dateinamen in der Reihenfolge der Liste. Dieselbe Liste steht als ALL_ANNOUNCEMENT_FILES in
 * pi-client/rueckmeldung.py und im Test beider Seiten. Ein Name darf nur an allen Stellen gleichzeitig geändert werden.
 */
export const ERWARTETE_DATEIEN = [
  'willkommen.wav',
  'zwischen-1.wav',
  'zwischen-2.wav',
  'zwischen-3.wav',
  'zwischen-4.wav',
  'zwischen-5.wav',
  'zwischen-6.wav',
  'zwischen-lang.wav',
] as const;

/** Das Format, das der Pi erwartet (KUNIBERT_SAMPLE_RATE, Mono, 16 Bit). */
export const PI_ABTASTRATE = 16_000;

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const STANDARD_LISTE = path.resolve(HIER, '..', 'deploy', 'ansagen.json');
const MAX_TEXT_ZEICHEN = 2_000;

/** Fehler mit einer Meldung, die für Menschen gedacht ist (keine Stapelausgabe nötig). */
export class AnsagenFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnsagenFehler';
  }
}

/** Liest und prüft die Textliste. Es müssen genau die erwarteten Dateien vorkommen, je einmal, mit Text. */
export function loadAnsagenListe(datei: string = STANDARD_LISTE): Ansage[] {
  let roh: unknown;
  try {
    roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (error) {
    throw new AnsagenFehler(`Die Textliste ${datei} ist nicht lesbar (${(error as Error).message.slice(0, 120)}).`);
  }
  const eintraege = (roh as { ansagen?: unknown })?.ansagen;
  if (!Array.isArray(eintraege)) throw new AnsagenFehler(`In ${datei} fehlt die Liste "ansagen".`);

  const nachName = new Map<string, string>();
  for (const eintrag of eintraege as Array<Partial<Ansage>>) {
    const name = eintrag?.datei;
    const text = eintrag?.text;
    if (typeof name !== 'string' || typeof text !== 'string') {
      throw new AnsagenFehler('Jeder Eintrag der Textliste braucht "datei" und "text" als Text.');
    }
    if (nachName.has(name)) throw new AnsagenFehler(`Die Datei ${name} steht mehrfach in der Textliste.`);
    if (!text.trim()) throw new AnsagenFehler(`Der Text für ${name} ist leer.`);
    if (text.length > MAX_TEXT_ZEICHEN) throw new AnsagenFehler(`Der Text für ${name} ist zu lang (über ${MAX_TEXT_ZEICHEN} Zeichen).`);
    nachName.set(name, text.trim());
  }
  const fehlend = ERWARTETE_DATEIEN.filter((name) => !nachName.has(name));
  if (fehlend.length) throw new AnsagenFehler(`In der Textliste fehlen: ${fehlend.join(', ')}.`);
  const unbekannt = [...nachName.keys()].filter((name) => !(ERWARTETE_DATEIEN as readonly string[]).includes(name));
  if (unbekannt.length) {
    throw new AnsagenFehler(`Unbekannte Dateien in der Textliste (der Pi erwartet sie nicht): ${unbekannt.join(', ')}.`);
  }
  return ERWARTETE_DATEIEN.map((name) => ({ datei: name, text: nachName.get(name) as string }));
}

function pruefeFormat(datei: string, wav: Buffer): number {
  let kopf;
  try {
    kopf = decodeWavHeader(wav);
  } catch {
    throw new AnsagenFehler(`${datei}: Die Sprachausgabe lieferte keine gültige WAV-Datei.`);
  }
  if (kopf.channels !== 1 || kopf.bitsPerSample !== 16 || kopf.sampleRate !== PI_ABTASTRATE || wav.length <= 44) {
    throw new AnsagenFehler(
      `${datei}: Die Sprachausgabe lieferte ${kopf.sampleRate} Hz, ${kopf.channels} Kanal, ${kopf.bitsPerSample} Bit. ` +
        `Der Pi braucht ${PI_ABTASTRATE} Hz, Mono, 16 Bit (Einstellung KUNIBERT_AUDIO_SAMPLE_RATE prüfen).`
    );
  }
  return (wav.length - 44) / (PI_ABTASTRATE * 2);
}

export interface ErzeugenOptionen {
  liste: Ansage[];
  zielordner: string;
  /** Die Sprachausgabe: Text hinein, WAV heraus. Im Betrieb ist das VoicePipeline.synthesize. */
  synthesize: (text: string) => Promise<Buffer>;
  /** Zeilen für die Ausgabe (nur Dateinamen und Längen). */
  log?: (zeile: string) => void;
}

/** Erzeugt alle Dateien im Speicher und schreibt sie erst danach (alles oder nichts). Gibt die Dateinamen zurück. */
export async function erzeugeAnsagen({ liste, zielordner, synthesize, log = () => undefined }: ErzeugenOptionen): Promise<string[]> {
  const fertig: Array<{ datei: string; wav: Buffer; sekunden: number }> = [];
  for (const { datei, text } of liste) {
    let wav: Buffer;
    try {
      wav = await synthesize(text);
    } catch (error) {
      // Nur die Meldung des Dienstes, gekürzt. Der Text der Ansage steht nie in der Fehlermeldung.
      const grund = ((error as Error)?.message || 'unbekannter Fehler').replace(text, '[Text]').slice(0, 200);
      throw new AnsagenFehler(`${datei}: Die Sprachausgabe ist fehlgeschlagen (${grund}). Es wurde nichts geschrieben.`);
    }
    fertig.push({ datei, wav, sekunden: pruefeFormat(datei, wav) });
  }

  fs.mkdirSync(zielordner, { recursive: true });
  for (const { datei, wav, sekunden } of fertig) {
    const ziel = path.join(zielordner, datei);
    const temp = `${ziel}.tmp`;
    fs.writeFileSync(temp, wav);
    fs.renameSync(temp, ziel);
    log(`  ${datei}  ${sekunden.toFixed(1)} s`);
  }
  return fertig.map((eintrag) => eintrag.datei);
}

export interface Ausgabe {
  log: (zeile: string) => void;
  error: (zeile: string) => void;
}

export type Synthesizer = { synthesize: (text: string) => Promise<Buffer> } | { fehler: string };

const KEINE_SPRACHAUSGABE =
  'Die Sprachausgabe ist nicht konfiguriert, deshalb kann ich keine Ansagen erzeugen.\n' +
  'Setze die Einstellungen der Sprachausgabe (PICASTAI_TTS_*) in der Umgebung, wie in deploy/EINRICHTUNG.md\n' +
  'und docs/LLM-Anbieter.md beschrieben, und starte den Befehl noch einmal.';

/** Baut die Sprachausgabe aus der Umgebung, so wie der Server es auch tut. */
function sprachausgabeAusUmgebung(): Synthesizer {
  const voice = new VoicePipeline(loadConfig());
  if (!voice.ttsConfigured) return { fehler: KEINE_SPRACHAUSGABE };
  return { synthesize: (text) => voice.synthesize(text) };
}

const HILFE =
  'Aufruf: npm run ansagen -- <zielordner> [--liste <datei>]\n' +
  '  Erzeugt die festen Sprachdateien für den Pi (WAV, 16 kHz, Mono, 16 Bit) aus deploy/ansagen.json\n' +
  '  über die gerade konfigurierte Sprachausgabe. Siehe docs/Ansagen.md.';

/** Der Ablauf des Befehls. Gibt den Rückgabewert zurück (0 = gut). Wirft nie. */
export async function run(
  argumente: string[],
  ausgabe: Ausgabe = { log: (zeile) => console.log(zeile), error: (zeile) => console.error(zeile) },
  baueSprachausgabe: () => Synthesizer = sprachausgabeAusUmgebung
): Promise<number> {
  try {
    if (argumente.includes('-h') || argumente.includes('--help')) {
      ausgabe.log(HILFE);
      return 0;
    }
    let listenDatei = STANDARD_LISTE;
    const ordner: string[] = [];
    for (let i = 0; i < argumente.length; i++) {
      if (argumente[i] === '--liste') {
        listenDatei = path.resolve(argumente[++i] ?? '');
      } else {
        ordner.push(argumente[i]);
      }
    }
    if (ordner.length !== 1) {
      ausgabe.error('Bitte genau einen Zielordner angeben.\n' + HILFE);
      return 1;
    }

    const liste = loadAnsagenListe(listenDatei);
    const sprachausgabe = baueSprachausgabe();
    if ('fehler' in sprachausgabe) {
      ausgabe.error(sprachausgabe.fehler);
      return 1;
    }
    const zielordner = path.resolve(ordner[0]);
    ausgabe.log(`Erzeuge ${liste.length} Ansagen nach ${zielordner} …`);
    const dateien = await erzeugeAnsagen({ liste, zielordner, synthesize: sprachausgabe.synthesize, log: ausgabe.log });
    ausgabe.log(`Fertig: ${dateien.length} Dateien. Wie sie auf den Pi kommen, steht in docs/Ansagen.md.`);
    return 0;
  } catch (error) {
    ausgabe.error(error instanceof AnsagenFehler ? error.message : `Unerwarteter Fehler: ${(error as Error)?.message ?? error}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
