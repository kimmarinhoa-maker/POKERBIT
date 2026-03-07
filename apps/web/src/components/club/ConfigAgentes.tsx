'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { listOrganizations, getAgentRates, getOrgTree, updateAgentRate, toggleAgentDirect, updateOrgMetadata } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/Spinner';
import { Users, Search, User, Check, X, Percent, UserCheck, Phone, Mail, Save, Hash, Building2, Trophy } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  external_id?: string | null;
  metadata?: Record<string, any>;
  is_direct?: boolean;
}

interface ClubInfo {
  external_id?: string | null;
  league_id?: string | null;
}

interface Props {
  subclubOrgId: string;
  clubId: string;
}

export default function ConfigAgentes({ subclubOrgId, clubId }: Props) {
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [clubInfo, setClubInfo] = useState<ClubInfo>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Rate editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Dados modal
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', email: '' });
  const [savingDados, setSavingDados] = useState(false);

  // Toggling direct
  const [togglingDirect, setTogglingDirect] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsRes, ratesRes, treeRes] = await Promise.all([
        listOrganizations('AGENT', subclubOrgId),
        getAgentRates(),
        getOrgTree(),
      ]);
      if (orgsRes.success) {
        setAgents(
          (orgsRes.data || []).map((o: any) => ({
            id: o.id,
            name: o.name,
            external_id: o.external_id,
            metadata: o.metadata,
            is_direct: o.metadata?.is_direct === true,
          })),
        );
      } else {
        toast(orgsRes.error || 'Erro ao carregar agentes', 'error');
      }
      if (ratesRes.success) setRates(ratesRes.data || []);
      // Extract club info (external_id + league_id)
      if (treeRes.success && treeRes.data) {
        for (const club of treeRes.data) {
          if (club.id === clubId) {
            setClubInfo({ external_id: club.external_id, league_id: club.league_id });
            break;
          }
        }
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }, [subclubOrgId, clubId, toast]);

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
      rb_rate: rateMap.get(a.id) ?? null as number | null,
    }));
  }, [agents, rates]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = agentsWithRates;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.external_id || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [agentsWithRates, debouncedSearch]);

  // KPIs
  const kpis = useMemo(() => {
    const total = agentsWithRates.length;
    const direct = agentsWithRates.filter((a) => a.is_direct).length;
    const withRate = agentsWithRates.filter((a) => a.rb_rate != null).length;
    const avgRate =
      withRate > 0
        ? agentsWithRates.filter((a) => a.rb_rate != null).reduce((s, a) => s + (a.rb_rate ?? 0), 0) / withRate
        : 0;
    return { total, direct, withRate, avgRate };
  }, [agentsWithRates]);

  // Rate editing
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

  // Toggle direct player
  async function handleToggleDirect(agent: Agent & { rb_rate: number | null }) {
    setTogglingDirect(agent.id);
    try {
      const res = await toggleAgentDirect(agent.id, !agent.is_direct);
      if (res.success) {
        toast(agent.is_direct ? 'Agente removido de direto' : 'Agente marcado como direto', 'success');
        loadData();
      } else {
        toast(res.error || 'Erro ao atualizar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setTogglingDirect(null);
    }
  }

  // Dados modal
  function hasData(agent: Agent): boolean {
    const meta = agent.metadata || {};
    return !!(meta.full_name || meta.phone || meta.email);
  }

  function openDados(agent: Agent) {
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
        loadData();
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSavingDados(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Total Agentes" value={kpis.total} accentColor="bg-blue-500" />
        <KpiCard label="Jogadores Diretos" value={kpis.direct} accentColor="bg-amber-500" valueColor="text-amber-400" />
        <KpiCard label="Com Rate" value={kpis.withRate} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
        <KpiCard label="Media RB" value={`${kpis.avgRate.toFixed(1)}%`} accentColor="bg-poker-500" valueColor="text-poker-400" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-dark-400 hover:text-dark-200 transition-colors">
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={search ? Search : Users}
            title={search ? 'Nenhum resultado' : 'Nenhum agente neste subclube'}
            description={search ? `Nenhum agente encontrado para "${search}"` : 'Agentes sao vinculados automaticamente ao importar dados'}
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
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-24">Direto</th>
                  <th className="px-3 py-2 text-center font-medium text-xs text-dark-400 w-16">Dados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/50">
                {filtered.map((agent) => (
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
                          <button onClick={() => saveRate(agent.id)} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors" title="Salvar">
                            {saving ? <Spinner size="sm" /> : <Check size={14} />}
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-dark-500 hover:text-dark-300 transition-colors" title="Cancelar">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(agent.id, agent.rb_rate)} className="group flex items-center justify-center gap-1 w-full" title="Editar rate">
                          <span className={`font-mono text-sm ${agent.rb_rate != null ? 'text-emerald-400' : 'text-dark-600'}`}>
                            {agent.rb_rate != null ? `${agent.rb_rate}%` : '—'}
                          </span>
                          <Percent size={10} className="text-dark-600 group-hover:text-poker-400 transition-colors" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => handleToggleDirect(agent)}
                        disabled={togglingDirect === agent.id}
                        className={`p-1.5 rounded-lg transition-colors ${
                          agent.is_direct
                            ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-dark-500 hover:bg-dark-700/50 hover:text-dark-300'
                        }`}
                        title={agent.is_direct ? 'Jogador direto (clique para remover)' : 'Marcar como jogador direto'}
                      >
                        {togglingDirect === agent.id ? <Spinner size="sm" /> : <UserCheck size={15} />}
                      </button>
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

      {/* ── Modal: Dados do Agente (expandido com IDs) ── */}
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
              {/* IDs — readonly info grid */}
              <div className="grid grid-cols-3 gap-3 pb-4 border-b border-dark-700/30">
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Hash size={10} /> ID Plataforma
                  </label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{editAgent.external_id || '—'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Building2 size={10} /> ID Clube
                  </label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{clubInfo.external_id || '—'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1">
                    <Trophy size={10} /> ID Liga
                  </label>
                  <p className="text-sm text-dark-300 font-mono mt-0.5">{clubInfo.league_id || '—'}</p>
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
