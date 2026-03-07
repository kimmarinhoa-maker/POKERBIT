'use client';

import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/api';
import { round2, normalizeKey } from '@/lib/formatters';
import { buildLigaMessage } from '@/lib/whatsappMessages';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import { SubclubData } from '@/types/settlement';
import {
  TrendingUp, TrendingDown, Equal, Receipt, FileText,
  DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';

interface Props {
  subclubs: SubclubData[];
  currentSubclubName: string;
  logoMap?: Record<string, string | null>;
  weekStart?: string;
  weekEnd?: string;
  isConsolidated?: boolean;
}

export default function Liga({ subclubs, currentSubclubName, logoMap = {}, weekStart, weekEnd, isConsolidated }: Props) {
  const { toast } = useToast();
  const [showLigaMsg, setShowLigaMsg] = useState(false);

  const isSingle = subclubs.length === 1;
  const sc0 = subclubs[0];

  const grandTotal = useMemo(
    () => ({
      resultado: round2(subclubs.reduce((s, sc) => s + sc.totals.resultado, 0)),
      taxasSigned: round2(subclubs.reduce((s, sc) => s + sc.feesComputed.totalTaxasSigned, 0)),
      lancamentos: round2(subclubs.reduce((s, sc) => s + sc.totalLancamentos, 0)),
      acertoLiga: round2(subclubs.reduce((s, sc) => s + sc.acertoLiga, 0)),
      players: subclubs.reduce((s, sc) => s + sc.totals.players, 0),
      rake: round2(subclubs.reduce((s, sc) => s + sc.totals.rake, 0)),
    }),
    [subclubs],
  );

  // Color helper
  function valColor(v: number, pos = 'text-poker-400', neg = 'text-red-400', zero = 'text-dark-500') {
    return v > 0.01 ? pos : v < -0.01 ? neg : zero;
  }

  function dirIcon(v: number) {
    if (v > 0.01) return <ArrowUpRight size={14} className="text-poker-400" />;
    if (v < -0.01) return <ArrowDownRight size={14} className="text-red-400" />;
    return <Minus size={12} className="text-dark-500" />;
  }

  return (
    <div className="animate-tab-fade space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {isSingle ? `Liga · ${sc0.name}` : 'Visao Liga'}
          </h2>
          <p className="text-dark-500 text-xs mt-0.5">
            {isSingle
              ? `Acerto da liga para este subclube · ${weekStart || ''}`
              : `Acerto consolidado — ${subclubs.length} subclubes · ${weekStart || ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowLigaMsg(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600/10 border border-green-500/20 text-green-400 hover:bg-green-600/20 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Consolidado
        </button>
      </div>

      {/* ── Summary pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-blue-500/8 border-blue-500/20">
          <BarChart3 size={14} className="text-blue-400" />
          <span className="text-[11px] text-dark-400 font-medium">Resultado</span>
          <span className={`text-sm font-mono font-semibold ${valColor(grandTotal.resultado)}`}>
            {formatBRL(grandTotal.resultado)}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-red-500/8 border-red-500/20">
          <Receipt size={14} className="text-red-400" />
          <span className="text-[11px] text-dark-400 font-medium">Taxas</span>
          <span className="text-sm font-mono font-semibold text-red-400">
            {formatBRL(grandTotal.taxasSigned)}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-purple-500/8 border-purple-500/20">
          <FileText size={14} className="text-purple-400" />
          <span className="text-[11px] text-dark-400 font-medium">Lancamentos</span>
          <span className={`text-sm font-mono font-semibold ${valColor(grandTotal.lancamentos, 'text-purple-400', 'text-red-400')}`}>
            {formatBRL(grandTotal.lancamentos)}
          </span>
        </div>
        <div className="w-px h-6 bg-dark-700 mx-1" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-800/80 border border-dark-700">
          {grandTotal.acertoLiga > 0.01 ? <TrendingUp size={14} className="text-amber-400" /> :
           grandTotal.acertoLiga < -0.01 ? <TrendingDown size={14} className="text-red-400" /> :
           <Equal size={14} className="text-dark-500" />}
          <span className="text-[11px] text-dark-400 font-medium">Acerto Liga</span>
          <span className={`text-sm font-mono font-bold ${valColor(grandTotal.acertoLiga, 'text-amber-400')}`}>
            {formatBRL(grandTotal.acertoLiga)}
          </span>
        </div>
      </div>

      {/* ── Single subclub: detailed breakdown cards ── */}
      {isSingle && (
        <div className="space-y-3">
          {/* Formula card */}
          <div className="rounded-2xl border border-dark-700/50 bg-dark-900/50 p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-semibold mb-3">Formula do Acerto</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                    <BarChart3 size={14} className="text-blue-400" />
                  </div>
                  <span className="text-sm text-dark-300">Resultado</span>
                </div>
                <span className={`font-mono text-sm font-semibold ${valColor(sc0.totals.resultado)}`}>
                  {formatBRL(sc0.totals.resultado)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/20 flex items-center justify-center">
                    <Receipt size={14} className="text-red-400" />
                  </div>
                  <span className="text-sm text-dark-300">Taxas</span>
                </div>
                <span className="font-mono text-sm font-semibold text-red-400">
                  {formatBRL(sc0.feesComputed.totalTaxasSigned)}
                </span>
              </div>

              {/* Tax breakdown */}
              <div className="ml-9 space-y-1.5 text-xs">
                {sc0.feesComputed.taxaApp !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Taxa App</span>
                    <span className="font-mono">{formatBRL(-sc0.feesComputed.taxaApp)}</span>
                  </div>
                )}
                {sc0.feesComputed.taxaLiga !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Taxa Liga</span>
                    <span className="font-mono">{formatBRL(-sc0.feesComputed.taxaLiga)}</span>
                  </div>
                )}
                {sc0.feesComputed.taxaRodeoGGR !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Taxa Rodeo GGR</span>
                    <span className="font-mono">{formatBRL(-sc0.feesComputed.taxaRodeoGGR)}</span>
                  </div>
                )}
                {sc0.feesComputed.taxaRodeoApp !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Taxa Rodeo App</span>
                    <span className="font-mono">{formatBRL(-sc0.feesComputed.taxaRodeoApp)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                    <FileText size={14} className="text-purple-400" />
                  </div>
                  <span className="text-sm text-dark-300">Lancamentos</span>
                </div>
                <span className={`font-mono text-sm font-semibold ${valColor(sc0.totalLancamentos, 'text-purple-400', 'text-red-400')}`}>
                  {formatBRL(sc0.totalLancamentos)}
                </span>
              </div>

              {/* Lancamentos breakdown */}
              <div className="ml-9 space-y-1.5 text-xs">
                {sc0.adjustments.overlay !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Overlay</span>
                    <span className="font-mono">{formatBRL(sc0.adjustments.overlay)}</span>
                  </div>
                )}
                {sc0.adjustments.compras !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Compras</span>
                    <span className="font-mono">{formatBRL(sc0.adjustments.compras)}</span>
                  </div>
                )}
                {sc0.adjustments.security !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Security</span>
                    <span className="font-mono">{formatBRL(sc0.adjustments.security)}</span>
                  </div>
                )}
                {sc0.adjustments.outros !== 0 && (
                  <div className="flex justify-between text-dark-500">
                    <span>Outros</span>
                    <span className="font-mono">{formatBRL(sc0.adjustments.outros)}</span>
                  </div>
                )}
              </div>

              {/* Divider + Acerto */}
              <div className="border-t border-dark-700/50 pt-3 mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                    <DollarSign size={14} className="text-amber-400" />
                  </div>
                  <span className="text-sm font-semibold text-white">Acerto Liga</span>
                </div>
                <span className={`font-mono text-lg font-bold ${valColor(sc0.acertoLiga, 'text-amber-400')}`}>
                  {formatBRL(sc0.acertoLiga)}
                </span>
              </div>
            </div>
          </div>

          {/* Direction card */}
          <div className={`rounded-2xl border-2 p-5 ${
            sc0.acertoLiga > 0.01
              ? 'bg-poker-950/30 border-poker-700/40'
              : sc0.acertoLiga < -0.01
                ? 'bg-red-950/20 border-red-700/40'
                : 'bg-dark-800/30 border-dark-700/40'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {dirIcon(sc0.acertoLiga)}
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wider font-medium">Direcao</p>
                  <p className={`text-sm font-semibold ${valColor(sc0.acertoLiga, 'text-poker-400')}`}>
                    {sc0.acertoLiga > 0.01 ? 'A Receber' : sc0.acertoLiga < -0.01 ? 'A Pagar' : 'Zerado'}
                  </p>
                </div>
              </div>
              <span className={`text-2xl font-mono font-bold ${valColor(sc0.acertoLiga, 'text-poker-400')}`}>
                {formatBRL(sc0.acertoLiga)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Consolidated: subclube table ── */}
      {!isSingle && (
        <div className="bg-dark-900/50 border border-dark-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-800">
                <th className="px-4 py-3 text-left text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  Subclube
                </th>
                <th className="px-3 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  <div className="flex items-center justify-end gap-1.5">
                    <BarChart3 size={11} className="text-blue-400" />
                    Resultado
                  </div>
                </th>
                <th className="px-3 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  <div className="flex items-center justify-end gap-1.5">
                    <Receipt size={11} className="text-red-400" />
                    Taxas
                  </div>
                </th>
                <th className="px-3 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  <div className="flex items-center justify-end gap-1.5">
                    <FileText size={11} className="text-purple-400" />
                    Lancamentos
                  </div>
                </th>
                <th className="px-3 py-3 text-right text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  <div className="flex items-center justify-end gap-1.5">
                    <DollarSign size={11} className="text-amber-400" />
                    Acerto
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                  Direcao
                </th>
              </tr>
            </thead>
            <tbody>
              {subclubs.map((sc, idx) => {
                const isCurrent = sc.name === currentSubclubName;
                const isLast = idx === subclubs.length - 1;
                return (
                  <tr
                    key={sc.id || sc.name}
                    className={`transition-colors ${
                      isCurrent ? 'bg-poker-900/15' : 'hover:bg-dark-800/30'
                    } ${!isLast ? 'border-b border-dark-800/50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ClubLogo
                          logoUrl={logoMap[normalizeKey(sc.name)]}
                          name={sc.name}
                          size="sm"
                          className="!w-6 !h-6 !text-[10px]"
                        />
                        <span className={`font-medium text-[13px] ${isCurrent ? 'text-poker-400' : 'text-dark-100'}`}>
                          {sc.name}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-poker-500/10 text-poker-400 border border-poker-500/20">
                            ATUAL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right font-mono text-[13px] ${valColor(sc.totals.resultado)}`}>
                      {formatBRL(sc.totals.resultado)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-red-400">
                      {formatBRL(sc.feesComputed.totalTaxasSigned)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono text-[13px] ${valColor(sc.totalLancamentos, 'text-purple-400', 'text-red-400')}`}>
                      {formatBRL(sc.totalLancamentos)}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-semibold text-[13px] ${valColor(sc.acertoLiga, 'text-amber-400')}`}>
                      {formatBRL(sc.acertoLiga)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {dirIcon(sc.acertoLiga)}
                        <span className={`text-xs ${valColor(sc.acertoLiga, 'text-poker-400')}`}>
                          {sc.acertoLiga > 0.01 ? 'Receber' : sc.acertoLiga < -0.01 ? 'Pagar' : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {subclubs.length > 1 && (
              <tfoot>
                <tr className="border-t border-dark-700 bg-dark-900/80">
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-dark-400 uppercase tracking-wider font-bold">Total</span>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-bold text-[13px] ${valColor(grandTotal.resultado)}`}>
                    {formatBRL(grandTotal.resultado)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[13px] text-red-400">
                    {formatBRL(grandTotal.taxasSigned)}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-bold text-[13px] ${valColor(grandTotal.lancamentos, 'text-purple-400', 'text-red-400')}`}>
                    {formatBRL(grandTotal.lancamentos)}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-bold text-sm ${valColor(grandTotal.acertoLiga, 'text-amber-400')}`}>
                    {formatBRL(grandTotal.acertoLiga)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Acerto Total card ── */}
      {!isSingle && (
        <div className={`rounded-2xl border-2 p-5 ${
          grandTotal.acertoLiga > 0.01
            ? 'bg-poker-950/30 border-poker-700/40'
            : grandTotal.acertoLiga < -0.01
              ? 'bg-red-950/20 border-red-700/40'
              : 'bg-dark-800/30 border-dark-700/40'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-dark-400 uppercase tracking-wider font-medium mb-0.5">Acerto Total Liga</p>
              <p className="text-[11px] text-dark-500">Soma de {subclubs.length} subclubes</p>
            </div>
            <p
              className={`text-3xl font-bold font-mono ${valColor(grandTotal.acertoLiga, 'text-poker-400')} explainable`}
              title={`acertoLiga = resultado + taxas + lancamentos = ${formatBRL(grandTotal.resultado)} + ${formatBRL(grandTotal.taxasSigned)} + ${formatBRL(grandTotal.lancamentos)}`}
            >
              {formatBRL(grandTotal.acertoLiga)}
            </p>
          </div>
        </div>
      )}


      {/* ── Consolidado WhatsApp Modal ── */}
      {showLigaMsg && (() => {
        const msg = buildLigaMessage({
          weekStart,
          weekEnd,
          totalPlayers: grandTotal.players,
          totalRake: grandTotal.rake,
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
              <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Consolidado Liga</h3>
                  <button onClick={() => setShowLigaMsg(false)} className="text-dark-500 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-dark-800/80 border border-dark-700 transition-colors">✕</button>
                </div>
                <div className="bg-dark-800 rounded-xl p-4 font-mono text-xs text-dark-300 whitespace-pre-wrap mb-4 max-h-80 overflow-y-auto border border-dark-700/50">
                  {msg}
                </div>
                <button onClick={copyMsg} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-xl text-sm font-medium transition-colors border border-dark-700">
                  Copiar Mensagem
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
