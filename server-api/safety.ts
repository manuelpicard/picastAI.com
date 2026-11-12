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
  /\b(liegt|liegen)( [a-zäöüß]+){0,5} (bewegt sich nicht|wacht nicht auf|atmet nicht)\b/i,
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
// Wörter, mit denen nach "ich finde Mama nicht" ein neuer Satzteil beginnt
// ("... nicht, und ich habe Angst"). Bei anderen Fortsetzungen ("nicht mehr
// lustig", "nicht mehr so oft") ist es eine Meinung, kein Notfall.
const CONTINUATION = '(und|aber|weil|ich|sie|er|wo|hier|da|bitte|hilf|hilfe)';

const PATTERNS_EXTRA: RegExp[] = [
  // Eine Person reagiert nicht oder ist gestürzt
  new RegExp(`${L}(${POSS}${PERSON}|er|sie|jemand) (ist |wurde )(${WORD} )?(ohnmächtig|bewusstlos)${R}`),
  new RegExp(`${L}${POSS}${PERSON} (ist |liegt )(${WORD} ){0,3}(hingefallen|gestürzt|umgekippt|zusammengebrochen|(runter|hinunter|herunter|hinab)gefallen)${R}`),
  // Bewusst nur mit einer Person als Subjekt: "der Drache liegt da und sagt nichts" ist eine Geschichte.
  new RegExp(`${L}(${POSS}${PERSON}|er|sie|jemand) (liegt|liegen)( ${WORD}){0,6} (sagt nichts mehr|sagt gar nichts mehr|antwortet nicht|antwortet mir nicht|reagiert nicht|rührt sich nicht)${R}`),

  // Kind ist von den Eltern getrennt oder weiß nicht, wo es ist. Kein Treffer bei
  // Meinungen wie "ich finde Papa nicht schlimm" oder "ich sehe meine Eltern nicht mehr so oft".
  new RegExp(`${L}(finde|find|sehe|seh) ${POSS}${PARENTS}( ${WORD})? (nirgends|nirgendwo)${R}`),
  new RegExp(`${L}(finde|find|sehe|seh) ${POSS}${PARENTS}( ${WORD})? nicht( mehr| wieder)?(?= *$| ${CONTINUATION}${R})`),
  new RegExp(`${L}ich (habe|hab) ${POSS}${PARENTS}( und ${POSS}${PARENTS})? verloren${R}`),
  new RegExp(`${L}ich (habe|hab) mich (${WORD} ){0,3}(verlaufen|verirrt)${R}`),
  new RegExp(`${L}ich bin (${WORD} ){0,2}(verlaufen|verirrt|verloren gegangen)${R}`),
  new RegExp(`${L}ich (weiß|weiss) nicht( mehr)? wo ich bin${R}`),
  new RegExp(`${L}ich bin (ganz |völlig )?allein (im|in der|in einem|in einer|am|auf dem) (supermarkt|laden|kaufhaus|geschäft|einkaufszentrum|zug|bus|bahnhof|schwimmbad|zoo)${R}`),

  // Gedanken, nicht mehr da sein zu wollen, in weiteren Formulierungen
  new RegExp(`${L}(wäre|wär) (es )?(besser|schöner|leichter)( für alle)? wenn (es )?(mich|ich) (${WORD} )?(nicht|nie)( mehr)? (gäbe|geben würde|geboren wäre|da wäre|hier wäre|existieren würde)${R}`),
  new RegExp(`${L}wenn ich (nicht (mehr )?(da|hier)|tot) wäre${R}`),
  new RegExp(`${L}(keiner|niemand) (würde|wird) mich (vermissen|brauchen)${R}`),
  new RegExp(`${L}ich wünschte (ich wäre (tot|nie geboren|nicht mehr (da|hier))|es gäbe mich nicht)${R}`),
  new RegExp(`${L}am liebsten (wäre|wär) ich (tot|nicht mehr (da|hier))${R}`),
  new RegExp(`${L}keine lust mehr (zu leben|auf (das |mein )?leben)${R}`),

  // Gas, Rauch, Verletzungen, fremde Person will das Kind mitnehmen. Rauch und
  // Gas nur als Zustand des Raums ("es riecht nach Rauch"), nicht bei Personen
  // oder Figuren ("Papa riecht nach Rauch", "der Drache riecht nach Rauch").
  new RegExp(`${L}(es (riecht|stinkt)|(riecht|stinkt) es) (${WORD} ){0,3}nach (gas|rauch)${R}`),
  new RegExp(`${L}ich rieche (gas|rauch)${R}`),
  new RegExp(`${L}(rauch|qualm) (in der|im|in unserer|in unserem) (wohnung|haus|zimmer|küche|keller|flur)${R}`),
  new RegExp(`${L}es qualmt${R}`),
  // Nur Knochenbrüche und Schnitte an Körperteilen: "ich habe mir die Zunge
  // verbrannt" und "ich habe mir ein Brot aufgeschnitten" sind Alltag.
  new RegExp(`${L}ich (habe|hab) mir (${WORD} ){0,2}(arm|bein|finger|fuß|fuss|hand|knie|rippe|rippen|nase|daumen|zeh|handgelenk|schlüsselbein|knöchel|ellbogen|schulter|kopf) (gebrochen|aufgeschnitten)${R}`),
  new RegExp(`${L}(fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,3} (will|möchte|wollte|sagt|sagte|hat gesagt) (${WORD} ){0,2}(ich (soll |muss |darf )?(mitkommen|mit ?kommen|mitkomme|einsteigen|einsteige|ins auto|in (sein|ein|das|ihr) auto)|mich (mitnehmen|mit ?nehmen))${R}`),
];

