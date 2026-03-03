'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { listPlayers, getPlayerRates, updatePlayerRate, updatePlayer } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import Spinner from '@/components/Spinner';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import EntityDataModal from './EntityDataModal';
import { User, X, Percent, Check, Search } from 'lucide-react';

type ToastFn = (msg: string, type: 'success' | 'error' | 'info') => void;

export default function JogadoresTab({
  toast,
  subclubId,
}: {
  toast: ToastFn;
  subclubId: string;
}) {
  const [players, setPlayers] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({});

  // Rate editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  // Dados modal
  const [editPlayer, setEditPlayer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  // Load players (direct only)
  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlayers(debouncedSearch || undefined, page, subclubId, true);
      if (res.success) {
        setPlayers(res.data || []);
        setMeta(res.meta || {});
      } else {
        toast(res.error || 'Erro ao carregar jogadores', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, debouncedSearch, page, subclubId]);

  const loadRates = useCallback(async () => {
    try {
      const res = await getPlayerRates();
      if (res.success) setRates(res.data || []);
    } catch {
      toast('Erro ao carregar rates dos jogadores', 'error');
    }
  }, [toast]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // Reset page on search/subclub change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subclubId]);

  // Merge players with rates
  const playersWithRates = useMemo(() => {
    const rateMap = new Map<string, number>();
    for (const r of rates) {
      const playerId = r.players?.id || r.player_id;
      if (playerId) rateMap.set(playerId, r.rate);
    }
    return players.map((p) => ({
      ...p,
      rb_rate: rateMap.get(p.id) ?? null,
    }));
  }, [players, rates]);

  // KPIs
  const kpis = useMemo(() => {
    const total = meta.total || players.length;
    const withRate = playersWithRates.filter((p) => p.rb_rate != null).length;
    const withoutRate = playersWithRates.length - withRate;
    const avgRate =
      withRate > 0
        ? playersWithRates.filter((p) => p.rb_rate != null).reduce((s, p) => s + p.rb_rate, 0) / withRate
        : 0;
    return { total, withRate, withoutRate, avgRate };
  }, [playersWithRates, meta, players.length]);

  function startEdit(playerId: string, currentRate: number | null) {
    setEditingId(playerId);
    setRateInput(currentRate != null ? String(currentRate) : '');
  }

  async function saveRate(playerId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setSavingRate(true);
    try {
      const res = await updatePlayerRate(playerId, rate);
      if (res.success) {
        toast(`Rate ${rate}% salvo!`, 'success');
        setEditingId(null);
        loadRates();
      } else {
        toast(res.error || 'Erro ao salvar rate', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingRate(false);
    }
  }

  // Dados modal helpers
  function hasData(player: any): boolean {
    return !!(player.full_name || player.metadata?.phone || player.metadata?.email);
  }

  function openDados(player: any) {
    const meta = player.metadata || {};
    const rawPhone = String(meta.phone || '').replace(/\D/g, '');
    const displayPhone = rawPhone.startsWith('55') ? rawPhone.slice(2) : rawPhone;
    setEditForm({
      full_name: player.full_name || '',
      phone: displayPhone,
      email: meta.email || '',
    });
    setEditPlayer(player);
  }

  async function handleSaveDados() {
    if (!editPlayer) return;
    setSaving(true);
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
        setEditPlayer(null);
        loadPlayers();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Jogadores" value={kpis.total} accentColor="bg-blue-500" />
        <KpiCard label="Com Rate" value={kpis.withRate} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
        <KpiCard label="Sem Rate" value={kpis.withoutRate} accentColor="bg-amber-500" valueColor="text-amber-400" />
        <KpiCard label="Media RB" value={`${kpis.avgRate.toFixed(1)}%`} accentColor="bg-poker-500" valueColor="text-poker-400" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nick ou ID..."
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
            onClick={() => setSearch('')}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
          >
            Limpar
          </button>
        )}
        {meta.pages > 1 && (
          <span className="text-xs text-dark-500 ml-auto">
            Pagina {page} de {meta.pages} ({meta.total} jogadores)
          </span>
        )}
      </div>

      {loading ? (
        <><KpiSkeleton count={4} /><TableSkeleton columns={4} rows={8} /></>
      ) : playersWithRates.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={search ? Search : User}
            title={search ? 'Nenhum resultado' : 'Nenhum jogador direto'}
            description={search ? `Nenhum jogador encontrado para "${search}"` : 'Marque agentes como diretos em Configuracao > Estrutura para ver seus jogadores aqui.'}
          />
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm data-table">
                <thead>
                  <tr className="bg-dark-800/50">
                    <th className="px-3 py-2 text-left font-medium text-xs text-dark-400">Jogador</th>
                    <th className="px-3 py-2 text-left font-medium text-xs text-dark-400 w-28">ID</th>
                    <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-36">% Rakeback</th>
                    <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-16">Dados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/50">
                  {playersWithRates.map((player) => (
                    <tr key={player.id}>
                      <td className="px-3 py-1.5 text-white font-medium">{player.nickname || player.full_name || '—'}</td>
                      <td className="px-3 py-1.5 text-dark-500 font-mono text-[11px]">{player.external_id || '—'}</td>
                      <td className="px-3 py-1.5 text-center">
                        {editingId === player.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={rateInput}
                              onChange={(e) => setRateInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRate(player.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              min="0"
                              max="100"
                              step="0.1"
                              autoFocus
                              className="w-20 bg-dark-800 border border-poker-500 rounded px-2 py-1 text-sm text-white text-center font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-dark-500 text-xs">%</span>
                            <button
                              onClick={() => saveRate(player.id)}
                              disabled={savingRate}
                              className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Salvar"
                            >
                              {savingRate ? <Spinner size="sm" /> : <Check size={14} />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-dark-500 hover:text-dark-300 transition-colors"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(player.id, player.rb_rate)}
                            className="group flex items-center justify-center gap-1 w-full"
                            title="Editar rate"
                          >
                            <span
                              className={`font-mono text-sm ${
                                player.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'
                              }`}
                            >
                              {player.rb_rate != null ? `${player.rb_rate}%` : '—'}
                            </span>
                            <Percent
                              size={10}
                              className="text-dark-600 group-hover:text-poker-400 transition-colors"
                            />
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => openDados(player)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            hasData(player)
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
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 hover:bg-dark-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Proximo
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Dados do Jogador ── */}
      {editPlayer && (
        <EntityDataModal
          title="Dados do Jogador"
          entityName={editPlayer.nickname || editPlayer.full_name}
          entityExternalId={editPlayer.external_id}
          firstLabel="Nick"
          firstValue={editPlayer.nickname || '—'}
          namePlaceholder="Nome completo do jogador"
          emailPlaceholder="email@exemplo.com"
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          onClose={() => setEditPlayer(null)}
          onSave={handleSaveDados}
        />
      )}
    </>
  );
}
