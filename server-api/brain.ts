import { createLlmProvider, type JsonSchema, type LlmProvider } from './llm.js';
import {
  ANSWER_SYSTEM,
  EPISODE_CLOSING,
  EPISODE_SEEDS,
  PHASE_HINTS,
  STORY_CLOSING,
  STORYTELLER_SYSTEM,
} from './prompts.js';
import {
  ERROR_RESPONSE_DE,
  SAFETY_RESPONSE_DE,
  screen,
  screenOutput,
  UNCLEAR_RESPONSE_DE,
} from './safety.js';
import { generateMelodyWav, generateToneWav } from './audio.js';
import { config, type KunibertConfig } from './config.js';

export interface StoryState {
  v: number;
  ep: number;
  part: number;
  target: number;
  seed: string;
  summary: string;
  threads: string;
  hook: string;
  done: boolean;
}

export interface TurnResult {
  kind: 'frage' | 'geschichte' | 'weiter' | 'hinweis';
  speech: string;
  story_state: StoryState;
  fixed?: string;
  wav?: Buffer;
}

/** Längste Äußerung, die ins Sprachmodell geht (Kosten- und Missbrauchsgrenze; die Spracherkennung liefert höchstens 1000 Zeichen). */
export const MAX_UTTERANCE_CHARS = 1000;

/**
 * Macht fremden Text prompt-tauglich: Steuerzeichen und Zeilenumbrüche werden zu
 * Leerzeichen, die Anführungszeichen « », mit denen der Prompt Kinderäußerungen
 * einrahmt, werden entschärft, und die Länge ist begrenzt.
 */
export function cleanText(text: unknown, maxChars: number): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/[«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

const WISH_FILLER = new Set([
  'bitte', 'erzähl', 'erzähle', 'erzählst', 'erzählt', 'mir', 'mal', 'doch', 'noch', 'gerne', 'gern',
  'ich', 'will', 'möchte', 'möchten', 'kannst', 'kann', 'du', 'hören', 'höre', 'wir',
  'eine', 'ein', 'einen', 'einem', 'einer', 'der', 'die', 'das', 'dem', 'den', 'des',
  'geschichte', 'geschichten', 'märchen', 'neue', 'neues', 'neuen', 'andere', 'weitere',
  'von', 'vom', 'über', 'mit', 'und', 'zum', 'zur', 'im', 'in', 'auf', 'ritter', 'kunibert',
]);

/**
 * Das Stichwort aus einem Geschichtenwunsch für den Notfall-Erzähler ohne Sprachmodell:
 * höchstens drei Wörter, ohne Füllwörter, und nur wenn der Ausgabe-Check es erlaubt.
 */
export function extractWishKeyword(wish: string): string {
  const words = cleanText(wish, 200)
    .split(' ')
    .map((word) => word.replace(/^[^a-zA-ZäöüÄÖÜß]+|[^a-zA-ZäöüÄÖÜß]+$/g, ''))
    .filter((word) => word && !WISH_FILLER.has(word.toLowerCase()));
  const keyword = words.slice(0, 3).join(' ');
  return keyword && !screenOutput(keyword, 'story') ? keyword : '';
}

export function cleanState(raw: any): StoryState {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) {
    return {
      v: 1,
      ep: 1,
      part: 0,
      target: config.partsPerEpisode,
      seed: '',
      summary: '',
      threads: '',
      hook: '',
      done: false,
    };
  }
  const ep = Number(raw.ep) || 1;
  const part = Number(raw.part) || 0;
  const target = Math.max(3, Math.min(12, Number(raw.target) || config.partsPerEpisode));
  return {
    v: 1,
    ep: Math.max(1, Math.min(10000, ep)),
    part: Math.max(0, Math.min(50, part)),
    target,
    seed: cleanText(raw.seed, 200),
    summary: cleanText(raw.summary, 700),
    threads: cleanText(raw.threads, 400),
    hook: cleanText(raw.hook, 300),
    done: Boolean(raw.done),
  };
}

export function storyActive(state: StoryState): boolean {
  return state.part > 0 && !state.done;
}

