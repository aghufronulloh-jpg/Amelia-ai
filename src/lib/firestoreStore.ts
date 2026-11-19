import { type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  MemoryCandidate,
  MemoryCategory,
  MemoryItem,
  MoodType,
  PersonalityConfig,
  RoleplayModeId,
} from '../types/amelia';

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
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

export function defaultPersonality(userNickname: string): PersonalityConfig {
  const now = new Date().toISOString();
  return {
    companionName: 'Amelia',
    userNickname: userNickname.slice(0, 32) || 'Kamu',
    languageStyle: 'santai_akrab',
    warmth: 85,
    playfulness: 75,
    affection: 70,
    empathy: 90,
    voiceName: 'Kore',
    voiceStylePrompt: 'Warm, affectionate, natural young Indonesian female voice',
    customInstructions: '',
    updatedAt: now,
  };
}

export function defaultSettings(): AppSettings {
  return {
    autoPlayVoice: false,
    memoryConsentRequired: true,
    dailyGreetingEnabled: true,
    showMoodStatus: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function ensureUserInitialized(user: User): Promise<void> {
  const uid = user.uid;
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Kamu').slice(0, 48);
  const firstName = displayName.split(' ')[0] || 'Kamu';

  // 1. User profile doc
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (user.photoURL) {
        payload.photoURL = user.photoURL.slice(0, 500);
      }
      await setDoc(userRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  // 2. Private PII info doc
  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  try {
    const snap = await getDoc(privateRef);
    if (!snap.exists() && user.email) {
      await setDoc(privateRef, {
        uid,
        email: user.email.slice(0, 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  // 3. Personality config
  const personalityPath = `users/${uid}/config/personality`;
  const personalityRef = doc(db, 'users', uid, 'config', 'personality');
  try {
    const snap = await getDoc(personalityRef);
    if (!snap.exists()) {
      const def = defaultPersonality(firstName);
      await setDoc(personalityRef, {
        ownerId: uid,
        companionName: def.companionName,
        userNickname: def.userNickname,
        languageStyle: def.languageStyle,
        warmth: def.warmth,
        playfulness: def.playfulness,
        affection: def.affection,
        empathy: def.empathy,
        voiceName: def.voiceName,
        voiceStylePrompt: def.voiceStylePrompt,
        customInstructions: def.customInstructions,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, personalityPath);
  }

  // 4. Settings config
  const settingsPath = `users/${uid}/config/settings`;
  const settingsRef = doc(db, 'users', uid, 'config', 'settings');
  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) {
      const def = defaultSettings();
      await setDoc(settingsRef, {
        ownerId: uid,
        autoPlayVoice: def.autoPlayVoice,
        memoryConsentRequired: def.memoryConsentRequired,
        dailyGreetingEnabled: def.dailyGreetingEnabled,
        showMoodStatus: def.showMoodStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, settingsPath);
  }

  // 5. Ensure at least one initial session exists
  const sessionsPath = `users/${uid}/sessions`;
  try {
    const q = query(collection(db, 'users', uid, 'sessions'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) {
      await createFirestoreSession(uid, {
        title: 'Obrolan Utama',
        roleplayMode: 'natural',
        userNickname: firstName,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, sessionsPath);
  }
}

export function subscribePersonality(
  uid: string,
  cb: (p: PersonalityConfig) => void
): Unsubscribe {
  const path = `users/${uid}/config/personality`;
  return onSnapshot(
    doc(db, 'users', uid, 'config', 'personality'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      cb({
        companionName: d.companionName,
        userNickname: d.userNickname,
        languageStyle: d.languageStyle,
        warmth: Number(d.warmth ?? 85),
        playfulness: Number(d.playfulness ?? 75),
        affection: Number(d.affection ?? 70),
        empathy: Number(d.empathy ?? 90),
        voiceName: d.voiceName === 'Zephyr' ? 'Zephyr' : 'Kore',
        voiceStylePrompt: d.voiceStylePrompt || '',
        customInstructions: d.customInstructions || '',
        updatedAt: tsToIso(d.updatedAt),
      });
    },
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export async function savePersonality(
  uid: string,
  patch: PersonalityConfig
): Promise<void> {
  const path = `users/${uid}/config/personality`;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  try {
    await updateDoc(doc(db, 'users', uid, 'config', 'personality'), {
      companionName: (patch.companionName || 'Amelia').trim().slice(0, 32),
      userNickname: (patch.userNickname || 'Kamu').trim().slice(0, 32),
      languageStyle: patch.languageStyle,
      warmth: clamp(patch.warmth),
      playfulness: clamp(patch.playfulness),
      affection: clamp(patch.affection),
      empathy: clamp(patch.empathy),
      voiceName: patch.voiceName === 'Zephyr' ? 'Zephyr' : 'Kore',
      voiceStylePrompt: (patch.voiceStylePrompt || '').trim().slice(0, 140),
      customInstructions: (patch.customInstructions || '').trim().slice(0, 600),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeSettings(uid: string, cb: (s: AppSettings) => void): Unsubscribe {
  const path = `users/${uid}/config/settings`;
  return onSnapshot(
    doc(db, 'users', uid, 'config', 'settings'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      cb({
        autoPlayVoice: Boolean(d.autoPlayVoice),
        memoryConsentRequired: Boolean(d.memoryConsentRequired),
        dailyGreetingEnabled: Boolean(d.dailyGreetingEnabled),
        showMoodStatus: Boolean(d.showMoodStatus),
        updatedAt: tsToIso(d.updatedAt),
      });
    },
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export async function saveSettings(
  uid: string,
  next: Omit<AppSettings, 'updatedAt'>
): Promise<void> {
  const path = `users/${uid}/config/settings`;
  try {
    await updateDoc(doc(db, 'users', uid, 'config', 'settings'), {
      autoPlayVoice: Boolean(next.autoPlayVoice),
      memoryConsentRequired: Boolean(next.memoryConsentRequired),
      dailyGreetingEnabled: Boolean(next.dailyGreetingEnabled),
      showMoodStatus: Boolean(next.showMoodStatus),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeMemories(
  uid: string,
  cb: (items: MemoryItem[]) => void
): Unsubscribe {
  const path = `users/${uid}/memories`;
  const q = query(collection(db, 'users', uid, 'memories'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: MemoryItem[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          category: d.category as MemoryCategory,
          content: String(d.content || ''),
          isSensitive: Boolean(d.isSensitive),
          active: Boolean(d.active),
          sourceExcerpt: d.sourceExcerpt ? String(d.sourceExcerpt) : undefined,
          createdAt: tsToIso(d.createdAt),
          updatedAt: tsToIso(d.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      cb(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createFirestoreMemory(
  uid: string,
  input: {
    category: MemoryCategory;
    content: string;
    isSensitive: boolean;
    sourceExcerpt?: string;
  }
): Promise<MemoryItem> {
  const id = crypto.randomUUID();
  const path = `users/${uid}/memories/${id}`;
  const cleanContent = input.content.trim().slice(0, 400);
  const payload: Record<string, unknown> = {
    ownerId: uid,
    category: input.category,
    content: cleanContent,
    isSensitive: Boolean(input.isSensitive),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.sourceExcerpt && input.sourceExcerpt.trim()) {
    payload.sourceExcerpt = input.sourceExcerpt.trim().slice(0, 200);
  }
  try {
    await setDoc(doc(db, 'users', uid, 'memories', id), payload);
    const now = new Date().toISOString();
    return {
      id,
      category: input.category,
      content: cleanContent,
      isSensitive: Boolean(input.isSensitive),
      active: true,
      sourceExcerpt: input.sourceExcerpt?.slice(0, 200),
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreMemory(
  uid: string,
  memoryId: string,
  fullNext: {
    category: MemoryCategory;
    content: string;
    isSensitive: boolean;
    active: boolean;
  }
): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'memories', memoryId), {
      category: fullNext.category,
      content: fullNext.content.trim().slice(0, 400),
      isSensitive: Boolean(fullNext.isSensitive),
      active: Boolean(fullNext.active),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreMemory(uid: string, memoryId: string): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeSessions(
  uid: string,
  cb: (sessions: Omit<ChatSession, 'messages'>[]) => void
): Unsubscribe {
  const path = `users/${uid}/sessions`;
  const q = query(collection(db, 'users', uid, 'sessions'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          title: String(d.title || 'Obrolan'),
          roleplayMode: (d.roleplayMode || 'natural') as RoleplayModeId,
          customRoleplayNote: String(d.customRoleplayNote || ''),
          currentMood: (d.currentMood || 'hangat') as MoodType,
          lastMessagePreview: String(d.lastMessagePreview || ''),
          createdAt: tsToIso(d.createdAt),
          updatedAt: tsToIso(d.updatedAt),
        };
      });
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      cb(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createFirestoreSession(
  uid: string,
  opts: {
    title?: string;
    roleplayMode?: RoleplayModeId;
    customRoleplayNote?: string;
    userNickname?: string;
  }
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const path = `users/${uid}/sessions/${sessionId}`;
  const greeting = getTimeBasedGreeting(opts.userNickname || 'kamu');
  try {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId), {
      ownerId: uid,
      title: (opts.title || 'Obrolan Baru').trim().slice(0, 60),
      roleplayMode: opts.roleplayMode || 'natural',
      customRoleplayNote: (opts.customRoleplayNote || '').trim().slice(0, 500),
      currentMood: 'hangat',
      lastMessagePreview: greeting.slice(0, 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addFirestoreMessage(uid, sessionId, {
      role: 'assistant',
      content: greeting,
      mood: 'hangat',
    });

    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreSession(
  uid: string,
  sessionId: string,
  patch: Partial<{
    title: string;
    roleplayMode: RoleplayModeId;
    customRoleplayNote: string;
    currentMood: MoodType;
    lastMessagePreview: string;
  }>
): Promise<void> {
  const path = `users/${uid}/sessions/${sessionId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof patch.title === 'string') payload.title = patch.title.trim().slice(0, 60) || 'Obrolan';
  if (patch.roleplayMode) payload.roleplayMode = patch.roleplayMode;
  if (typeof patch.customRoleplayNote === 'string') {
    payload.customRoleplayNote = patch.customRoleplayNote.trim().slice(0, 500);
  }
  if (patch.currentMood) payload.currentMood = patch.currentMood;
  if (typeof patch.lastMessagePreview === 'string') {
    payload.lastMessagePreview = patch.lastMessagePreview.slice(0, 120);
  }
  try {
    await updateDoc(doc(db, 'users', uid, 'sessions', sessionId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreSession(
  uid: string,
  sessionId: string
): Promise<void> {
  const msgPath = `users/${uid}/sessions/${sessionId}/messages`;
  try {
    const msgsSnap = await getDocs(
      query(collection(db, 'users', uid, 'sessions', sessionId, 'messages'), where('ownerId', '==', uid))
    );
    await Promise.all(
      msgsSnap.docs.map((m) =>
        deleteDoc(doc(db, 'users', uid, 'sessions', sessionId, 'messages', m.id))
      )
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, msgPath);
  }

  const sessPath = `users/${uid}/sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, sessPath);
  }
}

export function subscribeMessages(
  uid: string,
  sessionId: string,
  cb: (msgs: ChatMessage[]) => void
): Unsubscribe {
  const path = `users/${uid}/sessions/${sessionId}/messages`;
  const q = query(
    collection(db, 'users', uid, 'sessions', sessionId, 'messages'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ChatMessage[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const attachment: ChatAttachment | undefined = d.attachmentDataUrl
          ? {
              name: String(d.attachmentName || 'lampiran.jpg'),
              mimeType: String(d.attachmentMimeType || 'image/jpeg'),
              dataUrl: String(d.attachmentDataUrl),
            }
          : undefined;
        return {
          id: docSnap.id,
          role: d.role === 'user' ? 'user' : 'assistant',
          content: String(d.content || ''),
          mood: d.mood as MoodType | undefined,
          attachment,
          memorySuggestions: Array.isArray(d.memorySuggestions)
            ? (d.memorySuggestions as MemoryCandidate[])
            : undefined,
          createdAt: tsToIso(d.createdAt),
        };
      });
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      cb(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function addFirestoreMessage(
  uid: string,
  sessionId: string,
  input: {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    mood?: MoodType;
    attachment?: ChatAttachment;
    memorySuggestions?: MemoryCandidate[];
  }
): Promise<string> {
  const messageId = input.id || crypto.randomUUID();
  const path = `users/${uid}/sessions/${sessionId}/messages/${messageId}`;
  const payload: Record<string, unknown> = {
    ownerId: uid,
    sessionId,
    role: input.role,
    content: input.content.slice(0, 12000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.mood) {
    payload.mood = input.mood;
  }
  if (input.attachment?.dataUrl && input.attachment.dataUrl.length <= 500000) {
    payload.attachmentName = (input.attachment.name || 'lampiran.jpg').slice(0, 120);
    payload.attachmentMimeType = (input.attachment.mimeType || 'image/jpeg').slice(0, 64);
    payload.attachmentDataUrl = input.attachment.dataUrl;
  }
  if (input.memorySuggestions && input.memorySuggestions.length > 0) {
    payload.memorySuggestions = input.memorySuggestions.slice(0, 2);
  }
  try {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId, 'messages', messageId), payload);
    return messageId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateMessageSuggestions(
  uid: string,
  sessionId: string,
  messageId: string,
  suggestions: MemoryCandidate[]
): Promise<void> {
  const path = `users/${uid}/sessions/${sessionId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'sessions', sessionId, 'messages', messageId), {
      memorySuggestions: suggestions.slice(0, 2),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreMessage(
  uid: string,
  sessionId: string,
  messageId: string
): Promise<void> {
  const path = `users/${uid}/sessions/${sessionId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId, 'messages', messageId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearAllFirestoreData(
  uid: string,
  deleteProfileToo: boolean,
  userNickname: string
): Promise<void> {
  // 1. Delete all memories
  try {
    const memSnap = await getDocs(
      query(collection(db, 'users', uid, 'memories'), where('ownerId', '==', uid))
    );
    await Promise.all(
      memSnap.docs.map((d) => deleteDoc(doc(db, 'users', uid, 'memories', d.id)))
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/memories`);
  }

  // 2. Delete all sessions & their messages
  try {
    const sessSnap = await getDocs(
      query(collection(db, 'users', uid, 'sessions'), where('ownerId', '==', uid))
    );
    for (const s of sessSnap.docs) {
      await deleteFirestoreSession(uid, s.id);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/sessions`);
  }

  if (deleteProfileToo) {
    const paths: Array<[string, ReturnType<typeof doc>]> = [
      [`users/${uid}/config/personality`, doc(db, 'users', uid, 'config', 'personality')],
      [`users/${uid}/config/settings`, doc(db, 'users', uid, 'config', 'settings')],
      [`users/${uid}/private/info`, doc(db, 'users', uid, 'private', 'info')],
      [`users/${uid}`, doc(db, 'users', uid)],
    ];
    for (const [p, ref] of paths) {
      try {
        await deleteDoc(ref);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, p);
      }
    }
  } else {
    await createFirestoreSession(uid, {
      title: 'Obrolan Utama',
      roleplayMode: 'natural',
      userNickname,
    });
  }
}
