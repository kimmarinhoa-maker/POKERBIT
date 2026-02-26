'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  formatBRL,
  uploadChipPix,
  listChipPixTransactions,
  linkChipPixTransaction,
  unlinkChipPixTransaction,
  ignoreChipPixTransaction,
  applyChipPixTransactions,
  deleteChipPixTransaction,
  getChipPixLedgerSummary,
} from '@/lib/api';
import VerificadorConciliacao from './VerificadorConciliacao';
import type { VerificadorStats } from './VerificadorConciliacao';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Upload } from 'lucide-react';
import EntityPicker from './EntityPicker';
import type { AgentOption, PlayerOption, BankTx } from './types';

// ─── Types ──────────────────────────────────────────────────────────

type ChipPixFilter = 'all' | 'pending' | 'linked' | 'locked' | 'applied' | 'ignored';

export interface ChipPixTabProps {
  weekStart: string;
  clubId: string;
  isDraft: boolean;
  canEdit: boolean;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}

// ─── Component ──────────────────────────────────────────────────────

export default function ChipPixTab({
  weekStart,
  clubId,
  isDraft,
  canEdit,
  onDataChange,
  agents,
  players,
}: ChipPixTabProps) {
  const [txns, setTxns] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [filter, setFilter] = useState<ChipPixFilter>('all');
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [linkForm, setLinkForm] = useState({ entity_id: '', entity_name: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [verificadoOk, setVerificadoOk] = useState(false);
  const [ledgerStats, setLedgerStats] = useState<VerificadorStats | null>(null);

  const loadLedgerSummary = useCallback(async () => {
    try {
      const res = await getChipPixLedgerSummary(weekStart);
      if (res.success && res.data) setLedgerStats(res.data);
    } catch {
      /* silent -- verificador just won't show */
    }
  }, [weekStart]);

  const loadTxns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listChipPixTransactions(weekStart);
      if (res.success) setTxns(res.data || []);
    } catch {
      toast('Erro ao carregar transacoes ChipPix', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadTxns();
  }, [loadTxns]);
  useEffect(() => {
    if (txns.length > 0) loadLedgerSummary();
  }, [txns.length, loadLedgerSummary]);

  // Parse memo: "ChipPix . Nome . ent X.XX - sai Y.YY . taxa Z.ZZ . N txns"
  function parseMemo(memo: string | null) {
    if (!memo) return { entrada: 0, saida: 0, taxa: 0, ops: 0, nome: '' };
    const entMatch = memo.match(/ent\s+([\d.]+)/);
    const saiMatch = memo.match(/sa[íi]\s+([\d.]+)/);
    const taxMatch = memo.match(/taxa\s+([\d.]+)/);
    const opsMatch = memo.match(/(\d+)\s+txns?/);
    const nomeMatch = memo.match(/ChipPix\s*·\s*(.+?)\s*·/);
    return {
      entrada: entMatch ? parseFloat(entMatch[1]) : 0,
      saida: saiMatch ? parseFloat(saiMatch[1]) : 0,
      taxa: taxMatch ? parseFloat(taxMatch[1]) : 0,
      ops: opsMatch ? parseInt(opsMatch[1]) : 0,
      nome: nomeMatch ? nomeMatch[1].trim() : '',
    };
  }

  function cpId(fitid: string) {
    return fitid.startsWith('cp_') ? fitid.substring(3) : fitid;
  }

  // KPIs
  const kpis = useMemo(() => {
    let totalEntrada = 0;
    let totalSaida = 0;
    for (const tx of txns) {
      const p = parseMemo(tx.memo);
      totalEntrada += p.entrada;
      totalSaida += p.saida;
    }
    const impacto = totalEntrada - totalSaida;
    const pending = txns.filter((t) => t.status === 'pending').length;
    const linked = txns.filter((t) => t.status === 'linked').length;
    const applied = txns.filter((t) => t.status === 'applied').length;
    const appliedAmount = txns.filter((t) => t.status === 'applied').reduce((s, t) => s + Number(t.amount), 0);
    const ignored = txns.filter((t) => t.status === 'ignored').length;
    const unlinked = txns.filter((t) => !t.entity_id && t.status === 'pending').length;
    const unlinkedAmount = txns
      .filter((t) => !t.entity_id && t.status === 'pending')
      .reduce((s, t) => s + Number(t.amount), 0);
    // Also sum taxas from chippix_fee entries (parsed from description)
    let totalTaxas = 0;
    for (const tx of txns) {
      const p = parseMemo(tx.memo);
      totalTaxas += p.taxa;
    }

    return {
      jogadores: txns.length,
      totalEntrada,
      totalSaida,
      impacto,
      totalTaxas,
      pending,
      linked,
      applied,
      appliedAmount,
      ignored,
      unlinked,
      unlinkedAmount,
    };
  }, [txns]);

  // Extrato stats for verificador (derived from parsed memo data)
  const extratoStats = useMemo<VerificadorStats>(
    () => ({
      jogadores: txns.filter((t) => t.status !== 'ignored').length,
      entradas: kpis.totalEntrada,
      saidas: kpis.totalSaida,
      impacto: kpis.impacto,
      taxas: kpis.totalTaxas,
    }),
    [txns, kpis],
  );

  // Filter + search
  const filtered = useMemo(() => {
    let result = txns;
    if (filter === 'locked') {
      result = result.filter((t) => t.status === 'linked' || t.status === 'applied');
    } else if (filter !== 'all') {
      result = result.filter((t) => t.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((t) => {
        const id = cpId(t.fitid).toLowerCase();
        const name = (t.entity_name || '').toLowerCase();
        const memo = (t.memo || '').toLowerCase();
        return id.includes(q) || name.includes(q) || memo.includes(q);
      });
    }
    return result;
  }, [txns, filter, search]);

  // ── Handlers ──────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadChipPix(file, weekStart, clubId);
      if (res.success) {
        const d = res.data;
        toast(`${d?.imported || 0} jogadores importados (${d?.matched || 0} auto-vinculados)`, 'success');
        loadTxns();
        loadLedgerSummary();
      } else {
        toast(res.error || 'Erro ao importar', 'error');
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleAutoLink() {
    setAutoLinking(true);
    let count = 0;
    try {
      const pendingTxns = txns.filter((t) => t.status === 'pending' && !t.entity_id);
      for (const tx of pendingTxns) {
        const playerId = cpId(tx.fitid);
        const match = players.find((p) => p.external_player_id === playerId || p.external_player_id === tx.fitid);
        if (match && match.external_player_id) {
          try {
            const res = await linkChipPixTransaction(
              tx.id,
              match.external_player_id,
              match.nickname || match.external_player_id,
            );
            if (res.success) count++;
          } catch {
            /* continue */
          }
        }
      }
      if (count > 0) {
        toast(`${count} jogadores vinculados`, 'success');
        loadTxns();
        loadLedgerSummary();
      } else {
        toast('Nenhum jogador encontrado para vincular', 'info');
      }
    } catch {
      toast('Erro ao auto-vincular', 'error');
    } finally {
      setAutoLinking(false);
    }
  }

  async function handleLink(txId: string) {
    if (!linkForm.entity_id || !linkForm.entity_name) return;
    try {
      const res = await linkChipPixTransaction(txId, linkForm.entity_id, linkForm.entity_name);
      if (res.success) {
        setLinkingId(null);
        setLinkForm({ entity_id: '', entity_name: '' });
        loadTxns();
      }
    } catch {
      toast('Erro ao vincular', 'error');
    }
  }

  async function handleUnlink(txId: string) {
    await unlinkChipPixTransaction(txId);
    loadTxns();
  }

  async function handleIgnore(txId: string, ignore: boolean) {
    await ignoreChipPixTransaction(txId, ignore);
    loadTxns();
  }

  async function handleApply() {
    const ok = await confirm({ title: 'Lockar Registros', message: `Lockar ${kpis.linked} registros? Isso vai aplicar o impacto no ledger de cada jogador.`, variant: 'danger' });
    if (!ok) return;
    setApplying(true);
    try {
      const res = await applyChipPixTransactions(weekStart);
      if (res.success) {
        toast(`${res.data?.applied || 0} movimentacoes aplicadas ao Ledger`, 'success');
        loadTxns();
        loadLedgerSummary();
        onDataChange();
      }
    } catch {
      toast('Erro ao aplicar', 'error');
    } finally {
      setApplying(false);
    }
  }

  async function handleClear() {
    const deletable = txns.filter((t) => t.status !== 'applied');
    if (deletable.length === 0) return;
    const ok = await confirm({ title: 'Limpar Registros', message: `Limpar ${deletable.length} registros nao aplicados?`, variant: 'danger' });
    if (!ok) return;
    for (const tx of deletable) {
      try {
        await deleteChipPixTransaction(tx.id);
      } catch {
        /* continue */
      }
    }
    toast(`${deletable.length} registros removidos`, 'success');
    loadTxns();
  }

  const filterBtns: { key: ChipPixFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: txns.length },
    { key: 'linked', label: 'Vinculados', count: kpis.linked },
    { key: 'locked', label: 'Lockados', count: kpis.linked + kpis.applied },
    { key: 'applied', label: 'Aplicados', count: kpis.applied },
    { key: 'pending', label: 'Pendentes', count: kpis.pending },
    { key: 'ignored', label: 'Ignorados', count: kpis.ignored },
  ];

  if (loading) {
    return <SettlementSkeleton kpis={5} />;
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-bold text-white">Conciliacao ChipPix</div>
        <div className="flex items-center gap-1.5 flex-wrap print:hidden">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.XLSX,.XLS" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !isDraft || !canEdit}
            className="px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {uploading ? 'Importando...' : 'Importar'}
          </button>
          <button
            onClick={handleAutoLink}
            disabled={autoLinking || !isDraft || !canEdit || kpis.pending === 0}
            className="px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {autoLinking ? 'Vinculando...' : 'Auto-vincular'}
          </button>
          {kpis.linked > 0 && isDraft && canEdit && (
            <button
              onClick={handleApply}
              disabled={applying || !verificadoOk}
              title={!verificadoOk ? 'Resolva as divergencias antes de Lockar' : ''}
              className="px-3 py-1 rounded-md text-[11px] font-bold bg-yellow-400/10 border border-yellow-400/25 text-yellow-400 hover:bg-yellow-400/20 transition-all disabled:opacity-40"
            >
              {applying ? 'Lockando...' : `Lockar (${kpis.linked})`}
            </button>
          )}
          {txns.length > 0 && isDraft && canEdit && (
            <button
              onClick={handleClear}
              className="px-2 py-1 rounded-md text-[10px] text-dark-500 border border-dark-700 hover:text-dark-300 transition-all"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-blue-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Jogadores</p>
            <p className="text-xl font-bold mt-2 font-mono text-blue-400">{kpis.jogadores}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-emerald-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Entradas</p>
            <p className="text-xl font-bold mt-2 font-mono text-emerald-400">{formatBRL(kpis.totalEntrada)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Saidas</p>
            <p className="text-xl font-bold mt-2 font-mono text-red-400">{formatBRL(kpis.totalSaida)}</p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className={`h-0.5 ${kpis.impacto >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Impacto Liquido</p>
            <p className={`text-xl font-bold mt-2 font-mono ${kpis.impacto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatBRL(kpis.impacto)}
            </p>
          </div>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden ring-1 ring-yellow-700/30 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className={`h-0.5 ${kpis.applied === kpis.jogadores ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Progresso</p>
            <p className="text-xl font-bold mt-2 font-mono text-yellow-400">
              {kpis.applied}<span className="text-dark-500 text-sm">/{kpis.jogadores}</span>
            </p>
            <p className="text-[10px] text-dark-500">{kpis.pending} pendente{kpis.pending !== 1 ? 's' : ''} · {kpis.unlinked} s/ vinculo</p>
          </div>
        </div>
      </div>

      {/* ── Verificador de Conciliacao ───────────────────────────── */}
      {txns.length > 0 && ledgerStats && (
        <VerificadorConciliacao extrato={extratoStats} ledger={ledgerStats} onVerificado={setVerificadoOk} />
      )}

      {/* ── Search + Filters ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por ID ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-xs w-52"
          />
        </div>
        <div className="flex gap-1">
          {filterBtns.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setFilter(fb.key)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                filter === fb.key
                  ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                  : 'bg-dark-800 border-dark-700 text-dark-500 hover:text-dark-300'
              }`}
            >
              {fb.label} <span className="opacity-50 text-[10px]">{fb.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {txns.length === 0 ? (
        <div className="card text-center py-12">
          <Upload className="w-8 h-8 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400 mb-2">Nenhum extrato ChipPix carregado</p>
          <p className="text-dark-500 text-xs">
            Clique em <strong className="text-emerald-500">Importar</strong> para carregar o extrato.
          </p>
        </div>
      ) : (
        <>
          {/* ── Table ──────────────────────────────────────────── */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-dark-800/80 backdrop-blur-sm">
                    <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      ID / Nome
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      Entrada
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      Saida
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      Impacto
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/30">
                  {filtered.map((tx) => {
                    const parsed = parseMemo(tx.memo);
                    const impacto = parsed.entrada - parsed.saida;
                    const isLinking = linkingId === tx.id;

                    return (
                      <tr
                        key={tx.id}
                        className={`border-b border-dark-800 transition-colors hover:bg-white/[.02] ${tx.status === 'ignored' ? 'opacity-50' : ''}`}
                      >
                        {/* ID / Nome */}
                        <td className="px-3 py-2.5 align-middle">
                          <span className="text-blue-400 font-mono font-bold">{cpId(tx.fitid)}</span>
                          <div className="text-dark-500 text-[10px]">
                            {parsed.nome || tx.entity_name || '—'} · {parsed.ops} ops
                          </div>
                        </td>
                        {/* Entrada */}
                        <td className="px-3 py-2.5 text-right align-middle font-mono">
                          <span className="text-emerald-500">
                            {parsed.entrada > 0 ? `+${formatBRL(parsed.entrada)}` : '—'}
                          </span>
                        </td>
                        {/* Saida */}
                        <td className="px-3 py-2.5 text-right align-middle font-mono">
                          <span className="text-red-500">{parsed.saida > 0 ? `-${formatBRL(parsed.saida)}` : '—'}</span>
                        </td>
                        {/* Impacto */}
                        <td className="px-3 py-2.5 text-right align-middle font-mono font-bold">
                          <span className={impacto >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                            {formatBRL(impacto)}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2.5 align-middle">
                          {isLinking ? (
                            <div className="flex items-center gap-1.5">
                              <EntityPicker
                                agents={agents}
                                players={players}
                                value={linkForm.entity_name}
                                onChange={(entityId, entityName) =>
                                  setLinkForm({ entity_id: entityId, entity_name: entityName })
                                }
                                autoFocus
                              />
                              <button onClick={() => handleLink(tx.id)} className="btn-primary text-[10px] px-2 py-0.5">
                                OK
                              </button>
                              <button
                                onClick={() => setLinkingId(null)}
                                className="text-[10px] text-dark-500 hover:text-dark-300"
                              >
                                ✕
                              </button>
                            </div>
                          ) : tx.entity_name && tx.status === 'linked' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[10px] px-2 py-0.5 rounded font-semibold">
                                {tx.entity_name}
                              </span>
                              {isDraft && (
                                <button
                                  onClick={() => handleUnlink(tx.id)}
                                  className="text-[10px] text-dark-600 hover:text-yellow-400"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : tx.status === 'applied' ? (
                            <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[10px] px-2 py-0.5 rounded font-semibold">
                              {tx.entity_name || 'Lockado'}
                            </span>
                          ) : tx.status === 'ignored' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-dark-500 text-[10px]">Ignorado</span>
                              {isDraft && (
                                <button
                                  onClick={() => handleIgnore(tx.id, false)}
                                  className="text-[10px] text-dark-600 hover:text-emerald-400"
                                >
                                  Restaurar
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {isDraft ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setLinkingId(tx.id);
                                      setLinkForm({ entity_id: '', entity_name: '' });
                                    }}
                                    className="text-[10px] text-dark-500 hover:text-blue-400 transition-colors"
                                  >
                                    Vincular...
                                  </button>
                                  <button
                                    onClick={() => handleIgnore(tx.id, true)}
                                    className="w-5 h-5 bg-red-500/10 border border-red-500/25 rounded text-red-500 hover:bg-red-500/20 transition-colors text-[10px] flex items-center justify-center"
                                    title="Ignorar"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <span className="text-yellow-400 text-[10px]">Pendente</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Progress bar ───────────────────────────────────── */}
          <div className="mt-3 pt-3 border-t border-dark-700">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-dark-500">Progresso de vinculacao</span>
              <span className="text-[10px] font-mono text-dark-400">
                {kpis.linked + kpis.applied}/{kpis.jogadores} (
                {kpis.jogadores > 0 ? Math.round(((kpis.linked + kpis.applied) / kpis.jogadores) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-dark-800 rounded-full h-2.5 shadow-inner">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 shadow-glow-green ${
                  kpis.linked + kpis.applied === kpis.jogadores ? 'bg-green-500' : 'bg-poker-500'
                }`}
                style={{ width: `${kpis.jogadores > 0 ? ((kpis.linked + kpis.applied) / kpis.jogadores) * 100 : 0}%` }}
              />
            </div>
          </div>
        </>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