// Lücken aus der Tiefenprüfung vom 12.11.2026 (Probe mit 86 Notfall-Sätzen, 65 davon
// unerkannt). Bewusst großzügig; die Gegenprobe mit Alltagssätzen steht in safety.test.ts.
// Wichtig ist das vor allem ohne Sprachmodell (kein Schlüssel, Ausfall): dann gibt es
// nur diese Muster.
const PERSON_WIDE =
  '(mama|mami|papa|papi|mutti|vati|mutter|vater|stiefvater|stiefmutter|stiefpapa|stiefmama|oma|opa|omi|opi|' +
  'großvater|großmutter|onkel|tante|bruder|schwester|cousin|cousine|lehrer|lehrerin|erzieher|erzieherin|' +
  'trainer|trainerin|nachbar|nachbarin|babysitter|babysitterin|freund|freundin)';
const WHO = `(${POSS}${PERSON_WIDE}|er|sie|jemand)`;
const SMALL_PERSON = `(ich|er|sie|das baby|${POSS}(kleiner |kleine |kleinen )?(bruder|schwester|cousin|cousine|freund|freundin|baby))`;
const ROOM = '(bei uns|hier|im haus|in der wohnung|in der küche|im zimmer|im kinderzimmer|im keller|im flur|im bad|nebenan|auf dem dachboden)';

