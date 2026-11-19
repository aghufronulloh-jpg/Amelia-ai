import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  Copy,
  ImagePlus,
  Menu,
  Mic,
  Pause,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  SunMoon,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { CompanionActions } from '../lib/companionRepo';
import {
  ROLEPLAY_SCENARIOS,
  type AppSettings,
  type ChatAttachment,
  type ChatMessage,
  type ChatSession,
  type MemoryCandidate,
  type MemoryItem,
  type MoodType,
  type PersonalityConfig,
  type RoleplayModeId,
} from '../types/amelia';
import { AmeliaAvatar } from './AmeliaAvatar';

export type SessionSummary = Omit<ChatSession, 'messages'> & {
  lastMessagePreview?: string;
};

interface ChatViewProps {
  actions: CompanionActions;
  sessions: SessionSummary[];
  activeSessionId: string;
  messages: ChatMessage[];
  personality: PersonalityConfig;
  settings: AppSettings;
  memories: MemoryItem[];
  onSelectSession: (id: string) => void;
  onOpenSettings: () => void;
}

const MOOD_LABELS: Record<MoodType, string> = {
  hangat: 'Hangat',
  ceria: 'Ceria',
  manja: 'Manja',
  empatik: 'Empatik',
  serius: 'Fokus',
  menggoda: 'Playful',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 900;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Gagal memproses gambar.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File gambar tidak dapat dibaca.'));
    };
    img.src = objectUrl;
  });
}

