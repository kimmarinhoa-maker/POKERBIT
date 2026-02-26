'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  listOrganizations,
  listLedger,
  updateAgentRbRate,
  updatePlayerRate,
  toggleAgentDirect,
  syncSettlementAgents,
  formatBRL,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { round2 } from '@/lib/formatters';
import { AgentMetric, PlayerMetric, LedgerEntry } from '@/types/settlement';
import { Percent, Users } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';

interface OrgData {
  id: string;
  name: string;
  type: string;
  metadata: Record<string, unknown>;
}

interface Props {
  subclub: {
    id: string;
    name: string;
    agents: AgentMetric[];
    players: PlayerMetric[];
    totals: { rake: number };
  };
  weekStart: string;
  fees: Record<string, number>;
  settlementId: string;
  settlementStatus: string;
  onDataChange: () => void;
}

// ─── Component ──────────────────────────────────────────────────────

export default function Rakeback({ subclub, weekStart, fees, settlementId, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const agents = subclub.agents || [];
  const players = subclub.players || [];
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEditRates = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'agencias' | 'jogadores'>('agencias');
  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [applyAllAgent, setApplyAllAgent] = useState<string | null>(null);
  const [applyAllRate, setApplyAllRate] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);
  const [directDropdown, setDirectDropdown] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Load orgs (for is_direct) and ledger (for badge status)
  const loadExtras = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-sync agents to organizations on first load
      if (isDraft) {
        await syncSettlementAgents(settlementId).catch(() => {});
      }
      const [orgsRes, ledgerRes] = await Promise.all([listOrganizations('AGENT'), listLedger(weekStart)]);
      if (!mountedRef.current) return;
      if (orgsRes.success) setOrgs(orgsRes.data || []);
      if (ledgerRes.success) setLedgerEntries(ledgerRes.data || []);
    } catch {
      if (!mountedRef.current) return;
      toast('Erro na operacao de rakeback', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, settlementId, isDraft]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  // Unified direct logic: backend annotations (agent.is_direct, player.agent_is_direct) + "SEM AGENTE"
  const directNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.is_direct) set.add(a.agent_name.toLowerCase());
    }
    for (const p of players) {
      if (p.agent_is_direct) set.add((p.agent_name || '').toLowerCase());
    }
    set.add('sem agente');
    set.add('(sem agente)');
    return set;
  }, [agents, players]);

  // Map org.name (lowercase) → org (for fallback when agent_id is null)
  const orgByName = useMemo(() => {
    const map = new Map<string, OrgData>();
    for (const org of orgs) {
      map.set(org.name.toLowerCase(), org);
    }
    return map;
  }, [orgs]);

  // Map entity_id → ledger entries
  const ledgerByEntity = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of ledgerEntries) {
      if (!map.has(e.entity_id)) map.set(e.entity_id, []);
      map.get(e.entity_id)!.push(e);
    }
    return map;
  }, [ledgerEntries]);

  // Tax rate on rake
  const taxRate = ((fees.taxaApp || 0) + (fees.taxaLiga || 0)) / 100;

  // Group players by agent name (keep original value as key)
  const playersByAgent = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of players) {
      const key = p.agent_name || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [players]);

  /** Lookup players for a given agent_name, with fallback for "(sem agente)" */
  function getPlayersForAgent(agentName: string): PlayerMetric[] {
    const direct = playersByAgent.get(agentName);
    if (direct && direct.length > 0) return direct;
    // Fallback only for "sem agente" variants
    const isSemAgente = !agentName || /sem.agente|^\(sem.agente\)$|^none$/i.test(agentName);
    if (isSemAgente) {
      return (
        playersByAgent.get('') ||
        playersByAgent.get('(sem agente)') ||
        playersByAgent.get('SEM AGENTE') ||
        playersByAgent.get('None') ||
        []
      );
    }
    return [];
  }

  // Resolve org ID for an agent (by agent_id or name fallback)
  function resolveOrgId(agent: AgentMetric): string | null {
    if (agent.agent_id) return agent.agent_id;
    const org = orgByName.get(agent.agent_name.toLowerCase());
    return org?.id || null;
  }

  // Split agents into non-direct and direct (using backend annotations)
  // Also add synthetic agent entries for orphan direct player groups
  const { nonDirectAgents, directAgents } = useMemo(() => {
    const agentNames = new Set(agents.map((a) => a.agent_name));
    const nonDirect: AgentMetric[] = [];
    const direct: AgentMetric[] = [];
    for (const a of agents) {
      if (a.is_direct || directNameSet.has(a.agent_name.toLowerCase())) {
        direct.push(a);
      } else {
        nonDirect.push(a);
      }
    }
    // Add orphan direct player groups (players whose agent_name has no agent_week_metrics entry)
    for (const [agName, agPlayers] of playersByAgent) {
      if (agentNames.has(agName)) continue;
      if (!directNameSet.has(agName.toLowerCase())) continue;
      direct.push({
        id: `orphan_${agName}`,
        agent_id: null,
        agent_name: agName,
        player_count: agPlayers.length,
        rake_total_brl: agPlayers.reduce((s, p) => s + (Number(p.rake_total_brl) || 0), 0),
        ganhos_total_brl: agPlayers.reduce((s, p) => s + (Number(p.winnings_brl) || 0), 0),
        rb_rate: 0,
        commission_brl: agPlayers.reduce((s, p) => s + (Number(p.rb_value_brl) || 0), 0),
        resultado_brl: agPlayers.reduce((s, p) => s + (Number(p.resultado_brl) || 0), 0),
      });
    }
    nonDirect.sort((a, b) => a.agent_name.localeCompare(b.agent_name));
    direct.sort((a, b) => a.agent_name.localeCompare(b.agent_name));
    return { nonDirectAgents: nonDirect, directAgents: direct };
  }, [agents, directNameSet, playersByAgent]);

  // Filter by search
  const filteredNonDirect = useMemo(() => {
    if (!search.trim()) return nonDirectAgents;
    const q = search.toLowerCase();
    return nonDirectAgents.filter((a) => {
      if (a.agent_name.toLowerCase().includes(q)) return true;
      const agentPlayers = getPlayersForAgent(a.agent_name);
      return agentPlayers.some(
        (p) => (p.nickname || '').toLowerCase().includes(q) || (p.external_player_id || '').includes(q),
      );
    });
  }, [nonDirectAgents, search, playersByAgent]);

  const filteredDirect = useMemo(() => {
    if (!search.trim()) return directAgents;
    const q = search.toLowerCase();
    return directAgents.filter((a) => {
      if (a.agent_name.toLowerCase().includes(q)) return true;
      const agentPlayers = getPlayersForAgent(a.agent_name);
      return agentPlayers.some(
        (p) => (p.nickname || '').toLowerCase().includes(q) || (p.external_player_id || '').includes(q),
      );
    });
  }, [directAgents, search, playersByAgent]);

  // KPIs
  const kpis = useMemo(() => {
    const rakeTotal = round2(players.reduce((s, p) => s + Number(p.rake_total_brl || 0), 0));
    // Total RB = non-direct agent commissions + direct player rb values
    let totalRB = 0;
    for (const a of nonDirectAgents) {
      totalRB += Number(a.commission_brl || 0);
    }
    for (const a of directAgents) {
      const agentPlayers = getPlayersForAgent(a.agent_name);
      for (const p of agentPlayers) {
        totalRB += Number(p.rb_value_brl || 0);
      }
    }
    totalRB = round2(totalRB);
    const taxesOnRake = round2(rakeTotal * taxRate);
    const lucroLiquido = round2(rakeTotal - totalRB - taxesOnRake);
    return { rakeTotal, totalRB, taxesOnRake, lucroLiquido };
  }, [players, nonDirectAgents, directAgents, playersByAgent, taxRate]);

  // ─── Handlers ───────────────────────────────────────────────────

  function toggleAgent(id: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getAgentStatus(agent: AgentMetric): 'confirmado' | 'parcial' | 'pendente' {
    const rbRate = Number(agent.rb_rate) || 0;
    // If rate is set (even if 0 explicitly), it's confirmed
    if (rbRate > 0) return 'confirmado';
    // Check ledger entries for payment status
    const entries = ledgerByEntity.get(agent.id) || [];
    if (entries.length > 0) {
      const commission = Number(agent.commission_brl) || 0;
      if (commission <= 0) return 'confirmado';
      const totalOut = entries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
      if (totalOut >= commission - 0.01) return 'confirmado';
      return 'parcial';
    }
    return 'pendente';
  }

  function startEditRate(id: string, currentRate: number) {
    setEditingRate(id);
    setRateInput(String(currentRate));
  }

  async function saveAgentRate(agent: AgentMetric) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    setSavingRate(true);
    try {
      const res = await updateAgentRbRate(settlementId, agent.id, rate);
      if (res.success) {
        setEditingRate(null);
        onDataChange();
      }
    } catch {
      toast('Erro na operacao de rakeback', 'error');
    } finally {
      setSavingRate(false);
    }
  }

  async function savePlayerRate(playerId: string) {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    setSavingRate(true);
    try {
      const res = await updatePlayerRate(playerId, rate, weekStart);
      if (res.success) {
        setEditingRate(null);
        onDataChange();
      }
    } catch {
      toast('Erro na operacao de rakeback', 'error');
    } finally {
      setSavingRate(false);
    }
  }

  async function handleMarkDirect() {
    if (!directDropdown) return;
    try {
      const res = await toggleAgentDirect(directDropdown, true);
      if (res.success) {
        setDirectDropdown('');
        await loadExtras();
        onDataChange();
      }
    } catch {
      toast('Erro na operacao de rakeback', 'error');
    }
  }

  async function handleRemoveDirect(agent: AgentMetric) {
    const orgId = resolveOrgId(agent);
    if (!orgId) return;
    try {
      const res = await toggleAgentDirect(orgId, false);
      if (res.success) {
        await loadExtras();
        onDataChange();
      }
    } catch {
      toast('Erro na operacao de rakeback', 'error');
    }
  }

  async function handleApplyAll(agentName: string) {
    const rate = parseFloat(applyAllRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    const agentPlayers = getPlayersForAgent(agentName);
    setApplyingAll(true);
    try {
      for (const p of agentPlayers) {
        if (p.player_id) {
          await updatePlayerRate(p.player_id, rate, weekStart);
        }
      }
      setApplyAllAgent(null);
      setApplyAllRate('');
      onDataChange();
    } catch {
      toast('Erro na operacao de rakeback', 'error');
    } finally {
      setApplyingAll(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) return <SettlementSkeleton kpis={4} />;

  const taxLabel = `${fees.taxaApp || 0}%+${fees.taxaLiga || 0}%`;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Rakeback — {subclub.name}</h2>
        <p className="text-dark-400 text-sm">Distribuicao de rakeback por agente e jogador</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Rake Total"
          value={formatBRL(kpis.rakeTotal)}
          accentColor="bg-poker-500"
          valueColor="text-poker-400"
          subtitle={`${players.length} jogadores`}
        />
        <KpiCard
          label="Total Rakeback"
          value={formatBRL(kpis.totalRB)}
          accentColor="bg-yellow-500"
          valueColor="text-yellow-400"
          subtitle="Agentes + Diretos"
        />
        <KpiCard
          label="Taxas Liga"
          value={formatBRL(kpis.taxesOnRake)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          subtitle={`${taxLabel} sobre rake`}
        />
        <KpiCard
          label="Lucro Liquido"
          value={formatBRL(kpis.lucroLiquido)}
          accentColor={kpis.lucroLiquido >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          valueColor={kpis.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}
          subtitle="Rake - RB - Taxas"
          ring="ring-1 ring-emerald-700/30"
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setActiveSubTab('agencias')}
          role="tab"
          aria-selected={activeSubTab === 'agencias'}
          aria-label="Agencias"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
            activeSubTab === 'agencias'
              ? 'bg-poker-900/20 border-poker-500 text-poker-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
          }`}
        >
          Agencias
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{filteredNonDirect.length}</span>
        </button>
        <button
          onClick={() => setActiveSubTab('jogadores')}
          role="tab"
          aria-selected={activeSubTab === 'jogadores'}
          aria-label="Jogadores diretos"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
            activeSubTab === 'jogadores'
              ? 'bg-poker-900/20 border-poker-500 text-poker-400'
              : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
          }`}
        >
          Jogadores
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{filteredDirect.length}</span>
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar agente ou jogador..."
          aria-label="Buscar agente ou jogador"
          className="input w-full max-w-md"
        />
      </div>

      {/* Tab content */}
      {activeSubTab === 'agencias' ? (
        <AgenciasTab
          agents={filteredNonDirect}
          playersByAgent={playersByAgent}
          getPlayersForAgent={getPlayersForAgent}
          expandedAgents={expandedAgents}
          toggleAgent={toggleAgent}
          getAgentStatus={getAgentStatus}
          taxRate={taxRate}
          isDraft={isDraft}
          editingRate={editingRate}
          rateInput={rateInput}
          setRateInput={setRateInput}
          savingRate={savingRate}
          startEditRate={startEditRate}
          saveAgentRate={saveAgentRate}
          setEditingRate={setEditingRate}
          canEditRates={canEditRates}
        />
      ) : (
        <JogadoresTab
          agents={filteredDirect}
          allAgents={agents}
          orgs={orgs}
          directNameSet={directNameSet}
          orgByName={orgByName}
          playersByAgent={playersByAgent}
          getPlayersForAgent={getPlayersForAgent}
          expandedAgents={expandedAgents}
          toggleAgent={toggleAgent}
          taxRate={taxRate}
          isDraft={isDraft}
          editingRate={editingRate}
          rateInput={rateInput}
          setRateInput={setRateInput}
          savingRate={savingRate}
          startEditRate={startEditRate}
          savePlayerRate={savePlayerRate}
          setEditingRate={setEditingRate}
          directDropdown={directDropdown}
          setDirectDropdown={setDirectDropdown}
          handleMarkDirect={handleMarkDirect}
          handleRemoveDirect={handleRemoveDirect}
          applyAllAgent={applyAllAgent}
          setApplyAllAgent={setApplyAllAgent}
          applyAllRate={applyAllRate}
          setApplyAllRate={setApplyAllRate}
          applyingAll={applyingAll}
          handleApplyAll={handleApplyAll}
          resolveOrgId={resolveOrgId}
          canEditRates={canEditRates}
        />
      )}
    </div>
  );
}

