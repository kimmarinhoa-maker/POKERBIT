'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  listOrganizations,
  listLedger,
  toggleAgentDirect,
  syncSettlementAgents,
  syncSettlementRates,
  formatBRL,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
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
  const agents = useMemo(() => subclub.agents || [], [subclub.agents]);
  const players = useMemo(() => subclub.players || [], [subclub.players]);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'agencias' | 'jogadores'>('agencias');
  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [directDropdown, setDirectDropdown] = useState('');
  const mountedRef = useRef(true);
  const hasSyncedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Load orgs (for is_direct) and ledger (for badge status)
  const loadExtras = useCallback(async () => {
    setLoading(true);
    try {
      // Sync runs once per mount, in parallel with data fetch (non-blocking)
      const needsSync = isDraft && !hasSyncedRef.current;
      if (needsSync) hasSyncedRef.current = true;

      const syncPromise = needsSync
        ? Promise.all([
            syncSettlementAgents(settlementId).catch(() => null),
            syncSettlementRates(settlementId).catch(() => null),
          ])
        : Promise.resolve(null);

      // Data fetch runs in parallel with sync
      const [orgsRes, ledgerRes] = await Promise.all([listOrganizations('AGENT'), listLedger(weekStart)]);
      if (!mountedRef.current) return;
      if (orgsRes.success) setOrgs(orgsRes.data || []);
      if (ledgerRes.success) setLedgerEntries(ledgerRes.data || []);

      // Check sync result in background — reload parent if rates changed
      if (needsSync) {
        syncPromise.then((results) => {
          if (!mountedRef.current || !results) return;
          const syncResult = results[1];
          if (syncResult?.success && (syncResult.data?.agentsUpdated > 0 || syncResult.data?.playersUpdated > 0)) {
            onDataChange();
          }
        });
      }
    } catch {
      if (!mountedRef.current) return;
      toast('Erro na operacao de rakeback', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, settlementId, isDraft, toast]);

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
  const getPlayersForAgent = useCallback((agentName: string): PlayerMetric[] => {
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
  }, [playersByAgent]);

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

  // Count players inside direct agents for badge (using backend annotation)
  const directPlayerCount = useMemo(() => {
    return players.filter(
      (p) => p.agent_is_direct || directNameSet.has((p.agent_name || '').toLowerCase()),
    ).length;
  }, [players, directNameSet]);

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
  }, [nonDirectAgents, search, getPlayersForAgent]);

  const _filteredDirect = useMemo(() => {
    if (!search.trim()) return directAgents;
    const q = search.toLowerCase();
    return directAgents.filter((a) => {
      if (a.agent_name.toLowerCase().includes(q)) return true;
      const agentPlayers = getPlayersForAgent(a.agent_name);
      return agentPlayers.some(
        (p) => (p.nickname || '').toLowerCase().includes(q) || (p.external_player_id || '').includes(q),
      );
    });
  }, [directAgents, search, getPlayersForAgent]);

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
  }, [players, nonDirectAgents, directAgents, getPlayersForAgent, taxRate]);

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

  async function _handleMarkDirect() {
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

  async function _handleRemoveDirect(agent: AgentMetric) {
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
          tooltip={`Soma do rake de todos jogadores = ${formatBRL(kpis.rakeTotal)}`}
        />
        <KpiCard
          label="Total Rakeback"
          value={formatBRL(kpis.totalRB)}
          accentColor="bg-yellow-500"
          valueColor="text-yellow-400"
          subtitle="Agentes + Diretos"
          tooltip={`Soma do RB pago (agentes + diretos) = ${formatBRL(kpis.totalRB)}`}
        />
        <KpiCard
          label="Taxas Liga"
          value={formatBRL(kpis.taxesOnRake)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          subtitle={`${taxLabel} sobre rake`}
          tooltip={`taxas = rake × (${taxLabel}) = ${formatBRL(kpis.rakeTotal)} × ${taxLabel} = ${formatBRL(kpis.taxesOnRake)}`}
        />
        <KpiCard
          label="Lucro Liquido"
          value={formatBRL(kpis.lucroLiquido)}
          accentColor={kpis.lucroLiquido >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          valueColor={kpis.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}
          subtitle="Rake - RB - Taxas"
          ring="ring-1 ring-emerald-700/30"
          tooltip={`lucro = rake - rb - taxas = ${formatBRL(kpis.rakeTotal)} - ${formatBRL(kpis.totalRB)} - ${formatBRL(kpis.taxesOnRake)}`}
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
          <span className="text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{directPlayerCount}</span>
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
        />
      ) : (
        <JogadoresTab
          agents={directAgents}
          getPlayersForAgent={getPlayersForAgent}
          search={search}
          taxRate={taxRate}
        />
      )}
    </div>
  );
}

// ─── Sub-tab: Agencias ──────────────────────────────────────────────

