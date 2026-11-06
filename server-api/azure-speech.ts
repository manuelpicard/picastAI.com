// Hilfen für die Sprachausgabe über Azure AI Speech (REST, SSML). Reine Funktionen ohne
// Netzwerk, damit Konfiguration und Tests sie ohne den Rest der Sprachkette nutzen können.

/** Regionen in der EU/EWR (Azure-Kurznamen). Andere Regionen lösen beim Start eine Warnung aus. */
export const AZURE_EU_REGIONS: ReadonlySet<string> = new Set([
  'westeurope',
  'northeurope',
  'germanywestcentral',
  'germanynorth',
  'francecentral',
  'swedencentral',
  'norwayeast',
  'norwaywest',
  'italynorth',
  'polandcentral',
  'spaincentral',
]);

/** Der Rechnername wird aus der Region gebaut, daher nur Kleinbuchstaben und Ziffern zulassen. */
export function isValidAzureRegion(region: string): boolean {
  return /^[a-z][a-z0-9]{2,40}$/.test(region);
}

/** Stimmenname wie `de-DE-ConradNeural` oder `de-de-Florian:DragonHDLatestNeural`; landet im SSML-Attribut. */
export function isValidAzureVoiceName(voice: string): boolean {
  return /^[A-Za-z0-9_:-]{3,80}$/.test(voice);
}

const PROSODY_KEYWORDS = new Set([
  'default', 'x-low', 'low', 'medium', 'high', 'x-high', 'x-slow', 'slow', 'fast', 'x-fast',
]);

/**
 * Wert für `pitch` oder `rate` im SSML: Stichwort (`low`, `slow`), Prozent (`-10%`),
 * Halbtöne (`-2st`), Hertz (`-20Hz`) oder eine Zahl (`0.9` als Tempofaktor). Alles andere
 * wird abgelehnt, damit keine Zeichen ins SSML gelangen.
 */
export function isValidProsodyValue(value: string): boolean {
  return PROSODY_KEYWORDS.has(value) || /^[+-]?\d{1,4}(\.\d{1,2})?(%|Hz|st)?$/.test(value);
}

/** Entfernt Zeichen, die in XML 1.0 nicht vorkommen dürfen (Steuerzeichen außer Tab, Zeilenumbruch). */
function stripInvalidXmlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

export function escapeXml(text: string): string {
  return stripInvalidXmlChars(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface AzureSsmlOptions {
  voice: string;
  /** Leer = unverändert. */
  pitch: string;
  /** Leer = unverändert. */
  rate: string;
}

/**
 * Baut das SSML für eine Anfrage. Der Text (Antwort des Sprachmodells) wird maskiert und
 * kann so keine eigenen SSML-Elemente einschleusen. Stimme, Tonlage und Tempo müssen vorher
 * mit den isValid-Funktionen geprüft sein.
 */
export function buildAzureSsml(text: string, options: AzureSsmlOptions): string {
  const attributes = [
    options.pitch ? ` pitch="${options.pitch}"` : '',
    options.rate ? ` rate="${options.rate}"` : '',
  ].join('');
  const body = escapeXml(text);
  const inner = attributes ? `<prosody${attributes}>${body}</prosody>` : body;
  return `<speak version="1.0" xml:lang="de-DE"><voice name="${options.voice}">${inner}</voice></speak>`;
}

/** Abtastraten, die Azure als rohes PCM liefert (`raw-<n>khz-16bit-mono-pcm`). */
const AZURE_PCM_RATES = [8000, 16000, 24000, 48000];

/** Nimmt die Zielrate direkt, wenn Azure sie liefert; sonst 24 kHz und Umrechnung durch den Server. */
export function pickAzureSampleRate(targetRate: number): number {
  return AZURE_PCM_RATES.includes(targetRate) ? targetRate : 24000;
}

export function azureOutputFormat(sampleRate: number): string {
  return `raw-${sampleRate / 1000}khz-16bit-mono-pcm`;
}

export function azureEndpoint(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export interface AzureTtsFields {
  azureTtsRegion: string;
  azureTtsKey: string | null;
  azureTtsVoice: string;
  azureTtsPitch: string;
  azureTtsRate: string;
}

export interface AzureTtsSettings {
  region: string;
  key: string;
  voice: string;
  /** Leer = unverändert. Ungültige Werte wurden bereits verworfen. */
  pitch: string;
  rate: string;
}

/**
 * Einstellungen für die Sprachausgabe oder null, wenn Region, Schlüssel oder Stimme fehlen
 * bzw. ungültig sind (dann bleibt die Sprachausgabe aus). Ein ungültiger Wert für Tonlage
 * oder Tempo wird ignoriert; der Start warnt davor.
 */
export function usableAzureSettings(fields: AzureTtsFields): AzureTtsSettings | null {
  if (!isValidAzureRegion(fields.azureTtsRegion) || !fields.azureTtsKey || !isValidAzureVoiceName(fields.azureTtsVoice)) {
    return null;
  }
  return {
    region: fields.azureTtsRegion,
    key: fields.azureTtsKey,
    voice: fields.azureTtsVoice,
    pitch: isValidProsodyValue(fields.azureTtsPitch) ? fields.azureTtsPitch : '',
    rate: isValidProsodyValue(fields.azureTtsRate) ? fields.azureTtsRate : '',
  };
}
