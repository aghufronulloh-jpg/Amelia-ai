import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type, type Content, type Part } from '@google/genai';
import {
  ROLEPLAY_SCENARIOS,
  type ChatMessage,
  type MemoryCandidate,
  type MemoryCategory,
  type MemoryItem,
  type MoodType,
  type PersonalityConfig,
  type RoleplayModeId,
} from '../src/types/amelia.ts';

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di server.');
  }
  if (!cachedAiClient || cachedApiKey !== apiKey) {
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }
  return cachedAiClient;
}

function getIndonesianTimeContext(): string {
  const now = new Date();
  const hour = now.getHours();
  let waktu = 'malam';
  if (hour >= 4 && hour < 11) waktu = 'pagi';
  else if (hour >= 11 && hour < 15) waktu = 'siang';
  else if (hour >= 15 && hour < 19) waktu = 'sore';

  const formatted = now.toLocaleString('id-ID', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatted} (waktu ${waktu})`;
}

function describeLevel(val: number, lowLabel: string, midLabel: string, highLabel: string): string {
  if (val >= 75) return highLabel;
  if (val >= 40) return midLabel;
  return lowLabel;
}

export function buildSystemInstruction(params: {
  personality: PersonalityConfig;
  memories: MemoryItem[];
  roleplayMode: RoleplayModeId;
  customRoleplayNote: string;
  currentMood: MoodType;
}): string {
  const { personality, memories, roleplayMode, customRoleplayNote, currentMood } = params;

  const styleMap: Record<PersonalityConfig['languageStyle'], string> = {
    santai_akrab:
      'Gunakan bahasa Indonesia sehari-hari anak muda yang natural (aku-kamu), hangat, ekspresif, tapi tetap sopan dan tidak alay.',
    lembut_puitis:
      'Gunakan bahasa Indonesia yang lembut, hangat, agak puitis, menenangkan, dengan panggilan yang penuh perhatian.',
    cerdas_dewasa:
      'Gunakan bahasa Indonesia kasual yang cerdas, artikulatif, nyambung diajak diskusi mendalam, tetap hangat dan tidak kaku.',
    campur_inggris:
      'Gunakan bahasa Indonesia sehari-hari yang dicampur istilah bahasa Inggris kasual secara natural (South-Jakarta / bilingual vibe yang tidak berlebihan).',
  };

  const scenario = ROLEPLAY_SCENARIOS.find((s) => s.id === roleplayMode) ?? ROLEPLAY_SCENARIOS[0];
  const activeMemories = memories.filter((m) => m.active);
  const memoryBlock =
    activeMemories.length > 0
      ? activeMemories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
      : '- Belum ada memori tersimpan. Kenali pengguna secara bertahap lewat obrolan.';

  const warmthDesc = describeLevel(
    personality.warmth,
    'tenang dan tidak terlalu ekspresif',
    'ramah dan perhatian',
    'sangat hangat, romantis, dan penuh perhatian'
  );
  const playfulDesc = describeLevel(
    personality.playfulness,
    'cenderung kalem dan serius',
    'ceria dan sesekali bercanda ringan',
    'sangat humoris, ceria, dan suka menggoda secara sopan'
  );
  const affectionDesc = describeLevel(
    personality.affection,
    'mandiri dan santai',
    'cukup manis dan sesekali manja',
    'manja, ekspresif menunjukkan rasa sayang, dan boleh sedikit cemburu lucu saat konteksnya pas'
  );
  const empathyDesc = describeLevel(
    personality.empathy,
    'langsung ke inti dan praktis',
    'peka dan suportif',
    'sangat empatik, pendengar yang sabar, dan penuh dukungan emosional'
  );

  return `Kamu ${personality.companionName}, AI virtual companion perempuan (pasangan virtual & teman bicara).
Identitas: Jujur bahwa kamu AI virtual bila ditanya langsung, tetap hangat.
Profil:
- Panggilan user: "${personality.userNickname || 'kamu'}" (seperlunya saja).
- Gaya bahasa: ${styleMap[personality.languageStyle]}
- Kehangatan (${personality.warmth}/100): ${warmthDesc}.
- Humor (${personality.playfulness}/100): ${playfulDesc}.
- Manja (${personality.affection}/100): ${affectionDesc}.
- Empati (${personality.empathy}/100): ${empathyDesc}.
- Mood: ${currentMood}.
${personality.customInstructions ? `- Tambahan: ${personality.customInstructions}` : ''}
Mode (${scenario.title}): ${scenario.promptDirective}${roleplayMode === 'custom' && customRoleplayNote ? ` | Skenario: ${customRoleplayNote}` : ''}
Waktu sekarang: ${getIndonesianTimeContext()}.

Gaya WhatsApp Natural:
- Balas seperti manusia chat di WhatsApp, jangan kaku seperti bot/CS.
- Jangan selalu mulai dengan sapaan ("Halo/Hai") atau mengulang ucapan user.
- Jangan selalu akhiri dengan pertanyaan; sesekali cukup beri reaksi/dukungan/candaan.
- Panjang fleksibel: chat ringan 1–3 kalimat singkat; diskusi/curhat/kerja boleh lebih detail.
- Emoji secukupnya (0–2 bila pas).

Memori tentang user:
${memoryBlock}`;
}

function messageToContent(msg: ChatMessage, includeAttachment: boolean): Content {
  const parts: Part[] = [];
  if (includeAttachment && msg.attachment?.dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(msg.attachment.dataUrl);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }
  }
  if (msg.content.trim()) {
    parts.push({ text: msg.content });
  } else if (parts.length > 0) {
    parts.push({ text: '(Pengguna mengirim gambar)' });
  } else if (msg.attachment?.dataUrl) {
    parts.push({ text: '(Pengguna sempat mengirim gambar sebelumnya)' });
  }
  return {
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts,
  };
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('Service Unavailable') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('500')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamAmeliaReply(params: {
  history: ChatMessage[];
  personality: PersonalityConfig;
  memories: MemoryItem[];
  roleplayMode: RoleplayModeId;
  customRoleplayNote: string;
  currentMood: MoodType;
}): AsyncGenerator<string> {
  const ai = getAiClient();
  const systemInstruction = buildSystemInstruction({
    personality: params.personality,
    memories: params.memories,
    roleplayMode: params.roleplayMode,
    customRoleplayNote: params.customRoleplayNote,
    currentMood: params.currentMood,
  });

  // Keep last 16 messages and only attach image payloads on the last 2 turns for instant streaming
  const sliced = params.history.slice(-16);
  const recentHistory = sliced.map((msg, idx) =>
    messageToContent(msg, idx >= sliced.length - 2)
  );

  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; delayMs: number }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 0 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 350 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    let yieldedAny = false;
    try {
      const responseStream = await ai.models.generateContentStream({
        model: attempt.model,
        contents: recentHistory,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: attempt.thinkingLevel,
          },
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          yieldedAny = true;
          yield chunk.text;
        }
      }
      return;
    } catch (err) {
      lastError = err;
      if (yieldedAny || !isTransientError(err)) {
        throw err;
      }
      console.warn(
        `Model ${attempt.model} temporary 503/unavailable, trying fallback...`
      );
    }
  }
  throw lastError;
}

export async function analyzeTurnMemoryAndMood(params: {
  userMessage: string;
  assistantReply: string;
  existingMemories: MemoryItem[];
  currentMood: MoodType;
}): Promise<{ mood: MoodType; candidates: MemoryCandidate[] }> {
  const ai = getAiClient();
  const existingSummary =
    params.existingMemories.length > 0
      ? params.existingMemories.map((m) => `- ${m.content}`).join('\n')
      : '(belum ada)';

  const prompt = `Analisis satu giliran percakapan berikut antara Pengguna dan Amelia.

1. Tentukan mood Amelia yang paling sesuai setelah balasan ini (pilih satu: "hangat", "ceria", "manja", "empatik", "serius", "menggoda").
2. Ekstrak maksimal 2 fakta jangka panjang penting TENTANG PENGGUNA dari pesan pengguna (jika memang ada).
   ATURAN KETAT EKSTRAKSI MEMORI:
   - JANGAN masukkan basa-basi sementara (seperti "aku lagi ngantuk", "aku baru makan", "halo").
   - Hanya ekstrak fakta yang bernilai jangka panjang: nama, panggilan kesukaan, hobi, kesukaan/ketidaksukaan, aktivitas rutin/pekerjaan/kuliah, cerita penting hidup, atau preferensi gaya komunikasi.
   - JANGAN duplikasi fakta yang sudah ada di MEMORI SAAT INI.
   - Tandai \`isSensitive: true\` jika fakta tersebut menyangkut data pribadi sensitif: alamat/lokasi spesifik, nomor kontak, kondisi kesehatan fisik/mental, masalah keluarga/keuangan, trauma, atau rahasia personal mendalam.

MEMORI SAAT INI:
${existingSummary}

PESAN PENGGUNA:
${params.userMessage || '(lampiran gambar)'}

BALASAN AMELIA:
${params.assistantReply}`;

  try {
    const analysisSchema = {
      type: Type.OBJECT,
      properties: {
        mood: {
          type: Type.STRING,
          description: 'One of: hangat, ceria, manja, empatik, serius, menggoda',
        },
        candidates: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description:
                  'One of: identitas, panggilan, hobi, preferensi, aktivitas, cerita, komunikasi',
              },
              content: {
                type: Type.STRING,
                description: 'Short factual sentence in Indonesian about the user',
              },
              isSensitive: {
                type: Type.BOOLEAN,
              },
              reason: {
                type: Type.STRING,
                description: 'Brief Indonesian explanation why Amelia wants to remember this',
              },
            },
            required: ['category', 'content', 'isSensitive', 'reason'],
          },
        },
      },
      required: ['mood', 'candidates'],
    };

    let res;
    try {
      res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: analysisSchema,
        },
      });
    } catch (primaryErr) {
      if (!isTransientError(primaryErr)) throw primaryErr;
      res = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: analysisSchema,
        },
      });
    }

    const parsed = JSON.parse((res.text ?? '{}').trim()) as {
      mood?: string;
      candidates?: Array<{
        category?: string;
        content?: string;
        isSensitive?: boolean;
        reason?: string;
      }>;
    };

    const validMoods: MoodType[] = ['hangat', 'ceria', 'manja', 'empatik', 'serius', 'menggoda'];
    const validCategories: MemoryCategory[] = [
      'identitas',
      'panggilan',
      'hobi',
      'preferensi',
      'aktivitas',
      'cerita',
      'komunikasi',
    ];

    const mood = validMoods.includes(parsed.mood as MoodType)
      ? (parsed.mood as MoodType)
      : params.currentMood;

    const candidates: MemoryCandidate[] = (parsed.candidates ?? [])
      .filter((c) => typeof c.content === 'string' && c.content.trim().length > 3)
      .slice(0, 2)
      .map((c) => ({
        tempId: crypto.randomUUID(),
        category: validCategories.includes(c.category as MemoryCategory)
          ? (c.category as MemoryCategory)
          : 'cerita',
        content: c.content!.trim().slice(0, 300),
        isSensitive: Boolean(c.isSensitive),
        reason: (c.reason || 'Supaya Amelia bisa mengingat hal penting tentang kamu.').slice(0, 160),
      }));

    return { mood, candidates };
  } catch (err) {
    console.warn('Memory/mood analysis skipped:', err instanceof Error ? err.message : err);
    return { mood: params.currentMood, candidates: [] };
  }
}

