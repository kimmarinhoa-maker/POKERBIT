'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  formatBRL,
  uploadOFX,
  listOFXTransactions,
  linkOFXTransaction,
  unlinkOFXTransaction,
  ignoreOFXTransaction,
  applyOFXTransactions,
  deleteOFXTransaction,
  ofxAutoMatch,
} from '@/lib/api';
import type { AutoMatchSuggestion } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { FileText } from 'lucide-react';
import EntityPicker from './EntityPicker';
import type { AgentOption, PlayerOption, BankTx } from './types';

// ─── Types ──────────────────────────────────────────────────────────

type OFXFilter = 'all' | 'pending' | 'linked' | 'applied' | 'ignored';

export interface OFXTabProps {
  weekStart: string;
  isDraft: boolean;
  canEdit: boolean;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}

// ─── Component ──────────────────────────────────────────────────────

export default function OFXTab({
  weekStart,
  isDraft,
  canEdit,
  onDataChange,
  agents,
  players,
}: OFXTabProps) {
  const [txns, setTxns] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [filter, setFilter] = useState<OFXFilter>('all');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [linkForm, setLinkForm] = useState({ entity_id: '', entity_name: '' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Auto-match state
  const [autoMatching, setAutoMatching] = useState(false);
  const [suggestions, setSuggestions] = useState<AutoMatchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);

  const loadTxns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOFXTransactions(weekStart);
      if (!res.success) {
        toast('Erro ao carregar transacoes OFX', 'error');
        return;
      }
      setTxns(res.data || []);
    } catch {
      toast('Erro ao carregar transacoes OFX', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart, toast]);

  useEffect(() => {
    loadTxns();
  }, [loadTxns]);

  // KPIs
  const kpis = useMemo(() => {
    const total = txns.length;
    const pending = txns.filter((t) => t.status === 'pending').length;
    const linked = txns.filter((t) => t.status === 'linked').length;
    const applied = txns.filter((t) => t.status === 'applied').length;
    const ignored = txns.filter((t) => t.status === 'ignored').length;
    const totalAmount = txns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    return { total, pending, linked, applied, ignored, totalAmount };
  }, [txns]);

  const filtered = useMemo(() => {
    if (filter === 'all') return txns;
    return txns.filter((t) => t.status === filter);
  }, [txns, filter]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const res = await uploadOFX(file, weekStart);
      if (res.success) {
        setFeedback({
          type: 'success',
          msg: `${res.data?.imported || 0} transacoes importadas (${res.data?.skipped || 0} duplicatas ignoradas)`,
        });
        loadTxns();
      } else {
        setFeedback({ type: 'error', msg: res.error || 'Erro ao importar' });
      }
    } catch (err: unknown) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro ao importar' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleLink(txId: string) {
    if (!linkForm.entity_id || !linkForm.entity_name) return;
    try {
      const res = await linkOFXTransaction(txId, linkForm.entity_id, linkForm.entity_name);
      if (res.success) {
        setLinkingId(null);
        setLinkForm({ entity_id: '', entity_name: '' });
        loadTxns();
      }
    } catch {
      toast('Erro ao vincular transacao OFX', 'error');
    }
  }

  async function handleUnlink(txId: string) {
    await unlinkOFXTransaction(txId);
    loadTxns();
  }

  async function handleIgnore(txId: string, ignore: boolean) {
    await ignoreOFXTransaction(txId, ignore);
    loadTxns();
  }

  async function handleDelete(txId: string) {
    const ok = await confirm({ title: 'Excluir Transacao', message: 'Excluir esta transacao?', variant: 'danger' });
    if (!ok) return;
    await deleteOFXTransaction(txId);
    loadTxns();
  }

  async function handleApply() {
    const ok = await confirm({ title: 'Aplicar Transacoes', message: `Aplicar ${kpis.linked} transacoes vinculadas? Serao criadas como movimentacoes no Ledger.`, variant: 'danger' });
    if (!ok) return;
    setApplying(true);
    try {
      const res = await applyOFXTransactions(weekStart);
      if (res.success) {
        setFeedback({ type: 'success', msg: `${res.data?.applied || 0} transacoes aplicadas ao Ledger` });
        loadTxns();
        onDataChange();
      }
    } catch {
      toast('Erro ao aplicar transacoes OFX', 'error');
    } finally {
      setApplying(false);
    }
  }

  // ─── Auto-match handlers ────────────────────────────────────────
  async function handleAutoMatch() {
    setAutoMatching(true);
    setFeedback(null);
    setSuggestions([]);
    try {
      const res = await ofxAutoMatch(weekStart);
      if (res.success && res.data) {
        setSuggestions(res.data);
        setShowSuggestions(true);
        const actionable = res.data.filter((s) => s.confidence !== 'none');
        setFeedback({
          type: 'success',
          msg: `Auto-classificacao concluida: ${actionable.length} sugestoes encontradas de ${res.data.length} pendentes`,
        });
      } else {
        setFeedback({ type: 'error', msg: res.error || 'Erro na auto-classificacao' });
      }
    } catch (err: unknown) {
      setFeedback({ type: 'error', msg: err instanceof Error ? err.message : 'Erro na auto-classificacao' });
    } finally {
      setAutoMatching(false);
    }
  }

  async function handleAcceptSuggestion(s: AutoMatchSuggestion) {
    if (!s.suggested_entity_id || !s.suggested_entity_name) return;
    setAcceptingId(s.transaction_id);
    try {
      const res = await linkOFXTransaction(s.transaction_id, s.suggested_entity_id, s.suggested_entity_name);
      if (res.success) {
        setSuggestions((prev) => prev.filter((x) => x.transaction_id !== s.transaction_id));
        loadTxns();
      }
    } catch {
      toast('Erro ao aceitar sugestao', 'error');
    } finally {
      setAcceptingId(null);
    }
  }

  function handleRejectSuggestion(txId: string) {
    setSuggestions((prev) => prev.filter((x) => x.transaction_id !== txId));
  }

  async function handleAcceptAll() {
    const actionable = suggestions.filter(
      (s) => (s.confidence === 'high' || s.confidence === 'medium') && s.suggested_entity_id && s.suggested_entity_name,
    );
    if (actionable.length === 0) return;
    const ok = await confirm({ title: 'Aceitar Sugestoes', message: `Aceitar ${actionable.length} sugestoes (alta + media confianca)?` });
    if (!ok) return;

    setBulkAccepting(true);
    let accepted = 0;
    for (const s of actionable) {
      try {
        const res = await linkOFXTransaction(s.transaction_id, s.suggested_entity_id!, s.suggested_entity_name!);
        if (res.success) {
          accepted++;
          setSuggestions((prev) => prev.filter((x) => x.transaction_id !== s.transaction_id));
        }
      } catch {
        /* continue on error */
      }
    }
    setBulkAccepting(false);
    setFeedback({ type: 'success', msg: `${accepted} transacoes vinculadas automaticamente` });
    loadTxns();
  }

  // Confidence badge config
  const confidenceCfg: Record<string, { label: string; cls: string }> = {
    high: { label: 'Alta', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
    medium: { label: 'Media', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    low: { label: 'Baixa', cls: 'bg-dark-700/30 text-dark-400 border-dark-600/40' },
    none: { label: 'Nenhuma', cls: 'bg-red-500/10 text-red-400/60 border-red-500/20' },
  };

  // Actionable suggestions (not 'none')
  const actionableSuggestions = suggestions.filter((s) => s.confidence !== 'none');
  const highMediumCount = suggestions.filter((s) => s.confidence === 'high' || s.confidence === 'medium').length;

  function fmtDate(dt: string) {
    return new Date(dt + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  const statusCfg: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendente', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
    linked: { label: 'Vinculado', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
    applied: { label: 'Aplicado', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
    ignored: { label: 'Ignorado', cls: 'bg-dark-700/30 text-dark-400 border-dark-600/40' },
  };

  return (
    <div>
      {/* Upload + KPIs row */}
      <div className="flex items-start gap-4 mb-5">
        {/* Upload */}
        <div className="card flex-shrink-0 w-64">
          <label
            className={`flex flex-col items-center justify-center py-6 cursor-pointer border-2 border-dashed rounded-lg transition-colors ${
              uploading ? 'border-poker-500/50 bg-poker-900/10' : 'border-dark-600/50 hover:border-dark-500'
            }`}
          >
            <input
              type="file"
              accept=".ofx,.OFX"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading || !canEdit}
              aria-label="Importar arquivo OFX"
            />
            <span className="text-sm mb-2 text-dark-400">{uploading ? 'Aguarde...' : ''}</span>
            <span className="text-sm text-dark-300 font-medium">{uploading ? 'Importando...' : 'Importar OFX'}</span>
            <span className="text-xs text-dark-500 mt-1">Clique ou arraste</span>
          </label>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1">
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
            <div className="h-0.5 bg-blue-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Transacoes</p>
              <p className="text-xl font-bold mt-2 font-mono text-dark-200">{kpis.total}</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
            <div className="h-0.5 bg-yellow-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Pendentes</p>
              <p className="text-xl font-bold mt-2 font-mono text-yellow-400">{kpis.pending}</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
            <div className="h-0.5 bg-blue-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Vinculados</p>
              <p className="text-xl font-bold mt-2 font-mono text-blue-400">{kpis.linked}</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
            <div className="h-0.5 bg-emerald-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Aplicados</p>
              <p className="text-xl font-bold mt-2 font-mono text-emerald-400">{kpis.applied}</p>
            </div>
          </div>
          <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
            <div className="h-0.5 bg-amber-500" />
            <div className="p-4">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Volume</p>
              <p className="text-xl font-bold mt-2 font-mono text-amber-400">{formatBRL(kpis.totalAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-green-900/30 border border-green-700/50 text-green-300'
              : 'bg-red-900/30 border border-red-700/50 text-red-300'
          }`}
        >
          {feedback.msg}
          <button onClick={() => setFeedback(null)} className="float-right text-dark-500 hover:text-dark-300">
            ✕
          </button>
        </div>
      )}

      {/* Auto-Classificar button */}
      {kpis.pending > 0 && isDraft && (
        <div className="card bg-purple-500/5 border-purple-500/10 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-dark-300">
              <span className="text-purple-400 font-bold">{kpis.pending}</span> transacoes pendentes podem ser
              auto-classificadas
            </p>
            <p className="text-[10px] text-dark-500 mt-0.5">
              5 niveis de correspondencia: nome exato, valor+data, substring, metodo de pagamento
            </p>
          </div>
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching}
            aria-label="Auto-classificar transacoes OFX pendentes"
            className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 text-xs px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {autoMatching ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full" />
                Classificando...
              </span>
            ) : (
              'Auto-Classificar'
            )}
          </button>
        </div>
      )}

      {/* Auto-match suggestions panel */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">
              Sugestoes de Classificacao
              <span className="text-dark-500 font-normal ml-2">({suggestions.length} restantes)</span>
            </h3>
            <div className="flex items-center gap-2">
              {highMediumCount > 0 && (
                <button
                  onClick={handleAcceptAll}
                  disabled={bulkAccepting}
                  className="bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {bulkAccepting ? 'Aceitando...' : `Aceitar Todos (${highMediumCount})`}
                </button>
              )}
              <button
                onClick={() => {
                  setShowSuggestions(false);
                  setSuggestions([]);
                }}
                className="text-xs text-dark-500 hover:text-dark-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {suggestions.map((s) => {
              const cc = confidenceCfg[s.confidence] || confidenceCfg.none;
              const isAccepting = acceptingId === s.transaction_id;
              const canAccept = s.suggested_entity_id && s.suggested_entity_name;

              return (
                <div key={s.transaction_id} className="card py-3 border-l-2 border-l-purple-500/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Date */}
                      <span className="text-xs text-dark-500 font-mono w-12 flex-shrink-0">{fmtDate(s.tx_date)}</span>

                      {/* Direction */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                          s.dir === 'in' ? 'bg-poker-900/30 text-poker-400' : 'bg-red-900/30 text-red-400'
                        }`}
                      >
                        {s.dir === 'in' ? 'IN' : 'OUT'}
                      </span>

                      {/* Amount */}
                      <span
                        className={`font-mono text-sm font-bold w-24 text-right flex-shrink-0 ${
                          s.dir === 'in' ? 'text-poker-400' : 'text-red-400'
                        }`}
                      >
                        {formatBRL(Number(s.amount))}
                      </span>

                      {/* Memo */}
                      <span className="text-dark-300 text-xs truncate flex-1" title={s.memo || ''}>
                        {s.memo || '--'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {/* Suggested entity */}
                      {s.suggested_entity_name && (
                        <span
                          className="text-xs text-blue-400 font-medium max-w-[140px] truncate"
                          title={s.suggested_entity_name}
                        >
                          {s.suggested_entity_name}
                        </span>
                      )}

                      {/* Confidence badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cc.cls}`}>
                        T{s.match_tier} {cc.label}
                      </span>

                      {/* Actions */}
                      {canAccept && (
                        <button
                          onClick={() => handleAcceptSuggestion(s)}
                          disabled={isAccepting}
                          className="text-xs text-green-500 hover:text-green-400 font-semibold transition-colors disabled:opacity-50"
                        >
                          {isAccepting ? '...' : 'Aceitar'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRejectSuggestion(s.transaction_id)}
                        className="text-xs text-dark-600 hover:text-dark-300 transition-colors"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>

                  {/* Match reason */}
                  <p className="text-[10px] text-dark-500 mt-1.5 pl-12">{s.match_reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions bar */}
      {kpis.linked > 0 && isDraft && canEdit && (
        <div className="card bg-blue-500/5 border-blue-500/10 mb-4 flex items-center justify-between">
          <p className="text-sm text-dark-300">
            <span className="text-blue-400 font-bold">{kpis.linked}</span> transacoes vinculadas prontas para aplicar
          </p>
          <button
            onClick={handleApply}
            disabled={applying}
            aria-label="Aplicar transacoes OFX vinculadas ao Ledger"
            className="btn-primary text-xs px-4 py-2"
          >
            {applying ? 'Aplicando...' : 'Aplicar Vinculadas'}
          </button>
        </div>
      )}

      {/* Filter */}
      {kpis.total > 0 && (
        <div className="flex items-center gap-2 mb-4">
          {(['all', 'pending', 'linked', 'applied', 'ignored'] as OFXFilter[]).map((mode) => {
            const labels: Record<OFXFilter, string> = {
              all: 'Todas',
              pending: 'Pendentes',
              linked: 'Vinculadas',
              applied: 'Aplicadas',
              ignored: 'Ignoradas',
            };
            const counts: Record<OFXFilter, number> = {
              all: kpis.total,
              pending: kpis.pending,
              linked: kpis.linked,
              applied: kpis.applied,
              ignored: kpis.ignored,
            };
            if (counts[mode] === 0 && mode !== 'all') return null;
            return (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === mode
                    ? 'bg-poker-600/20 text-poker-400 border border-poker-700/40'
                    : 'bg-dark-800/50 text-dark-300 border border-dark-700/30 hover:bg-dark-800'
                }`}
              >
                {labels[mode]} ({counts[mode]})
              </button>
            );
          })}
        </div>
      )}

      {/* Transaction table */}
      {loading ? (
        <TableSkeleton columns={6} rows={8} />
      ) : txns.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400 mb-2">Nenhuma transacao OFX</p>
          <p className="text-dark-500 text-sm max-w-md mx-auto">
            Importe um arquivo OFX do seu banco para comecar a conciliacao
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-dark-800/80 backdrop-blur-sm">
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Banco / Descricao</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider">Dir</th>
                  <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider">Valor</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider">Vinculado A</th>
                  <th className="px-3 py-2 text-center font-medium text-[10px] text-dark-400 uppercase tracking-wider w-24">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/30">
                {filtered.map((tx) => {
                  const sc = statusCfg[tx.status] || statusCfg.pending;
                  const isLinking = linkingId === tx.id;

                  return (
                    <tr
                      key={tx.id}
                      className={`transition-colors ${tx.status === 'ignored' ? 'opacity-50' : 'hover:bg-dark-800/20'}`}
                    >
                      <td className="px-3 py-2.5 text-dark-300 text-xs font-mono whitespace-nowrap">
                        {fmtDate(tx.tx_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col">
                          {tx.bank_name && (
                            <span className="text-[10px] text-dark-500 font-medium uppercase">{tx.bank_name}</span>
                          )}
                          <span className="text-dark-200 text-xs truncate max-w-[280px]" title={tx.memo || ''}>
                            {tx.memo || '—'}
                          </span>
                        </div>
                        {isLinking && (
                          <div className="mt-2 pt-2 border-t border-dark-700/30 flex items-center gap-2">
                            <EntityPicker
                              agents={agents}
                              players={players}
                              value={linkForm.entity_name}
                              onChange={(entityId, entityName) =>
                                setLinkForm({ entity_id: entityId, entity_name: entityName })
                              }
                              autoFocus
                            />
                            <button
                              onClick={() => handleLink(tx.id)}
                              aria-label="Confirmar vinculacao OFX"
                              className="btn-primary text-xs px-3 py-1.5"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setLinkingId(null)}
                              aria-label="Cancelar vinculacao"
                              className="text-xs text-dark-500 hover:text-dark-300"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            tx.dir === 'in'
                              ? 'bg-poker-900/30 text-poker-400 border-poker-500/30'
                              : 'bg-red-900/30 text-red-400 border-red-500/30'
                          }`}
                        >
                          {tx.dir === 'in' ? '↓ IN' : '↑ OUT'}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-semibold ${
                          tx.dir === 'in' ? 'text-poker-400' : 'text-red-400'
                        }`}
                      >
                        {tx.dir === 'in' ? '+' : '−'}
                        {formatBRL(Number(tx.amount))}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {tx.entity_name ? (
                          <span
                            className="text-xs text-blue-400 font-medium truncate block max-w-[140px]"
                            title={tx.entity_name}
                          >
                            {tx.entity_name}
                          </span>
                        ) : tx.status === 'pending' && isDraft ? (
                          <button
                            onClick={() => {
                              setLinkingId(tx.id);
                              setLinkForm({ entity_id: '', entity_name: '' });
                            }}
                            aria-label="Vincular transacao OFX"
                            className="text-xs text-dark-500 hover:text-blue-400 transition-colors"
                          >
                            Vincular...
                          </button>
                        ) : (
                          <span className="text-dark-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isDraft && tx.status === 'pending' && (
                            <button
                              onClick={() => handleIgnore(tx.id, true)}
                              aria-label="Ignorar transacao OFX"
                              className="text-dark-600 hover:text-dark-300 transition-colors text-xs"
                              title="Ignorar"
                            >
                              Ign
                            </button>
                          )}
                          {isDraft && tx.status === 'linked' && (
                            <button
                              onClick={() => handleUnlink(tx.id)}
                              aria-label="Desvincular transacao OFX"
                              className="text-dark-500 hover:text-yellow-400 transition-colors text-xs"
                              title="Desvincular"
                            >
                              Desv
                            </button>
                          )}
                          {isDraft && tx.status === 'ignored' && (
                            <button
                              onClick={() => handleIgnore(tx.id, false)}
                              aria-label="Restaurar transacao OFX"
                              className="text-dark-500 hover:text-emerald-400 transition-colors text-xs"
                              title="Restaurar"
                            >
                              Rest
                            </button>
                          )}
                          {isDraft && tx.status !== 'applied' && (
                            <button
                              onClick={() => handleDelete(tx.id)}
                              aria-label="Excluir transacao OFX"
                              className="text-dark-600 hover:text-red-400 transition-colors text-xs"
                              title="Excluir"
                            >
                              ✕
                            </button>
                          )}
                        </div>
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
            <span className="text-xs text-dark-400">Progresso de vinculacao</span>
            <span className="text-xs font-mono text-dark-300">
              {kpis.linked + kpis.applied}/{kpis.total} (
              {kpis.total > 0 ? Math.round(((kpis.linked + kpis.applied) / kpis.total) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-2.5 shadow-inner">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 shadow-glow-green ${
                kpis.linked + kpis.applied === kpis.total
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-poker-600 to-poker-400'
              }`}
              style={{ width: `${kpis.total > 0 ? ((kpis.linked + kpis.applied) / kpis.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
