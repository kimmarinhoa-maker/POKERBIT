'use client';

import { useEffect } from 'react';
import { formatBRL } from '@/lib/api';

export interface VerificadorStats {
  jogadores: number;
  entradas: number;
  saidas: number;
  impacto: number;
  taxas: number;
}

interface Props {
  extrato: VerificadorStats;
  ledger: VerificadorStats;
  onVerificado: (ok: boolean) => void;
}

interface ItemCheck {
  label: string;
  extrato: number;
  ledger: number;
  isCurrency: boolean;
}

export default function VerificadorConciliacao({ extrato, ledger, onVerificado }: Props) {
  const items: ItemCheck[] = [
    { label: 'Jogadores', extrato: extrato.jogadores, ledger: ledger.jogadores, isCurrency: false },
    { label: 'Entradas', extrato: extrato.entradas, ledger: ledger.entradas, isCurrency: true },
    { label: 'Saidas', extrato: extrato.saidas, ledger: ledger.saidas, isCurrency: true },
    { label: 'Impacto', extrato: extrato.impacto, ledger: ledger.impacto, isCurrency: true },
    { label: 'Taxas', extrato: extrato.taxas, ledger: ledger.taxas, isCurrency: true },
  ];

  const allOk = items.every(it => Math.abs(it.extrato - it.ledger) < 0.01);

  useEffect(() => {
    onVerificado(allOk);
  }, [allOk, onVerificado]);

  return (
    <div className={`border rounded-lg overflow-hidden mb-3 ${
      allOk
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-red-500/30 bg-red-500/5'
    }`}>
      {/* Header */}
      <div className={`px-4 py-2 flex items-center gap-2 ${
        allOk ? 'bg-emerald-500/10' : 'bg-red-500/10'
      }`}>
        <span className="text-sm">{allOk ? '✅' : '⚠️'}</span>
        <span className={`text-xs font-bold ${allOk ? 'text-emerald-400' : 'text-red-400'}`}>
          {allOk ? 'Verificacao OK — Extrato e Ledger conferem' : 'Divergencia encontrada — Extrato vs Ledger'}
        </span>
      </div>

      {/* Table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-dark-800/30">
            <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-dark-500">Item</th>
            <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-dark-500">Extrato</th>
            <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-dark-500">Ledger</th>
            <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-dark-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            const ok = Math.abs(it.extrato - it.ledger) < 0.01;
            const fmtVal = (v: number) => it.isCurrency ? formatBRL(v) : String(v);
            return (
              <tr key={it.label} className="border-t border-dark-700/30">
                <td className="px-4 py-2 font-medium text-dark-200">{it.label}</td>
                <td className="px-4 py-2 text-right font-mono text-dark-300">{fmtVal(it.extrato)}</td>
                <td className="px-4 py-2 text-right font-mono text-dark-300">{fmtVal(it.ledger)}</td>
                <td className="px-4 py-2 text-center">
                  {ok ? (
                    <span className="text-emerald-500 text-[10px] font-bold">OK</span>
                  ) : (
                    <span className="text-red-400 text-[10px] font-bold">
                      {it.isCurrency ? formatBRL(it.extrato - it.ledger) : (it.extrato - it.ledger)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div className={`px-4 py-2 text-[10px] ${allOk ? 'text-emerald-500/70' : 'text-red-400/70'}`}>
        {allOk
          ? 'Todos os valores conferem. Voce pode Lockar com seguranca.'
          : 'Resolva as divergencias antes de Lockar. Verifique se todos os jogadores estao vinculados.'}
      </div>
    </div>
  );
}
