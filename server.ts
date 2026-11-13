import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DeviceRegistry, DeviceStoreError, RateLimiter, AudioStore } from './server-api/devices.js';
import { Brain, FALLBACK_ANSWER_DE, StoryState, type TurnResult } from './server-api/brain.js';
import { StoryStateStore } from './server-api/story-states.js';
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
// Stand der laufenden Geschichte je Gerät: verfällt nach 24 Stunden ohne Nutzung
// (vorläufig, Maßnahme M9). Stündlich räumt der Server abgelaufene Einträge auf,
// auch von Geräten, die sich nie wieder melden.
const deviceStoryStates = new StoryStateStore();
setInterval(() => deviceStoryStates.purge(), 60 * 60 * 1000).unref();
// Eltern-Steuerung: Kopplung, Einwilligung, Schlafmodus, Ruhezeiten (vorläufig nur im RAM).
const parents = new ParentControls();
// Falsche Kopplungscodes: höchstens 10 je 10 Minuten und Absender (Schutz vor Raten).
const pairingLimiter = new RateLimiter(10, 600);

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
    res.locals.deviceId = authenticate(req);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
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

function rememberDeviceStoryState(deviceId: string, state: StoryState): void {
  // Nur der kleine Story-State bleibt im RAM; Audio und Diagnosetexte werden
  // nicht zusätzlich in dieser Session-Map gespeichert.
  deviceStoryStates.set(deviceId, state);
}

async function transcribeOrEmpty(wav: Buffer, timer: StageTimer = NO_TIMER): Promise<string> {
  if (!voice.sttConfigured) return '';
  return timer.time('erkennung', () => voice.transcribe(wav, budgetTimeoutMs(timer)));
}

/**
 * Fester Hinweis statt einer Antwort, wenn das Gerät gerade nicht antworten darf
 * (keine Einwilligung, Schlafmodus, Ruhezeiten). Ohne Spracherkennung und ohne Sprachmodell.
 */
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

