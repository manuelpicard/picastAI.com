// Feste Ansage beim ersten Einschalten: Kunibert sagt dem Kind, dass er eine künstliche
// Intelligenz ist (Hinweispflicht nach Art. 50 Abs. 1 KI-Verordnung, gilt seit 2.8.2026).
//
// Der Text kommt NICHT vom Sprachmodell. Er steht hier fest im Code, damit er immer gleich
// und richtig ist, und wird wie die anderen festen Sprechtexte (Sicherheitshinweis, "nicht
// verstanden") nur einmal synthetisiert und danach aus dem Speicher geliefert.
//
// Quelle des Wortlauts: Abschnitt "Für Kinder: Kunibert stellt sich vor" im Entwurf der
// Elterninformation vom 6.11.2026. Wer den Text ändert, ändert damit auch die Elterninformation
// und die Einwilligung; beides muss zusammenpassen.
import { createHash } from 'node:crypto';

export const INTRO_TEXT_DE = [
  'Sei gegrüßt! Ich bin Ritter Kunibert. Ich bin ein Computer-Ritter, kein echter Mensch. ' +
    'Ich erzähle dir Geschichten und beantworte deine Fragen. Manchmal irre ich mich.',
  'Ich höre dir nur zu, solange du die Taste drückst. Dann leuchtet meine Lampe.',
  'Sag mir bitte nicht deinen Nachnamen und nicht, wo du wohnst. Das brauche ich nicht.',
  'Und wenn dir etwas Schlimmes passiert oder du Angst hast: Geh zu einem Erwachsenen, dem du vertraust. ' +
    'Ich bin nur ein Spielzeug und kann dir dann nicht richtig helfen.',
].join('\n\n');

/**
 * Kurze Kennung des Wortlauts (12 Hex-Zeichen des SHA-256). Ändert sich der Text, ändert sich
 * die Kennung von selbst. Das Gerät speichert sie, sobald es die Ansage abgespielt hat; so lässt
 * sich später nachvollziehen, welche Fassung ein Gerät gespielt hat.
 */
export function introVersion(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

export const INTRO_VERSION = introVersion(INTRO_TEXT_DE);
