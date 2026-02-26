'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { listSettlements, getSettlementFull, formatBRL, getOrgTree } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import { LayoutGrid } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
  club_name?: string;
}

interface SubclubData {
  name: string;
  totals: { resultado: number; players: number; rake: number; ggr: number; ganhos: number };
  feesComputed: { totalTaxas: number; totalTaxasSigned: number };
  totalLancamentos: number;
  acertoLiga: number;
  acertoDirecao: string;
}

// ─── Page ───────────────────────────────────────────────────────────

export default function LigaGlobalPage() {
  usePageTitle('Liga Global');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [subclubs, setSubclubs] = useState<SubclubData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFull, setLoadingFull] = useState(false);
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  const { toast } = useToast();

  // Load settlements + org tree for logos
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [res, treeRes] = await Promise.all([listSettlements(), getOrgTree()]);
        if (treeRes.success && treeRes.data) {
          const map: Record<string, string | null> = {};
          for (const club of treeRes.data) {
            for (const sub of club.subclubes || []) {
              map[sub.name.toLowerCase()] = sub.metadata?.logo_url || null;
            }
          }
          setLogoMap(map);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // Load full settlement when selection changes
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoadingFull(true);
      try {
        const res = await getSettlementFull(selectedId);
        if (res.success && res.data?.subclubs) {
          setSubclubs(res.data.subclubs);
        }
      } catch {
        toast('Erro ao carregar subclubes', 'error');
      } finally {
        setLoadingFull(false);
      }
    })();
  }, [selectedId, toast]);

  // Grand totals
  const grandTotal = useMemo(
    () => ({
      ganhos: round2(subclubs.reduce((s, sc) => s + (sc.totals?.ganhos || 0), 0)),
      resultado: round2(subclubs.reduce((s, sc) => s + (sc.totals?.resultado || 0), 0)),
      taxas: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.totalTaxas || 0), 0)),
      lancamentos: round2(subclubs.reduce((s, sc) => s + (sc.totalLancamentos || 0), 0)),
      acertoLiga: round2(subclubs.reduce((s, sc) => s + (sc.acertoLiga || 0), 0)),
      players: subclubs.reduce((s, sc) => s + (sc.totals?.players || 0), 0),
      rake: round2(subclubs.reduce((s, sc) => s + (sc.totals?.rake || 0), 0)),
      ggr: round2(subclubs.reduce((s, sc) => s + (sc.totals?.ggr || 0), 0)),
    }),
    [subclubs],
  );

  const selectedWeek = settlements.find((s) => s.id === selectedId);

  type LigaSortKey = 'name' | 'players' | 'resultado' | 'taxas' | 'lancamentos' | 'acertoLiga';

  const getSortValue = useCallback((sc: SubclubData, key: LigaSortKey): string | number => {
    switch (key) {
      case 'name': return sc.name;
      case 'players': return sc.totals?.players || 0;
      case 'resultado': return sc.totals?.resultado || 0;
      case 'taxas': return sc.feesComputed?.totalTaxas || 0;
      case 'lancamentos': return sc.totalLancamentos || 0;
      case 'acertoLiga': return sc.acertoLiga || 0;
    }
  }, []);

  const { sorted: sortedSubclubs, handleSort, sortIcon, ariaSort } = useSortable<SubclubData, LigaSortKey>({
    data: subclubs,
    defaultKey: 'acertoLiga',
    getValue: getSortValue,
  });

  function fmtDate(d?: string) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  if (loading) {
    return (
      <div className="p-8 max-w-6xl">
        <div className="h-8 skeleton-shimmer rounded w-48 mb-2" />
        <div className="h-4 skeleton-shimmer rounded w-72 mb-6" />
        <KpiSkeleton count={5} />
        <TableSkeleton columns={7} rows={6} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Liga Global</h2>
          <p className="text-dark-400 text-sm">Acerto consolidado de todos os subclubes</p>
        </div>

        {/* Week selector */}
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
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
          <TableSkeleton columns={7} rows={6} />
        </div>
      ) : subclubs.length === 0 ? (
        <div className="card">
          <EmptyState icon={LayoutGrid} title="Nenhum subclube" description="Selecione uma semana com dados importados" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <KpiCard
              label="Profit/Loss"
              subtitle="TODOS OS CLUBES"
              value={formatBRL(grandTotal.ganhos)}
              accentColor={grandTotal.ganhos >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={grandTotal.ganhos >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Rake Total"
              value={formatBRL(grandTotal.rake)}
              accentColor="bg-emerald-500"
              valueColor="text-emerald-400"
            />
            <KpiCard
              label="GGR Rodeo"
              value={formatBRL(grandTotal.ggr)}
              accentColor="bg-amber-500"
              valueColor="text-amber-400"
            />
            <KpiCard
              label="Resultado Clubes"
              subtitle="Σ P/L + RAKE + GGR"
              value={formatBRL(grandTotal.resultado)}
              accentColor={grandTotal.resultado >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={grandTotal.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Total Taxas"
              value={formatBRL(-grandTotal.taxas)}
              accentColor="bg-red-500"
              valueColor="text-red-400"
            />
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm data-table" aria-label="Acerto liga por subclube">
                <thead>
                  <tr className="bg-dark-800/50">
                    <th scope="col" className="px-5 py-3 text-left font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('name')} role="columnheader" aria-sort={ariaSort('name')}>Subclube{sortIcon('name')}</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('players')} role="columnheader" aria-sort={ariaSort('players')}>Jogadores{sortIcon('players')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('resultado')} role="columnheader" aria-sort={ariaSort('resultado')}>Resultado{sortIcon('resultado')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('taxas')} role="columnheader" aria-sort={ariaSort('taxas')}>Taxas{sortIcon('taxas')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('lancamentos')} role="columnheader" aria-sort={ariaSort('lancamentos')}>Lancamentos{sortIcon('lancamentos')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium text-xs text-dark-400 cursor-pointer hover:text-dark-200" onClick={() => handleSort('acertoLiga')} role="columnheader" aria-sort={ariaSort('acertoLiga')}>Acerto Liga{sortIcon('acertoLiga')}</th>
                    <th scope="col" className="px-5 py-3 text-left font-medium text-xs text-dark-400">Direcao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/50">
                  {sortedSubclubs.map((sc, i) => (
                    <tr key={sc.name || i}>
                      <td className="px-5 py-3 text-white font-medium">
                        <span className="flex items-center gap-2">
                          <ClubLogo
                            logoUrl={logoMap[sc.name.toLowerCase()]}
                            name={sc.name}
                            size="sm"
                            className="!w-6 !h-6 !text-[10px]"
                          />
                          {sc.name}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-dark-300">{sc.totals?.players || 0}</td>
                      <td
                        className={`px-3 py-3 text-right font-mono ${
                          (sc.totals?.resultado || 0) < 0 ? 'text-red-400' : 'text-poker-400'
                        }`}
                      >
                        {formatBRL(sc.totals?.resultado || 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-red-400">
                        {formatBRL(sc.feesComputed?.totalTaxasSigned || 0)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono ${
                          (sc.totalLancamentos || 0) !== 0 ? 'text-dark-200' : 'text-dark-500'
                        }`}
                      >
                        {formatBRL(sc.totalLancamentos || 0)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-semibold ${
                          (sc.acertoLiga || 0) > 0.01
                            ? 'text-poker-400'
                            : (sc.acertoLiga || 0) < -0.01
                              ? 'text-red-400'
                              : 'text-dark-500'
                        }`}
                      >
                        {formatBRL(sc.acertoLiga || 0)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs ${
                            (sc.acertoLiga || 0) > 0.01
                              ? 'text-poker-400'
                              : (sc.acertoLiga || 0) < -0.01
                                ? 'text-red-400'
                                : 'text-dark-500'
                          }`}
                        >
                          {sc.acertoDirecao || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total row */}
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="bg-dark-900/95 backdrop-blur-sm font-semibold border-t-2 border-dark-600">
                    <td className="px-5 py-3 text-white">TOTAL</td>
                    <td className="px-3 py-3 text-center text-white">{grandTotal.players}</td>
                    <td
                      className={`px-3 py-3 text-right font-mono ${
                        grandTotal.resultado < 0 ? 'text-red-400' : 'text-poker-400'
                      }`}
                    >
                      {formatBRL(grandTotal.resultado)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-400">{formatBRL(-grandTotal.taxas)}</td>
                    <td
                      className={`px-3 py-3 text-right font-mono ${
                        grandTotal.lancamentos !== 0 ? 'text-dark-200' : 'text-dark-500'
                      }`}
                    >
                      {formatBRL(grandTotal.lancamentos)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono font-bold ${
                        grandTotal.acertoLiga > 0.01
                          ? 'text-poker-400'
                          : grandTotal.acertoLiga < -0.01
                            ? 'text-red-400'
                            : 'text-dark-300'
                      }`}
                    >
                      {formatBRL(grandTotal.acertoLiga)}
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Grand total card */}
          <div
            className={`mt-6 rounded-xl p-5 border-2 ${
              grandTotal.acertoLiga > 0.01
                ? 'bg-poker-950/40 border-poker-700/60'
                : grandTotal.acertoLiga < -0.01
                  ? 'bg-red-950/30 border-red-700/50'
                  : 'bg-dark-800/50 border-dark-600/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-dark-400 uppercase tracking-wider font-medium mb-1">Acerto Total Liga</p>
                <p className="text-dark-500 text-xs">
                  Soma de {subclubs.length} subclubes — Semana {fmtDate(selectedWeek?.week_start)}
                </p>
              </div>
              <p
                className={`text-3xl font-bold font-mono ${
                  grandTotal.acertoLiga > 0.01
                    ? 'text-poker-400'
                    : grandTotal.acertoLiga < -0.01
                      ? 'text-red-400'
                      : 'text-dark-300'
                }`}
              >
                {formatBRL(grandTotal.acertoLiga)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
