// Hörprobe der Sprachausgabe: spricht einen Text durch die echte Sprachkette des Servers (gewählter
// Anbieter, Aufteilung in Sätze, Tempo, Pausen) und schreibt das Ergebnis als WAV-Datei zum Anhören.
//
//   PICASTAI_TTS_PROVIDER=pocket PICASTAI_POCKET_TTS_URL=http://127.0.0.1:8003 npm run sprachprobe -- probe.wav
//
// Einstellungen kommen aus denselben Umgebungsvariablen wie beim Server (PICASTAI_TTS_PROVIDER, PICASTAI_POCKET_TTS_*,
// PICASTAI_GOOGLE_TTS_*, PICASTAI_TTS_*). Schlüssel nur im eigenen Terminal setzen, nie in Dateien oder Chats.
//
// Aufruf: npm run sprachprobe -- [ausgabe.wav] [--datei text.txt | --text "Eigener Text"]
// Ohne Text wird eine kurze Beispielgeschichte mit wörtlicher Rede und zwei Absätzen gesprochen.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, voiceConfigWarnings, type KunibertConfig } from './config.js';
import { decodeWavHeader } from './audio.js';
import { VoicePipeline } from './voice.js';

export const SAMPLE_STORY = [
  'Es war einmal ein mutiger Ritter namens Kunibert. An einem nebligen Morgen ritt er durch den dunklen Wald, als er plötzlich ein leises Brummen hörte. „Wer ist da?“, rief er.',
  'Es blieb still. Zwischen den Bäumen funkelten zwei große Augen. Kunibert holte tief Luft und lächelte. „Keine Angst“, sagte er sanft, „ich tue dir nichts.“',
  'Da trat ein kleiner Bär aus dem Nebel. Er hatte sich verlaufen und zitterte vor Kälte. Kunibert nahm ihn auf sein Pferd, und gemeinsam ritten sie ins Tal, wo schon die ersten Lichter des Dorfes warmgelb leuchteten.',
].join('\n');

export interface SprachprobeArgs {
  output: string;
  text: string;
}

/** Liest die Aufrufparameter; wirft einen Error mit verständlicher Meldung bei falscher Eingabe. */
export function parseSprachprobeArgs(args: string[], readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf8')): SprachprobeArgs {
  let output = 'hoerprobe.wav';
  let text = SAMPLE_STORY;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--text' || arg === '--datei') {
      const value = args[++index];
      if (!value) throw new Error(`${arg} braucht einen Wert`);
      text = arg === '--text' ? value : readFile(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unbekannte Option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) throw new Error('Nur eine Ausgabedatei angeben');
  if (positional[0]) output = positional[0];
  if (!/\.wav$/i.test(output)) throw new Error('Die Ausgabedatei muss auf .wav enden');
  if (!text.trim()) throw new Error('Der Text ist leer');
  return { output, text };
}

/** Gibt den Prozess-Rückgabewert zurück: 0 = Datei geschrieben. */
export async function runSprachprobe(
  args: string[],
  cfg: KunibertConfig,
  log: (message: string) => void = console.log
): Promise<number> {
  let parsed: SprachprobeArgs;
  try {
    parsed = parseSprachprobeArgs(args);
  } catch (error) {
    log(`Fehler: ${(error as Error).message}`);
    return 2;
  }

  for (const warning of voiceConfigWarnings(cfg)) log(`Hinweis: ${warning}`);
  const voice = new VoicePipeline(cfg);
  if (!voice.ttsConfigured) {
    log('Die Sprachausgabe ist nicht konfiguriert (Anbieter, Adresse bzw. Schlüssel und Stimme prüfen).');
    return 1;
  }

  log(`Anbieter: ${cfg.ttsProvider}, ${parsed.text.length} Zeichen`);
  const started = Date.now();
  let wav: Buffer;
  try {
    wav = await voice.synthesize(parsed.text);
  } catch (error) {
    log(`Sprachausgabe fehlgeschlagen: ${(error as Error).message}`);
    return 1;
  }
  const elapsed = (Date.now() - started) / 1000;
  const header = decodeWavHeader(wav);
  const seconds = (wav.length - 44) / 2 / header.sampleRate;
  fs.mkdirSync(path.dirname(path.resolve(parsed.output)), { recursive: true });
  fs.writeFileSync(parsed.output, wav);
  log(`Fertig: ${path.resolve(parsed.output)}`);
  log(`Dauer der Aufnahme ${seconds.toFixed(1)} s, erzeugt in ${elapsed.toFixed(1)} s (${(seconds / Math.max(elapsed, 0.001)).toFixed(1)}-fache Echtzeit)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSprachprobe(process.argv.slice(2), config).then((code) => {
    process.exitCode = code;
  });
}
