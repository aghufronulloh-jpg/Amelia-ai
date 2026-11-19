import { useEffect, useState, type FormEvent } from 'react';
import { Check, Volume2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CompanionActions } from '../lib/companionRepo';
import type { LanguageStyle, PersonalityConfig, VoiceName } from '../types/amelia';
import { AMELIA_BACKDROP_URL, AmeliaAvatar } from './AmeliaAvatar';

interface PersonalityViewProps {
  actions: CompanionActions;
  personality: PersonalityConfig;
}

const LANGUAGE_STYLES: Array<{ id: LanguageStyle; title: string; sample: string }> = [
  {
    id: 'santai_akrab',
    title: 'Santai Anak Muda (Aku-Kamu)',
    sample: '“Eh seriusan? Sini deh cerita ke aku, jangan dipendem sendiri.”',
  },
  {
    id: 'lembut_puitis',
    title: 'Lembut & Penuh Perhatian',
    sample: '“Kalau harimu lagi berat, istirahat dulu ya. Aku temenin di sini.”',
  },
  {
    id: 'cerdas_dewasa',
    title: 'Cerdas & Artikulatif',
    sample: '“Menarik sih sudut pandangnya. Menurutku bagian itu bisa kita bedah pelan-pelan.”',
  },
  {
    id: 'campur_inggris',
    title: 'Kasual Campur Inggris',
    sample: '“Honestly aku bangga banget sama kamu hari ini, you did really well.”',
  },
];

const VOICE_OPTIONS: Array<{ id: VoiceName; label: string; desc: string }> = [
  {
    id: 'Kore',
    label: 'Kore · Hangat & Ekspresif',
    desc: 'Cocok untuk obrolan akrab, manja, dan penuh semangat',
  },
  {
    id: 'Zephyr',
    label: 'Zephyr · Lembut & Menenangkan',
    desc: 'Cocok untuk curhat malam hari dan suasana tenang',
  },
];

