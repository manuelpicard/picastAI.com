import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DeviceRegistry, DeviceStoreError, RateLimiter, AudioStore } from './server-api/devices.js';
import { Brain, FALLBACK_ANSWER_DE, StoryState, type StorySink, type TurnResult } from './server-api/brain.js';
import { EPISODE_CLOSING, STORY_CLOSING, STORY_CLOSING_FIRST, STORY_PAUSE_TEXT } from './server-api/prompts.js';
import { StoryPrefetcher } from './server-api/prefetch.js';
import { STORY_STATE_TTL_MS, StoryStateStore, startPurging } from './server-api/story-states.js';
import { PARAGRAPH_PAUSE_MS, PcmStream, StreamingSpeaker, StreamRegistry, streamingWavHeader } from './server-api/audio-stream.js';
import { MAX_HEARD_SECONDS, StopPoints, TURN_ID_PATTERN, speechParagraphs, type SpokenPart, type StopOutcome } from './server-api/stopp.js';
import { AudioError, decodeWavHeader, generateMelodyWav, isPcmFormat, isSilentPcm16 } from './server-api/audio.js';
import { CONSENT_MISSING_DE, ParentControls, SLEEPING_DE, isValidTime, pairingCodeSpeech, type BlockReason } from './server-api/eltern.js';
import { config, getSafeConfigSummary, llmConfigWarnings, testSwitchWarnings, ttsProviderWarnings, voiceConfigWarnings } from './server-api/config.js';
import { isAdminTokenConfigured, verifyAdminAuthorization } from './server-api/admin-auth.js';
import { VoicePipeline, VoiceProviderError } from './server-api/voice.js';
import { FirestoreDeviceStore } from './server-api/firestore-service.js';
import { buildAudioUrl } from './server-api/http-utils.js';
import { ERROR_RESPONSE_DE, SAFETY_RESPONSE_DE, UNCLEAR_RESPONSE_DE } from './server-api/safety.js';
import { budgetTimeoutMs, MIN_TTS_MS, NO_TIMER, TurnTimer, type StageTimer } from './server-api/timing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;
const HOST = config.host;

// Keine Framework-Kennung in den Antworten; hinter einem TLS-beendenden Proxy
// erkennt der Server https nur, wenn PICASTAI_TRUST_PROXY gesetzt ist.
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Geräteliste: flüchtig im RAM (Standard) oder dauerhaft in Firestore
// (PICASTAI_DEVICE_STORE=firestore). Rate-Limit, Audio und Story-State bleiben flüchtig.
const registry = new DeviceRegistry(
  config.deviceStore === 'firestore' ? new FirestoreDeviceStore() : null
);
const limiter = new RateLimiter(
  config.rateLimitMaxTurns,
  config.rateLimitWindowSeconds
);
const store = new AudioStore(
  config.audioTtlSeconds
);
const brain = new Brain();
const voice = new VoicePipeline(config);
// Stand der laufenden Geschichte je Gerät: verfällt 24 Stunden nach der letzten Nutzung
// (vorläufig, Maßnahme M9; server-api/story-states.ts). Danach beginnt eine neue Folge.
const deviceStoryStates = new StoryStateStore();
// Ton-Strom (Punkt 71, server-api/audio-stream.ts): laufende Ströme und Antworten, die noch im
// Hintergrund fertig werden. Eine neue Anfrage desselben Geräts wartet auf deren Stand.
const streams = new StreamRegistry(config.audioTtlSeconds * 1000);
const pendingTurns = new Map<string, Promise<void>>();
// Stopp per Taste (Punkt B2, server-api/stopp.ts): letzter Geschichtenteil je Gerät und, nach einer
// Meldung des Geräts, bis wohin das Kind ihn gehört hat. Nur im Arbeitsspeicher, wie der Stand.
const stops = new StopPoints();
// Meldungen eines Geräts zum Stopp: höchstens 60 in 10 Minuten (ein Gerät in einer Schleife füllt
// sonst das Protokoll). Eigene Zählung: Die Meldungen kosten nichts und zählen nicht zu den Anfragen.
const stopReports = new RateLimiter(60, 600);
/** Feste Sätze in einem Teil, die nicht zur Geschichte gehören (Abschluss, Pause). */
const FIXED_STORY_TEXTS = new Set([STORY_CLOSING, STORY_CLOSING_FIRST, EPISODE_CLOSING, STORY_PAUSE_TEXT]);
// Nächster Geschichtenteil im Hintergrund (Sprachmodell und Sprachausgabe), siehe server-api/prefetch.ts.
const prefetcher = new StoryPrefetcher(
  async (state, deviceId) => {
    // Eigene Zeitmessung ohne Budget (läuft im Hintergrund): Die Zeile zeigt Dauer, Token und Kosten
    // des vorbereiteten Teils, damit auch diese Aufrufe in den Kosten je Folge sichtbar sind.
    const timer = new TurnTimer(undefined, undefined, Number.POSITIVE_INFINITY);
    timer.mode = 'vorbereitung';
    // Gesperrt, ohne Einwilligung oder im Schlafmodus: kein weiterer Aufruf an Claude, auch keine
    // Wiederholung (N1120-1610-b).
    timer.guardLlm(() => registry.isActive(deviceId) && !blockReasonFor(deviceId));
    let ok = false;
    try {
      const made = await brain.handle('weiter', '', state, timer);
      // Darf das Gerät inzwischen nicht mehr an Claude (zum Beispiel Schlafmodus), nichts bereitlegen:
      // sonst läge vielleicht eine Ersatzgeschichte bereit, weil ein Aufruf verhindert wurde.
      if (!timer.allowsLlm()) return null;
      const result = await synthesizeTimed(made, timer);
      timer.noteAudio(result.wav);
      ok = true;
      return result;
    } finally {
      const line = timer.logLine(ok ? 200 : 'abgebrochen');
      if (line) console.log(line);
    }
  },
  { ttlMs: 30 * 60 * 1000, nextEpisodeTtlMs: STORY_STATE_TTL_MS, enabled: config.storyPrefetch }
);
// Eltern-Steuerung (server-api/eltern.ts): Kopplung, Einwilligung, Schlafmodus, Ruhezeiten. Vorläufig
// nur im Arbeitsspeicher: Nach einem Neustart des Servers müssen die Eltern neu koppeln und einwilligen.
const parents = new ParentControls();
// Falsche Kopplungscodes (Schutz vor Raten): höchstens 10 je Absender und 200 insgesamt in 10 Minuten.
const pairingFailures = new RateLimiter(10, 600);
const pairingFailuresTotal = new RateLimiter(200, 600);
// Alle fünf Minuten aufräumen, auch bei Geräten, die sich nie wieder melden: abgelaufene Stände der
// Geschichte samt ihrer Vorbereitung, abgelaufene Vorbereitungen, Audio und Ton-Ströme.
startPurging({ states: deviceStoryStates, prefetcher, audio: store, streams, stops }, [
  // Abgelaufene Kopplungscodes und alte Fehlversuche beim Koppeln (nur Zähler je Absender).
  () => parents.purge(),
  () => pairingFailures.purge(),
  () => pairingFailuresTotal.purge(),
  () => stopReports.purge(),
]);
// Ein frisch erzeugter Teil braucht Claude und die Sprachausgabe. So viel Zeit bleibt mindestens
// übrig, wenn der Server auf eine laufende Vorbereitung wartet und sie nicht rechtzeitig fertig wird.
const PREFETCH_FRESH_RESERVE_MS = 70_000;