export function trimWords(text: string, maxWords: number): string {
  const words = (text || '').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= maxWords) return text;
  const cut = words.slice(0, maxWords).join(' ');
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('“'));
  return end > cut.length / 2 ? cut.slice(0, end + 1) : cut + ' ...';
}

export const QUESTION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['frage', 'geschichte', 'weiter', 'sicherheit', 'unklar'] },
    speech: { type: 'string' },
  },
  required: ['category', 'speech'],
};

export const STORY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    summary: { type: 'string' },
    open_threads: { type: 'string' },
    next_hook: { type: 'string' },
    episode_finished: { type: 'boolean' },
  },
  required: ['text', 'summary', 'open_threads', 'next_hook', 'episode_finished'],
};

export type BrainSettings = Pick<KunibertConfig, 'ageBracket' | 'partsPerEpisode' | 'storyMinWords' | 'storyMaxWords' | 'answerMaxWords'>;

export class Brain {
  private readonly age: string;
  private readonly partsPerEpisode: number;
  private readonly storyMinWords: number;
  private readonly storyMaxWords: number;
  private readonly answerMaxWords: number;

  /**
   * Ohne Anbieter (kein Key) greifen die festen Fallback-Texte. Die Einstellungen
   * (Altersgruppe, Teile pro Folge, Wortgrenzen) kommen standardmäßig aus der Konfiguration.
   */
  constructor(private readonly llm: LlmProvider | null = createLlmProvider(config), settings: Partial<BrainSettings> = {}) {
    this.age = settings.ageBracket ?? config.ageBracket;
    this.partsPerEpisode = settings.partsPerEpisode ?? config.partsPerEpisode;
    this.storyMinWords = settings.storyMinWords ?? config.storyMinWords;
    this.storyMaxWords = settings.storyMaxWords ?? config.storyMaxWords;
    this.answerMaxWords = settings.answerMaxWords ?? config.answerMaxWords;
  }

  /** Für Statusanzeige und Logs, z. B. "gemini:gemini-3.8-flash". */
  public get llmName(): string {
    return this.llm ? `${this.llm.name}:${this.llm.model}` : 'none';
  }

  public async handle(
    mode: 'frage' | 'geschichte' | 'weiter',
    rawTranscript: string,
    rawState: any
  ): Promise<TurnResult> {
    const state = cleanState(rawState);
    const transcript = cleanText(rawTranscript, MAX_UTTERANCE_CHARS);

    // 1. Deterministische Sicherheitsweiche
    if (transcript && screen(transcript)) {
      return {
        kind: 'hinweis',
        speech: SAFETY_RESPONSE_DE,
        story_state: state,
        fixed: 'sicherheit',
        wav: this.synthesizeWav(SAFETY_RESPONSE_DE, 'hinweis'),
      };
    }

    try {
      if (mode === 'frage') {
        return await this.handleQuestion(transcript, state);
      }
      if (mode === 'geschichte') {
        return await this.handleStory(true, state, transcript);
      }
      if (mode === 'weiter') {
        return await this.handleStory(!storyActive(state), state, '');
      }
    } catch (err) {
      console.error('Brain execution error:', err);
      return {
        kind: 'hinweis',
        speech: ERROR_RESPONSE_DE,
        story_state: state,
        fixed: 'fehler',
        wav: this.synthesizeWav(ERROR_RESPONSE_DE, 'hinweis'),
      };
    }

    throw new Error('Unbekannter Modus');
  }

