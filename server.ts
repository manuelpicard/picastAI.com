import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DeviceRegistry, RateLimiter, AudioStore } from './server-api/devices.js';
import { Brain, StoryState } from './server-api/brain.js';
import { AudioError, decodeWavHeader } from './server-api/audio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// In-Memory Dienste
const registry = new DeviceRegistry();
const limiter = new RateLimiter(
  Number(process.env.KUNIBERT_RATE_LIMIT) || 30,
  600
);
const store = new AudioStore(
  Number(process.env.KUNIBERT_AUDIO_TTL) || 120
);
const brain = new Brain();

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
        text: turnResult.speech, // Für Web-Simulator & Diagnose
        fixed: turnResult.fixed || null,
      };

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
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/devices/:id/revoke', (req: Request, res: Response): any => {
  const success = registry.revoke(String(req.params.id));
  return res.json({ success });
});

app.get('/api/status', (req: Request, res: Response) => {
  const deviceId = (req.query.device as string) || 'simulator-web';
  res.json({
    rateLimit: limiter.getStatus(deviceId),
    audioStoreItems: store.count,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
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
