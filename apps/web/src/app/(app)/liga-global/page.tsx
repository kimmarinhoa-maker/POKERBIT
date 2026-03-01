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
import { LayoutGrid, Download } from 'lucide-react';
import { exportCsv } from '@/lib/exportCsv';
import { buildLigaMessage } from '@/lib/whatsappMessages';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
  club_name?: string;
}

interface SubclubData {
  id?: string;
  name: string;
  totals: { resultado: number; players: number; rake: number; ggr: number; ganhos: number };
  feesComputed: {
    taxaApp: number;
    taxaLiga: number;
    taxaRodeoGGR: number;
    taxaRodeoApp: number;
    totalTaxas: number;
    totalTaxasSigned: number;
  };
  adjustments: {
    overlay: number;
    compras: number;
    security: number;
    outros: number;
  };
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
  const [showConsolidado, setShowConsolidado] = useState(false);

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
      taxas: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.totalTaxasSigned || 0), 0)),
      lancamentos: round2(subclubs.reduce((s, sc) => s + (sc.totalLancamentos || 0), 0)),
      acertoLiga: round2(subclubs.reduce((s, sc) => s + (sc.acertoLiga || 0), 0)),
      players: subclubs.reduce((s, sc) => s + (sc.totals?.players || 0), 0),
      rake: round2(subclubs.reduce((s, sc) => s + (sc.totals?.rake || 0), 0)),
      ggr: round2(subclubs.reduce((s, sc) => s + (sc.totals?.ggr || 0), 0)),
    }),
    [subclubs],
  );

  // Global fees breakdown
  const globalFees = useMemo(() => ({
    taxaApp: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.taxaApp || 0), 0)),
    taxaLiga: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.taxaLiga || 0), 0)),
    taxaRodeoGGR: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.taxaRodeoGGR || 0), 0)),
    taxaRodeoApp: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.taxaRodeoApp || 0), 0)),
    total: round2(subclubs.reduce((s, sc) => s + (sc.feesComputed?.totalTaxasSigned || 0), 0)),
  }), [subclubs]);

  // Global adjustments breakdown
  const globalAdj = useMemo(() => {
    const overlay = round2(subclubs.reduce((s, sc) => s + (sc.adjustments?.overlay || 0), 0));
    const compras = round2(subclubs.reduce((s, sc) => s + (sc.adjustments?.compras || 0), 0));
    const security = round2(subclubs.reduce((s, sc) => s + (sc.adjustments?.security || 0), 0));
    const outros = round2(subclubs.reduce((s, sc) => s + (sc.adjustments?.outros || 0), 0));
    const overlayCount = subclubs.filter((sc) => Math.abs(sc.adjustments?.overlay || 0) > 0.01).length;
    return {
      overlay, compras, security, outros,
      overlayCount,
      total: round2(overlay + compras + security + outros),
    };
  }, [subclubs]);

  const selectedWeek = settlements.find((s) => s.id === selectedId);

  type LigaSortKey = 'name' | 'players' | 'ganhos' | 'rake' | 'ggr' | 'resultado' | 'taxas' | 'lancamentos' | 'acertoLiga';

  const getSortValue = useCallback((sc: SubclubData, key: LigaSortKey): string | number => {
    switch (key) {
      case 'name': return sc.name;
      case 'players': return sc.totals?.players || 0;
      case 'ganhos': return sc.totals?.ganhos || 0;
      case 'rake': return sc.totals?.rake || 0;
      case 'ggr': return sc.totals?.ggr || 0;
      case 'resultado': return sc.totals?.resultado || 0;
      case 'taxas': return sc.feesComputed?.totalTaxasSigned || 0;
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

  function handleCsvExport() {
    const headers = ['Clube', 'Jogadores', 'P/L', 'Rake', 'GGR', 'Resultado', 'Taxas', 'Ajustes', 'Acerto Liga'];
    const rows = sortedSubclubs.map((sc) => [
      sc.name,
      sc.totals?.players || 0,
      sc.totals?.ganhos || 0,
      sc.totals?.rake || 0,
      sc.totals?.ggr || 0,
      sc.totals?.resultado || 0,
      sc.feesComputed?.totalTaxasSigned || 0,
      sc.totalLancamentos || 0,
      sc.acertoLiga || 0,
    ]);
    exportCsv(`liga_global_${fmtDate(selectedWeek?.week_start)}`, headers, rows);
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl">
        <div className="h-8 skeleton-shimmer rounded w-48 mb-2" />
        <div className="h-4 skeleton-shimmer rounded w-72 mb-6" />
        <KpiSkeleton count={5} />
        <TableSkeleton columns={9} rows={6} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-white">Liga — Consolidado</h2>
          <p className="text-dark-400 text-sm">
            Acerto global da liga · Todos os clubes · Sem rakeback
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={handleCsvExport}
            className="btn-ghost text-xs flex items-center gap-1.5 shrink-0"
            title="Exportar CSV"
            disabled={subclubs.length === 0}
          >
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={() => setShowConsolidado(true)}
            disabled={subclubs.length === 0}
            className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Consolidado
          </button>
        </div>
      </div>

      {loadingFull ? (
        <div>
          <KpiSkeleton count={5} />
          <TableSkeleton columns={9} rows={6} />
        </div>
      ) : subclubs.length === 0 ? (
        <div className="card">
          <EmptyState icon={LayoutGrid} title="Nenhum subclube" description="Selecione uma semana com dados importados" />
        </div>
      ) : (
        <>
          {/* ═══ KPIs ═══ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
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
              subtitle={'\u03A3 (P/L + RAKE + GGR)'}
              value={formatBRL(grandTotal.resultado)}
              accentColor={grandTotal.resultado >= 0 ? 'bg-poker-500' : 'bg-red-500'}
              valueColor={grandTotal.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}
            />
            <KpiCard
              label="Total Taxas"
              value={formatBRL(grandTotal.taxas)}
              accentColor="bg-red-500"
              valueColor="text-red-400"
            />
          </div>

          {/* ═══ TAXAS + LANCAMENTOS (side-by-side) ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Taxas Automaticas */}
            <div>
              <h3 className="text-xs text-dark-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm" />
                Taxas Automaticas
              </h3>
              <div className="card p-0 overflow-hidden">
                <div className="divide-y divide-dark-700/30">
                  <TaxRow label="Taxa Aplicativo" desc="8% do Rake" value={-globalFees.taxaApp} />
                  <TaxRow label="Taxa Liga" desc="10% do Rake" value={-globalFees.taxaLiga} />
                  <TaxRow label="Taxa Rodeo GGR" desc="12% do GGR (por clube se GGR>0)" value={-globalFees.taxaRodeoGGR} />
                  <TaxRow label="Taxa Rodeo App" desc="8% do GGR (por clube se GGR>0)" value={-globalFees.taxaRodeoApp} />
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-800/30">
                    <span className="text-xs font-bold text-red-400">Total Taxas</span>
                    <span className="font-mono text-sm font-bold text-red-400">{formatBRL(globalFees.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lancamentos */}
            <div>
              <h3 className="text-xs text-dark-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm" />
                Lancamentos <span className="text-dark-600 font-normal">(editaveis em lancamentos)</span>
              </h3>
              <div className="card p-0 overflow-hidden">
                <div className="divide-y divide-dark-700/30">
                  <AdjRow
                    label="Overlay Global"
                    desc={globalAdj.overlayCount > 0 ? `R$ ${round2(globalAdj.overlay / globalAdj.overlayCount).toFixed(2)} > ${globalAdj.overlayCount} clubes` : ''}
                    value={globalAdj.overlay}
                  />
                  <AdjRow label="Compras" desc={`\u03A3 clubes`} value={globalAdj.compras} />
                  <AdjRow label="Security" desc={`\u03A3 clubes`} value={globalAdj.security} />
                  <AdjRow label="Outros" desc={`\u03A3 clubes`} value={globalAdj.outros} />
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-800/30">
                    <span className="text-xs font-bold text-amber-400">Total Ajustes</span>
                    <span className={`font-mono text-sm font-bold ${globalAdj.total < -0.01 ? 'text-red-400' : globalAdj.total > 0.01 ? 'text-emerald-400' : 'text-dark-400'}`}>
                      {formatBRL(globalAdj.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ACERTO TOTAL LIGA (GLOBAL) ═══ */}
          <div
            className={`mb-6 rounded-xl p-5 border-2 ${
              grandTotal.acertoLiga > 0.01
                ? 'bg-poker-950/40 border-poker-700/60'
                : grandTotal.acertoLiga < -0.01
                  ? 'bg-red-950/30 border-red-700/50'
                  : 'bg-dark-800/50 border-dark-600/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-dark-400 uppercase tracking-wider font-medium mb-1">
                  Acerto Total Liga (Global)
                </p>
                <p className="text-dark-500 text-xs">
                  {'\u03A3'} Resultados - {'\u03A3'} Taxas + Lancamentos
                </p>
              </div>
              <div className="text-right">
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
                {Math.abs(grandTotal.acertoLiga) > 0.01 && (
                  <p className={`text-xs mt-1 flex items-center justify-end gap-1.5 ${
                    grandTotal.acertoLiga > 0 ? 'text-poker-400' : 'text-red-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${grandTotal.acertoLiga > 0 ? 'bg-poker-400' : 'bg-red-400'}`} />
                    {selectedWeek?.club_name || 'Clube'} deve pagar {'\u00E0'} Liga
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ═══ DETALHAMENTO POR CLUBE ═══ */}
          <h3 className="text-xs text-dark-400 uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm" />
            Detalhamento por Clube
          </h3>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm data-table" aria-label="Detalhamento por clube">
                <thead>
                  <tr className="bg-dark-800/50 text-dark-400 text-xs uppercase tracking-wider">
                    <th scope="col" className="px-4 py-3 text-left font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('name')} role="columnheader" aria-sort={ariaSort('name')}>
                      Clube{sortIcon('name')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-center font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('players')} role="columnheader" aria-sort={ariaSort('players')}>
                      Jog.{sortIcon('players')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('ganhos')} role="columnheader" aria-sort={ariaSort('ganhos')}>
                      P/L{sortIcon('ganhos')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('rake')} role="columnheader" aria-sort={ariaSort('rake')}>
                      Rake{sortIcon('rake')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('ggr')} role="columnheader" aria-sort={ariaSort('ggr')}>
                      GGR{sortIcon('ggr')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('resultado')} role="columnheader" aria-sort={ariaSort('resultado')}>
                      Resultado{sortIcon('resultado')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('taxas')} role="columnheader" aria-sort={ariaSort('taxas')}>
                      Taxas{sortIcon('taxas')}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('lancamentos')} role="columnheader" aria-sort={ariaSort('lancamentos')}>
                      Ajustes{sortIcon('lancamentos')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium cursor-pointer hover:text-dark-200" onClick={() => handleSort('acertoLiga')} role="columnheader" aria-sort={ariaSort('acertoLiga')}>
                      Acerto Liga{sortIcon('acertoLiga')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/50">
                  {sortedSubclubs.map((sc, i) => {
                    const ganhos = sc.totals?.ganhos || 0;
                    const rake = sc.totals?.rake || 0;
                    const ggr = sc.totals?.ggr || 0;
                    const resultado = sc.totals?.resultado || 0;
                    const taxas = sc.feesComputed?.totalTaxasSigned || 0;
                    const ajustes = sc.totalLancamentos || 0;
                    const acerto = sc.acertoLiga || 0;

                    return (
                      <tr key={sc.name || i}>
                        <td className="px-4 py-3 text-white font-medium">
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
                        <td className={`px-3 py-3 text-right font-mono ${ganhos < -0.01 ? 'text-red-400' : ganhos > 0.01 ? 'text-poker-400' : 'text-dark-500'}`}>
                          {formatBRL(ganhos)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-emerald-400">
                          {formatBRL(rake)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono ${ggr > 0.01 ? 'text-amber-400' : 'text-dark-500'}`}>
                          {formatBRL(ggr)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono ${resultado < -0.01 ? 'text-red-400' : resultado > 0.01 ? 'text-poker-400' : 'text-dark-500'}`}>
                          {formatBRL(resultado)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-red-400">
                          {formatBRL(taxas)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono ${ajustes < -0.01 ? 'text-red-400' : ajustes > 0.01 ? 'text-emerald-400' : 'text-dark-500'}`}>
                          {formatBRL(ajustes)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${acerto > 0.01 ? 'text-poker-400' : acerto < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
                          {formatBRL(acerto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Total footer */}
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="bg-dark-900/95 backdrop-blur-sm font-semibold border-t-2 border-dark-600">
                    <td className="px-4 py-3 text-white font-bold">TOTAL</td>
                    <td className="px-3 py-3 text-center text-white">{grandTotal.players}</td>
                    <td className={`px-3 py-3 text-right font-mono ${grandTotal.ganhos < -0.01 ? 'text-red-400' : grandTotal.ganhos > 0.01 ? 'text-poker-400' : 'text-dark-500'}`}>
                      {formatBRL(grandTotal.ganhos)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-400">
                      {formatBRL(grandTotal.rake)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${grandTotal.ggr > 0.01 ? 'text-amber-400' : 'text-dark-500'}`}>
                      {formatBRL(grandTotal.ggr)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${grandTotal.resultado < -0.01 ? 'text-red-400' : grandTotal.resultado > 0.01 ? 'text-poker-400' : 'text-dark-500'}`}>
                      {formatBRL(grandTotal.resultado)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-400">
                      {formatBRL(grandTotal.taxas)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${grandTotal.lancamentos < -0.01 ? 'text-red-400' : grandTotal.lancamentos > 0.01 ? 'text-emerald-400' : 'text-dark-500'}`}>
                      {formatBRL(grandTotal.lancamentos)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${grandTotal.acertoLiga > 0.01 ? 'text-poker-400' : grandTotal.acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-300'}`}>
                      {formatBRL(grandTotal.acertoLiga)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Consolidado WhatsApp Modal ─────────────────────────── */}
      {showConsolidado && (() => {
        const weekEnd = selectedWeek ? (() => {
          const d = new Date(selectedWeek.week_start + 'T00:00:00');
          d.setDate(d.getDate() + 6);
          return d.toISOString().split('T')[0];
        })() : undefined;

        const msg = buildLigaMessage({
          weekStart: selectedWeek?.week_start,
          weekEnd,
          totalPlayers: grandTotal.players,
          totalRake: grandTotal.rake,
          totalResult: grandTotal.resultado,
          totalTaxas: grandTotal.taxas,
          clubs: subclubs.map((sc) => ({ name: sc.name, acertoLiga: sc.acertoLiga })),
          acertoTotal: grandTotal.acertoLiga,
        });

        async function copyMsg() {
          try {
            await navigator.clipboard.writeText(msg);
            toast('Mensagem copiada!', 'success');
          } catch {
            toast('Erro ao copiar', 'error');
          }
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowConsolidado(false); }}>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg mx-4 animate-slide-up">
              <div className="bg-dark-900 border border-dark-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Consolidado Liga</h3>
                  <button onClick={() => setShowConsolidado(false)} className="text-dark-500 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-dark-800/80 border border-dark-700 transition-colors">✕</button>
                </div>

                <div className="bg-dark-800 rounded-lg p-4 font-mono text-xs text-dark-300 whitespace-pre-wrap mb-4 max-h-80 overflow-y-auto border border-dark-700/50">
                  {msg}
                </div>

                <button onClick={copyMsg} className="w-full px-4 py-2 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-lg text-sm transition-colors">
                  📋 Copiar Mensagem
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────

function TaxRow({ label, desc, value }: { label: string; desc: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <span className="text-sm text-dark-200">{label}</span>
        {desc && <span className="text-[10px] text-dark-500 ml-2">{desc}</span>}
      </div>
      <span className={`font-mono text-sm ${value < -0.01 ? 'text-red-400' : value > 0.01 ? 'text-emerald-400' : 'text-dark-500'}`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}

function AdjRow({ label, desc, value }: { label: string; desc: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <span className={`text-sm font-medium ${Math.abs(value) > 0.01 ? 'text-dark-200' : 'text-dark-500'}`}>{label}</span>
        {desc && <span className="text-[10px] text-dark-500 ml-2">{desc}</span>}
      </div>
      <span className={`font-mono text-sm ${value < -0.01 ? 'text-red-400' : value > 0.01 ? 'text-emerald-400' : 'text-dark-500'}`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}