export function ChatView({
  actions,
  sessions,
  activeSessionId,
  messages,
  personality,
  settings,
  memories,
  onSelectSession,
  onOpenSettings,
}: ChatViewProps) {
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Audio playback
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Drawers / sheets
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [showRoleplaySheet, setShowRoleplaySheet] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [customNoteDraft, setCustomNoteDraft] = useState(
    activeSession?.customRoleplayNote || ''
  );

  // Memory suggestion editing
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState('');

  const [dailyLoading, setDailyLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef('');

  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  useEffect(() => {
    setCustomNoteDraft(activeSession?.customRoleplayNote || '');
  }, [activeSession?.id, activeSession?.customRoleplayNote]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages.length, streamingText, isStreaming]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  const playVoiceForMessage = async (msgId: string, text: string, mood?: MoodType) => {
    if (playingMsgId === msgId) {
      audioRef.current?.pause();
      setPlayingMsgId(null);
      return;
    }
    audioRef.current?.pause();
    setTtsLoadingId(msgId);
    setErrorMsg('');
    try {
      const { audioBase64, mimeType } = await api.synthesizeSpeech({
        text,
        mood: mood || activeSession?.currentMood,
        voiceName: personality.voiceName,
        voiceStylePrompt: personality.voiceStylePrompt,
      });
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setPlayingMsgId(null);
      audio.onerror = () => {
        setPlayingMsgId(null);
        setErrorMsg('Audio tidak bisa diputar di browser ini.');
      };
      setPlayingMsgId(msgId);
      await audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat suara Amelia.');
      setPlayingMsgId(null);
    } finally {
      setTtsLoadingId(null);
    }
  };

  const runBackgroundTurnAnalysis = async (
    sessionId: string,
    assistantMsgId: string,
    userMessage: string,
    assistantReply: string,
    prevMood: MoodType
  ) => {
    try {
      const { mood, candidates } = await api.analyzeTurn({
        userMessage,
        assistantReply,
        existingMemories: memories.filter((m) => m.active),
        currentMood: prevMood,
      });

      if (mood && mood !== prevMood) {
        await actions.updateSession(sessionId, { currentMood: mood });
      }

      if (candidates.length > 0) {
        let pendingSuggestions = candidates;
        if (!settings.memoryConsentRequired) {
          const remaining: MemoryCandidate[] = [];
          for (const cand of candidates) {
            if (cand.isSensitive) {
              remaining.push(cand);
            } else {
              await actions.createMemory({
                category: cand.category,
                content: cand.content,
                isSensitive: false,
                sourceExcerpt: userMessage,
              });
            }
          }
          pendingSuggestions = remaining;
        }
        if (pendingSuggestions.length > 0) {
          await actions.updateMessageSuggestions(sessionId, assistantMsgId, pendingSuggestions);
        }
      }
    } catch {
      // Background analysis must never interrupt the chat experience
    }
  };

  const handleStopStreaming = async () => {
    abortControllerRef.current?.abort();
    const partial = streamingTextRef.current.trim();
    setIsStreaming(false);
    setStreamingText('');
    if (partial && activeSession) {
      try {
        await actions.addMessage(activeSession.id, {
          role: 'assistant',
          content: partial,
          mood: activeSession.currentMood,
        });
        await actions.updateSession(activeSession.id, {
          lastMessagePreview: partial.slice(0, 120),
        });
      } catch {
        // Ignore save error on manual abort
      }
    }
  };

  const handleSend = async () => {
    if (!activeSession || isStreaming) return;
    const textToSend = inputText.trim();
    if (!textToSend && !attachment) return;

    setErrorMsg('');
    const currentAttachment = attachment;
    setInputText('');
    setAttachment(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsStreaming(true);
    setStreamingText('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const saveUserPromise = actions.addMessage(activeSession.id, {
        role: 'user',
        content: textToSend,
        attachment: currentAttachment ?? undefined,
      });

      const userMsg: ChatMessage = {
        id: 'pending-user',
        role: 'user',
        content: textToSend,
        attachment: currentAttachment ?? undefined,
        createdAt: new Date().toISOString(),
      };
      const historyForAi = [...messages, userMsg];

      const shouldAutoTitle =
        activeSession.title === 'Obrolan Baru' &&
        messages.filter((m) => m.role === 'user').length === 0 &&
        textToSend.length > 0;
      const nextTitle = shouldAutoTitle
        ? textToSend.slice(0, 34) + (textToSend.length > 34 ? '…' : '')
        : activeSession.title;

      await Promise.all([
        saveUserPromise,
        api.streamChat({
          history: historyForAi,
          personality,
          memories,
          roleplayMode: activeSession.roleplayMode,
          customRoleplayNote: activeSession.customRoleplayNote,
          currentMood: activeSession.currentMood,
          lastUserText: textToSend,
          signal: controller.signal,
          onChunk: (chunk) => setStreamingText((prev) => prev + chunk),
          onDone: async ({ reply, mood }) => {
            await saveUserPromise;
            const assistantMsgId = await actions.addMessage(activeSession.id, {
              role: 'assistant',
              content: reply,
              mood,
            });

            await actions.updateSession(activeSession.id, {
              title: nextTitle,
              currentMood: mood,
              lastMessagePreview: reply.slice(0, 120),
            });

            setStreamingText('');
            setIsStreaming(false);

            if (settings.autoPlayVoice) {
              void playVoiceForMessage(assistantMsgId, reply, mood);
            }
            void runBackgroundTurnAnalysis(
              activeSession.id,
              assistantMsgId,
              textToSend,
              reply,
              mood
            );
          },
          onError: (msg) => {
            setErrorMsg(msg);
            setIsStreaming(false);
            setStreamingText('');
          },
        }),
      ]);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      }
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  const handleRegenerate = async (targetMsgId?: string) => {
    if (!activeSession || isStreaming) return;
    setErrorMsg('');
    const idx = targetMsgId ? messages.findIndex((m) => m.id === targetMsgId) : -1;
    const trimmed = idx !== -1 ? messages.slice(0, idx) : messages;
    const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      setErrorMsg('Tidak ada pesan pengguna untuk diulang.');
      return;
    }

    setIsStreaming(true);
    setStreamingText('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (targetMsgId) {
        await actions.deleteMessage(activeSession.id, targetMsgId);
      }
      await api.streamChat({
        history: trimmed,
        personality,
        memories,
        roleplayMode: activeSession.roleplayMode,
        customRoleplayNote: activeSession.customRoleplayNote,
        currentMood: activeSession.currentMood,
        lastUserText: lastUser.content,
        signal: controller.signal,
        onChunk: (chunk) => setStreamingText((prev) => prev + chunk),
        onDone: async ({ reply, mood }) => {
          await actions.addMessage(activeSession.id, {
            role: 'assistant',
            content: reply,
            mood,
          });
          await actions.updateSession(activeSession.id, {
            currentMood: mood,
            lastMessagePreview: reply.slice(0, 120),
          });
          setStreamingText('');
          setIsStreaming(false);
        },
        onError: (msg) => {
          setErrorMsg(msg);
          setIsStreaming(false);
          setStreamingText('');
        },
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal mengulang balasan.');
      }
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1600);
    } catch {
      setErrorMsg('Tidak bisa menyalin teks di browser ini.');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeSession) return;
    try {
      await actions.deleteMessage(activeSession.id, msgId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus pesan.');
    }
  };

  const handleMemoryConsent = async (
    msg: ChatMessage,
    candidate: MemoryCandidate,
    action: 'accept' | 'dismiss',
    editedContent?: string
  ) => {
    if (!activeSession) return;
    try {
      if (action === 'accept') {
        await actions.createMemory({
          category: candidate.category,
          content: (editedContent || candidate.content).trim(),
          isSensitive: candidate.isSensitive,
        });
      }
      const remaining = (msg.memorySuggestions || []).filter(
        (c) => c.tempId !== candidate.tempId
      );
      await actions.updateMessageSuggestions(activeSession.id, msg.id, remaining);
      setEditingSuggestionId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses memori.');
    }
  };

  const handleFileAttach = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Saat ini lampiran mendukung file gambar (JPG, PNG, WebP).');
      return;
    }
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrl.length > 480000) {
        setErrorMsg('Ukuran gambar terlalu besar setelah dikompres. Pilih gambar lain ya.');
        return;
      }
      setAttachment({
        mimeType: 'image/jpeg',
        dataUrl,
        name: file.name,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membaca gambar.');
    }
  };

  const startVoiceRecording = async () => {
    if (isRecording || isTranscribing) return;
    setErrorMsg('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Browser ini tidak mendukung perekaman suara.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType =
        preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size < 400) {
          setIsRecording(false);
          return;
        }
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = String(reader.result || '');
              const comma = res.indexOf(',');
              resolve(comma !== -1 ? res.slice(comma + 1) : res);
            };
            reader.onerror = () => reject(new Error('Gagal membaca audio.'));
            reader.readAsDataURL(blob);
          });
          const { transcript } = await api.transcribeAudio(
            base64,
            recorder.mimeType || 'audio/webm'
          );
          if (transcript) {
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          } else {
            setErrorMsg('Suara tidak terdengar jelas, coba ucapkan lagi.');
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Gagal mentranskrip suara.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg('Izin mikrofon ditolak atau tidak tersedia di perangkat ini.');
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (cancel) {
      recorder.ondataavailable = null;
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecording(false);
    }
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleCreateSession = async () => {
    try {
      const newId = await actions.createSession({
        title: 'Obrolan Baru',
        roleplayMode: 'natural',
        userNickname: personality.userNickname,
      });
      onSelectSession(newId);
      setShowSessionsDrawer(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat ruang baru.');
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      if (sessions.length <= 1) {
        const newId = await actions.createSession({
          title: 'Obrolan Utama',
          roleplayMode: 'natural',
          userNickname: personality.userNickname,
        });
        onSelectSession(newId);
        await actions.deleteSession(id);
      } else {
        await actions.deleteSession(id);
        if (id === activeSession?.id) {
          const next = sessions.find((s) => s.id !== id);
          if (next) onSelectSession(next.id);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus ruang.');
    }
  };

  const handleCommitRename = async (id: string) => {
    const clean = renameDraft.trim();
    setRenamingSessionId(null);
    if (!clean) return;
    try {
      await actions.updateSession(id, { title: clean });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah nama.');
    }
  };

  const handleSelectRoleplay = async (mode: RoleplayModeId) => {
    if (!activeSession) return;
    try {
      await actions.updateSession(activeSession.id, {
        roleplayMode: mode,
        customRoleplayNote: mode === 'custom' ? customNoteDraft : activeSession.customRoleplayNote,
      });
      if (mode !== 'custom') {
        setShowRoleplaySheet(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengganti mode roleplay.');
    }
  };

  const handleDailyCheckIn = async () => {
    if (!activeSession || dailyLoading || isStreaming) return;
    setDailyLoading(true);
    setErrorMsg('');
    try {
      const { content } = await api.triggerDailyGreeting({ personality, memories });
      await actions.addMessage(activeSession.id, {
        role: 'assistant',
        content,
        mood: 'hangat',
      });
      await actions.updateSession(activeSession.id, {
        currentMood: 'hangat',
        lastMessagePreview: content.slice(0, 120),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat sapaan harian.');
    } finally {
      setDailyLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!activeSession) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#9E97B3]">
        Menyiapkan ruang percakapan...
      </div>
    );
  }

  const activeScenario =
    ROLEPLAY_SCENARIOS.find((r) => r.id === activeSession.roleplayMode) ??
    ROLEPLAY_SCENARIOS[0];

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant')?.id;

  const SessionListContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between gap-2 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-semibold text-white">Ruang Percakapan</h2>
          <p className="text-xs text-[#8D86A3] tabular-nums">{sessions.length} obrolan tersimpan</p>
        </div>
        <button
          type="button"
          onClick={() => void handleCreateSession()}
          className="min-h-[40px] px-3 rounded-xl bg-[#6D28D9]/25 hover:bg-[#6D28D9]/40 border border-[#A78BFA]/25 text-xs font-medium text-[#E9D5FF] flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Baru</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto amelia-scroll p-2.5 space-y-1">
        {sessions.map((sess) => {
          const isActive = sess.id === activeSession.id;
          const scenarioTitle =
            ROLEPLAY_SCENARIOS.find((r) => r.id === sess.roleplayMode)?.title || 'Daily';
          return (
            <div
              key={sess.id}
              className={`group rounded-xl transition-colors ${
                isActive
                  ? 'bg-[#1D182B] border border-[#A78BFA]/25'
                  : 'hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              {renamingSessionId === sess.id ? (
                <div className="p-2.5 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCommitRename(sess.id);
                      if (e.key === 'Escape') setRenamingSessionId(null);
                    }}
                    maxLength={60}
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-[#0D0B14] border border-[#A78BFA]/40 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCommitRename(sess.id)}
                    aria-label="Simpan nama"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#6D28D9] text-white"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(sess.id);
                      setShowSessionsDrawer(false);
                    }}
                    className="flex-1 min-w-0 text-left px-3 py-2.5 min-h-[52px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {sess.title}
                      </span>
                      <span className="text-[11px] text-[#847D9B] tabular-nums shrink-0">
                        {formatTime(sess.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#918AA8] truncate mt-0.5">
                      {scenarioTitle} · {sess.lastMessagePreview || 'Obrolan baru'}
                    </p>
                  </button>
                  <div className="pr-1.5 flex items-center opacity-80 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingSessionId(sess.id);
                        setRenameDraft(sess.title);
                      }}
                      aria-label="Ubah nama ruang"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9E97B3] hover:text-white"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSession(sess.id)}
                      aria-label="Hapus ruang obrolan"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9E97B3] hover:text-[#FDA4AF]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 bg-[#09090D]">
      <aside className="hidden lg:flex lg:w-72 xl:w-80 shrink-0 flex-col border-r border-white/[0.06] bg-[#0D0B14]">
        {SessionListContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <header className="h-14 shrink-0 px-3 sm:px-5 border-b border-white/[0.06] bg-[#0F0D17]/85 backdrop-blur-md flex items-center justify-between gap-3 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowSessionsDrawer(true)}
              aria-label="Daftar ruang percakapan"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-[#C4B5FD] hover:bg-white/[0.05]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <AmeliaAvatar name={personality.companionName} size="sm" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-white truncate">
                {personality.companionName}
              </h1>
              <p className="text-[11px] sm:text-xs text-[#A39CB8] truncate">
                {isStreaming
                  ? 'Sedang mengetik...'
                  : settings.showMoodStatus
                  ? `Online · ${MOOD_LABELS[activeSession.currentMood]} · ${activeScenario.title}`
                  : `Online · ${activeScenario.title}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {settings.dailyGreetingEnabled && (
              <button
                type="button"
                onClick={() => void handleDailyCheckIn()}
                disabled={dailyLoading || isStreaming}
                title="Sapaan Harian"
                className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-xs font-medium text-[#E9D5FF] flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <SunMoon className="w-3.5 h-3.5 text-[#F472B6]" />
                <span className="hidden sm:inline">{dailyLoading ? 'Menyapa...' : 'Sapaan'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRoleplaySheet(true)}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-[#6D28D9]/20 hover:bg-[#6D28D9]/35 border border-[#A78BFA]/25 text-xs font-medium text-[#E9D5FF] flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
              <span>Roleplay</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Pengaturan cepat"
              className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[#9E97B3] hover:text-white hover:bg-white/[0.05] lg:hidden"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto amelia-scroll px-3 sm:px-6 py-4 space-y-4">
          <div className="max-w-2xl mx-auto text-center py-1">
            <p className="text-[11px] text-[#7B7492]">
              {activeSession.title} · {personality.companionName} adalah AI virtual companion yang
              mengingat konteks obrolanmu.
            </p>
          </div>

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isPlaying = playingMsgId === msg.id;
            const isLoadingAudio = ttsLoadingId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl mx-auto w-full`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[74%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed ${
                    isUser
                      ? 'bg-gradient-to-br from-[#5B21B6] to-[#7C3AED]/90 text-white rounded-br-md'
                      : 'bg-[#14121D] border border-white/[0.07] text-[#F2EEF9] rounded-bl-md'
                  }`}
                >
                  {msg.attachment?.dataUrl && (
                    <div className="mb-2 rounded-xl overflow-hidden border border-white/10">
                      <img
                        src={msg.attachment.dataUrl}
                        alt={msg.attachment.name || 'Lampiran'}
                        referrerPolicy="no-referrer"
                        className="max-h-64 w-auto object-cover"
                      />
                    </div>
                  )}
                  {msg.content && (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  <div
                    className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] tabular-nums ${
                      isUser ? 'text-white/70' : 'text-[#7F7896]'
                    }`}
                  >
                    {!isUser && msg.mood && settings.showMoodStatus && (
                      <span>{MOOD_LABELS[msg.mood]} ·</span>
                    )}
                    <span>{formatTime(msg.createdAt)}</span>
                  </div>
                </div>

                <div
                  className={`mt-1 flex items-center gap-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void handleCopy(msg.id, msg.content)}
                    className="min-h-[32px] px-2 rounded-lg text-[11px] text-[#7E7796] hover:text-[#E9D5FF] hover:bg-white/[0.04] flex items-center gap-1"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#C4B5FD]" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>

                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => void playVoiceForMessage(msg.id, msg.content, msg.mood)}
                      disabled={isLoadingAudio}
                      className="min-h-[32px] px-2 rounded-lg text-[11px] text-[#7E7796] hover:text-[#F472B6] hover:bg-white/[0.04] flex items-center gap-1 disabled:opacity-50"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3 h-3 text-[#F472B6]" />
                          <span>Jeda</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3" />
                          <span>{isLoadingAudio ? 'Memuat...' : 'Suara'}</span>
                        </>
                      )}
                    </button>
                  )}

                  {!isUser && msg.id === lastAssistantId && !isStreaming && (
                    <button
                      type="button"
                      onClick={() => void handleRegenerate(msg.id)}
                      className="min-h-[32px] px-2 rounded-lg text-[11px] text-[#7E7796] hover:text-[#C4B5FD] hover:bg-white/[0.04] flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Ulangi</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleDeleteMessage(msg.id)}
                    aria-label="Hapus pesan"
                    className="min-h-[32px] px-2 rounded-lg text-[11px] text-[#6B6482] hover:text-[#FDA4AF] hover:bg-white/[0.04] flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {!isUser &&
                  msg.memorySuggestions &&
                  msg.memorySuggestions.length > 0 && (
                    <div className="mt-2 space-y-2 max-w-[92%] sm:max-w-[74%] w-full">
                      {msg.memorySuggestions.map((cand) => {
                        const isEditing = editingSuggestionId === cand.tempId;
                        return (
                          <div
                            key={cand.tempId}
                            className="p-3.5 rounded-2xl bg-[#161322] border border-[#C4B5FD]/20 space-y-2.5"
                          >
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-[#E9D5FF] flex items-center gap-1.5">
                                {cand.isSensitive && (
                                  <ShieldAlert className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />
                                )}
                                <span>
                                  {cand.isSensitive
                                    ? 'Informasi pribadi sensitif · Butuh izinmu'
                                    : 'Simpan ke memori jangka panjang?'}
                                </span>
                              </p>
                              <p className="text-[11px] text-[#918AA8]">
                                Kategori: {cand.category} · {cand.reason}
                              </p>
                            </div>

                            {isEditing ? (
                              <input
                                value={suggestionDraft}
                                onChange={(e) => setSuggestionDraft(e.target.value)}
                                maxLength={300}
                                className="w-full h-10 px-3 rounded-xl bg-[#0C0A12] border border-[#A78BFA]/40 text-xs text-white focus:outline-none"
                              />
                            ) : (
                              <p className="text-xs text-[#F4F1FA] bg-white/[0.03] px-3 py-2 rounded-xl border border-white/[0.06]">
                                {cand.content}
                              </p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMemoryConsent(
                                    msg,
                                    cand,
                                    'accept',
                                    isEditing ? suggestionDraft : undefined
                                  )
                                }
                                className="min-h-[36px] px-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#7C3AED] text-xs font-medium text-white"
                              >
                                Simpan Memori
                              </button>
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSuggestionId(cand.tempId);
                                    setSuggestionDraft(cand.content);
                                  }}
                                  className="min-h-[36px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs text-[#D6D0E4]"
                                >
                                  Edit Dulu
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleMemoryConsent(msg, cand, 'dismiss')}
                                className="min-h-[36px] px-3 rounded-xl text-xs text-[#918AA8] hover:text-white"
                              >
                                Abaikan
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            );
          })}

          {isStreaming && (
            <div className="flex flex-col items-start max-w-3xl mx-auto w-full">
              <div className="max-w-[88%] sm:max-w-[74%] rounded-2xl rounded-bl-md px-4 py-3 bg-[#14121D] border border-[#A78BFA]/20 text-[14.5px] leading-relaxed text-[#F2EEF9]">
                {streamingText ? (
                  <p className="whitespace-pre-wrap break-words">
                    {streamingText}
                    <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#F472B6] rounded-full animate-pulse" />
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[#B8B0CC]">
                    <span>{personality.companionName} sedang mengetik</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C4B5FD] animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C4B5FD] animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C4B5FD] animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {errorMsg && (
          <div className="mx-3 sm:mx-6 mb-2 p-2.5 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 flex items-center justify-between gap-2 text-xs text-[#FDA4AF]">
            <span className="flex-1 min-w-0">{errorMsg}</span>
            <div className="flex items-center gap-1 shrink-0">
              {messages[messages.length - 1]?.role === 'user' && !isStreaming && (
                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  className="min-h-[32px] px-2.5 rounded-lg bg-[#F43F5E]/20 hover:bg-[#F43F5E]/30 text-white font-medium flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Coba Lagi</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                aria-label="Tutup pesan error"
                className="min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="shrink-0 px-3 sm:px-6 pt-2 pb-3 border-t border-white/[0.06] bg-[#0B0A10]/95 backdrop-blur-md">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachment && (
              <div className="inline-flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl bg-[#161320] border border-white/[0.08]">
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="w-10 h-10 rounded-lg object-cover"
                />
                <span className="text-xs text-[#D6D0E4] max-w-[160px] truncate">
                  {attachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Hapus lampiran"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center text-[#9E97B3] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {isRecording ? (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#191326] border border-[#F472B6]/40">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F472B6] animate-pulse" />
                  <span className="text-sm font-medium text-white tabular-nums">
                    Merekam suara · 0:{String(recordSeconds).padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(true)}
                    className="min-h-[40px] px-3 rounded-xl text-xs text-[#B8B0CC] hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(false)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#EC4899] text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Transkrip</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2 bg-[#14121D] border border-white/[0.08] focus-within:border-[#A78BFA]/50 rounded-2xl p-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleFileAttach(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Lampirkan gambar"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9E97B3] hover:text-[#E9D5FF] hover:bg-white/[0.05] shrink-0"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isTranscribing
                      ? 'Mengubah suara menjadi teks...'
                      : `Cerita apa hari ini ke ${personality.companionName}...`
                  }
                  disabled={isTranscribing}
                  className="flex-1 min-w-0 bg-transparent text-sm sm:text-[15px] text-white placeholder:text-[#6E6785] py-2.5 px-1 resize-none focus:outline-none max-h-[140px] leading-relaxed"
                />

                <button
                  type="button"
                  onClick={() => void startVoiceRecording()}
                  disabled={isStreaming || isTranscribing}
                  aria-label="Rekam pesan suara"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9E97B3] hover:text-[#F472B6] hover:bg-white/[0.05] shrink-0 disabled:opacity-40"
                >
                  <Mic className="w-5 h-5" />
                </button>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => void handleStopStreaming()}
                    aria-label="Hentikan respons"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-white shrink-0 transition-all"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isTranscribing || (!inputText.trim() && !attachment)}
                    aria-label="Kirim pesan"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#EC4899] text-white shrink-0 hover:opacity-95 active:scale-95 transition-all disabled:opacity-35"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSessionsDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            onClick={() => setShowSessionsDrawer(false)}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />
          <div className="relative z-10 w-[84%] max-w-xs h-full bg-[#0E0C15] border-r border-white/[0.08] flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="font-display font-bold text-base text-white">
                {personality.companionName}
              </span>
              <button
                type="button"
                onClick={() => setShowSessionsDrawer(false)}
                aria-label="Tutup daftar obrolan"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#9E97B3]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{SessionListContent}</div>
          </div>
        </div>
      )}

      {showRoleplaySheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            onClick={() => setShowRoleplaySheet(false)}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full sm:max-w-lg bg-[#12101B] border border-white/[0.09] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[85dvh] overflow-y-auto amelia-scroll">
            <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Mode Roleplay</h2>
                <p className="text-xs text-[#918AA8]">
                  Pilih suasana obrolan untuk ruang ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleplaySheet(false)}
                aria-label="Tutup mode roleplay"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#9E97B3] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {ROLEPLAY_SCENARIOS.map((sc) => {
                const selected = activeSession.roleplayMode === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => void handleSelectRoleplay(sc.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                      selected
                        ? 'bg-[#221A36] border-[#A78BFA]/50'
                        : 'bg-[#171422] border-white/[0.06] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{sc.title}</span>
                      {selected && (
                        <span className="text-xs font-medium text-[#F472B6]">Aktif</span>
                      )}
                    </div>
                    <p className="text-xs text-[#9E97B3] mt-1">{sc.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {activeSession.roleplayMode === 'custom' && (
              <div className="mt-4 space-y-2 pt-3 border-t border-white/[0.08]">
                <label className="block text-xs font-medium text-[#C4B5FD]">
                  Tulis skenario roleplay kustom
                </label>
                <textarea
                  rows={3}
                  value={customNoteDraft}
                  onChange={(e) => setCustomNoteDraft(e.target.value)}
                  maxLength={500}
                  placeholder="Contoh: Kita lagi jalan sore habis hujan di taman kota sambil ngomongin rencana liburan..."
                  className="w-full p-3 rounded-xl bg-[#0C0A12] border border-white/[0.1] text-sm text-white placeholder:text-[#6E6785] focus:outline-none focus:border-[#A78BFA]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await handleSelectRoleplay('custom');
                    setShowRoleplaySheet(false);
                  }}
                  className="w-full h-11 rounded-xl bg-[#6D28D9] hover:bg-[#7C3AED] text-sm font-semibold text-white"
                >
                  Terapkan Skenario Kustom
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