function AgenciasTab({
  agents,
  playersByAgent: _playersByAgent,
  getPlayersForAgent,
  expandedAgents,
  toggleAgent,
  getAgentStatus,
  taxRate,
}: {
  agents: AgentMetric[];
  playersByAgent: Map<string, PlayerMetric[]>;
  getPlayersForAgent: (agentName: string) => PlayerMetric[];
  expandedAgents: Set<string>;
  toggleAgent: (id: string) => void;
  getAgentStatus: (a: AgentMetric) => string;
  taxRate: number;
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
                <span className={`text-right font-mono text-sm ${rbRate > 0 ? 'text-yellow-400' : 'text-dark-500'}`}>
                  {rbRate}%
                </span>
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
                  <table className="w-full text-xs data-table">
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
  getPlayersForAgent,
  search,
  taxRate,
}: {
  agents: AgentMetric[];
  getPlayersForAgent: (agentName: string) => PlayerMetric[];
  search: string;
  taxRate: number;
}) {
  // Flatten all direct players into a single sorted list, filtered by search
  const allDirectPlayers = useMemo(() => {
    const list: (PlayerMetric & { _agentName: string })[] = [];
    for (const agent of agents) {
      const agentPlayers = getPlayersForAgent(agent.agent_name);
      for (const p of agentPlayers) {
        list.push({ ...p, _agentName: agent.agent_name });
      }
    }
    list.sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''));

    // Filter by search at the player level
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        (p.nickname || '').toLowerCase().includes(q) ||
        (p.external_player_id || '').toLowerCase().includes(q) ||
        (p._agentName || '').toLowerCase().includes(q),
    );
  }, [agents, getPlayersForAgent, search]);

  // Totals
  const totals = useMemo(() => {
    let totalRake = 0, totalRB = 0, totalLucro = 0;
    for (const p of allDirectPlayers) {
      const pRake = Number(p.rake_total_brl) || 0;
      const pRBValue = Number(p.rb_value_brl) || 0;
      totalRake += pRake;
      totalRB += pRBValue;
      totalLucro += pRake - pRBValue - pRake * taxRate;
    }
    return { totalRake: round2(totalRake), totalRB: round2(totalRB), totalLucro: round2(totalLucro) };
  }, [allDirectPlayers, taxRate]);

  return (
    <div>
      {allDirectPlayers.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">Nenhum jogador direto neste subclube</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
          {/* Table */}
          <table className="w-full text-xs data-table">
            <thead>
              <tr className="bg-dark-800/50">
                <th className="px-5 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Jogador</th>
                <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Agencia</th>
                <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Rake</th>
                <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">% RB</th>
                <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">RB Valor</th>
                <th className="px-5 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Lucro Liq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30">
              {allDirectPlayers.map((p, i) => {
                const pRake = Number(p.rake_total_brl) || 0;
                const pRBRate = Number(p.rb_rate) || 0;
                const pRBValue = Number(p.rb_value_brl) || 0;
                const pLucro = round2(pRake - pRBValue - pRake * taxRate);

                return (
                  <tr key={`${p.player_id}-${i}`} className="hover:bg-dark-800/20 transition-colors">
                    <td className="px-5 py-2">
                      <span className="text-white font-medium">{p.nickname}</span>
                      <span className="text-dark-600 text-[11px] font-mono ml-2">#{p.external_player_id}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-dark-400 text-xs">{p._agentName || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-dark-300">{formatBRL(pRake)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-mono text-sm ${pRBRate > 0 ? 'text-yellow-400' : 'text-dark-500'}`}>
                        {pRBRate}%
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${pRBValue > 0 ? 'text-yellow-400' : 'text-dark-500'}`}>
                      {pRBValue > 0 ? formatBRL(pRBValue) : '—'}
                    </td>
                    <td className={`px-5 py-2 text-right font-mono font-semibold ${pLucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                      {formatBRL(pLucro)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr className="border-t-2 border-dark-700 bg-dark-900">
                <td className="px-5 py-3 text-xs font-extrabold text-amber-400">
                  TOTAL
                  <span className="text-dark-500 text-[10px] font-normal ml-2">{allDirectPlayers.length} jogadores</span>
                </td>
                <td />
                <td className="px-3 py-3 text-right font-mono text-xs font-extrabold text-dark-200">
                  {formatBRL(totals.totalRake)}
                </td>
                <td className="px-3 py-3 text-right text-dark-500">—</td>
                <td className="px-3 py-3 text-right font-mono text-xs font-extrabold text-yellow-400">
                  {formatBRL(totals.totalRB)}
                </td>
                <td className={`px-5 py-3 text-right font-mono text-xs font-extrabold ${totals.totalLucro >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                  {formatBRL(totals.totalLucro)}
                </td>
              </tr>
            </tfoot>
          </table>
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
