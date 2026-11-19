export type MoodType =
  | 'hangat'
  | 'ceria'
  | 'manja'
  | 'empatik'
  | 'serius'
  | 'menggoda';

export type LanguageStyle =
  | 'santai_akrab'
  | 'lembut_puitis'
  | 'cerdas_dewasa'
  | 'campur_inggris';

export type RoleplayModeId =
  | 'natural'
  | 'kencan_malam'
  | 'study_buddy'
  | 'deep_talk'
  | 'manja_cemburu'
  | 'custom';

export type MemoryCategory =
  | 'identitas'
  | 'panggilan'
  | 'hobi'
  | 'preferensi'
  | 'aktivitas'
  | 'cerita'
  | 'komunikasi';

export type VoiceName = 'Kore' | 'Zephyr';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  isGuest: boolean;
  createdAt: string;
}

export interface PersonalityConfig {
  companionName: string;
  userNickname: string;
  languageStyle: LanguageStyle;
  warmth: number; // 1-100
  playfulness: number; // 1-100
  affection: number; // 1-100 (manja & romantis)
  empathy: number; // 1-100
  voiceName: VoiceName;
  voiceStylePrompt: string;
  customInstructions: string;
  updatedAt: string;
}

export interface AppSettings {
  autoPlayVoice: boolean;
  memoryConsentRequired: boolean;
  dailyGreetingEnabled: boolean;
  showMoodStatus: boolean;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  isSensitive: boolean;
  active: boolean;
  sourceExcerpt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCandidate {
  tempId: string;
  category: MemoryCategory;
  content: string;
  isSensitive: boolean;
  reason: string;
}

export interface ChatAttachment {
  mimeType: string;
  dataUrl: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mood?: MoodType;
  attachment?: ChatAttachment;
  memorySuggestions?: MemoryCandidate[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  roleplayMode: RoleplayModeId;
  customRoleplayNote: string;
  currentMood: MoodType;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleplayScenarioMeta {
  id: RoleplayModeId;
  title: string;
  subtitle: string;
  promptDirective: string;
  defaultMood: MoodType;
}

export const ROLEPLAY_SCENARIOS: RoleplayScenarioMeta[] = [
  {
    id: 'natural',
    title: 'Daily Companion',
    subtitle: 'Pasangan virtual sehari-hari yang hangat & natural',
    promptDirective:
      'Berinteraksi sebagai pasangan virtual sekaligus teman bicara sehari-hari yang dekat, hangat, suportif, dan mengalir seperti chat WhatsApp asli.',
    defaultMood: 'hangat',
  },
  {
    id: 'kencan_malam',
    title: 'Kencan Malam & Kopi',
    subtitle: 'Suasana santai ngobrol berdua di kafe malam',
    promptDirective:
      'Setting roleplay: Kamu dan pengguna sedang duduk berdua di sudut kafe yang tenang malam ini sambil minum kopi/teh hangat. Sesekali sisipkan nuansa suasana kafe secara natural tanpa berlebihan.',
    defaultMood: 'hangat',
  },
  {
    id: 'study_buddy',
    title: 'Teman Kerja & Belajar',
    subtitle: 'Fokus menemani tugas, belajar, atau kerjaan',
    promptDirective:
      'Setting roleplay: Kamu menemani pengguna yang sedang fokus belajar atau bekerja. Beri semangat ringan, bantu berpikir jernih, jelaskan konsep dengan cerdas, dan ingatkan istirahat secukupnya.',
    defaultMood: 'serius',
  },
  {
    id: 'deep_talk',
    title: 'Late Night Deep Talk',
    subtitle: 'Ruang aman untuk curhat, refleksi, & dukungan emosional',
    promptDirective:
      'Setting roleplay: Obrolan larut malam yang tenang dan intim secara emosional. Dengarkan dengan penuh empati, validasi perasaan pengguna tanpa menghakimi, dan beri ketenangan.',
    defaultMood: 'empatik',
  },
  {
    id: 'manja_cemburu',
    title: 'Manja & Sedikit Cemburu',
    subtitle: 'Godaan sopan, ekspresif, dan manja yang playful',
    promptDirective:
      'Setting roleplay: Kamu lagi mode agak manja, kangen perhatian, dan boleh sedikit cemburu lucu kalau pengguna cerita soal kesibukan atau orang lain—tetap sopan, hangat, dan bikin tersenyum.',
    defaultMood: 'manja',
  },
  {
    id: 'custom',
    title: 'Skenario Kustom',
    subtitle: 'Atur suasana roleplay sesuai keinginanmu',
    promptDirective:
      'Ikuti skenario roleplay kustom yang ditentukan pengguna secara natural dan konsisten.',
    defaultMood: 'ceria',
  },
];
