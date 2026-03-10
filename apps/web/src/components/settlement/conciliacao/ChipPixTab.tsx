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
  clearChipPixWeek,
  getChipPixImportSummary,
  listTransactionCategories,
  invalidateCache,
} from '@/lib/api';
import type { TransactionCategory } from '@/lib/api';
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
  settlementId: string;
  chippixManagerId?: string | null;
  isDraft: boolean;
  canEdit: boolean;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
  verificadoOk?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ChipPixTab({
  weekStart,
  clubId,
  settlementId,
  chippixManagerId,
  isDraft,
  canEdit,
  onDataChange,
  agents,
  players,
  verificadoOk = false,
}: ChipPixTabProps) {
  const [txns, setTxns] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [filter, setFilter] = useState<ChipPixFilter>('all');
  const [search, setSearch] = useState('');
  const [tableOpen, setTableOpen] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();
  const [linkForm, setLinkForm] = useState({ entity_id: '', entity_name: '', category_id: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<TransactionCategory[]>([]);

  // Import summary (Manager Trade Record from Suprema)
  const [importSummary, setImportSummary] = useState<Record<string, any> | null>(null);
  const [managerToClub, setManagerToClub] = useState<Record<string, { org_id: string; org_name: string }>>({});
  const [comparisonOpen, setComparisonOpen] = useState(true);

  const loadTxns = useCallback(async () => {
    invalidateCache('/chippix');
    setLoading(true);
    try {
      const [txnRes, importRes, catRes] = await Promise.all([
        listChipPixTransactions(weekStart, undefined, settlementId),
        getChipPixImportSummary(weekStart, settlementId),
        listTransactionCategories(),
      ]);
      if (!txnRes.success) {
        toast('Erro ao carregar transacoes ChipPix', 'error');
        return;
      }
      const all: BankTx[] = txnRes.data || [];
      setTxns(all);
      if (importRes.success && importRes.data?.has_data) {
        setImportSummary(importRes.data.operators);
        setManagerToClub(importRes.data.manager_to_club || {});
      } else if (importRes.success && importRes.data) {
        setManagerToClub(importRes.data.manager_to_club || {});
      }
      if (catRes.success) setCategories(catRes.data || []);
    } catch {
      toast('Erro ao carregar transacoes ChipPix', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart, settlementId, toast]);

  useEffect(() => {
    loadTxns();
  }, [loadTxns]);

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
      const res = await uploadChipPix(file, weekStart, clubId, settlementId);
      if (res.success) {
        const d = res.data;
        toast(`${d?.imported || 0} jogadores importados (${d?.matched || 0} auto-vinculados)`, 'success');
        await loadTxns();
        onDataChange();
      } else {
        toast(res.error || 'Erro ao importar', 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro ao importar', 'error');
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
        await loadTxns();
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
    if (!linkForm.entity_id && !linkForm.category_id) {
      toast('Selecione um agente/jogador ou uma categoria', 'error');
      return;
    }
    try {
      const res = await linkChipPixTransaction(txId, linkForm.entity_id || null, linkForm.entity_name || null, linkForm.category_id || undefined);
      if (res.success) {
        setLinkingId(null);
        setLinkForm({ entity_id: '', entity_name: '', category_id: '' });
        await loadTxns();
      } else {
        toast(res.error || 'Erro ao vincular', 'error');
      }
    } catch {
      toast('Erro ao vincular', 'error');
    }
  }

  async function handleUnlink(txId: string) {
    await unlinkChipPixTransaction(txId);
    await loadTxns();
  }

  async function handleIgnore(txId: string, ignore: boolean) {
    await ignoreChipPixTransaction(txId, ignore);
    await loadTxns();
  }

  async function handleApply() {
    const ok = await confirm({ title: 'Lockar Registros', message: `Lockar ${kpis.linked} registros? Isso vai aplicar o impacto no ledger de cada jogador.`, variant: 'danger' });
    if (!ok) return;
    setApplying(true);
    try {
      const res = await applyChipPixTransactions(weekStart);
      if (res.success) {
        toast(`${res.data?.applied || 0} movimentacoes aplicadas ao Ledger`, 'success');
        await loadTxns();
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
    const ok = await confirm({
      title: 'Limpar Todos os Registros ChipPix',
      message: `Isso vai remover ${deletable.length} registros nao aplicados desta semana.\nEssa acao nao pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Limpar Tudo',
      requireText: 'confirma',
    });
    if (!ok) return;
    try {
      const res = await clearChipPixWeek(weekStart);
      if (res.success) {
        toast(`${res.data?.deleted || deletable.length} registros removidos`, 'success');
        await loadTxns();
        onDataChange();
      } else {
        toast(res.error || 'Erro ao limpar registros', 'error');
      }
    } catch {
      toast('Erro ao limpar registros', 'error');
    }
  }

  // Totals for filtered rows
  const filteredTotals = useMemo(() => {
    let entrada = 0;
    let saida = 0;
    for (const tx of filtered) {
      const p = parseMemo(tx.memo);
      entrada += p.entrada;
      saida += p.saida;
    }
    return { entrada, saida, impacto: entrada - saida };
  }, [filtered]);

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
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
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
          <div className="h-0.5 bg-amber-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Taxas ChipPix</p>
            <p className="text-xl font-bold mt-2 font-mono text-amber-400">{formatBRL(kpis.totalTaxas)}</p>
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

      {/* ── Comparison View (ChipPix Extrato vs Suprema Trade) ──── */}
      {txns.length > 0 && (() => {
        // Resolve operators from Suprema import data (if available)
        let opsToShow: any[] = [];
        if (importSummary && Object.keys(importSummary).length > 0) {
          if (chippixManagerId && importSummary[chippixManagerId]) {
            opsToShow = [importSummary[chippixManagerId]];
          }
          if (opsToShow.length === 0) {
            for (const [mgrId, info] of Object.entries(managerToClub)) {
              if (info.org_id === clubId && importSummary[mgrId]) {
                opsToShow = [importSummary[mgrId]];
                break;
              }
            }
          }
          if (opsToShow.length === 0) {
            opsToShow = Object.values(importSummary);
          }
        }
        const hasSuprema = opsToShow.length > 0;

        return (
          <div className="card mb-5 overflow-hidden">
            <button
              onClick={() => setComparisonOpen((o) => !o)}
              className="w-full flex items-center justify-between py-1 text-left"
            >
              <h3 className="text-sm font-semibold text-dark-300">
                Cruzamento: Extrato ChipPix vs Suprema
              </h3>
              <span className="text-dark-500 text-xs">{comparisonOpen ? '\u25B2 Recolher' : '\u25BC Expandir'}</span>
            </button>

            {comparisonOpen && (
              <div className="mt-3 space-y-3">
                {/* Always show extrato summary */}
                {!hasSuprema && (
                  <div className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-blue-400">Resumo Extrato ChipPix</span>
                      <span className="text-[10px] text-dark-500">{kpis.jogadores} jogadores</span>
                    </div>
                    <table className="w-full text-xs data-table">
                      <thead>
                        <tr className="text-dark-500">
                          <th className="text-left py-1 pr-3"></th>
                          <th className="text-right py-1 px-3">Extrato ChipPix</th>
                        </tr>
                      </thead>
                      <tbody className="text-dark-300">
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Entradas (bruto)</td>
                          <td className="py-1.5 px-3 text-right font-mono text-emerald-400">{formatBRL(kpis.totalEntrada)}</td>
                        </tr>
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Saidas (bruto)</td>
                          <td className="py-1.5 px-3 text-right font-mono text-red-400">{formatBRL(kpis.totalSaida)}</td>
                        </tr>
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Taxas transacao</td>
                          <td className="py-1.5 px-3 text-right font-mono text-amber-400">{formatBRL(kpis.totalTaxas)}</td>
                        </tr>
                        <tr className="border-t border-dark-700/50 bg-dark-800/30 font-semibold">
                          <td className="py-1.5 pr-3 text-white">Liquido</td>
                          <td className={`py-1.5 px-3 text-right font-mono ${kpis.impacto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(kpis.impacto - kpis.totalTaxas)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-2 text-[10px] text-dark-500">
                      Dados Suprema Trade Record nao encontrados para esta semana. Reimporte a planilha para cruzar.
                    </div>
                  </div>
                )}

                {/* With Suprema data: side-by-side comparison */}
                {hasSuprema && opsToShow.map((op: any, idx: number) => (
                  <div key={op.managerId || idx} className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-blue-400">{op.manager}</span>
                      <span className="text-[10px] text-dark-500">
                        {op.txnCount} txns &middot; {op.playerCount} jogadores
                      </span>
                    </div>

                    <table className="w-full text-xs data-table">
                      <thead>
                        <tr className="text-dark-500">
                          <th className="text-left py-1 pr-3"></th>
                          <th className="text-right py-1 px-3">Extrato ChipPix</th>
                          <th className="text-right py-1 px-3">Suprema Trade</th>
                          <th className="text-right py-1 pl-3">Diferenca</th>
                        </tr>
                      </thead>
                      <tbody className="text-dark-300">
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Entradas (bruto)</td>
                          <td className="py-1.5 px-3 text-right font-mono text-emerald-400">{formatBRL(kpis.totalEntrada)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-emerald-400">{formatBRL(op.totalIN)}</td>
                          {(() => {
                            const diff = Math.abs(kpis.totalEntrada - op.totalIN);
                            const ok = diff < 1;
                            return (
                              <td className={`py-1.5 pl-3 text-right font-mono font-bold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                                {ok ? '\u2713 OK' : formatBRL(diff)}
                              </td>
                            );
                          })()}
                        </tr>
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Saidas (bruto)</td>
                          <td className="py-1.5 px-3 text-right font-mono text-red-400">{formatBRL(kpis.totalSaida)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-red-400">{formatBRL(op.totalOUT)}</td>
                          {(() => {
                            const diff = Math.abs(kpis.totalSaida - op.totalOUT);
                            const ok = diff < 1;
                            return (
                              <td className={`py-1.5 pl-3 text-right font-mono font-bold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                                {ok ? '\u2713 OK' : formatBRL(diff)}
                              </td>
                            );
                          })()}
                        </tr>
                        <tr className="border-t border-dark-700/30">
                          <td className="py-1.5 pr-3 text-dark-400">Taxas transacao</td>
                          <td className="py-1.5 px-3 text-right font-mono text-amber-400">{formatBRL(kpis.totalTaxas)}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-dark-500">-</td>
                          <td className="py-1.5 pl-3 text-right font-mono text-dark-500">-</td>
                        </tr>
                        <tr className="border-t border-dark-700/50 bg-dark-800/30 font-semibold">
                          <td className="py-1.5 pr-3 text-white">Saldo</td>
                          <td className={`py-1.5 px-3 text-right font-mono ${kpis.impacto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(kpis.impacto - kpis.totalTaxas)}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-mono ${op.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(op.saldo)}
                          </td>
                          <td className="py-1.5 pl-3 text-right font-mono text-dark-400">
                            {formatBRL(Math.abs((kpis.impacto - kpis.totalTaxas) - op.saldo))}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {(() => {
                      const okIN = Math.abs(kpis.totalEntrada - op.totalIN) < 1;
                      const okOUT = Math.abs(kpis.totalSaida - op.totalOUT) < 1;
                      return okIN && okOUT ? (
                        <div className="mt-2 text-[10px] text-green-400">
                          Valores brutos cruzam com a planilha Suprema
                        </div>
                      ) : (
                        <div className="mt-2 text-[10px] text-amber-400">
                          Diferenca detectada entre Extrato e Suprema (pode ser taxas)
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
              <table className="w-full text-xs data-table">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-dark-800/80 backdrop-blur-sm">
                    <th className="px-3 py-2 text-left font-medium text-[10px] text-dark-400 uppercase tracking-wider whitespace-nowrap">
                      <button
                        onClick={() => setTableOpen(!tableOpen)}
                        className="flex items-center gap-1.5 hover:text-dark-200 transition-colors"
                      >
                        <span className={`text-[10px] transition-transform duration-200 ${tableOpen ? 'rotate-90' : ''}`}>▶</span>
                        ID / Nome
                        <span className="text-dark-600 font-normal">({filtered.length})</span>
                      </button>
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
                {tableOpen && (
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <EntityPicker
                                agents={agents}
                                players={players}
                                value={linkForm.entity_name}
                                onChange={(entityId, entityName) =>
                                  setLinkForm((p) => ({ ...p, entity_id: entityId, entity_name: entityName }))
                                }
                                autoFocus
                              />
                              {categories.length > 0 && (
                                <select
                                  value={linkForm.category_id}
                                  onChange={(e) => setLinkForm((p) => ({ ...p, category_id: e.target.value }))}
                                  className="input text-[10px] py-0.5 px-1.5 w-32"
                                  title="Categoria"
                                >
                                  <option value="">Sem categoria</option>
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.direction === 'in' ? '↓' : '↑'} {c.name}</option>
                                  ))}
                                </select>
                              )}
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
                          ) : (tx.entity_name || (tx as any).category_id) && tx.status === 'linked' ? (
                            <div className="flex items-center gap-1.5">
                              {tx.entity_name && (
                              <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[10px] px-2 py-0.5 rounded font-semibold">
                                {tx.entity_name}
                              </span>
                              )}
                              {(tx as any).category_id && (() => {
                                const cat = categories.find((c) => c.id === (tx as any).category_id);
                                return cat ? (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-dark-600/30 text-dark-400" style={{ borderColor: cat.color + '40', color: cat.color }}>
                                    {cat.name}
                                  </span>
                                ) : null;
                              })()}
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
                                      setLinkForm({ entity_id: '', entity_name: '', category_id: (tx as any).category_id || '' });
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
                )}
                <tfoot className="bg-dark-800/60 border-t border-dark-700">
                  <tr>
                    <td className="px-3 py-2.5 text-left font-bold text-[11px] text-white">
                      TOTAL <span className="text-dark-500 font-normal">({filtered.length} jogadores)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-400">
                      {filteredTotals.entrada > 0 ? `+${formatBRL(filteredTotals.entrada)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-red-400">
                      {filteredTotals.saida > 0 ? `-${formatBRL(filteredTotals.saida)}` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${filteredTotals.impacto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatBRL(filteredTotals.impacto)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
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
                className={`h-2.5 rounded-full animate-progress-fill shadow-glow-green ${
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
