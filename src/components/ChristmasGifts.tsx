import React, { useState, useMemo } from 'react';
import { ChristmasGift, GiftStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  createChristmasGift, 
  updateChristmasGift, 
  deleteChristmasGift 
} from '../services/firestoreService';
import { 
  Gift, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Search, 
  Filter, 
  CheckCircle2, 
  Package, 
  ShoppingBag, 
  Lightbulb, 
  DollarSign, 
  User, 
  Sparkles,
  Edit2,
  X
} from 'lucide-react';

interface ChristmasGiftsProps {
  gifts: ChristmasGift[];
}

const STATUS_CONFIG: Record<GiftStatus, { label: string; color: string; bg: string; icon: any }> = {
  idea: { 
    label: 'Nápad', 
    color: 'text-amber-700', 
    bg: 'bg-amber-50 border-amber-200', 
    icon: Lightbulb 
  },
  to_buy: { 
    label: 'Koupit', 
    color: 'text-blue-700', 
    bg: 'bg-blue-50 border-blue-200', 
    icon: ShoppingBag 
  },
  bought: { 
    label: 'Koupeno', 
    color: 'text-purple-700', 
    bg: 'bg-purple-50 border-purple-200', 
    icon: CheckCircle2 
  },
  wrapped: { 
    label: 'Zabaleno', 
    color: 'text-emerald-700', 
    bg: 'bg-emerald-50 border-emerald-200', 
    icon: Package 
  }
};

