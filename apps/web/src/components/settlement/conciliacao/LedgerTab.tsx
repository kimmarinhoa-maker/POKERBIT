'use client';

import { formatBRL } from '@/lib/api';
import { fmtDateTime } from '@/lib/formatters';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { BookOpen } from 'lucide-react';
import type { LedgerEntry, FilterMode } from './types';

// ─── Types ──────────────────────────────────────────────────────────

export interface LedgerKpis {
  total: number;
  reconciled: number;
  pending: number;
  totalIn: number;
  totalOut: number;
  pendingAmount: number;
}

export interface LedgerTabProps {
  entries: LedgerEntry[];
  kpis: LedgerKpis;
  filter: FilterMode;
  setFilter: (f: FilterMode) => void;
  loading: boolean;
  isDraft: boolean;
  canEdit: boolean;
  toggling: string | null;
  onToggle: (id: string, current: boolean) => void;
}

// ─── FonteBadge ─────────────────────────────────────────────────────

function FonteBadge({ entry }: { entry: LedgerEntry }) {
  const ref = entry.external_ref || '';
  const desc = (entry.description || '').toLowerCase();

  let fonte: string;
  let cls: string;

  if (ref.startsWith('ofx_') || desc.includes('ofx')) {
    fonte = 'Import';
    cls = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
  } else if (ref.startsWith('cp_') || desc.includes('chippix')) {
    fonte = 'ChipPix';
    cls = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  } else if (ref.startsWith('liq_') || desc.includes('liquidacao') || desc.includes('pagamento')) {
    fonte = 'Liquidacao';
    cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  } else {
    fonte = 'Manual';
    cls = 'bg-dark-700/30 text-dark-300 border-dark-600/30';
  }

  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cls}`}>{fonte}</span>;
}

// ─── Component ──────────────────────────────────────────────────────

export default function LedgerTab({
  entries,
  kpis,
  filter,
  setFilter,
  loading,
  isDraft,
  canEdit,
  toggling,
  onToggle,
}: LedgerTabProps) {
  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Total</p>
            <p className="text-xl font-bold mt-2 font-mono text-dark-200">{kpis.total}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Entradas</p>
            <p className="text-xl font-bold mt-2 font-mono text-poker-400">{formatBRL(kpis.totalIn)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Saidas</p>
            <p className="text-xl font-bold mt-2 font-mono text-red-400">{formatBRL(kpis.totalOut)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-emerald-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Conciliadas</p>
            <p className="text-xl font-bold mt-2 font-mono text-emerald-400">{kpis.reconciled}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className={`h-0.5 ${kpis.pending > 0 ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Pendentes</p>
            <p className={`text-xl font-bold mt-2 font-mono ${kpis.pending > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {kpis.pending > 0 ? kpis.pending : '✓'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'reconciled', 'pending'] as FilterMode[]).map((mode) => {
          const labels: Record<FilterMode, string> = { all: 'Todas', reconciled: 'Conciliadas', pending: 'Pendentes' };
          const counts: Record<FilterMode, number> = {
            all: kpis.total,
            reconciled: kpis.reconciled,
            pending: kpis.pending,
          };
          return (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === mode
                  ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                  : 'text-dark-300 hover:bg-dark-800'
              }`}
            >
              {labels[mode]} ({counts[mode]})
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton columns={5} rows={8} />
      ) : entries.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">
            Nenhuma movimentacao {filter !== 'all' ? `${filter === 'reconciled' ? 'conciliada' : 'pendente'}` : ''}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-dark-800/80 backdrop-blur-sm">
                  <th className="px-4 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider w-10">✓</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Entidade</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Data</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider">Fonte</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider">Dir</th>
                  <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Valor</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Metodo</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Descricao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30">
                {entries.map((e) => {
                  const isToggling = toggling === e.id;
                  return (
                    <tr
                      key={e.id}
                      className={`transition-colors ${
                        e.is_reconciled ? 'opacity-60 hover:opacity-80' : 'hover:bg-dark-800/20'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => isDraft && canEdit && onToggle(e.id, e.is_reconciled!)}
                          disabled={!isDraft || !canEdit || isToggling}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            e.is_reconciled
                              ? 'bg-green-600/30 border-green-500 text-green-400'
                              : 'border-dark-600 hover:border-dark-400'
                          } ${!isDraft ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {isToggling ? (
                            <span className="animate-spin text-[10px]">⟳</span>
                          ) : e.is_reconciled ? (
                            <span className="text-xs">✓</span>
                          ) : null}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium">{e.entity_name || '—'}</td>
                      <td className="px-3 py-2.5 text-dark-300 text-xs font-mono">{fmtDateTime(e.created_at!)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <FonteBadge entry={e} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            e.dir === 'IN'
                              ? 'bg-poker-900/30 text-poker-400 border-poker-500/30'
                              : 'bg-red-900/30 text-red-400 border-red-500/30'
                          }`}
                        >
                          {e.dir === 'IN' ? '↓ IN' : '↑ OUT'}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold ${
                          e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'
                        }`}
                      >
                        {e.dir === 'IN' ? '+' : '−'}
                        {formatBRL(Number(e.amount))}
                      </td>
                      <td className="px-3 py-2.5 text-dark-400 text-xs">{e.method || '—'}</td>
                      <td className="px-3 py-2.5 text-dark-400 text-xs truncate max-w-[200px]">
                        {e.description || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {kpis.total > 0 && (
        <div className="mt-4 card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-dark-400">Progresso de conciliacao</span>
            <span className="text-xs font-mono text-dark-300">
              {kpis.reconciled}/{kpis.total} ({kpis.total > 0 ? Math.round((kpis.reconciled / kpis.total) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-2.5 shadow-inner">
            <div
              className={`h-2.5 rounded-full animate-progress-fill shadow-glow-green ${
                kpis.reconciled === kpis.total ? 'bg-green-500' : 'bg-gradient-to-r from-poker-600 to-poker-400'
              }`}
              style={{ width: `${kpis.total > 0 ? (kpis.reconciled / kpis.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
