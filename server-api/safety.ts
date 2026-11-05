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
  /\b(liegt|liegen)( \w+){0,5} (bewegt sich nicht|wacht nicht auf|atmet nicht|sagt nichts( mehr)?|antwortet nicht|reagiert nicht|rührt sich nicht)\b/i,
  /\bich (habe|hab) (mich )?verirrt/i,
];

// Weitere Notlagen. JavaScript-\b kennt keine Umlaute, daher eigene Wortgrenzen
// (L/R) und umlautsichere Wortklassen. Der Text ist vorher normalisiert
// (Kleinschreibung, Satzzeichen entfernt, ein Leerzeichen am Ende).
const L = '(?<![a-zäöüß])';
const R = '(?![a-zäöüß])';
const WORD = '[a-zäöüß]+';
const PERSON = '(mama|mami|papa|papi|mutti|vati|mutter|vater|oma|opa|omi|opi|onkel|tante|bruder|schwester)';
const POSS = '((mein|meine|meinen|meinem|meiner) )?';
const PARENTS = '(mama|mami|papa|papi|mutti|vati|mutter|vater|eltern)';

const PATTERNS_EXTRA: RegExp[] = [
  // Eine Person reagiert nicht oder ist gestürzt
  new RegExp(`${L}(${POSS}${PERSON}|er|sie|jemand) (ist |wurde )(${WORD} )?(ohnmächtig|bewusstlos)${R}`),
  new RegExp(`${L}${POSS}${PERSON} (ist |liegt )(${WORD} )?(hingefallen|gestürzt)${R}`),

  // Kind ist von den Eltern getrennt oder weiß nicht, wo es ist. Kein Treffer bei
  // Meinungen wie "ich finde Papa nicht schlimm".
  new RegExp(`${L}(finde|find|sehe|seh) ${POSS}${PARENTS}( ${WORD})? (nicht (mehr|wieder)|nicht *$|nirgends|nirgendwo)`),
  new RegExp(`${L}ich (habe|hab) ${POSS}${PARENTS} verloren${R}`),
  new RegExp(`${L}ich (weiß|weiss) nicht( mehr)? wo ich bin${R}`),
  new RegExp(`${L}ich bin (ganz |völlig )?allein (im|in der|in einem|in einer|am|auf dem) (supermarkt|laden|kaufhaus|geschäft|einkaufszentrum|zug|bus|bahnhof|schwimmbad|zoo)${R}`),

  // Gedanken, nicht mehr da sein zu wollen, in weiteren Formulierungen
  new RegExp(`${L}(wäre|wär) (es )?(besser|schöner|leichter)( für alle)? wenn (es )?(mich|ich) (${WORD} )?(nicht|nie)( mehr)? (gäbe|geben würde|geboren wäre|da wäre|hier wäre|existieren würde)${R}`),
  new RegExp(`${L}wenn ich (nicht (mehr )?(da|hier)|tot) wäre${R}`),
  new RegExp(`${L}(keiner|niemand) (würde|wird) mich (vermissen|brauchen)${R}`),
  new RegExp(`${L}ich wünschte,? (ich wäre (tot|nie geboren)|es gäbe mich nicht)${R}`),
  new RegExp(`${L}keine lust mehr (zu leben|auf (das |mein )?leben)${R}`),

  // Gas, Rauch, Verletzungen, fremde Person will das Kind mitnehmen
  new RegExp(`${L}(riecht|stinkt) (${WORD} ){0,3}nach (gas|rauch)${R}`),
  new RegExp(`${L}(rauch|qualm) (in der|im|in unserer|in unserem) (wohnung|haus|zimmer|küche|keller|flur)${R}`),
  new RegExp(`${L}es qualmt${R}`),
  new RegExp(`${L}ich (habe|hab) mir (${WORD} ){1,3}(gebrochen|verbrannt|aufgeschnitten|verbrüht)${R}`),
  new RegExp(`${L}(fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,3} (will|möchte|wollte|sagt|sagte|hat gesagt) (${WORD} ){0,2}ich (soll |muss |darf )?(mitkommen|mit ?kommen|mitkomme|einsteigen|einsteige|ins auto)${R}`),
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

const ALL_PATTERNS: RegExp[] = [...PATTERNS, ...PATTERNS_EXTRA];

export function screen(transcript: string): boolean {
  if (!transcript) return false;
  const normalized = normalize(transcript);
  return ALL_PATTERNS.some((pattern) => pattern.test(normalized));
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