// ─── Sub-tab: Agencias ──────────────────────────────────────────────

function AgenciasTab({
  agents,
  playersByAgent,
  getPlayersForAgent,
  expandedAgents,
  toggleAgent,
  getAgentStatus,
  taxRate,
  isDraft,
  editingRate,
  rateInput,
  setRateInput,
  savingRate,
  startEditRate,
  saveAgentRate,
  setEditingRate,
  canEditRates,
}: {
  agents: AgentMetric[];
  playersByAgent: Map<string, PlayerMetric[]>;
  getPlayersForAgent: (agentName: string) => PlayerMetric[];
  expandedAgents: Set<string>;
  toggleAgent: (id: string) => void;
  getAgentStatus: (a: AgentMetric) => string;
  taxRate: number;
  isDraft: boolean;
  editingRate: string | null;
  rateInput: string;
  setRateInput: (v: string) => void;
  savingRate: boolean;
  startEditRate: (id: string, rate: number) => void;
  saveAgentRate: (agent: AgentMetric) => void;
  setEditingRate: (v: string | null) => void;
  canEditRates: boolean;
}) {
  if (agents.length === 0) {
    return (
      <div className="card text-center py-12">
        <Percent className="w-8 h-8 text-dark-600 mx-auto mb-3" />
        <p className="text-dark-400">Nenhuma agencia (nao-direta) neste subclube</p>
      </div>
    );
  }

  // Totals
  let totalRake = 0,
    totalRB = 0,
    totalLucro = 0;
  for (const a of agents) {
    const rake = Number(a.rake_total_brl) || 0;
    const rb = Number(a.commission_brl) || 0;
    totalRake += rake;
    totalRB += rb;
    totalLucro += rake - rb - rake * taxRate;
  }

  return (
    <div>
      {/* Table header */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <div className="bg-dark-800/80 backdrop-blur-sm px-5 py-2 grid grid-cols-[1fr_120px_100px_120px_120px] text-[10px] text-dark-400 font-medium uppercase tracking-wider">
          <span>Agente</span>
          <span className="text-right">Rake</span>
          <span className="text-right">% RB Agente</span>
          <span className="text-right">RB Agente</span>
          <span className="text-right">Lucro Liq.</span>
        </div>

        {agents.map((agent) => {
          const isExpanded = expandedAgents.has(agent.id);
          const agentPlayers = getPlayersForAgent(agent.agent_name);
          const rake = Number(agent.rake_total_brl) || 0;
          const rbRate = Number(agent.rb_rate) || 0;
          const rbValue = Number(agent.commission_brl) || 0;
          const lucro = round2(rake - rbValue - rake * taxRate);
          const status = getAgentStatus(agent);
          const isEditing = editingRate === `agent-${agent.id}`;

          return (
            <div key={agent.id} className="border-t border-dark-800/50">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleAgent(agent.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') toggleAgent(agent.id);
                }}
                className="w-full grid grid-cols-[1fr_120px_100px_120px_120px] items-center px-5 py-3 hover:bg-dark-800/20 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2 text-left">
                  <span className={`text-dark-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  <span className="text-white font-semibold text-sm">{agent.agent_name}</span>
                  <span className="text-dark-500 text-xs bg-dark-800 px-1.5 py-0.5 rounded-full">
                    {agent.player_count}
                  </span>
                  <StatusBadge status={status} />
                </div>
                <span className="text-right font-mono text-sm text-dark-200">{formatBRL(rake)}</span>
                <div className="text-right" onClick={(e) => e.stopPropagation()}>
                  {isEditing ? (
                    <span className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={rateInput}
                        onChange={(e) => setRateInput(e.target.value)}
                        aria-label={`Taxa de rakeback do agente ${agent.agent_name}`}
                        className="input w-16 text-right text-xs font-mono py-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveAgentRate(agent);
                          if (e.key === 'Escape') setEditingRate(null);
                        }}
                      />
                      <button
                        onClick={() => saveAgentRate(agent)}
                        disabled={savingRate}
                        aria-label={`Salvar taxa de rakeback do agente ${agent.agent_name}`}
                        className="text-poker-400 text-xs hover:text-poker-300"
                      >
                        ✓
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center justify-end gap-1">
                      <span className={`font-mono text-sm ${rbRate > 0 ? 'text-yellow-400' : 'text-dark-500'}`}>
                        {rbRate}%
                      </span>
                      {isDraft && canEditRates && (
                        <button
                          onClick={() => startEditRate(`agent-${agent.id}`, rbRate)}
                          aria-label={`Editar taxa de rakeback do agente ${agent.agent_name}`}
                          className="text-dark-400 hover:text-yellow-400 text-sm ml-1"
                          title="Editar rate"
                        >
                          ✏
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <span className={`text-right font-mono text-sm ${rbValue > 0 ? 'text-yellow-400' : 'text-dark-500'}`}>
                  {rbValue > 0 ? formatBRL(rbValue) : '—'}
                </span>
                <span
                  className={`text-right font-mono text-sm font-semibold ${lucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}
                >
                  {formatBRL(lucro)}
                </span>
              </div>

              {/* Expanded: player table */}
              {isExpanded && (
                <div className="border-t border-dark-700/50 bg-dark-900/30">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-dark-800/50">
                        <th className="px-8 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Jogador</th>
                        <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">ID</th>
                        <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rake</th>
                        <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">RB %</th>
                        <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">RB Valor</th>
                        <th className="px-5 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800/30">
                      {agentPlayers
                        .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''))
                        .map((p, i) => (
                          <tr key={i} className="hover:bg-dark-800/20 transition-colors">
                            <td className="px-8 py-1.5 text-dark-200">{p.nickname}</td>
                            <td className="px-3 py-1.5 text-dark-500 text-xs font-mono">{p.external_player_id}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-dark-300">
                              {formatBRL(Number(p.rake_total_brl))}
                            </td>
                            <td className="px-3 py-1.5 text-right text-dark-400">
                              {Number(p.rb_rate) > 0 ? `${p.rb_rate}%` : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-dark-300">
                              {Number(p.rb_value_brl) > 0 ? formatBRL(Number(p.rb_value_brl)) : '—'}
                            </td>
                            <td
                              className={`px-5 py-1.5 text-right font-mono ${Number(p.resultado_brl) < 0 ? 'text-red-400' : 'text-poker-400'}`}
                            >
                              {formatBRL(Number(p.resultado_brl))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Totals row */}
        <div className="border-t-2 border-dark-700 grid grid-cols-[1fr_120px_100px_120px_120px] items-center px-5 py-3 bg-dark-900">
          <span className="text-xs font-extrabold text-amber-400">
            TOTAL
            <span className="text-dark-500 text-[10px] font-normal ml-2">{agents.length} agencias</span>
          </span>
          <span className="text-right font-mono text-xs font-extrabold text-dark-200">{formatBRL(round2(totalRake))}</span>
          <span className="text-right text-dark-500">—</span>
          <span className="text-right font-mono text-xs font-extrabold text-yellow-400">{formatBRL(round2(totalRB))}</span>
          <span
            className={`text-right font-mono text-xs font-extrabold ${totalLucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}
          >
            {formatBRL(round2(totalLucro))}
          </span>
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-tab: Jogadores (Diretos) ───────────────────────────────────

function JogadoresTab({
  agents,
  allAgents,
  orgs,
  directNameSet,
  orgByName,
  playersByAgent,
  getPlayersForAgent,
  expandedAgents,
  toggleAgent,
  taxRate,
  isDraft,
  editingRate,
  rateInput,
  setRateInput,
  savingRate,
  startEditRate,
  savePlayerRate,
  setEditingRate,
  directDropdown,
  setDirectDropdown,
  handleMarkDirect,
  handleRemoveDirect,
  applyAllAgent,
  setApplyAllAgent,
  applyAllRate,
  setApplyAllRate,
  applyingAll,
  handleApplyAll,
  resolveOrgId,
  canEditRates,
}: {
  agents: AgentMetric[];
  allAgents: AgentMetric[];
  orgs: OrgData[];
  directNameSet: Set<string>;
  orgByName: Map<string, OrgData>;
  playersByAgent: Map<string, PlayerMetric[]>;
  getPlayersForAgent: (agentName: string) => PlayerMetric[];
  expandedAgents: Set<string>;
  toggleAgent: (id: string) => void;
  taxRate: number;
  isDraft: boolean;
  editingRate: string | null;
  rateInput: string;
  setRateInput: (v: string) => void;
  savingRate: boolean;
  startEditRate: (id: string, rate: number) => void;
  savePlayerRate: (id: string) => void;
  setEditingRate: (v: string | null) => void;
  directDropdown: string;
  setDirectDropdown: (v: string) => void;
  handleMarkDirect: () => void;
  handleRemoveDirect: (agent: AgentMetric) => void;
  applyAllAgent: string | null;
  setApplyAllAgent: (v: string | null) => void;
  applyAllRate: string;
  setApplyAllRate: (v: string) => void;
  applyingAll: boolean;
  handleApplyAll: (agentName: string) => void;
  resolveOrgId: (agent: AgentMetric) => string | null;
  canEditRates: boolean;
}) {
  // Available agents to mark as direct — resolve org ID by agent_id OR name
  const availableForDirect = useMemo(() => {
    const result: { agent: AgentMetric; orgId: string }[] = [];
    for (const a of allAgents) {
      const orgId = a.agent_id || orgByName.get(a.agent_name.toLowerCase())?.id;
      if (orgId && !directNameSet.has(a.agent_name.toLowerCase())) {
        result.push({ agent: a, orgId });
      }
    }
    return result;
  }, [allAgents, orgByName, directNameSet]);

  return (
    <div>
      {/* Define direct agencies */}
      <div className="card mb-6 border-dark-700/50">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">Definir Agencias Diretas</h4>
        </div>
        {availableForDirect.length > 0 ? (
          <div className="flex items-center gap-3">
            <select
              value={directDropdown}
              onChange={(e) => setDirectDropdown(e.target.value)}
              aria-label="Selecionar agencia para marcar como direta"
              className="input flex-1 max-w-sm text-sm"
              disabled={!isDraft}
            >
              <option value="">Selecionar agencia...</option>
              {availableForDirect.map(({ agent, orgId }) => (
                <option key={orgId} value={orgId}>
                  {agent.agent_name}
                </option>
              ))}
            </select>
            <button
              onClick={handleMarkDirect}
              disabled={!isDraft || !directDropdown}
              aria-label="Marcar agencia como direta"
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              + Marcar como Direto
            </button>
          </div>
        ) : (
          <p className="text-sm text-dark-500">
            {orgs.length === 0
              ? 'Nenhum agente cadastrado como organizacao. Cadastre agentes na pagina Estrutura.'
              : 'Todas as agencias ja foram marcadas como diretas ou nao ha agentes vinculados.'}
          </p>
        )}
        <p className="text-xs text-dark-500 mt-2">
          Agencias diretas sao fechadas individualmente — cada jogador com seu proprio % de rakeback.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">Nenhuma agencia direta definida</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
          {/* Table header */}
          <div className="bg-dark-800/80 backdrop-blur-sm px-5 py-2 grid grid-cols-[1fr_120px_110px_120px_120px] text-[10px] text-dark-400 font-medium uppercase tracking-wider">
            <span>Agencia / Jogador</span>
            <span className="text-right">Rake</span>
            <span className="text-right">% RB Jogador</span>
            <span className="text-right">RB Jogador</span>
            <span className="text-right">Lucro Liq.</span>
          </div>

          {agents.map((agent) => {
            const isExpanded = expandedAgents.has(agent.id);
            const agentPlayers = getPlayersForAgent(agent.agent_name);
            const rake = Number(agent.rake_total_brl) || 0;
            const totalPlayerRB = round2(agentPlayers.reduce((s, p) => s + Number(p.rb_value_brl || 0), 0));
            const lucro = round2(rake - totalPlayerRB - rake * taxRate);
            const isApplyAll = applyAllAgent === agent.agent_name;

            return (
              <div key={agent.id} className="border-t border-dark-800/50">
                {/* Agent header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleAgent(agent.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggleAgent(agent.id);
                  }}
                  className="w-full grid grid-cols-[1fr_120px_110px_120px_120px] items-center px-5 py-3 hover:bg-dark-800/20 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 text-left">
                    <span className={`text-dark-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span className="text-white font-semibold text-sm">{agent.agent_name}</span>
                    <span className="text-dark-500 text-xs bg-dark-800 px-1.5 py-0.5 rounded-full">
                      {agent.player_count}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                      DIRETO
                    </span>
                    {isDraft && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveDirect(agent);
                        }}
                        aria-label={`Remover agencia direta ${agent.agent_name}`}
                        className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                        title="Remover direto"
                      >
                        ✕ Remover
                      </button>
                    )}
                  </div>
                  <span className="text-right font-mono text-sm text-dark-200">{formatBRL(rake)}</span>
                  <span className="text-right text-sm text-dark-400 italic">Individual</span>
                  <span className="text-right font-mono text-sm text-yellow-400">{formatBRL(totalPlayerRB)}</span>
                  <span
                    className={`text-right font-mono text-sm font-semibold ${lucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}
                  >
                    {formatBRL(lucro)}
                  </span>
                </div>

                {/* Expanded: player list */}
                {isExpanded && (
                  <div className="border-t border-dark-700/50 bg-dark-900/30">
                    {/* Apply all */}
                    {isDraft && (
                      <div className="px-8 py-2 flex items-center justify-between border-b border-dark-800/30">
                        <span className="text-[10px] text-dark-500 uppercase tracking-wider">
                          Jogadores diretos de {agent.agent_name}
                        </span>
                        {isApplyAll ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="100"
                              value={applyAllRate}
                              onChange={(e) => setApplyAllRate(e.target.value)}
                              className="input w-16 text-xs text-right font-mono py-1"
                              placeholder="%"
                              autoFocus
                            />
                            <button
                              onClick={() => handleApplyAll(agent.agent_name)}
                              disabled={applyingAll}
                              className="btn-primary text-xs px-3 py-1"
                            >
                              {applyingAll ? '...' : 'Aplicar'}
                            </button>
                            <button onClick={() => setApplyAllAgent(null)} className="text-dark-500 text-xs">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setApplyAllAgent(agent.agent_name);
                            }}
                            className="text-xs text-dark-400 hover:text-dark-200 border border-dark-700 rounded px-2 py-1 transition-colors"
                          >
                            Aplicar % a todos
                          </button>
                        )}
                      </div>
                    )}

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-dark-800/50">
                          <th className="px-8 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Jogador</th>
                          <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rake</th>
                          <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">% RB Jogador</th>
                          <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">RB Jogador</th>
                          <th className="px-5 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Lucro Liq.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-800/30">
                        {agentPlayers
                          .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''))
                          .map((p, i) => {
                            const pRake = Number(p.rake_total_brl) || 0;
                            const pRBRate = Number(p.rb_rate) || 0;
                            const pRBValue = Number(p.rb_value_brl) || 0;
                            const pLucro = round2(pRake - pRBValue - pRake * taxRate);
                            const isEditingPlayer = editingRate === `player-${p.player_id}`;

                            return (
                              <tr key={i} className="hover:bg-dark-800/20 transition-colors">
                                <td className="px-8 py-1.5">
                                  <span className="text-dark-200 font-medium">{p.nickname}</span>
                                  <span className="text-dark-600 text-xs ml-2">#{p.external_player_id}</span>
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-dark-300">{formatBRL(pRake)}</td>
                                <td className="px-3 py-1.5 text-right">
                                  {isEditingPlayer ? (
                                    <span className="flex items-center justify-end gap-1">
                                      <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        max="100"
                                        value={rateInput}
                                        onChange={(e) => setRateInput(e.target.value)}
                                        aria-label={`Taxa de rakeback do jogador ${p.nickname || p.external_player_id}`}
                                        className="input w-14 text-right text-xs font-mono py-0.5"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') savePlayerRate(p.player_id!);
                                          if (e.key === 'Escape') setEditingRate(null);
                                        }}
                                      />
                                      <button
                                        onClick={() => savePlayerRate(p.player_id!)}
                                        disabled={savingRate}
                                        aria-label={`Salvar taxa de rakeback do jogador ${p.nickname || p.external_player_id}`}
                                        className="text-poker-400 text-xs"
                                      >
                                        ✓
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="flex items-center justify-end gap-1">
                                      <span
                                        className={`font-mono text-sm ${pRBRate > 0 ? 'text-yellow-400' : 'text-dark-500'}`}
                                      >
                                        {pRBRate}%
                                      </span>
                                      {isDraft && canEditRates && (
                                        <button
                                          onClick={() => startEditRate(`player-${p.player_id}`, pRBRate)}
                                          aria-label={`Editar taxa de rakeback do jogador ${p.nickname || p.external_player_id}`}
                                          className="text-dark-600 hover:text-dark-300 text-xs ml-0.5"
                                        >
                                          Editar
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right font-mono ${pRBValue > 0 ? 'text-yellow-400' : 'text-dark-500'}`}
                                >
                                  {pRBValue > 0 ? formatBRL(pRBValue) : '—'}
                                </td>
                                <td
                                  className={`px-5 py-1.5 text-right font-mono ${pLucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}
                                >
                                  {formatBRL(pLucro)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Totals row */}
          {(() => {
            let totalRake = 0,
              totalRB = 0,
              totalLucro = 0;
            for (const a of agents) {
              const rake = Number(a.rake_total_brl) || 0;
              const agentPlayers = getPlayersForAgent(a.agent_name);
              const playerRB = agentPlayers.reduce((s, p) => s + Number(p.rb_value_brl || 0), 0);
              totalRake += rake;
              totalRB += playerRB;
              totalLucro += rake - playerRB - rake * taxRate;
            }
            return (
              <div className="border-t-2 border-dark-700 grid grid-cols-[1fr_120px_110px_120px_120px] items-center px-5 py-3 bg-dark-900">
                <span className="text-xs font-extrabold text-amber-400">
                  TOTAL
                  <span className="text-dark-500 text-[10px] font-normal ml-2">{agents.length} agencias</span>
                </span>
                <span className="text-right font-mono text-xs font-extrabold text-dark-200">
                  {formatBRL(round2(totalRake))}
                </span>
                <span className="text-right text-dark-500">—</span>
                <span className="text-right font-mono text-xs font-extrabold text-yellow-400">
                  {formatBRL(round2(totalRB))}
                </span>
                <span
                  className={`text-right font-mono text-xs font-extrabold ${totalLucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}
                >
                  {formatBRL(round2(totalLucro))}
                </span>
              </div>
            );
          })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmado: 'bg-green-500/20 text-green-400 border-green-500/40',
    parcial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    pendente: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  const labels: Record<string, string> = {
    confirmado: 'confirmado',
    parcial: 'parcial',
    pendente: 'pendente',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles.pendente}`}>
      {labels[status] || status}
    </span>
  );
}
