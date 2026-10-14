import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DeviceRegistry, RateLimiter, AudioStore } from './server-api/devices.js';
import { Brain, StoryState } from './server-api/brain.js';
import { AudioError, decodeWavHeader } from './server-api/audio.js';
import { config, getSafeConfigSummary } from './server-api/config.js';
import {
  saveDeviceToFirestore,
  revokeDeviceInFirestore,
  saveTurnToFirestore,
  saveStorySessionToFirestore,
} from './server-api/firestore-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;
const HOST = config.host;

// In-Memory Dienste
const registry = new DeviceRegistry();
const limiter = new RateLimiter(
  config.rateLimitMaxTurns,
  config.rateLimitWindowSeconds
);
const store = new AudioStore(
  config.audioTtlSeconds
);
const brain = new Brain();
const deviceStoryStates = new Map<string, StoryState>();

// Multer für WAV Uploads (max 2 MB)
const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

app.use(cors());
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

// GET /health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', name: 'Ritter Kunibert API', time: Date.now() });
});

function deviceAudioUrl(req: Request, turnId: string): string {
  return `${req.protocol}://${req.get('host')}/v1/device/audio/${encodeURIComponent(turnId)}`;
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

function normalizeDeviceLocale(value: unknown): string {
  const locale = String(value || 'de-DE').trim();
  return locale === 'de-DE' ? locale : 'de-DE';
}

function normalizeAgeBand(value: unknown): string {
  const ageBand = String(value || '6-10').trim();
  return /^(6-10|6–10)$/.test(ageBand) ? '6-10' : '6-10';
}

function rememberDeviceStoryState(deviceId: string, state: StoryState): void {
  // Nur der kleine Story-State bleibt im RAM; Audio und Diagnosetexte werden
  // nicht zusätzlich in dieser Session-Map gespeichert.
  deviceStoryStates.set(deviceId, state);
}

function recordDeviceTurn(
  deviceId: string,
  mode: string,
  result: Awaited<ReturnType<Brain['handle']>>,
  turnId: string
): void {
  saveTurnToFirestore(deviceId, {
    turnId,
    mode,
    kind: result.kind,
    text: result.speech,
    timestamp: Date.now(),
  }).catch(() => {});
  saveStorySessionToFirestore(deviceId, result.story_state).catch(() => {});
}

// ------------------------------------------------------------
// picastAI.com Geräte-Schnittstelle für Raspberry Pi Zero 2 W Prototyp
// ------------------------------------------------------------

app.post(
  '/v1/device/question',
  upload.single('audio'),
  async (req: Request, res: Response): Promise<any> => {
    let deviceId: string;
    try {
      deviceId = authenticate(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!limiter.allow(deviceId)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'audio_required' });
    }

    try {
      const header = decodeWavHeader(req.file.buffer);
      if (header.channels !== 1 || header.bitsPerSample !== 16 || header.sampleRate !== config.audioSampleRate) {
        return res.status(400).json({ error: 'unsupported_audio_format' });
      }

      // Eine echte STT-Anbindung wird als nächster Provider-Schritt ergänzt.
      // Der Prototyp akzeptiert deshalb optional ein diagnostisches transcript-
      // Feld und nutzt sonst einen neutralen Fallback statt eine Antwort zu
      // erfinden, die den Audioinhalt behauptet zu kennen.
      const transcript = typeof req.body.transcript === 'string'
        ? req.body.transcript.slice(0, 1000)
        : '';
      const state = deviceStoryStates.get(deviceId) || {};
      const result = await brain.handle('frage', transcript, state);
      rememberDeviceStoryState(deviceId, result.story_state);
      const response = deviceResponse(req, deviceId, result, 'answer');
      recordDeviceTurn(deviceId, 'frage', result, response.turnId);
      return res.json(response.body);
    } catch (err) {
      console.error('Error in /v1/device/question:', err);
      return res.status(400).json({ error: 'bad_audio' });
    }
  }
);

