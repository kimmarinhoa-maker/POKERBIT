'use client';

import { useEffect, useState, useMemo } from 'react';
import { listSettlements, listLedger, formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

// ─── Types ──────────────────────────────────────────────────────────

interface Settlement {
  id: string;
  week_start: string;
  status: string;
}

interface LedgerEntry {
  id: string;
  entity_id: string;
  entity_name: string | null;
  dir: 'IN' | 'OUT';
  amount: number;
  method: string | null;
  description: string | null;
  source: string | null;
  external_ref: string | null;
  is_reconciled: boolean;
  created_at: string;
}

type FilterDir = 'all' | 'IN' | 'OUT';
type GroupBy = 'none' | 'entity' | 'method' | 'source';

// ─── Page ───────────────────────────────────────────────────────────

export default function CaixaGeralPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [filterDir, setFilterDir] = useState<FilterDir>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('entity');
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  // Load settlements
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listSettlements();
        if (res.success) {
          const list = (res.data || []).sort((a: Settlement, b: Settlement) =>
            b.week_start.localeCompare(a.week_start)
          );
          setSettlements(list);
          if (list.length > 0) setSelectedId(list[0].id);
        } else {
          toast(res.error || 'Erro ao carregar semanas', 'error');
        }
      } catch { toast('Erro de conexao com o servidor', 'error'); } finally { setLoading(false); }
    })();
  }, []);

  // Load ledger when selection changes
  const selectedWeek = settlements.find(s => s.id === selectedId);
  useEffect(() => {
    if (!selectedWeek?.week_start) return;
    (async () => {
      setLoadingEntries(true);
      try {
        const res = await listLedger(selectedWeek.week_start);
        if (res.success) setEntries(res.data || []);
      } catch { toast('Erro ao carregar movimentacoes', 'error'); } finally { setLoadingEntries(false); }
    })();
  }, [selectedWeek?.week_start]);

  // KPIs
  const kpis = useMemo(() => {
    const total = entries.length;
    const totalIn = round2(entries.filter(e => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0));
    const totalOut = round2(entries.filter(e => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0));
    const net = round2(totalIn - totalOut);
    const reconciled = entries.filter(e => e.is_reconciled).length;
    const entities = new Set(entries.map(e => e.entity_id)).size;
    return { total, totalIn, totalOut, net, reconciled, entities };
  }, [entries]);

  // Filter
  const filtered = useMemo(() => {
    let result = entries;
    if (filterDir !== 'all') result = result.filter(e => e.dir === filterDir);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(e =>
        (e.entity_name || '').toLowerCase().includes(s) ||
        (e.description || '').toLowerCase().includes(s) ||
        (e.method || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [entries, filterDir, search]);

  // Group
  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;

    const map = new Map<string, { label: string; totalIn: number; totalOut: number; count: number }>();
    for (const e of filtered) {
      const key = groupBy === 'entity'
        ? (e.entity_name || e.entity_id)
        : groupBy === 'method'
          ? (e.method || 'Sem metodo')
          : (e.source || 'manual');

      if (!map.has(key)) map.set(key, { label: key, totalIn: 0, totalOut: 0, count: 0 });
      const g = map.get(key)!;
      g.count++;
      if (e.dir === 'IN') g.totalIn += Number(e.amount);
      else g.totalOut += Number(e.amount);
    }

    return Array.from(map.values())
      .sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut));
  }, [filtered, groupBy]);

  function fmtDate(d?: string) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function fmtDateTime(dt: string) {
    return new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Caixa Geral</h2>
          <p className="text-dark-400 text-sm">
            Cash flow consolidado — todas as movimentacoes
          </p>
        </div>

        {/* Week selector */}
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-dark-200 focus:border-poker-500 focus:outline-none"
          aria-label="Selecionar semana"
        >
          {settlements.map(s => (
            <option key={s.id} value={s.id}>
              Semana {fmtDate(s.week_start)} — {s.status}
            </option>
          ))}
        </select>
      </div>

      {loadingEntries ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-blue-500 rounded-lg p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Movimentacoes</p>
              <p className="font-mono text-lg font-bold text-white">{kpis.total}</p>
            </div>
            <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-emerald-500 rounded-lg p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Entradas (IN)</p>
              <p className="font-mono text-lg font-bold text-emerald-400">{formatBRL(kpis.totalIn)}</p>
            </div>
            <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-red-500 rounded-lg p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Saidas (OUT)</p>
              <p className="font-mono text-lg font-bold text-red-400">{formatBRL(kpis.totalOut)}</p>
            </div>
            <div className={`bg-dark-800/50 border border-dark-700/50 border-t-2 ${
              kpis.net >= 0 ? 'border-t-poker-500' : 'border-t-red-500'
            } rounded-lg p-4 text-center`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Net</p>
              <p className={`font-mono text-lg font-bold ${kpis.net >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {formatBRL(kpis.net)}
              </p>
            </div>
            <div className="bg-dark-800/50 border border-dark-700/50 border-t-2 border-t-yellow-500 rounded-lg p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-dark-400 mb-1">Entidades</p>
              <p className="font-mono text-lg font-bold text-yellow-400">{kpis.entities}</p>
            </div>
          </div>

          {/* Reconciliation progress */}
          {kpis.total > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-dark-400">Conciliacao</span>
                <span className="text-xs font-mono text-dark-300">
                  {kpis.reconciled}/{kpis.total} conciliadas ({Math.round(kpis.reconciled / kpis.total * 100)}%)
                </span>
              </div>
              <div className="w-full bg-dark-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    kpis.reconciled === kpis.total
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-blue-600 to-blue-400'
                  }`}
                  style={{ width: `${Math.round(kpis.reconciled / kpis.total * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="Buscar entidade, metodo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-4 py-2 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
                aria-label="Filtrar por entidade"
              />
            </div>

            <div className="flex gap-1">
              {(['all', 'IN', 'OUT'] as FilterDir[]).map(mode => {
                const labels: Record<FilterDir, string> = { all: 'Todas', IN: '↓ Entradas', OUT: '↑ Saidas' };
                return (
                  <button
                    key={mode}
                    onClick={() => setFilterDir(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filterDir === mode
                        ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                        : 'text-dark-300 hover:bg-dark-800'
                    }`}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>

            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none"
            >
              <option value="none">Sem agrupamento</option>
              <option value="entity">Por Entidade</option>
              <option value="method">Por Metodo</option>
              <option value="source">Por Origem</option>
            </select>
          </div>

          {/* Grouped view */}
          {grouped && grouped.length > 0 && (
            <div className="card overflow-hidden p-0 mb-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Movimentacoes agrupadas">
                  <thead>
                    <tr className="bg-dark-800/50">
                      <th className="px-5 py-3 text-left font-medium text-xs text-dark-400">
                        {groupBy === 'entity' ? 'Entidade' : groupBy === 'method' ? 'Metodo' : 'Origem'}
                      </th>
                      <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Movs</th>
                      <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Entradas</th>
                      <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Saidas</th>
                      <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/50">
                    {grouped.map(g => {
                      const net = round2(g.totalIn - g.totalOut);
                      return (
                        <tr key={g.label} className="hover:bg-dark-800/20 transition-colors">
                          <td className="px-5 py-2.5 text-white font-medium text-sm truncate max-w-[240px]" title={g.label}>
                            {g.label}
                          </td>
                          <td className="px-3 py-2.5 text-center text-dark-400 text-xs">{g.count}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                            {g.totalIn > 0 ? formatBRL(g.totalIn) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-400">
                            {g.totalOut > 0 ? formatBRL(g.totalOut) : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                            net > 0.01 ? 'text-emerald-400' : net < -0.01 ? 'text-red-400' : 'text-dark-500'
                          }`}>
                            {formatBRL(net)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Group totals */}
                    {grouped.length > 1 && (() => {
                      const gTotalIn = round2(grouped.reduce((s, g) => s + g.totalIn, 0));
                      const gTotalOut = round2(grouped.reduce((s, g) => s + g.totalOut, 0));
                      const gNet = round2(gTotalIn - gTotalOut);
                      return (
                        <tr className="bg-dark-800/50 font-semibold border-t-2 border-dark-600">
                          <td className="px-5 py-3 text-white">TOTAL ({grouped.length})</td>
                          <td className="px-3 py-3 text-center text-dark-300 text-xs">
                            {grouped.reduce((s, g) => s + g.count, 0)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-emerald-400">
                            {formatBRL(gTotalIn)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-red-400">
                            {formatBRL(gTotalOut)}
                          </td>
                          <td className={`px-3 py-3 text-right font-mono font-bold ${
                            gNet > 0.01 ? 'text-emerald-400' : gNet < -0.01 ? 'text-red-400' : 'text-dark-500'
                          }`}>
                            {formatBRL(gNet)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detail table */}
          {entries.length === 0 ? (
            <div className="card text-center py-16">
              <h3 className="text-xl font-bold text-white mb-2">Nenhuma movimentacao</h3>
              <p className="text-dark-400 text-sm">Nao ha movimentacoes registradas nesta semana</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Detalhamento de movimentacoes">
                  <thead>
                    <tr className="bg-dark-800/50">
                      <th className="px-4 py-3 text-left font-medium text-xs text-dark-400">Data</th>
                      <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Entidade</th>
                      <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Dir</th>
                      <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Valor</th>
                      <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Metodo</th>
                      <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Descricao</th>
                      <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">✓</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/50">
                    {filtered.map(e => (
                      <tr key={e.id} className={`transition-colors ${e.is_reconciled ? 'opacity-60' : 'hover:bg-dark-800/20'}`}>
                        <td className="px-4 py-2.5 text-dark-300 text-xs font-mono">
                          {fmtDateTime(e.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-white font-medium text-sm truncate max-w-[180px]">
                          {e.entity_name || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            e.dir === 'IN' ? 'bg-poker-900/30 text-poker-400' : 'bg-red-900/30 text-red-400'
                          }`}>
                            {e.dir === 'IN' ? '↓ IN' : '↑ OUT'}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${
                          e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'
                        }`}>
                          {e.dir === 'IN' ? '+' : '−'}{formatBRL(Number(e.amount))}
                        </td>
                        <td className="px-3 py-2.5 text-dark-400 text-xs">{e.method || '—'}</td>
                        <td className="px-3 py-2.5 text-dark-400 text-xs truncate max-w-[200px]">
                          {e.description || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {e.is_reconciled ? (
                            <span className="text-green-400 text-xs">✓</span>
                          ) : (
                            <span className="text-dark-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary footer */}
          <div className="mt-4 card flex items-center justify-between">
            <span className="text-xs text-dark-400">
              {filtered.length} movimentacoes ({kpis.reconciled} conciliadas)
            </span>
            <div className="flex items-center gap-6 text-sm font-mono">
              <span className="text-emerald-400">IN: {formatBRL(kpis.totalIn)}</span>
              <span className="text-red-400">OUT: {formatBRL(kpis.totalOut)}</span>
              <span className={`font-bold ${kpis.net >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                NET: {formatBRL(kpis.net)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
