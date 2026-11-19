import { auth } from '../firebase';
import type {
  ChatMessage,
  MemoryCandidate,
  MemoryItem,
  MoodType,
  PersonalityConfig,
  RoleplayModeId,
} from '../types/amelia';

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    } catch {
      // Proceed without Bearer header if token refresh fails
    }
  }
  return headers;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const headers = await getHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export const api = {
  triggerDailyGreeting: (payload: {
    personality: PersonalityConfig;
    memories: MemoryItem[];
  }) => postJson<{ content: string }>('/api/daily-greeting', payload),

  transcribeAudio: (audioBase64: string, mimeType: string) =>
    postJson<{ transcript: string }>('/api/voice/transcribe', { audioBase64, mimeType }),

  synthesizeSpeech: (payload: {
    text: string;
    mood?: MoodType;
    voiceName: 'Kore' | 'Zephyr';
    voiceStylePrompt: string;
  }) => postJson<{ audioBase64: string; mimeType: string }>('/api/voice/tts', payload),

  analyzeTurn: (payload: {
    userMessage: string;
    assistantReply: string;
    existingMemories: MemoryItem[];
    currentMood: MoodType;
  }) =>
    postJson<{ mood: MoodType; candidates: MemoryCandidate[] }>(
      '/api/chat/analyze-turn',
      payload
    ),

  async streamChat(params: {
    history: ChatMessage[];
    personality: PersonalityConfig;
    memories: MemoryItem[];
    roleplayMode: RoleplayModeId;
    customRoleplayNote: string;
    currentMood: MoodType;
    lastUserText: string;
    signal?: AbortSignal;
    onChunk: (text: string) => void;
    onDone: (payload: {
      reply: string;
      mood: MoodType;
    }) => void;
    onError: (message: string) => void;
  }): Promise<void> {
    const headers = await getHeaders();
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers,
      signal: params.signal,
      body: JSON.stringify({
        history: params.history.slice(-16),
        personality: params.personality,
        memories: params.memories.filter((m) => m.active),
        roleplayMode: params.roleplayMode,
        customRoleplayNote: params.customRoleplayNote,
        currentMood: params.currentMood,
        lastUserText: params.lastUserText,
      }),
    });

    if (!res.ok || !res.body) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData as { error?: string }).error || 'Gagal terhubung ke Amelia.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (block: string) => {
      const lines = block.split('\n');
      let eventName = 'message';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr += line.slice(5).trim();
        }
      }
      if (!dataStr) return;
      const parsed = JSON.parse(dataStr);
      if (eventName === 'chunk') {
        params.onChunk(parsed.text || '');
      } else if (eventName === 'done') {
        params.onDone(parsed);
      } else if (eventName === 'error') {
        params.onError(parsed.error || 'Terjadi kesalahan saat merespons.');
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const block = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (block) {
          processEventBlock(block);
        }
        idx = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) {
      processEventBlock(buffer.trim());
    }
  },
};
