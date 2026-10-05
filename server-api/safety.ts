// Deterministische Sicherheitsweiche nach den Kunibert-Schutzvorgaben

const PATTERNS: RegExp[] = [
  /\bich (will|möchte|mag) (nicht mehr leben|sterben|tot sein)/i,
  /\b(mich|mir) (selbst )?(umbringen|weh ?tun|wehtun|verletzen|ritzen)/i,
  /\bich ritze\b/i,
  /\bnicht mehr (leben|da sein) (will|möchte)/i,
  /\b(er|sie|der|die|mama|papa|mein \w+|meine \w+|jemand) (schlägt|haut|tritt|würgt) mich/i,
  /\b(hat|haben) mich (geschlagen|gehauen|getreten|gewürgt|eingesperrt)/i,
  /\b(hat|haben|will|wollte) mich (an ?gefasst|anfassen|berührt) /i,
  /\bfasst mich an\b/i,
  /\b(soll|darf) (es )?(niemandem|keinem) (sagen|erzählen|verraten)/i,
  /\bich (blute|kann nicht atmen|kriege keine luft|bekomme keine luft)/i,
  /\b(es|hier) brennt\b/i,
  /\bfeuer (in der|im) (wohnung|haus|zimmer|küche)/i,
  /\b(mama|papa|oma|opa|jemand|er|sie) (wacht nicht auf|ist umgefallen|bewegt sich nicht)/i,
  /\bich (habe|hab) (mich )?verlaufen/i,
  /\bich habe (tabletten|medikamente|putzmittel) (genommen|getrunken|gegessen)/i,
];

export function normalize(text: string): string {
  const norm = (text || '').normalize('NFC').toLowerCase();
  const cleaned = norm.replace(/[^\wäöüß ]+/gi, ' ');
  return cleaned.replace(/\s+/g, ' ').trim() + ' ';
}

export function screen(transcript: string): boolean {
  if (!transcript) return false;
  const normalized = normalize(transcript);
  return PATTERNS.some((pattern) => pattern.test(normalized));
}

export const SAFETY_RESPONSE_DE =
  'Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein. ' +
  'Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie, ' +
  'einer Lehrerin, einem Lehrer oder einer Nachbarin. ' +
  'Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die Eins Eins Zwei an. ' +
  'Du kannst auch bei der Nummer gegen Kummer anrufen: Eins Eins Sechs, Eins Eins Eins. ' +
  'Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag.';

export const UNCLEAR_RESPONSE_DE =
  'Das habe ich leider nicht richtig verstanden. ' +
  'Halte die Sprechtaste gedrückt, sag es noch einmal, und lass sie dann los.';

export const ERROR_RESPONSE_DE =
  'Oh, da ist gerade etwas schiefgegangen. Versuch es gleich noch einmal.';
