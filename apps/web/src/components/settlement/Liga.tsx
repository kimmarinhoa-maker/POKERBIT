'use client';

import { useMemo } from 'react';
import { formatBRL } from '@/lib/api';

interface SubclubSummary {
  id: string;
  name: string;
  totals: { resultado: number };
  feesComputed: { totalTaxas: number; totalTaxasSigned: number };
  totalLancamentos: number;
  acertoLiga: number;
  acertoDirecao: string;
}

interface Props {
  subclubs: SubclubSummary[];
  currentSubclubName: string;
}

export default function Liga({ subclubs, currentSubclubName }: Props) {
  const grandTotal = useMemo(() => ({
    resultado: round2(subclubs.reduce((s, sc) => s + sc.totals.resultado, 0)),
    taxas: round2(subclubs.reduce((s, sc) => s + sc.feesComputed.totalTaxas, 0)),
    lancamentos: round2(subclubs.reduce((s, sc) => s + sc.totalLancamentos, 0)),
    acertoLiga: round2(subclubs.reduce((s, sc) => s + sc.acertoLiga, 0)),
  }), [subclubs]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
          🏆
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Visao Liga</h2>
          <p className="text-dark-400 text-sm">
            Acerto consolidado — {subclubs.length} subclubes
          </p>
        </div>
      </div>

      {/* KPI Cards - 4 columns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className={`h-1 ${grandTotal.resultado >= 0 ? 'bg-poker-500' : 'bg-red-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Resultado Total</p>
            <p className={`text-xl font-bold mt-2 font-mono ${grandTotal.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
              {formatBRL(grandTotal.resultado)}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-1 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Total Taxas</p>
            <p className="text-xl font-bold mt-2 font-mono text-red-400">
              {formatBRL(-grandTotal.taxas)}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className={`h-1 ${grandTotal.lancamentos !== 0 ? 'bg-blue-500' : 'bg-dark-600'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Lancamentos</p>
            <p className={`text-xl font-bold mt-2 font-mono ${grandTotal.lancamentos !== 0 ? 'text-blue-400' : 'text-dark-500'}`}>
              {formatBRL(grandTotal.lancamentos)}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden ring-1 ring-amber-700/30">
          <div className={`h-1 ${grandTotal.acertoLiga >= 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Acerto Liga</p>
            <p className={`text-xl font-bold mt-2 font-mono ${grandTotal.acertoLiga >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
              {formatBRL(grandTotal.acertoLiga)}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800/50">
                <th className="px-5 py-3 text-left font-medium text-xs text-dark-400">Subclube</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Resultado</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Taxas</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Lancamentos</th>
                <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Acerto Liga</th>
                <th className="px-5 py-3 text-left font-medium text-xs text-dark-400">Direcao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/50">
              {subclubs.map((sc) => {
                const isCurrent = sc.name === currentSubclubName;
                return (
                  <tr
                    key={sc.id || sc.name}
                    className={`transition-colors ${
                      isCurrent
                        ? 'bg-poker-900/20 border-l-2 border-poker-500'
                        : 'hover:bg-dark-800/20'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span className={`font-medium ${isCurrent ? 'text-poker-400' : 'text-white'}`}>
                        {sc.name}
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${
                      sc.totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'
                    }`}>
                      {formatBRL(sc.totals.resultado)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-400">
                      {formatBRL(sc.feesComputed.totalTaxasSigned)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${
                      sc.totalLancamentos !== 0 ? 'text-dark-200' : 'text-dark-500'
                    }`}>
                      {formatBRL(sc.totalLancamentos)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-semibold ${
                      sc.acertoLiga > 0.01 ? 'text-poker-400' : sc.acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-500'
                    }`}>
                      {formatBRL(sc.acertoLiga)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs ${
                        sc.acertoLiga > 0.01 ? 'text-poker-400' : sc.acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-500'
                      }`}>
                        {sc.acertoDirecao}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="bg-dark-800/50 font-semibold border-t-2 border-dark-600">
                <td className="px-5 py-3 text-white">TOTAL</td>
                <td className={`px-3 py-3 text-right font-mono ${
                  grandTotal.resultado < 0 ? 'text-red-400' : 'text-poker-400'
                }`}>
                  {formatBRL(grandTotal.resultado)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-red-400">
                  {formatBRL(-grandTotal.taxas)}
                </td>
                <td className={`px-3 py-3 text-right font-mono ${
                  grandTotal.lancamentos !== 0 ? 'text-dark-200' : 'text-dark-500'
                }`}>
                  {formatBRL(grandTotal.lancamentos)}
                </td>
                <td className={`px-3 py-3 text-right font-mono font-bold ${
                  grandTotal.acertoLiga > 0.01 ? 'text-poker-400' : grandTotal.acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-300'
                }`}>
                  {formatBRL(grandTotal.acertoLiga)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grand total card */}
      <div className={`mt-6 rounded-xl p-5 border-2 ${
        grandTotal.acertoLiga > 0.01
          ? 'bg-poker-950/40 border-poker-700/60'
          : grandTotal.acertoLiga < -0.01
            ? 'bg-red-950/30 border-red-700/50'
            : 'bg-dark-800/50 border-dark-600/50'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-dark-400 uppercase tracking-wider font-medium mb-1">
              Acerto Total Liga
            </p>
            <p className="text-dark-500 text-xs">
              Soma de todos os subclubes
            </p>
          </div>
          <p className={`text-3xl font-bold font-mono ${
            grandTotal.acertoLiga > 0.01 ? 'text-poker-400' : grandTotal.acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-300'
          }`}>
            {formatBRL(grandTotal.acertoLiga)}
          </p>
        </div>
      </div>
    </div>
  );
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
