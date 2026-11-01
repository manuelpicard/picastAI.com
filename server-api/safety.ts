// Deterministische Sicherheitsweiche nach den Kunibert-Schutzvorgaben
import { config } from './config.js';

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
  /\bich (habe|hab) (\w+ )?(tabletten|medikamente|pillen|putzmittel|reiniger) (\w+ )?(genommen|getrunken|gegessen|geschluckt|verschluckt)/i,
  // Erweiterungen: weitere Formulierungen derselben Notlagen. Bewusst
  // großzügig: ein Fehlalarm kostet einen Hinweis, eine Lücke ein Kind in Not.
  /\bich (bring|bringe) mich (selbst )?um (?!(den|die|das|dem|meinen|meine|mein)\b)/i,
  /\bich (wäre|wär) (lieber|besser) (tot|nicht (mehr )?(da|hier|geboren))/i,
  /\bich (will|möchte|mag) nicht mehr (da|hier) sein\b/i,
  /\bich (will|möchte) (für )?immer (weg|einschlafen|schlafen)\b/i,
  /\bich (habe|hab|bekomme|bekomm|kriege|krieg) (gerade )?keine luft\b/i,
  /\bich kann (gerade )?(nicht|nicht mehr) atmen\b/i,
  /\bfasst mich (\w+ )?(\w+ )?an\b/i,
  /\bwas \w+ mit mir (macht|machen|tut|tun|gemacht hat)\b/i,
  /\b(liegt|liegen)( \w+){0,5} (bewegt sich nicht|wacht nicht auf|atmet nicht)\b/i,
];

// Ausgabe-Check: deterministische Prüfung der vom Sprachmodell erzeugten Texte,
// bevor sie vorgelesen werden. Ergänzt die Eingabeprüfung (screen), ersetzt
// aber keine fachliche Prüfung vor dem Kinderbetrieb. JavaScript-\b kennt keine
// Umlaute, daher eigene Wortgrenzen.
const W = '(?<![a-zäöüß])';
const E = '(?![a-zäöüß])';

const OUTPUT_PATTERNS_COMMON: RegExp[] = [
  new RegExp(`${W}(blut|blutet|blutete|bluteten|bluten|blutig\\w*|blutend\\w*|verblutet)${E}`, 'i'),
  new RegExp(`${W}(töte|tötet|töten|tötete|getötet|ermordet|mord|mörder|umgebracht|erschlagen|erstochen|erhängt)${E}`, 'i'),
  new RegExp(`${W}(selbstmord|suizid|selbstverletzung)${E}`, 'i'),
  new RegExp(`${W}(sex|sexuell|nackt|porno|pornos)${E}`, 'i'),
];

// Erzählregel: niemand stirbt, keine Angst-Enden
const OUTPUT_PATTERNS_STORY: RegExp[] = [
  new RegExp(`${W}(tot|tote[nrms]?|tod|stirbt|starb|gestorben|sterben)${E}`, 'i'),
];

// Antworten fragen nicht nach persönlichen Daten
const OUTPUT_PATTERNS_ANSWER: RegExp[] = [
  new RegExp(`${W}(wie heißt du|wo wohnst du|wie ist deine adresse|in welche schule gehst du|wie alt bist du)${E}`, 'i'),
];

export function screenOutput(text: string, kind: 'story' | 'answer'): boolean {
  if (!text) return false;
  if (/https?:\/\/|www\./i.test(text)) return true;
  const normalized = normalize(text);
  const patterns = [
    ...OUTPUT_PATTERNS_COMMON,
    ...(kind === 'story' ? OUTPUT_PATTERNS_STORY : OUTPUT_PATTERNS_ANSWER),
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

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

export function getSafetyResponse(): string {
  return (
    'Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein. ' +
    'Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie, ' +
    'einer Lehrerin, einem Lehrer oder einer Nachbarin. ' +
    `Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die ${config.emergencyNumberPrimary} an. ` +
    `Du kannst auch bei der Nummer gegen Kummer anrufen: ${config.emergencyNumberKummer}. ` +
    'Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag.'
  );
}

export const SAFETY_RESPONSE_DE = getSafetyResponse();

export const UNCLEAR_RESPONSE_DE =
  'Das habe ich leider nicht richtig verstanden. ' +
  'Halte die Sprechtaste gedrückt, sag es noch einmal, und lass sie dann los.';

export const ERROR_RESPONSE_DE =
  'Oh, da ist gerade etwas schiefgegangen. Versuch es gleich noch einmal.';
