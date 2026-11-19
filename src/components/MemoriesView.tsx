import { useMemo, useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import type { CompanionActions } from '../lib/companionRepo';
import type { MemoryCategory, MemoryItem } from '../types/amelia';

interface MemoriesViewProps {
  actions: CompanionActions;
  memories: MemoryItem[];
  companionName: string;
  isCloudSynced: boolean;
}

const CATEGORY_OPTIONS: Array<{ id: MemoryCategory; label: string }> = [
  { id: 'identitas', label: 'Identitas' },
  { id: 'panggilan', label: 'Panggilan' },
  { id: 'hobi', label: 'Hobi' },
  { id: 'preferensi', label: 'Preferensi' },
  { id: 'aktivitas', label: 'Aktivitas' },
  { id: 'cerita', label: 'Cerita Penting' },
  { id: 'komunikasi', label: 'Gaya Komunikasi' },
];

export function MemoriesView({
  actions,
  memories,
  companionName,
  isCloudSynced,
}: MemoriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemoryCategory>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preferensi');
  const [newSensitive, setNewSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('cerita');
  const [errorMsg, setErrorMsg] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return memories.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (q && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [memories, searchQuery, categoryFilter]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await actions.createMemory({
        category: newCategory,
        content: newContent.trim(),
        isSensitive: newSensitive,
      });
      setNewContent('');
      setNewSensitive(false);
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan memori.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: MemoryItem) => {
    setErrorMsg('');
    try {
      await actions.updateMemory(item.id, {
        category: item.category,
        content: item.content,
        isSensitive: item.isSensitive,
        active: !item.active,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui status.');
    }
  };

  const handleSaveEdit = async (item: MemoryItem) => {
    if (!editContent.trim()) return;
    setErrorMsg('');
    try {
      await actions.updateMemory(item.id, {
        category: editCategory,
        content: editContent.trim(),
        isSensitive: item.isSensitive,
        active: item.active,
      });
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMsg('');
    try {
      await actions.deleteMemory(id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus memori.');
    }
  };

  const activeCount = memories.filter((m) => m.active).length;

  return (
    <div className="h-full overflow-y-auto amelia-scroll">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Memori {companionName}
            </h1>
            <p className="text-sm text-[#9E97B3] mt-1">
              <span className="tabular-nums font-medium text-[#E9D5FF]">{activeCount}</span> memori aktif ·{' '}
              <span className="tabular-nums">{memories.length}</span> total tersimpan{' '}
              {isCloudSynced ? 'di Cloud Firestore' : 'di perangkat'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showAddForm ? 'Tutup Form' : 'Tambah Memori'}</span>
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAdd}
            className="p-4 sm:p-5 rounded-2xl bg-[#14121D] border border-[#A78BFA]/25 space-y-4"
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#C4B5FD]">
                Apa yang perlu {companionName} ingat tentang kamu?
              </label>
              <textarea
                rows={2}
                required
                maxLength={400}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Contoh: Aku paling suka minum kopi susu gula aren kalau lagi lembur."
                className="w-full p-3 rounded-xl bg-[#0B0912] border border-white/[0.1] text-sm text-white placeholder:text-[#6E6785] focus:outline-none focus:border-[#A78BFA]"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="h-10 px-3 rounded-xl bg-[#0B0912] border border-white/[0.1] text-xs text-white focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-xs text-[#C8C2D8] cursor-pointer min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={newSensitive}
                    onChange={(e) => setNewSensitive(e.target.checked)}
                    className="rounded border-white/20 bg-[#0B0912] accent-[#EC4899]"
                  />
                  <span>Tandai sebagai informasi sensitif</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={saving || !newContent.trim()}
                className="min-h-[40px] px-5 rounded-xl bg-[#6D28D9] hover:bg-[#7C3AED] text-white text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Memori'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#847D9B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari memori tentang namamu, hobi, atau cerita..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#13111B] border border-white/[0.08] text-sm text-white placeholder:text-[#6E6785] focus:outline-none focus:border-[#A78BFA]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 amelia-scroll">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-[#261E3C] text-white border border-[#A78BFA]/35'
                  : 'bg-[#13111B] text-[#9E97B3] hover:text-white border border-white/[0.06]'
              }`}
            >
              Semua
            </button>
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  categoryFilter === cat.id
                    ? 'bg-[#261E3C] text-white border border-[#A78BFA]/35'
                    : 'bg-[#13111B] text-[#9E97B3] hover:text-white border border-white/[0.06]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#FDA4AF]">
            {errorMsg}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#12101A] border border-white/[0.06] text-center space-y-2">
            <p className="text-sm font-medium text-white">
              {memories.length === 0
                ? 'Belum ada memori tersimpan'
                : 'Tidak ada memori yang cocok dengan filter'}
            </p>
            <p className="text-xs text-[#8E87A4] max-w-md mx-auto">
              Saat kamu bercerita di chat, {companionName} akan meminta izinmu sebelum menyimpan
              fakta pribadi penting ke sini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const catLabel =
                CATEGORY_OPTIONS.find((c) => c.id === item.category)?.label || item.category;
              const dateStr = new Date(item.updatedAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-colors ${
                    item.active
                      ? 'bg-[#13111C] border-white/[0.08]'
                      : 'bg-[#0F0D15] border-white/[0.04] opacity-65'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <textarea
                        rows={2}
                        maxLength={400}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-3 rounded-xl bg-[#0A0910] border border-[#A78BFA]/40 text-sm text-white focus:outline-none"
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                          className="h-9 px-3 rounded-lg bg-[#0A0910] border border-white/[0.1] text-xs text-white"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[36px] px-3 rounded-lg text-xs text-[#9E97B3] hover:text-white"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(item)}
                            className="min-h-[36px] px-3.5 rounded-lg bg-[#6D28D9] text-white text-xs font-medium flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Simpan</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-[#918AA8] flex-wrap">
                          <span className="text-[#C4B5FD] font-medium">{catLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{dateStr}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.active ? 'Aktif digunakan' : 'Dijeda'}</span>
                          {item.isSensitive && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#F472B6] inline-flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                <span>Sensitif</span>
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm sm:text-[15px] text-[#F4F1FA] leading-relaxed">
                          {item.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(item)}
                          className="min-h-[36px] px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-[#D6D0E4]"
                        >
                          {item.active ? 'Jeda' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditContent(item.content);
                            setEditCategory(item.category);
                          }}
                          aria-label="Edit memori"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9E97B3] hover:text-white hover:bg-white/[0.05]"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          aria-label="Hapus memori"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9E97B3] hover:text-[#FDA4AF] hover:bg-white/[0.05]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
