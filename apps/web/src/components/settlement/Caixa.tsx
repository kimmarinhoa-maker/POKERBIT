'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, createLedgerEntry, deleteLedgerEntry, formatBRL } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { LedgerEntry } from '@/types/settlement';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';

interface Props {
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
  return `${d.toLocaleDateString('pt-BR')} \u2014 ${days[d.getDay()]}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(entries: LedgerEntry[]): Record<string, LedgerEntry[]> {
  const groups: Record<string, LedgerEntry[]> = {};
  for (const e of entries) {
    const day = (e.created_at || '').split('T')[0] || 'sem-data';
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }
  return groups;
}

// ─── Method Badge ─────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const cfg: Record<string, { bg: string; text: string; border: string }> = {
    PIX: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    CHIPPIX: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
    TED: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
    CASH: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  };
  const c = cfg[m] || { bg: 'bg-dark-700/30', text: 'text-dark-300', border: 'border-dark-600/30' };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.bg} ${c.text} ${c.border}`}>{method}</span>
  );
}

// ─── Component ────────────────────────────────────────────────────────

export default function Caixa({ weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'IN' | 'OUT'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [form, setForm] = useState({
    entity_name: '',
    dir: 'IN' as 'IN' | 'OUT',
    amount: '',
    method: '',
    description: '',
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLedger(weekStart);
      if (!mountedRef.current) return;
      if (res.success) setEntries(res.data || []);
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar caixa', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, toast]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // ─── Totals ──────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const e of entries) {
      if (e.dir === 'IN') totalIn += Number(e.amount);
      else totalOut += Number(e.amount);
    }
    const inCount = entries.filter((e) => e.dir === 'IN').length;
    const outCount = entries.filter((e) => e.dir === 'OUT').length;
    return { totalIn, totalOut, net: totalIn - totalOut, inCount, outCount };
  }, [entries]);

  // ─── Summary by method ──────────────────────────────────────────────

  const methodSummary = useMemo(() => {
    const map: Record<string, { qty: number; totalIn: number; totalOut: number }> = {};
    for (const e of entries) {
      const method = (e.method || 'Outros').toUpperCase();
      if (!map[method]) map[method] = { qty: 0, totalIn: 0, totalOut: 0 };
      map[method].qty++;
      if (e.dir === 'IN') map[method].totalIn += Number(e.amount);
      else map[method].totalOut += Number(e.amount);
    }
    return Object.entries(map)
      .map(([method, data]) => ({ method, ...data, net: data.totalIn - data.totalOut }))
      .sort((a, b) => b.qty - a.qty);
  }, [entries]);

  // ─── Conciliation progress ─────────────────────────────────────────

  const reconciled = useMemo(() => {
    const total = entries.length;
    const done = entries.filter((e) => e.is_reconciled).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [entries]);

  // ─── Filtered + grouped ─────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (dirFilter !== 'all') result = result.filter((e) => e.dir === dirFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (e) =>
          (e.entity_name || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.method || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }, [entries, dirFilter, debouncedSearch]);

  // Running balance
  const entriesWithBalance = useMemo(() => {
    let balance = 0;
    return filteredEntries.map((e) => {
      balance += e.dir === 'IN' ? Number(e.amount) : -Number(e.amount);
      return { ...e, runningBalance: balance };
    });
  }, [filteredEntries]);

  const grouped = useMemo(() => groupByDay(entriesWithBalance), [entriesWithBalance]);

  // ─── Form handlers ──────────────────────────────────────────────────

  function resetForm() {
    setForm({ entity_name: '', dir: 'IN', amount: '', method: '', description: '' });
    setError(null);
  }

  async function handleCreate() {
    const amount = parseFloat(form.amount);
    if (!form.entity_name.trim() || !amount || amount <= 0) {
      setError('Preencha entidade e valor');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await createLedgerEntry({
        entity_id: `manual_${form.entity_name.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        entity_name: form.entity_name.trim(),
        week_start: weekStart,
        dir: form.dir,
        amount,
        method: form.method || undefined,
        description: form.description || undefined,
      });
      if (res.success) {
        setShowForm(false);
        resetForm();
        loadEntries();
        onDataChange();
      } else {
        setError(res.error || 'Erro ao criar');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Excluir Movimentacao', message: 'Tem certeza que deseja excluir esta movimentacao?', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await deleteLedgerEntry(id);
      if (res.success) {
        loadEntries();
        onDataChange();
        toast('Movimentacao excluida', 'success');
      }
    } catch {
      toast('Erro ao excluir movimentacao', 'error');
    }
  }

  if (loading) {
    return <SettlementSkeleton kpis={4} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Caixa</h2>
          <p className="text-dark-400 text-sm">
            Visao gerencial + extrato bancario
          </p>
        </div>
        {isDraft && !showForm && canEdit && (
          <button
            onClick={() => { setShowForm(true); resetForm(); }}
            aria-label="Adicionar lancamento"
            className="btn-primary text-sm px-4 py-2"
          >
            + Nova Movimentacao
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="card mb-4 border-poker-700/30">
          <h4 className="text-sm font-semibold text-dark-200 mb-3">Nova Movimentacao</h4>
          {error && (
            <div className="mb-3 bg-red-900/30 border border-red-700/50 rounded-lg p-2 text-red-300 text-xs">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Entidade</label>
              <input type="text" value={form.entity_name} onChange={(e) => setForm((prev) => ({ ...prev, entity_name: e.target.value }))} placeholder="Nome do agente ou jogador" className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Direcao</label>
              <select value={form.dir} onChange={(e) => setForm((prev) => ({ ...prev, dir: e.target.value as 'IN' | 'OUT' }))} aria-label="Direcao do lancamento" className="input w-full text-sm">
                <option value="IN">IN — Recebido pelo clube</option>
                <option value="OUT">OUT — Pago pelo clube</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Valor (R$)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0,00" className="input w-full text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Metodo</label>
              <input type="text" value={form.method} onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))} placeholder="PIX, TED, Cash..." className="input w-full text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-dark-400 mb-1 block">Descricao</label>
              <input type="text" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descricao opcional" className="input w-full text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => { setShowForm(false); resetForm(); }} disabled={saving} className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm px-6 py-2">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {/* ── Camada 1: Visao Gerencial ─────────────────────────────────── */}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Movimentacoes" value={entries.length} accentColor="bg-blue-500" valueColor="text-blue-400" subtitle={`${totals.inCount} IN / ${totals.outCount} OUT`} tooltip={`Total de lancamentos = ${entries.length}`} />
        <KpiCard label="Entradas (IN)" value={formatBRL(totals.totalIn)} accentColor="bg-poker-500" valueColor="text-poker-400" subtitle={`${totals.inCount} movimentacoes`} tooltip={`Soma IN = ${formatBRL(totals.totalIn)}`} />
        <KpiCard label="Saidas (OUT)" value={formatBRL(totals.totalOut)} accentColor="bg-red-500" valueColor="text-red-400" subtitle={`${totals.outCount} movimentacoes`} tooltip={`Soma OUT = ${formatBRL(totals.totalOut)}`} />
        <KpiCard label="Saldo Liquido" value={formatBRL(totals.net)} accentColor={totals.net >= 0 ? 'bg-emerald-500' : 'bg-yellow-500'} valueColor={totals.net >= 0 ? 'text-emerald-400' : 'text-yellow-400'} subtitle="Entradas - Saidas" ring="ring-1 ring-emerald-700/30" tooltip={`saldo = ${formatBRL(totals.totalIn)} - ${formatBRL(totals.totalOut)}`} />
      </div>

      {/* Summary by method */}
      {methodSummary.length > 0 && (
        <div className="card overflow-hidden p-0 mb-5">
          <div className="px-4 py-2.5 bg-dark-800/50 border-b border-dark-700/50">
            <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider">Resumo por Tipo</h3>
          </div>
          <table className="w-full text-sm data-table">
            <thead>
              <tr className="bg-dark-800/30">
                <th className="px-4 py-2 text-left text-[10px] text-dark-400 uppercase tracking-wider font-medium">Tipo</th>
                <th className="px-4 py-2 text-center text-[10px] text-dark-400 uppercase tracking-wider font-medium">Qtd</th>
                <th className="px-4 py-2 text-right text-[10px] text-dark-400 uppercase tracking-wider font-medium">Entradas</th>
                <th className="px-4 py-2 text-right text-[10px] text-dark-400 uppercase tracking-wider font-medium">Saidas</th>
                <th className="px-4 py-2 text-right text-[10px] text-dark-400 uppercase tracking-wider font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/30">
              {methodSummary.map((row) => (
                <tr key={row.method} className="hover:bg-dark-800/20">
                  <td className="px-4 py-2"><MethodBadge method={row.method} /></td>
                  <td className="px-4 py-2 text-center text-dark-300 font-mono">{row.qty}</td>
                  <td className="px-4 py-2 text-right font-mono text-poker-400">{row.totalIn > 0 ? formatBRL(row.totalIn) : <span className="text-dark-600">{'\u2014'}</span>}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-400">{row.totalOut > 0 ? formatBRL(row.totalOut) : <span className="text-dark-600">{'\u2014'}</span>}</td>
                  <td className={`px-4 py-2 text-right font-mono font-medium ${row.net > 0 ? 'text-emerald-400' : row.net < 0 ? 'text-red-400' : 'text-dark-500'}`}>{formatBRL(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-dark-800/50 border-t border-dark-600">
                <td className="px-4 py-2 text-dark-100 font-bold text-sm">TOTAL</td>
                <td className="px-4 py-2 text-center text-dark-100 font-bold font-mono">{entries.length}</td>
                <td className="px-4 py-2 text-right font-mono text-poker-400 font-bold">{formatBRL(totals.totalIn)}</td>
                <td className="px-4 py-2 text-right font-mono text-red-400 font-bold">{formatBRL(totals.totalOut)}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Conciliation progress bar */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-dark-800/30 rounded-lg border border-dark-700 mb-5">
          <span className="text-sm text-dark-400">Conciliacao</span>
          <div className="flex items-center gap-3">
            <div className="w-48 h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${reconciled.pct === 100 ? 'bg-emerald-500' : 'bg-poker-500'}`}
                style={{ width: `${reconciled.pct}%` }}
              />
            </div>
            <span className={`text-sm font-mono ${reconciled.pct === 100 ? 'text-emerald-400' : 'text-dark-300'}`}>
              {reconciled.done}/{reconciled.total} ({reconciled.pct}%)
            </span>
          </div>
        </div>
      )}

      {/* ── Camada 2: Extrato Bancario ────────────────────────────────── */}

      {/* Filter buttons + Search */}
      {entries.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-2">
            {[
              { key: 'all' as const, label: `Todos (${entries.length})` },
              { key: 'IN' as const, label: `Entradas (${totals.inCount})` },
              { key: 'OUT' as const, label: `Saidas (${totals.outCount})` },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setDirFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dirFilter === f.key
                    ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                    : 'bg-dark-800/50 text-dark-300 border border-dark-700/30 hover:bg-dark-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Buscar entidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input flex-1 max-w-xs"
          />
        </div>
      )}

      {/* Content — grouped by day */}
      {entries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="Nenhuma movimentacao registrada"
            description={isDraft ? 'Clique em "Nova Movimentacao" para adicionar' : 'Nenhum pagamento nesta semana'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([day, dayEntries]) => (
            <div key={day} className="card overflow-hidden p-0">
              {/* Day header */}
              <div className="px-4 py-2 bg-dark-800/60 border-b border-dark-700/50 text-sm text-dark-400 font-medium">
                {day !== 'sem-data' ? fmtDate(day) : 'Sem data'}
              </div>
              {/* Entries */}
              <div className="divide-y divide-dark-800/30">
                {(dayEntries as any[]).map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-dark-800/20 transition-colors">
                    {/* Direction icon */}
                    <div className="shrink-0">
                      {e.dir === 'IN' ? (
                        <ArrowDownCircle className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ArrowUpCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>

                    {/* Entity + time */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        <Highlight text={e.entity_name || '\u2014'} query={debouncedSearch} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-dark-500">
                        <span>{e.created_at ? fmtTime(e.created_at) : ''}</span>
                        {e.method && <MethodBadge method={e.method} />}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <div className={`font-mono font-medium text-sm ${e.dir === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {e.dir === 'IN' ? '+' : '-'}{formatBRL(Number(e.amount))}
                      </div>
                      <div className="text-[10px] text-dark-500 font-mono">
                        Saldo: {formatBRL(e.runningBalance)}
                      </div>
                    </div>

                    {/* Delete */}
                    {isDraft && canEdit && (
                      <button
                        onClick={() => handleDelete(e.id)}
                        aria-label="Remover lancamento"
                        className="text-dark-500 hover:text-red-400 transition-colors text-xs shrink-0 ml-1"
                        title="Excluir"
                      >
                        {'\u2715'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