const PATTERNS_2026_11: RegExp[] = [
  // Gewalt gegen das Kind, egal von wem ("Opa schlägt mich", "die großen Kinder hauen mich").
  // Nicht: "das haut mich um", "das haut mich vom Hocker".
  new RegExp(`${L}(schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|misshandelt) mich${R}(?! (um|vom|aus den))`),
  new RegExp(`${L}(hat|haben) mich (${WORD} ){0,2}(verhauen|verprügelt|verdroschen|misshandelt|geboxt)${R}`),
  new RegExp(`${L}ich werde (${WORD} ){0,3}(geschlagen|gehauen|verhauen|verprügelt|getreten|gewürgt|eingesperrt|angefasst|missbraucht)${R}`),
  new RegExp(`${L}ich (kriege|krieg|bekomme|bekomm) (${WORD} ){0,2}(schläge|prügel|haue)${R}`),
  new RegExp(`${L}${WHO} tut mir (${WORD} ){0,2}weh${R}`),
  new RegExp(`${L}ich (habe|hab) (${WORD} )?angst vor ${POSS}${PERSON_WIDE}${R}`),
  new RegExp(`${L}angst (${WORD} )?nach hause (zu gehen|zu kommen|zu müssen)${R}`),
  new RegExp(`${L}ich bin (${WORD} ){0,2}eingesperrt${R}`),
  // Gewalt zwischen Erwachsenen zu Hause
  new RegExp(`${L}${POSS}${PARENTS} (schlägt|haut|tritt|würgt|verprügelt) ${POSS}${PERSON_WIDE}${R}`),
  new RegExp(`${L}${POSS}${PARENTS} hat ${POSS}${PERSON_WIDE} (${WORD} ){0,2}(geschlagen|gehauen|getreten|gewürgt|verprügelt)${R}`),
  new RegExp(`${L}${PARENTS} und ${PARENTS} (schlagen|prügeln|hauen|verprügeln) sich${R}`),

  // Übergriffe
  new RegExp(`${L}(hat|haben) mich (${WORD} ){1,3}(angefasst|an gefasst|begrabscht|befummelt)${R}`),
  new RegExp(`${L}(fasst|fassen|greift|greifen|langt|langen) mir (${WORD} ){0,2}(zwischen die beine|in die hose|in die unterhose|unter ${WORD} ${WORD}|an den po|an den penis|an den pimmel|an die scheide|an die brust)${R}`),
  new RegExp(`${L}dass ich (ihn|sie|ihm|seinen ${WORD}|sein ${WORD}|ihren ${WORD}) (${WORD} ){0,2}(anfasse|anfassen soll|anfassen muss|streichle|streicheln soll)${R}`),
  new RegExp(`${L}(zeigt|zeigte) mir (${WORD} )?(seinen|sein|ihren|ihre) (penis|pimmel|glied|scheide)${R}`),
  new RegExp(`${L}(fotos|bilder|videos|foto|video) von mir (${WORD} ){0,3}(nackt|ohne (sachen|kleider|klamotten|hose|unterhose|was an|etwas an))${R}`),
  // Geheimhaltung in weiteren Formen ("ich darf das niemandem sagen")
  new RegExp(`${L}(soll|darf|sollen|dürfen) (ich |wir )?(es |das |davon )?(niemandem|niemand|keinem) (was |etwas |davon )?(sagen|erzählen|verraten)${R}`),

  // Sich selbst verletzen, nicht mehr leben wollen (auch über andere)
  new RegExp(`${L}ich (tue|tu) mir (selber|selbst) weh${R}`),
  new RegExp(`${L}ich (verletze|schneide|ritze|schlage|haue|kratze) mich (${WORD} )?(selbst|selber|absichtlich|extra)${R}`),
  new RegExp(`${L}ich (habe|hab) mich (${WORD} )?geritzt${R}`),
  new RegExp(`${L}ich hasse mich${R}`),
  new RegExp(`${L}ich will nicht mehr(?= *$)`),
  new RegExp(`${L}(will|möchte|wollte|wollen) (sich (selbst |selber )?umbringen|nicht mehr leben|sich (was|etwas) antun)${R}`),

  // Medizinische Notfälle
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) (atmet|atmen) (nicht|kaum|nicht mehr|ganz komisch|so komisch)${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby|ich) (erstickt|ersticke|ertrinkt|ertrinke)${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) blutet${R}`),
  new RegExp(`${L}blutet (${WORD} ){0,2}(doll|dolle|stark|viel|schlimm|heftig)${R}`),
  new RegExp(`${L}hört nicht auf zu bluten${R}`),
  new RegExp(`${L}${SMALL_PERSON} (habe|hab|hat) (${WORD} ){0,3}(tabletten|tablette|medikamente|pillen|putzmittel|reiniger|spülmittel|waschmittel|chlor|gift|giftiges|rattengift|batterie|batterien|knopfbatterie|benzin|spiritus) (${WORD} ){0,2}(genommen|getrunken|gegessen|geschluckt|verschluckt)${R}`),
  new RegExp(`${L}stromschlag (bekommen|gekriegt|gehabt|abbekommen)${R}`),
  new RegExp(`${L}(${WHO}|das baby|ein kind) ist (${WORD} ){0,2}(ins wasser|in den teich|in den see|in den fluss|in den pool|in den bach|ins becken) gefallen${R}`),

  // Feuer in weiteren Formen ("die Küche brennt", "bei uns brennt es"). Nicht: Kerze, Kamin, Lagerfeuer.
  new RegExp(`${L}${ROOM} brennt (es|was|etwas)${R}`),
  new RegExp(`${L}brennt (es|was|etwas) ${ROOM}${R}`),
  new RegExp(`${L}(unser|unsere|das|die|der|mein|meine) (haus|wohnung|küche|zimmer|kinderzimmer|bett|sofa|couch|auto|garage|scheune|hütte|gardine|decke|vorhang|herd|ofen|backofen|teppich|keller|schrank|weihnachtsbaum|tannenbaum|adventskranz|mülleimer|topf|pfanne|toaster|fernseher|dach) brennt${R}`),

  // Fremde Person im Haus oder will das Kind mitnehmen; Hilferufe
  new RegExp(`${L}einbrecher (ist|sind|war) (${WORD} ){0,2}(da|hier|drin|im haus|in der wohnung|bei uns)${R}`),
  new RegExp(`${L}(jemand|ein fremder|ein mann|eine frau) (ist|bricht|steigt) (gerade )?(in|bei) (unsere|unserer|unserem|unser|uns) (${WORD} )?(wohnung|haus|ein)${R}`),
  new RegExp(`${L}(mann|frau|typ)( ${WORD}){0,3} (will|wollte|möchte) mich (mitnehmen|mit nehmen)${R}`),
  new RegExp(`${L}ruf (bitte )?(die|den|einen) (polizei|notarzt|krankenwagen|rettungswagen|feuerwehr|notruf)${R}`),
  new RegExp(`^(hilfe ?){1,5}$`),
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

const ALL_PATTERNS: RegExp[] = [...PATTERNS, ...PATTERNS_EXTRA, ...PATTERNS_2026_11];

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
