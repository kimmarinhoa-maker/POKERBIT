'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { listLedger, createLedgerEntry, deleteLedgerEntry, formatBRL } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

interface LedgerEntry {
  id: string;
  entity_id: string;
  entity_name: string | null;
  dir: 'IN' | 'OUT';
  amount: number;
  method: string | null;
  description: string | null;
  created_at: string;
}

interface Props {
  weekStart: string;
  settlementStatus: string;
  onDataChange: () => void;
}

export default function Extrato({ weekStart, settlementStatus, onDataChange }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const { toast } = useToast();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirFilter, setDirFilter] = useState<'all' | 'IN' | 'OUT'>('all');
  const [searchTerm, setSearchTerm] = useState('');

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
      if (res.success) setEntries(res.data || []);
    } catch {
      toast('Erro ao carregar extrato', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

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

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (dirFilter !== 'all') result = result.filter(e => e.dir === dirFilter);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(e =>
        (e.entity_name || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.method || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, dirFilter, searchTerm]);

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
        entity_id: crypto.randomUUID(),
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
    } catch (err: any) {
      setError(err.message || 'Erro de conexao');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta movimentacao?')) return;
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

  function fmtDateTime(dt: string) {
    return new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            📜
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Extrato Financeiro</h2>
            <p className="text-dark-400 text-sm">
              {entries.length} movimentacao{entries.length !== 1 ? 'es' : ''} na semana
            </p>
          </div>
        </div>

        {isDraft && !showForm && (
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
              <input
                type="text"
                value={form.entity_name}
                onChange={(e) => setForm(prev => ({ ...prev, entity_name: e.target.value }))}
                placeholder="Nome do agente ou jogador"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Direcao</label>
              <select
                value={form.dir}
                onChange={(e) => setForm(prev => ({ ...prev, dir: e.target.value as 'IN' | 'OUT' }))}
                aria-label="Direcao do lancamento"
                className="input w-full text-sm"
              >
                <option value="IN">IN — Recebido pelo clube</option>
                <option value="OUT">OUT — Pago pelo clube</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0,00"
                className="input w-full text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Metodo</label>
              <input
                type="text"
                value={form.method}
                onChange={(e) => setForm(prev => ({ ...prev, method: e.target.value }))}
                placeholder="PIX, TED, Cash..."
                className="input w-full text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-dark-400 mb-1 block">Descricao</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descricao opcional"
                className="input w-full text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              disabled={saving}
              className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="btn-primary text-sm px-6 py-2"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
            <div className="h-1 bg-blue-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Movimentacoes</p>
              <p className="text-xl font-bold mt-1 font-mono text-blue-400">{entries.length}</p>
              <p className="text-[10px] text-dark-500">{totals.inCount} IN / {totals.outCount} OUT</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
            <div className="h-1 bg-poker-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Entradas (IN)</p>
              <p className="text-xl font-bold mt-1 font-mono text-poker-400">{formatBRL(totals.totalIn)}</p>
              <p className="text-[10px] text-dark-500">{totals.inCount} movimentacoes</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
            <div className="h-1 bg-red-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Saidas (OUT)</p>
              <p className="text-xl font-bold mt-1 font-mono text-red-400">{formatBRL(totals.totalOut)}</p>
              <p className="text-[10px] text-dark-500">{totals.outCount} movimentacoes</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden ring-1 ring-emerald-700/30">
            <div className={`h-1 ${totals.net >= 0 ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">Saldo Liquido</p>
              <p className={`text-xl font-bold mt-1 font-mono ${totals.net >= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>{formatBRL(totals.net)}</p>
              <p className="text-[10px] text-dark-500">Entradas - Saidas</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter buttons + Search */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
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
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 max-w-xs bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
          />
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📜</div>
          <p className="text-dark-400 mb-2">Nenhuma movimentacao registrada</p>
          <p className="text-dark-500 text-sm">
            {isDraft ? 'Clique em "Nova Movimentacao" para adicionar' : 'Nenhum pagamento nesta semana'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-dark-800/50">
                    <th className="px-4 py-3 text-left font-medium text-xs text-dark-400">Data</th>
                    <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Entidade</th>
                    <th className="px-3 py-3 text-center font-medium text-xs text-dark-400">Dir</th>
                    <th className="px-3 py-3 text-right font-medium text-xs text-dark-400">Valor</th>
                    <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Metodo</th>
                    <th className="px-3 py-3 text-left font-medium text-xs text-dark-400">Descricao</th>
                    {isDraft && (
                      <th className="px-3 py-3 text-center font-medium text-xs text-dark-400 w-10" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/50">
                  {filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-dark-800/20 transition-colors">
                      <td className="px-4 py-2.5 text-dark-300 text-xs font-mono">
                        {fmtDateTime(e.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium">
                        {e.entity_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          e.dir === 'IN'
                            ? 'bg-poker-900/30 text-poker-400 border-poker-500/30'
                            : 'bg-red-900/30 text-red-400 border-red-500/30'
                        }`}>
                          {e.dir === 'IN' ? 'Entrada' : 'Saida'}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-medium ${
                        e.dir === 'IN' ? 'text-poker-400' : 'text-red-400'
                      }`}>
                        {formatBRL(Number(e.amount))}
                      </td>
                      <td className="px-3 py-2.5">
                        {e.method ? (
                          <MethodBadge method={e.method} />
                        ) : (
                          <span className="text-dark-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-dark-400 text-xs truncate max-w-[200px]">
                        {e.description || '—'}
                      </td>
                      {isDraft && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleDelete(e.id)}
                            aria-label="Remover lancamento"
                            className="text-dark-500 hover:text-red-400 transition-colors text-xs"
                            title="Excluir"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const cfg: Record<string, { bg: string; text: string; border: string }> = {
    PIX:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    CHIPPIX:  { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30' },
    TED:      { bg: 'bg-purple-500/10',   text: 'text-purple-400',  border: 'border-purple-500/30' },
    CASH:     { bg: 'bg-yellow-500/10',   text: 'text-yellow-400',  border: 'border-yellow-500/30' },
  };
  const c = cfg[m] || { bg: 'bg-dark-700/30', text: 'text-dark-300', border: 'border-dark-600/30' };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${c.bg} ${c.text} ${c.border}`}>
      {method}
    </span>
  );
}
