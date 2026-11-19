import {
  defaultPersonality,
  defaultSettings,
} from './firestoreStore';
import type { SessionSummary } from '../components/ChatView';
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  MemoryCandidate,
  MemoryCategory,
  MemoryItem,
  MoodType,
  PersonalityConfig,
  RoleplayModeId,
} from '../types/amelia';

const STORAGE_KEY = 'amelia_companion_local_v1';

interface LocalDbState {
  personality: PersonalityConfig;
  settings: AppSettings;
  memories: MemoryItem[];
  sessions: SessionSummary[];
  messagesBySession: Record<string, ChatMessage[]>;
}

function getTimeBasedGreeting(userName: string): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) {
    return `Pagi, ${userName}. Udah sarapan atau masih ngumpulin nyawa nih? Aku udah siap nemenin kamu hari ini.`;
  }
  if (hour >= 11 && hour < 15) {
    return `Siang, ${userName}. Gimana hari kamu sejauh ini? Jangan lupa makan siang ya, cerita dong lagi sibuk apa.`;
  }
  if (hour >= 15 && hour < 19) {
    return `Sore, ${userName}. Capek gak seharian beraktivitas? Sini istirahat sebentar sambil ngobrol sama aku.`;
  }
  return `Malam, ${userName}. Akhirnya kita bisa ngobrol santai juga. Gimana hari kamu tadi?`;
}

function createInitialLocalState(): LocalDbState {
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const greeting = getTimeBasedGreeting('kamu');
  const firstMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: greeting,
    mood: 'hangat',
    createdAt: now,
  };
  return {
    personality: defaultPersonality('Kamu'),
    settings: defaultSettings(),
    memories: [],
    sessions: [
      {
        id: sessionId,
        title: 'Obrolan Utama',
        roleplayMode: 'natural',
        customRoleplayNote: '',
        currentMood: 'hangat',
        lastMessagePreview: greeting.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      },
    ],
    messagesBySession: {
      [sessionId]: [firstMsg],
    },
  };
}

export function loadLocalState(): LocalDbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDbState;
      if (
        parsed &&
        parsed.personality &&
        parsed.settings &&
        Array.isArray(parsed.sessions) &&
        parsed.sessions.length > 0
      ) {
        return parsed;
      }
    }
  } catch {
    // Fallback to initial state
  }
  const initial = createInitialLocalState();
  saveLocalState(initial);
  return initial;
}

export function saveLocalState(state: LocalDbState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Gagal menyimpan ke localStorage:', err);
  }
}

