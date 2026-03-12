'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatBRL, round2, fmtDateTime } from '@/lib/formatters';

// ─── Types (standalone — no dependency on auth or settlement types) ──
interface AgentData {
  id: string;
  agent_name: string;
  agent_id: string | null;
  external_agent_id?: string | null;
  player_count: number;
  rake_total_brl: number;
  ganhos_total_brl: number;
  rb_rate?: number;
  commission_brl?: number;
  resultado_brl: number;
  is_direct?: boolean;
  payment_type?: 'fiado' | 'avista';
}

interface PlayerData {
  nickname: string | null;
  external_player_id: string | null;
  external_agent_id?: string | null;
  resultado_brl: number;
  rb_rate: number;
  rb_value_brl: number;
}

interface LedgerData {
  id: string;
  dir: 'IN' | 'OUT';
  amount: number;
  method?: string | null;
  bank_account_name?: string | null;
  created_at?: string;
}

interface ReceiptData {
  agent: AgentData;
  players: PlayerData[];
  ledgerEntries: LedgerData[];
  saldoAnterior: number;
  settlement: { id: string; week_start: string; week_end: string; status: string };
  subclubName: string;
  logoUrl: string | null;
  pixKey: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function fmtDate(dt: string): string {
  return new Date(dt + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function clrPrint(v: number): string {
  return v > 0.01
    ? 'text-emerald-400'
    : v < -0.01
      ? 'text-red-400'
      : 'text-dark-400';
}

// ─── Page ───────────────────────────────────────────────────────────

export default function ShortReceiptPage() {
  const params = useParams();
  const shortId = params.shortId as string;

  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/r/${shortId}`);
        const json = await res.json();
        if (!json.success) {
          setError(json.error || 'Link invalido ou expirado');
        } else {
          setData(json.data);
        }
      } catch {
        setError('Erro ao carregar comprovante');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [shortId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-dark-400 text-sm">Carregando comprovante...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-8 max-w-sm text-center">
          <div className="text-4xl mb-3">{String.fromCodePoint(0x1F6AB)}</div>
          <h1 className="text-lg font-bold text-dark-200 mb-2">Acesso negado</h1>
          <p className="text-dark-400 text-sm">{error || 'Link invalido ou expirado'}</p>
        </div>
      </div>
    );
  }

  // ─── Compute financials (same as ComprovantePage) ─────────────────
  const { agent, players, ledgerEntries, saldoAnterior, settlement, subclubName, logoUrl } = data;

  const isAvista = agent.payment_type === 'avista';
  const isDirect = agent.is_direct;

  const ganhos = Number(agent.ganhos_total_brl || 0);
  const rakeTotal = Number(agent.rake_total_brl || 0);
  const rbRate = Number(agent.rb_rate || 0);
  const rbAgente = Number(agent.commission_brl || 0);

  const resultadoBase = isAvista ? rbAgente : round2(ganhos + rbAgente);
  const totalDevido = round2(resultadoBase + saldoAnterior);

  const totalIn = ledgerEntries
    .filter((e) => e.dir === 'IN')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = ledgerEntries
    .filter((e) => e.dir === 'OUT')
    .reduce((s, e) => s + Number(e.amount), 0);
  const pago = round2(totalIn - totalOut);
  const pendente = round2(totalDevido + pago);

  const isQuitado = Math.abs(pendente) < 0.01 && (Math.abs(totalDevido) > 0.01 || Math.abs(pago) > 0.01);
  const isParcial = !isQuitado && Math.abs(pago) > 0.01;

  const totalResultado = players.reduce((s, p) => s + Number(p.resultado_brl), 0);
  const tipoLabel = isAvista ? 'A Vista' : 'Profit/Loss';

  const weekStart = settlement.week_start;
  const weekEnd = settlement.week_end || (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div className="min-h-screen bg-dark-950 py-6 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-6">
          {/* Header */}
          <div className="flex items-center gap-5 mb-5">
            {logoUrl ? (
              <img src={logoUrl} alt={subclubName} className="w-20 h-20 rounded-xl object-cover bg-dark-800 shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-dark-800 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-dark-500">
                  {(subclubName || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Fechamento Semanal</p>
              <h2 className="text-lg font-bold text-poker-400 mt-0.5">
                {agent.agent_name}
                {agent.external_agent_id && (
                  <span className="text-dark-500 text-xs font-mono ml-2">#{agent.external_agent_id}</span>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ml-2 align-middle ${
                  isAvista
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-poker-500/10 text-poker-400 border-poker-500/30'
                }`}>
                  {tipoLabel}
                </span>
              </h2>
              <p className="text-dark-400 text-xs mt-0.5">
                {fmtDate(weekStart)} a {fmtDate(weekEnd)} · {players.length} jogador{players.length !== 1 ? 'es' : ''} · {subclubName}
              </p>
            </div>
          </div>

          <div className="border-t border-dark-700/50 mb-4" />

          {/* Player Table */}
          {players.length > 0 && (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="py-1.5 text-left text-[10px] text-dark-500 uppercase font-bold tracking-wider">Jogador</th>
                  <th className="py-1.5 text-center text-[10px] text-dark-500 uppercase font-bold tracking-wider">ID</th>
                  {!isAvista && (
                    <th className="py-1.5 text-right text-[10px] text-dark-500 uppercase font-bold tracking-wider">Resultado</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30">
                {players.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-dark-200 text-sm">{p.nickname || '\u2014'}</td>
                    <td className="py-1.5 text-center text-dark-400 font-mono text-xs">{p.external_player_id || '\u2014'}</td>
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
                  <tr className="border-t border-dark-600/50">
                    <td className="py-2 text-dark-300 font-bold text-sm" colSpan={2}>TOTAL</td>
                    <td className={`py-2 text-right font-mono font-extrabold text-sm ${clrPrint(totalResultado)}`}>
                      {formatBRL(totalResultado)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* Financial Summary */}
          <div className="bg-dark-800/40 rounded-lg p-4 mb-4">
            <div className="space-y-1.5 text-sm">
              {!isAvista && (
                <div className="flex justify-between">
                  <span className="text-dark-300 text-xs">Ganhos (P/L)</span>
                  <span className={`font-mono text-xs font-bold ${clrPrint(ganhos)}`}>{formatBRL(ganhos)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-dark-400 text-xs">Rake Gerado <span className="text-dark-600">(informativo)</span></span>
                <span className="font-mono text-dark-400 text-xs">{formatBRL(rakeTotal)}</span>
              </div>
              {rbAgente > 0.01 && (
                <div className="flex justify-between">
                  <span className="text-dark-300 text-xs">{isDirect ? 'RB Individual' : `RB Agente (${rbRate}% do Rake)`}</span>
                  <span className={`font-mono text-xs font-bold ${isDirect ? 'text-blue-400' : 'text-purple-400'}`}>{formatBRL(rbAgente)}</span>
                </div>
              )}
              {Math.abs(saldoAnterior) > 0.01 && (
                <div className="flex justify-between">
                  <span className="text-dark-300 text-xs">Saldo Anterior</span>
                  <span className="font-mono text-xs font-bold text-amber-400">{formatBRL(saldoAnterior)}</span>
                </div>
              )}
              <div className="border-t border-dark-700/30 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-dark-200 font-bold text-sm">
                    Resultado Final
                    {isAvista && <span className="text-dark-500 text-[10px] ml-1 font-normal">(somente RB)</span>}
                  </span>
                  <span className={`font-mono font-extrabold text-base ${clrPrint(totalDevido)}`}>{formatBRL(totalDevido)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pagamentos */}
          {ledgerEntries.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] text-dark-500 uppercase font-bold tracking-wider">Pagamentos Registrados</h4>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                  isQuitado
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : isParcial
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-dark-700 text-dark-400 border-dark-600'
                }`}>
                  {isQuitado ? 'QUITADO' : isParcial ? 'PARCIALMENTE PAGO' : 'PENDENTE'}
                </span>
              </div>
              <div className="space-y-1.5">
                {ledgerEntries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {e.method && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-800 text-dark-300 font-bold uppercase">{e.method}</span>
                      )}
                      {e.bank_account_name && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-400 font-medium">
                          {e.bank_account_name}
                        </span>
                      )}
                      {e.created_at && (
                        <span className="text-dark-500 font-mono text-[10px]">{fmtDateTime(e.created_at)}</span>
                      )}
                    </div>
                    <span className={`font-mono font-bold ${e.dir === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {e.dir === 'OUT' ? '-' : ''}{formatBRL(Number(e.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saldo Atual */}
          <div className={`rounded-lg p-3 border ${
            isQuitado ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-dark-800/30 border-dark-700/50'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-dark-300 text-sm font-medium">Saldo atual</span>
              <div className="text-right">
                <span className={`font-mono font-extrabold text-lg ${clrPrint(pendente)}`}>{formatBRL(Math.abs(pendente))}</span>
                {Math.abs(pendente) > 0.01 && (
                  <span className={`block text-[10px] font-bold ${pendente > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                    {pendente > 0 ? 'a receber' : 'a pagar'}
                  </span>
                )}
                {Math.abs(pendente) < 0.01 && (
                  <span className="block text-[10px] font-bold text-emerald-400">quitado</span>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-5 pt-3 border-t border-dark-800/50">
            <p className="text-[10px] text-dark-600">
              {subclubName} · {tipoLabel} · {fmtDate(weekStart)} a {fmtDate(weekEnd)}
            </p>
            <p className="text-[9px] text-dark-700 mt-1">Gerado pelo PokerBit</p>
          </div>
        </div>
      </div>
    </div>
  );
}
