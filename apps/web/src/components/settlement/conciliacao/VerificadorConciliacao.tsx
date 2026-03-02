'use client';

import { useState, useEffect } from 'react';
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
  const [expanded, setExpanded] = useState(false);

  const items: ItemCheck[] = [
    { label: 'Jogadores', extrato: extrato.jogadores, ledger: ledger.jogadores, isCurrency: false },
    { label: 'Entradas', extrato: extrato.entradas, ledger: ledger.entradas, isCurrency: true },
    { label: 'Saidas', extrato: extrato.saidas, ledger: ledger.saidas, isCurrency: true },
    { label: 'Impacto', extrato: extrato.impacto, ledger: ledger.impacto, isCurrency: true },
    { label: 'Taxas', extrato: extrato.taxas, ledger: ledger.taxas, isCurrency: true },
  ];

  const allOk = items.every((it) => Math.abs(it.extrato - it.ledger) < 0.01);

  useEffect(() => {
    onVerificado(allOk);
  }, [allOk, onVerificado]);

  return (
    <div
      className={`border rounded-lg overflow-hidden mb-3 ${
        allOk ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      {/* Compact header — click to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full px-3 py-1.5 flex items-center justify-between text-left ${allOk ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
      >
        <span className={`text-[11px] font-bold ${allOk ? 'text-emerald-400' : 'text-red-400'}`}>
          {allOk ? '\u2713 Extrato e Ledger conferem' : '\u26A0 Divergencia Extrato vs Ledger'}
        </span>
        <span className="text-dark-500 text-[10px]">{expanded ? '\u25B2' : '\u25BC Detalhes'}</span>
      </button>

      {expanded && (
        <>
          {/* Table */}
          <table className="w-full text-xs data-table">
            <thead>
              <tr className="bg-dark-800/30">
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-dark-500">Item</th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-dark-500">
                  Extrato
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-dark-500">
                  Ledger
                </th>
                <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-dark-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ok = Math.abs(it.extrato - it.ledger) < 0.01;
                const fmtVal = (v: number) => (it.isCurrency ? formatBRL(v) : String(v));
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
                          {it.isCurrency ? formatBRL(it.extrato - it.ledger) : it.extrato - it.ledger}
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
        </>
      )}
    </div>
  );
}