// Multer für WAV Uploads (max 2 MB)
const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

const corsOrigins = (process.env.PICASTAI_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => callback(null, Boolean(origin && corsOrigins.includes(origin))),
}));
app.use(express.json());

// Audio-Hörproben statisch bereitstellen
const hoerprobenDir = path.join(__dirname, 'hoerproben');
if (fs.existsSync(hoerprobenDir)) {
  app.use('/hoerproben', express.static(hoerprobenDir));
}

// ------------------------------------------------------------
// Offizielle Pi-Client Schnittstelle (API-Vertrag)
// ------------------------------------------------------------

function authenticate(req: Request): string {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const deviceId = (req.headers['x-device-id'] as string) || '';

  if (!deviceId || !registry.verify(deviceId, token)) {
    throw new Error('unauthorized');
  }
  return deviceId;
}

// Meldet das Gerät an, bevor ein Upload geparst wird: unbekannte Absender sollen keine
// 2-MB-Dateien in den Arbeitsspeicher laden können.
function requireDevice(req: Request, res: Response, next: NextFunction): void {
  try {
    const deviceId = authenticate(req);
    res.locals.deviceId = deviceId;
    // Gleich beim Anmelden, nicht erst nach dem Hochladen: Sperrt der Betreiber das Gerät, während
    // die Aufnahme hochlädt, speichert die Anfrage danach keinen Stand der Geschichte (M9).
    res.locals.storyGeneration = deviceStoryStates.generation(deviceId);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

/** Ist das Gerät noch freigegeben? Der Betreiber kann es sperren, während eine Anfrage läuft. */
function stillAuthorized(req: Request): boolean {
  try {
    authenticate(req);
    return true;
  } catch {
    return false;
  }
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminTokenConfigured(config.adminToken)) {
    res.status(503).json({ error: 'admin_auth_not_configured' });
    return;
  }
  if (!verifyAdminAuthorization(req.headers.authorization, config.adminToken)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// GET /health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', name: 'Ritter Kunibert API', time: Date.now() });
});

function deviceAudioUrl(req: Request, turnId: string): string {
  // Der Pi-Client akzeptiert nur eine audio_url mit gleichem Schema und Host wie seine
  // API-Adresse. Hinter einem Proxy liefert req.protocol ohne trust proxy "http".
  return buildAudioUrl(
    { publicBaseUrl: config.publicBaseUrl, protocol: req.protocol, host: req.get('host') },
    turnId
  );
}

function deviceResponse(
  req: Request,
  deviceId: string,
  result: Awaited<ReturnType<Brain['handle']>>,
  type: 'answer' | 'kunibert_story'
): { body: Record<string, unknown>; turnId: string } {
  const wav = result.wav || Buffer.alloc(0);
  const turnId = store.put(deviceId, wav);
  const body: Record<string, unknown> = {
    type,
    audio_url: deviceAudioUrl(req, turnId),
    session_end: Boolean(result.story_state?.done),
  };
  if (config.diagnosticText) body.text = result.speech;
  return { body, turnId };
}

/** Wartet, bis eine im Hintergrund laufende Antwort desselben Geräts ihren Stand gespeichert hat. */
async function waitForPendingTurn(deviceId: string): Promise<void> {
  const pending = pendingTurns.get(deviceId);
  if (pending) await pending.catch(() => undefined);
}

/** Ton-Strom nur, wenn er eingeschaltet ist, eine Sprachausgabe läuft und das Gerät ihn anfragt. */
function wantsAudioStream(req: Request): boolean {
  return config.audioStream && voice.ttsConfigured && req.get('x-kunibert-audio-stream') === '1';
}

/**
 * Beantwortet eine Geräteanfrage. Ohne Ton-Strom wie bisher: Brain, dann die ganze Sprachausgabe,
 * dann die Antwort. Mit Ton-Strom geht die Antwort hinaus, sobald der erste Absatz vertont ist; der
 * Rest entsteht im Hintergrund, und erst danach werden Stand und Vorbereitung gespeichert. Fragen,
 * feste Texte und Ersatzgeschichten sprechen nichts in den Strom und laufen den bisherigen Weg.
 */
async function respondTurn(
  req: Request,
  res: Response,
  deviceId: string,
  timer: TurnTimer,
  type: 'answer' | 'kunibert_story',
  generation: number,
  run: (sink?: StorySink) => Promise<Awaited<ReturnType<Brain['handle']>>>
): Promise<any> {
  // Zwischen zwei Aufrufen an Claude (Einordnung, Geschichte, zweiter Versuch, Wiederholung) prüft der
  // Erzähler, ob das Gerät noch darf (N1120-1610-b).
  timer.guardLlm(() => !refusalFor(req, deviceId));
  if (!wantsAudioStream(req)) {
    const made = await run();
    // Gesperrt oder von den Eltern angehalten, während die Antwort entstand: kein Audio, kein Stand.
    // Gleich prüfen, ohne den Text erst zu vertonen, und noch einmal nach der Vertonung.
    const early = refusalFor(req, deviceId);
    if (early) return refuse(req, res, deviceId, type, timer, early);
    const result = await synthesizeTimed(made, timer);
    timer.noteAudio(result.wav);
    const refusal = refusalFor(req, deviceId);
    if (refusal) return refuse(req, res, deviceId, type, timer, refusal);
    return sendWholeTurn(req, res, deviceId, result, type, generation);
  }

  let done = false;
  // Punkt B2: Wird ein Teil nach einem Stopp ab der gehörten Stelle neu erzählt (resumed), und bricht
  // der Strom ab, kommt das schon Gesprochene zur gemerkten Stelle dazu.
  let resumed = false;
  const said: string[] = [];
  const speaker = new StreamingSpeaker((text) => timer.time('sprachausgabe', () => voice.synthesize(text)), config.audioSampleRate);
  const sink: StorySink = {
    begin: (info) => { done = info.done; resumed = Boolean(info.resumed); },
    say: (text) => { said.push(text); speaker.say(text); },
  };
  const resultPromise = run(sink);
  resultPromise.catch(() => undefined);
  let first: 'ton' | 'fertig';
  try {
    first = await timer.time('erster_ton', () => Promise.race([
      speaker.firstAudio.then(() => 'ton' as const),
      resultPromise.then((result) => (result.streamed ? speaker.firstAudio.then(() => 'ton' as const) : 'fertig' as const)),
    ]));
  } catch (error) {
    speaker.abort();
    throw error;
  }
  if (first === 'fertig') {
    const made = await resultPromise;
    const early = refusalFor(req, deviceId);
    if (early) return refuse(req, res, deviceId, type, timer, early);
    const result = await synthesizeTimed(made, timer);
    timer.noteAudio(result.wav);
    const refusal = refusalFor(req, deviceId);
    if (refusal) return refuse(req, res, deviceId, type, timer, refusal);
    return sendWholeTurn(req, res, deviceId, result, type, generation);
  }

  const refusal = refusalFor(req, deviceId);
  if (refusal) {
    // Gesperrt oder angehalten, bevor der erste Ton da war: Strom nicht anbieten, Sprachausgabe abbrechen.
    speaker.abort();
    return refuse(req, res, deviceId, type, timer, refusal);
  }
  const turnId = streams.put(deviceId, speaker.stream);
  const finishing = (async () => {
    let ok = false;
    try {
      const result = await resultPromise;
      await speaker.finish();
      // Erst wenn alles vertont ist, rückt die Folge vor (wie ohne Strom: kein Stand ohne Ton). Während
      // des Stroms gesperrt: kein Stand und keine Vorbereitung, also nichts mehr an Claude (N1120-1610-b).
      // Ohne Einwilligung oder im Schlafmodus auch keine Vorbereitung im Hintergrund.
      const late = refusalFor(req, deviceId);
      if (late !== 'gesperrt' && advanceStory(deviceId, result.story_state, generation, !late && preparesNext(deviceId, result))) {
        // Für den Stopp per Taste (B2): Die Sekunden je Absatz sind hier genau bekannt.
        const paragraphs = speechParagraphs(result.speech);
        noteDelivery(deviceId, turnId, result, {
          paragraphs,
          seconds: speaker.segments.length === paragraphs.length ? [...speaker.segments] : null,
          totalSeconds: speaker.stream.seconds,
          pauseSeconds: PARAGRAPH_PAUSE_MS / 1000,
        }, resumed);
      }
      ok = true;
    } catch (error) {
      speaker.abort();
      // Ton war schon beim Kind (B2): Bei einem neu erzählten Teil kommt das Gesprochene zur gemerkten
      // Stelle dazu; sonst gilt die alte Stelle nicht mehr (das Kind hat schon etwas Neues gehört).
      if (speaker.stream.bytes > 0) {
        if (resumed) stops.appendHeard(deviceId, turnId, spokenStory(said.slice(0, speaker.segments.length), speaker.segments, PARAGRAPH_PAUSE_MS / 1000));
        else stops.delete(deviceId);
      }
      // Nur die Art des Fehlers, nie Text (CLAUDE.md).
      console.warn('Ton-Strom abgebrochen:', (error as Error)?.name || 'Fehler');
    } finally {
      timer.noteAudioSeconds(speaker.stream.seconds);
      timer.mode = `${timer.mode}_strom`;
      const line = timer.logLine(ok ? 200 : 'abgebrochen');
      if (line) console.log(line);
      if (pendingTurns.get(deviceId) === finishing) pendingTurns.delete(deviceId);
    }
  })();
  pendingTurns.set(deviceId, finishing);
  return res.json({ type, audio_url: deviceAudioUrl(req, turnId), session_end: done, audio_stream: true });
}

/**
 * Speichert den neuen Stand der Geschichte und bereitet den nächsten Teil vor. Nur der kleine
 * Story-State bleibt im RAM; Audio und Diagnosetexte werden hier nicht gespeichert. Wurde der Stand
 * des Geräts gelöscht, während die Antwort entstand (zum Beispiel weil der Betreiber das Gerät
 * gesperrt hat), bleibt er gelöscht: `generation` stammt vom Beginn der Anfrage.
 */
function advanceStory(deviceId: string, state: StoryState, generation: number, prepareNext = true): boolean {
  if (!deviceStoryStates.set(deviceId, state, generation)) return false;
  // Hat die Anfrage eine Folge begonnen oder fortgesetzt, den nächsten Teil vorbereiten. Bei einer
  // reinen Frage bleibt der Stand gleich, und eine laufende Vorbereitung bleibt gültig.
  if (prepareNext) prefetcher.start(deviceId, state);
  return true;
}

/**
 * Lohnt die Vorbereitung des nächsten Teils? Nicht nach der Pause („Kunibert muss kurz überlegen …“),
 * wenn eine gemerkte Stelle nach einem Stopp weiter gilt (B2): Der nächste Druck erzählt dann denselben
 * Teil ab der Stelle, und ein vorbereiteter nächster Teil würde nie genommen.
 */
function preparesNext(deviceId: string, result: TurnResult): boolean {
  return !(result.fixed === 'pause' && stops.resumeFor(deviceId, result.story_state));
}

/** Ganze WAV-Datei: Stand speichern, Audio ablegen, für den Stopp per Taste merken, antworten. */
function sendWholeTurn(
  req: Request,
  res: Response,
  deviceId: string,
  result: TurnResult,
  type: 'answer' | 'kunibert_story',
  generation: number
): Response {
  const saved = advanceStory(deviceId, result.story_state, generation, preparesNext(deviceId, result));
  const { body, turnId } = deviceResponse(req, deviceId, result, type);
  if (saved) {
    let totalSeconds = 0;
    try {
      totalSeconds = decodeWavHeader(result.wav || Buffer.alloc(0)).duration;
    } catch {
      totalSeconds = 0;
    }
    noteDelivery(deviceId, turnId, result, { paragraphs: speechParagraphs(result.speech), seconds: null, totalSeconds, pauseSeconds: 0 });
  }
  return res.json(body);
}

/**
 * Stopp per Taste (Punkt B2): Merkt sich einen ausgelieferten Geschichtenteil, damit eine spätere
 * Meldung des Geräts zeigt, wie weit das Kind ihn gehört hat. Antworten auf Fragen und feste Sätze
 * ändern nichts. Endete ein Ton-Strom nach gesprochenen Absätzen mit der Pause („Kunibert muss kurz
 * überlegen …“), hat das Kind schon etwas Neues gehört: War es ein nach einem Stopp neu erzählter Teil
 * (`resumed`), kommt das Gesprochene zur gemerkten Stelle dazu; sonst gilt die alte Stelle nicht mehr.
 */
function noteDelivery(deviceId: string, turnId: string, result: TurnResult, spoken: SpokenPart, resumed = false): void {
  if (result.basis && !result.fixed) {
    const applied = stops.delivered(deviceId, turnId, result.story_state, result.basis, spoken);
    if (applied) logStop(applied);
  } else if (result.streamed) {
    if (resumed) stops.appendHeard(deviceId, turnId, spokenStory(spoken.paragraphs, spoken.seconds ?? [], spoken.pauseSeconds));
    else stops.delete(deviceId);
  }
}

/**
 * Die gesprochenen Absätze eines abgebrochenen Stroms ohne feste Sätze (Abschluss, Pause), mit ihren
 * Sekunden, für `StopPoints.appendHeard`. Feste Sätze zählen bei der Zeit mit (das Kind hörte sie),
 * kommen aber nie in die gehörte Stelle. Am Ende steht ein leerer Abschluss: Er zählt nicht als Geschichte.
 */
function spokenStory(texts: string[], seconds: number[], pauseSeconds: number): SpokenPart {
  const paragraphs = texts.map((text) => (FIXED_STORY_TEXTS.has(text.trim()) ? '' : text));
  const known = seconds.length >= texts.length;
  return {
    paragraphs: [...paragraphs, ''],
    seconds: known ? [...seconds.slice(0, texts.length), 0] : null,
    totalSeconds: known ? seconds.slice(0, texts.length).reduce((sum, value) => sum + value, 0) + pauseSeconds * texts.length : 0,
    pauseSeconds: known ? pauseSeconds : 0,
  };
}

/** Eine Zeile je Stopp-Meldung, nur Schlüsselwörter und Zahlen (keine Texte, keine Kennungen). */
function logStop(result: StopOutcome): void {
  if (result.outcome === 'gemerkt') {
    console.log(`Stopp per Taste: gemerkt teil=${result.part}/${result.target} saetze=${result.sentences}/${result.total}`);
  } else if (result.outcome === 'ganz_gehoert') {
    console.log(`Stopp per Taste: ganz_gehoert teil=${result.part}/${result.target}`);
  } else {
    console.log('Stopp per Taste: wartet');
  }
}

/** Vergisst alles, was der Server zur Geschichte eines Geräts hält: Stand, Vorbereitung, wartendes Audio. */
function forgetDeviceStory(deviceId: string): void {
  deviceStoryStates.delete(deviceId);
  prefetcher.cancel(deviceId);
  store.dropDevice(deviceId);
  streams.dropDevice(deviceId);
  stops.delete(deviceId);
}

// ------------------------------------------------------------
// Einwilligung, Schlafmodus und Ruhezeiten (server-api/eltern.ts)
// ------------------------------------------------------------

/** Warum das Gerät gerade nur einen festen Satz bekommt, oder null. */
function blockReasonFor(deviceId: string): BlockReason {
  return parents.blockReason(deviceId, config.requireConsent);
}

/**
 * Darf eine laufende Anfrage noch antworten? 'gesperrt': Der Betreiber hat das Gerät gesperrt.
 * 'einwilligung' oder 'schlaf': Die Eltern haben die Einwilligung widerrufen, den Schlafmodus
 * eingeschaltet, oder die Ruhezeit hat begonnen. null: ja.
 */
function refusalFor(req: Request, deviceId: string): 'gesperrt' | Exclude<BlockReason, null> | null {
  if (!stillAuthorized(req)) return 'gesperrt';
  return blockReasonFor(deviceId);
}

/** Fester Satz statt einer Antwort. Ohne Spracherkennung und ohne Sprachmodell. */
function blockedTurn(reason: Exclude<BlockReason, null>, state: unknown): TurnResult {
  const consent = reason === 'einwilligung';
  return {
    kind: 'hinweis',
    speech: consent ? CONSENT_MISSING_DE : SLEEPING_DE,
    story_state: state as StoryState,
    fixed: consent ? 'einwilligung' : 'schlaf',
    wav: generateMelodyWav([523.25, 440], [0.3, 0.4], config.audioSampleRate),
  };
}

/**
 * Antwortet statt einer Antwort: gesperrtes Gerät mit 401, sonst mit dem festen Satz
 * (`session_end: true`, damit das Gerät nicht auf eine Fortsetzung wartet). Der Stand der
 * Geschichte bleibt, wie er ist.
 */
async function refuse(
  req: Request,
  res: Response,
  deviceId: string,
  type: 'answer' | 'kunibert_story',
  timer: TurnTimer,
  refusal: 'gesperrt' | Exclude<BlockReason, null>
): Promise<any> {
  if (refusal === 'gesperrt') return res.status(401).json({ error: 'unauthorized' });
  const result = await synthesizeTimed(blockedTurn(refusal, {}), timer);
  timer.noteAudio(result.wav);
  if (!stillAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const turnId = store.put(deviceId, result.wav || Buffer.alloc(0));
  const body: Record<string, unknown> = { type, audio_url: deviceAudioUrl(req, turnId), session_end: true };
  if (config.diagnosticText) body.text = result.speech;
  return res.json(body);
}

async function transcribeOrEmpty(wav: Buffer, timer: StageTimer = NO_TIMER): Promise<string> {
  if (!voice.sttConfigured) return '';
  return timer.time('erkennung', () => voice.transcribe(wav, budgetTimeoutMs(timer)));
}

// Zeitmessung pro Anfrage: eine Logzeile mit Anfrage-ID, Modus, Dauer je Stufe und Länge des
// Antwort-Audios (siehe docs/Zeitmessung.md). Sie enthält nur Zahlen, nie Texte oder Tokens.
// Abgewiesene Anfragen (401, 429, 400), bei denen keine Stufe lief, erzeugen keine Zeile.
function startTurnTimer(_req: Request, res: Response, next: NextFunction): void {
  const timer = new TurnTimer();
  res.locals.timer = timer;
  res.once('close', () => {
    const line = timer.logLine(res.writableFinished ? res.statusCode : 'abgebrochen');
    if (line) console.log(line);
  });
  next();
}

/** Sprachausgabe mit Zeitmessung um den Aufruf herum. Ohne Sprachausgabe oder Text läuft keine Stufe. */
async function synthesizeTimed(
  result: Awaited<ReturnType<Brain['handle']>>,
  timer: StageTimer
): Promise<typeof result> {
  if (!voice.ttsConfigured || !result.speech) return result;
  return timer.time('sprachausgabe', () => synthesizeIfConfigured(result, timer));
}

async function synthesizeIfConfigured(result: Awaited<ReturnType<Brain['handle']>>, timer: StageTimer = NO_TIMER): Promise<typeof result> {
  if (!voice.ttsConfigured || !result.speech) return result;
  // Kein stiller Fallback: Schlägt die Sprachsynthese fehl, fliegt ein
  // VoiceProviderError (HTTP 503 bzw. 502 durch die Routen). So wird der
  // Pi-Client zum Wiederholen veranlasst, und der Story-State rückt nicht vor,
  // weil er erst nach erfolgreicher Synthese gespeichert wird.
  // Feste Texte (Sicherheitshinweis, "nicht verstanden", Fehlerhinweis) kommen nach dem
  // ersten Mal aus dem Speicher: schneller, billiger, und der Sicherheitshinweis bleibt
  // auch bei einem Anbieter-Ausfall hörbar, wenn er vorher aufgewärmt wurde.
  // Zeit für die Sprachausgabe: der Rest des Zeitbudgets, mindestens MIN_TTS_MS (auch wenn es schon aufgebraucht ist).
  const left = budgetTimeoutMs(timer);
  const timeoutMs = left === undefined ? undefined : Math.max(MIN_TTS_MS, left);
  result.wav = result.fixed
    ? await voice.synthesizeCached(result.speech, timeoutMs)
    : await voice.synthesize(result.speech, timeoutMs);
  return result;
}

// ------------------------------------------------------------
// picastAI.com Geräte-Schnittstelle (Pi-5-Prototyp und ESP32-S3-Firmware)
// ------------------------------------------------------------

app.post(
  '/v1/device/question',
  requireDevice,
  startTurnTimer,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<any> => {
    const deviceId = res.locals.deviceId as string;
    const timer = res.locals.timer as TurnTimer;
    timer.mode = 'frage';
    // Vom Anmelden (requireDevice): Wird der Stand des Geräts während dieser Anfrage gelöscht,
    // speichert sie ihn nicht neu.
    const generation = res.locals.storyGeneration as number;
    // Gesperrt, während die Aufnahme hochlud? Dann nichts mehr verarbeiten.
    if (!stillAuthorized(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!limiter.allow(deviceId)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'audio_required' });
    }

    try {
      // Ohne Einwilligung der Eltern, im Schlafmodus und in den Ruhezeiten: fester Satz. Die
      // Aufnahme geht dann nicht an die Spracherkennung, und nichts geht an das Sprachmodell.
      const blocked = blockReasonFor(deviceId);
      if (blocked) return await refuse(req, res, deviceId, 'answer', timer, blocked);
      const header = decodeWavHeader(req.file.buffer);
      if (!isPcmFormat(header.formatTag) || header.channels !== 1 || header.bitsPerSample !== 16 || header.sampleRate !== config.audioSampleRate) {
        return res.status(400).json({ error: 'unsupported_audio_format' });
      }

      // Testfeld: Text statt Aufnahme. Im Betrieb nur mit KUNIBERT_TEST_TRANSCRIPT=1 (config.ts).
      let transcript = config.testTranscript && typeof req.body.transcript === 'string'
        ? req.body.transcript.slice(0, 1000)
        : '';
      // Eine stumme Aufnahme geht nicht erst an die Spracherkennung: Sie ergibt den Hinweis
      // "nicht verstanden" (Whisper würde bei Stille eher etwas erfinden).
      if (!transcript && !isSilentPcm16(req.file.buffer)) transcript = await transcribeOrEmpty(req.file.buffer, timer);
      await waitForPendingTurn(deviceId);
      // Während der Erkennung gesperrt oder von den Eltern angehalten? Dann nicht an das Sprachmodell.
      const refusal = refusalFor(req, deviceId);
      if (refusal) return await refuse(req, res, deviceId, 'answer', timer, refusal);
      const state = deviceStoryStates.get(deviceId);
      // Hat das Kind den letzten Teil per Taste angehalten (B2), setzt eine Idee an der gehörten Stelle an.
      const resume = stops.resumeFor(deviceId, state);
      return await respondTurn(req, res, deviceId, timer, 'answer', generation, (sink) => brain.handle('frage', transcript, state || {}, timer, sink, resume));
    } catch (err) {
      console.error('Error in /v1/device/question:', err);
      if (err instanceof VoiceProviderError) {
        return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
      }
      // Nur eine kaputte Aufnahme ist "bad_audio" (400, der Pi wiederholt nicht). Alles andere
      // ist ein Fehler des Servers (500, der Pi wiederholt), ohne Fehlertext nach außen.
      if (err instanceof AudioError) {
        return res.status(400).json({ error: 'bad_audio' });
      }
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

app.post(
  '/v1/device/kunibert-story',
  startTurnTimer,
  async (req: Request, res: Response): Promise<any> => {
    const timer = res.locals.timer as TurnTimer;
    timer.mode = 'weiter';
    let deviceId: string;
    try {
      deviceId = authenticate(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const generation = deviceStoryStates.generation(deviceId);

    if (!limiter.allow(deviceId)) {
      return res.status(429).json({ error: 'rate_limited' });
    }

    // locale und age_band nimmt der Vertrag entgegen, derzeit gilt aber nur de-DE und
    // die serverseitig konfigurierte Altersgruppe (KUNIBERT_AGE).
    const requestedLength = String(req.body?.length || 'short');
    if (requestedLength !== 'short') {
      return res.status(400).json({ error: 'unsupported_length' });
    }

    try {
      // Ohne Einwilligung, im Schlafmodus und in den Ruhezeiten: fester Satz, kein Sprachmodell.
      const blocked = blockReasonFor(deviceId);
      if (blocked) return await refuse(req, res, deviceId, 'kunibert_story', timer, blocked);
      await waitForPendingTurn(deviceId);
      const waited = refusalFor(req, deviceId);
      if (waited) return await refuse(req, res, deviceId, 'kunibert_story', timer, waited);
      const state = deviceStoryStates.get(deviceId);
      // Die Erzähltaste setzt eine laufende Folge fort ("Drück noch einmal die
      // Erzähltaste") und beginnt nur dann eine neue, wenn keine läuft. Mit Modus
      // "geschichte" begänne jeder Druck wieder bei Teil 1. Einen Kinderwunsch gibt
      // es hier nicht: die Taste trägt keinen Text.
      // Hat das Kind den letzten Teil per Taste angehalten (B2), geht es an der gehörten Stelle weiter;
      // die Vorbereitung des nächsten Teils passt dann nicht.
      const resume = stops.resumeFor(deviceId, state);
      if (resume) {
        return await respondTurn(req, res, deviceId, timer, 'kunibert_story', generation, (sink) => brain.handle('weiter', '', state || {}, timer, sink, resume));
      }
      // Liegt der nächste Teil schon bereit (oder wird gerade vorbereitet), wird er genommen.
      const prepared = state && prefetcher.has(deviceId)
        ? await timer.time('vorbereitet', () =>
          prefetcher.take(deviceId, state, Math.max(0, timer.remainingMs() - PREFETCH_FRESH_RESERVE_MS)))
        : null;
      if (!prepared) {
        // Beim Warten auf die Vorbereitung gesperrt, die Einwilligung widerrufen oder der Schlafmodus
        // begonnen? Dann geht nichts mehr an das Sprachmodell (N1120-1610-b).
        const late = refusalFor(req, deviceId);
        if (late) return await refuse(req, res, deviceId, 'kunibert_story', timer, late);
        // Haben die Eltern die Geschichte beim Warten neu begonnen, geht der alte Stand nicht mehr an
        // Claude. Es gilt der neue Stand mit seinem Zähler: So wird der neue Teil 1 gespeichert.
        const nowGeneration = deviceStoryStates.generation(deviceId);
        const current = nowGeneration === generation ? state : deviceStoryStates.get(deviceId);
        return await respondTurn(req, res, deviceId, timer, 'kunibert_story', nowGeneration, (sink) => brain.handle('weiter', '', current || {}, timer, sink));
      }
      const result = prepared;
      timer.noteAudio(result.wav);
      const refusal = refusalFor(req, deviceId);
      if (refusal) return await refuse(req, res, deviceId, 'kunibert_story', timer, refusal);
      return sendWholeTurn(req, res, deviceId, result, 'kunibert_story', generation);
    } catch (err) {
      console.error('Error in /v1/device/kunibert-story:', err);
      if (err instanceof VoiceProviderError) {
        return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
      }
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

// POST /v1/device/playback-stopped {turn_id, heard_seconds}: Das Kind hat Kunibert per Taste angehalten
// (Punkt B2). War es ein Geschichtenteil, merkt sich der Server, bis zu welchem Satz das Kind ihn
// gehört hat; danach geht die Geschichte dort weiter. Ohne Sprachmodell und ohne Sprachausgabe, deshalb
// nicht im Rate-Limit der Anfragen, aber mit eigener Grenze. Antwort 204, auch wenn der Server mit der
// Meldung nichts anfangen kann.
app.post('/v1/device/playback-stopped', requireDevice, (req: Request, res: Response): any => {
  const deviceId = res.locals.deviceId as string;
  const turnId = req.body?.turn_id;
  const seconds = req.body?.heard_seconds;
  if (
    typeof turnId !== 'string' || !TURN_ID_PATTERN.test(turnId) ||
    typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_HEARD_SECONDS
  ) {
    return res.status(400).json({ error: 'bad_request' });
  }
  if (!stopReports.allow(deviceId)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  // Ohne Einwilligung der Eltern merkt sich der Server nichts. Im Schlafmodus und in den Ruhezeiten
  // schon: Ein vorher begonnener Teil kann noch laufen, und danach geht die Geschichte dort weiter.
  if (blockReasonFor(deviceId) !== 'einwilligung') logStop(stops.stopped(deviceId, turnId, seconds));
  return res.status(204).end();
});

app.get('/v1/device/audio/:turn_id', (req: Request, res: Response): any => {
  let deviceId: string;
  try {
    deviceId = authenticate(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const turnId = String(req.params.turn_id);
  const stream = streams.take(deviceId, turnId);
  if (stream) return sendAudioStream(res, stream);
  const wav = store.take(deviceId, turnId);
  if (!wav || wav.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.set({
    'Content-Type': 'audio/wav',
    'Content-Length': wav.length.toString(),
    'Cache-Control': 'no-store',
  });
  return res.send(wav);
});

/**
 * Schickt einen Ton-Strom als WAV unbekannter Länge (chunked). Fällt die Sprachausgabe mittendrin
 * aus, endet die Verbindung vorzeitig; das Gerät spielt, was es hat.
 */
async function sendAudioStream(res: Response, stream: PcmStream): Promise<void> {
  res.status(200).set({ 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Kunibert-Audio-Stream': '1' });
  res.write(streamingWavHeader(stream.sampleRate));
  try {
    for await (const chunk of stream.read()) {
      if (res.destroyed) return;
      if (!res.write(chunk)) await new Promise<void>((resolve) => { res.once('drain', resolve); res.once('close', resolve); });
    }
    res.end();
  } catch {
    res.destroy();
  }
}

/** Der Story-State, den der Web-Simulator bei /v1/turn mitschickt (Text oder Objekt); kaputt oder fehlend: leer. */
function parseSentState(raw: unknown): any {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Fester Satz bei /v1/turn (ohne Einwilligung, im Schlafmodus, in den Ruhezeiten), ohne Sprachmodell.
 * Der mitgeschickte Story-State kommt unverändert zurück. Gesperrt, während der Satz vertont wurde: 401.
 */
async function sendTurnHint(
  req: Request,
  res: Response,
  deviceId: string,
  reason: Exclude<BlockReason, null>,
  timer: TurnTimer
): Promise<Response> {
  const hint = await synthesizeTimed(blockedTurn(reason, parseSentState(req.body.story_state)), timer);
  timer.noteAudio(hint.wav);
  if (!stillAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const body: Record<string, any> = {
    turn_id: store.put(deviceId, hint.wav || Buffer.alloc(0)),
    kind: hint.kind,
    story_state: hint.story_state,
    fixed: hint.fixed,
  };
  if (config.diagnosticText) body.text = hint.speech;
  return res.json(body);
}

// POST /v1/turn
app.post(
  '/v1/turn',
  requireDevice,
  startTurnTimer,
  upload.single('audio'),
  async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const deviceId = res.locals.deviceId as string;
      const timer = res.locals.timer as TurnTimer;
      // Gesperrt, während die Aufnahme hochlud? Dann nichts mehr verarbeiten (wie /v1/device/question).
      if (!stillAuthorized(req)) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const mode = req.body.mode;
      if (!['frage', 'geschichte', 'weiter'].includes(mode)) {
        return res.status(400).json({ error: 'bad_mode' });
      }
      timer.mode = mode;

      // Prüfe Rate-Limit
      if (!limiter.allow(deviceId)) {
        return res.status(429).json({ error: 'rate_limited' });
      }

      // Ohne Einwilligung, im Schlafmodus und in den Ruhezeiten: fester Satz ohne Spracherkennung
      // und ohne Sprachmodell; der mitgeschickte Story-State kommt unverändert zurück.
      const blocked = blockReasonFor(deviceId);
      if (blocked) return await sendTurnHint(req, res, deviceId, blocked, timer);

      const state: any = parseSentState(req.body.story_state);

      // Transcript ermitteln. Text statt Aufnahme (Felder text und transcript, für den
      // Web-Simulator) gilt wie bei /v1/device/question nur mit config.testTranscript: Im
      // Heimnetz ohne Caddy ist diese Route sonst ein Weg an der Spracherkennung vorbei.
      let transcript = '';
      if (config.testTranscript && req.body.text) {
        transcript = String(req.body.text);
      } else if (req.file) {
        // Nur eine kaputte Aufnahme ist "bad_audio". Ein Ausfall der Spracherkennung ist ein
        // Fehler des Dienstes (503/502 im äußeren catch), keine kaputte Aufnahme. Liefert die
        // Erkennung keinen Text oder ist die Aufnahme stumm, antwortet der Erzähler mit
        // "nicht verstanden" wie bei /v1/device/question (früher: erfundener Ersatztext).
        let audioOk = true;
        try {
          decodeWavHeader(req.file.buffer);
        } catch {
          audioOk = false;
          if (mode === 'frage') {
            return res.status(400).json({ error: 'bad_audio' });
          }
        }
        if (audioOk) {
          const typed = config.testTranscript && typeof req.body.transcript === 'string' ? req.body.transcript.slice(0, 1000) : '';
          transcript = typed || (isSilentPcm16(req.file.buffer) ? '' : await transcribeOrEmpty(req.file.buffer, timer));
        }
      } else if (mode === 'frage') {
        return res.status(400).json({ error: 'audio_required' });
      }

      // Während der Erkennung gesperrt oder von den Eltern angehalten? Dann nicht an das Sprachmodell
      // (N1120-1610-b): gesperrt 401, sonst der feste Satz.
      const refusal = refusalFor(req, deviceId);
      if (refusal === 'gesperrt') return res.status(401).json({ error: 'unauthorized' });
      if (refusal) return await sendTurnHint(req, res, deviceId, refusal, timer);

      timer.guardLlm(() => !refusalFor(req, deviceId));
      const made = await brain.handle(mode, transcript, state, timer);
      // Gesperrt oder angehalten, während die Antwort entstand: gleich 401 oder der feste Satz, ohne
      // den Text erst zu vertonen; und noch einmal nach der Vertonung.
      const early = refusalFor(req, deviceId);
      if (early === 'gesperrt') return res.status(401).json({ error: 'unauthorized' });
      if (early) return await sendTurnHint(req, res, deviceId, early, timer);
      const turnResult = await synthesizeTimed(made, timer);
      timer.noteAudio(turnResult.wav);
      // Gesperrt oder angehalten, während die Antwort entstand: kein Ton (wie bei den Geräte-Routen).
      const late = refusalFor(req, deviceId);
      if (late === 'gesperrt') return res.status(401).json({ error: 'unauthorized' });
      if (late) return await sendTurnHint(req, res, deviceId, late, timer);
      const wav = turnResult.wav || Buffer.alloc(0);
      const turnId = store.put(deviceId, wav);

      const responseBody: Record<string, any> = {
        turn_id: turnId,
        kind: turnResult.kind,
        story_state: turnResult.story_state,
        fixed: turnResult.fixed || null,
      };
      if (config.diagnosticText) {
        responseBody.text = turnResult.speech;
      }

      return res.json(responseBody);
    } catch (err: any) {
      console.error('Error in /v1/turn:', err);
      if (err instanceof VoiceProviderError) {
        return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
      }
      // Keine Fehlertexte nach außen (können Provider-Antworten und Interna enthalten).
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

// GET /v1/turn/:turn_id/audio
app.get('/v1/turn/:turn_id/audio', (req: Request, res: Response): any => {
  try {
    let deviceId: string;
    try {
      deviceId = authenticate(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const turnId = String(req.params.turn_id);
    // Prüfe Abruf (einmaliger Abruf nach API-Spezifikation)
    const wav = store.take(deviceId, turnId);
    if (!wav || wav.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wav.length.toString(),
      'Cache-Control': 'no-store',
    });
    return res.send(wav);
  } catch (err) {
    return res.status(500).json({ error: 'audio_retrieval_failed' });
  }
});

// ------------------------------------------------------------
// Eltern-App, Server-Teil: Kopplung, Einwilligung, Schlafmodus, Ruhezeiten, Löschen
// (Schnittstelle: docs/picastAI-Pi-API.md, Abschnitt „Eltern“). Keine Protokollzeilen mit
// Codes, Tokens oder Geräte-IDs. Kein Verlauf, keine Mitschriften, keine Statistik je Kind.
// ------------------------------------------------------------

// POST /v1/device/pairing-code: Das Gerät (beide Tasten 5 s gehalten) holt einen sechsstelligen
// Code und spricht ihn. Fester Satz mit Ziffern, ohne Sprachmodell. Geht auch ohne Einwilligung
// und im Schlafmodus: Mit dem Code richten die Eltern das Gerät erst ein.
app.post('/v1/device/pairing-code', requireDevice, startTurnTimer, async (req: Request, res: Response): Promise<any> => {
  const deviceId = res.locals.deviceId as string;
  const timer = res.locals.timer as TurnTimer;
  timer.mode = 'kopplung';
  if (!limiter.allow(deviceId)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  try {
    const { code, expiresInSeconds } = parents.createPairingCode(deviceId);
    const speech = pairingCodeSpeech(code);
    let wav = generateMelodyWav([523.25, 659.25], [0.3, 0.4], config.audioSampleRate);
    if (voice.ttsConfigured) {
      // Nicht aus dem Zwischenspeicher: Jeder Code ist anders und soll nicht liegen bleiben.
      wav = await timer.time('sprachausgabe', () => voice.synthesize(speech, budgetTimeoutMs(timer)));
    }
    timer.noteAudio(wav);
    const turnId = store.put(deviceId, wav);
    const body: Record<string, unknown> = {
      type: 'pairing_code',
      audio_url: deviceAudioUrl(req, turnId),
      expires_in: expiresInSeconds,
    };
    // Kein Feld text, auch nicht mit KUNIBERT_DIAGNOSTIC_TEXT: Der Code soll nur als Ton das Gerät verlassen.
    return res.json(body);
  } catch (err) {
    if (err instanceof VoiceProviderError) {
      return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
    }
    // Fester Text ohne Einzelheiten des Fehlers: Sie könnten den Code enthalten.
    console.error('Fehler in /v1/device/pairing-code.');
    return res.status(500).json({ error: 'internal_error' });
  }
});

const PARENT_COOKIE = 'kb_eltern';
/** Vorläufig: Das Eltern-Cookie gilt 180 Tage (solange der Server nicht neu startet, siehe eltern.ts). */
const PARENT_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function parentCookie(req: Request, value: string, maxAgeSeconds: number): string {
  // Secure im Betrieb immer (hinter Caddy mit TLS); sonst nur, wenn die Anfrage über https kam.
  const secure = process.env.NODE_ENV === 'production' || req.secure;
  return [
    `${PARENT_COOKIE}=${value}`,
    'Path=/v1/eltern',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/** Ändernde Eltern-Anfragen nur als JSON: Ein fremdes Formular kann das ohne CORS nicht senden. */
function requireJson(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json')) {
    res.status(415).json({ error: 'json_required' });
    return;
  }
  next();
}

function requireParent(req: Request, res: Response, next: NextFunction): void {
  const deviceId = parents.deviceForToken(readCookie(req, PARENT_COOKIE));
  // Ein gesperrtes Gerät hat keine Eltern-Steuerung mehr.
  if (!deviceId || !registry.isActive(deviceId)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.locals.parentDeviceId = deviceId;
  next();
}

// POST /v1/eltern/koppeln {code}: Code einlösen, Eltern-Token als Cookie setzen.
app.post('/v1/eltern/koppeln', requireJson, (req: Request, res: Response): any => {
  // Nur Fehlversuche zählen. Wer zu oft falsch rät, wartet bis zu 10 Minuten.
  const sender = req.ip || 'unbekannt';
  if (pairingFailures.getStatus(sender).remaining === 0 || pairingFailuresTotal.getStatus('alle').remaining === 0) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  const redeemed = parents.redeemPairingCode(req.body?.code);
  if (!redeemed || !registry.isActive(redeemed.deviceId)) {
    pairingFailures.allow(sender);
    pairingFailuresTotal.allow('alle');
    return res.status(400).json({ error: 'invalid_code' });
  }
  res.set('Set-Cookie', parentCookie(req, redeemed.token, PARENT_COOKIE_MAX_AGE_SECONDS));
  res.set('Cache-Control', 'no-store');
  return res.json({ gekoppelt: true, ...parents.settings(redeemed.deviceId) });
});

// GET /v1/eltern/status: aktueller Stand (kein Verlauf).
app.get('/v1/eltern/status', requireParent, (_req: Request, res: Response) => {
  res.json(parents.settings(res.locals.parentDeviceId as string));
});

// PUT /v1/eltern/einwilligung: Einwilligung erteilen.
app.put('/v1/eltern/einwilligung', requireJson, requireParent, (_req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  parents.grantConsent(deviceId);
  res.json(parents.settings(deviceId));
});

// DELETE /v1/eltern/einwilligung: Einwilligung widerrufen. Stand der Geschichte, Vorbereitung und
// wartendes Audio werden gelöscht; laufende Anfragen antworten nur noch mit dem festen Satz.
app.delete('/v1/eltern/einwilligung', requireParent, (_req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  parents.revokeConsent(deviceId);
  forgetDeviceStory(deviceId);
  res.json(parents.settings(deviceId));
});

// PUT /v1/eltern/einstellungen {schlafmodus?: boolean, ruhezeiten?: {von, bis} | null}
app.put('/v1/eltern/einstellungen', requireJson, requireParent, (req: Request, res: Response): any => {
  const deviceId = res.locals.parentDeviceId as string;
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  if ('schlafmodus' in body && typeof body.schlafmodus !== 'boolean') {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  // Gleicher Beginn und gleiches Ende wären keine Ruhezeit (eltern.ts): lieber ablehnen als still nichts tun.
  if (
    'ruhezeiten' in body &&
    body.ruhezeiten !== null &&
    !(isValidTime(body.ruhezeiten?.von) && isValidTime(body.ruhezeiten?.bis) && body.ruhezeiten.von !== body.ruhezeiten.bis)
  ) {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  if ('schlafmodus' in body) parents.setSleep(deviceId, body.schlafmodus);
  if ('ruhezeiten' in body) parents.setQuietHours(deviceId, body.ruhezeiten ? { von: body.ruhezeiten.von, bis: body.ruhezeiten.bis } : null);
  return res.json(parents.settings(deviceId));
});

// POST /v1/eltern/geschichte-neu: Die nächste Erzählung beginnt eine neue Folge.
app.post('/v1/eltern/geschichte-neu', requireJson, requireParent, (_req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  deviceStoryStates.delete(deviceId);
  // Der vorbereitete nächste Teil und eine gemerkte Stelle (Stopp per Taste) gehören zur alten Folge.
  prefetcher.cancel(deviceId);
  stops.delete(deviceId);
  res.json({ geschichte_neu: true });
});

// DELETE /v1/eltern/daten: alles löschen, was der Server zum Gerät für die Eltern hält:
// Einwilligung, Einstellungen, Eltern-Tokens (auch auf anderen Handys), Geschichte, wartendes Audio.
// Die Geräte-Anmeldung selbst bleibt (die verwaltet der Betreiber).
app.delete('/v1/eltern/daten', requireParent, (req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  parents.forgetDevice(deviceId);
  forgetDeviceStory(deviceId);
  res.set('Set-Cookie', parentCookie(req, '', 0));
  res.json({ geloescht: true });
});

// ------------------------------------------------------------
// Dashboard & Simulator Verwaltungs-APIs
// ------------------------------------------------------------

app.get('/api/devices', requireAdminAuth, (_req: Request, res: Response) => {
  res.json({ devices: registry.list() });
});

app.post('/api/devices', requireAdminAuth, async (req: Request, res: Response): Promise<any> => {
  const { deviceId, name } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }
  try {
    return res.json(await registry.register(deviceId, name));
  } catch (err: any) {
    if (err instanceof DeviceStoreError) {
      console.error(`Geräte-Store nicht erreichbar: ${err.message}`);
      return res.status(503).json({ error: 'device_store_unavailable' });
    }
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/devices/:id/revoke', requireAdminAuth, async (req: Request, res: Response): Promise<any> => {
  const deviceId = String(req.params.id);
  // Ein gesperrtes Gerät braucht seine Geschichte nicht mehr (Stand, Vorbereitung, wartendes Audio)
  // und keine Eltern-Steuerung (Einwilligung, Einstellungen, Codes, Eltern-Tokens). Das geschieht
  // sofort, noch bevor Firestore den Widerruf speichert (N1120-1610-b).
  const { success, persisted } = await registry.revokeAndPersist(deviceId, () => {
    forgetDeviceStory(deviceId);
    parents.forgetDevice(deviceId);
  });
  return res.json({ success, persisted });
});

// POST /api/devices/:id/kopplungscode: Kopplungscode als Text für den Betreiber (Tests mit
// Erwachsenen, solange Pi-Client und Firmware den Code noch nicht sprechen; deploy/eltern-einwilligung.mjs).
app.post('/api/devices/:id/kopplungscode', requireAdminAuth, (req: Request, res: Response): any => {
  const deviceId = String(req.params.id);
  if (!registry.isActive(deviceId)) return res.status(404).json({ error: 'not_found' });
  const { code, expiresInSeconds } = parents.createPairingCode(deviceId);
  res.set('Cache-Control', 'no-store');
  return res.json({ code, expires_in: expiresInSeconds });
});

app.get('/api/config', requireAdminAuth, (_req: Request, res: Response) => {
  res.json(getSafeConfigSummary(config));
});

app.get('/api/status', requireAdminAuth, (req: Request, res: Response) => {
  const deviceId = (req.query.device as string) || 'simulator-web';
  res.json({
    rateLimit: limiter.getStatus(deviceId),
    audioStoreItems: store.count,
    // Nur Zahlen, keine Geräte-IDs und keine Inhalte.
    storyStates: deviceStoryStates.count,
    storyPrefetches: prefetcher.size,
    storyStops: stops.count,
    eltern: parents.counts,
    llm: brain.llmName,
    config: getSafeConfigSummary(config),
  });
});

// ------------------------------------------------------------
// Fehlerbehandlung: Upload- und JSON-Fehler als JSON-Antwort mit passendem Status
// ------------------------------------------------------------

// Ohne diese Weiche antwortet Express auf zu große Uploads mit HTTP 500 (und in der
// Entwicklung mit Stacktrace). Der Pi-Client wiederholt 5xx, behandelt 400/413 aber
// als endgültig abgelehnt.
app.use((err: any, _req: Request, res: Response, next: NextFunction): any => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'audio_too_large' : 'bad_upload' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json' });
  }
  // Fehler von Express und Middleware mit eigenem Clientstatus (zum Beispiel ein
  // ungültig kodierter Pfad wie /v1/device/audio/%zz, URIError mit Status 400)
  // bleiben 4xx. Als 500 würde der Pi-Client sie wiederholen.
  const status = Number(err?.status ?? err?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: 'bad_request' });
  }
  console.error('Unbehandelter Fehler:', err);
  return res.status(500).json({ error: 'internal_error' });
});

// ------------------------------------------------------------
// Vite Dev Server / Static File Serving
// ------------------------------------------------------------

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    console.warn(
      'Hinweis: NODE_ENV ist nicht "production". Entwicklungsgeräte mit bekannten Tokens ' +
      '(prototype-1, simulator-web) und der Vite-Entwicklungsserver sind aktiv. ' +
      'Für den echten Betrieb NODE_ENV=production setzen (und vorher npm run build ausführen).'
    );
  }

  // Fail-closed: Ist ein dauerhafter Store konfiguriert, aber nicht lesbar,
  // starten wir nicht. Sonst wären widerrufene Geräte wieder gültig.
  if (config.deviceStore === 'firestore') {
    const count = await registry.loadFromStore();
    console.log(`Geräteliste aus Firestore geladen (${count} Einträge).`);
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`🏰 Ritter Kunibert Server läuft auf http://${HOST}:${PORT}`);
    for (const warning of [...llmConfigWarnings(), ...ttsProviderWarnings(), ...voiceConfigWarnings(config), ...testSwitchWarnings()]) console.warn(`⚠️ ${warning}`);
    // Feste Sprechtexte vorab synthetisieren (Produktion), damit der Sicherheitshinweis
    // schon beim ersten Kind ohne Wartezeit und ohne Anbieter-Anfrage gesprochen wird.
    // Mit neuen Versuchen, falls der Sprachserver nach einem Neustart noch nicht bereit ist.
    if (isProd && voice.ttsConfigured) {
      const fixedTexts = [SAFETY_RESPONSE_DE, UNCLEAR_RESPONSE_DE, ERROR_RESPONSE_DE, FALLBACK_ANSWER_DE, STORY_PAUSE_TEXT, CONSENT_MISSING_DE, SLEEPING_DE];
      void voice
        .warmUpWithRetry(fixedTexts)
        .then((count) => console.log(`Feste Sprechtexte vorbereitet (${count} von ${fixedTexts.length}).`));
    }
  });
}

startServer().catch((err) => {
  console.error('Fehler beim Starten des Servers:', err);
  process.exit(1);
});
