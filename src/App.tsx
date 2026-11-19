import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Brain, MessageCircleHeart, Settings, SlidersHorizontal } from 'lucide-react';
import { AmeliaAvatar } from './components/AmeliaAvatar';
import { ChatView, type SessionSummary } from './components/ChatView';
import { MemoriesView } from './components/MemoriesView';
import { PersonalityView } from './components/PersonalityView';
import { SettingsView } from './components/SettingsView';
import { auth } from './firebase';
import { createCompanionActions } from './lib/companionRepo';
import {
  ensureUserInitialized,
  subscribeMemories,
  subscribeMessages,
  subscribePersonality,
  subscribeSessions,
  subscribeSettings,
} from './lib/firestoreStore';
import { localStore } from './lib/localStore';
import type {
  AppSettings,
  ChatMessage,
  MemoryItem,
  PersonalityConfig,
} from './types/amelia';

type NavTab = 'chat' | 'memories' | 'personality' | 'settings';

export default function App() {
  const initialLocal = useMemo(() => localStore.getState(), []);
  const initialSessionId = initialLocal.sessions[0]?.id || '';

  const [user, setUser] = useState<User | null>(null);
  const [initializingCloud, setInitializingCloud] = useState(false);
  const [bootError, setBootError] = useState('');

  const [personality, setPersonality] = useState<PersonalityConfig>(initialLocal.personality);
  const [settings, setSettings] = useState<AppSettings>(initialLocal.settings);
  const [memories, setMemories] = useState<MemoryItem[]>(initialLocal.memories);
  const [sessions, setSessions] = useState<SessionSummary[]>(initialLocal.sessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialLocal.messagesBySession[initialSessionId] || []
  );
  const [activeTab, setActiveTab] = useState<NavTab>('chat');

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        const local = localStore.getState();
        const nextId = local.sessions.some((s) => s.id === activeSessionIdRef.current)
          ? activeSessionIdRef.current
          : local.sessions[0]?.id || '';
        setPersonality(local.personality);
        setSettings(local.settings);
        setMemories(local.memories);
        setSessions(local.sessions);
        setActiveSessionId(nextId);
        setMessages(local.messagesBySession[nextId] || []);
        setBootError('');
        setInitializingCloud(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let unsubs: Array<() => void> = [];

    const setup = async () => {
      setInitializingCloud(true);
      setBootError('');
      try {
        await ensureUserInitialized(user);
        if (!active) return;

        unsubs = [
          subscribePersonality(user.uid, setPersonality),
          subscribeSettings(user.uid, setSettings),
          subscribeMemories(user.uid, setMemories),
          subscribeSessions(user.uid, (nextSessions) => {
            setSessions(nextSessions);
            setActiveSessionId((prev) =>
              nextSessions.some((s) => s.id === prev) ? prev : nextSessions[0]?.id || ''
            );
          }),
        ];
      } catch (err) {
        if (active) {
          setBootError(err instanceof Error ? err.message : 'Gagal menghubungkan ke Firestore.');
        }
      } finally {
        if (active) setInitializingCloud(false);
      }
    };

    void setup();
    return () => {
      active = false;
      unsubs.forEach((fn) => fn());
    };
  }, [user]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    if (!user) {
      const local = localStore.getState();
      setMessages(local.messagesBySession[activeSessionId] || []);
      return;
    }
    const unsub = subscribeMessages(user.uid, activeSessionId, setMessages);
    return unsub;
  }, [user, activeSessionId]);

  const actions = useMemo(
    () =>
      createCompanionActions(user?.uid ?? null, {
        onPersonality: setPersonality,
        onSettings: setSettings,
        onMemories: setMemories,
        onSessions: (nextSessions) => {
          setSessions(nextSessions);
          setActiveSessionId((prev) =>
            nextSessions.some((s) => s.id === prev) ? prev : nextSessions[0]?.id || ''
          );
        },
        onMessages: (sessionId, msgs) => {
          if (sessionId === activeSessionIdRef.current) {
            setMessages(msgs);
          }
        },
      }),
    [user?.uid]
  );

  if (initializingCloud) {
    return (
      <div className="min-h-dvh bg-[#09090D] text-[#F4F1FA] flex flex-col items-center justify-center gap-4 p-6">
        <AmeliaAvatar size="lg" />
        <p className="text-sm text-[#A39CB8]">Menyinkronkan data dengan cloud...</p>
      </div>
    );
  }

  if (bootError && user) {
    return (
      <div className="min-h-dvh bg-[#09090D] text-[#F4F1FA] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AmeliaAvatar size="lg" />
        <h1 className="text-lg font-bold text-white">Gagal Terhubung ke Cloud Sync</h1>
        <p className="text-xs text-[#FDA4AF] max-w-md break-words">{bootError}</p>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 rounded-xl bg-[#6D28D9] text-white text-sm font-medium"
          >
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="min-h-[44px] px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-white text-sm font-medium"
          >
            Gunakan Mode Tanpa Login
          </button>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: typeof MessageCircleHeart }> = [
    { id: 'chat', label: 'Chat', icon: MessageCircleHeart },
    { id: 'memories', label: 'Memories', icon: Brain },
    { id: 'personality', label: 'Personality', icon: SlidersHorizontal },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="h-dvh w-full bg-[#09090D] text-[#F4F1FA] flex flex-col lg:flex-row overflow-hidden">
      <nav
        aria-label="Navigasi utama"
        className="hidden lg:flex lg:w-60 shrink-0 flex-col justify-between border-r border-white/[0.06] bg-[#0B0A10] p-4"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 pt-1">
            <AmeliaAvatar name={personality.companionName} size="md" />
            <div className="min-w-0">
              <p className="font-display text-base font-bold text-white truncate">
                {personality.companionName}
              </p>
              <p className="text-xs text-[#918AA8] truncate">
                Hai, {personality.userNickname || user?.displayName || 'kamu'}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#201933] text-white border border-[#A78BFA]/25'
                      : 'text-[#9E97B3] hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#F472B6]' : 'text-[#8B84A3]'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-2 pt-4 border-t border-white/[0.06]">
          <p className="text-[11px] text-[#7B7492] leading-relaxed">
            Memori aktif:{' '}
            <span className="text-[#C4B5FD] tabular-nums">
              {memories.filter((m) => m.active).length}
            </span>
          </p>
          <p className="text-[11px] text-[#66607C] mt-0.5 truncate">
            {user ? `Cloud Sync · ${user.displayName || user.email}` : 'Mode Lokal · Tanpa Login'}
          </p>
        </div>
      </nav>

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatView
            actions={actions}
            sessions={sessions}
            activeSessionId={activeSessionId}
            messages={messages}
            personality={personality}
            settings={settings}
            memories={memories}
            onSelectSession={setActiveSessionId}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'memories' && (
          <MemoriesView
            actions={actions}
            memories={memories}
            companionName={personality.companionName}
            isCloudSynced={Boolean(user)}
          />
        )}

        {activeTab === 'personality' && (
          <PersonalityView actions={actions} personality={personality} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            user={user}
            actions={actions}
            settings={settings}
            companionName={personality.companionName}
            userNickname={personality.userNickname}
            onDataCleared={() => setActiveTab('chat')}
          />
        )}
      </main>

      <nav
        aria-label="Navigasi bawah"
        className="lg:hidden shrink-0 border-t border-white/[0.07] bg-[#0D0B14]/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-[#F472B6]' : 'text-[#8D86A3] hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
