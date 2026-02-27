'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  getOrgTree,
  getAgentRates,
  updateAgentRate,
  updateOrgMetadata,
  listPlayers,
  getPlayerRates,
  updatePlayerRate,
  updatePlayer,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePageTitle } from '@/lib/usePageTitle';
import Spinner from '@/components/Spinner';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import { User, Phone, Mail, X, Save, Percent, Check, Users, ChevronDown, Search } from 'lucide-react';

type Tab = 'jogadores' | 'agentes';
type ToastFn = (msg: string, type: 'success' | 'error' | 'info') => void;

export default function PlayersPage() {
  usePageTitle('Cadastro');

  const [tab, setTab] = useState<Tab>('agentes');
  const { toast } = useToast();

  // Tree state (shared between tabs)
  const [tree, setTree] = useState<any[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedSubclubId, setSelectedSubclubId] = useState<string>('');

  // Load org tree
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await getOrgTree();
      if (res.success) setTree(res.data || []);
      else toast(res.error || 'Erro ao carregar clubes', 'error');
    } catch {
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      setTreeLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Build flat subclub list
  const subclubOptions = useMemo(() => {
    const opts: { id: string; name: string; clubName: string }[] = [];
    for (const club of tree) {
      for (const sub of club.subclubes || []) {
        opts.push({ id: sub.id, name: sub.name, clubName: club.name });
      }
    }
    return opts;
  }, [tree]);

  // Auto-select first subclub
  useEffect(() => {
    if (subclubOptions.length > 0 && !selectedSubclubId) {
      setSelectedSubclubId(subclubOptions[0].id);
    }
  }, [subclubOptions, selectedSubclubId]);

  // Get agents for selected subclub from tree (exclude direct agents — those show in Jogadores tab)
  // Dedup by lowercase name to avoid displaying duplicate orgs
  const agentsFromTree = useMemo(() => {
    for (const club of tree) {
      for (const sub of club.subclubes || []) {
        if (sub.id === selectedSubclubId) {
          const agents = (sub.agents || []).filter(
            (a: any) => !a.metadata?.is_direct,
          );
          // Dedup: keep first occurrence per lowercase name
          const seen = new Set<string>();
          return agents.filter((a: any) => {
            const key = (a.name || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
    }
    return [];
  }, [tree, selectedSubclubId]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Cadastro</h2>
          <p className="text-dark-400 text-sm">Gestao de agentes e jogadores</p>
        </div>
      </div>

      {/* Subclub Selector */}
      {treeLoading ? (
        <div className="flex items-center gap-2 mb-6">
          <Spinner size="sm" />
          <span className="text-sm text-dark-400">Carregando clubes...</span>
        </div>
      ) : subclubOptions.length === 0 ? (
        <div className="card text-center py-8 mb-6">
          <h3 className="text-lg font-bold text-white mb-2">Nenhum subclube encontrado</h3>
          <p className="text-dark-400 text-sm">Crie subclubes em Clubes antes de cadastrar agentes e jogadores.</p>
        </div>
      ) : (
        <div className="mb-6">
          <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1.5 block">Subclube</label>
          <div className="relative w-fit">
            <select
              value={selectedSubclubId}
              onChange={(e) => setSelectedSubclubId(e.target.value)}
              className="appearance-none bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2.5 pr-10 text-sm text-white font-medium focus:border-poker-500 focus:outline-none min-w-[280px] cursor-pointer"
            >
              {subclubOptions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.clubName} &gt; {sub.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      {selectedSubclubId && (
        <>
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

          {tab === 'agentes' ? (
            <AgentesTab toast={toast} agents={agentsFromTree} reloadTree={loadTree} />
          ) : (
            <JogadoresTab toast={toast} subclubId={selectedSubclubId} />
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AGENTES TAB
   ══════════════════════════════════════════════════════════════════════ */

function AgentesTab({
  toast,
  agents,
  reloadTree,
}: {
  toast: ToastFn;
  agents: any[];
  reloadTree: () => Promise<void>;
}) {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Rate editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Apply all
  const [applyAllRate, setApplyAllRate] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);

  // Dados modal
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [savingDados, setSavingDados] = useState(false);

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const ratesRes = await getAgentRates();
      if (ratesRes.success) setRates(ratesRes.data || []);
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

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

  // Filter by search
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return agentsWithRates;
    const q = debouncedSearch.toLowerCase();
    return agentsWithRates.filter(
      (a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.external_id || '').toLowerCase().includes(q),
    );
  }, [agentsWithRates, debouncedSearch]);

  // Sort by name
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const total = agentsWithRates.length;
    const withRate = agentsWithRates.filter((a) => a.rb_rate !== null && a.rb_rate !== undefined).length;
    const withoutRate = total - withRate;
    const avgRate =
      withRate > 0
        ? agentsWithRates.filter((a) => a.rb_rate != null).reduce((s, a) => s + a.rb_rate, 0) / withRate
        : 0;
    return { total, withRate, withoutRate, avgRate };
  }, [agentsWithRates]);

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
        loadRates();
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
      for (const a of sorted) {
        const res = await updateAgentRate(a.id, rate);
        if (res.success) count++;
      }
      toast(`Rate ${rate}% aplicado a ${count} agentes!`, 'success');
      setApplyAllRate('');
      loadRates();
    } catch {
      toast('Erro ao aplicar rate', 'error');
    } finally {
      setApplyingAll(false);
    }
  }

  // Dados modal helpers
  function hasData(agent: any): boolean {
    const meta = agent.metadata || {};
    return !!(meta.full_name || meta.phone || meta.email);
  }

  function openDados(agent: any) {
    const meta = agent.metadata || {};
    const rawPhone = String(meta.phone || '').replace(/\D/g, '');
    const displayPhone = rawPhone.startsWith('55') ? rawPhone.slice(2) : rawPhone;
    setEditForm({
      full_name: meta.full_name || '',
      phone: displayPhone,
      email: meta.email || '',
    });
    setEditAgent(agent);
  }

  async function handleSaveDados() {
    if (!editAgent) return;
    setSavingDados(true);
    const cleanPhone = editForm.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone ? `55${cleanPhone}` : undefined;
    try {
      const res = await updateOrgMetadata(editAgent.id, {
        full_name: editForm.full_name || undefined,
        phone: fullPhone,
        email: editForm.email || undefined,
      });
      if (res.success) {
        toast('Dados atualizados!', 'success');
        setEditAgent(null);
        reloadTree();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingDados(false);
    }
  }

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Agentes" value={kpis.total} accentColor="bg-blue-500" />
        <KpiCard label="Com Rate" value={kpis.withRate} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
        <KpiCard label="Sem Rate" value={kpis.withoutRate} accentColor="bg-amber-500" valueColor="text-amber-400" />
        <KpiCard label="Media RB" value={`${kpis.avgRate.toFixed(1)}%`} accentColor="bg-poker-500" valueColor="text-poker-400" />
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
        <div className="card">
          <EmptyState
            icon={search ? Search : Users}
            title={search ? 'Nenhum resultado' : 'Nenhum agente'}
            description={search ? `Nenhum agente encontrado para "${search}"` : 'Agentes sao criados automaticamente ao importar XLSX'}
          />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="px-3 py-2 text-left font-medium text-xs text-dark-400">Agente</th>
                  <th className="px-3 py-2 text-left font-medium text-xs text-dark-400 w-28">ID</th>
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-36">% Rakeback</th>
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-16">Dados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {sorted.map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-3 py-1.5 text-white font-medium">{agent.name}</td>
                    <td className="px-3 py-1.5 text-dark-500 font-mono text-[11px]">{agent.external_id || '—'}</td>
                    <td className="px-3 py-1.5 text-center">
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
                        <button
                          onClick={() => startEdit(agent.id, agent.rb_rate)}
                          className="group flex items-center justify-center gap-1 w-full"
                          title="Editar rate"
                        >
                          <span
                            className={`font-mono text-sm ${
                              agent.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'
                            }`}
                          >
                            {agent.rb_rate != null ? `${agent.rb_rate}%` : '—'}
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
                        onClick={() => openDados(agent)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          hasData(agent)
                            ? 'text-emerald-400 hover:bg-emerald-500/10'
                            : 'text-dark-500 hover:bg-dark-700/50 hover:text-dark-300'
                        }`}
                        title="Editar dados do agente"
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
      )}

      {/* ── Modal: Dados do Agente ── */}
      {editAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditAgent(null)}
        >
          <div
            className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-dark-700/50">
              <div>
                <h3 className="text-lg font-bold text-white">Dados do Agente</h3>
                <p className="text-dark-500 text-xs mt-0.5">
                  {editAgent.name}
                  {editAgent.external_id && (
                    <> · <span className="font-mono">{editAgent.external_id}</span></>
                  )}
                </p>
              </div>
              <button
                onClick={() => setEditAgent(null)}
                className="text-dark-500 hover:text-dark-300 transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 pb-4 border-b border-dark-700/30">
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Nome</label>
                  <p className="text-sm text-white font-medium mt-0.5">{editAgent.name}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">ID Plataforma</label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{editAgent.external_id || '—'}</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
                  <User size={12} /> Nome Completo
                </label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nome completo do agente"
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
                  placeholder="agente@email.com"
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setEditAgent(null)}
                className="px-4 py-2 rounded-lg text-sm text-dark-400 hover:bg-dark-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDados}
                disabled={savingDados}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50"
              >
                {savingDados ? <Spinner size="sm" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   JOGADORES TAB — Jogadores reais (players) de agentes diretos
   ══════════════════════════════════════════════════════════════════════ */

function JogadoresTab({
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
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditPlayer(null)}
        >
          <div
            className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-dark-700/50">
              <div>
                <h3 className="text-lg font-bold text-white">Dados do Jogador</h3>
                <p className="text-dark-500 text-xs mt-0.5">
                  {editPlayer.nickname || editPlayer.full_name}
                  {editPlayer.external_id && (
                    <> · <span className="font-mono">{editPlayer.external_id}</span></>
                  )}
                </p>
              </div>
              <button
                onClick={() => setEditPlayer(null)}
                className="text-dark-500 hover:text-dark-300 transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 pb-4 border-b border-dark-700/30">
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Nick</label>
                  <p className="text-sm text-white font-medium mt-0.5">{editPlayer.nickname || '—'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">ID Plataforma</label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{editPlayer.external_id || '—'}</p>
                </div>
              </div>

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
                  placeholder="email@exemplo.com"
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setEditPlayer(null)}
                className="px-4 py-2 rounded-lg text-sm text-dark-400 hover:bg-dark-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDados}
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