/** Antwortet mit dem festen Hinweis, wenn das Gerät gesperrt ist. Gibt true zurück, wenn geantwortet wurde. */
async function respondIfBlocked(
  req: Request,
  res: Response,
  deviceId: string,
  type: 'answer' | 'kunibert_story',
  timer: TurnTimer
): Promise<boolean> {
  const reason = parents.blockReason(deviceId, config.requireConsent);
  if (!reason) return false;
  const result = await synthesizeTimed(blockedTurn(reason, {}), timer);
  timer.noteAudio(result.wav);
  const turnId = store.put(deviceId, result.wav || Buffer.alloc(0));
  // session_end: true, damit das Gerät nicht auf eine Fortsetzung wartet. Der Story-State bleibt unverändert.
  const body: Record<string, unknown> = { type, audio_url: deviceAudioUrl(req, turnId), session_end: true };
  if (config.diagnosticText) body.text = result.speech;
  res.json(body);
  return true;
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

    if (!limiter.allow(deviceId)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'audio_required' });
    }

    try {
      // Ohne Einwilligung, im Schlafmodus und in Ruhezeiten: fester Hinweis, die Aufnahme
      // geht nicht an die Spracherkennung und nichts geht an das Sprachmodell.
      if (await respondIfBlocked(req, res, deviceId, 'answer', timer)) return;
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
      const state = deviceStoryStates.get(deviceId);
      const result = await synthesizeTimed(await brain.handle('frage', transcript, state, timer), timer);
      timer.noteAudio(result.wav);
      rememberDeviceStoryState(deviceId, result.story_state);
      const response = deviceResponse(req, deviceId, result, 'answer');
      return res.json(response.body);
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
      if (await respondIfBlocked(req, res, deviceId, 'kunibert_story', timer)) return;
      const state = deviceStoryStates.get(deviceId);
      // Die Erzähltaste setzt eine laufende Folge fort ("Drück noch einmal die
      // Erzähltaste") und beginnt nur dann eine neue, wenn keine läuft. Mit Modus
      // "geschichte" begänne jeder Druck wieder bei Teil 1. Einen Kinderwunsch gibt
      // es hier nicht: die Taste trägt keinen Text.
      const result = await synthesizeTimed(await brain.handle('weiter', '', state, timer), timer);
      timer.noteAudio(result.wav);
      rememberDeviceStoryState(deviceId, result.story_state);
      const response = deviceResponse(req, deviceId, result, 'kunibert_story');
      return res.json(response.body);
    } catch (err) {
      console.error('Error in /v1/device/kunibert-story:', err);
      if (err instanceof VoiceProviderError) {
        return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
      }
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

app.get('/v1/device/audio/:turn_id', (req: Request, res: Response): any => {
  let deviceId: string;
  try {
    deviceId = authenticate(req);
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const turnId = String(req.params.turn_id);
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

      const mode = req.body.mode;
      if (!['frage', 'geschichte', 'weiter'].includes(mode)) {
        return res.status(400).json({ error: 'bad_mode' });
      }
      timer.mode = mode;

      // Prüfe Rate-Limit
      if (!limiter.allow(deviceId)) {
        return res.status(429).json({ error: 'rate_limited' });
      }

      // Gesperrt (keine Einwilligung, Schlafmodus, Ruhezeiten): fester Hinweis ohne
      // Spracherkennung und ohne Sprachmodell; der mitgeschickte Story-State kommt unverändert zurück.
      const blockReason = parents.blockReason(deviceId, config.requireConsent);
      if (blockReason) {
        let sentState: unknown = {};
        try {
          sentState = typeof req.body.story_state === 'string' ? JSON.parse(req.body.story_state) : (req.body.story_state ?? {});
        } catch {
          sentState = {};
        }
        const blocked = await synthesizeTimed(blockedTurn(blockReason, sentState), timer);
        timer.noteAudio(blocked.wav);
        const blockedBody: Record<string, any> = {
          turn_id: store.put(deviceId, blocked.wav || Buffer.alloc(0)),
          kind: blocked.kind,
          story_state: blocked.story_state,
          fixed: blocked.fixed,
        };
        if (config.diagnosticText) blockedBody.text = blocked.speech;
        return res.json(blockedBody);
      }

      // Story-State parsen
      let state: any = {};
      if (req.body.story_state) {
        try {
          state =
            typeof req.body.story_state === 'string'
              ? JSON.parse(req.body.story_state)
              : req.body.story_state;
        } catch {
          state = {};
        }
      }

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

      const turnResult = await synthesizeTimed(await brain.handle(mode, transcript, state, timer), timer);
      timer.noteAudio(turnResult.wav);
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

// POST /v1/device/pairing-code: Das Gerät (beide Tasten 5 s gehalten) holt einen
// sechsstelligen Code und spricht ihn. Fester Satz mit Ziffern, ohne Sprachmodell.
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
    if (config.diagnosticText) body.text = speech;
    return res.json(body);
  } catch (err) {
    if (err instanceof VoiceProviderError) {
      return res.status(err.retryable ? 503 : 502).json({ error: 'voice_provider_failed', retryable: err.retryable });
    }
    console.error('Fehler in /v1/device/pairing-code');
    return res.status(500).json({ error: 'internal_error' });
  }
});

const PARENT_COOKIE = 'kb_eltern';
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
  // Secure im Betrieb immer (hinter Caddy mit TLS); im Probelauf nur, wenn die Anfrage https war.
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
  // Nur Fehlversuche zählen: Wer zu oft falsch rät, wartet bis zu 10 Minuten.
  const sender = req.ip || 'unbekannt';
  if (pairingLimiter.getStatus(sender).remaining === 0) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  const redeemed = parents.redeemPairingCode(req.body?.code);
  if (!redeemed || !registry.isActive(redeemed.deviceId)) {
    pairingLimiter.allow(sender);
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

// DELETE /v1/eltern/einwilligung: Einwilligung widerrufen. Der Stand der Geschichte wird gelöscht.
app.delete('/v1/eltern/einwilligung', requireParent, (_req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  parents.revokeConsent(deviceId);
  deviceStoryStates.delete(deviceId);
  store.dropDevice(deviceId);
  res.json(parents.settings(deviceId));
});

// PUT /v1/eltern/einstellungen {schlafmodus?: boolean, ruhezeiten?: {von, bis} | null}
app.put('/v1/eltern/einstellungen', requireJson, requireParent, (req: Request, res: Response): any => {
  const deviceId = res.locals.parentDeviceId as string;
  const body = req.body ?? {};
  if ('schlafmodus' in body && typeof body.schlafmodus !== 'boolean') {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  if ('ruhezeiten' in body && body.ruhezeiten !== null && !(isValidTime(body.ruhezeiten?.von) && isValidTime(body.ruhezeiten?.bis))) {
    return res.status(400).json({ error: 'invalid_settings' });
  }
  if ('schlafmodus' in body) parents.setSleep(deviceId, body.schlafmodus);
  if ('ruhezeiten' in body) parents.setQuietHours(deviceId, body.ruhezeiten ? { von: body.ruhezeiten.von, bis: body.ruhezeiten.bis } : null);
  return res.json(parents.settings(deviceId));
});

// POST /v1/eltern/geschichte-neu: Die nächste Erzählung beginnt bei einer neuen Folge.
app.post('/v1/eltern/geschichte-neu', requireJson, requireParent, (_req: Request, res: Response) => {
  deviceStoryStates.delete(res.locals.parentDeviceId as string);
  res.json({ geschichte_neu: true });
});

// DELETE /v1/eltern/daten: alles löschen, was der Server zum Gerät für die Eltern hält:
// Einwilligung, Einstellungen, Eltern-Tokens (auch auf anderen Handys), Geschichte, wartendes Audio.
// Die Geräte-Anmeldung selbst bleibt (die verwaltet der Betreiber).
app.delete('/v1/eltern/daten', requireParent, (req: Request, res: Response) => {
  const deviceId = res.locals.parentDeviceId as string;
  parents.forgetDevice(deviceId);
  deviceStoryStates.delete(deviceId);
  store.dropDevice(deviceId);
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
  const { success, persisted } = await registry.revokeAndPersist(deviceId);
  // Ein gesperrtes Gerät braucht seinen Geschichten-Stand und seine Eltern-Steuerung nicht mehr.
  deviceStoryStates.delete(deviceId);
  parents.forgetDevice(deviceId);
  store.dropDevice(deviceId);
  return res.json({ success, persisted });
});

// POST /api/devices/:id/kopplungscode: Kopplungscode als Text für den Betreiber (Tests mit
// Erwachsenen, solange Pi-Client und Firmware den Code noch nicht sprechen).
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
    storyStates: deviceStoryStates.count,
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
      const fixedTexts = [SAFETY_RESPONSE_DE, UNCLEAR_RESPONSE_DE, ERROR_RESPONSE_DE, FALLBACK_ANSWER_DE, CONSENT_MISSING_DE, SLEEPING_DE];
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