  private async handleQuestion(transcript: string, state: StoryState): Promise<TurnResult> {
    if (!transcript) {
      return {
        kind: 'hinweis',
        speech: UNCLEAR_RESPONSE_DE,
        story_state: state,
        fixed: 'unklar',
        wav: this.synthesizeWav(UNCLEAR_RESPONSE_DE, 'hinweis'),
      };
    }

    // Wenn ein Sprachmodell konfiguriert ist, befragen
    if (this.llm) {
      try {
        const systemPrompt = ANSWER_SYSTEM(this.age, this.answerMaxWords);
        const userPrompt = `Läuft gerade eine Kunibert-Geschichte: ${storyActive(state) ? 'ja' : 'nein'}\nErkannte Äußerung des Kindes: «${transcript}»`;

        const parsed = await this.llm.generateJson({
          system: systemPrompt,
          user: userPrompt,
          schemaName: 'kunibert_antwort',
          schema: QUESTION_SCHEMA,
        }) as { category?: string; speech?: string };
        if (parsed.category === 'sicherheit') {
          return {
            kind: 'hinweis',
            speech: SAFETY_RESPONSE_DE,
            story_state: state,
            fixed: 'sicherheit',
            wav: this.synthesizeWav(SAFETY_RESPONSE_DE, 'hinweis'),
          };
        }
        if (parsed.category === 'geschichte') {
          return await this.handleStory(true, state, transcript);
        }
        if (parsed.category === 'weiter') {
          return await this.handleStory(!storyActive(state), state, '');
        }
        if (parsed.category === 'frage' && parsed.speech) {
          const speech = trimWords(parsed.speech, this.answerMaxWords + 20);
          // Ausgabe-Check: bei Treffer greift der Fallback unten (catch-Pfad).
          if (screenOutput(speech, 'answer')) {
            throw new Error('Antwort des Sprachmodells durch Ausgabe-Check abgelehnt');
          }
          return {
            kind: 'frage',
            speech,
            story_state: state,
            wav: this.synthesizeWav(speech, 'frage'),
          };
        }
      } catch (llmErr) {
        console.warn(`LLM-Antwort (${this.llmName}) fehlgeschlagen, verwende Fallback:`, llmErr);
      }
    }

    // Fallback Beantwortung
    return this.fallbackQuestion(transcript, state);
  }

  private fallbackQuestion(transcript: string, state: StoryState): TurnResult {
    const lower = transcript.toLowerCase();

    // Check for story requests
    if (lower.includes('geschichte') || lower.includes('erzähl') || lower.includes('märchen')) {
      return this.fallbackStory(true, state, transcript);
    }
    if (lower.includes('weiter') || lower.includes('nochmal')) {
      return this.fallbackStory(!storyActive(state), state, '');
    }

    // Answers to common questions or Kunibert lore
    let speech = '';
    if (lower.includes('wer ist ritter kunibert') || lower.includes('kunibert')) {
      speech =
        'Ritter Kunibert ist ein mutiger, höflicher und großzügiger Ritter. ' +
        'Er wohnt im Dachzimmer eines Gasthauses, fährt mit einem Kutscher über holprige Pflastersteine, ' +
        'trifft im düsteren Wald eine geheimnisvolle Hexe und zieht immer wieder auf den Berg zum Drachen. ' +
        'Manchmal verliert er, dann isst er Suppe, schläft und versucht es am nächsten Tag wieder. ' +
        'Am Ende hilft ihm seine Klugheit. Wenn du eine Geschichte hören willst, drück die Erzähltaste.';
    } else if (lower.includes('himmel') && lower.includes('blau')) {
      speech =
        'Der Himmel wirkt blau, weil das weiße Sonnenlicht in der Luft auf winzig kleine Teilchen trifft ' +
        'und dabei in alle Richtungen gestreut wird. Blaues Licht wird dabei viel stärker gestreut als ' +
        'rotes Licht, deshalb sehen wir den Himmel blau leuchten.';
    } else if (lower.includes('traurig') || lower.includes('wein') || lower.includes('allein')) {
      speech =
        'Es ist ganz in Ordnung, manchmal traurig zu sein. Jeder von uns fühlt sich ab und zu so, ' +
        'sogar Ritter Kunibert, wenn er vom Drachenberg zurückkehrt. ' +
        'Sprich am besten mit einem Erwachsenen, den du lieb hast, oder nimm ein Kuscheltier in den Arm.';
    } else if (lower.includes('drache')) {
      speech =
        'Der Drache wohnt oben auf dem Berg in einer dunklen Höhle. Er ist gewaltig und spuckt Rauch, ' +
        'aber Ritter Kunibert besiegt ihn nie mit Gewalt, sondern immer mit Klugheit und ein bisschen Geduld.';
    } else {
      speech =
        `Das ist eine spannende Frage zu «${trimWords(transcript, 12)}». ` +
        'Ritter Kunibert lernt auch jeden Tag etwas Neues, wenn er durch den Wald reitet. ' +
        'Frag am besten auch einmal deine Eltern oder eine Lehrerin – die wissen darüber oft ganz Erstaunliches!';
    }

    return {
      kind: 'frage',
      speech,
      story_state: state,
      wav: this.synthesizeWav(speech, 'frage'),
    };
  }

