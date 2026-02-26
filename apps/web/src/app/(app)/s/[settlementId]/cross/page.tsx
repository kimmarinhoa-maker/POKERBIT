'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSettlementFull, formatBRL } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { AgentMetric } from '@/types/settlement';
import WeekSelector from '@/components/WeekSelector';
import Spinner from '@/components/Spinner';
import KpiCard from '@/components/ui/KpiCard';

// ─── Types ──────────────────────────────────────────────────────────

interface CrossAgent {
  agent_name: string;
  agent_id: string | null;
  subclubs: string[];
  player_count: number;
  rake_total: number;
  ganhos_total: number;
  ggr_total: number;
  commission: number;
  resultado: number;
  is_direct: boolean;
}

type SortKey = 'name' | 'players' | 'rake' | 'resultado' | 'commission' | 'subclubs';
type SortDir = 'asc' | 'desc';

// ─── Helpers ────────────────────────────────────────────────────────

function clr(v: number): string {
  return v > 0.01 ? 'text-emerald-400' : v < -0.01 ? 'text-red-400' : 'text-dark-400';
}

// ─── Component ──────────────────────────────────────────────────────

export default function CrossClubPage() {
  const params = useParams();
  const router = useRouter();
  const settlementId = params.settlementId as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('resultado');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterSubclub, setFilterSubclub] = useState<string>('all');
  const [showMultiOnly, setShowMultiOnly] = useState(false);
  const [weekNotFound, setWeekNotFound] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettlementFull(settlementId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Erro ao carregar settlement');
      }
    } catch {
      toast('Erro de conexao com o servidor', 'error');
      setError('Erro de conexao com o servidor');
    } finally {
      setLoading(false);
    }
  }, [settlementId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Flatten and consolidate agents from all subclubs
  const { crossAgents, subclubNames } = useMemo(() => {
    if (!data?.subclubs) return { crossAgents: [], subclubNames: [] };

    const agentMap = new Map<string, CrossAgent>();
    const scNames: string[] = [];

    for (const sc of data.subclubs) {
      scNames.push(sc.name);
      for (const ag of (sc.agents || []) as AgentMetric[]) {
        const key = ag.agent_name;
        if (!agentMap.has(key)) {
          agentMap.set(key, {
            agent_name: ag.agent_name,
            agent_id: ag.agent_id,
            subclubs: [],
            player_count: 0,
            rake_total: 0,
            ganhos_total: 0,
            ggr_total: 0,
            commission: 0,
            resultado: 0,
            is_direct: !!ag.is_direct,
          });
        }
        const ca = agentMap.get(key)!;
        if (!ca.subclubs.includes(sc.name)) ca.subclubs.push(sc.name);
        ca.player_count += Number(ag.player_count) || 0;
        ca.rake_total += Number(ag.rake_total_brl) || 0;
        ca.ganhos_total += Number(ag.ganhos_total_brl) || 0;
        ca.ggr_total += Number(ag.ggr_total_brl) || 0;
        ca.commission += Number(ag.commission_brl) || 0;
        ca.resultado += Number(ag.resultado_brl) || 0;
      }
    }

    return { crossAgents: Array.from(agentMap.values()), subclubNames: scNames };
  }, [data]);

  // Filter
  const filteredAgents = useMemo(() => {
    return crossAgents.filter((a) => {
      if (searchTerm && !a.agent_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterSubclub !== 'all' && !a.subclubs.includes(filterSubclub)) return false;
      if (showMultiOnly && a.subclubs.length < 2) return false;
      return true;
    });
  }, [crossAgents, searchTerm, filterSubclub, showMultiOnly]);

  // Sort
  const sortedAgents = useMemo(() => {
    const sorted = [...filteredAgents];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.agent_name.localeCompare(b.agent_name);
          break;
        case 'players':
          cmp = a.player_count - b.player_count;
          break;
        case 'rake':
          cmp = a.rake_total - b.rake_total;
          break;
        case 'resultado':
          cmp = a.resultado - b.resultado;
          break;
        case 'commission':
          cmp = a.commission - b.commission;
          break;
        case 'subclubs':
          cmp = a.subclubs.length - b.subclubs.length;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [filteredAgents, sortKey, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredAgents.length;
    const multiClub = filteredAgents.filter((a) => a.subclubs.length > 1).length;
    const totalRake = filteredAgents.reduce((s, a) => s + a.rake_total, 0);
    const totalResultado = filteredAgents.reduce((s, a) => s + a.resultado, 0);
    const totalComission = filteredAgents.reduce((s, a) => s + a.commission, 0);
    const totalPlayers = filteredAgents.reduce((s, a) => s + a.player_count, 0);
    return { total, multiClub, totalRake, totalResultado, totalComission, totalPlayers };
  }, [filteredAgents]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' ▼' : ' ▲';
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[60vh]">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-dark-400 text-sm">Carregando dados cross-club...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="card text-center py-16">
          <p className="text-red-400 mb-4">{error || 'Dados nao encontrados'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-secondary text-sm">
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { settlement } = data;
  const weekEnd = (() => {
    const d = new Date(settlement.week_start + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-dark-900/80 border-b border-dark-700 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/s/${settlementId}`}
            className="text-dark-400 hover:text-dark-200 text-sm flex items-center gap-1 transition-colors"
          >
            ← Visao Geral
          </Link>
          <div className="h-4 w-px bg-dark-700" />
          <h2 className="text-lg font-bold text-white">Cross-Club</h2>
          <WeekSelector
            currentSettlementId={settlementId}
            weekStart={settlement.week_start}
            weekEnd={weekEnd}
            status={settlement.status}
            onNotFound={() => setWeekNotFound(true)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-dark-950/30">
        {weekNotFound ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Nenhum fechamento encontrado</h2>
            <p className="text-dark-400">Nao existe fechamento importado para o periodo selecionado.</p>
          </div>
        ) : (
          <>
            {/* Info banner */}
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-4 py-3 mb-5 text-sm text-dark-300">
              Visao consolidada de todos os agentes em todos os subclubes. Agentes com presenca em multiplos clubes sao
              destacados.
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              <KpiCard label="Agentes" value={String(kpis.total)} accentColor="bg-purple-500" />
              <KpiCard label="Jogadores" value={String(kpis.totalPlayers)} accentColor="bg-blue-500" />
              <KpiCard label="Multi-Club" value={String(kpis.multiClub)} accentColor="bg-amber-500" />
              <KpiCard label="Rake Total" value={formatBRL(kpis.totalRake)} accentColor="bg-poker-500" />
              <KpiCard label="Comissao RB" value={formatBRL(kpis.totalComission)} accentColor="bg-purple-500" />
              <KpiCard
                label="Resultado"
                value={formatBRL(kpis.totalResultado)}
                accentColor={kpis.totalResultado >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
                valueColor={clr(kpis.totalResultado)}
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  placeholder="Buscar agente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
                  aria-label="Buscar agente"
                />
              </div>
              <select
                value={filterSubclub}
                onChange={(e) => setFilterSubclub(e.target.value)}
                className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
                aria-label="Filtrar por subclube"
              >
                <option value="all">Todos os Subclubes</option>
                {subclubNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowMultiOnly(!showMultiOnly)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  showMultiOnly
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-dark-800 text-dark-300 border border-dark-700/50 hover:text-dark-200'
                }`}
                aria-pressed={showMultiOnly}
              >
                Multi-Club Only
              </button>
              <span className="text-dark-500 text-xs ml-auto">
                {sortedAgents.length} agente{sortedAgents.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Agent table */}
            {sortedAgents.length === 0 ? (
              <div className="card text-center py-16">
                <h3 className="text-xl font-bold text-white mb-2">Nenhum agente encontrado</h3>
                <p className="text-dark-400 text-sm">Ajuste os filtros ou importe dados</p>
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Agentes cross-club">
                    <thead>
                      <tr className="bg-dark-800/50">
                        <th
                          onClick={() => toggleSort('name')}
                          className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Agente{sortIcon('name')}
                        </th>
                        <th
                          onClick={() => toggleSort('subclubs')}
                          className="px-3 py-3 text-center font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={sortKey === 'subclubs' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Subclubes{sortIcon('subclubs')}
                        </th>
                        <th
                          onClick={() => toggleSort('players')}
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={sortKey === 'players' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Jogadores{sortIcon('players')}
                        </th>
                        <th
                          onClick={() => toggleSort('rake')}
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={sortKey === 'rake' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Rake{sortIcon('rake')}
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Ganhos</th>
                        <th
                          onClick={() => toggleSort('commission')}
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'commission' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                        >
                          Comissao RB{sortIcon('commission')}
                        </th>
                        <th
                          onClick={() => toggleSort('resultado')}
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'resultado' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                        >
                          Resultado{sortIcon('resultado')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800/50">
                      {sortedAgents.map((agent) => (
                        <tr key={agent.agent_name} className="hover:bg-dark-800/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{agent.agent_name}</span>
                              {agent.is_direct && (
                                <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">
                                  DIRETO
                                </span>
                              )}
                              {agent.subclubs.length > 1 && (
                                <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                                  MULTI
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {agent.subclubs.map((sc) => (
                                <span
                                  key={sc}
                                  className="text-[10px] bg-dark-700/50 text-dark-300 px-1.5 py-0.5 rounded"
                                >
                                  {sc}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-dark-200">{agent.player_count}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-dark-200">
                            {formatBRL(agent.rake_total)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono ${clr(agent.ganhos_total)}`}>
                            {formatBRL(agent.ganhos_total)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-purple-400">
                            {agent.commission > 0.01 ? formatBRL(agent.commission) : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-bold ${clr(agent.resultado)}`}>
                            {formatBRL(agent.resultado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Footer totals */}
                    <tfoot>
                      <tr className="bg-dark-800/30 border-t-2 border-dark-700">
                        <td className="px-4 py-3 font-bold text-dark-200">TOTAL</td>
                        <td className="px-3 py-3 text-center text-dark-400 text-xs">{subclubNames.length} clubs</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-dark-200">{kpis.totalPlayers}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-dark-200">
                          {formatBRL(kpis.totalRake)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono font-bold ${clr(filteredAgents.reduce((s, a) => s + a.ganhos_total, 0))}`}
                        >
                          {formatBRL(filteredAgents.reduce((s, a) => s + a.ganhos_total, 0))}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-purple-400">
                          {formatBRL(kpis.totalComission)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-bold ${clr(kpis.totalResultado)}`}>
                          {formatBRL(kpis.totalResultado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

