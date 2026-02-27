'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import Link from 'next/link';
import { formatCurrency, round2 } from '@/lib/formatters';
import { listSettlements, getSettlementFull, getSettlementBatchSummary, getOrgTree } from '@/lib/api';
import KpiCard from '@/components/ui/KpiCard';
import dynamic from 'next/dynamic';
import ClubCard from '@/components/dashboard/ClubCard';
import WeekDatePicker from '@/components/WeekDatePicker';

// Recharts is ~120KB — lazy-load charts only when needed
const ComparativeBarChart = dynamic(() => import('@/components/dashboard/ComparativeBarChart'), { ssr: false });
const ComparativeLineChart = dynamic(() => import('@/components/dashboard/ComparativeLineChart'), { ssr: false });
import Spinner from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import type { ClubeData, ChartDataPoint } from '@/types/dashboard';

// ─── helpers ──────────────────────────────────────────────────────
function formatDDMM(iso: string) {
  const [, m, dd] = iso.split('-');
  return `${dd}/${m}`;
}

function _formatWeekLabel(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─── types for loaded data ────────────────────────────────────────
interface DespesasDetail {
  taxas: number;
  rakeback: number;
  lancamentos: number;
  total: number;
  // Granular
  overlay: number;
  compras: number;
  security: number;
  outros: number;
}

interface WeekData {
  settlement: any;
  subclubs: any[];
  jogadoresAtivos: number;
  rakeTotal: number;
  ganhosTotal: number;
  ggrTotal: number;
  despesas: DespesasDetail;
  resultadoFinal: number;
  acertoLiga: number;
  totalTaxasSigned: number;
  totalLancamentos: number;
  clubes: ClubeData[];
}

// ─── Component ────────────────────────────────────────────────────
export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  // Data states
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState<WeekData | null>(null);
  const [previousWeek, setPreviousWeek] = useState<WeekData | null>(null);
  const [allSettlements, setAllSettlements] = useState<any[]>([]);
  const [allWeekData, setAllWeekData] = useState<WeekData[]>([]);
  const [notFoundEmpty, setNotFoundEmpty] = useState(false);

  // Week selector state
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [_searching, setSearching] = useState(false);
  const [notFoundSearch, setNotFoundSearch] = useState(false);

  // Logo map: subclub name -> logo_url
  const logoMapRef = useRef<Record<string, string | null>>({});

  // Load settlement full data and map to WeekData
  const loadWeekData = useCallback(async (settlement: any): Promise<WeekData | null> => {
    try {
      const fullRes = await getSettlementFull(settlement.id);
      if (!fullRes.success) return null;
      const subclubs = fullRes.data.subclubs || [];
      const dt = fullRes.data.dashboardTotals || {};

      // Use actual API data from dashboardTotals
      const rakeTotal = Number(dt.rake ?? 0);
      const ganhosTotal = Number(dt.ganhos ?? 0);
      const ggrTotal = Number(dt.ggr ?? 0);
      const resultadoTotal = Number(dt.resultado ?? 0);
      const totalPlayers = Number(dt.players ?? 0);
      const rbTotal = Number(dt.rbTotal ?? 0);
      const totalTaxas = Number(dt.totalTaxas ?? 0);
      const dtTotalTaxasSigned = Number(dt.totalTaxasSigned ?? -totalTaxas);
      const dtAcertoLiga = Number(dt.acertoLiga ?? 0);

      // Build per-club data (enables toggle filtering)
      let totalLancamentos = 0;
      let totalOverlay = 0,
        totalCompras = 0,
        totalSecurity = 0,
        totalOutros = 0;
      const clubes: ClubeData[] = [];

      for (const sc of subclubs) {
        const agents = sc.agents || [];

        // Use sc.totals (source of truth from backend/player_week_metrics)
        const scGanhos = Number(sc.totals?.ganhos || 0);
        const scRake = Number(sc.totals?.rake || 0);
        const scGGR = Number(sc.totals?.ggr || 0);
        const scResultado = Number(sc.totals?.resultado || 0);
        const scJogadores = Number(sc.totals?.players || 0);
        const scRakeback = Number(sc.totals?.rbTotal || 0);
        const scTaxas = Number(sc.feesComputed?.totalTaxas || 0);
        const scLancamentos = Number(sc.totalLancamentos || 0);
        const scAcerto = Number(sc.acertoLiga || 0);

        const adj = sc.adjustments || {};
        totalOverlay += Number(adj.overlay || 0);
        totalCompras += Number(adj.compras || 0);
        totalSecurity += Number(adj.security || 0);
        totalOutros += Number(adj.outros || 0);
        totalLancamentos += scLancamentos;

        clubes.push({
          subclubId: sc.id,
          nome: sc.name,
          agentes: agents.length,
          jogadores: scJogadores,
          rake: round2(scRake),
          ganhos: round2(scGanhos),
          ggr: round2(scGGR),
          resultado: round2(scResultado),
          acertoLiga: round2(scAcerto),
          taxas: round2(scTaxas),
          rakeback: round2(scRakeback),
          lancamentos: round2(scLancamentos),
          status: 'Em Aberto',
          logoUrl: logoMapRef.current[sc.name.toLowerCase()] || null,
        });
      }

      const despesasTotal = round2(totalTaxas + Math.abs(totalLancamentos));

      return {
        settlement,
        subclubs,
        jogadoresAtivos: totalPlayers,
        rakeTotal,
        ganhosTotal,
        ggrTotal,
        despesas: {
          taxas: totalTaxas,
          rakeback: rbTotal,
          lancamentos: round2(totalLancamentos),
          total: despesasTotal,
          overlay: round2(totalOverlay),
          compras: round2(totalCompras),
          security: round2(totalSecurity),
          outros: round2(totalOutros),
        },
        resultadoFinal: resultadoTotal,
        acertoLiga: dtAcertoLiga,
        totalTaxasSigned: dtTotalTaxasSigned,
        totalLancamentos: round2(totalLancamentos),
        clubes,
      };
    } catch {
      return null;
    }
  }, []);

  // Convert batch summary item to WeekData (lightweight — no per-club breakdown)
  const batchItemToWeekData = useCallback((item: any): WeekData => {
    const dt = item.dashboardTotals || {};
    return {
      settlement: item.settlement,
      subclubs: [],
      jogadoresAtivos: Number(dt.players ?? 0),
      rakeTotal: Number(dt.rake ?? 0),
      ganhosTotal: Number(dt.ganhos ?? 0),
      ggrTotal: Number(dt.ggr ?? 0),
      despesas: {
        taxas: Number(dt.totalTaxas ?? 0),
        rakeback: Number(dt.rbTotal ?? 0),
        lancamentos: Number(dt.totalLancamentos ?? 0),
        total: round2(Number(dt.totalTaxas ?? 0) + Math.abs(Number(dt.totalLancamentos ?? 0))),
        overlay: 0, compras: 0, security: 0, outros: 0,
      },
      resultadoFinal: Number(dt.resultado ?? 0),
      acertoLiga: Number(dt.acertoLiga ?? 0),
      totalTaxasSigned: Number(dt.totalTaxasSigned ?? 0),
      totalLancamentos: Number(dt.totalLancamentos ?? 0),
      clubes: [],
    };
  }, []);

  // Initial load: fetch current week (full) + org tree + batch summaries for charts
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // Load org tree + settlement list in parallel
        const [res, treeRes] = await Promise.all([listSettlements(), getOrgTree()]);
        if (treeRes.success && treeRes.data) {
          const map: Record<string, string | null> = {};
          for (const club of treeRes.data) {
            for (const sub of club.subclubes || []) {
              map[sub.name.toLowerCase()] = sub.metadata?.logo_url || null;
            }
          }
          logoMapRef.current = map;
        }
        if (!res.success || !res.data?.length) {
          setNotFoundEmpty(true);
          setLoading(false);
          return;
        }

        setAllSettlements(res.data);
        const latest = res.data[0];

        // Only the CURRENT week needs full data (subclub breakdown for cards)
        const currentData = await loadWeekData(latest);

        if (currentData) {
          setCurrentWeek(currentData);
          // Pre-fill date pickers with current settlement dates
          const ws = currentData.settlement.week_start;
          setStartDate(ws);
          const dtEnd = new Date(ws + 'T00:00:00');
          dtEnd.setDate(dtEnd.getDate() + 6);
          setEndDate(dtEnd.toISOString().slice(0, 10));

          // Previous week (for comparison) + chart data: use batch endpoint (1 call instead of 11)
          const chartSettlements = res.data.slice(0, 12);
          const otherIds = chartSettlements.filter((s: any) => s.id !== latest.id).map((s: any) => s.id);

          if (otherIds.length > 0) {
            getSettlementBatchSummary(otherIds).then((batchRes) => {
              if (batchRes.success && batchRes.data) {
                const batchWeeks = batchRes.data.map(batchItemToWeekData);
                // Set previous week if available
                if (batchWeeks.length > 0) {
                  setPreviousWeek(batchWeeks[batchWeeks.length - 1]); // most recent = last sorted
                }
                const all = [currentData, ...batchWeeks];
                all.sort((a, b) => a.settlement.week_start.localeCompare(b.settlement.week_start));
                setAllWeekData(all);
              } else {
                setAllWeekData([currentData]);
              }
            });
          } else {
            setAllWeekData([currentData]);
          }
        } else {
          setNotFoundEmpty(true);
        }
      } catch {
        toast('Erro ao carregar dashboard', 'error');
        setNotFoundEmpty(true);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadWeekData, batchItemToWeekData, toast]);

  // Week selector handlers — auto-search on date change
  function handleStartChange(date: string) {
    setStartDate(date);
    setNotFoundSearch(false);
    setNotFoundEmpty(false);
    const dt = new Date(date + 'T00:00:00');
    dt.setDate(dt.getDate() + 6);
    const end = dt.toISOString().slice(0, 10);
    setEndDate(end);
    doSearch(date, end);
  }

  async function doSearch(start: string, end?: string) {
    setSearching(true);
    setNotFoundSearch(false);
    setNotFoundEmpty(false);
    try {
      const res = await listSettlements(undefined, start, end || undefined);
      if (res.success && res.data && res.data.length > 0) {
        const target = res.data[0];
        setLoading(true);

        // Find the previous settlement (the one right before the selected)
        const allRes = await listSettlements();
        const allList = allRes.success ? allRes.data || [] : allSettlements;
        const targetIdx = allList.findIndex((s: any) => s.id === target.id);
        const prev = targetIdx >= 0 && targetIdx < allList.length - 1 ? allList[targetIdx + 1] : null;

        const [newData, prevData] = await Promise.all([
          loadWeekData(target),
          prev ? loadWeekData(prev) : Promise.resolve(null),
        ]);

        if (newData) {
          setCurrentWeek(newData);
          setPreviousWeek(prevData);
          setNotFoundEmpty(false);
        } else {
          setNotFoundEmpty(true);
        }
        setLoading(false);
      } else {
        setNotFoundSearch(true);
        setNotFoundEmpty(true);
      }
    } catch {
      setNotFoundSearch(true);
      setNotFoundEmpty(true);
    } finally {
      setSearching(false);
    }
  }

  // ─── Club toggle (filter KPIs) ──────────────────────────────────
  const [disabledClubs, setDisabledClubs] = useState<Set<string>>(new Set());

  const toggleClub = useCallback((nome: string) => {
    setDisabledClubs((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }, []);

  const calcFiltered = useCallback(function calcFiltered(week: WeekData | null) {
    if (!week) return null;
    if (disabledClubs.size === 0) {
      return {
        jogadoresAtivos: week.jogadoresAtivos,
        rakeTotal: week.rakeTotal,
        ganhosTotal: week.ganhosTotal,
        ggrTotal: week.ggrTotal,
        despesas: week.despesas,
        resultadoFinal: week.resultadoFinal,
        acertoLiga: week.acertoLiga,
        totalTaxasSigned: week.totalTaxasSigned,
        totalLancamentos: week.totalLancamentos,
      };
    }
    const enabled = week.clubes.filter((c) => !disabledClubs.has(c.nome));
    const jogadoresAtivos = enabled.reduce((s, c) => s + c.jogadores, 0);
    const rakeTotal = round2(enabled.reduce((s, c) => s + c.rake, 0));
    const ganhosTotal = round2(enabled.reduce((s, c) => s + c.ganhos, 0));
    const ggrTotal = round2(enabled.reduce((s, c) => s + c.ggr, 0));
    const taxas = round2(enabled.reduce((s, c) => s + c.taxas, 0));
    const rakeback = round2(enabled.reduce((s, c) => s + c.rakeback, 0));
    const lancamentos = round2(enabled.reduce((s, c) => s + c.lancamentos, 0));
    const despesasTotal = round2(taxas + Math.abs(lancamentos));
    const resultadoFinal = round2(ganhosTotal + rakeTotal + ggrTotal);
    const acertoLiga = round2(enabled.reduce((s, c) => s + c.acertoLiga, 0));
    const totalTaxasSigned = round2(-taxas);
    return {
      jogadoresAtivos,
      rakeTotal,
      ganhosTotal,
      ggrTotal,
      despesas: {
        taxas,
        rakeback,
        lancamentos,
        total: despesasTotal,
        overlay: week.despesas.overlay,
        compras: week.despesas.compras,
        security: week.despesas.security,
        outros: week.despesas.outros,
      },
      resultadoFinal,
      acertoLiga,
      totalTaxasSigned,
      totalLancamentos: lancamentos,
    };
  }, [disabledClubs]);

  // ─── Derived data ───────────────────────────────────────────────
  const d = currentWeek;
  const _p = previousWeek;
  const f = useMemo(() => calcFiltered(d), [d, calcFiltered]);
  // Chart data from all loaded settlements
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!allWeekData.length) return [];
    return allWeekData.map((w, i) => ({
      semana: formatDDMM(w.settlement.week_start),
      anterior: i > 0 ? allWeekData[i - 1].jogadoresAtivos : w.jogadoresAtivos,
      atual: w.jogadoresAtivos,
      rakeAnterior: i > 0 ? allWeekData[i - 1].rakeTotal : w.rakeTotal,
      rake: w.rakeTotal,
    }));
  }, [allWeekData]);

  const status = d?.settlement?.status || 'DRAFT';
  const statusLabel = status === 'FINAL' ? 'FECHADO' : status === 'DRAFT' ? 'RASCUNHO' : status;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="bg-dark-950 min-h-screen p-8">
      {/* ── HEADER ── */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-dark-100 mb-2">Dashboard</h1>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            {d && !notFoundEmpty && (
              <>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    status === 'DRAFT'
                      ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                      : 'border-green-500/30 bg-green-500/10 text-green-400'
                  }`}
                >
                  {statusLabel}
                </span>
                <div className="h-4 w-px bg-dark-700" />
              </>
            )}

            {/* Date pickers */}
            <div className="flex items-end gap-2">
              <WeekDatePicker value={startDate} onChange={handleStartChange} allowedDay={1} label="Data Inicial" />
              <WeekDatePicker value={endDate} onChange={setEndDate} allowedDay={0} label="Data Final" />
            </div>

            {/* Not found badge */}
            {notFoundSearch && startDate && endDate && (
              <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                Nenhum fechamento para {formatDDMM(startDate)} → {formatDDMM(endDate)}
              </span>
            )}
          </div>
        </div>

        {d && !notFoundEmpty && isAdmin && d.settlement?.status === 'DRAFT' && (
          <Link href={`/s/${d.settlement?.id}`} className="btn-primary flex items-center gap-2">
            Finalizar Semana {'\u2192'}
          </Link>
        )}
      </div>

      {/* ── LOADING ── */}
      {loading && (
        <div className="flex justify-center py-32">
          <Spinner size="md" />
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && notFoundEmpty && (
        <div className="flex flex-col items-center justify-center py-32">
          <h2 className="text-xl font-bold text-dark-100 mb-2">Nenhum fechamento encontrado</h2>
          <p className="text-dark-400 mb-6">Nao existe fechamento importado para o periodo selecionado.</p>
          <Link href="/import" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
            Importar Semana
          </Link>
        </div>
      )}

      {/* ── DASHBOARD CONTENT ── */}
      {!loading && d && !notFoundEmpty && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-7">
            <KpiCard
              label="Jogadores"
              value={String(f?.jogadoresAtivos ?? 0)}
              accentColor="bg-blue-500"
            />
            <KpiCard
              label="Profit / Loss"
              value={formatCurrency(f?.ganhosTotal ?? 0)}
              accentColor={(f?.ganhosTotal ?? 0) >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={(f?.ganhosTotal ?? 0) >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Rake Total"
              value={formatCurrency(f?.rakeTotal ?? 0)}
              accentColor="bg-poker-500"
            />
            <KpiCard
              label="GGR Rodeio"
              value={formatCurrency(f?.ggrTotal ?? 0)}
              accentColor="bg-purple-500"
              valueColor="text-purple-400"
            />
            <KpiCard
              label="Resultado"
              value={formatCurrency(f?.resultadoFinal ?? 0)}
              accentColor={(f?.resultadoFinal ?? 0) >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={(f?.resultadoFinal ?? 0) >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Despesas"
              value={formatCurrency(-(f?.despesas.total ?? 0))}
              accentColor="bg-red-500"
              valueColor="text-red-400"
            />
            <KpiCard
              label="Fechamento"
              value={formatCurrency(f?.acertoLiga ?? 0)}
              accentColor={(f?.acertoLiga ?? 0) >= 0 ? 'bg-amber-500' : 'bg-red-500'}
              valueColor={(f?.acertoLiga ?? 0) >= 0 ? 'text-amber-400' : 'text-red-400'}
            />
          </div>

          {/* Filter indicator */}
          {disabledClubs.size > 0 && (
            <div className="flex items-center gap-2 mb-4 -mt-3">
              <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5">
                Filtro ativo: {d.clubes.length - disabledClubs.size} de {d.clubes.length} clubes
              </span>
              <button
                onClick={() => setDisabledClubs(new Set())}
                className="text-xs text-dark-400 hover:text-dark-100 underline transition-colors"
              >
                Mostrar todos
              </button>
            </div>
          )}

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-7">
              <div className="card">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-dark-100">Jogadores Ativos</h3>
                  <p className="text-xs text-dark-400">Comparativo semanal</p>
                </div>
                <ComparativeBarChart data={chartData} />
              </div>
              <div className="card">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-dark-100">Rake Semanal</h3>
                  <p className="text-xs text-dark-400">Comparativo semanal</p>
                </div>
                <ComparativeLineChart data={chartData} />
              </div>
            </div>
          )}

          {/* Clubes */}
          {d.clubes.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-bold text-dark-100">Clubes</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dark-800 text-dark-400 border border-dark-700">
                  {d.clubes.length} clubes
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {d.clubes.map((clube) => (
                  <ClubCard
                    key={clube.nome}
                    clube={clube}
                    settlementId={d.settlement.id}
                    enabled={!disabledClubs.has(clube.nome)}
                    onToggle={() => toggleClub(clube.nome)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
