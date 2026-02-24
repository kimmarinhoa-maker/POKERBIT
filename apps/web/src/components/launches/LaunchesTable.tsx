'use client';

import { LaunchRow } from '@/types/launches';
import { formatCurrency } from '@/lib/formatters';
import ClubLogo from '@/components/ClubLogo';

interface LaunchesTableProps {
  rows: LaunchRow[];
  onEdit: (subclubId: string) => void;
  savedIds: Set<string>;
}

function cellColor(value: number): string {
  if (value < 0) return 'text-danger-500';
  if (value > 0) return 'text-poker-500';
  return 'text-dark-500';
}

function fmtCell(value: number): string {
  if (value === 0) return '\u2014';
  return formatCurrency(value);
}

export default function LaunchesTable({ rows, onEdit, savedIds }: LaunchesTableProps) {
  const totals = rows.reduce(
    (acc, r) => ({
      overlay: acc.overlay + r.overlay,
      compras: acc.compras + r.compras,
      security: acc.security + r.security,
      outros: acc.outros + r.outros,
      total: acc.total + r.total,
    }),
    { overlay: 0, compras: 0, security: 0, outros: 0, total: 0 }
  );

  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-dark-800/40 border-b border-dark-700">
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-400 uppercase tracking-wider text-left">Clube</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-300 uppercase tracking-wider text-center">Overlay</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-300 uppercase tracking-wider text-center">Compras</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-300 uppercase tracking-wider text-center">Security</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-300 uppercase tracking-wider text-center">Outros</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-400 uppercase tracking-wider text-center">Obs.</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-blue-400 uppercase tracking-wider text-center">Total</th>
            <th className="px-5 py-2.5 text-[11px] font-semibold text-dark-400 uppercase tracking-wider text-center">Acao</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-800/60">
          {rows.map((row) => {
            const isSaved = savedIds.has(row.subclubId);
            return (
              <tr key={row.subclubId} className="hover:bg-dark-800/20 transition-colors">
                <td className="px-5 py-2">
                  <div className="flex items-center gap-2">
                    <ClubLogo name={row.subclubName} logoUrl={row.logoUrl} size="sm" />
                    <span className="font-extrabold text-dark-100 uppercase text-xs tracking-wide">
                      {row.subclubName}
                    </span>
                  </div>
                </td>
                <td className={`px-5 py-2 text-center font-mono text-xs ${cellColor(row.overlay)}`}>
                  {fmtCell(row.overlay)}
                </td>
                <td className={`px-5 py-2 text-center font-mono text-xs ${cellColor(row.compras)}`}>
                  {fmtCell(row.compras)}
                </td>
                <td className={`px-5 py-2 text-center font-mono text-xs ${cellColor(row.security)}`}>
                  {fmtCell(row.security)}
                </td>
                <td className={`px-5 py-2 text-center font-mono text-xs ${cellColor(row.outros)}`}>
                  {fmtCell(row.outros)}
                </td>
                <td className="px-5 py-2 text-center text-xs text-dark-500">
                  {row.obs || '\u2014'}
                </td>
                <td className={`px-5 py-2 text-center font-mono text-xs font-bold ${cellColor(row.total)}`}>
                  {fmtCell(row.total)}
                </td>
                <td className="px-5 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => onEdit(row.subclubId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-dark-400 bg-dark-800 border border-dark-700 rounded-md hover:border-dark-500 hover:text-dark-100 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Alterar
                    </button>
                    {isSaved && (
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-dark-800/60 border-t-2 border-poker-500/30">
            <td className="px-5 py-2.5 font-bold text-dark-100 uppercase text-xs tracking-widest">
              Totais
            </td>
            <td className={`px-5 py-2.5 text-center font-mono font-bold text-xs ${cellColor(totals.overlay)}`}>
              {fmtCell(totals.overlay)}
            </td>
            <td className={`px-5 py-2.5 text-center font-mono font-bold text-xs ${cellColor(totals.compras)}`}>
              {fmtCell(totals.compras)}
            </td>
            <td className={`px-5 py-2.5 text-center font-mono font-bold text-xs ${cellColor(totals.security)}`}>
              {fmtCell(totals.security)}
            </td>
            <td className={`px-5 py-2.5 text-center font-mono font-bold text-xs ${cellColor(totals.outros)}`}>
              {fmtCell(totals.outros)}
            </td>
            <td className="px-5 py-2.5" />
            <td className={`px-5 py-2.5 text-center font-mono font-bold text-xs ${cellColor(totals.total)}`}>
              {fmtCell(totals.total)}
            </td>
            <td className="px-5 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
