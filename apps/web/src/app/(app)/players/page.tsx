'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { listPlayers, updatePlayer } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import Spinner from '@/components/Spinner';
import { User, Phone, Mail, X, Save } from 'lucide-react';

type SortKey = 'nickname' | 'external_id' | 'is_active' | 'created_at';
type SortDir = 'asc' | 'desc';

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('nickname');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editPlayer, setEditPlayer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlayers(debouncedSearch, page);
      if (res.success) {
        setPlayers(res.data || []);
        setMeta(res.meta || {});
      } else {
        toast(res.error || 'Erro ao carregar jogadores', 'error');
      }
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, toast]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // KPIs
  const kpis = useMemo(() => {
    const total = meta.total || 0;
    const active = players.filter((p) => p.is_active).length;
    const inactive = players.filter((p) => !p.is_active).length;
    return { total, active, inactive, pageCount: players.length };
  }, [players, meta]);

  // Client-side sort
  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...players].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (sortKey === 'is_active') return mult * (Number(va) - Number(vb));
      if (sortKey === 'created_at') return mult * (new Date(va).getTime() - new Date(vb).getTime());
      return mult * String(va || '').localeCompare(String(vb || ''));
    });
  }, [players, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortIcon = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  function openEdit(player: any) {
    const meta = player.metadata || {};
    // Strip leading 55 for display (stored as 55XXXXXXXXXXX)
    const rawPhone = String(meta.phone || '').replace(/\D/g, '');
    const displayPhone = rawPhone.startsWith('55') ? rawPhone.slice(2) : rawPhone;
    setEditForm({
      full_name: player.full_name || '',
      phone: displayPhone,
      email: meta.email || '',
    });
    setEditPlayer(player);
  }

  async function handleSave() {
    if (!editPlayer) return;
    setSaving(true);
    // Build phone with 55 prefix
    const cleanPhone = editForm.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone ? `55${cleanPhone}` : undefined;
    try {
      const res = await updatePlayer(editPlayer.id, {
        full_name: editForm.full_name || undefined,
        phone: fullPhone,
        email: editForm.email || undefined,
      });
      if (res.success) {
        toast('Dados atualizados!', 'success');
        // Update local state
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === editPlayer.id
              ? {
                  ...p,
                  full_name: editForm.full_name || null,
                  metadata: { ...(p.metadata || {}), phone: fullPhone || null, email: editForm.email || null },
                }
              : p,
          ),
        );
        setEditPlayer(null);
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Check if player has contact data
  function hasData(p: any): boolean {
    const meta = p.metadata || {};
    return !!(p.full_name || meta.phone || meta.email);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Jogadores</h2>
          <p className="text-dark-400 text-sm">{meta.total || 0} jogadores cadastrados</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-blue-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Total</p>
          <p className="font-mono text-lg font-bold text-white">{kpis.total}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-emerald-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Ativos</p>
          <p className="font-mono text-lg font-bold text-emerald-400">{kpis.active}</p>
          <p className="text-[10px] text-dark-500 mt-1">nesta pagina</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-red-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Inativos</p>
          <p className="font-mono text-lg font-bold text-red-400">{kpis.inactive}</p>
          <p className="text-[10px] text-dark-500 mt-1">nesta pagina</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-poker-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Pagina</p>
          <p className="font-mono text-lg font-bold text-poker-400">{kpis.pageCount}</p>
          <p className="text-[10px] text-dark-500 mt-1">
            {meta.pages > 1 ? `pag. ${meta.page || 1}/${meta.pages}` : 'todos'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nick ou ID..."
            aria-label="Buscar jogador por nick ou ID"
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
          {search && debouncedSearch !== search && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size="sm" />
            </div>
          )}
        </div>
        {search && (
          <button
            onClick={() => {
              setSearch('');
              setPage(1);
            }}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
            aria-label="Limpar busca"
          >
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : players.length === 0 ? (
        <div className="card text-center py-16">
          <h3 className="text-xl font-bold text-white mb-2">{search ? 'Nenhum resultado' : 'Nenhum jogador'}</h3>
          <p className="text-dark-400 text-sm">
            {search ? `Nenhum jogador encontrado para "${search}"` : 'Importe um XLSX para cadastrar jogadores'}
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Lista de jogadores">
                <thead>
                  <tr className="bg-dark-800/50">
                    <th
                      className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('nickname')}
                      role="columnheader"
                      aria-sort={sortKey === 'nickname' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Nick{sortIcon('nickname')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('external_id')}
                      role="columnheader"
                      aria-sort={sortKey === 'external_id' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      External ID{sortIcon('external_id')}
                    </th>
                    <th
                      className="px-4 py-3 text-center font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('is_active')}
                      role="columnheader"
                      aria-sort={sortKey === 'is_active' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Status{sortIcon('is_active')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('created_at')}
                      role="columnheader"
                      aria-sort={sortKey === 'created_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      Desde{sortIcon('created_at')}
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-xs text-dark-400">Dados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/50">
                  {sorted.map((p) => (
                    <tr key={p.id} className="hover:bg-dark-800/20 transition-colors">
                      <td className="px-4 py-2.5 text-white font-medium">{p.nickname}</td>
                      <td className="px-4 py-2.5 text-dark-400 font-mono text-[10px]">{p.external_id}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            p.is_active
                              ? 'bg-poker-900/30 text-poker-400 border-poker-700/40'
                              : 'bg-dark-700/50 text-dark-500 border-dark-600/50'
                          }`}
                        >
                          {p.is_active ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-dark-400 text-xs font-mono">
                        {new Date(p.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => openEdit(p)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            hasData(p)
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-dark-500 hover:bg-dark-700/50 hover:text-dark-300'
                          }`}
                          title="Editar dados do jogador"
                        >
                          <User size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {meta.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-dark-300 hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Pagina anterior"
              >
                ← Anterior
              </button>
              <span className="text-xs text-dark-500">
                {meta.page || page} / {meta.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-dark-300 hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Proxima pagina"
              >
                Proxima →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Dados do Jogador ── */}
      {editPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditPlayer(null)}>
          <div
            className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-dark-700/50">
              <div>
                <h3 className="text-lg font-bold text-white">Dados do Jogador</h3>
                <p className="text-dark-500 text-xs mt-0.5">
                  {editPlayer.nickname} · <span className="font-mono">{editPlayer.external_id}</span>
                </p>
              </div>
              <button onClick={() => setEditPlayer(null)} className="text-dark-500 hover:text-dark-300 transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Read-only info */}
              <div className="grid grid-cols-2 gap-3 pb-4 border-b border-dark-700/30">
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Nick</label>
                  <p className="text-sm text-white font-medium mt-0.5">{editPlayer.nickname}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">ID Plataforma</label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{editPlayer.external_id}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Status</label>
                  <p className="mt-0.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        editPlayer.is_active
                          ? 'bg-poker-900/30 text-poker-400 border-poker-700/40'
                          : 'bg-dark-700/50 text-dark-500 border-dark-600/50'
                      }`}
                    >
                      {editPlayer.is_active ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Desde</label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">
                    {new Date(editPlayer.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Editable fields */}
              <div>
                <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
                  <User size={12} /> Nome Completo
                </label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nome completo do jogador"
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
                  <Phone size={12} /> Celular
                </label>
                <div className="flex items-center gap-0">
                  <span className="bg-dark-700 border border-dark-700/50 border-r-0 rounded-l-lg px-3 py-2 text-sm text-dark-300 font-mono font-bold select-none">
                    +55
                  </span>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setEditForm((f) => ({ ...f, phone: digits }));
                    }}
                    placeholder="11999999999"
                    className="flex-1 bg-dark-800 border border-dark-700/50 rounded-r-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none font-mono"
                    maxLength={11}
                  />
                </div>
                <p className="text-[10px] text-dark-600 mt-1">DDD + numero (ex: 11999999999)</p>
              </div>
              <div>
                <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
                  <Mail size={12} /> E-mail
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jogador@email.com"
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setEditPlayer(null)}
                className="px-4 py-2 rounded-lg text-sm text-dark-400 hover:bg-dark-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50"
              >
                {saving ? <Spinner size="sm" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