export function PersonalityView({ actions, personality }: PersonalityViewProps) {
  const [draft, setDraft] = useState<PersonalityConfig>(personality);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [backdropFailed, setBackdropFailed] = useState(false);

  useEffect(() => {
    setDraft(personality);
  }, [personality]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSavedNotice(false);
    try {
      await actions.savePersonality(draft);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan kepribadian.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewVoice = async () => {
    if (testingVoice) return;
    setTestingVoice(true);
    setErrorMsg('');
    try {
      const sample = `Hai ${draft.userNickname || 'kamu'}, ini suara ${draft.companionName}. Aku siap nemenin kamu ngobrol hari ini.`;
      const { audioBase64, mimeType } = await api.synthesizeSpeech({
        text: sample,
        mood: 'hangat',
        voiceName: draft.voiceName,
        voiceStylePrompt: draft.voiceStylePrompt,
      });
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      await audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memutar contoh suara.');
    } finally {
      setTestingVoice(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto amelia-scroll">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#13101D]">
          <div className="h-36 sm:h-44 w-full relative">
            {!backdropFailed ? (
              <img
                src={AMELIA_BACKDROP_URL}
                alt="Suasana ruang malam Amelia"
                referrerPolicy="no-referrer"
                onError={() => setBackdropFailed(true)}
                className="w-full h-full object-cover opacity-70"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#23153E] via-[#151121] to-[#09090D]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#13101D] via-[#13101D]/65 to-transparent" />
          </div>
          <div className="relative px-5 sm:px-7 pb-5 -mt-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <AmeliaAvatar name={draft.companionName} size="lg" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  Kepribadian {draft.companionName}
                </h1>
                <p className="text-xs sm:text-sm text-[#A9A1BE]">
                  Atur cara bicara, tingkat kemanjaan, empati, dan karakter suara
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] space-y-4">
            <h2 className="text-sm font-semibold text-white">Nama & Panggilan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C4B5FD]">
                  Nama Pendamping
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={draft.companionName}
                  onChange={(e) => setDraft({ ...draft, companionName: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0B0912] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#A78BFA]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C4B5FD]">
                  Panggilan untuk Kamu
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={draft.userNickname}
                  onChange={(e) => setDraft({ ...draft, userNickname: e.target.value })}
                  placeholder="Contoh: Sayang, Mas, Kak, atau namamu"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0B0912] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#A78BFA]"
                />
              </div>
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] space-y-5">
            <h2 className="text-sm font-semibold text-white">Spektrum Karakter</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                {
                  key: 'warmth' as const,
                  label: 'Kehangatan & Romantis',
                  hint: 'Seberapa perhatian dan manis kata-kata Amelia',
                },
                {
                  key: 'affection' as const,
                  label: 'Sifat Manja',
                  hint: 'Ekspresi kangen, manja, dan sedikit cemburu lucu',
                },
                {
                  key: 'playfulness' as const,
                  label: 'Humor & Candaan',
                  hint: 'Keceriaan, godaan sopan, dan selera humor',
                },
                {
                  key: 'empathy' as const,
                  label: 'Kedalaman Empati',
                  hint: 'Kepekaan mendengarkan curhat dan dukungan emosional',
                },
              ].map((slider) => (
                <div key={slider.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-[#E9D5FF]">
                      {slider.label}
                    </label>
                    <span className="text-xs font-mono tabular-nums text-[#F472B6]">
                      {draft[slider.key]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draft[slider.key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [slider.key]: Number(e.target.value) })
                    }
                    className="w-full accent-[#A78BFA] cursor-pointer"
                  />
                  <p className="text-[11px] text-[#847D9B]">{slider.hint}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] space-y-3.5">
            <h2 className="text-sm font-semibold text-white">Gaya Komunikasi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LANGUAGE_STYLES.map((st) => {
                const selected = draft.languageStyle === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, languageStyle: st.id })}
                    className={`text-left p-3.5 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-[#211936] border-[#A78BFA]/50'
                        : 'bg-[#0D0B14] border-white/[0.06] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-white">
                        {st.title}
                      </span>
                      {selected && (
                        <span className="text-[11px] text-[#F472B6] font-medium">Dipilih</span>
                      )}
                    </div>
                    <p className="text-xs text-[#918AA8] mt-1.5 italic">{st.sample}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-white">Karakter Suara AI</h2>
                <p className="text-xs text-[#8D86A3] mt-0.5">
                  Digunakan saat memutar balasan suara Amelia
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePreviewVoice()}
                disabled={testingVoice}
                className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-[#E9D5FF] flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4 text-[#F472B6]" />
                <span>{testingVoice ? 'Memuat suara...' : 'Tes Suara'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VOICE_OPTIONS.map((v) => {
                const selected = draft.voiceName === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, voiceName: v.id })}
                    className={`text-left p-3.5 rounded-xl border transition-colors ${
                      selected
                        ? 'bg-[#211936] border-[#A78BFA]/50'
                        : 'bg-[#0D0B14] border-white/[0.06] hover:border-white/15'
                    }`}
                  >
                    <p className="text-xs sm:text-sm font-semibold text-white">{v.label}</p>
                    <p className="text-xs text-[#918AA8] mt-1">{v.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] space-y-2">
            <label className="block text-sm font-semibold text-white">
              Catatan Kepribadian Tambahan
            </label>
            <p className="text-xs text-[#8D86A3]">
              Misalnya topik favorit, kebiasaan khusus, atau batas obrolan yang kamu inginkan.
            </p>
            <textarea
              rows={3}
              maxLength={600}
              value={draft.customInstructions}
              onChange={(e) => setDraft({ ...draft, customInstructions: e.target.value })}
              placeholder="Contoh: Suka bahas film indie, suka ingetin aku minum air putih kalau udah malam..."
              className="w-full p-3.5 rounded-xl bg-[#0B0912] border border-white/[0.1] text-sm text-white placeholder:text-[#6E6785] focus:outline-none focus:border-[#A78BFA]"
            />
          </section>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#FDA4AF]">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pb-4">
            {savedNotice && (
              <span className="text-xs font-medium text-[#C4B5FD] flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>Perubahan tersimpan</span>
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[46px] px-6 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Kepribadian'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