  private async handleStory(
    newEpisode: boolean,
    state: StoryState,
    wish: string
  ): Promise<TurnResult> {
    let current = { ...state };
    if (newEpisode) {
      const seed = EPISODE_SEEDS[Math.floor(Math.random() * EPISODE_SEEDS.length)];
      current = {
        v: 1,
        ep: (current.ep || 0) + 1,
        part: 0,
        target: this.partsPerEpisode,
        seed,
        summary: '',
        threads: '',
        hook: '',
        done: false,
      };
    }

    const part = current.part + 1;
    const target = current.target;
    let phase = 'middle';
    if (part === 1) phase = 'start';
    else if (part >= target) phase = 'finale';
    else if (part === target - 1) phase = 'trick';

    if (this.llm) {
      try {
        const systemPrompt = STORYTELLER_SYSTEM(this.age);
        const partLabel =
          part === 1
            ? `Teil ${part} von ${target} einer neuen Folge`
            : `Teil ${part} von ${target} der laufenden Folge`;
        const continuity =
          part === 1
            ? `Stimmung zum Einstieg: ${current.seed}`
            : `Bisher: ${current.summary}\nOffene Fäden: ${current.threads || 'keine'}\nAnknüpfen an: ${current.hook}`;
        const wishLine = wish && part === 1 ? `Wunsch des Kindes: «${wish.slice(0, 200)}»` : '';

        const userPrompt = `Erzähle jetzt ${partLabel}.\nLänge: ${this.storyMinWords} bis ${this.storyMaxWords} Wörter.\n${PHASE_HINTS[phase]}\n${continuity}\n${wishLine}\nAntworte strikt im JSON-Format.`;

        const parsed = await this.llm.generateJson({
          system: systemPrompt,
          user: userPrompt,
          schemaName: 'kunibert_geschichte',
          schema: STORY_SCHEMA,
          maxOutputTokens: 1500,
        }) as { text?: string; summary?: string; open_threads?: string; next_hook?: string; episode_finished?: boolean };
        const text = trimWords(String(parsed.text || ''), this.storyMaxWords + 50);
        // Ausgabe-Check: bei Treffer greift der Fallback unten (catch-Pfad).
        if (!text || screenOutput(text, 'story')) {
          throw new Error('Geschichte des Sprachmodells durch Ausgabe-Check abgelehnt');
        }
        const done = Boolean(parsed.episode_finished) || phase === 'finale';
        const updatedState: StoryState = {
          ...current,
          part,
          done,
          summary: String(parsed.summary || '').slice(0, 700),
          threads: done ? '' : String(parsed.open_threads || '').slice(0, 400),
          hook: done ? '' : String(parsed.next_hook || '').slice(0, 300),
        };

        const closing = done ? EPISODE_CLOSING : STORY_CLOSING;
        const fullSpeech = `${text} ${closing}`;

        return {
          kind: part === 1 ? 'geschichte' : 'weiter',
          speech: fullSpeech,
          story_state: updatedState,
          wav: this.synthesizeWav(fullSpeech, 'geschichte'),
        };
      } catch (err) {
        console.warn(`LLM-Geschichte (${this.llmName}) fehlgeschlagen, verwende Fallback:`, err);
      }
    }

    return this.fallbackStory(newEpisode, state, wish);
  }

