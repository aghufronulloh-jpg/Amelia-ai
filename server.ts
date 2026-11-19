import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { verifyFirebaseIdToken } from './server/firebaseAuth.ts';
import {
  analyzeTurnMemoryAndMood,
  generateDailyCheckIn,
  streamAmeliaReply,
  synthesizeAmeliaSpeech,
  transcribeAudioBase64,
} from './server/gemini.ts';
import type {
  ChatMessage,
  MemoryItem,
  MoodType,
  PersonalityConfig,
  RoleplayModeId,
} from './src/types/amelia.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface AuthedRequest extends Request {
  uid?: string;
}

async function optionalFirebaseAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const verified = await verifyFirebaseIdToken(token);
      if (verified.emailVerified) {
        req.uid = verified.uid;
      }
    } catch {
      // Allow anonymous local usage even if stale token is present
    }
  }
  next();
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('PERMISSION_DENIED')) {
    return 'API key Gemini belum valid atau belum dipilih. Periksa panel Settings > Secrets.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Kuota Gemini API sedang penuh. Coba lagi beberapa saat lagi ya.';
  }
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('Service Unavailable')
  ) {
    return 'Server AI lagi ramai banget sebentar (503). Tunggu beberapa detik lalu coba kirim ulang ya.';
  }
  if (raw.trim().startsWith('{')) {
    return 'Layanan AI sedang sibuk sementara. Coba kirim ulang sebentar lagi ya.';
  }
  return raw || 'Terjadi gangguan pada layanan AI.';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // --- Streaming Chat ---
  app.post(
    '/api/chat/stream',
    optionalFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      const {
        history,
        personality,
        memories,
        roleplayMode,
        customRoleplayNote,
        currentMood,
        lastUserText,
      } = (req.body || {}) as {
        history?: ChatMessage[];
        personality?: PersonalityConfig;
        memories?: MemoryItem[];
        roleplayMode?: RoleplayModeId;
        customRoleplayNote?: string;
        currentMood?: MoodType;
        lastUserText?: string;
      };

      if (!Array.isArray(history) || history.length === 0 || !personality) {
        res.status(400).json({ error: 'Riwayat percakapan atau profil kepribadian tidak lengkap.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      let fullReply = '';
      try {
        for await (const chunk of streamAmeliaReply({
          history: history.slice(-16),
          personality,
          memories: Array.isArray(memories) ? memories : [],
          roleplayMode: roleplayMode || 'natural',
          customRoleplayNote: customRoleplayNote || '',
          currentMood: currentMood || 'hangat',
        })) {
          fullReply += chunk;
          sendEvent('chunk', { text: chunk });
        }

        const cleanReply =
          fullReply.trim() || 'Hmm, aku lagi mikir sebentar. Coba ceritain lagi deh?';

        sendEvent('done', {
          reply: cleanReply,
          mood: currentMood || 'hangat',
        });
      } catch (err) {
        sendEvent('error', { error: formatGeminiError(err) });
      } finally {
        res.end();
      }
    }
  );

  // --- Non-blocking Post-Turn Memory & Mood Analysis ---
  app.post(
    '/api/chat/analyze-turn',
    optionalFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { userMessage, assistantReply, existingMemories, currentMood } = (req.body || {}) as {
          userMessage?: string;
          assistantReply?: string;
          existingMemories?: MemoryItem[];
          currentMood?: MoodType;
        };
        if (!assistantReply) {
          res.json({ mood: currentMood || 'hangat', candidates: [] });
          return;
        }
        const analysis = await analyzeTurnMemoryAndMood({
          userMessage: (userMessage || '').slice(0, 4000),
          assistantReply: assistantReply.slice(0, 4000),
          existingMemories: Array.isArray(existingMemories) ? existingMemories : [],
          currentMood: currentMood || 'hangat',
        });
        res.json(analysis);
      } catch {
        res.json({ mood: 'hangat', candidates: [] });
      }
    }
  );

  // --- Daily Companion Greeting ---
  app.post(
    '/api/daily-greeting',
    optionalFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { personality, memories } = (req.body || {}) as {
          personality?: PersonalityConfig;
          memories?: MemoryItem[];
        };
        if (!personality) {
          res.status(400).json({ error: 'Profil kepribadian tidak ditemukan.' });
          return;
        }
        const content = await generateDailyCheckIn({
          personality,
          memories: Array.isArray(memories) ? memories : [],
        });
        res.json({ content });
      } catch (err) {
        res.status(500).json({ error: formatGeminiError(err) });
      }
    }
  );

  // --- AI Voice (Transcribe + TTS) ---
  app.post(
    '/api/voice/transcribe',
    optionalFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { audioBase64, mimeType } = (req.body || {}) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (!audioBase64 || typeof audioBase64 !== 'string') {
          res.status(400).json({ error: 'Data audio tidak ditemukan.' });
          return;
        }
        const transcript = await transcribeAudioBase64(audioBase64, mimeType || 'audio/webm');
        res.json({ transcript });
      } catch (err) {
        res.status(500).json({ error: formatGeminiError(err) });
      }
    }
  );

  app.post(
    '/api/voice/tts',
    optionalFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { text, mood, voiceName, voiceStylePrompt } = (req.body || {}) as {
          text?: string;
          mood?: MoodType;
          voiceName?: 'Kore' | 'Zephyr';
          voiceStylePrompt?: string;
        };
        if (!text || !text.trim()) {
          res.status(400).json({ error: 'Teks kosong.' });
          return;
        }
        const audioBase64 = await synthesizeAmeliaSpeech({
          text,
          voiceName: voiceName === 'Zephyr' ? 'Zephyr' : 'Kore',
          stylePrompt: voiceStylePrompt || '',
          mood: mood || 'hangat',
        });
        res.json({ audioBase64, mimeType: 'audio/wav' });
      } catch (err) {
        res.status(500).json({ error: formatGeminiError(err) });
      }
    }
  );

  // --- Vite / Static Frontend Serving ---
  if (!IS_PROD) {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Amelia server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