export const ChristmasGifts: React.FC<ChristmasGiftsProps> = ({ gifts }) => {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRecipient, setFilterRecipient] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState<ChristmasGift | null>(null);

  // Form state
  const [recipient, setRecipient] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<string>('');
  const [status, setStatus] = useState<GiftStatus>('idea');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Unique recipients for filter
  const recipients = useMemo(() => {
    const set = new Set<string>();
    gifts.forEach(g => {
      if (g.recipient?.trim()) set.add(g.recipient.trim());
    });
    return Array.from(set).sort();
  }, [gifts]);

  // Statistics
  const stats = useMemo(() => {
    const totalGifts = gifts.length;
    const totalSpent = gifts.reduce((sum, g) => sum + (Number(g.price) || 0), 0);
    const wrappedCount = gifts.filter(g => g.status === 'wrapped').length;
    const boughtCount = gifts.filter(g => g.status === 'bought').length;
    return {
      totalGifts,
      totalSpent,
      wrappedCount,
      boughtCount
    };
  }, [gifts]);

  // Filtered gifts
  const filteredGifts = useMemo(() => {
    return gifts.filter(gift => {
      const matchesSearch = 
        gift.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gift.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (gift.notes && gift.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRecipient = filterRecipient === 'all' || gift.recipient === filterRecipient;
      const matchesStatus = filterStatus === 'all' || gift.status === filterStatus;

      return matchesSearch && matchesRecipient && matchesStatus;
    });
  }, [gifts, searchQuery, filterRecipient, filterStatus]);

  const openCreateModal = () => {
    setEditingGift(null);
    setRecipient('');
    setTitle('');
    setPrice('');
    setStatus('idea');
    setLink('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (gift: ChristmasGift) => {
    setEditingGift(gift);
    setRecipient(gift.recipient);
    setTitle(gift.title);
    setPrice(gift.price ? String(gift.price) : '');
    setStatus(gift.status);
    setLink(gift.link || '');
    setNotes(gift.notes || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !recipient.trim() || !currentUser) return;

    setSaving(true);
    try {
      const parsedPrice = price.trim() ? parseFloat(price.replace(',', '.')) : undefined;

      if (editingGift) {
        await updateChristmasGift(editingGift.id, {
          recipient: recipient.trim(),
          title: title.trim(),
          price: (parsedPrice !== undefined && !isNaN(parsedPrice)) ? parsedPrice : undefined,
          status,
          link: link.trim() || '',
          notes: notes.trim() || ''
        });
      } else {
        await createChristmasGift({
          userId: currentUser.uid,
          recipient: recipient.trim(),
          title: title.trim(),
          price: (parsedPrice !== undefined && !isNaN(parsedPrice)) ? parsedPrice : undefined,
          status,
          link: link.trim() || undefined,
          notes: notes.trim() || undefined
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Chyba při ukládání vánočního dárku:", err);
      alert('Chyba při ukládání dárku: ' + (err?.message || 'Neznámá chyba'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (giftId: string) => {
    if (!window.confirm('Opravdu chcete smazat tento vánoční dárek?')) return;
    try {
      await deleteChristmasGift(giftId);
    } catch (err) {
      console.error(err);
      alert('Chyba při mazání dárku.');
    }
  };

  const handleQuickStatusChange = async (giftId: string, newStatus: GiftStatus) => {
    try {
      await updateChristmasGift(giftId, { status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full p-6">
      {/* Festive Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-emerald-700 p-8 text-white shadow-xl mb-8">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Vánoční seznam & rozpočet
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl flex items-center gap-3">
            <span>Vánoční dárky</span>
            <Gift className="w-8 h-8 text-amber-300" />
          </h1>
          <p className="mt-2 text-rose-100 text-sm sm:text-base leading-relaxed">
            Mějte pod kontrolou nápady, nákupy a balení dárků pro celou rodinu i přátele na jednom místě.
          </p>

          <div className="mt-6">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-rose-700 font-bold text-sm shadow-md hover:bg-rose-50 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Přidat dárek
            </button>
          </div>
        </div>

        {/* Festive background decoration */}
        <div className="absolute right-4 -bottom-6 opacity-15 pointer-events-none text-9xl">
          🎁
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800">{stats.totalGifts}</div>
            <div className="text-xs text-slate-500 font-medium">Celkem dárků</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800">
              {stats.totalSpent.toLocaleString('cs-CZ')} Kč
            </div>
            <div className="text-xs text-slate-500 font-medium">Celkový rozpočet</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800">
              {stats.boughtCount + stats.wrappedCount} / {stats.totalGifts}
            </div>
            <div className="text-xs text-slate-500 font-medium">Koupeno celkem</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800">
              {stats.wrappedCount} / {stats.totalGifts}
            </div>
            <div className="text-xs text-slate-500 font-medium">Zabaleno</div>
          </div>
        </div>
      </div>

      {/* Controls & Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Hledat dárek, obdarovaného nebo poznámku..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Recipient Filter */}
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={filterRecipient}
              onChange={(e) => setFilterRecipient(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Všichni obdarovaní</option>
              {recipients.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Všechny stavy</option>
              <option value="idea">Jen Nápady</option>
              <option value="to_buy">Jen Koupit</option>
              <option value="bought">Jen Koupeno</option>
              <option value="wrapped">Jen Zabaleno</option>
            </select>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nový dárek
          </button>
        </div>
      </div>

      {/* Gifts List / Grid */}
      {filteredGifts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 p-8 shadow-sm">
          <Gift className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">
            {gifts.length === 0 ? 'Zatím žádné vánoční dárky' : 'Žádné dárky neodpovídají filtrům'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {gifts.length === 0 
              ? 'Začněte přidáním prvního vánočního dárku nebo nápadu pro své blízké.' 
              : 'Zkuste upravit vyhledávání nebo filtry výše.'}
          </p>
          {gifts.length === 0 && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-xs transition cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Přidat první dárek
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGifts.map((gift) => {
            const statusInfo = STATUS_CONFIG[gift.status] || STATUS_CONFIG.idea;
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={gift.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar: Recipient & Actions */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      <User className="w-3.5 h-3.5 text-rose-500" />
                      {gift.recipient}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(gift)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                        title="Upravit dárek"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(gift.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Smazat dárek"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Gift Title */}
                  <h3 className="font-bold text-slate-800 text-base mb-1.5">
                    {gift.title}
                  </h3>

                  {/* Notes */}
                  {gift.notes && (
                    <p className="text-xs text-slate-500 mb-3 whitespace-pre-line line-clamp-2">
                      {gift.notes}
                    </p>
                  )}

                  {/* Link if available */}
                  {gift.link && (
                    <div className="mb-3">
                      <a
                        href={gift.link.startsWith('http') ? gift.link : `https://${gift.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Odkaz na e-shop / inspiraci
                      </a>
                    </div>
                  )}
                </div>

                {/* Bottom Bar: Price & Status Selector */}
                <div className="pt-4 border-t border-slate-100 mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    {gift.price !== undefined ? (
                      <span className="font-bold text-slate-800">
                        {gift.price.toLocaleString('cs-CZ')} Kč
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Cena nezadána</span>
                    )}
                  </div>

                  {/* Status Dropdown */}
                  <div className="relative">
                    <select
                      value={gift.status}
                      onChange={(e) => handleQuickStatusChange(gift.id, e.target.value as GiftStatus)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border focus:outline-none cursor-pointer ${statusInfo.bg} ${statusInfo.color}`}
                    >
                      <option value="idea">💡 Nápad</option>
                      <option value="to_buy">🛍️ Koupit</option>
                      <option value="bought">✔️ Koupeno</option>
                      <option value="wrapped">🎁 Zabaleno</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Gift className="w-5 h-5 text-rose-600" />
                {editingGift ? 'Upravit vánoční dárek' : 'Nový vánoční dárek'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Recipient */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Komu (Obdarovaný) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="např. Máma, Petr, Babička..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Co za dárek *
                </label>
                <input
                  type="text"
                  required
                  placeholder="např. Knížka, Bezdrátová sluchátka..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Price & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Cena (v Kč)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="např. 750"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Stav
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as GiftStatus)}
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  >
                    <option value="idea">💡 Nápad</option>
                    <option value="to_buy">🛍️ Koupit</option>
                    <option value="bought">✔️ Koupeno</option>
                    <option value="wrapped">🎁 Zabaleno</option>
                  </select>
                </div>
              </div>

              {/* Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Odkaz na e-shop (volitelné)
                </label>
                <input
                  type="text"
                  placeholder="https://... nebo domena.cz"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Poznámky (velikost, barva, kde koupit...)
                </label>
                <textarea
                  rows={2}
                  placeholder="např. velikost M, tmavě modrá..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={saving || !title.trim() || !recipient.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Ukládám...' : editingGift ? 'Uložit změny' : 'Přidat dárek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
