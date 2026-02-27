'use client';

import { useEffect, useState, useMemo } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { listSettlements, getSettlementFull, formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import Highlight from '@/components/ui/Highlight';
import { exportCsv } from '@/lib/exportCsv';
import EmptyState from '@/components/ui/EmptyState';
import { Download, Users } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
}

interface PlayerRow {
  nickname: string;
  external_player_id: string;
  agent_name: string;
  subclub: string;
  winnings: number;
  rake: number;
  ggr: number;
  rbRate: number;
  rbValue: number;
  resultado: number;
}

type SortKey = 'nickname' | 'resultado' | 'winnings' | 'rake' | 'subclub' | 'agent_name';
type SortDir = 'asc' | 'desc';

// ─── Page ───────────────────────────────────────────────────────────

export default function OverviewPage() {
  usePageTitle('Visao Geral');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFull, setLoadingFull] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSubclub, setFilterSubclub] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('resultado');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const { toast } = useToast();

  // Load settlements
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listSettlements();
        if (res.success) {
          const list = (res.data || []).sort((a: Settlement, b: Settlement) =>
            b.week_start.localeCompare(a.week_start),
          );
          setSettlements(list);
          if (list.length > 0) setSelectedId(list[0].id);
        } else {
          toast(res.error || 'Erro ao carregar semanas', 'error');
        }
      } catch {
        toast('Erro de conexao com o servidor', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  // Load full data
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoadingFull(true);
      try {
        const res = await getSettlementFull(selectedId);
        if (res.success && res.data?.subclubs) {
          const rows: PlayerRow[] = [];
          for (const sc of res.data.subclubs) {
            for (const p of sc.players || []) {
              rows.push({
                nickname: p.nickname || p.external_player_id || '—',
                external_player_id: p.external_player_id || '',
                agent_name: p.agent_name || 'SEM AGENTE',
                subclub: sc.name,
                winnings: Number(p.winnings_brl) || 0,
                rake: Number(p.rake_total_brl) || 0,
                ggr: Number(p.ggr_brl) || 0,
                rbRate: Number(p.rb_rate) || 0,
                rbValue: Number(p.rb_value_brl) || 0,
                resultado: Number(p.resultado_brl) || 0,
              });
            }
          }
          setAllPlayers(rows);
          setPage(0);
        }
      } catch {
        toast('Erro ao carregar jogadores', 'error');
      } finally {
        setLoadingFull(false);
      }
    })();
  }, [selectedId, toast]);

  // Unique subclubs
  const _subclubs = useMemo(() => [...new Set(allPlayers.map((p) => p.subclub))].sort(), [allPlayers]);

  // KPIs
  const kpis = useMemo(() => {
    const total = allPlayers.length;
    const totalWinnings = round2(allPlayers.reduce((s, p) => s + p.winnings, 0));
    const totalRake = round2(allPlayers.reduce((s, p) => s + p.rake, 0));
    const totalGGR = round2(allPlayers.reduce((s, p) => s + p.ggr, 0));
    const totalRB = round2(allPlayers.reduce((s, p) => s + p.rbValue, 0));
    const totalResult = round2(allPlayers.reduce((s, p) => s + p.resultado, 0));
    const winners = allPlayers.filter((p) => p.winnings > 0.01).length;
    const losers = allPlayers.filter((p) => p.winnings < -0.01).length;
    return { total, totalWinnings, totalRake, totalGGR, totalRB, totalResult, winners, losers };
  }, [allPlayers]);

  // Per-subclub stats
  const subclubStats = useMemo(() => {
    const map = new Map<string, { name: string; players: number; resultado: number; rake: number }>();
    for (const p of allPlayers) {
      if (!map.has(p.subclub)) map.set(p.subclub, { name: p.subclub, players: 0, resultado: 0, rake: 0 });
      const s = map.get(p.subclub)!;
      s.players++;
      s.resultado += p.resultado;
      s.rake += p.rake;
    }
    return Array.from(map.values()).sort((a, b) => b.resultado - a.resultado);
  }, [allPlayers]);

  // Filter + sort + paginate
  const filtered = useMemo(() => {
    let result = allPlayers;
    if (filterSubclub !== 'all') result = result.filter((p) => p.subclub === filterSubclub);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.nickname.toLowerCase().includes(s) ||
          p.external_player_id.toLowerCase().includes(s) ||
          p.agent_name.toLowerCase().includes(s),
      );
    }
    return result;
  }, [allPlayers, filterSubclub, search]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string') return mult * (va as string).localeCompare(vb as string);
      return mult * ((va as number) - (vb as number));
    });
  }, [filtered, sortKey, sortDir]);

  const paginated = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  function fmtDate(d?: string) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function clr(v: number): string {
    return v > 0.01 ? 'text-emerald-400' : v < -0.01 ? 'text-red-400' : 'text-dark-400';
  }

  const _selectedWeek = settlements.find((s) => s.id === selectedId);
  const sortIcon = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 skeleton-shimmer rounded w-48 mb-2" />
        <div className="h-4 skeleton-shimmer rounded w-72 mb-6" />
        <KpiSkeleton count={5} />
        <TableSkeleton columns={9} rows={10} />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Visao Geral</h2>
          <p className="text-dark-400 text-sm">Todos os jogadores de todos os subclubes</p>
        </div>

        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setPage(0);
          }}
          className="bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
          aria-label="Selecionar semana"
        >
          {settlements.map((s) => (
            <option key={s.id} value={s.id}>
              Semana {fmtDate(s.week_start)} — {s.status}
            </option>
          ))}
        </select>
      </div>

      {loadingFull ? (
        <div>
          <KpiSkeleton count={5} />
          <TableSkeleton columns={9} rows={10} />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <KpiCard label="Jogadores" value={kpis.total} accentColor="bg-blue-500" />
            <KpiCard label="Profit/Loss" value={formatBRL(kpis.totalWinnings)} accentColor={kpis.totalWinnings >= 0 ? 'bg-emerald-500' : 'bg-red-500'} valueColor={clr(kpis.totalWinnings)} />
            <KpiCard label="Rake Total" value={formatBRL(kpis.totalRake)} accentColor="bg-poker-500" valueColor="text-poker-400" />
            <KpiCard label="GGR Total" value={formatBRL(kpis.totalGGR)} accentColor="bg-yellow-500" valueColor="text-yellow-400" />
            <KpiCard label="Resultado" value={formatBRL(kpis.totalResult)} accentColor={kpis.totalResult >= 0 ? 'bg-amber-500' : 'bg-red-500'} valueColor={clr(kpis.totalResult)} />
          </div>

          {/* Subclub cards */}
          {subclubStats.length > 1 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {subclubStats.map((sc) => (
                <button
                  key={sc.name}
                  onClick={() => {
                    setFilterSubclub((f) => (f === sc.name ? 'all' : sc.name));
                    setPage(0);
                  }}
                  className={`rounded-lg p-3 border transition-colors text-left ${
                    filterSubclub === sc.name
                      ? 'bg-poker-900/30 border-poker-700/50'
                      : 'bg-dark-800/30 border-dark-700/40 hover:border-dark-600'
                  }`}
                >
                  <p className="text-xs font-bold text-dark-300 truncate">{sc.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-dark-500 text-[10px]">{sc.players} jog.</span>
                    <span className={`font-mono text-xs font-bold ${clr(sc.resultado)}`}>
                      {formatBRL(round2(sc.resultado))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="Buscar jogador, ID, agente..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
                aria-label="Buscar jogador, ID ou agente"
              />
            </div>
            {filterSubclub !== 'all' && (
              <button
                onClick={() => {
                  setFilterSubclub('all');
                  setPage(0);
                }}
                className="text-xs text-dark-400 hover:text-dark-200 transition-colors"
              >
                Limpar filtro ({filterSubclub})
              </button>
            )}
            <button
              onClick={() => {
                const headers = ['Jogador', 'ID', 'Agente', 'Subclube', 'P/L', 'Rake', 'RB%', 'RB Valor', 'Resultado'];
                const csvRows = sorted.map((p) => [p.nickname, p.external_player_id, p.agent_name, p.subclub, p.winnings, p.rake, p.rbRate, p.rbValue, p.resultado]);
                exportCsv('visao_geral', headers, csvRows);
              }}
              className="btn-ghost text-xs flex items-center gap-1.5 shrink-0"
            >
              <Download size={14} /><span className="hidden sm:inline">CSV</span>
            </button>
            <span className="text-xs text-dark-500 ml-auto">
              {sorted.length} jogadores
              {totalPages > 1 && ` — Pag. ${page + 1}/${totalPages}`}
            </span>
          </div>

          {/* Table */}
          {allPlayers.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="Nenhum jogador" description="Selecione uma semana com dados importados" />
            </div>
          ) : (
            <>
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-sm data-table" aria-label="Visao geral dos jogadores">
                    <thead>
                      <tr className="bg-dark-800/50">
                        <th
                          className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('nickname')}
                          role="columnheader"
                          aria-sort={sortKey === 'nickname' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Jogador{sortIcon('nickname')}
                        </th>
                        <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">ID</th>
                        <th
                          className="px-3 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('agent_name')}
                          role="columnheader"
                          aria-sort={
                            sortKey === 'agent_name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                        >
                          Agente{sortIcon('agent_name')}
                        </th>
                        <th
                          className="px-3 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('subclub')}
                          role="columnheader"
                          aria-sort={sortKey === 'subclub' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Subclube{sortIcon('subclub')}
                        </th>
                        <th
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('winnings')}
                          role="columnheader"
                          aria-sort={sortKey === 'winnings' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          P/L{sortIcon('winnings')}
                        </th>
                        <th
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('rake')}
                          role="columnheader"
                          aria-sort={sortKey === 'rake' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          Rake{sortIcon('rake')}
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">RB%</th>
                        <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">RB Valor</th>
                        <th
                          className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200"
                          onClick={() => handleSort('resultado')}
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
                      {paginated.map((p, i) => (
                        <tr
                          key={`${p.external_player_id}-${p.subclub}-${i}`}
                        >
                          <td className="px-4 py-2 text-white font-medium text-sm"><Highlight text={p.nickname} query={search} /></td>
                          <td className="px-3 py-2 text-dark-500 text-[10px] font-mono">
                            {p.external_player_id || '—'}
                          </td>
                          <td className="px-3 py-2 text-dark-300 text-xs"><Highlight text={p.agent_name} query={search} /></td>
                          <td className="px-3 py-2">
                            <span className="text-xs bg-dark-700/50 text-dark-300 px-2 py-0.5 rounded">
                              {p.subclub}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${clr(p.winnings)}`}>
                            {formatBRL(p.winnings)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-dark-300">{formatBRL(p.rake)}</td>
                          <td className="px-3 py-2 text-right text-dark-400 text-xs">
                            {p.rbRate > 0 ? `${p.rbRate}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-dark-300">
                            {p.rbValue > 0 ? formatBRL(p.rbValue) : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${clr(p.resultado)}`}>
                            {formatBRL(p.resultado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals footer */}
                    {sorted.length > 0 && (
                      <tfoot className="sticky bottom-0 z-10">
                        <tr className="bg-dark-900/95 backdrop-blur-sm font-semibold border-t-2 border-dark-600">
                          <td className="px-4 py-3 text-white" colSpan={4}>
                            TOTAL ({sorted.length} jogadores)
                          </td>
                          <td className={`px-3 py-3 text-right font-mono ${clr(round2(sorted.reduce((s, p) => s + p.winnings, 0)))}`}>
                            {formatBRL(round2(sorted.reduce((s, p) => s + p.winnings, 0)))}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-dark-200">{formatBRL(round2(sorted.reduce((s, p) => s + p.rake, 0)))}</td>
                          <td className="px-3 py-3 text-right text-dark-400 text-xs">—</td>
                          <td className="px-3 py-3 text-right font-mono text-dark-200">{formatBRL(round2(sorted.reduce((s, p) => s + p.rbValue, 0)))}</td>
                          <td className={`px-3 py-3 text-right font-mono font-bold ${clr(round2(sorted.reduce((s, p) => s + p.resultado, 0)))}`}>
                            {formatBRL(round2(sorted.reduce((s, p) => s + p.resultado, 0)))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-dark-300 hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-dark-500">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-dark-300 hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Proximo →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
