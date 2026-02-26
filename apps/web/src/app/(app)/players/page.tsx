'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  listPlayers,
  updatePlayer,
  listOrganizations,
  getAgentRates,
  updateAgentRate,
  getPlayerRates,
  updatePlayerRate,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePageTitle } from '@/lib/usePageTitle';
import Spinner from '@/components/Spinner';
import { User, Phone, Mail, X, Save, Percent, Check, Users } from 'lucide-react';

type Tab = 'jogadores' | 'agentes';
type SortKey = 'nickname' | 'external_id' | 'is_active' | 'created_at';
type SortDir = 'asc' | 'desc';

export default function PlayersPage() {
  usePageTitle('Cadastro');

  const [tab, setTab] = useState<Tab>('jogadores');
  const { toast } = useToast();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Cadastro</h2>
          <p className="text-dark-400 text-sm">Gestao de agentes e jogadores</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-dark-800/50 border border-dark-700/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('agentes')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'agentes'
              ? 'bg-poker-600 text-white shadow-sm'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
          }`}
        >
          <Users size={14} />
          Agentes
        </button>
        <button
          onClick={() => setTab('jogadores')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'jogadores'
              ? 'bg-poker-600 text-white shadow-sm'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
          }`}
        >
          <User size={14} />
          Jogadores
        </button>
      </div>

      {tab === 'agentes' ? <AgentesTab toast={toast} /> : <JogadoresTab toast={toast} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AGENTES TAB
   ══════════════════════════════════════════════════════════════════════ */

function AgentesTab({ toast }: { toast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply all state
  const [applyAllRate, setApplyAllRate] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, ratesRes] = await Promise.all([listOrganizations('AGENT'), getAgentRates()]);
      if (agentsRes.success) setAgents(agentsRes.data || []);
      else toast(agentsRes.error || 'Erro ao carregar agentes', 'error');
      if (ratesRes.success) setRates(ratesRes.data || []);
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Merge agents with rates
  const agentsWithRates = useMemo(() => {
    const rateMap = new Map<string, number>();
    for (const r of rates) {
      const orgId = r.organizations?.id || r.organization_id;
      if (orgId) rateMap.set(orgId, r.rate);
    }
    return agents.map((a) => ({
      ...a,
      rb_rate: rateMap.get(a.id) ?? null,
    }));
  }, [agents, rates]);

  // Filter
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return agentsWithRates;
    const q = debouncedSearch.toLowerCase();
    return agentsWithRates.filter((a) => (a.name || '').toLowerCase().includes(q));
  }, [agentsWithRates, debouncedSearch]);

  // Sort by name
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const total = agents.length;
    const withRate = agentsWithRates.filter((a) => a.rb_rate !== null && a.rb_rate !== undefined).length;
    const withoutRate = total - withRate;
    const avgRate =
      withRate > 0
        ? agentsWithRates.filter((a) => a.rb_rate != null).reduce((s, a) => s + a.rb_rate, 0) / withRate
        : 0;
    return { total, withRate, withoutRate, avgRate };
  }, [agents, agentsWithRates]);

  function startEdit(agentId: string, currentRate: number | null) {
    setEditingId(agentId);
    setRateInput(currentRate != null ? String(currentRate) : '');
  }

  async function saveRate(agentId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await updateAgentRate(agentId, rate);
      if (res.success) {
        toast(`Rate ${rate}% salvo!`, 'success');
        setEditingId(null);
        loadData();
      } else {
        toast(res.error || 'Erro ao salvar rate', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyAll() {
    const rate = parseFloat(applyAllRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setApplyingAll(true);
    try {
      let count = 0;
      for (const a of agents) {
        const res = await updateAgentRate(a.id, rate);
        if (res.success) count++;
      }
      toast(`Rate ${rate}% aplicado a ${count} agentes!`, 'success');
      setApplyAllRate('');
      loadData();
    } catch {
      toast('Erro ao aplicar rate', 'error');
    } finally {
      setApplyingAll(false);
    }
  }

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-blue-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Total Agentes</p>
          <p className="font-mono text-lg font-bold text-white">{kpis.total}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-emerald-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Com Rate</p>
          <p className="font-mono text-lg font-bold text-emerald-400">{kpis.withRate}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-amber-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Sem Rate</p>
          <p className="font-mono text-lg font-bold text-amber-400">{kpis.withoutRate}</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-poker-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Media RB</p>
          <p className="font-mono text-lg font-bold text-poker-400">{kpis.avgRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Search + Apply All */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
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

        {/* Apply All */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-dark-500">Aplicar % a todos:</span>
          <input
            type="number"
            value={applyAllRate}
            onChange={(e) => setApplyAllRate(e.target.value)}
            placeholder="%"
            min="0"
            max="100"
            step="0.1"
            className="w-20 bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-sm text-white text-center font-mono focus:border-poker-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleApplyAll}
            disabled={applyingAll || !applyAllRate}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {applyingAll ? <Spinner size="sm" /> : <Check size={12} />}
            Aplicar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card text-center py-16">
          <h3 className="text-xl font-bold text-white mb-2">{search ? 'Nenhum resultado' : 'Nenhum agente'}</h3>
          <p className="text-dark-400 text-sm">
            {search
              ? `Nenhum agente encontrado para "${search}"`
              : 'Agentes sao criados automaticamente ao importar XLSX'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="px-4 py-3 text-left font-medium text-xs text-dark-400">Agente</th>
                  <th className="px-4 py-3 text-center font-medium text-xs text-dark-400">Tipo</th>
                  <th className="px-4 py-3 text-center font-medium text-xs text-dark-400 w-40">% Rakeback</th>
                  <th className="px-4 py-3 text-center font-medium text-xs text-dark-400 w-20">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {sorted.map((agent) => (
                  <tr key={agent.id} className="hover:bg-dark-800/20 transition-colors">
                    <td className="px-4 py-2.5 text-white font-medium">{agent.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          agent.is_direct
                            ? 'bg-poker-900/30 text-poker-400 border-poker-700/40'
                            : 'bg-dark-700/50 text-dark-500 border-dark-600/50'
                        }`}
                      >
                        {agent.is_direct ? 'DIRETO' : 'AGENTE'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {editingId === agent.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRate(agent.id);
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
                            onClick={() => saveRate(agent.id)}
                            disabled={saving}
                            className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="Salvar"
                          >
                            {saving ? <Spinner size="sm" /> : <Check size={14} />}
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
                        <span
                          className={`font-mono text-sm ${
                            agent.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'
                          }`}
                        >
                          {agent.rb_rate != null ? `${agent.rb_rate}%` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {editingId !== agent.id && (
                        <button
                          onClick={() => startEdit(agent.id, agent.rb_rate)}
                          className="p-1.5 rounded-lg text-dark-500 hover:bg-dark-700/50 hover:text-poker-400 transition-colors"
                          title="Editar rate"
                        >
                          <Percent size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   JOGADORES TAB
   ══════════════════════════════════════════════════════════════════════ */

function JogadoresTab({ toast }: { toast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [players, setPlayers] = useState<any[]>([]);
  const [playerRates, setPlayerRates] = useState<any[]>([]);
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

  // Rate editing state
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  // Apply all state
  const [applyAllRate, setApplyAllRate] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const [playersRes, ratesRes] = await Promise.all([listPlayers(debouncedSearch, page), getPlayerRates()]);
      if (playersRes.success) {
        setPlayers(playersRes.data || []);
        setMeta(playersRes.meta || {});
      } else {
        toast(playersRes.error || 'Erro ao carregar jogadores', 'error');
      }
      if (ratesRes.success) setPlayerRates(ratesRes.data || []);
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, toast]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Merge players with rates
  const playersWithRates = useMemo(() => {
    const rateMap = new Map<string, number>();
    for (const r of playerRates) {
      const playerId = r.players?.id || r.player_id;
      if (playerId) rateMap.set(playerId, r.rate);
    }
    return players.map((p) => ({
      ...p,
      rb_rate: rateMap.get(p.id) ?? null,
    }));
  }, [players, playerRates]);

  // KPIs
  const kpis = useMemo(() => {
    const total = meta.total || 0;
    const active = players.filter((p) => p.is_active).length;
    const withRate = playersWithRates.filter((p) => p.rb_rate !== null && p.rb_rate !== undefined).length;
    const withoutRate = players.length - withRate;
    return { total, active, withRate, withoutRate, pageCount: players.length };
  }, [players, playersWithRates, meta]);

  // Client-side sort
  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...playersWithRates].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (sortKey === 'is_active') return mult * (Number(va) - Number(vb));
      if (sortKey === 'created_at') return mult * (new Date(va).getTime() - new Date(vb).getTime());
      return mult * String(va || '').localeCompare(String(vb || ''));
    });
  }, [playersWithRates, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortIcon = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '');

  function openEdit(player: any) {
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

  async function handleSave() {
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

  function hasData(p: any): boolean {
    const meta = p.metadata || {};
    return !!(p.full_name || meta.phone || meta.email);
  }

  // Rate editing
  function startEditRate(playerId: string, currentRate: number | null) {
    setEditingRateId(playerId);
    setRateInput(currentRate != null ? String(currentRate) : '');
  }

  async function savePlayerRateHandler(playerId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    if (!playerId) {
      toast('ID do jogador nao encontrado', 'error');
      return;
    }
    setSavingRate(true);
    try {
      const res = await updatePlayerRate(playerId, rate);
      if (res.success) {
        toast(`Rate ${rate}% salvo!`, 'success');
        setEditingRateId(null);
        loadPlayers();
      } else {
        toast(res.error || 'Erro ao salvar rate', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingRate(false);
    }
  }

  async function handleApplyAllPlayers() {
    const rate = parseFloat(applyAllRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast('Rate deve ser entre 0 e 100', 'error');
      return;
    }
    setApplyingAll(true);
    try {
      let count = 0;
      for (const p of players) {
        const res = await updatePlayerRate(p.id, rate);
        if (res.success) count++;
      }
      toast(`Rate ${rate}% aplicado a ${count} jogadores!`, 'success');
      setApplyAllRate('');
      loadPlayers();
    } catch {
      toast('Erro ao aplicar rate', 'error');
    } finally {
      setApplyingAll(false);
    }
  }

  return (
    <>
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
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-poker-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Com Rate</p>
          <p className="font-mono text-lg font-bold text-poker-400">{kpis.withRate}</p>
          <p className="text-[10px] text-dark-500 mt-1">nesta pagina</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-amber-500 rounded-lg p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Sem Rate</p>
          <p className="font-mono text-lg font-bold text-amber-400">{kpis.withoutRate}</p>
          <p className="text-[10px] text-dark-500 mt-1">nesta pagina</p>
        </div>
      </div>

      {/* Search + Apply All */}
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
            onClick={() => {
              setSearch('');
              setPage(1);
            }}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
          >
            Limpar
          </button>
        )}

        {/* Apply All */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-dark-500">Aplicar % a todos:</span>
          <input
            type="number"
            value={applyAllRate}
            onChange={(e) => setApplyAllRate(e.target.value)}
            placeholder="%"
            min="0"
            max="100"
            step="0.1"
            className="w-20 bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-sm text-white text-center font-mono focus:border-poker-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleApplyAllPlayers}
            disabled={applyingAll || !applyAllRate}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {applyingAll ? <Spinner size="sm" /> : <Check size={12} />}
            Aplicar
          </button>
        </div>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-dark-800/50">
                    <th
                      className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('nickname')}
                    >
                      Nick{sortIcon('nickname')}
                    </th>
                    <th
                      className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('external_id')}
                    >
                      External ID{sortIcon('external_id')}
                    </th>
                    <th
                      className="px-4 py-3 text-center font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                      onClick={() => handleSort('is_active')}
                    >
                      Status{sortIcon('is_active')}
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-xs text-dark-400 w-40">% Rakeback</th>
                    <th className="px-4 py-3 text-center font-medium text-xs text-dark-400 w-20">Dados</th>
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
                      <td className="px-4 py-2.5 text-center">
                        {editingRateId === p.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              value={rateInput}
                              onChange={(e) => setRateInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') savePlayerRateHandler(p.id);
                                if (e.key === 'Escape') setEditingRateId(null);
                              }}
                              min="0"
                              max="100"
                              step="0.1"
                              autoFocus
                              className="w-20 bg-dark-800 border border-poker-500 rounded px-2 py-1 text-sm text-white text-center font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-dark-500 text-xs">%</span>
                            <button
                              onClick={() => savePlayerRateHandler(p.id)}
                              disabled={savingRate}
                              className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Salvar"
                            >
                              {savingRate ? <Spinner size="sm" /> : <Check size={14} />}
                            </button>
                            <button
                              onClick={() => setEditingRateId(null)}
                              className="p-1 text-dark-500 hover:text-dark-300 transition-colors"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditRate(p.id, p.rb_rate)}
                            className="group flex items-center justify-center gap-1 w-full"
                            title="Editar rate"
                          >
                            <span
                              className={`font-mono text-sm ${
                                p.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'
                              }`}
                            >
                              {p.rb_rate != null ? `${p.rb_rate}%` : '—'}
                            </span>
                            <Percent
                              size={10}
                              className="text-dark-600 group-hover:text-poker-400 transition-colors"
                            />
                          </button>
                        )}
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
              >
                \u2190 Anterior
              </button>
              <span className="text-xs text-dark-500">
                {meta.page || page} / {meta.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-dark-300 hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Proxima \u2192
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Dados do Jogador ── */}
      {editPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditPlayer(null)}
        >
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
              <button
                onClick={() => setEditPlayer(null)}
                className="text-dark-500 hover:text-dark-300 transition-colors p-1"
              >
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
    </>
  );
}
