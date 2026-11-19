import { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { AlertTriangle, Cloud, LogOut, Shield, Trash2, UserCheck } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import type { CompanionActions } from '../lib/companionRepo';
import type { AppSettings } from '../types/amelia';

interface SettingsViewProps {
  user: User | null;
  actions: CompanionActions;
  settings: AppSettings;
  companionName: string;
  userNickname: string;
  onDataCleared: () => void;
}

export function SettingsView({
  user,
  actions,
  settings,
  companionName,
  userNickname,
  onDataCleared,
}: SettingsViewProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'none' | 'clear_data' | 'delete_account'>('none');
  const [processing, setProcessing] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleSetting = async (key: keyof Omit<AppSettings, 'updatedAt'>) => {
    setSavingKey(key);
    setErrorMsg('');
    try {
      await actions.saveSettings({
        autoPlayVoice: key === 'autoPlayVoice' ? !settings.autoPlayVoice : settings.autoPlayVoice,
        memoryConsentRequired:
          key === 'memoryConsentRequired'
            ? !settings.memoryConsentRequired
            : settings.memoryConsentRequired,
        dailyGreetingEnabled:
          key === 'dailyGreetingEnabled'
            ? !settings.dailyGreetingEnabled
            : settings.dailyGreetingEnabled,
        showMoodStatus:
          key === 'showMoodStatus' ? !settings.showMoodStatus : settings.showMoodStatus,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui pengaturan.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleConfirmAction = async () => {
    if (confirmMode === 'none') return;
    setProcessing(true);
    setErrorMsg('');
    try {
      const deleteProfileToo = confirmMode === 'delete_account';
      await actions.clearAllData(deleteProfileToo, userNickname);
      setConfirmMode('none');
      if (deleteProfileToo && user) {
        await signOut(auth);
      } else {
        onDataCleared();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus data.');
    } finally {
      setProcessing(false);
    }
  };

  const handleGoogleConnect = async () => {
    setAuthLoading(true);
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (msg.includes('unauthorized-domain')) {
        const host = window.location.hostname;
        setErrorMsg(
          `Domain "${host}" belum terdaftar di Authorized domains Firebase Authentication. Tambahkan di Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else if (!msg.includes('popup-closed-by-user')) {
        setErrorMsg(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal keluar.');
    }
  };

  return (
    <div className="h-full overflow-y-auto amelia-scroll">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Pengaturan</h1>
          <p className="text-sm text-[#9E97B3] mt-1">
            Kontrol suara, persetujuan memori, penyimpanan data, dan sinkronisasi opsional
          </p>
        </div>

        {/* Storage / Optional Cloud Sync Card */}
        <section className="p-5 rounded-2xl bg-[#13111C] border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#221A36] border border-[#A78BFA]/30 flex items-center justify-center text-[#E9D5FF] shrink-0 overflow-hidden">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Pengguna'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : user ? (
                <UserCheck className="w-5 h-5" />
              ) : (
                <Cloud className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {user ? user.displayName || 'Pengguna Google' : 'Mode Langsung (Tanpa Login)'}
              </p>
              <p className="text-xs text-[#918AA8]">
                {user
                  ? `Tersinkronisasi ke Firestore · ${user.email}`
                  : 'Riwayat chat & memori tersimpan otomatis di perangkat ini'}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="min-h-[42px] px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-[#E9E4F5] flex items-center justify-center gap-2 shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar ke Mode Lokal</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void handleGoogleConnect()}
              className="min-h-[42px] px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-[#E9E4F5] flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              <Cloud className="w-4 h-4 text-[#C4B5FD]" />
              <span>{authLoading ? 'Menghubungkan...' : 'Opsional: Sinkron Google'}</span>
            </button>
          )}
        </section>

        <section className="rounded-2xl bg-[#13111C] border border-white/[0.07] divide-y divide-white/[0.06]">
          {[
            {
              key: 'memoryConsentRequired' as const,
              title: 'Minta Izin Sebelum Simpan Memori',
              desc: `Tampilkan konfirmasi sebelum ${companionName} menyimpan hal baru tentangmu. Informasi pribadi sensitif selalu meminta persetujuan.`,
            },
            {
              key: 'autoPlayVoice' as const,
              title: 'Putar Suara Balasan Otomatis',
              desc: `Putar suara ${companionName} secara otomatis setelah setiap balasan selesai dikirim.`,
            },
            {
              key: 'showMoodStatus' as const,
              title: 'Tampilkan Status Mood',
              desc: `Perlihatkan suasana hati ${companionName} (Hangat, Ceria, Manja, Empatik) di header dan pesan.`,
            },
            {
              key: 'dailyGreetingEnabled' as const,
              title: 'Tombol Sapaan Pendamping Harian',
              desc: 'Aktifkan tombol cepat untuk memicu sapaan pagi/siang/malam yang personal.',
            },
          ].map((item) => {
            const enabled = settings[item.key];
            return (
              <div
                key={item.key}
                className="p-4 sm:p-5 flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-[#918AA8] leading-relaxed">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={savingKey === item.key}
                  onClick={() => void toggleSetting(item.key)}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                    enabled ? 'bg-[#7C3AED]' : 'bg-[#262233]'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </section>

        <section className="p-5 rounded-2xl bg-[#110F19] border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#C4B5FD]">
            <Shield className="w-4 h-4" />
            <span>Transparansi & Privasi</span>
          </div>
          <p className="text-xs text-[#9E97B3] leading-relaxed">
            {companionName} adalah AI virtual companion yang ditenagai Gemini API melalui koneksi
            server terproteksi. Dalam mode langsung tanpa login, seluruh percakapan dan memori
            tersimpan lokal di browser perangkatmu.
          </p>
        </section>

        <section className="p-5 rounded-2xl bg-[#170F16] border border-[#F43F5E]/20 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#FDA4AF]">Kelola & Hapus Data</h2>
            <p className="text-xs text-[#B598A8] mt-1">
              Kamu memegang kendali penuh atas seluruh riwayat percakapan dan memori tersimpan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setConfirmMode('clear_data')}
              className="min-h-[44px] px-4 rounded-xl bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 border border-[#F43F5E]/30 text-xs font-semibold text-[#FDA4AF] flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Semua Riwayat & Memori</span>
            </button>
            {user && (
              <button
                type="button"
                onClick={() => setConfirmMode('delete_account')}
                className="min-h-[44px] px-4 rounded-xl bg-transparent hover:bg-[#F43F5E]/15 border border-[#F43F5E]/25 text-xs font-medium text-[#FCA5A5] flex items-center justify-center gap-2"
              >
                <span>Hapus Data Cloud & Keluar</span>
              </button>
            )}
          </div>
        </section>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#FDA4AF]">
            {errorMsg}
          </div>
        )}
      </div>

      {confirmMode !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !processing && setConfirmMode('none')}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#15121F] border border-white/[0.1] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F43F5E]/15 text-[#FDA4AF] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmMode === 'delete_account'
                    ? 'Hapus Data Cloud & Keluar?'
                    : 'Hapus Semua Riwayat & Memori?'}
                </h3>
                <p className="text-xs text-[#A39CB8] mt-1 leading-relaxed">
                  {confirmMode === 'delete_account'
                    ? 'Seluruh profil, ruang obrolan, pengaturan, dan memori di Firestore akan dihapus permanen.'
                    : 'Seluruh ruang obrolan dan daftar memori jangka panjang akan dikosongkan. Pengaturan kepribadian tetap tersimpan.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => setConfirmMode('none')}
                className="min-h-[42px] px-4 rounded-xl text-xs font-medium text-[#C8C2D8] hover:bg-white/[0.05]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => void handleConfirmAction()}
                className="min-h-[42px] px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white disabled:opacity-50"
              >
                {processing ? 'Menghapus...' : 'Ya, Hapus Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
