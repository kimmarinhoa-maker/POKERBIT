'use client';

import { useRef, useEffect } from 'react';
import { formatBRL, sendWhatsApp } from '@/lib/api';
import { round2, fmtDateTime } from '@/lib/formatters';
import { captureElement } from '@/lib/captureElement';
import { useToast } from '@/components/Toast';
import { AgentMetric, PlayerMetric, LedgerEntry } from '@/types/settlement';

export interface AgentFinancials {
  agent: AgentMetric;
  players: PlayerMetric[];
  entries: LedgerEntry[];
  ganhos: number;
  rakeTotal: number;
  rbAgente: number;
  resultado: number;
  saldoAnterior: number;
  totalDevido: number;
  totalIn: number;
  totalOut: number;
  pago: number;
  pendente: number;
}

function fmtDate(dt: string): string {
  const d = dt.split('T')[0];
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

function clrPrint(v: number) {
  if (v > 0.01) return 'text-emerald-400 print:text-green-700';
  if (v < -0.01) return 'text-red-400 print:text-red-700';
  return 'text-dark-400 print:text-gray-500';
}

interface Props {
  data: AgentFinancials;
  subclubName: string;
  clubExternalId?: string | null;
  weekStart: string;
  weekEnd: string;
  fechamentoTipo: 'avista' | 'profitloss';
  hidePlayers: boolean;
  logoUrl?: string | null;
  onBack: () => void;
}

export default function StatementView({
  data,
  subclubName,
  clubExternalId,
  weekStart,
  weekEnd,
  fechamentoTipo,
  hidePlayers,
  logoUrl,
  onBack: _onBack,
}: Props) {
  const { agent, players, entries } = data;
  const isDirect = agent.is_direct;
  const statementRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const isAvista = fechamentoTipo === 'avista';

  const resultadoBase = isAvista ? data.rbAgente : round2(data.ganhos + data.rbAgente);
  const totalDevido = round2(resultadoBase + data.saldoAnterior);
  const pendente = round2(totalDevido + data.pago);

  const isQuitado = Math.abs(pendente) < 0.01 && (Math.abs(totalDevido) > 0.01 || Math.abs(data.pago) > 0.01);
  const isParcial = !isQuitado && Math.abs(data.pago) > 0.01;

  const totalResultado = players.reduce((s, p) => s + Number(p.resultado_brl), 0);
  const tipoLabel = isAvista ? 'A Vista' : 'Profit/Loss';

  useEffect(() => {
    async function handleExport() {
      if (!statementRef.current) return;
      try {
        const canvas = await captureElement(statementRef.current);
        if (!canvas) return;
        const link = document.createElement('a');
        const safeName = agent.agent_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        link.download = `comprovante_${safeName}_${fechamentoTipo}_${weekStart}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
        toast('JPG exportado!', 'success');
      } catch {
        toast('Erro ao exportar JPG', 'error');
      }
    }

    async function handleCopy() {
      if (!statementRef.current) return;
      try {
        const canvas = await captureElement(statementRef.current);
        if (!canvas) return;
        canvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            toast('Comprovante copiado!', 'success');
          }
        }, 'image/png');
      } catch {
        toast('Erro ao copiar', 'error');
      }
    }

    async function handleWhatsApp(e: Event) {
      const phone = (e as CustomEvent).detail?.phone || '';
      if (!statementRef.current) return;
      if (!phone) {
        toast('Nenhum telefone cadastrado. Cadastre em Jogadores.', 'info');
        return;
      }
      try {
        toast('Enviando comprovante via WhatsApp...', 'info');
        const canvas = await captureElement(statementRef.current);
        if (!canvas) return;
        const base64 = canvas.toDataURL('image/png');
        const safeName = agent.agent_name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanPhone = String(phone).replace(/\D/g, '');

        const res = await sendWhatsApp({
          phone: cleanPhone,
          imageBase64: base64,
          caption: `Comprovante - ${agent.agent_name}`,
          fileName: `comprovante_${safeName}.png`,
        });

        if (res.success) {
          toast('Comprovante enviado via WhatsApp!', 'success');
        } else {
          const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          }
          toast(res.error || 'Evolution API indisponivel. Comprovante copiado, cole no WhatsApp.', 'info');
          const fallbackMsg = encodeURIComponent(`Comprovante - ${agent.agent_name} (${weekStart})`);
          window.open(`https://wa.me/${cleanPhone}?text=${fallbackMsg}`, '_blank');
        }
      } catch {
        toast('Erro ao enviar. Verifique a config em Configuracoes > WhatsApp.', 'error');
      }
    }

    window.addEventListener('comprovante-export-jpg', handleExport);
    window.addEventListener('comprovante-copy', handleCopy);
    window.addEventListener('comprovante-whatsapp', handleWhatsApp);
    return () => {
      window.removeEventListener('comprovante-export-jpg', handleExport);
      window.removeEventListener('comprovante-copy', handleCopy);
      window.removeEventListener('comprovante-whatsapp', handleWhatsApp);
    };
  }, [agent.agent_name, fechamentoTipo, weekStart, toast]);

  return (
    <div>
      <div
        ref={statementRef}
        className="bg-dark-900 border border-dark-700 rounded-xl p-6 print:bg-white print:text-black print:border-none print:shadow-none max-w-2xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-5 mb-5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={subclubName}
              className="w-20 h-20 rounded-xl object-cover bg-dark-800 shrink-0"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-dark-800 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-dark-500">{(subclubName || '?').charAt(0).toUpperCase()}</span>
            </div>
          )}

          <div className="min-w-0">
            <p className="text-[10px] text-dark-500 print:text-gray-400 uppercase tracking-wider font-bold">
              Fechamento Semanal
            </p>
            <h2 className="text-lg font-bold text-poker-400 print:text-black mt-0.5">
              {agent.agent_name}
              <span className="text-dark-500 print:text-gray-500 text-xs font-mono ml-2">
                {(() => {
                  const extId = agent.external_agent_id || players[0]?.external_agent_id;
                  return extId ? `#${extId}` : '';
                })()}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ml-2 align-middle ${
                isAvista
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 print:text-green-700 print:border-green-600'
                  : 'bg-poker-500/10 text-poker-400 border-poker-500/30 print:text-blue-700 print:border-blue-600'
              }`}>
                {tipoLabel}
              </span>
            </h2>
            <p className="text-dark-400 print:text-gray-500 text-xs mt-0.5">
              {fmtDate(weekStart)} a {fmtDate(weekEnd)} · {players.length} jogador{players.length !== 1 ? 'es' : ''} · {subclubName}
              {clubExternalId && <span className="font-mono ml-1">(ID: {clubExternalId})</span>}
            </p>
          </div>
        </div>

        <div className="border-t border-dark-700/50 print:border-gray-300 mb-4" />

        {/* Player Table */}
        {!hidePlayers && (
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-dark-700/50 print:border-gray-300">
                <th className="py-1.5 text-left text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">Jogador</th>
                <th className="py-1.5 text-center text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">ID</th>
                {!isAvista && (
                  <th className="py-1.5 text-right text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">Resultado</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30 print:divide-gray-200">
              {players.map((p, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-dark-200 print:text-black text-sm">
                    {p.nickname || '—'}
                  </td>
                  <td className="py-1.5 text-center text-dark-400 print:text-gray-600 font-mono text-xs">
                    {p.external_player_id || '—'}
                  </td>
                  {!isAvista && (
                    <td className={`py-1.5 text-right font-mono font-bold text-sm ${clrPrint(Number(p.resultado_brl))}`}>
                      {formatBRL(Number(p.resultado_brl))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {!isAvista && (
              <tfoot>
                <tr className="border-t border-dark-600/50 print:border-gray-400">
                  <td className="py-2 text-dark-300 print:text-black font-bold text-sm" colSpan={2}>TOTAL</td>
                  <td className={`py-2 text-right font-mono font-extrabold text-sm ${clrPrint(totalResultado)}`}>
                    {formatBRL(totalResultado)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* Financial Summary */}
        <div className="bg-dark-800/40 print:bg-gray-50 rounded-lg p-4 mb-4">
          <div className="space-y-1.5 text-sm">
            {!isAvista && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">Ganhos (P/L)</span>
                <span className={`font-mono text-xs font-bold ${clrPrint(data.ganhos)}`}>
                  {formatBRL(data.ganhos)}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-dark-400 print:text-gray-500 text-xs">Rake Gerado <span className="text-dark-600 print:text-gray-400">(informativo)</span></span>
              <span className="font-mono text-dark-400 print:text-gray-500 text-xs">{formatBRL(data.rakeTotal)}</span>
            </div>

            {data.rbAgente > 0.01 && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">
                  {isDirect ? 'RB Individual' : `RB Agente (${agent.rb_rate}% do Rake)`}
                </span>
                <span className={`font-mono text-xs font-bold ${isDirect ? 'text-blue-400 print:text-blue-700' : 'text-purple-400 print:text-purple-700'}`}>
                  {formatBRL(data.rbAgente)}
                </span>
              </div>
            )}

            {Math.abs(data.saldoAnterior) > 0.01 && (
              <div className="flex justify-between">
                <span className="text-dark-300 print:text-gray-600 text-xs">Saldo Anterior</span>
                <span className="font-mono text-xs font-bold text-amber-400 print:text-amber-700">
                  {formatBRL(data.saldoAnterior)}
                </span>
              </div>
            )}

            <div className="border-t border-dark-700/30 print:border-gray-300 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-dark-200 print:text-black font-bold text-sm">
                  Resultado Final
                  {isAvista && <span className="text-dark-500 text-[10px] ml-1 font-normal">(somente RB)</span>}
                </span>
                <span className={`font-mono font-extrabold text-base ${clrPrint(totalDevido)}`}>
                  {formatBRL(totalDevido)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pagamentos */}
        {entries.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] text-dark-500 print:text-gray-500 uppercase font-bold tracking-wider">
                Pagamentos Registrados
              </h4>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                isQuitado
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 print:text-green-700 print:border-green-600'
                  : isParcial
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 print:text-amber-700 print:border-amber-600'
                    : 'bg-dark-700 text-dark-400 border-dark-600 print:text-gray-600 print:border-gray-400'
              }`}>
                {isQuitado ? 'QUITADO' : isParcial ? 'PARCIALMENTE PAGO' : 'PENDENTE'}
              </span>
            </div>
            <div className="space-y-1.5">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {e.method && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-800 print:bg-gray-200 text-dark-300 print:text-gray-600 font-bold uppercase">
                        {e.method}
                      </span>
                    )}
                    <span className="text-dark-500 print:text-gray-500 font-mono text-[10px]">
                      {fmtDateTime(e.created_at!)}
                    </span>
                  </div>
                  <span className={`font-mono font-bold ${
                    e.dir === 'IN'
                      ? 'text-emerald-400 print:text-green-700'
                      : 'text-red-400 print:text-red-700'
                  }`}>
                    {e.dir === 'OUT' ? '-' : ''}{formatBRL(Number(e.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saldo Atual */}
        <div className={`rounded-lg p-3 border ${
          isQuitado
            ? 'bg-emerald-950/20 border-emerald-700/30 print:border-green-400 print:bg-green-50'
            : 'bg-dark-800/30 border-dark-700/50 print:border-gray-300 print:bg-gray-50'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-dark-300 print:text-gray-600 text-sm font-medium">Saldo atual</span>
            <div className="text-right">
              <span className={`font-mono font-extrabold text-lg ${clrPrint(pendente)}`}>
                {formatBRL(Math.abs(pendente))}
              </span>
              {Math.abs(pendente) > 0.01 && (
                <span className={`block text-[10px] font-bold ${pendente > 0 ? 'text-emerald-500 print:text-green-700' : 'text-red-400 print:text-red-700'}`}>
                  {pendente > 0 ? 'a receber' : 'a pagar'}
                </span>
              )}
              {Math.abs(pendente) < 0.01 && (
                <span className="block text-[10px] font-bold text-emerald-400 print:text-green-700">quitado</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 pt-3 border-t border-dark-800/50 print:border-gray-200">
          <p className="text-[10px] text-dark-600 print:text-gray-400">
            {subclubName}{clubExternalId ? ` (${clubExternalId})` : ''} · {tipoLabel} · Gerado em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
}