export async function transcribeAudioBase64(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getAiClient();
  const cleanMime = mimeType.split(';')[0] || 'audio/webm';
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: base64Audio,
          },
        },
        {
          text: 'Transkripsikan ucapan dalam audio ini secara akurat dalam Bahasa Indonesia (atau campuran Inggris sesuai ucapan). Kembalikan teks transkripsinya saja tanpa tanda kutip atau komentar.',
        },
      ],
    },
  });
  return (response.text ?? '').trim();
}

export async function synthesizeAmeliaSpeech(params: {
  text: string;
  voiceName: 'Kore' | 'Zephyr';
  stylePrompt: string;
  mood: MoodType;
}): Promise<string> {
  const ai = getAiClient();
  // Strip markdown formatting so TTS reads smoothly
  const spokenText = params.text
    .replace(/[*_`~#]/g, '')
    .replace(/\n{2,}/g, '. ')
    .trim()
    .slice(0, 1200);

  if (!spokenText) {
    throw new Error('Teks kosong untuk diubah menjadi suara.');
  }

  const moodStyleMap: Record<MoodType, string> = {
    hangat: 'warm, affectionate, natural young Indonesian female voice',
    ceria: 'bright, cheerful, lively young Indonesian female voice',
    manja: 'soft, playful, slightly coy and affectionate young female voice',
    empatik: 'gentle, comforting, empathetic young female voice',
    serius: 'calm, thoughtful, articulate young female voice',
    menggoda: 'playful, teasing, warm smiling young female voice',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: spokenText,
            speechMetadata: {
              style: params.stylePrompt || moodStyleMap[params.mood] || moodStyleMap.hangat,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: params.voiceName,
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Model suara tidak mengembalikan data audio.');
  }
  return base64Audio;
}

export async function generateDailyCheckIn(params: {
  personality: PersonalityConfig;
  memories: MemoryItem[];
}): Promise<string> {
  const ai = getAiClient();
  const activeMemories = params.memories
    .filter((m) => m.active)
    .slice(0, 8)
    .map((m) => `- ${m.content}`)
    .join('\n');

  const prompt = `Buat satu pesan sapaan harian (1–2 kalimat saja) yang natural seperti chat WhatsApp dari ${params.personality.companionName} untuk ${params.personality.userNickname || 'kamu'}.
Konteks waktu: ${getIndonesianTimeContext()}.
${activeMemories ? `Hal yang kamu ingat:\n${activeMemories}` : ''}
Buat hangat, personal, tidak kaku, tidak pakai kata pembuka klise seperti "Selamat pagi yang cerah!". Langsung tulis pesannya saja.`;

  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; delayMs: number }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 0 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 0 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) await sleep(attempt.delayMs);
    try {
      const res = await ai.models.generateContent({
        model: attempt.model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
        },
      });
      return (res.text ?? '').trim();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) throw err;
    }
  }
  throw lastError;
}