  private fallbackStory(newEpisode: boolean, state: StoryState, wish: string): TurnResult {
    let current = { ...state };
    if (newEpisode) {
      const seed = EPISODE_SEEDS[Math.floor(Math.random() * EPISODE_SEEDS.length)];
      current = {
        v: 1,
        ep: (current.ep || 0) + 1,
        part: 0,
        target: this.partsPerEpisode,
        seed,
        summary: '',
        threads: '',
        hook: '',
        done: false,
      };
    }

    const part = current.part + 1;
    const target = current.target;
    const wishKeyword = extractWishKeyword(wish);

    let text = '';
    let summary = '';
    let threads = '';
    let hook = '';
    let done = false;

    if (part === 1) {
      text =
        `Kunibert erwachte im Dachzimmer des Gasthauses. ${current.seed} ` +
        `Der schiefe Balken stand wie immer schützend über seinem Bett, und durch das kleine Fenster sah er ` +
        `die Dächer des Dorfes und ganz hinten den hohen Berg mit dem dunklen Fleck der Drachenhöhle. ` +
        `Er zog seine ledernen Stiefel an, gürtete sein treues Schwert um und ging die knarrende Holztreppe hinab. ` +
        `In der Gaststube roch es herrlich nach frisch gebackenem Brot und warmem Haferbrei. Die Wirtin stellte ` +
        `ihm lächelnd eine Schale hin: „Stärke dich, Kunibert.“ Vor der Tür wartete die morgendliche Frische. ` +
        `An der steinernen Brücke hielt ein freundlicher Kutscher die Pferde an: „Steig auf, Ritter!“ ` +
        `Holpernd rumpelten die Holzräder über das grobe Pflaster. Kunibert bot Münzen an, doch der Kutscher winkte ab. ` +
        `Am Rande des düsteren Waldes stieg Kunibert dankend ab. ` +
        (wishKeyword
          ? `Zwischen den hohen Tannen sah er plötzlich eine geheimnisvolle Spur – sie schien etwas mit „${wishKeyword}“ zu tun zu haben.`
          : `Ein leiser Wind raschelte durch das Moos, und etwas silbern Schimmerndes lockte ihn tiefer zwischen die Bäume.`);
      summary = `Kunibert ist im Gasthaus aufgebrochen, mit dem Kutscher zur Brücke gefahren und steht am Waldrand.`;
      threads = wishKeyword ? `Die Spur zu „${wishKeyword}“ im Wald ergründen.` : `Das Geheimnis im Wald erkunden.`;
      hook = `Kunibert betritt den Pfad der geheimnisvollen Hexe.`;
    } else if (part === 2) {
      text =
        `Kunibert trat vorsichtig in den düsteren Wald hinein. Tropfen perlten von den Farnen, und ` +
        `im Dickicht knackte ein Zweig. Da stand die Hütte der Hexe, deren Kamin feinen blauen Rauch in den Nebel blies. ` +
        `Die Hexe trat heraus, ein verschmitztes Lächeln im faltigen Gesicht. ` +
        `„Sei gegrüßt, Kunibert“, sagte sie mit heiserer Stimme. „Suchst du wieder den Drachen am Berg?“ ` +
        `Sie reichte ihm eine kleine Flasche aus grünem Glas, in der eine goldene Flüssigkeit leise blubberte. ` +
        `„Nicht trinken!“, warnte sie mit erhobenem Finger. „Aber wenn der Drache schnaubt, halte sie gegen den Wind.“ ` +
        `Kunibert verneigte sich höflich: „Habt Dank, werte Frau.“ Er steckte das Fläschchen gut in seine Tasche ` +
        `und spürte, dass der Weg nun steiler wurde. Die Bäume lichteten sich, und die nackten Felsen des Berges kamen näher.`;
      summary = `Die Hexe gab Kunibert eine grüne Flasche mit der Warnung, sie bei Gegenwind zu öffnen.`;
      threads = `Die geheimnisvolle Gabe der Hexe am Berg einsetzen.`;
      hook = `Kunibert erreicht den steilen Aufstieg zur Drachenhöhle.`;
    } else if (part === 3) {
      text =
        `Der Weg am Berg war steil und steinig. Kunibert kletterte stetig bergauf, während kleine Kiesel ` +
        `unter seinen Stiefeln ins Tal rollten. Immer wärmer wurde die Luft, je näher er der großen schwarzen Höhle kam. ` +
        `Plötzlich ertönte ein tiefes Grollen, das den ganzen Berg vibrieren ließ! ` +
        `Der gewaltige rote Drache schob seinen Kopf aus der Höhle. Rauch quoll aus seinen Nüstern, und seine ` +
        `goldenen Augen funkelten angriffslustig. Kunibert zog sein Schwert, doch der Schwanz des Drachen fegte herüber ` +
        `und warf ihn zurück auf die Felsen. Kunibert rappelte sich auf, merkte aber, dass mit bloßer Kraft heute nichts ` +
        `auszurichten war. Er atmete tief durch, fasste an seine Tasche und wusste: Noch war der richtige Moment nicht da. ` +
        `Er musste seine Klugheit sammeln.`;
      summary = `Kunibert traf am Berg auf den Drachen und erkannte, dass nur eine List zum Ziel führt.`;
      threads = `Die Hexe-Gabe im richtigen Moment anwenden.`;
      hook = `Kunibert bereitet die kluge List vor.`;
    } else if (part === 4) {
      text =
        `Nun trat die Wende ein. Der Drache holte tief Luft und wollte einen heißen Rauchstoß über das Plateau jagen. ` +
        `In genau diesem Augenblick erinnerte sich Kunibert an die Worte der Hexe: Gegen den Wind halten! ` +
        `Er zog die grüne Flasche hervor und zog den Korken. Ein herrlicher Duft nach Pfefferminz und Sommerblumen ` +
        `strömte heraus und wirbelte mit dem Bergwind genau in die Nase des Drachen. ` +
        `Der große Drache schnupperte verblüfft, blinzelte und musste plötzlich gewaltig niesen: „Ha-tschi!“ ` +
        `Durch das Niesen fielen dem Drachen die Augen zu, und die kühle Frische beruhigte sein feuriges Gemüt. ` +
        `Er legte seinen schweren Kopf sanft auf den Felsen und begann gemütlich zu schnurren wie eine riesige Katze. ` +
        `Kunibert steckte sein Schwert weg und nickte zufrieden. Mit Klugheit hatte er den Berg befriedet!`;
      summary = `Kunibert überlistete den Drachen mit dem Duftfläschchen der Hexe friedlich.`;
      threads = ``;
      hook = `Kuniberts Heimkehr ins Dorf.`;
    } else {
      done = true;
      text =
        `Mit leichtem Schritt und frohem Herzen stieg Kunibert den Berg hinab. Die Sonne stand warm am Himmel, ` +
        `als er wieder den Wald durchquerte und die Hexe ihm vom Fenster aus freundlich zuwinkte. ` +
        `An der Brücke wartete wieder der Kutscher und nahm ihn mit zurück zum Dorf. ` +
        `Im Gasthaus empfing ihn die Wirtin mit einer dampfenden Schale frischer Gemüsesuppe. ` +
        `Kunibert aß mit großem Appetit, erzählte vom friedlich schlafenden Drachen und bedankte sich herzlich. ` +
        `Müde und glücklich stieg er die knarrende Treppe hinauf in sein Dachzimmer. ` +
        `Er legte sich auf das gemütliche Bett unter dem schiefen Balken, schloss die Augen und schlief tief ein. ` +
        `Und so erwacht er bald wieder im Dachzimmer zu einem neuen Tag.`;
      summary = `Kunibert kehrte siegreich und zufrieden ins Gasthaus zurück und ruht im Dachzimmer.`;
      threads = '';
      hook = '';
    }

    const updatedState: StoryState = {
      ...current,
      part,
      done,
      summary,
      threads,
      hook,
    };

    const closing = done ? EPISODE_CLOSING : STORY_CLOSING;
    const fullSpeech = `${text} ${closing}`;

    return {
      kind: part === 1 ? 'geschichte' : 'weiter',
      speech: fullSpeech,
      story_state: updatedState,
      wav: this.synthesizeWav(fullSpeech, 'geschichte'),
    };
  }

  private synthesizeWav(text: string, kind: string): Buffer {
    const rate = config.audioSampleRate;
    // Generiert ein sanftes akustisches Bestätigungssignal / Glockenklang
    if (kind === 'hinweis') {
      return generateMelodyWav([523.25, 440], [0.3, 0.4], rate); // C5 -> A4 (sanftes Melodie-Signal)
    }
    if (kind === 'geschichte') {
      return generateMelodyWav([440, 554.37, 659.25], [0.25, 0.25, 0.5], rate); // A4 -> C#5 -> E5 (Erzähl-Fanfare)
    }
    return generateToneWav(523.25, 0.6, rate); // C5 Glockenton
  }
}
