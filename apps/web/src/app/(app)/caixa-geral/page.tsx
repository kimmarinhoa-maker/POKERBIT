'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { listSettlements, listLedger, getSettlementFull, formatBRL } from '@/lib/api';
import { round2, fmtDateTime } from '@/lib/formatters';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import { LedgerEntry } from '@/types/settlement';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import Highlight from '@/components/ui/Highlight';
import EmptyState from '@/components/ui/EmptyState';
import { Receipt, Building2 } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
  platform?: string;
  club_name?: string;
  club_external_id?: string;
}

interface WeekGroup {
  week_start: string;
  settlements: Settlement[];
}

interface ClubData {
  settlementId: string;
  clubName: string;
  platform: string;
  status: string;
  rake: number;
  ggr: number;
  ganhos: number;
  totalTaxas: number;
  rbTotal: number;
  acertoLiga: number;
  playerCount: number;
  agentCount: number;
  subclubCount: number;
}

type FilterDir = 'all' | 'IN' | 'OUT';
type GroupBy = 'none' | 'entity' | 'method' | 'source';

// ─── Page ───────────────────────────────────────────────────────────

export default function CaixaGeralPage() {
  usePageTitle('Caixa Geral');
  const [weekGroups, setWeekGroups] = useState<WeekGroup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [clubsData, setClubsData] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [filterDir, setFilterDir] = useState<FilterDir>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('entity');
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const hasMountedRef = useRef(false);

  // Load settlements and group by week
  const loadSettlements = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const res = await listSettlements();
      if (signal?.cancelled) return;
      if (res.success) {
        const all: Settlement[] = (res.data || []).sort((a: Settlement, b: Settlement) =>
          b.week_start.localeCompare(a.week_start),
        );

        // Group by week_start
        const groupMap = new Map<string, Settlement[]>();
        for (const s of all) {
          if (!groupMap.has(s.week_start)) groupMap.set(s.week_start, []);
          groupMap.get(s.week_start)!.push(s);
        }

        const groups: WeekGroup[] = Array.from(groupMap.entries())
          .map(([week_start, settlements]) => ({ week_start, settlements }))
          .sort((a, b) => b.week_start.localeCompare(a.week_start));

        setWeekGroups(groups);
        if (groups.length > 0) setSelectedWeek(groups[0].week_start);
      } else {
        toast(res.error || 'Erro ao carregar semanas', 'error');
      }
    } catch {
      if (signal?.cancelled) return;
      toast('Erro de conexao com o servidor', 'error');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    const signal = { cancelled: false };
    loadSettlements(signal);
    return () => { signal.cancelled = true; };
  }, [loadSettlements]);

  // Load ALL settlement data for the selected week
  const currentGroup = weekGroups.find((g) => g.week_start === selectedWeek);
  useEffect(() => {
    if (!currentGroup) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      setClubsData([]);
      try {
        // Fetch ledger + all settlement fulls in parallel
        const promises: Promise<any>[] = [
          listLedger(currentGroup.week_start),
          ...currentGroup.settlements.map((s) => getSettlementFull(s.id)),
        ];
        const results = await Promise.all(promises);
        if (cancelled) return;

        // First result is ledger
        const ledgerRes = results[0];
        if (ledgerRes.success) setEntries(ledgerRes.data || []);

        // Remaining results are settlement fulls
        const clubs: ClubData[] = [];
        for (let i = 1; i < results.length; i++) {
          const fullRes = results[i];
          const s = currentGroup.settlements[i - 1];
          if (!fullRes.success) continue;

          const dt = fullRes.data.dashboardTotals || {};
          const subclubs = fullRes.data.subclubs || [];
          const settlement = fullRes.data.settlement || {};
          const org = settlement.organizations;
          const platform = settlement.platform || s.platform || (org?.metadata as any)?.platform || '';
          const clubName = org?.name || s.club_name || `Clube ${i}`;

          clubs.push({
            settlementId: s.id,
            clubName,
            platform,
            status: s.status,
            rake: Number(dt.rake ?? 0),
            ggr: Number(dt.ggr ?? 0),
            ganhos: Number(dt.ganhos ?? 0),
            totalTaxas: Number(dt.totalTaxas ?? 0),
            rbTotal: Number(dt.rbTotal ?? 0),
            acertoLiga: Number(dt.acertoLiga ?? 0),
            playerCount: Number(dt.playerCount ?? 0),
            agentCount: Number(dt.agentCount ?? 0),
            subclubCount: subclubs.length,
          });
        }
        setClubsData(clubs);
      } catch {
        if (!cancelled) toast('Erro ao carregar dados da semana', 'error');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentGroup, toast]);

  // Consolidated totals across all clubs
  const totals = useMemo(() => {
    if (clubsData.length === 0) return null;
    const rake = round2(clubsData.reduce((s, c) => s + c.rake, 0));
    const ggr = round2(clubsData.reduce((s, c) => s + c.ggr, 0));
    const ganhos = round2(clubsData.reduce((s, c) => s + c.ganhos, 0));
    const totalTaxas = round2(clubsData.reduce((s, c) => s + c.totalTaxas, 0));
    const rbTotal = round2(clubsData.reduce((s, c) => s + c.rbTotal, 0));
    const acertoLiga = round2(clubsData.reduce((s, c) => s + c.acertoLiga, 0));
    const playerCount = clubsData.reduce((s, c) => s + c.playerCount, 0);
    const agentCount = clubsData.reduce((s, c) => s + c.agentCount, 0);
    const receitaBruta = round2(rake + ggr);
    const lucroLiquido = round2(receitaBruta - totalTaxas - rbTotal);
    const margem = receitaBruta > 0.01 ? round2((lucroLiquido / receitaBruta) * 100) : 0;
    return { rake, ggr, ganhos, totalTaxas, rbTotal, acertoLiga, playerCount, agentCount, receitaBruta, lucroLiquido, margem };
  }, [clubsData]);

  // Ledger KPIs
  const kpis = useMemo(() => {
    const total = entries.length;
    const totalIn = round2(entries.filter((e) => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0));
    const totalOut = round2(entries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0));
    const net = round2(totalIn - totalOut);
    const reconciled = entries.filter((e) => e.is_reconciled).length;
    const entities = new Set(entries.map((e) => e.entity_id)).size;
    return { total, totalIn, totalOut, net, reconciled, entities };
  }, [entries]);

  // Filter
  const filtered = useMemo(() => {
    let result = entries;
    if (filterDir !== 'all') result = result.filter((e) => e.dir === filterDir);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.entity_name || '').toLowerCase().includes(s) ||
          (e.description || '').toLowerCase().includes(s) ||
          (e.method || '').toLowerCase().includes(s),
      );
    }
    return result;
  }, [entries, filterDir, search]);

  // Group
  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, { label: string; totalIn: number; totalOut: number; count: number }>();
    for (const e of filtered) {
      const key =
        groupBy === 'entity'
          ? e.entity_name || e.entity_id
          : groupBy === 'method'
            ? e.method || 'Sem metodo'
            : e.source || 'manual';
      if (!map.has(key)) map.set(key, { label: key, totalIn: 0, totalOut: 0, count: 0 });
      const g = map.get(key)!;
      g.count++;
      if (e.dir === 'IN') g.totalIn += Number(e.amount);
      else g.totalOut += Number(e.amount);
    }
    return Array.from(map.values()).sort((a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut));
  }, [filtered, groupBy]);

  type CaixaSortKey = 'date' | 'entity' | 'amount' | 'method';

  const getCaixaSortValue = useCallback((e: LedgerEntry, key: CaixaSortKey): string | number => {
    switch (key) {
      case 'date': return e.created_at || '';
      case 'entity': return e.entity_name || '';
      case 'amount': return Number(e.amount) * (e.dir === 'OUT' ? -1 : 1);
      case 'method': return e.method || '';
    }
  }, []);

  const { sorted: sortedEntries, handleSort: handleCaixaSort, sortIcon: caixaSortIcon, ariaSort: caixaAriaSort } = useSortable<LedgerEntry, CaixaSortKey>({
    data: filtered,
    defaultKey: 'date',
    getValue: getCaixaSortValue,
  });

  function fmtDate(d?: string) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function fmtWeekEnd(d: string) {
    const [y, m, day] = d.split('-');
    const dt = new Date(Number(y), Number(m) - 1, Number(day));
    dt.setDate(dt.getDate() + 6);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-6xl">
        <div className="h-8 skeleton-shimmer rounded w-48 mb-2" />
        <div className="h-4 skeleton-shimmer rounded w-72 mb-6" />
        <KpiSkeleton count={5} />
        <TableSkeleton columns={7} rows={8} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-white">Caixa Geral</h2>
          <p className="text-dark-400 text-sm">
            Visao consolidada de toda a operacao
            {currentGroup && ` — ${currentGroup.settlements.length} clube${currentGroup.settlements.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Week selector (grouped by week_start) */}
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
          aria-label="Selecionar semana"
        >
          {weekGroups.map((g) => (
            <option key={g.week_start} value={g.week_start}>
              {fmtDate(g.week_start)} a {fmtWeekEnd(g.week_start)} — {g.settlements.length} clube{g.settlements.length !== 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </div>

      {loadingData ? (
        <div>
          <KpiSkeleton count={5} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="h-32 skeleton-shimmer rounded-xl" />
            <div className="h-32 skeleton-shimmer rounded-xl" />
          </div>
          <TableSkeleton columns={7} rows={8} />
        </div>
      ) : (
        <>
          {/* Lucro Liquido Hero Card — consolidated */}
          {totals && (
            <div
              className={`p-5 rounded-xl border-2 mb-5 ${
                totals.lucroLiquido >= 0
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-red-500/30 bg-red-500/5'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">LUCRO LIQUIDO DA SEMANA</div>
                  <div className={`text-3xl font-extrabold font-mono ${
                    totals.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatBRL(totals.lucroLiquido)}
                  </div>
                  <div className="text-sm text-dark-500 mt-1">
                    Margem: <span className={totals.margem >= 0 ? 'text-green-400' : 'text-red-400'}>{totals.margem.toFixed(1)}%</span>
                    <span className="text-dark-600 mx-2">&middot;</span>
                    Receita: {formatBRL(totals.receitaBruta)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">Acerto Liga</div>
                  <div className={`text-lg font-bold font-mono ${totals.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                    {formatBRL(totals.acertoLiga)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Consolidated KPIs */}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
              <KpiCard label="Jogadores" value={totals.playerCount} accentColor="bg-blue-500" />
              <KpiCard label="Rake Total" value={formatBRL(totals.rake)} accentColor="bg-poker-500" valueColor="text-poker-400" />
              <KpiCard label="GGR" value={formatBRL(totals.ggr)} accentColor="bg-purple-500" valueColor="text-purple-400" />
              <KpiCard label="Taxas" value={formatBRL(totals.totalTaxas)} accentColor="bg-amber-500" valueColor="text-amber-400" />
              <KpiCard label="RB Total" value={formatBRL(totals.rbTotal)} accentColor="bg-red-500" valueColor="text-red-400" />
            </div>
          )}

          {/* Per-club breakdown cards */}
          {clubsData.length > 1 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-dark-400 uppercase tracking-wider mb-3">Por Clube</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {clubsData.map((club) => {
                  const clubReceita = round2(club.rake + club.ggr);
                  const clubLucro = round2(clubReceita - club.totalTaxas - club.rbTotal);
                  return (
                    <div key={club.settlementId} className="card p-4 border border-dark-700/50 hover:border-dark-600/50 transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-dark-500" />
                        <span className="text-white font-semibold text-sm truncate">{club.clubName}</span>
                        {club.platform && (
                          <span className="text-[10px] font-bold text-dark-500 bg-dark-700/50 px-2 py-0.5 rounded uppercase">
                            {club.platform}
                          </span>
                        )}
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          club.status === 'FINAL' ? 'bg-green-900/20 text-green-400 border-green-700/40' :
                          club.status === 'DRAFT' ? 'bg-amber-900/20 text-amber-400 border-amber-700/40' :
                          'bg-dark-700/30 text-dark-400 border-dark-600/40'
                        }`}>
                          {club.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-dark-500">Rake</div>
                          <div className="font-mono text-poker-400 font-medium">{formatBRL(club.rake)}</div>
                        </div>
                        <div>
                          <div className="text-dark-500">GGR</div>
                          <div className="font-mono text-purple-400 font-medium">{formatBRL(club.ggr)}</div>
                        </div>
                        <div>
                          <div className="text-dark-500">Lucro</div>
                          <div className={`font-mono font-semibold ${clubLucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatBRL(clubLucro)}
                          </div>
                        </div>
                        <div>
                          <div className="text-dark-500">Jogadores</div>
                          <div className="font-mono text-dark-200">{club.playerCount}</div>
                        </div>
                        <div>
                          <div className="text-dark-500">Agentes</div>
                          <div className="font-mono text-dark-200">{club.agentCount}</div>
                        </div>
                        <div>
                          <div className="text-dark-500">Acerto</div>
                          <div className={`font-mono font-medium ${club.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                            {formatBRL(club.acertoLiga)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Single-club summary (when only 1 club) */}
          {clubsData.length === 1 && (
            <div className="mb-6 card p-4 border border-dark-700/50">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-dark-500" />
                <span className="text-white font-semibold text-sm">{clubsData[0].clubName}</span>
                {clubsData[0].platform && (
                  <span className="text-[10px] font-bold text-dark-500 bg-dark-700/50 px-2 py-0.5 rounded uppercase">
                    {clubsData[0].platform}
                  </span>
                )}
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  clubsData[0].status === 'FINAL' ? 'bg-green-900/20 text-green-400 border-green-700/40' :
                  'bg-amber-900/20 text-amber-400 border-amber-700/40'
                }`}>
                  {clubsData[0].status}
                </span>
              </div>
            </div>
          )}

          {/* Ledger section */}
          {entries.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-dark-400 uppercase tracking-wider mb-3">Movimentacoes</h3>

              {/* Ledger KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                <KpiCard label="Movimentacoes" value={kpis.total} accentColor="bg-blue-500" />
                <KpiCard label="Entradas" value={formatBRL(kpis.totalIn)} accentColor="bg-emerald-500" valueColor="text-emerald-400" />
                <KpiCard label="Saidas" value={formatBRL(kpis.totalOut)} accentColor="bg-red-500" valueColor="text-red-400" />
                <KpiCard label="Net" value={formatBRL(kpis.net)} accentColor={kpis.net >= 0 ? 'bg-poker-500' : 'bg-red-500'} valueColor={kpis.net >= 0 ? 'text-poker-400' : 'text-red-400'} />
                <KpiCard label="Entidades" value={kpis.entities} accentColor="bg-yellow-500" valueColor="text-yellow-400" />
              </div>

              {/* Reconciliation progress */}
              {kpis.total > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-dark-400">Conciliacao</span>
                    <span className="text-xs font-mono text-dark-300">
                      {kpis.reconciled}/{kpis.total} conciliadas ({Math.round((kpis.reconciled / kpis.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        kpis.reconciled === kpis.total ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-blue-400'
                      }`}
                      style={{ width: `${Math.round((kpis.reconciled / kpis.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="relative flex-1 max-w-xs">
                  <input
                    type="text"
                    placeholder="Buscar entidade, metodo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
                    aria-label="Filtrar por entidade"
                  />
                </div>

                <div className="flex gap-1">
                  {(['all', 'IN', 'OUT'] as FilterDir[]).map((mode) => {
                    const labels: Record<FilterDir, string> = { all: 'Todas', IN: '↓ Entradas', OUT: '↑ Saidas' };
                    return (
                      <button
                        key={mode}
                        onClick={() => setFilterDir(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          filterDir === mode
                            ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                            : 'text-dark-300 hover:bg-dark-800'
                        }`}
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                </div>

                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none"
                >
                  <option value="none">Sem agrupamento</option>
                  <option value="entity">Por Entidade</option>
                  <option value="method">Por Metodo</option>
                  <option value="source">Por Origem</option>
                </select>
              </div>

              {/* Grouped view */}
              {grouped && grouped.length > 0 && (
                <div className="card overflow-hidden p-0 mb-5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm data-table" aria-label="Movimentacoes agrupadas">
                      <thead>
                        <tr className="bg-dark-800/50">
                          <th scope="col" className="px-5 py-3 text-left font-medium text-xs text-dark-400">
                            {groupBy === 'entity' ? 'Entidade' : groupBy === 'method' ? 'Metodo' : 'Origem'}
                          </th>
                          <th scope="col" className="px-3 py-3 text-center font-medium text-xs text-dark-400">Movs</th>
                          <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400">Entradas</th>
                          <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400">Saidas</th>
                          <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-800/50">
                        {grouped.map((g) => {
                          const net = round2(g.totalIn - g.totalOut);
                          return (
                            <tr key={g.label}>
                              <td className="px-5 py-2.5 text-white font-medium text-sm truncate max-w-[240px]" title={g.label}>
                                {g.label}
                              </td>
                              <td className="px-3 py-2.5 text-center text-dark-400 text-xs">{g.count}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                                {g.totalIn > 0 ? formatBRL(g.totalIn) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-400">
                                {g.totalOut > 0 ? formatBRL(g.totalOut) : '—'}
                              </td>
                              <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                                net > 0.01 ? 'text-emerald-400' : net < -0.01 ? 'text-red-400' : 'text-dark-500'
                              }`}>
                                {formatBRL(net)}
                              </td>
                            </tr>
                          );
                        })}
                        {grouped.length > 1 && (() => {
                          const gTotalIn = round2(grouped.reduce((s, g) => s + g.totalIn, 0));
                          const gTotalOut = round2(grouped.reduce((s, g) => s + g.totalOut, 0));
                          const gNet = round2(gTotalIn - gTotalOut);
                          return (
                            <tr className="bg-dark-800/50 font-semibold border-t-2 border-dark-600">
                              <td className="px-5 py-3 text-white">TOTAL ({grouped.length})</td>
                              <td className="px-3 py-3 text-center text-dark-300 text-xs">
                                {grouped.reduce((s, g) => s + g.count, 0)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-emerald-400">{formatBRL(gTotalIn)}</td>
                              <td className="px-3 py-3 text-right font-mono text-red-400">{formatBRL(gTotalOut)}</td>
                              <td className={`px-3 py-3 text-right font-mono font-bold ${
                                gNet > 0.01 ? 'text-emerald-400' : gNet < -0.01 ? 'text-red-400' : 'text-dark-500'
                              }`}>
                                {formatBRL(gNet)}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detail table */}
              <div className="card overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm data-table" aria-label="Detalhamento de movimentacoes">
                    <thead>
                      <tr className="bg-dark-800/50">
                        <th scope="col" className="px-4 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleCaixaSort('date')} role="columnheader" aria-sort={caixaAriaSort('date')}>Data{caixaSortIcon('date')}</th>
                        <th scope="col" className="px-3 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleCaixaSort('entity')} role="columnheader" aria-sort={caixaAriaSort('entity')}>Entidade{caixaSortIcon('entity')}</th>
                        <th scope="col" className="px-3 py-3 text-center font-medium text-xs text-dark-400">Dir</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleCaixaSort('amount')} role="columnheader" aria-sort={caixaAriaSort('amount')}>Valor{caixaSortIcon('amount')}</th>
                        <th scope="col" className="px-3 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleCaixaSort('method')} role="columnheader" aria-sort={caixaAriaSort('method')}>Metodo{caixaSortIcon('method')}</th>
                        <th scope="col" className="px-3 py-3 text-left font-medium text-xs text-dark-400">Descricao</th>
                        <th scope="col" className="px-3 py-3 text-center font-medium text-xs text-dark-400">&#10003;</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800/50">
                      {sortedEntries.map((e) => (
                        <tr key={e.id} className={e.is_reconciled ? 'opacity-60' : ''}>
                          <td className="px-4 py-2.5 text-dark-300 text-xs font-mono">{fmtDateTime(e.created_at!)}</td>
                          <td className="px-3 py-2.5 text-white font-medium text-sm truncate max-w-[180px]">
                            <Highlight text={e.entity_name || '—'} query={search} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              e.dir === 'IN' ? 'bg-poker-900/30 text-poker-400' : 'bg-red-900/30 text-red-400'
                            }`}>
                              {e.dir === 'IN' ? '↓ IN' : '↑ OUT'}
                            </span>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-medium ${
                            e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'
                          }`}>
                            {e.dir === 'IN' ? '+' : '\u2212'}{formatBRL(Number(e.amount))}
                          </td>
                          <td className="px-3 py-2.5 text-dark-400 text-xs">{e.method || '—'}</td>
                          <td className="px-3 py-2.5 text-dark-400 text-xs truncate max-w-[200px]">
                            <Highlight text={e.description || '—'} query={search} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {e.is_reconciled ? (
                              <span className="text-green-400 text-xs">&#10003;</span>
                            ) : (
                              <span className="text-dark-600 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary footer */}
              <div className="mt-4 card flex items-center justify-between">
                <span className="text-xs text-dark-400">
                  {filtered.length} movimentacoes ({kpis.reconciled} conciliadas)
                </span>
                <div className="flex items-center gap-6 text-sm font-mono">
                  <span className="text-emerald-400">IN: {formatBRL(kpis.totalIn)}</span>
                  <span className="text-red-400">OUT: {formatBRL(kpis.totalOut)}</span>
                  <span className={`font-bold ${kpis.net >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                    NET: {formatBRL(kpis.net)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* No entries state */}
          {entries.length === 0 && clubsData.length === 0 && (
            <div className="card">
              <EmptyState icon={Receipt} title="Nenhum dado" description="Nao ha dados para esta semana. Importe um XLSX para comecar." />
            </div>
          )}
        </>
      )}
    </div>
  );
}