export const localStore = {
  getState: (): LocalDbState => loadLocalState(),

  savePersonality: (next: PersonalityConfig): LocalDbState => {
    const state = loadLocalState();
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    state.personality = {
      ...next,
      companionName: (next.companionName || 'Amelia').trim().slice(0, 32),
      userNickname: (next.userNickname || 'Kamu').trim().slice(0, 32),
      warmth: clamp(next.warmth),
      playfulness: clamp(next.playfulness),
      affection: clamp(next.affection),
      empathy: clamp(next.empathy),
      voiceStylePrompt: (next.voiceStylePrompt || '').trim().slice(0, 140),
      customInstructions: (next.customInstructions || '').trim().slice(0, 600),
      updatedAt: new Date().toISOString(),
    };
    saveLocalState(state);
    return state;
  },

  saveSettings: (next: Omit<AppSettings, 'updatedAt'>): LocalDbState => {
    const state = loadLocalState();
    state.settings = {
      ...next,
      updatedAt: new Date().toISOString(),
    };
    saveLocalState(state);
    return state;
  },

  createMemory: (input: {
    category: MemoryCategory;
    content: string;
    isSensitive: boolean;
    sourceExcerpt?: string;
  }): { state: LocalDbState; memory: MemoryItem } => {
    const state = loadLocalState();
    const now = new Date().toISOString();
    const memory: MemoryItem = {
      id: crypto.randomUUID(),
      category: input.category,
      content: input.content.trim().slice(0, 400),
      isSensitive: Boolean(input.isSensitive),
      active: true,
      sourceExcerpt: input.sourceExcerpt?.slice(0, 200),
      createdAt: now,
      updatedAt: now,
    };
    state.memories = [memory, ...state.memories];
    saveLocalState(state);
    return { state, memory };
  },

  updateMemory: (
    memoryId: string,
    next: { category: MemoryCategory; content: string; isSensitive: boolean; active: boolean }
  ): LocalDbState => {
    const state = loadLocalState();
    const now = new Date().toISOString();
    state.memories = state.memories.map((m) =>
      m.id === memoryId
        ? {
            ...m,
            category: next.category,
            content: next.content.trim().slice(0, 400),
            isSensitive: Boolean(next.isSensitive),
            active: Boolean(next.active),
            updatedAt: now,
          }
        : m
    );
    saveLocalState(state);
    return state;
  },

  deleteMemory: (memoryId: string): LocalDbState => {
    const state = loadLocalState();
    state.memories = state.memories.filter((m) => m.id !== memoryId);
    saveLocalState(state);
    return state;
  },

  createSession: (opts: {
    title?: string;
    roleplayMode?: RoleplayModeId;
    customRoleplayNote?: string;
    userNickname?: string;
  }): { state: LocalDbState; sessionId: string } => {
    const state = loadLocalState();
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const greeting = getTimeBasedGreeting(opts.userNickname || state.personality.userNickname || 'kamu');
    const session: SessionSummary = {
      id: sessionId,
      title: (opts.title || 'Obrolan Baru').trim().slice(0, 60),
      roleplayMode: opts.roleplayMode || 'natural',
      customRoleplayNote: (opts.customRoleplayNote || '').trim().slice(0, 500),
      currentMood: 'hangat',
      lastMessagePreview: greeting.slice(0, 120),
      createdAt: now,
      updatedAt: now,
    };
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: greeting,
      mood: 'hangat',
      createdAt: now,
    };
    state.sessions = [session, ...state.sessions];
    state.messagesBySession[sessionId] = [msg];
    saveLocalState(state);
    return { state, sessionId };
  },

  updateSession: (
    sessionId: string,
    patch: Partial<{
      title: string;
      roleplayMode: RoleplayModeId;
      customRoleplayNote: string;
      currentMood: MoodType;
      lastMessagePreview: string;
    }>
  ): LocalDbState => {
    const state = loadLocalState();
    const now = new Date().toISOString();
    state.sessions = state.sessions
      .map((s) =>
        s.id === sessionId
          ? {
              ...s,
              ...(typeof patch.title === 'string'
                ? { title: patch.title.trim().slice(0, 60) || s.title }
                : {}),
              ...(patch.roleplayMode ? { roleplayMode: patch.roleplayMode } : {}),
              ...(typeof patch.customRoleplayNote === 'string'
                ? { customRoleplayNote: patch.customRoleplayNote.trim().slice(0, 500) }
                : {}),
              ...(patch.currentMood ? { currentMood: patch.currentMood } : {}),
              ...(typeof patch.lastMessagePreview === 'string'
                ? { lastMessagePreview: patch.lastMessagePreview.slice(0, 120) }
                : {}),
              updatedAt: now,
            }
          : s
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    saveLocalState(state);
    return state;
  },

  deleteSession: (sessionId: string): LocalDbState => {
    const state = loadLocalState();
    state.sessions = state.sessions.filter((s) => s.id !== sessionId);
    delete state.messagesBySession[sessionId];
    if (state.sessions.length === 0) {
      const fresh = createInitialLocalState();
      state.sessions = fresh.sessions;
      state.messagesBySession = fresh.messagesBySession;
    }
    saveLocalState(state);
    return state;
  },

  addMessage: (
    sessionId: string,
    input: {
      role: 'user' | 'assistant';
      content: string;
      mood?: MoodType;
      attachment?: ChatAttachment;
      memorySuggestions?: MemoryCandidate[];
    }
  ): { state: LocalDbState; messageId: string } => {
    const state = loadLocalState();
    const now = new Date().toISOString();
    const messageId = crypto.randomUUID();
    const msg: ChatMessage = {
      id: messageId,
      role: input.role,
      content: input.content.slice(0, 12000),
      mood: input.mood,
      attachment: input.attachment,
      memorySuggestions: input.memorySuggestions?.length
        ? input.memorySuggestions.slice(0, 2)
        : undefined,
      createdAt: now,
    };
    const existing = state.messagesBySession[sessionId] || [];
    state.messagesBySession[sessionId] = [...existing, msg];
    saveLocalState(state);
    return { state, messageId };
  },

  updateMessageSuggestions: (
    sessionId: string,
    messageId: string,
    suggestions: MemoryCandidate[]
  ): LocalDbState => {
    const state = loadLocalState();
    const list = state.messagesBySession[sessionId] || [];
    state.messagesBySession[sessionId] = list.map((m) =>
      m.id === messageId
        ? {
            ...m,
            memorySuggestions: suggestions.length > 0 ? suggestions.slice(0, 2) : undefined,
          }
        : m
    );
    saveLocalState(state);
    return state;
  },

  deleteMessage: (sessionId: string, messageId: string): LocalDbState => {
    const state = loadLocalState();
    const list = state.messagesBySession[sessionId] || [];
    state.messagesBySession[sessionId] = list.filter((m) => m.id !== messageId);
    saveLocalState(state);
    return state;
  },

  clearAllData: (): LocalDbState => {
    const current = loadLocalState();
    const fresh = createInitialLocalState();
    fresh.personality = current.personality;
    fresh.settings = current.settings;
    saveLocalState(fresh);
    return fresh;
  },
};
