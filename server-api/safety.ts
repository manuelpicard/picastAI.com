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

// Zweite Probe vom 12.11.2026 (47 Notfall-Sätze in Kindersprache, wie die Erkennung sie liefert;
// 13 davon unerkannt). Wieder bewusst großzügig, mit Gegenprobe in safety.test.ts. Ohne
// Sprachmodell (Ausfall, kein Schlüssel) sind diese Muster der einzige Schutz.
const PATTERNS_2026_11_B: RegExp[] = [
  // Gewalt im Nebensatz, Verb am Ende ("weil Papa mich haut"). Nicht: "mich haut das nicht um".
  new RegExp(`${L}mich (schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|misshandelt)${R}(?!( ${WORD}){0,3} um${R})`),
  // Tierbiss
  new RegExp(`${L}(hund|katze|schlange|ratte)( ${WORD}){0,3} (hat|hatte) mich (${WORD} ){0,2}gebissen${R}`),
  new RegExp(`${L}ich (bin|wurde) (${WORD} ){0,3}(von|vom) (${WORD} ){0,2}(hund|katze|schlange|ratte) gebissen${R}`),
  // Nach einem Sturz: Körperteil lässt sich nicht bewegen
  new RegExp(`${L}(ich )?kann (mein|meinen|meine) (arm|bein|fuß|fuss|hand|finger|kopf|hals|knie) (gar )?nicht (mehr )?bewegen${R}`),
  // Person wacht nicht auf, auch wenn sie weiter vorn im Satz steht ("Papa ist ganz heiß und zittert und wacht nicht auf")
  new RegExp(`${L}${POSS}${PERSON}( ${WORD}){1,8} (wacht|wachte) (einfach |gar |immer noch )?nicht (mehr )?auf${R}`),
  // Person liegt am Boden und antwortet nicht
  new RegExp(`${L}(${POSS}${PERSON}|er|sie|jemand) (liegt|liegen) (einfach |ganz |da )?(am|auf dem) boden( ${WORD}){0,4} (sagt|antwortet|redet|spricht) (gar )?(nichts|nicht)${R}`),
  // Herz, Schlaganfall, Krampfanfall
  new RegExp(`${L}(schmerzen|weh) (${WORD} ){0,2}(in der|an der|in seiner|in ihrer) brust${R}`),
  new RegExp(`${L}(hat|hatte|kriegt|bekommt) (gerade )?(einen |nen )?(herzinfarkt|schlaganfall|krampfanfall|epileptischen anfall)${R}`),
  // Atemwege schwellen zu (Allergie)
  new RegExp(`${L}(mein hals ist (ganz |so )?(zu|zugeschwollen)|ich kann (gar |überhaupt )?nicht (mehr )?schlucken)${R}`),
  // Fremde Person will das Kind mitnehmen, als Nebensatz ("ein Mann, der will, dass ich mitkomme")
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,3} (will|wollte|möchte|sagt|sagte|hat gesagt) (${WORD} ){0,1}dass ich (mit ihm |mit ihr )?(mitkomme|mitgehe|einsteige|ins auto steige|in sein auto steige|in das auto steige)${R}`),
  // Jemand Fremdes im Haus, und das Kind hat Angst
  new RegExp(`^(?=.*${L}angst${R}).*${L}(jemand|einer|ein fremder|ein mann|eine frau|ein einbrecher) ist (${WORD} )?(im haus|in der wohnung|in unserem haus|in unserer wohnung|im keller|bei uns)${R}`),
  // Erwachsener außerhalb der Familie verlangt Geheimhaltung
  new RegExp(`${L}(mann|onkel|trainer|trainerin|lehrer|lehrerin|nachbar|nachbarin|fremder|fremde|babysitter|babysitterin|erzieher|erzieherin)( ${WORD}){0,4} (sagt|sagte|hat gesagt|meint)( ${WORD}){0,3} (unser|ein) geheimnis${R}`),
  // Kind allein, Eltern kommen nicht
  new RegExp(`${L}${POSS}${PARENTS} (kommt|kommen) (einfach |immer noch |noch immer |gar )?nicht (mehr )?(nach hause|heim|zurück)${R}`),
  new RegExp(`${L}(allein|alleine) (zu hause|daheim)( ${WORD}){0,4} ${POSS}${PARENTS} (kommt|kommen) (${WORD} )?nicht(?= *$| ${CONTINUATION}${R})`),
];

// Ausgabe-Check: deterministische Prüfung der vom Sprachmodell erzeugten Texte,
// bevor sie vorgelesen werden. Ergänzt die Eingabeprüfung (screen), ersetzt
// aber keine fachliche Prüfung vor dem Kinderbetrieb. JavaScript-\b kennt keine
// Umlaute, daher eigene Wortgrenzen.
const W = '(?<![a-zäöüß])';
const E = '(?![a-zäöüß])';

const OUTPUT_PATTERNS_COMMON: RegExp[] = [
  // Ausgemaltes Bluten ist nie erlaubt. "Blut", "blutet" und "bluten" allein sperrt nur die
  // Erzählregel (unten): In Sachantworten gehören sie dazu ("Warum ist Blut rot?"). Bis zum
  // 12.11.2026 lehnte der Check auch solche Antworten ab, und das Kind hörte den Ersatztext.
  new RegExp(`${W}(blutete|bluteten|blutig\\w*|blutend\\w*|blutüberströmt\\w*|verblut\\w*)${E}`, 'i'),
  new RegExp(`${W}(töte|tötet|töten|tötete|getötet|ermordet|mord|mörder|umgebracht|erschlagen|erstochen|erhängt)${E}`, 'i'),
  new RegExp(`${W}(selbstmord|suizid|selbstverletzung)${E}`, 'i'),
  new RegExp(`${W}(sex|sexuell|nackt|porno|pornos)${E}`, 'i'),
];

// Erzählregel: kein Blut, niemand stirbt, keine Angst-Enden
const OUTPUT_PATTERNS_STORY: RegExp[] = [
  new RegExp(`${W}(blut|blutet|bluten)${E}`, 'i'),
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
  // „€“ nach einer Zahl als Wort lesen, sonst bleibt von „10 €“ nur „10“ (Prüfung von PR #110, 24.11.2026, Befund 4).
  // Sonst wie früher ein Satzzeichen: Als Wort trennte es Wortketten („Ich möchte € sterben“; Prüfung von PR #115, Befund 11).
  const norm = (text || '').normalize('NFC').toLowerCase().replace(/([0-9])\s*€+/g, '$1 euro ');
  const cleaned = norm.replace(/[^\wäöüß ]+/gi, ' ');
  return cleaned.replace(/\s+/g, ' ').trim() + ' ';
}

// Dritte Probe vom 12.11.2026, abends (57 Notfall-Sätze in Kindersprache, 48 davon unerkannt;
// neue Bereiche: Drohung bei Verrat, Strafen, Vernachlässigung, Kontakte im Internet, Allergie,
// Verschlucken, Strom, Wasser, Verfolgen, nicht abgeholt). Wieder mit Gegenprobe in safety.test.ts.
// Füllwörter zwischen "ich will" und dem Kern ("ich will einfach nur noch sterben").
const FILL = '(einfach|nur|noch|lieber|am|liebsten|jetzt|gleich|endlich|auch|bald|schon|mal|halt|echt|wirklich|so|ganz)';
const BODY_DANGER_PLACE = '(dach|fenster|balkon|brücke|hochhaus|turm|zug|auto|bus|lkw|laster)';
const WATER = '(pool|see|wasser|schwimmbad|fluss|teich|meer|becken|badewanne|bach|schwimmbecken)';

const PATTERNS_2026_11_C: RegExp[] = [
  // Nicht mehr leben wollen, mit Füllwörtern oder in weiteren Bildern
  new RegExp(`${L}ich (will|möchte|mag|würde) (${FILL} ){1,4}(sterben|tot sein|nicht mehr leben)${R}`),
  new RegExp(`${L}ich (will|möchte|mag) (${FILL} ){0,3}(nie mehr|nie wieder|nicht mehr) aufwachen${R}`),
  new RegExp(`${L}ich (will|möchte|mag) (${FILL} ){0,2}nicht mehr (auf der welt|am leben) sein${R}`),
  new RegExp(`${L}(am besten|am liebsten|lieber|besser) (wäre|wär) ich (${WORD} )?(tot|nicht mehr (da|hier|auf der welt)|nie geboren)${R}`),
  new RegExp(`${L}mich (${FILL} ){1,3}(selbst |selber )?umbringen${R}`),
  new RegExp(`${L}mich (${FILL} ){0,3}(selbst|selber) töten${R}`),
  new RegExp(`${L}ich (will|möchte|werde|würde) (${FILL} ){0,3}(vom|von dem|aus dem|von der|vor den|vor einen|vor ein|vor das) ${BODY_DANGER_PLACE} (springen|runterspringen|hinunterspringen|stürzen|laufen|rennen)${R}`),
  new RegExp(`${L}ich (spring|springe|stürze mich) (${FILL} ){0,2}(vom|von dem|aus dem|von der|vor den|vor einen|vor ein|vor das) ${BODY_DANGER_PLACE}${R}`),
  // Absichtlich verletzt ("mit Absicht geschnitten"); "aus Versehen" schlägt nicht an
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich (habe|hab) mich (${WORD} ){0,4}(geschnitten|geritzt|verletzt|gekratzt|verbrannt|gebissen)${R}`),

  // Drohung, wenn das Kind etwas verrät. Nicht: "... krieg ich Ärger" (Alltag).
  new RegExp(`^(?=.*${L}wenn ich (es|das|was|etwas)( ${WORD}){0,3} (sage|sag|erzähle|erzähl|verrate|verrat|petze)${R}).*${L}((passiert|geschieht) (${WORD} ){0,2}(was|etwas) (${WORD} )?(schlimmes|böses)|(kriege|krieg|bekomme|bekomm) ich (prügel|schläge|haue))${R}`),
  // Gewalt in weiteren Formen. Spiele ("beim Schach geschlagen") und "aus Versehen" ausgenommen.
  new RegExp(`^(?!.*${L}(aus versehen|ausversehen|beim spielen|beim spiel|im spiel|beim schach|beim rennen|beim wettrennen|beim fußball|beim sport)${R}).*${L}${WHO} hat mir (${WORD} ){0,3}(weh getan|wehgetan)${R}`),
  new RegExp(`${L}(hat|haben) mich (ganz |so |richtig )?(doll|fest|stark|heftig) (geschubst|gestoßen|geschüttelt|gekniffen|getreten|gehauen|geschlagen)${R}`),
  new RegExp(`${L}(hat|haben) mich mit (dem|der|einem|einer|seinem|seiner|ihrem|ihrer) (${WORD} )?(gürtel|stock|kochlöffel|holzlöffel|faust|schuh|kabel|peitsche|rute|teppichklopfer|lineal|hand) (${WORD} )?(geschlagen|gehauen|verhauen|verprügelt)${R}`),
  new RegExp(`${L}(hat|haben|hatte|gibt|gab|geben) mir (${WORD} ){0,2}(ohrfeige|ohrfeigen|backpfeife|backpfeifen|watsche|watschen)${R}`),
  new RegExp(`${L}ich (habe|hab|kriege|krieg|bekomme|bekomm|kriegte|bekam) (${WORD} ){0,2}(ohrfeige|ohrfeigen|backpfeife|backpfeifen|watsche|watschen)${R}`),
  // Strafen und Vernachlässigung
  new RegExp(`^(?=.*${L}(zur strafe|als strafe)${R}).*${L}(keller|eingesperrt|einsperren|nichts (zu )?essen|kein essen|draußen schlafen|auf dem boden schlafen|im dunkeln)${R}`),
  new RegExp(`${L}ich (kriege|krieg|bekomme|bekomm) (${WORD} ){0,2}(nichts|kein|keinen) (mehr )?(zu essen|essen)(?= *$| seit${R}| mehr${R}| (schon|nie|tagelang)${R})`),
  new RegExp(`${L}ich darf (seit (${WORD} ){1,2}nichts (mehr )?essen|nichts (mehr )?essen (${WORD} ){0,2}seit${R})`),

  // Übergriffe, auch über Spiele und Internet
  new RegExp(`${L}(hat|haben) mir (${WORD} ){0,2}(zwischen die beine|in die hose|in die unterhose|an den po|an den penis|an den pimmel|an die scheide|an die brust|unter (das|den|die|mein|meinen|meine) (${WORD} )?(t shirt|tshirt|shirt|hemd|pulli|rock|kleid|unterhose|hose)) (gefasst|gegriffen|gelangt|gefummelt|gegrapscht|gegrabscht)${R}`),
  new RegExp(`${L}dass ich mich (${WORD} ){0,2}vor (ihm|ihr|ihnen|denen|dem|der) (${WORD} ){0,2}(ausziehe|ausziehen|nackt)${R}`),
  new RegExp(`${L}ich (soll|muss) mich (${WORD} ){0,2}vor (ihm|ihr|ihnen|denen|dem|der) (${WORD} ){0,2}(ausziehen|nackt machen)${R}`),
  new RegExp(`^(?=.*${L}(im spiel|in einem spiel|im internet|im chat|online|auf dem handy|am handy|bei roblox|bei fortnite|bei minecraft|bei tiktok|bei whatsapp|bei instagram|bei snapchat|bei discord|jemand|ein fremder|eine fremde|ein mann|eine frau)${R}).*${L}(fotos|foto|bilder|bild|videos|video) von mir( ${WORD}){0,3} (schicke|schicken|schick|sende|senden|machen soll|machen darf)${R}`),
  new RegExp(`${L}(im internet|im chat|online|im spiel|in einem spiel|auf dem handy|am handy|bei roblox|bei fortnite|bei minecraft|bei tiktok|bei whatsapp|bei instagram|bei snapchat|bei discord)( ${WORD}){0,6} (will|wollte|möchte) mich (treffen|besuchen|abholen|sehen)${R}`),

  // Medizinische Notfälle
  new RegExp(`${L}(gesicht|lippe|lippen|zunge|hals|auge|augen) (ist|sind|wird|werden) (ganz |so |total |voll )?(dick|geschwollen|angeschwollen)${R}`),
  new RegExp(`${L}(ist|sind|wird|werden) (sein|seine|ihr|ihre|mein|meine|das|die|der) (gesicht|lippe|lippen|zunge|hals|auge|augen) (ganz |so |total |voll )?(dick|geschwollen|angeschwollen)${R}`),
  new RegExp(`${L}(ist|wird|sind|werden) (ganz |so |total )?(blau|lila) (im gesicht|an den lippen)${R}`),
  new RegExp(`${L}(lippen|gesicht) (ist|sind|wird|werden) (ganz |so |total )?(blau|lila)${R}`),
  new RegExp(`${L}(hat|habe|hab) (sich|mich) (ganz |so |sehr |total )?(doll|dolle|schlimm|stark|heftig) (verbrannt|verbrüht|verletzt|geschnitten)${R}`),
  new RegExp(`^(?=.*${L}(geschnitten|blut|blutet|wunde|verletzt|gestochen|gebissen|verbrannt)${R}).*${L}(es|das) hört (gar |einfach )?nicht (mehr )?auf${R}`),
  new RegExp(`^(?=.*${L}(gefallen|gestürzt|hingefallen|runtergefallen|heruntergefallen|unfall|angefahren|verletzt)${R}).*${L}kann (gar |überhaupt )?nicht (mehr )?(aufstehen|laufen|gehen|stehen)${R}`),
  new RegExp(`${L}(das baby|unser baby|mein baby|meine kleine schwester|mein kleiner bruder)( ${WORD}){0,5} (ganz schlapp|so schlapp|schlapp|ganz blass|bewegt sich kaum)${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) (kriegt|bekommt|hat) (gar |ganz )?keine luft( mehr)?${R}`),
  new RegExp(`^(?=.*${L}(${PERSON_WIDE}|er|sie)${R}).*${L}(redet|spricht|redete|sprach) (${WORD} ){0,2}nicht mehr richtig(?= *$| ${CONTINUATION}${R})`),
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie) kann (${WORD} )?nicht mehr (richtig )?(sprechen|reden)${R}`),
  new RegExp(`${L}${SMALL_PERSON} (habe|hab|hat) (${WORD} ){0,3}(murmel|murmeln|münze|geldstück|knopf|perle|perlen|legostein|magnet|magnete|magnetkugeln|schraube|nagel|nadel|ring|batterie|knopfbatterie) (verschluckt|geschluckt|gegessen|in die nase gesteckt)${R}`),
  new RegExp(`^(?=.*${L}(getrunken|gegessen|geschluckt|verschluckt)${R}).*${L}(totenkopf|giftzeichen|warnzeichen)${R}`),

  // Rauch, Strom
  new RegExp(`${L}(im|in der|in unserer|in unserem|bei uns im|bei uns in der) (wohnung|haus|zimmer|kinderzimmer|küche|keller|flur|treppenhaus|bad)( ist| sind| kommt)( ${WORD}){0,3} (rauch|qualm)${R}`),
  new RegExp(`${L}aus (der|dem|einer|einem) (${WORD} )?(steckdose|kabel|fernseher|computer|herd|ofen|backofen|toaster|lampe|ladegerät|handy|tablet|wand|decke|mikrowelle)( ${WORD})? (kommt|kommen) (${WORD} )?(rauch|qualm|feuer|funken|flammen)${R}`),
  new RegExp(`${L}(schlag|stromschlag|elektrischen schlag) (${WORD} ){0,2}(von|an|aus) (der|dem|einer|einem) (${WORD} )?(steckdose|kabel|lampe|leitung|zaun|stromzaun|stromleitung|toaster|föhn|fön)${R}`),

  // Allein, verloren, nicht abgeholt
  new RegExp(`^(?=.*${L}ich bin (ganz |so |völlig )?(allein|alleine)${R}).*${L}(keiner|niemand) (ist|kommt) (${WORD} )?(da|hier|mehr)(?= *$| ${CONTINUATION}${R})`),
  new RegExp(`^(?=.*${L}${PARENTS}${R}).*${L}ich (weiß|weiss) nicht (mehr )?wo (${POSS}${PARENTS}|sie|er|die beiden) (ist|sind|hin ist|hingegangen ist|hingegangen sind|geblieben ist)${R}`),
  new RegExp(`${L}(finde|find) (den weg )?(nicht|nicht mehr) (nach hause|heim|zurück)${R}`),
  new RegExp(`${L}ich (weiß|weiss) nicht (mehr )?wie ich (wieder )?nach hause (komme|finde)${R}`),
  new RegExp(`${L}ich (bin|wurde) (${WORD} ){0,4}nicht abgeholt${R}`),
  new RegExp(`${L}(keiner|niemand) hat mich (${WORD} ){0,2}abgeholt${R}`),

  // Fremde: ruft, lockt, spricht an, verfolgt
  new RegExp(`${L}(ein mann|eine frau|ein fremder|eine fremde|ein typ|jemand fremdes)( ${WORD}){0,5} (ruft|lockt|winkt) mich${R}(?! (an|zurück)${R})`),
  new RegExp(`${L}(ein fremder|eine fremde|ein fremder mann|eine fremde frau|ein unbekannter|eine unbekannte|fremde leute)( ${WORD}){0,4} (hat|haben) mich (${WORD} ){0,2}angesprochen${R}`),
  // Nicht: "Warum verfolgt mich der Mond beim Autofahren?" (typische Kinderfrage)
  new RegExp(`^(?!.*${L}(mond|sonne|schatten|stern|sterne|wolke|wolken|traum|albtraum|pech|glück|lied|ohrwurm)${R}).*${L}(verfolgt|verfolgen|verfolgte) mich${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|jemand|auto|wagen|einer) (${WORD} ){0,3}(läuft|lief|fährt|fuhr|ist|geht|ging|kommt|kam) mir (${WORD} ){0,4}(hinterher|hinterhergelaufen|hinterhergefahren|nachgelaufen|nachgefahren|gefolgt)${R}`),

  // Wasser. Schiffe, Sonne und Mond ausgenommen ("Warum ist die Titanic untergegangen?").
  new RegExp(`^(?=.*${L}${WATER}${R})(?!.*${L}(schiff|boot|titanic|sonne|mond|uboot|u boot|piratenschiff|ente)${R}).*${L}(ist|sind) (${WORD} ){0,3}(untergegangen|nicht mehr aufgetaucht)${R}`),
  new RegExp(`^(?=.*${L}${WATER}${R}).*${L}kommt (gar )?nicht (mehr )?(hoch|nach oben|raus)${R}`),

  // Allgemeine Notlage
  new RegExp(`${L}(es ist|das ist) ein notfall${R}`),
  new RegExp(`${L}(mir|uns|bei uns|hier|gerade|zu hause|daheim) ist (${WORD} ){0,2}(was|etwas) (ganz |sehr )?(schlimmes|schreckliches|furchtbares) passiert${R}`),
  new RegExp(`${L}es ist (gerade )?(was|etwas) (ganz |sehr )?(schlimmes|schreckliches|furchtbares) passiert${R}`),
  new RegExp(`^(?=.*${L}angst${R}).*${L}(er|sie|der mann|die frau|der fremde|der typ) kommt (${WORD} )?(gleich |bald |heute nacht |nachher )?(wieder|zurück)${R}`),
];

// Vierte Probe vom 20.11.2026 (Punkt E3 der Arbeitsliste): 89 Notfall-Sätze, wie Kinder sie sagen
// und wie die Erkennung sie liefert (Umgangssprache, Kinderwörter, getrennt geschriebene Wörter,
// Ziffern, fehlende Satzzeichen). Vorher erkannte die Weiche keinen davon. Wieder bewusst
// großzügig, mit Gegenprobe in safety.test.ts. Ausnahmen gibt es nur innerhalb dieser neuen
// Muster (zum Beispiel „vor Lachen“); kein älteres Muster wird dadurch enger. Nach der unabhängigen
// Prüfung (20.11.2026, nachmittags) kamen weitere Formen dazu: Perfekt, Hauptsatz nach „aber“,
// umgekehrte Wortstellung, „noch“ und „richtig“, Artikel, zusammengeschriebene Wörter.
const KID_BODY = '(pipi|pullermann|schniedel|pimmel|penis|glied|muschi|scheide|vagina)';
const HIGH_PLACE = '(dach|baum|klettergerüst|gerüst|leiter|balkon|fenster|hochbett|stockbett|etagenbett|mauer|turm|treppe|schrank|wickeltisch|wickelkommode)';
const FELL = '(gefallen|gestürzt|hingefallen|runtergefallen|heruntergefallen|umgefallen|angefahren|gestoßen)';
const EMERGENCY_NUMBER = '(112|110|1 1 2|1 1 0|eins eins zwei|eins eins null)';
// Wie POSS, dazu bestimmte Artikel („Papa tut der Mama weh“, „ich glaube die Mama ist tot“)
const ART = '((mein|meine|meinen|meinem|meiner|der|die|dem|den) )?';
// Spiele und Sport, bei denen „geschlagen“ „besiegt“ heißt (nur für das Perfekt mit Wörtern dazwischen)
const GAME = '(schach|memory|uno|mühle|dame|halma|mensch ärgere dich nicht|kartenspiel|karten|quartett|videospiel|computerspiel|fußball|tischtennis|tennis|badminton|federball|basketball|handball|volleyball|wettrennen|rennen|wettlauf|wettschwimmen|armdrücken|quiz|mario kart|fifa)';
// Gegen den Willen, in beiden Wortstellungen („obwohl ich das nicht wollte“, „aber ich will das nicht“)
// Subjekt zwischen „hat“ und „mich“ („Und dann hat er mich geschlagen“, „Gestern hat Papa mich gehauen“)
const SUBJ = `(er|sie|jemand|einer|der|die|man|${ART}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|junge|fremde|fremder))`;
const NUM = '(null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)';
const UNWANTED = '((obwohl|aber|und) ich (das |es )?(gar )?nicht (will|wollte|mag|mochte|möchte)|(aber|und) ich (will|wollte|mag|mochte|möchte) (das|es) (gar )?nicht)';

const PATTERNS_2026_11_D: RegExp[] = [
  // Atemnot mit „kaum“ und bei anderen Personen. Nicht: „vor Lachen“.
  new RegExp(`^(?!.*${L}vor (lauter )?lachen${R}).*${L}ich (habe|hab|bekomme|bekomm|kriege|krieg) (gerade |ganz |fast )?(kaum|fast keine|so gut wie keine|schlecht|nur schlecht|ganz schlecht)( noch)? luft( mehr)?${R}`),
  new RegExp(`^(?!.*${L}vor (lauter )?lachen${R}).*${L}ich kann (gerade |fast )?(kaum|fast nicht|gar nicht|überhaupt nicht|nicht richtig|nicht gut|nur schlecht|ganz schlecht|schlecht) (noch |mehr )?atmen${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) (kriegt|bekommt|hat) (ganz )?(kaum|fast keine)( noch)? luft${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) kann (kaum|nicht|nicht mehr|gar nicht|nicht richtig|nicht gut|schlecht) (noch |mehr )?atmen${R}`),
  // Hilferuf als ganze Äußerung („Hilfe, bitte!“, „Bitte hilf mir!“); längere Sätze („hilf mir bei …“) nicht.
  new RegExp(`^((bitte )?(hilfe|hilf mir|helft mir)( bitte)? ){1,5}$`),
  // Gewalt: Umgangssprache, gegen „uns“, Ohrfeigen in Kindersprache, Werfen nach dem Kind
  new RegExp(`${L}(verkloppt|verkloppen|verkloppte|vermöbelt|vermöbeln|boxt|boxen|boxte|prügelt|prügeln|prügelte|verdrischt|verdreschen) (mich|uns)${R}`),
  new RegExp(`${L}(mich|uns) (verkloppt|verkloppen|vermöbelt|vermöbeln|boxt|boxen|prügelt|prügeln|verdrischt)${R}`),
  new RegExp(`${L}(schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|misshandelt) uns${R}(?! (um|vom|aus den)${R})`),
  new RegExp(`${L}uns (schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|misshandelt)${R}(?!( ${WORD}){0,3} um${R})`),
  // „geschlagen“ mit Wörtern dazwischen bleibt außen vor: „er hat mich beim Schach geschlagen“.
  new RegExp(`${L}(hat|haben) mich (${WORD} ){0,2}(verkloppt|vermöbelt)${R}`),
  new RegExp(`${L}(hat|haben) uns (${WORD} ){0,2}(verkloppt|vermöbelt|verdroschen|geboxt|verprügelt|verhauen|misshandelt)${R}`),
  new RegExp(`${L}(hat|haben) uns (geschlagen|gehauen|getreten|gewürgt|eingesperrt)${R}`),
  new RegExp(`${L}(hat|haben|hatte|gibt|gab|geben) mir (${WORD} ){0,2}(eine|einen|ne|nen) (reingehauen|rein gehauen|reingehaun|rein gehaun|gescheuert|geknallt|geklebt|gewischt|verpasst|gelangt|geschmiert|gedonnert)${R}`),
  new RegExp(`${L}(eine|einen|ne|nen) (reingehauen|rein gehauen|gescheuert|geknallt|geklebt|gewischt|gelangt) (gekriegt|bekommen)${R}`),
  new RegExp(`${L}(scheuert|knallt|klebt|haut|langt) mir (${WORD} )?(eine|einen|ne|nen)( rein)?(?= *$| (und|aber|weil|wenn|dann|immer)${R})`),
  new RegExp(`${L}(wirft|warf|werfen|schmeißt|schmeisst|schmiss|schmeißen) (${WORD} ){0,3}nach (mir|uns)${R}`),
  new RegExp(`${L}(wirft|warf|werfen|schmeißt|schmeisst|schmiss|schmeißen) mit (tellern|gläsern|flaschen|messern|stühlen|sachen|gegenständen)${R}`),
  new RegExp(`${L}${POSS}${PARENTS} (tut|tat) ${ART}${PERSON_WIDE} (${WORD} ){0,2}weh${R}`),
  new RegExp(`${L}${POSS}${PARENTS} hat ${ART}${PERSON_WIDE} (${WORD} ){0,2}(weh getan|wehgetan)${R}`),
  // Drohungen („Papa hat gesagt, er bringt mich um“). Nicht: „bringt mich um acht zur Schule“,
  // „bringt mich um den Verstand“: „um“ muss am Ende stehen oder ein neuer Satzteil folgen.
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie|der|die|jemand) (bringt|bringen|würde|will|wird) (mich|uns) (${WORD} )?um(?= *$| (wenn|weil|und|aber|falls|sonst|sagt|hat|ich|er|sie)${R})`),
  new RegExp(`${L}(droht|drohte|drohen|gedroht)( ${WORD}){0,6} (umzubringen|umbringen|zu schlagen|zu verhauen|wehzutun|weh zu tun|zu töten|einzusperren|mich (${WORD} )?(schlägt|haut|umbringt|einsperrt|tötet))${R}`),
  new RegExp(`${L}(mich|mir|sich|uns) (${FILL} ){0,3}(selbst |selber )?um bringen${R}`),
  // Angst vor einer Person, Angst vor dem Zuhause, Mobbing
  new RegExp(`${L}${POSS}${PERSON_WIDE} macht mir (${WORD} ){0,2}angst${R}`),
  new RegExp(`${L}ich (trau|traue) mich (${WORD} ){0,2}nicht (mehr )?(nach hause|nachhause|heim)${R}`),
  new RegExp(`${L}ich (werde|werd|wurde) (${WORD} ){0,3}gemobbt${R}`),
  new RegExp(`${L}(mobben|mobbt|mobbte|mobbten) (mich|uns)${R}`),
  new RegExp(`${L}(hat|haben) mich (${WORD} ){0,2}gemobbt${R}`),
  // Übergriffe in Kindersprache, ungewollte Berührung, Locken mit Versprechen
  new RegExp(`${L}(macht|machen|machte) (${WORD} ){0,2}(komische|eklige|ekelige|ekelhafte|schlimme|unangenehme|geheime|seltsame) (sachen|dinge|spiele|spielchen) mit mir${R}`),
  new RegExp(`${L}(sachen|dinge) mit mir( ${WORD}){0,3} (die|was) ich nicht (will|wollte|mag|mochte|möchte)${R}`),
  new RegExp(`${L}(berührt|berühren|streichelt|streicheln|fasst|fassen|grapscht|grabscht|küsst|küssen) mich (${WORD} ){0,2}(da unten|untenrum|am po|am popo|zwischen den beinen|an der brust|an meinem ${KID_BODY}|am ${KID_BODY}|an der ${KID_BODY}|unter der (decke|bettdecke|hose|unterhose))${R}`),
  new RegExp(`${L}(fasst|fassen|fasste|greift|greifen|griff|langt|langen) mir (${WORD} ){0,2}(an|in) (mein|meinen|meine|den|die|das) (${KID_BODY}|po|popo|brust|unterhose|hose)${R}`),
  new RegExp(`${L}(hat|haben) mir (${WORD} ){0,2}(seinen|sein|seine|ihren|ihr|ihre) ${KID_BODY} gezeigt${R}`),
  new RegExp(`${L}(zeigt|zeigte) mir (${WORD} )?(seinen|sein|seine|ihren|ihr|ihre) ${KID_BODY}${R}`),
  new RegExp(`${L}ich (will|möchte|mag) (${WORD} )?nicht dass (er|sie|der|die|${POSS}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|fremde|fremder|junge)) mich (${WORD} ){0,2}(anfasst|anfassen|küsst|streichelt|berührt|auszieht)${R}`),
  new RegExp(`${L}(küsst|küsste|küssen|streichelt|streicheln|berührt|berühren|fasst|fassen) mich( ${WORD}){0,4} (obwohl|aber|und) ich (das |es )?(nicht will|nicht mag|nicht möchte|nicht wollte)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (gesagt|sagt|sagte|meint|meinte) ich (soll|muss|darf) (mit ihm |mit ihr )?(mitkommen|mitgehen|einsteigen|ins auto|in sein auto|in ihr auto)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} wenn ich (mit ihm |mit ihr )?(mitkomme|mitgehe|einsteige|ins auto steige)${R}`),
  // Sich selbst verletzen, keinen Sinn mehr sehen, sich wertlos fühlen
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich (habe|hab) mir ((?!(haare|nägel|fingernägel|fußnägel|pony|bart|brot|apfel|papier)${R})${WORD} ){0,6}(geschnitten|geritzt|verletzt|wehgetan|weh getan|verbrannt|gekratzt)${R}`),
  new RegExp(`${L}ich (haue|hau|schlage|schlag|schlug) mir (selber |selbst |immer |extra ){0,2}(${WORD} ){0,2}(gegen|auf|an) (den|meinen) kopf${R}`),
  new RegExp(`${L}(einschlafen|schlafen|einschlafe|schlafe)( ${WORD}){0,3} (und )?(nie mehr|nie wieder|nicht mehr) (aufwachen|aufwache|aufzuwachen)${R}`),
  new RegExp(`${L}(hat|macht) (doch |eh |jetzt |gar |überhaupt )?(alles|mein leben|das leben) (doch |eh |gar |überhaupt )?keinen sinn mehr${R}`),
  new RegExp(`${L}(mein leben|das leben) (hat|macht) (doch |eh |gar |überhaupt )?keinen sinn${R}`),
  new RegExp(`${L}ich bin (${WORD} ){0,2}(nichts|gar nichts|überhaupt nichts|nix) wert${R}`),
  // Stürze von oben, Sturz mit Blutung am Kopf, Umfallen mit Wörtern dazwischen. Nicht: „vor Lachen umgefallen“.
  new RegExp(`${L}(${SMALL_PERSON}|${WHO}) (ist|bin) (${WORD} ){0,3}(vom|von dem|von der|von einem|von einer|aus dem) (${WORD} )?${HIGH_PLACE} (gefallen|gestürzt|runtergefallen|heruntergefallen|runtergestürzt|runter gefallen|herunter gefallen|runter gestürzt)${R}`),
  new RegExp(`^(?=.*${L}${FELL}${R}).*${L}(blutet|blutete|bluten) (${WORD} ){0,2}(am|aus dem|aus der|an der|aus den|aus seinem|aus ihrem) (kopf|ohr|ohren|mund|stirn|hals|nase|bauch|auge)${R}`),
  new RegExp(`^(?!.*${L}vor (lauter )?lachen${R}).*${L}(${POSS}${PERSON}|er|sie|jemand) (ist|liegt) (${WORD} ){0,3}(umgefallen|zusammengeklappt|zusammengesackt|umgekippt|zusammengebrochen)${R}`),
  // Person wird nicht wach, Anfall, Krampf am ganzen Körper. Nicht: Wutanfall, Lachanfall (ein Wort).
  new RegExp(`${L}(kann|krieg|kriege|bekomme|bekomm) (${ART}${PERSON}|sie|ihn) (${WORD} )?nicht (mehr )?(wach|aufgeweckt|aufwecken|wecken)${R}`),
  new RegExp(`${L}${POSS}${PERSON}( ${WORD}){0,6} (wird|wurde) (einfach |gar |immer noch )?nicht (mehr )?wach${R}`),
  new RegExp(`${L}(hat|hatte|kriegt|kriegte|bekommt|bekam) (gerade )?(einen |nen )?anfall${R}`),
  new RegExp(`${L}(zuckt|zucken|zuckte|krampft|krampfen|krampfte) (${WORD} ){0,2}(am ganzen körper|ganz komisch|ganz doll|die ganze zeit)${R}`),
  // Verschluckte Dinge, Fremdkörper in Nase oder Ohr
  new RegExp(`${L}${SMALL_PERSON} (habe|hab|hat) (${WORD} ){0,3}(stein|steinchen|kieselstein|kiesel|büroklammer|haarspange|haarklammer|ohrring|kronkorken|radiergummi|legoteil|spielzeugteil|reißzwecke|sicherheitsnadel|scherbe|glasscherbe) (verschluckt|geschluckt|in die nase gesteckt|ins ohr gesteckt)${R}`),
  new RegExp(`^(?=.*(?<!wasser )${L}(in die nase|in der nase|ins ohr|in das ohr|im ohr|in dem ohr|in den hals|im hals)${R}).*${L}(geht|kommt|kriegt|krieg|kriege|bekommt|bekomme|bekomm) (${WORD} ){0,3}nicht (mehr )?raus${R}`),
  // Blau angelaufen, Blut gespuckt, Tierbiss bei anderen, allergische Reaktion
  new RegExp(`${L}(ist|sind|wird|werden|bin) (${WORD} )?(ganz |so |total )?(blau|lila) angelaufen${R}`),
  new RegExp(`${L}(spuckt|spuckte|spucken|hustet|hustete|husten|kotzt|kotzte|erbricht|bricht) (${WORD} ){0,2}blut${R}`),
  new RegExp(`${L}blut (gespuckt|gehustet|erbrochen|gekotzt|gebrochen)${R}`),
  new RegExp(`${L}(hund|katze|schlange|ratte|pferd)( ${WORD}){0,3} (hat|hatte) (uns|ihn|sie|das baby|${ART}(kleine |kleinen |kleiner |große |großen |großer )?${PERSON_WIDE}) (${WORD} ){0,2}gebissen${R}`),
  new RegExp(`^(?=.*${L}(allergisch|[a-zäöüß]*allergie)${R})(?!.*${L}(keine|keinen|kein|nichts) (${WORD} )?(gegessen|getrunken)${R}).*${L}(gegessen|getrunken|gestochen|gebissen)${R}`),
  // Getrennt von den Eltern, mit Ortsangabe oder mit „sie“ statt „Mama“
  new RegExp(`${L}ich (habe|hab) ${POSS}${PARENTS}( und ${POSS}${PARENTS})? (${WORD} ){1,3}verloren${R}`),
  new RegExp(`^(?=.*${L}${PARENTS}${R}).*${L}(finde|find|sehe|seh) (sie|ihn|die beiden|euch) (${WORD} )?(nicht|nirgends|nirgendwo)( mehr| wieder)?(?= *$| ${CONTINUATION}${R})`),
  // Feuer: Ruf, Rauch in der Wohnung, Rauchmelder
  new RegExp(`^(feuer ){2,12}$`),
  new RegExp(`${L}(wohnung|haus|zimmer|kinderzimmer|küche|flur|keller|treppenhaus|bad) (ist )?(ganz )?(voller|voll mit|voll) (rauch|qualm)${R}`),
  new RegExp(`${L}(rauchmelder|feuermelder|brandmelder) (${WORD} )?(piept|piepst|pfeift|heult|klingelt|schrillt|geht los|ist losgegangen|macht alarm)${R}`),
  // Notrufnummer in Ziffern oder Worten, wie die Erkennung sie schreibt
  new RegExp(`${L}(ruf|ruft|rufen|rufe|anrufen|wählen|wähl|wähle) (bitte |mal |schnell |sofort )?(die )?${EMERGENCY_NUMBER}${R}`),
  new RegExp(`${L}${EMERGENCY_NUMBER} (anrufen|rufen|wählen)${R}`),
  // Aus Abschnitt 7.2 von docs/Sicherheitsweiche-Pruefung.md (dort bisher unerkannt), soweit eindeutig:
  // Zeigen und Nicht-Aufhören gegen den Willen, Ansprechen und Locken durch Fremde, Fotos,
  // Weglaufen, Wertlosigkeit, Angst allein zu Hause, Herd angelassen, Blutung am Kopf, Hilferuf auf Englisch.
  new RegExp(`${L}(zeigt|zeigte|zeigen) mir (${WORD} ){0,2}(sachen|dinge|bilder|videos|fotos|filme)( ${WORD}){0,3} (die|was) ich nicht sehen (will|wollte|mag|mochte|möchte|darf|durfte|soll|sollte)${R}`),
  new RegExp(`${L}(er|sie) soll aufhören( ${WORD}){0,4} (er|sie) hört (einfach |trotzdem |immer noch |gar )?nicht auf${R}`),
  new RegExp(`${L}(ein mann|eine frau|ein typ|ein junge|ein großer)( ${WORD}){0,4} (hat|haben) mich (${WORD} ){0,2}angesprochen${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,4} (hat|haben|wollte|will) mir (${WORD} ){0,2}(süßigkeiten|bonbons|schokolade|geld|eis|geschenke|ein geschenk|spielzeug|ein handy) (angeboten|anbieten)${R}`),
  new RegExp(`${L}(jemand|einer|ein mann|eine frau|ein fremder|eine fremde|ein typ|der mann|die frau|der fremde|die fremde|der typ|dieser mann)( ${WORD}){0,3} (will|wollte|möchte) (${WORD} ){0,2}(fotos|bilder|videos|ein foto|ein bild|ein video) von mir${R}`),
  new RegExp(`${L}ich (will|möchte|werde) (${FILL} ){0,2}(von zu hause |von zuhause |von daheim )?weglaufen${R}`),
  new RegExp(`${L}ich (laufe|lauf|renne|renn|haue|hau) (${WORD} ){0,2}(von zu hause|von zuhause|von daheim) (weg|ab)${R}`),
  new RegExp(`${L}ich hasse mein leben${R}`),
  // Wie „ich will nicht mehr“ (nur am Satzende oder vor einem neuen Satzteil). Nicht: „nicht mehr weiter hören“,
  // „ich will nicht mehr weiter, ich will eine andere Geschichte“. Ausgenommen ist nur dieser Wunsch, nicht jedes
  // „erzählen“ oder „hören“ („Ich kann nicht mehr weiter, ich muss dir was erzählen“ schlägt an).
  new RegExp(`${L}ich (will|kann|mag) (${FILL} ){0,2}nicht mehr weiter(?= *$| ${CONTINUATION}${R})(?! (und |aber |also |sondern )?(ich (will|möchte|mag|hätte) |erzähl mir |lieber |bitte |kannst du )(${WORD} ){0,3}((andere|anderen|neue|neuen|nächste|nächsten) (geschichte|folge)|(was|etwas) anderes (hören|erzählen))${R})`),
  new RegExp(`${L}ich bin (${WORD} ){0,2}(zu nichts|für nichts) (nütze|gut|zu gebrauchen)${R}`),
  new RegExp(`${L}ich (glaube|glaub) ${ART}${PERSON_WIDE} ist tot${R}`),
  new RegExp(`^(?=.*${L}angst${R}).*${L}(allein|alleine) (zu hause|zuhause|daheim)${R}`),
  new RegExp(`${L}(herd|herdplatte|kochplatte|ofen|backofen|bügeleisen|grill) (${WORD} ){0,2}(angelassen|an gelassen|nicht ausgemacht|nicht ausgeschaltet)${R}`),
  new RegExp(`${L}(krieg|kriege|bekomme|bekomm) (den|das|die) (herd|ofen|backofen|bügeleisen|gas) nicht (mehr )?aus${R}`),
  new RegExp(`${L}(mein|meine|sein|seine|ihr|ihre|der|die) (kopf|ohr|stirn|hals|bauch) blutet${R}`),
  new RegExp(`^((bitte )?(help|help me)( please)? ){1,5}$`),
  new RegExp(`${L}help (me|i am lost|im lost|i m lost)${R}`),
  // Nachtrag nach der unabhängigen Prüfung vom 20.11.2026 (PR #71).
  // Perfekt mit Wörtern dazwischen („Papa hat mich wieder geschlagen“). Nur „geschlagen“ heißt auch
  // „im Spiel besiegt“; deshalb nur dort eine enge Ausnahme für genannte Spiele und Spielstände.
  // Die Ausnahmen gelten nur für die Wörter zwischen „mich“ und dem Partizip: „Papa hat mich gestern geschlagen,
  // weil ich beim Fußball verloren habe“ schlägt an.
  // Steht das Spiel direkt vor „hat“ („Beim Memory hat Papa mich geschlagen“), gilt die Ausnahme auch.
  new RegExp(`${L}(?<!${L}(beim|im|bei|in) ${GAME} )(hat|haben|hatte|hatten) (${SUBJ} )?(mich|uns) ((?!((beim|im|bei|in) ${GAME}|knapp|haushoch|zu ${NUM})${R})${WORD} ){0,6}geschlagen${R}`),
  // Mit Trainer, Lehrer, Betreuer oder einem fremden Mann gilt keine Spiel-Ausnahme.
  new RegExp(`^(?=.*${L}(trainer|trainerin|lehrer|lehrerin|erzieher|erzieherin|betreuer|betreuerin|mann|fremde|fremder|typ)${R}).*${L}(hat|haben|hatte|hatten) (${SUBJ} )?(mich|uns) (${WORD} ){0,6}geschlagen${R}`),
  new RegExp(`${L}(hat|haben|hatte|hatten) (${SUBJ} )?(mich|uns) ((?!(aus versehen|ausversehen)${R})${WORD} ){0,6}(gehauen|gehaut|gehaun|getreten|gewürgt|verhauen|verprügelt|geohrfeigt|eingesperrt)${R}`),
  // Übergriffe im Perfekt und im Hauptsatz nach „aber“ und „und“
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mich (${WORD} ){0,2}(da unten|untenrum|am po|am popo|zwischen den beinen|an der brust|an meinem ${KID_BODY}|am ${KID_BODY}|an der ${KID_BODY}|unter der (decke|bettdecke|hose|unterhose)) (${WORD} )?(berührt|gestreichelt|angefasst|angegrapscht|angegrabscht|begrapscht|begrabscht|geküsst)${R}`),
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mich (${WORD} ){0,2}(geküsst|gestreichelt|berührt|angefasst|angegrapscht|begrapscht|ausgezogen)( ${WORD}){0,4} ${UNWANTED}${R}`),
  new RegExp(`${L}(küsst|küsste|küssen|streichelt|streichelte|streicheln|berührt|berührte|berühren|fasst|fasste|fassen) mich( ${WORD}){0,4} (aber|und) ich (will|wollte|mag|mochte|möchte) (das|es) (gar )?nicht${R}`),
  new RegExp(`${L}(hat|haben|hatte) (${WORD} ){0,2}(komische|eklige|ekelige|ekelhafte|schlimme|unangenehme|geheime|seltsame) (sachen|dinge|spiele|spielchen) mit mir (${WORD} )?gemacht${R}`),
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mir (${WORD} ){0,2}(sachen|dinge|bilder|videos|fotos|filme) gezeigt( ${WORD}){0,3} (die|was) ich nicht sehen (will|wollte|mag|mochte|möchte|darf|durfte|soll|sollte)${R}`),
  // Drohung in umgekehrter Wortstellung („Wenn ich das sage, bringt er mich um“). Nicht: „um acht“.
  new RegExp(`${L}(bringt|bringen|würde|wird) (${POSS}${PERSON_WIDE}|er|sie|der|die) (mich|uns) (${WORD} )?um(?= *$| (wenn|weil|und|aber|falls|sonst|sagt|hat|ich|er|sie)${R})`),
  // Hilferuf als ganze Äußerung mit Anrede („Kunibert, hilf mir!“, „Mama, Hilfe!“, „Hilfe, Feuer!“)
  new RegExp(`^(?=.*${L}(hilfe|hilf mir|helft mir|hilf uns|helft uns)${R})((hilfe|hilf mir|helft mir|hilf uns|helft uns|bitte|feuer|schnell|polizei|feuerwehr|krankenwagen|notarzt|ritter|kunibert|mama|mami|papa|papi|oma|omi|opa|opi|jemand|irgendjemand|irgendwer) ){1,12}$`),
  // „Der Mann macht mir Angst“. Nicht: „der Mann im Film“ (nur direkt hinter „Mann“ ausgenommen).
  new RegExp(`${L}(der|dieser|ein|so ein) (fremde |fremder |komische |komischer |große |großer )?(mann|typ|junge) (?!(im|in dem|in der|aus dem|aus der|in einem|in einer) (film|fernsehen|fernseher|buch|geschichte|traum|albtraum|märchen|serie|comic)${R})(${WORD} ){0,3}macht mir (${WORD} ){0,2}angst${R}`),
  // Werfen im Perfekt, Locken im Präsens
  new RegExp(`${L}(hat|haben|hatte) ((?!(schneeball|schneebälle|schneebällen|ball|bälle|bällen|kissen|wasserbombe|wasserbomben|konfetti|laub|blätter)${R})${WORD} ){0,3}nach (mir|uns) (geworfen|geschmissen)${R}`),
  // Spielsachen mit Steinen oder Glas zählen wieder („Schneebälle mit Steinen“)
  new RegExp(`^(?=.*${L}(stein|steine|steinen|steinchen|glas|gläser|gläsern|flaschen|messer|messern)${R}).*${L}(hat|haben|hatte) (${WORD} ){0,4}nach (mir|uns) (geworfen|geschmissen)${R}`),
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mit (tellern|gläsern|flaschen|messern|stühlen|sachen|gegenständen) (${WORD} )?(geworfen|geschmissen)${R}`),
  // Gewalt zwischen Erwachsenen mit Artikel („Papa schlägt die Mama“)
  new RegExp(`${L}${POSS}${PARENTS} (schlägt|haut|tritt|würgt|verprügelt|verhaut) (der|die|den|dem) ${PERSON_WIDE}${R}`),
  // „Ich will nicht mehr weiterleben“ (ohne Ausnahme)
  new RegExp(`${L}ich (will|möchte|mag|kann|wollte) (${FILL} ){0,2}nicht (mehr )?(weiterleben|weiter leben)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,4} (bietet|bot|bieten) mir (${WORD} ){0,2}(süßigkeiten|bonbons|schokolade|geld|eis|geschenke|ein geschenk|spielzeug|ein handy) an${R}`),
];

// Prüfung der vierten Probe (22.11.2026, Prüfung von PR #71): naheliegende Abwandlungen, die vorher keine
// Ansage auslösten. Nur zusätzliche Schablonen; keine ältere wird enger. Beispiele in beiden Listen von
// safety.test.ts und in docs/Sicherheitsweiche-Pruefung.md, Abschnitt 10.
// Füllwörter vor dem Kern bei Atemnot („ich krieg plötzlich keine Luft“, „ich kann auf einmal nicht mehr atmen“).
// Umfasst die Füllwörter der älteren Schablonen dieses Blocks (Prüfung von PR #98, 23.11.2026).
const ADV = '((gerade|grad|grade|fast|ganz|so|voll|echt|irgendwie|plötzlich|auf einmal|jetzt|schon wieder|wieder|gar|einfach|wirklich|überhaupt|sehr|total|halt|schon|richtig) ){0,2}';
// „vor (lauter) Lachen“ nimmt nur aus, wenn es direkt vor dem Verb oder direkt nach „Luft“ und „atmen“ steht.
const NOT_AFTER_LAUGH = `(?<!${L}vor (lauter )?lachen )`;
const NOT_BEFORE_LAUGH = `(?!( mehr)? vor (lauter )?lachen${R})`;
const STRANGER = `(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|fremde|fremder)`;
const GIFT = '(gummibärchen|lolli|lollis|lutscher|kaugummi|bonbon|bonbons|schokoriegel|süßigkeiten|schokolade|süßes|geld|eis|ein eis|geschenke|ein geschenk|spielzeug|ein handy|handy|euro|([0-9]+ )?euro)';
const KILL_TRY = `(versucht|versuchte|versuchen|probiert) (${WORD} )?(mich|uns|${ART}${PERSON_WIDE}) (${WORD} ){0,2}(zu töten|umzubringen|zu erwürgen|tot zu machen|totzumachen)`;
// Für V13 (Prüfung von PR #110 nach dem Merge, 24.11.2026). Nur in neuen Schablonen; ältere bleiben, wie sie sind.
const PERP = `(${POSS}${PARENTS}|er|sie|die|der|${POSS}(stiefvater|stiefmutter|stiefpapa|stiefmama|onkel|tante|opa|oma|opi|omi|großvater|großmutter|nachbar|nachbarin|babysitter|babysitterin|lehrer|lehrerin|trainer|trainerin|erzieher|erzieherin|freund)|(mamas|mamis|papas|papis|muttis|vatis|omas|opas) (neuer |neue )?(freund|freundin|mann|frau)|(der|ein|dieser) (${WORD} )?(mann|typ))`;
const VICTIM = `(sie|ihn|das baby|unser baby|${ART}(kleine |kleinen |kleiner |große |großen |großer )?(${PERSON_WIDE}|baby|geschwister|kinder|brüder|schwestern)|(sein|seine|seinen|ihr|ihre|ihren) (frau|freundin|mann|freund|sohn|tochter|kinder|kind|baby))`;
// Wörter zwischen Verb und Opfer („Er schlägt immer meine Mama“)
const VADV = '((gerade|grad|grade|immer|immer wieder|oft|manchmal|dauernd|ständig|wieder|schon wieder|jetzt|auch|einfach|ganz|richtig|total|voll|echt|nachts|abends|heute|gestern) ){0,2}';
const SMALL_VICTIM = `(mich|das baby|unser baby|${ART}(kleine |kleinen |kleiner )?(baby|bruder|schwester|geschwister))`;
const KILL_TRY_WIDE = `(versucht|versuchte|versuchen|probiert) (${WORD} )?(mich|uns|das baby|${ART}${PERSON_WIDE}) (${WORD} ){0,4}(zu töten|umzubringen|zu erwürgen|zu würgen|zu erdrosseln|tot zu machen|totzumachen|zu ersticken|zu vergiften|zu ertränken|zu erschlagen|zu erstechen|abzustechen|zu erschießen)`;
// Nach „um“ keine Uhrzeit, kein Artikel, keine Bitte („bringt mich um acht zur Schule“, „um den Schlaf“, „um Hilfe“)
const UM_NOT_TIME = `(?! (${NUM}|elf|zwölf|[0-9]+|halb|viertel|punkt|kurz|etwa|ungefähr|circa|den|die|das|dem|der|des|ein|eine|einen|einem|einer|mein|meine|meinen|meinem|dein|deine|deinen|sein|seine|seinen|seinem|ihr|ihre|ihren|ihrem|unser|unsere|unseren|unserem|zu|mitternacht|mittag|(hilfe|erlaubnis|verzeihung|entschuldigung|rat|geld|etwas|was) (${WORD} )?(bitten|fragen|gebeten|gefragt|rufen|gerufen|betteln))${R})`;
const BREATH_NEG = '(nicht|kaum|nicht mehr|nicht richtig|nicht mehr richtig|ganz komisch|so komisch|komisch)';
const LUFT_NEG = '(nicht mehr so richtig|nicht mehr richtig|nicht mehr genügend|nicht mehr genug|nicht mehr gut|nicht mehr so gut|nicht so richtig|nicht genügend|nicht so gut|nicht gut|nicht mehr)';
const FILL_LOST = '(einfach|nur|noch|lieber|jetzt|gleich|endlich|auch|bald|schon|mal|halt|echt|wirklich|so|ganz|gar|überhaupt|grad|grade|gerade|irgendwie)';
const TOUCH_SUBJ = `(er|sie|der|die|${POSS}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|fremde|fremder|junge))`;
const TOUCH_VERB = '(anfasst|anfassen|an fasst|küsst|streichelt|berührt|auszieht)';
const RELATIVE = `(oma|opa|omi|opi|großmutter|großvater|${PARENTS})`;
const PLACE =
  `(im|in der|in dem|am|auf dem|auf der|beim|bei der|an der|vor dem|vor der) (${WORD} )?` +
  '(supermarkt|laden|kaufhaus|geschäft|einkaufszentrum|zug|bus|bahnhof|schwimmbad|zoo|park|wald|spielplatz|strand|markt|' +
  'weihnachtsmarkt|jahrmarkt|rummel|kirmes|freizeitpark|flughafen|krankenhaus|stadt|menge|gedränge|straße|parkplatz|parkhaus|' +
  'kino|museum|schule|kindergarten|kita|fest|festival|konzert|stadion|ubahn|u bahn|s bahn|straßenbahn|haltestelle|bushaltestelle|' +
  'see|meer|hafen|garten|feld|[a-zäöüß]*(bad|park|platz|markt|halle|zentrum|hof))';
// Für V14 (Prüfung von PR #115 nach dem Merge, 25.11.2026). Nur in neuen Schablonen; ältere bleiben, wie sie sind.
// Opfer einer Drohung, auch zwei („Er bringt Mama und mich um“)
const THREAT_VICTIM = `(mich|uns|${ART}${PERSON_WIDE}|das baby|unser baby|sie|ihn)`;
// Nur Füllwörter zwischen Opfer und „um“ („Er bringt Mama bestimmt noch um“); nicht „bringt mich zum Bahnhof, um …“
const THREAT_FILL = '((bestimmt|sicher|wirklich|echt|noch|nochmal|irgendwann|bald|gleich|heute|morgen|doch|schon|wohl|mal|auch|einfach|jetzt|dann|richtig|eines|tages) ){0,2}';
// Nach „um“ beginnt ein neuer Satz („Er bringt mich um, das hat er gesagt“, „Er bringt mich um, meine Mama hat Angst“)
const UM_NEW_CLAUSE = ` ((das|dies) (hat|hatte|haben|hab|habe|sagt|sagte|meint|meinte|schreit|schrie|brüllt|brüllte)|((mein|meine|meinen|der|die|den|unser|unsere|unseren) )?${PERSON_WIDE} (hat|hatte|ist|war|weint|schreit|sagt|sagte|kann|will|weiß))${R}`;
const PERP_WOMAN = `(die|eine|diese) (${WORD} )?frau`;
const STRANGER_START = '(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)';
const WITH_HIM = '(mit ihm|mit ihr|zu ihm|zu ihr|mit zu ihm|mit zu ihr)';
const HOME = '(nach hause |heim |zu sich |zu sich nach hause )?';
// Figuren aus Geschichten und Tiere zählen bei der Berührung nicht als Täter („Ich will nicht, dass der Drache mich anfasst“)
const FICTION =
  '(drache|drachen|monster|gespenst|geist|hexe|riese|zwerg|troll|zauberer|zauberin|ritter|kunibert|prinzessin|prinz|frosch|' +
  'könig|königin|fee|einhorn|skelett|vampir|zombie|ungeheuer|pferd|hund|katze|wolf|bär|löwe|tiger|krokodil)';
// Berufe, bei denen Anfassen dazugehört („Ich hab Angst, wenn der Arzt mich anfasst“ bleibt ruhig, wie vorher)
const CARE = '(arzt|ärztin|doktor|doktorin|zahnarzt|zahnärztin|kinderarzt|kinderärztin|krankenschwester|pfleger|pflegerin|friseur|friseurin)';
// Täter bei Berührung, auch mit Artikel, „jemand“ und Namen („wenn der Trainer mich anfasst“, „wenn Onkel Peter mich anfasst“)
const TOUCH_SUBJ_WIDE = `(${TOUCH_SUBJ}|jemand|einer|irgendwer|irgendjemand|man|((der|die|ein|eine|dieser|diese|mein|meine|unser|unsere) )?(?!(${FICTION}|${CARE})${R})${WORD}( (?!(${FICTION}|${CARE})${R})${WORD})?)`;
const TOUCH_PAST = '(angefasst|angegrapscht|angegrabscht|begrapscht|begrabscht|geküsst|gestreichelt|berührt|ausgezogen)';
// Orte, auch mit „hier“ oder „da“ davor („hier im Park“) und mit mehr Läden („beim Bäcker“)
const PLACE_WIDE =
  `((hier|da|dort) )?(${PLACE}|(im|in der|in dem|am|auf dem|auf der|beim|bei der|an der|vor dem|vor der) (${WORD} )?` +
  '(bäcker|bäckerei|metzger|metzgerei|apotheke|arzt|ärztin|friseur|drogerie|kiosk|tankstelle|eisdiele|café|cafe|restaurant|' +
  'toilette|klo|umkleide|garderobe|kasse|eingang|ausgang|treppe|rolltreppe|aufzug)|hier|da|dort)';
// Ohne Zunge und Lippe: „Ich beiße mir extra auf die Zunge, damit ich nicht lache“
const SELF_BODY = '(arm|arme|bein|beine|finger|hand|handgelenk|haut|bauch|oberschenkel|knie|wange|daumen)';

const PATTERNS_REVIEW: RegExp[] = [
  // V12 Vorab-Prüfung von PR #110 (24.11.2026): Gewalt gegen Mutter, Geschwister und Baby im Präsens, gegen „die Kinder“
  new RegExp(`${L}${POSS}${PARENTS} (schlägt|haut|tritt|würgt|verprügelt|verhaut|boxt|schubst) (sie|ihn|das baby|unser baby|${ART}(kleine |kleinen |kleiner |große |großen |großer )?(${PERSON_WIDE}|geschwister|kinder|brüder|schwestern))${R}`),
  new RegExp(`${L}(${POSS}${PARENTS}|er|sie) (hat|hatte) (${WORD} )?${ART}(kleine |kleinen |kleiner |große |großen |großer )?(geschwister|kinder|brüder|schwestern) (${WORD} ){0,8}(geschlagen|gehauen|getreten|gewürgt|verprügelt|verhauen|geboxt|geschubst)${R}`),
  // V1 Übergriffe: weibliche Beugung, Perfekt mit „mir … gefasst“, Kinderwörter, „Nein gesagt“, „wenn er mich anfasst“
  new RegExp(`${L}(berührt|berühren|streichelt|streicheln|fasst|fassen|grapscht|grabscht|küsst|küssen) mich (${WORD} ){0,2}an (meiner|meinem|meinen|der|dem|den) (${KID_BODY}|mumu|puller|vulva|po|popo|brust|busen)${R}`),
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mir (${WORD} ){0,2}(an|in) (mein|meinen|meine|den|die|das) (${KID_BODY}|mumu|puller|vulva|po|popo|brust|busen|unterhose|hose) (gefasst|gegriffen|gelangt|gefummelt|gegrapscht|gegrabscht)${R}`),
  new RegExp(`${L}(fasst|fassen|fasste|greift|greifen|griff|langt|langen) mir (${WORD} ){0,2}(an|in) (mein|meinen|meine|den|die|das) (mumu|puller|vulva|busen)${R}`),
  new RegExp(`^(?=.*${L}(küsst|küsste|küssen|streichelt|streichelte|streicheln|berührt|berührte|berühren|fasst|fasste|fassen|geküsst|gestreichelt|angefasst|ausgezogen)${R}).*${L}(obwohl|aber|und|dabei|weil) ich (hab |habe |hatte )?(${WORD} ){0,2}(nein|stopp|stop|hör auf) (gesagt|sage|sag|gerufen|rufe|geschrien|schreie)${R}`),
  new RegExp(`${L}ich (habe|hab) (${WORD} ){0,2}(nein|stopp|stop|hör auf)( ${WORD}){0,2} (gesagt|gerufen|geschrien)( ${WORD}){0,3} (aber|und) ${SUBJ} ((hört|macht) (${WORD} ){0,2}(nicht auf|weiter)|(hat|hatte) (${WORD} ){0,2}(nicht aufgehört|weitergemacht|weiter gemacht))${R}`),
  new RegExp(`${L}ich (mag|will|möchte) (es |das )?nicht( mehr)? (dass|wenn) (er|sie|der|die|${POSS}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|fremde|fremder|junge)) mich (${WORD} ){0,3}(anfasst|anfassen|an fasst|küsst|streichelt|berührt|auszieht)${R}`),
  // V2 Gewalt: Perfekt mit Artikel vor der Person („Papa hat die Mama geschlagen“)
  new RegExp(`${L}(${POSS}${PARENTS}|er|sie|${POSS}(stiefvater|stiefmutter|stiefpapa|stiefmama|onkel|tante|opa|oma|opi|omi|großvater|großmutter|nachbar|nachbarin|babysitter|babysitterin|lehrer|lehrerin|trainer|trainerin|erzieher|erzieherin)|(der|ein|dieser) (${WORD} )?(mann|typ)) (hat|hatte) (${WORD} )?(sie|ihn|das baby|unser baby|${ART}(kleine |kleinen |kleiner |große |großen |großer )?${PERSON_WIDE}) (${WORD} ){0,8}(geschlagen|gehauen|gehaut|gehaun|getreten|gewürgt|verprügelt|verhauen|geohrfeigt|geboxt|geschubst)${R}`),
  // V3 Drohung mit „töten“
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie|der|die|jemand|${STRANGER}) (tötet|tötete) (mich|uns)${R}`),
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie|der|die|jemand|${STRANGER}) (will|wollte|wird|würde|möchte) (mich|uns|${ART}${PERSON_WIDE}) (${WORD} ){0,3}(töten|totmachen|tot machen|erwürgen|ersticken|umbringen)${R}`),
  // V4 Fremde: „gefragt, ob ich mitkomme“, „mit ihm gehen“, Kinderwörter für Süßes, Ort beim Ansprechen, Fotos gemacht
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (ob|dass|wenn) ich (mit ihm |mit ihr )?((mitkomme|mitgehe|mitfahre|einsteige|ins auto steige)|(mitkommen|mitgehen|mitfahren|einsteigen|ins auto steigen|mit ihm gehen|mit ihr gehen|mit ihm kommen|mit ihr kommen) (will|möchte|soll|muss|würde|kann|darf))${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (ich soll|ich muss|dass ich) (mit ihm|mit ihr|mit zu ihm|mit zu ihr) (gehen|gehe|kommen|komme|fahren|fahre)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,4} (hat|haben|wollte|will|bietet|bot) mir (${WORD} ){0,2}${GIFT} (angeboten|anbieten|an|geschenkt|schenken|gegeben|geben|gekauft|kaufen|versprochen|versprechen)${R}`),
  new RegExp(`${L}((ein|eine) (${WORD} )?(mann|frau|typ|junge)|ein großer|ein fremder|eine fremde)( ${WORD}){0,4} (hat|haben) mich (${WORD} ){0,5}angesprochen${R}`),
  new RegExp(`${L}(jemand|einer|ein mann|eine frau|ein fremder|eine fremde|ein typ|der mann|die frau|der fremde|die fremde|der typ|dieser mann)( ${WORD}){0,3} (hat|haben|hatte) (${WORD} ){0,2}(fotos|bilder|videos|ein foto|ein bild|ein video) von mir (${WORD} )?gemacht${R}`),
  // V5 Weglaufen im Perfekt, „abhauen“
  new RegExp(`${L}(ich bin|bin ich) (${WORD} ){0,3}(von zu hause|von zuhause|von daheim) (${WORD} ){0,2}(weggelaufen|abgehauen|weggerannt)${R}`),
  new RegExp(`${L}ich (will|möchte|werde) (${FILL} ){0,2}(von zu hause |von zuhause |von daheim )?(abhauen|weg laufen|wegrennen)${R}`),
  // V6 Atemnot, Verschlucken, blau, Hundebiss mit zusammengesetztem Wort
  new RegExp(`${L}${NOT_AFTER_LAUGH}ich (habe|hab|bekomme|bekomm|kriege|krieg) ${ADV}(keine|kaum|schwer|nur schwer|nicht genug|nicht richtig|schlecht|nur schlecht|fast keine|so gut wie keine|wenig|zu wenig|nur wenig)( noch)? luft${NOT_BEFORE_LAUGH}( mehr)?${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}ich kann ${ADV}(nicht|nicht mehr|gar nicht|kaum|nur schwer|ganz schwer|schwer|nicht mehr richtig|nicht mehr gut|nicht richtig|schlecht|nur schlecht|nicht gut|nicht so gut|überhaupt nicht|nur noch schwer) (noch |mehr |richtig )?atmen${NOT_BEFORE_LAUGH}${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) (kriegt|bekommt|hat) ${ADV}(keine|kaum|schlecht|schwer|nicht genug|nicht richtig)( noch)? luft${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) kann ${ADV}(kaum|nicht|nicht mehr|gar nicht|nicht richtig|nicht gut|schlecht) (noch |mehr )?atmen${R}`),
  new RegExp(`${L}${SMALL_PERSON} (habe|hab|hat) (was|etwas|irgendwas|irgendetwas|${WORD} magneten|magneten|münzen|knöpfe) (${WORD} )?(verschluckt|in die nase gesteckt|ins ohr gesteckt)${R}`),
  new RegExp(`${L}(das baby|${SMALL_PERSON}|${WHO}) (ist|wird) (ganz |so |total )?(blau|lila)(?= *$| (und|aber|weil|im|an)${R})`),
  new RegExp(`${L}[a-zäöüß]*(hund|katze|schlange|ratte|pferd)( ${WORD}){0,3} (hat|hatte) (mich|uns|ihn|sie|das baby|${ART}(kleine |kleinen |kleiner |große |großen |großer )?${PERSON_WIDE}) (${WORD} ){0,2}gebissen${R}`),
  // V7 Wertlos, Leben hassen (Kurzform), Tod mit „ich glaube“
  new RegExp(`${L}ich (hasse|hass) (mein|das) (${WORD} )?leben${R}`),
  new RegExp(`${L}ich bin (${WORD} ){0,2}(wertlos|nutzlos|zu nix nütze|für nix gut)${R}`),
  new RegExp(`${L}ich (glaube|glaub) ${ART}${PERSON_WIDE} (ist (${WORD} )?gestorben|lebt nicht mehr)${R}`),
  // V8 Oma und Opa verloren
  new RegExp(`${L}ich (habe|hab) (${POSS}|(die|den|unsere|unseren) )(oma|opa|omi|opi|großmutter|großvater|${PARENTS}) (${WORD} ){0,3}verloren${R}`),
  new RegExp(`${L}(finde|find|sehe|seh) (${POSS}|(die|den|unsere|unseren|unser) )(oma|opa|omi|opi|großmutter|großvater|${PARENTS})( ${WORD})? (nicht( mehr| wieder)?|nirgends|nirgendwo)(?= *$| ${CONTINUATION}${R})`),
  // V9 Hilferuf mit „hallo“, „doch“, „komm“; Notruf mit zwei Füllwörtern
  new RegExp(`^(?=.*${L}(hilfe|hilf mir|helft mir|hilf uns|helft uns)${R})((hilfe|hilf mir|helft mir|hilf uns|helft uns|bitte|feuer|schnell|polizei|feuerwehr|krankenwagen|notarzt|ritter|kunibert|mama|mami|papa|papi|oma|omi|opa|opi|jemand|irgendjemand|irgendwer|hallo|doch|komm|kommt|oh|nein) ){1,12}$`),
  new RegExp(`${L}(ruf|ruft|rufen|rufe|anrufen|wählen|wähl|wähle) ((bitte|mal|schnell|sofort|jetzt|gleich) ){0,3}(die )?${EMERGENCY_NUMBER}${R}`),
  // V10 Nach der unabhängigen Prüfung dieses Blocks (22.11.2026): „an meiner“ im Perfekt, Drohung im Nebensatz,
  // „schenkt mir“, „gegeben“, „hat nicht aufgehört“, Verb vor dem Subjekt („Irgendwie krieg ich keine Luft“), „und kriegt keine Luft“
  new RegExp(`${L}(hat|haben|hatte) (${SUBJ} )?mich (${WORD} ){0,2}(an|am) (meiner|meinem|meinen|der|dem|den|die) (${KID_BODY}|mumu|puller|vulva|po|popo|brust|busen) (${WORD} )?(berührt|gestreichelt|angefasst|angegrapscht|angegrabscht|begrapscht|begrabscht|geküsst)${R}`),
  new RegExp(`${L}(dass|wenn|sonst|weil|ob) (er|sie|jemand|${POSS}${PERSON_WIDE}|der mann|die frau|der typ) (mich|uns) (${WORD} )?(tötet|töten will|töten wird|töten wollte|umbringt|umbringen will|umbringen wird|totmacht|tot macht)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,4} (schenkt|schenkte|gibt|gab) mir (${WORD} ){0,2}${GIFT}${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}(krieg|kriege|bekomm|bekomme|habe|hab) ich ${ADV}(keine|kaum|schwer|nur schwer|schlecht|nicht genug|nicht richtig|nur schlecht|fast keine|so gut wie keine|wenig|zu wenig|nur wenig)( noch)? luft${NOT_BEFORE_LAUGH}( mehr)?${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}(kann|konnte) ich ${ADV}(nicht|kaum|nur schwer|schwer|nicht mehr|nicht richtig|schlecht|nur schlecht|nicht gut|nicht so gut|überhaupt nicht) (mehr |richtig )?atmen${NOT_BEFORE_LAUGH}${R}`),
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}(habe|hab) ich (mir|mich) ((?!(haare|nägel|fingernägel|fußnägel|pony|bart|brot|apfel|papier)${R})${WORD} ){0,6}(geschnitten|geritzt|verletzt|wehgetan|weh getan|verbrannt|gekratzt)${R}`),
  new RegExp(`^(?=.*${L}(${WHO}|das baby|${POSS}baby)${R}).*${L}(und|aber) (kriegt|bekommt) (gerade |ganz |so |jetzt |gar |plötzlich )?(keine|kaum|schwer|nur schwer|schlecht|nicht genug|nicht richtig)( noch)? luft( mehr)?${R}`),
  // V12: Atemnot nach „und“ ohne neues Subjekt („Ich hab mich verschluckt und krieg keine Luft“)
  new RegExp(`^(?=.*${L}ich${R}).*${L}${NOT_AFTER_LAUGH}(und|aber) (jetzt |dann |da )?(krieg|kriege|bekomm|bekomme) ${ADV}(keine|kaum|schwer|nur schwer|schlecht|nicht genug|nicht richtig|fast keine|so gut wie keine)( noch)? luft${NOT_BEFORE_LAUGH}( mehr)?${R}`),
  new RegExp(`^(?=.*${L}ich${R}).*${L}${NOT_AFTER_LAUGH}(und|aber) (jetzt |dann |da )?kann ${ADV}(nicht|nicht mehr|gar nicht|kaum|nur schwer|schwer|nicht richtig|schlecht|nicht gut) (noch |mehr |richtig )?atmen${NOT_BEFORE_LAUGH}${R}`),
  // V11 Prüfung von PR #98 nach dem Merge (23.11.2026): naheliegende Abwandlungen, die vorher keine Ansage auslösten.
  // Beispiele in beiden Listen von safety.test.ts und in docs/Sicherheitsweiche-Pruefung.md, Abschnitt 11.
  // „Ich kann meine Mama nicht finden“ (Befund 2)
  new RegExp(`${L}ich kann (${FILL} ){0,2}(${POSS}|(die|den|unsere|unseren|unser) )(oma|opa|omi|opi|großmutter|großvater|${PARENTS})( und ${POSS}(oma|opa|omi|opi|${PARENTS}))?( ${WORD}| (im|in der|in dem|am|auf dem) (supermarkt|laden|kaufhaus|geschäft|einkaufszentrum|zug|bus|bahnhof|schwimmbad|zoo|park|wald))? (nicht|nirgends|nirgendwo) (mehr )?finden${R}`),
  // „Er hat versucht, mich zu töten“, nur mit einer Person als Subjekt: „Der Drache hat versucht, uns umzubringen“ ist eine Geschichte (Befund 3)
  new RegExp(`${L}${SUBJ} ((hat|hatte) (${WORD} ){0,2})?(${KILL_TRY}|(mich|uns) (versucht|versuchte|probiert) (zu töten|umzubringen|zu erwürgen|tot zu machen|totzumachen))${R}`),
  new RegExp(`${L}(hat|hatte) (er|sie|jemand|einer|man|${ART}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|junge|fremde|fremder)) (${WORD} ){0,2}${KILL_TRY}${R}`),
  // Fremde: „ob ich mit ihm gehe“, „ob ich in sein Auto steige“, Fotos und Filme (Befund 5)
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (ob|dass|wenn) ich (mit ihm gehe|mit ihr gehe|mit zu ihm komme|mit zu ihr komme|mit zu ihm gehe|mit zu ihr gehe|in sein auto steige|in ihr auto steige|in das auto steige|ins auto komme|in sein auto einsteige|in ihr auto einsteige|ins auto einsteige|mit ihm in sein auto steige|mit zu ihm nach hause komme|zu ihm ins auto steige|zu ihr ins auto steige)${R}`),
  new RegExp(`${L}(jemand|einer|ein mann|eine frau|ein fremder|eine fremde|ein typ|der mann|die frau|der fremde|die fremde|der typ|dieser mann)( ${WORD}){0,3} (hat|haben|hatte) mich (${WORD} ){0,3}(fotografiert|gefilmt|geknipst)${R}`),
  new RegExp(`${L}(jemand|einer|ein mann|eine frau|ein fremder|eine fremde|ein typ|der mann|die frau|der fremde|die fremde|der typ|dieser mann)( ${WORD}){0,3} (fotografiert|filmt|knipst) mich${R}`),
  // Ungewollte Berührung: „…, auch wenn ich nein sage“, „Ich hab gesagt, hör auf, aber er hört nicht auf“,
  // „Ich finde es eklig, wenn er mich anfasst“ (Befund 6)
  new RegExp(`^(?=.*${L}(küsst|küsste|küssen|streichelt|streichelte|streicheln|berührt|berührte|berühren|fasst|fasste|fassen|geküsst|gestreichelt|angefasst|ausgezogen|auszieht|zieht mich aus)${R}).*${L}wenn ich (hab |habe |hatte )?(${WORD} ){0,2}(nein|stopp|stop|hör auf) (gesagt|sage|sag|gerufen|rufe|geschrien|schreie)${R}`),
  new RegExp(`${L}ich (habe|hab) (${WORD} ){0,2}gesagt (${WORD} )?(hör auf|stopp|stop|nein)( ${WORD}){0,3} (aber|und) ${SUBJ} ((hört|macht) (${WORD} ){0,2}(nicht auf|weiter)|(hat|hatte) (${WORD} ){0,2}(nicht aufgehört|weitergemacht|weiter gemacht))${R}`),
  new RegExp(`${L}(ich ((finde|find|finds) (es |das |s )?(so |ganz |voll |echt |total |richtig )?(eklig|ekelig|doof|blöd|schlimm|komisch|unangenehm|gruselig)|(hasse|hass) (es|das))|(es|das) ist (so |ganz |voll |echt |total |richtig )?(eklig|ekelig|schlimm|unangenehm|gruselig)|ich (hab|habe) (so |ganz |voll |echt |total |richtig )?angst) (dass|wenn) (er|sie|der|die|${POSS}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|fremde|fremder|junge)) mich (${WORD} ){0,3}(anfasst|anfassen|an fasst|küsst|streichelt|berührt|auszieht)${R}`),
  new RegExp(`${L}ich (sage|sag|rufe|ruf|schreie|schrei) (${WORD} ){0,2}(nein|stopp|stop|hör auf)( ${WORD}){0,3} (aber|und) ${SUBJ} (hört|macht) (${WORD} ){0,2}(nicht auf|weiter)${R}`),
  // Sich selbst verletzen im Präsens, mit denselben Ausnahmen wie im Perfekt (Befund 7)
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich ((tu|tue|mache|mach) mir ((?!(haare|nägel|fingernägel|fußnägel|pony|bart|brot|apfel|papier|nicht|nie)${R})${WORD} ){0,4}weh|(schneide|schneid|ritze|ritz|verletze|verletz|kratze|kratz|verbrenne|verbrenn) mich|(schneide|schneid|ritze|ritz) mir (${WORD} ){0,2}(in|auf) (den|die|das|meinen|meine|mein) (arm|arme|bein|beine|finger|hand|handgelenk|haut|bauch|oberschenkel))${R}`),
  new RegExp(`${L}ich (will|möchte|muss) mir ((?!(nicht|nie)${R})${WORD} ){0,2}(wehtun|weh tun)${R}`),
  // V13 Prüfung von PR #110 nach dem Merge (24.11.2026): naheliegende Abwandlungen neben V11 und V12, die keine
  // Ansage auslösten. Beispiele in beiden Listen von safety.test.ts und in docs/Sicherheitsweiche-Pruefung.md, Abschnitt 12.
  // Atemnot: „Das Baby atmet gar nicht“, „Mama liegt da und atmet gar nicht mehr“, „Ich krieg nicht mehr richtig Luft“ (Befund 1)
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) (atmet|atmen) ${ADV}${BREATH_NEG}( mehr)?${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby)( ${WORD}){0,6} (und|aber|da|dann|jetzt) (jetzt |dann |da |auch )?atmet ${ADV}${BREATH_NEG}( mehr)?${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}(ich (habe|hab|bekomme|bekomm|kriege|krieg)|(krieg|kriege|bekomm|bekomme|habe|hab) ich|(${WHO}|das baby|${POSS}baby) (kriegt|bekommt|hat)) ${ADV}${LUFT_NEG}( noch)? luft${NOT_BEFORE_LAUGH}( mehr)?${R}`),
  new RegExp(`^(?=.*${L}(ich|${WHO}|das baby|${POSS}baby)${R}).*${L}${NOT_AFTER_LAUGH}(und|aber) (jetzt |dann |da )?(krieg|kriege|kriegt|bekomm|bekomme|bekommt) ${ADV}${LUFT_NEG}( noch)? luft${NOT_BEFORE_LAUGH}( mehr)?${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}(ich kann|kann ich|(${WHO}|das baby|${POSS}baby) kann) ${ADV}(keine|kaum|nicht|nicht mehr|nicht richtig|nicht mehr richtig|schlecht|nur schwer|schwer)( noch| mehr)? luft (holen|kriegen|bekommen|reinkriegen|rein kriegen)${NOT_BEFORE_LAUGH}${R}`),
  new RegExp(`${L}(${WHO}|das baby|${POSS}baby) ((hat|hatte) ${ADV}aufgehört|(hört|hörte) ${ADV}auf) zu atmen${R}`),
  // Gewalt durch weitere Personen im Präsens und Perfekt („Er schlägt meine Mama“, „Mamas Freund hat sie geschlagen“),
  // Schütteln („Papa hat das Baby geschüttelt“) (Befund 2). Nicht: Eier aufschlagen, „in die Flucht“, „zum Ritter“, Sahne steif
  // schlagen, Hand schütteln, wachschütteln.
  new RegExp(`${L}${PERP} (schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|boxt|schubst|ohrfeigt) ${VADV}${VICTIM}${R}(?! (auf|vor|nach)( *$| (und|aber|weil|wenn|dann)${R})| (in die flucht|zum ritter|zur ritterin|steif|schaumig)${R})`),
  new RegExp(`${L}${PERP} (hat|hatte|haben|hatten) (${WORD} )?${VICTIM} (${WORD} ){0,8}(?<!flucht )(geschlagen|gehauen|gehaut|gehaun|getreten|gewürgt|verprügelt|verhauen|geohrfeigt|geboxt|geschubst)${R}`),
  new RegExp(`^(?!.*${L}(hand|hände|händchen|kopf|köpfe|wach)${R}).*${L}${PERP} ((hat|hatte|haben|hatten) (${WORD} )?${SMALL_VICTIM} (${WORD} ){0,3}(geschüttelt|durchgeschüttelt)|(schüttelt|schütteln) ${SMALL_VICTIM})${R}`),
  // Drohung gegen andere („er bringt Mama um“), „haben versucht“, „zu ersticken“ (Befund 3)
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie|der|die|jemand) (bringt|bringen|würde|will|wird) (mich|uns|${ART}${PERSON_WIDE}|das baby|unser baby|sie|ihn) (${WORD} )?um${R}${UM_NOT_TIME}`),
  new RegExp(`${L}(dass|wenn|sonst|weil|ob) (er|sie|jemand|${POSS}${PERSON_WIDE}|der mann|die frau|der typ) (${ART}${PERSON_WIDE}|das baby|unser baby|sie|ihn) (${WORD} )?(tötet|töten will|töten wird|töten wollte|umbringt|umbringen will|umbringen wird|totmacht|tot macht|erwürgt|erstickt)${R}`),
  new RegExp(`${L}${SUBJ} ((hat|hatte|haben|hatten) (${WORD} ){0,2})?${KILL_TRY_WIDE}${R}`),
  new RegExp(`${L}(hat|hatte|haben|hatten) (er|sie|jemand|einer|man|${ART}${PERSON_WIDE}|(der|die|ein|eine|dieser|diese) (${WORD} )?(mann|frau|typ|junge|fremde|fremder)) (${WORD} ){0,2}${KILL_TRY_WIDE}${R}`),
  // Fremde: „ob ich mit ihm komme“, „ob ich in sein Auto einsteigen will“ (Befund 4; „10 €“ liest normalize als „10 euro“)
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (ob|dass|wenn) ich (mit ihm|mit ihr|mit zu ihm|mit zu ihr) (nach hause |heim |zu sich |zu sich nach hause )?(komme|gehe|fahre|mitkomme|mitgehe|mitfahre)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden|unbekannter|unbekannte)( ${WORD}){0,8} (ob|dass|wenn) ich (mit ihm |mit ihr |zu ihm |zu ihr )?(in sein|in ihr|in das|in ein|ins) auto (steigen|einsteigen|kommen|mitkommen|mitfahren) (will|möchte|soll|muss|würde|kann|darf|mag)${R}`),
  // Ungewollte Berührung: „Ich mag das gar nicht, wenn …“, „Ich finde es nicht schön, wenn …“ (Befund 5)
  new RegExp(`${L}ich (mag|will|möchte) (es |das )?${ADV}nicht( mehr)? (dass|wenn) ${TOUCH_SUBJ} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  new RegExp(`${L}(das|es) gefällt mir ${ADV}nicht( mehr)? (dass|wenn) ${TOUCH_SUBJ} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  new RegExp(`${L}(ich (finde|find|finds) (es |das |s )?|(es|das) ist )${ADV}nicht (so |sehr |besonders )?(schön|gut|toll|okay|ok|lustig|angenehm) (dass|wenn) ${TOUCH_SUBJ} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  // Verloren: „Mama ist weg, ich kann sie nicht finden“, mehr Orte („auf dem Spielplatz“) (Befund 6)
  new RegExp(`^(?=.*${L}${RELATIVE}${R}).*${L}ich kann (sie|ihn|die beiden|euch) (${FILL_LOST} ){0,2}(nicht|nirgends|nirgendwo) (mehr )?finden${R}`),
  new RegExp(`${L}ich kann (${FILL_LOST} ){0,2}(${POSS}|(die|den|unsere|unseren|unser) )${RELATIVE}( und ${POSS}(oma|opa|omi|opi|${PARENTS}))? ${PLACE} (${FILL_LOST} ){0,2}(nicht|nirgends|nirgendwo) (mehr )?finden${R}`),
  new RegExp(`${L}(finde|find|sehe|seh) (${POSS}|(die|den|unsere|unseren|unser) )${RELATIVE} ${PLACE} (nicht( mehr| wieder)?|nirgends|nirgendwo)(?= *$| ${CONTINUATION}${R})`),
  // Sich selbst verletzen: „Ich beiße mich absichtlich“, „Ich schneide mir absichtlich den Arm auf“ (Befund 7)
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich (beiße|beiß|beisse|beiss|kneife|kneif|zwicke|zwick) mich${R}(?! (nicht|nie)${R})`),
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich (schneide|schneid|ritze|ritz|kratze|kratz|reiße|reiß|beiße|beiß) mir (${WORD} ){0,2}(den|die|das|meinen|meine|mein) (arm|arme|bein|beine|finger|hand|handgelenk|haut|bauch|oberschenkel|knie|lippe|lippen) (auf|kaputt|blutig)${R}`),
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}(ich (habe|hab)|(habe|hab) ich) mir (${WORD} ){0,3}(den|die|das|meinen|meine|mein) (arm|arme|bein|beine|finger|hand|handgelenk|haut|bauch|oberschenkel|knie|lippe|lippen) (${WORD} )?(aufgeschnitten|aufgeritzt|aufgekratzt|aufgebissen|kaputt gekratzt|blutig gekratzt|blutig gebissen)${R}`),
  // V14 Prüfung von PR #115 nach dem Merge (25.11.2026): naheliegende Abwandlungen neben V13, die keine Ansage
  // auslösten. Beispiele in beiden Listen von safety.test.ts und in docs/Sicherheitsweiche-Pruefung.md, Abschnitt 13.
  // Atemnot: „Ich kann keine Luft mehr holen“, „Ich krieg kaum mehr Luft“ (Befund 1)
  new RegExp(`${L}${NOT_AFTER_LAUGH}(ich kann|kann ich|(${WHO}|das baby|${POSS}baby) kann) ${ADV}(keine|kaum|nicht|nicht mehr|nicht richtig|nicht mehr richtig|schlecht|nur schwer|schwer)( noch| mehr)? luft( mehr| noch)? (holen|kriegen|bekommen|reinkriegen|rein kriegen)${NOT_BEFORE_LAUGH}${R}`),
  new RegExp(`${L}${NOT_AFTER_LAUGH}(ich (habe|hab|bekomme|bekomm|kriege|krieg)|(krieg|kriege|bekomm|bekomme|habe|hab) ich|(${WHO}|das baby|${POSS}baby) (kriegt|bekommt|hat)) ${ADV}(kaum|fast keine|so gut wie keine) mehr luft${NOT_BEFORE_LAUGH}${R}`),
  // Schütteln: Die Ausnahme gilt nur zwischen Opfer und Verb, „wach“ nur direkt danach (Befund 2)
  new RegExp(`${L}${PERP} ((hat|hatte|haben|hatten) (${WORD} )?${SMALL_VICTIM} ((?!(hand|hände|händchen|kopf|köpfe|wach)${R})${WORD} ){0,3}(geschüttelt|durchgeschüttelt)|(schüttelt|schütteln) ${SMALL_VICTIM}(?! ((?!(nicht|nie|kein|keine|ist|war|wird|und|aber)${R})${WORD} ){0,3}(wach|munter)${R}))${R}`),
  // Drohung gegen zwei Personen, mit Füllwörtern vor „um“, mit neuem Satz nach „um“; „hat mich versucht zu …“ (Befund 3)
  new RegExp(`${L}(${POSS}${PERSON_WIDE}|er|sie|der|die|jemand) (bringt|bringen|würde|will|wird) ${THREAT_VICTIM}( und ${THREAT_VICTIM})? ${THREAT_FILL}um(${R}${UM_NOT_TIME}|${UM_NEW_CLAUSE})`),
  new RegExp(`${L}(dass|wenn|sonst|weil|ob) (er|sie|jemand|${POSS}${PERSON_WIDE}|der mann|die frau|der typ) ${THREAT_VICTIM} und ${THREAT_VICTIM} (${WORD} )?(tötet|töten will|töten wird|töten wollte|umbringt|umbringen will|umbringen wird|totmacht|tot macht|erwürgt|erstickt)${R}`),
  new RegExp(`${L}${SUBJ} (hat|hatte|haben|hatten) (${WORD} ){0,2}(mich|uns|das baby|${ART}${PERSON_WIDE}) (${WORD} )?(versucht|versuchte|probiert) (${WORD} ){0,3}(zu töten|umzubringen|zu erwürgen|zu würgen|zu erdrosseln|tot zu machen|totzumachen|zu ersticken|zu vergiften|zu ertränken|zu erschlagen|zu erstechen|abzustechen|zu erschießen)${R}`),
  // Fremde: „ob ich mit ihm fahren will“, „ob ich zu ihm nach Hause komme“, „ich soll mit ihm nach Hause kommen“, „10,50 €“ (Befund 4)
  new RegExp(`${L}${STRANGER_START}( ${WORD}){0,8} (ob|dass|wenn) ich ${WITH_HIM} ${HOME}(gehen|kommen|fahren|mitkommen|mitgehen|mitfahren) (will|möchte|soll|muss|würde|kann|darf|mag)${R}`),
  new RegExp(`${L}${STRANGER_START}( ${WORD}){0,8} (ob|dass|wenn) ich (zu ihm|zu ihr) ${HOME}(komme|gehe|fahre|mitkomme|mitgehe|mitfahre)${R}`),
  new RegExp(`${L}${STRANGER_START}( ${WORD}){0,8} (ich soll|ich muss|dass ich) ${WITH_HIM} ${HOME}(gehen|gehe|kommen|komme|fahren|fahre|mitkommen|mitgehen|mitfahren)${R}`),
  new RegExp(`${L}(mann|frau|typ|fremder|fremde|fremden)( ${WORD}){0,4} (hat|haben|wollte|will|bietet|bot) mir ((${WORD}|[0-9]+) ){0,3}${GIFT} (angeboten|anbieten|an|geschenkt|schenken|gegeben|geben|gekauft|kaufen|versprochen|versprechen)${R}`),
  // Ungewollte Berührung: Täter mit Artikel, „jemand“ oder Name, „wollte nicht“, Vergangenheit (Befund 5)
  new RegExp(`${L}ich (mag|will|möchte|wollte|mochte) (es |das )?${ADV}nicht( mehr)? (dass|wenn) ${TOUCH_SUBJ_WIDE} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  new RegExp(`${L}(das|es) gefällt mir ${ADV}nicht( mehr)? (dass|wenn) ${TOUCH_SUBJ_WIDE} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  new RegExp(`${L}(ich ((finde|find|finds) (es |das |s )?${ADV}(nicht (so |sehr |besonders )?(schön|gut|toll|okay|ok|lustig|angenehm)|eklig|ekelig|doof|blöd|schlimm|komisch|unangenehm|gruselig)|(hasse|hass) (es|das)|(hab|habe) ${ADV}angst)|(es|das) ist ${ADV}(nicht (so |sehr |besonders )?(schön|gut|toll|okay|ok|lustig|angenehm)|eklig|ekelig|schlimm|unangenehm|gruselig)) (dass|wenn) ${TOUCH_SUBJ_WIDE} mich (${WORD} ){0,3}${TOUCH_VERB}${R}`),
  new RegExp(`${L}(ich (fand|mochte|wollte) (es |das )?|(es|das) war )${ADV}(nicht (so |sehr |besonders )?(schön|gut|toll|okay|ok|lustig|angenehm)|nicht|eklig|ekelig|doof|blöd|schlimm|komisch|unangenehm|gruselig) (dass|wie|als|wenn) ${TOUCH_SUBJ_WIDE} mich (${WORD} ){0,3}${TOUCH_PAST} (hat|hatte|haben)${R}`),
  // Verloren: Ort auch nach „nicht (mehr)“, „hier“ und „da“ davor, mehr Orte (Befund 6)
  new RegExp(`${L}(finde|find|sehe|seh) (${POSS}|(die|den|unsere|unseren|unser) )${RELATIVE} (nicht( mehr| wieder)?|nirgends|nirgendwo) ${PLACE_WIDE}${R}`),
  new RegExp(`${L}ich kann (${FILL_LOST} ){0,2}(${POSS}|(die|den|unsere|unseren|unser) )${RELATIVE}( und ${POSS}(oma|opa|omi|opi|${PARENTS}))? (${PLACE_WIDE} )?(${FILL_LOST} ){0,2}(nicht|nirgends|nirgendwo) (mehr )?(${PLACE_WIDE} )?finden${R}`),
  // Gewalt durch „die Frau“; Geschwister nur gegen das Baby (Befund 7)
  new RegExp(`${L}${PERP_WOMAN} (schlägt|schlagen|haut|hauen|tritt|treten|würgt|würgen|verprügelt|verprügeln|verhaut|verhauen|boxt|schubst|ohrfeigt) ${VADV}${VICTIM}${R}(?! (auf|vor|nach)( *$| (und|aber|weil|wenn|dann)${R})| (in die flucht|zum ritter|zur ritterin|steif|schaumig)${R})`),
  new RegExp(`${L}${PERP_WOMAN} (hat|hatte|haben|hatten) (${WORD} )?${VICTIM} (${WORD} ){0,8}(?<!flucht )(geschlagen|gehauen|gehaut|gehaun|getreten|gewürgt|verprügelt|verhauen|geohrfeigt|geboxt|geschubst)${R}`),
  new RegExp(`${L}${POSS}((große|großer|großen|ältere|älterer|älteren) )?(bruder|schwester|cousin|cousine) (schlägt|haut|tritt|würgt|verprügelt|verhaut|boxt|schubst|ohrfeigt|schüttelt) ${VADV}(das baby|unser baby|${ART}(kleine |kleinen |kleiner )?baby)${R}`),
  new RegExp(`${L}${POSS}((große|großer|großen|ältere|älterer|älteren) )?(bruder|schwester|cousin|cousine) (hat|hatte) (${WORD} )?(das baby|unser baby|${ART}(kleine |kleinen |kleiner )?baby) (${WORD} ){0,6}(geschlagen|gehauen|getreten|gewürgt|verprügelt|verhauen|geohrfeigt|geboxt|geschubst|geschüttelt)${R}`),
  // Sich selbst beißen: „Ich beiße mir absichtlich in den Arm“, „Ich beiß mich selber“ (Befund 8)
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}ich (beiße|beiß|beisse|beiss) mir (${WORD} ){0,2}(in|auf) (den|die|das|meinen|meine|mein) ${SELF_BODY}${R}`),
  new RegExp(`^(?=.*${L}(mit absicht|absichtlich|extra)${R}).*${L}(ich (habe|hab)|(habe|hab) ich) mir (${WORD} ){0,3}(in|auf) (den|die|das|meinen|meine|mein) ${SELF_BODY} (${WORD} )?gebissen${R}`),
  new RegExp(`${L}ich (beiße|beiß|beisse|beiss) mich ((?!(nicht|nie)${R})${WORD} )?(selbst|selber)${R}`),
];

const ALL_PATTERNS: RegExp[] = [...PATTERNS, ...PATTERNS_EXTRA, ...PATTERNS_2026_11, ...PATTERNS_2026_11_B, ...PATTERNS_2026_11_C, ...PATTERNS_2026_11_D, ...PATTERNS_REVIEW];

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