app.post(
  '/v1/device/kunibert-story',
  async (req: Request, res: Response): Promise<any> => {
    let deviceId: string;
    try {
      deviceId = authenticate(req);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!limiter.allow(deviceId)) {
      return res.status(429).json({ error: 'rate_limited' });
    }

    const locale = normalizeDeviceLocale(req.body?.locale);
    const ageBand = normalizeAgeBand(req.body?.age_band);
    const requestedLength = String(req.body?.length || 'short');
    if (requestedLength !== 'short') {
      return res.status(400).json({ error: 'unsupported_length' });
    }

    try {
      const state = deviceStoryStates.get(deviceId) || {};
      const wish = `${locale} ${ageBand}`;
      const result = await brain.handle('geschichte', wish, state);
      rememberDeviceStoryState(deviceId, result.story_state);
      const response = deviceResponse(req, deviceId, result, 'kunibert_story');
      recordDeviceTurn(deviceId, 'geschichte', result, response.turnId);
      return res.json(response.body);
    } catch (err) {
      console.error('Error in /v1/device/kunibert-story:', err);
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
  upload.single('audio'),
  async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      let deviceId: string;
      try {
        deviceId = authenticate(req);
      } catch (authErr) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const mode = req.body.mode;
      if (!['frage', 'geschichte', 'weiter'].includes(mode)) {
        return res.status(400).json({ error: 'bad_mode' });
      }

      // Prüfe Rate-Limit
      if (!limiter.allow(deviceId)) {
        return res.status(429).json({ error: 'rate_limited' });
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

      // Transcript ermitteln
      let transcript = '';
      if (req.body.text) {
        transcript = String(req.body.text);
      } else if (req.file) {
        try {
          const header = decodeWavHeader(req.file.buffer);
          // Wenn echte Audiodaten hochgeladen wurden, nutzen wir Begleittext oder Standard
          transcript = req.body.transcript || 'Frage von Ritter Kunibert Kind';
        } catch (wavErr) {
          if (mode === 'frage') {
            return res.status(400).json({ error: 'bad_audio' });
          }
        }
      } else if (mode === 'frage') {
        return res.status(400).json({ error: 'audio_required' });
      }

      const turnResult = await brain.handle(mode, transcript, state);
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

      // Asynchron in Firestore persistieren
      saveTurnToFirestore(deviceId, {
        turnId,
        mode,
        kind: turnResult.kind,
        text: turnResult.speech,
        timestamp: Date.now(),
      }).catch(() => {});

      if (turnResult.story_state) {
        saveStorySessionToFirestore(deviceId, turnResult.story_state).catch(() => {});
      }

      return res.json(responseBody);
    } catch (err: any) {
      console.error('Error in /v1/turn:', err);
      return res.status(500).json({ error: 'internal_error', detail: err.message });
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
// Dashboard & Simulator Verwaltungs-APIs
// ------------------------------------------------------------

app.get('/api/devices', (_req: Request, res: Response) => {
  res.json({ devices: registry.list() });
});

app.post('/api/devices', (req: Request, res: Response): any => {
  const { deviceId, name } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }
  try {
    const created = registry.add(deviceId, name);
    saveDeviceToFirestore({
      deviceId: created.deviceId,
      name: name || deviceId,
      created: Math.floor(Date.now() / 1000),
      revoked: false,
      tokenSha256: '',
    }).catch(() => {});
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/devices/:id/revoke', (req: Request, res: Response): any => {
  const devId = String(req.params.id);
  const success = registry.revoke(devId);
  revokeDeviceInFirestore(devId).catch(() => {});
  return res.json({ success });
});

app.get('/api/config', (_req: Request, res: Response) => {
  res.json(getSafeConfigSummary(config));
});

app.get('/api/status', (req: Request, res: Response) => {
  const deviceId = (req.query.device as string) || 'simulator-web';
  res.json({
    rateLimit: limiter.getStatus(deviceId),
    audioStoreItems: store.count,
    geminiConfigured: Boolean(config.geminiApiKey),
    config: getSafeConfigSummary(config),
  });
});

// ------------------------------------------------------------
// Vite Dev Server / Static File Serving
// ------------------------------------------------------------

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

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
  });
}

startServer().catch((err) => {
  console.error('Fehler beim Starten des Servers:', err);
  process.exit(1);
});
