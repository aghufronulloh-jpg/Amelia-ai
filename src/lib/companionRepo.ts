import {
  addFirestoreMessage,
  clearAllFirestoreData,
  createFirestoreMemory,
  createFirestoreSession,
  deleteFirestoreMemory,
  deleteFirestoreMessage,
  deleteFirestoreSession,
  savePersonality,
  saveSettings,
  updateFirestoreMemory,
  updateFirestoreSession,
  updateMessageSuggestions,
} from './firestoreStore';
import { localStore } from './localStore';
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
import type { SessionSummary } from '../components/ChatView';

export interface LocalSyncCallbacks {
  onPersonality: (p: PersonalityConfig) => void;
  onSettings: (s: AppSettings) => void;
  onMemories: (m: MemoryItem[]) => void;
  onSessions: (s: SessionSummary[]) => void;
  onMessages: (sessionId: string, msgs: ChatMessage[]) => void;
}

export interface CompanionActions {
  createSession: (opts: {
    title?: string;
    roleplayMode?: RoleplayModeId;
    customRoleplayNote?: string;
    userNickname?: string;
  }) => Promise<string>;
  updateSession: (
    sessionId: string,
    patch: Partial<{
      title: string;
      roleplayMode: RoleplayModeId;
      customRoleplayNote: string;
      currentMood: MoodType;
      lastMessagePreview: string;
    }>
  ) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  addMessage: (
    sessionId: string,
    input: {
      role: 'user' | 'assistant';
      content: string;
      mood?: MoodType;
      attachment?: ChatAttachment;
      memorySuggestions?: MemoryCandidate[];
    }
  ) => Promise<string>;
  updateMessageSuggestions: (
    sessionId: string,
    messageId: string,
    suggestions: MemoryCandidate[]
  ) => Promise<void>;
  deleteMessage: (sessionId: string, messageId: string) => Promise<void>;
  createMemory: (input: {
    category: MemoryCategory;
    content: string;
    isSensitive: boolean;
    sourceExcerpt?: string;
  }) => Promise<MemoryItem>;
  updateMemory: (
    memoryId: string,
    next: { category: MemoryCategory; content: string; isSensitive: boolean; active: boolean }
  ) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  savePersonality: (next: PersonalityConfig) => Promise<void>;
  saveSettings: (next: Omit<AppSettings, 'updatedAt'>) => Promise<void>;
  clearAllData: (deleteProfileToo: boolean, userNickname: string) => Promise<void>;
}

export function createCompanionActions(
  uid: string | null,
  localSync: LocalSyncCallbacks
): CompanionActions {
  if (uid) {
    return {
      createSession: (opts) => createFirestoreSession(uid, opts),
      updateSession: (sessionId, patch) => updateFirestoreSession(uid, sessionId, patch),
      deleteSession: (sessionId) => deleteFirestoreSession(uid, sessionId),
      addMessage: (sessionId, input) => addFirestoreMessage(uid, sessionId, input),
      updateMessageSuggestions: (sessionId, messageId, suggestions) =>
        updateMessageSuggestions(uid, sessionId, messageId, suggestions),
      deleteMessage: (sessionId, messageId) => deleteFirestoreMessage(uid, sessionId, messageId),
      createMemory: (input) => createFirestoreMemory(uid, input),
      updateMemory: (memoryId, next) => updateFirestoreMemory(uid, memoryId, next),
      deleteMemory: (memoryId) => deleteFirestoreMemory(uid, memoryId),
      savePersonality: (next) => savePersonality(uid, next),
      saveSettings: (next) => saveSettings(uid, next),
      clearAllData: (deleteProfileToo, userNickname) =>
        clearAllFirestoreData(uid, deleteProfileToo, userNickname),
    };
  }

  return {
    createSession: async (opts) => {
      const { state, sessionId } = localStore.createSession(opts);
      localSync.onSessions(state.sessions);
      localSync.onMessages(sessionId, state.messagesBySession[sessionId] || []);
      return sessionId;
    },
    updateSession: async (sessionId, patch) => {
      const state = localStore.updateSession(sessionId, patch);
      localSync.onSessions(state.sessions);
    },
    deleteSession: async (sessionId) => {
      const state = localStore.deleteSession(sessionId);
      localSync.onSessions(state.sessions);
      const firstId = state.sessions[0]?.id;
      if (firstId) {
        localSync.onMessages(firstId, state.messagesBySession[firstId] || []);
      }
    },
    addMessage: async (sessionId, input) => {
      const { state, messageId } = localStore.addMessage(sessionId, input);
      localSync.onMessages(sessionId, state.messagesBySession[sessionId] || []);
      return messageId;
    },
    updateMessageSuggestions: async (sessionId, messageId, suggestions) => {
      const state = localStore.updateMessageSuggestions(sessionId, messageId, suggestions);
      localSync.onMessages(sessionId, state.messagesBySession[sessionId] || []);
    },
    deleteMessage: async (sessionId, messageId) => {
      const state = localStore.deleteMessage(sessionId, messageId);
      localSync.onMessages(sessionId, state.messagesBySession[sessionId] || []);
    },
    createMemory: async (input) => {
      const { state, memory } = localStore.createMemory(input);
      localSync.onMemories(state.memories);
      return memory;
    },
    updateMemory: async (memoryId, next) => {
      const state = localStore.updateMemory(memoryId, next);
      localSync.onMemories(state.memories);
    },
    deleteMemory: async (memoryId) => {
      const state = localStore.deleteMemory(memoryId);
      localSync.onMemories(state.memories);
    },
    savePersonality: async (next) => {
      const state = localStore.savePersonality(next);
      localSync.onPersonality(state.personality);
    },
    saveSettings: async (next) => {
      const state = localStore.saveSettings(next);
      localSync.onSettings(state.settings);
    },
    clearAllData: async () => {
      const state = localStore.clearAllData();
      localSync.onSessions(state.sessions);
      localSync.onMemories(state.memories);
      const firstId = state.sessions[0]?.id;
      if (firstId) {
        localSync.onMessages(firstId, state.messagesBySession[firstId] || []);
      }
    },
  };
}
