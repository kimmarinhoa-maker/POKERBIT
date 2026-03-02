'use client';

import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/api';
import { round2, normalizeKey } from '@/lib/formatters';
import { buildLigaMessage } from '@/lib/whatsappMessages';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import KpiCard from '@/components/ui/KpiCard';
import { SubclubData } from '@/types/settlement';
import { calcDRE } from './DRE';

interface Props {
  subclubs: SubclubData[];
  currentSubclubName: string;
  logoMap?: Record<string, string | null>;
  weekStart?: string;
  weekEnd?: string;
}

export default function Liga({ subclubs, currentSubclubName, logoMap = {}, weekStart, weekEnd }: Props) {
  const { toast } = useToast();
  const [showLigaMsg, setShowLigaMsg] = useState(false);
  const grandTotal = useMemo(
    () => ({
      resultado: round2(subclubs.reduce((s, sc) => s + sc.totals.resultado, 0)),
      taxasSigned: round2(subclubs.reduce((s, sc) => s + sc.feesComputed.totalTaxasSigned, 0)),
      lancamentos: round2(subclubs.reduce((s, sc) => s + sc.totalLancamentos, 0)),
      acertoLiga: round2(subclubs.reduce((s, sc) => s + sc.acertoLiga, 0)),
    }),
    [subclubs],
  );

  // ─── DRE Consolidado ──────────────────────────────────────────────
  const dreConsolidado = useMemo(() => {
    const perClub = subclubs.map((sc) => calcDRE(sc));
    const receitaBruta = round2(perClub.reduce((s, d) => s + d.receitaBruta, 0));
    const totalTaxas = round2(perClub.reduce((s, d) => s + d.totalTaxas, 0));
    const totalCustos = round2(perClub.reduce((s, d) => s + d.totalCustos, 0));
    const totalRakeback = round2(perClub.reduce((s, d) => s + d.totalRakeback, 0));
    const lucroLiquido = round2(receitaBruta - totalTaxas - totalCustos - totalRakeback);
    const margem = receitaBruta > 0.01 ? round2((lucroLiquido / receitaBruta) * 100) : 0;
    return { receitaBruta, totalTaxas, totalCustos, totalRakeback, lucroLiquido, margem };
  }, [subclubs]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Visao Liga</h2>
          <p className="text-dark-400 text-sm">Acerto consolidado — {subclubs.length} subclubes</p>
        </div>
        <button
          onClick={() => setShowLigaMsg(true)}
          className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Consolidado
        </button>
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
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
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
                          logoUrl={logoMap[normalizeKey(sc.name)]}
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
            </tbody>
            {/* Total row (sticky bottom) */}
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-dark-900/95 backdrop-blur-sm border-t-2 border-dark-700">
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
      {/* ── DRE Consolidado ─────────────────────────────────────── */}
      <div
        className={`mt-4 rounded-xl p-5 border-2 ${
          dreConsolidado.lucroLiquido >= 0
            ? 'border-green-500/40 bg-green-500/5'
            : 'border-red-500/40 bg-red-500/5'
        }`}
      >
        <div className="mb-4">
          <h3 className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">DRE Consolidado — Lucro do Operador</h3>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-dark-400">Receita Bruta Total</span>
            <span className="font-mono text-blue-400 font-semibold">{formatBRL(dreConsolidado.receitaBruta)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-dark-400">(-) Total Taxas</span>
            <span className="font-mono text-red-400">{formatBRL(-dreConsolidado.totalTaxas)}</span>
          </div>
          {dreConsolidado.totalCustos > 0.01 && (
            <div className="flex justify-between items-center">
              <span className="text-dark-400">(-) Total Custos</span>
              <span className="font-mono text-orange-400">{formatBRL(-dreConsolidado.totalCustos)}</span>
            </div>
          )}
          {dreConsolidado.totalRakeback > 0.01 && (
            <div className="flex justify-between items-center">
              <span className="text-dark-400">(-) Total Rakeback</span>
              <span className="font-mono text-amber-400">{formatBRL(-dreConsolidado.totalRakeback)}</span>
            </div>
          )}

          <div className="border-t-2 border-dark-600/60 pt-3 mt-3 flex items-center justify-between">
            <div>
              <span className="text-base font-bold text-white">LUCRO LÍQUIDO CONSOLIDADO</span>
              <span className={`ml-3 text-xs ${dreConsolidado.margem >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                Margem: {dreConsolidado.margem.toFixed(1)}%
              </span>
            </div>
            <span
              className={`font-mono text-2xl font-extrabold ${
                dreConsolidado.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'
              } explainable inline-block`}
              title={`Lucro = ${formatBRL(dreConsolidado.receitaBruta)} - ${formatBRL(dreConsolidado.totalTaxas)} - ${formatBRL(dreConsolidado.totalCustos)} - ${formatBRL(dreConsolidado.totalRakeback)}`}
            >
              {formatBRL(dreConsolidado.lucroLiquido)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Consolidado WhatsApp Modal ─────────────────────────── */}
      {showLigaMsg && (() => {
        const totalPlayers = subclubs.reduce((s, sc) => s + sc.totals.players, 0);
        const totalRake = subclubs.reduce((s, sc) => s + sc.totals.rake, 0);
        const msg = buildLigaMessage({
          weekStart,
          weekEnd,
          totalPlayers,
          totalRake,
          totalResult: grandTotal.resultado,
          totalTaxas: grandTotal.taxasSigned,
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
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowLigaMsg(false); }}>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg mx-4 animate-slide-up">
              <div className="bg-dark-900 border border-dark-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Consolidado Liga</h3>
                  <button onClick={() => setShowLigaMsg(false)} className="text-dark-500 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-dark-800/80 border border-dark-700 transition-colors">✕</button>
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
