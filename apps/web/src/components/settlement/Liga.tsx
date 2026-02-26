'use client';

import { useMemo } from 'react';
import { formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import ClubLogo from '@/components/ClubLogo';
import KpiCard from '@/components/ui/KpiCard';
import { SubclubData } from '@/types/settlement';

interface Props {
  subclubs: SubclubData[];
  currentSubclubName: string;
  logoMap?: Record<string, string | null>;
}

export default function Liga({ subclubs, currentSubclubName, logoMap = {} }: Props) {
  const grandTotal = useMemo(
    () => ({
      resultado: round2(subclubs.reduce((s, sc) => s + sc.totals.resultado, 0)),
      taxasSigned: round2(subclubs.reduce((s, sc) => s + sc.feesComputed.totalTaxasSigned, 0)),
      lancamentos: round2(subclubs.reduce((s, sc) => s + sc.totalLancamentos, 0)),
      acertoLiga: round2(subclubs.reduce((s, sc) => s + sc.acertoLiga, 0)),
    }),
    [subclubs],
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Visao Liga</h2>
          <p className="text-dark-400 text-sm">Acerto consolidado — {subclubs.length} subclubes</p>
        </div>
      </div>

      {/* KPI Cards - 4 columns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Resultado Total"
          value={formatBRL(grandTotal.resultado)}
          accentColor={grandTotal.resultado >= 0 ? 'bg-poker-500' : 'bg-red-500'}
          valueColor={grandTotal.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}
          tooltip={`Soma dos resultados de ${subclubs.length} subclubes = ${formatBRL(grandTotal.resultado)}`}
        />
        <KpiCard
          label="Total Taxas"
          value={formatBRL(grandTotal.taxasSigned)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          tooltip={`totalTaxasSigned = -(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp) consolidado = ${formatBRL(grandTotal.taxasSigned)}`}
        />
        <KpiCard
          label="Lancamentos"
          value={formatBRL(grandTotal.lancamentos)}
          accentColor={grandTotal.lancamentos !== 0 ? 'bg-blue-500' : 'bg-dark-600'}
          valueColor={grandTotal.lancamentos !== 0 ? 'text-blue-400' : 'text-dark-500'}
          tooltip={`Soma dos lancamentos (overlay + compras + security + outros) = ${formatBRL(grandTotal.lancamentos)}`}
        />
        <KpiCard
          label="Acerto Liga"
          value={formatBRL(grandTotal.acertoLiga)}
          accentColor={grandTotal.acertoLiga >= 0 ? 'bg-amber-500' : 'bg-red-500'}
          valueColor={grandTotal.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}
          ring="ring-1 ring-amber-700/30"
          tooltip={`acertoLiga = resultado + taxas + lancamentos = ${formatBRL(grandTotal.resultado)} + ${formatBRL(grandTotal.taxasSigned)} + ${formatBRL(grandTotal.lancamentos)}`}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm data-table">
            <thead className="sticky top-0 z-10">
              <tr className="bg-dark-800/80 backdrop-blur-sm">
                <th className="px-5 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Subclube</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Resultado</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Taxas</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Lancamentos</th>
                <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Acerto Liga</th>
                <th className="px-5 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Direcao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30">
              {subclubs.map((sc) => {
                const isCurrent = sc.name === currentSubclubName;
                return (
                  <tr
                    key={sc.id || sc.name}
                    className={`transition-colors ${
                      isCurrent
                        ? 'bg-poker-900/20 border-l-2 border-poker-500'
                        : 'hover:bg-dark-800/20 transition-colors'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`font-medium flex items-center gap-2 ${isCurrent ? 'text-poker-400' : 'text-white'}`}
                      >
                        <ClubLogo
                          logoUrl={logoMap[sc.name.toLowerCase()]}
                          name={sc.name}
                          size="sm"
                          className="!w-6 !h-6 !text-[10px]"
                        />
                        {sc.name}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono ${
                        sc.totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'
                      }`}
                    >
                      {formatBRL(sc.totals.resultado)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-400">
                      {formatBRL(sc.feesComputed.totalTaxasSigned)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono ${
                        sc.totalLancamentos !== 0 ? 'text-dark-200' : 'text-dark-500'
                      }`}
                    >
                      {formatBRL(sc.totalLancamentos)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono font-semibold ${
                        sc.acertoLiga > 0.01
                          ? 'text-poker-400'
                          : sc.acertoLiga < -0.01
                            ? 'text-red-400'
                            : 'text-dark-500'
                      }`}
                    >
                      {formatBRL(sc.acertoLiga)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs ${
                          sc.acertoLiga > 0.01
                            ? 'text-poker-400'
                            : sc.acertoLiga < -0.01
                              ? 'text-red-400'
                              : 'text-dark-500'
                        }`}
                      >
                        {sc.acertoDirecao}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="bg-dark-900 border-t-2 border-dark-700">
                <td className="px-5 py-3 font-extrabold text-xs text-amber-400">TOTAL</td>
                <td
                  className={`px-3 py-3 text-right font-mono ${
                    grandTotal.resultado < 0 ? 'text-red-400' : 'text-poker-400'
                  }`}
                >
                  {formatBRL(grandTotal.resultado)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-red-400">{formatBRL(grandTotal.taxasSigned)}</td>
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
            </tbody>
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
            <p className="text-dark-500 text-xs">Soma de todos os subclubes</p>
          </div>
          <p
            className={`text-3xl font-bold font-mono ${
              grandTotal.acertoLiga > 0.01
                ? 'text-poker-400'
                : grandTotal.acertoLiga < -0.01
                  ? 'text-red-400'
                  : 'text-dark-300'
            } explainable inline-block`}
            title={`acertoLiga = resultado + taxas + lancamentos = ${formatBRL(grandTotal.resultado)} + ${formatBRL(grandTotal.taxasSigned)} + ${formatBRL(grandTotal.lancamentos)}`}
          >
            {formatBRL(grandTotal.acertoLiga)}
          </p>
        </div>
      </div>
    </div>
  );
}
