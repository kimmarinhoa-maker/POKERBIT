'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, createLedgerEntry, deleteLedgerEntry, formatBRL } from '@/lib/api';
import { fmtDateTime } from '@/lib/formatters';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import type { LedgerEntry } from '@/types/settlement';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
  subclubEntityIds?: Set<string>;
}

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────

export default function FluxoTab({ weekStart, settlementStatus, onDataChange, subclubEntityIds }: Props) {
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
      if (res.success) {
        const all: LedgerEntry[] = res.data || [];
        setEntries(subclubEntityIds ? all.filter((e) => subclubEntityIds.has(e.entity_id)) : all);
      }
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar fluxo', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, toast, subclubEntityIds]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // ─── Totals ──────────────────────────────────────────────────────

  const totals = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const e of entries) {
      if (e.dir === 'IN') totalIn += Number(e.amount);
      else totalOut += Number(e.amount);
    }
    const inCount = entries.filter(e => e.dir === 'IN').length;
    const outCount = entries.filter(e => e.dir === 'OUT').length;
    return { totalIn, totalOut, net: totalIn - totalOut, inCount, outCount };
  }, [entries]);

  // ─── Filtered + Running balance ──────────────────────────────────

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (dirFilter !== 'all') result = result.filter(e => e.dir === dirFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(e =>
        (e.entity_name || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.method || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }, [entries, dirFilter, debouncedSearch]);

  const entriesWithBalance = useMemo(() => {
    let balance = 0;
    return filteredEntries.map(e => {
      balance += e.dir === 'IN' ? Number(e.amount) : -Number(e.amount);
      return { ...e, runningBalance: balance };
    });
  }, [filteredEntries]);

  // ─── Form handlers ──────────────────────────────────────────────

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

  if (loading) return <SettlementSkeleton kpis={4} />;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Fluxo de Caixa</h2>
          <p className="text-dark-400 text-sm">
            Extrato cronologico com saldo acumulado
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
              <input type="text" value={form.entity_name} onChange={(e) => setForm(prev => ({ ...prev, entity_name: e.target.value }))} placeholder="Nome do agente ou jogador" className="input w-full text-sm" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Direcao</label>
              <select value={form.dir} onChange={(e) => setForm(prev => ({ ...prev, dir: e.target.value as 'IN' | 'OUT' }))} aria-label="Direcao do lancamento" className="input w-full text-sm">
                <option value="IN">IN — Recebido pelo clube</option>
                <option value="OUT">OUT — Pago pelo clube</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Valor (R$)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="0,00" className="input w-full text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Metodo</label>
              <input type="text" value={form.method} onChange={(e) => setForm(prev => ({ ...prev, method: e.target.value }))} placeholder="PIX, TED, Cash..." className="input w-full text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-dark-400 mb-1 block">Descricao</label>
              <input type="text" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Descricao opcional" className="input w-full text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => { setShowForm(false); resetForm(); }} disabled={saving} className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm px-6 py-2">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Movimentacoes" value={entries.length} accentColor="bg-blue-500" valueColor="text-blue-400" tooltip={`Total de lancamentos = ${entries.length}`} />
        <KpiCard label="Entradas (IN)" value={formatBRL(totals.totalIn)} accentColor="bg-poker-500" valueColor="text-poker-400" tooltip={`Soma IN = ${formatBRL(totals.totalIn)}`} />
        <KpiCard label="Saidas (OUT)" value={formatBRL(totals.totalOut)} accentColor="bg-red-500" valueColor="text-red-400" tooltip={`Soma OUT = ${formatBRL(totals.totalOut)}`} />
        <KpiCard label="Saldo Liquido" value={formatBRL(totals.net)} accentColor={totals.net >= 0 ? 'bg-emerald-500' : 'bg-yellow-500'} valueColor={totals.net >= 0 ? 'text-emerald-400' : 'text-yellow-400'} ring="ring-1 ring-emerald-700/30" tooltip={`saldo = ${formatBRL(totals.totalIn)} - ${formatBRL(totals.totalOut)}`} />
      </div>

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex gap-2">
            {([
              { key: 'all' as const, label: `Todos (${entries.length})` },
              { key: 'IN' as const, label: `Entradas (${totals.inCount})` },
              { key: 'OUT' as const, label: `Saidas (${totals.outCount})` },
            ]).map(f => (
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

      {/* Content */}
      {entries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="Nenhuma movimentacao registrada"
            description={isDraft ? 'Clique em "Nova Movimentacao" para adicionar' : 'Nenhum pagamento nesta semana'}
          />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table" aria-label="Fluxo de caixa">
              <thead className="sticky top-0 z-10">
                <tr className="bg-dark-800/80 backdrop-blur-sm">
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Data</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider w-10">Dir</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Entidade</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Descricao</th>
                  <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Entrada</th>
                  <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Saida</th>
                  <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Saldo</th>
                  {isDraft && canEdit && <th className="px-3 py-2 w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30">
                {entriesWithBalance.map((e) => (
                  <tr key={e.id} className="hover:bg-dark-800/20 transition-colors">
                    <td className="px-3 py-2.5 text-dark-400 text-xs font-mono whitespace-nowrap">
                      {e.created_at ? fmtDateTime(e.created_at) : '\u2014'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {e.dir === 'IN' ? (
                        <ArrowDownCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <ArrowUpCircle className="w-4 h-4 text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-white text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <Highlight text={e.entity_name || '\u2014'} query={debouncedSearch} />
                        {e.method && <MethodBadge method={e.method} />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-dark-400 text-xs truncate max-w-[200px]">
                      <Highlight text={e.description || '\u2014'} query={debouncedSearch} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                      {e.dir === 'IN' ? formatBRL(Number(e.amount)) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-400">
                      {e.dir === 'OUT' ? formatBRL(Number(e.amount)) : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${e.runningBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatBRL(e.runningBalance)}
                    </td>
                    {isDraft && canEdit && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => handleDelete(e.id)}
                          aria-label="Remover lancamento"
                          className="text-dark-500 hover:text-red-400 transition-colors text-xs"
                          title="Excluir"
                        >
                          {'\u2715'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {/* Total footer */}
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-dark-900/95 backdrop-blur-sm font-semibold border-t-2 border-dark-600">
                  <td className="px-3 py-2.5 text-white font-bold text-xs" colSpan={4}>TOTAL</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400 font-bold">{formatBRL(totals.totalIn)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-red-400 font-bold">{formatBRL(totals.totalOut)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatBRL(totals.net)}
                  </td>
                  {isDraft && canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
