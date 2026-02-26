'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  listLedger,
  toggleReconciled,
  formatBRL,
  uploadOFX,
  listOFXTransactions,
  linkOFXTransaction,
  unlinkOFXTransaction,
  ignoreOFXTransaction,
  applyOFXTransactions,
  deleteOFXTransaction,
  ofxAutoMatch,
  uploadChipPix,
  listChipPixTransactions,
  linkChipPixTransaction,
  unlinkChipPixTransaction,
  ignoreChipPixTransaction,
  applyChipPixTransactions,
  deleteChipPixTransaction,
  getChipPixLedgerSummary,
} from '@/lib/api';
import VerificadorConciliacao from './conciliacao/VerificadorConciliacao';
import type { VerificadorStats } from './conciliacao/VerificadorConciliacao';
import type { AutoMatchSuggestion } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { Upload, FileText, BookOpen } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string;
  entity_id: string;
  entity_name: string | null;
  dir: 'IN' | 'OUT';
  amount: number;
  method: string | null;
  description: string | null;
  external_ref: string | null;
  is_reconciled: boolean;
  created_at: string;
}

interface AgentOption {
  agent_id: string | null;
  agent_name: string;
}

interface PlayerOption {
  external_player_id: string | null;
  nickname: string | null;
}

interface Props {
  weekStart: string;
  clubId: string;
  settlementStatus: string;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}

type SubTab = 'chippix' | 'ofx' | 'ledger';
type FilterMode = 'all' | 'reconciled' | 'pending';

// ─── Component ──────────────────────────────────────────────────────

export default function Conciliacao({ weekStart, clubId, settlementStatus, onDataChange, agents, players }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('ledger');
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [toggling, setToggling] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLedger(weekStart);
      if (res.success) setEntries(res.data || []);
    } catch {
      toast('Erro ao carregar movimentacoes do ledger', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // KPIs (Ledger)
  const kpis = useMemo(() => {
    const total = entries.length;
    const reconciled = entries.filter((e) => e.is_reconciled).length;
    const pending = total - reconciled;
    const totalIn = entries.filter((e) => e.dir === 'IN').reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = entries.filter((e) => e.dir === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
    const pendingAmount = entries.filter((e) => !e.is_reconciled).reduce((s, e) => s + Number(e.amount), 0);
    return { total, reconciled, pending, totalIn, totalOut, pendingAmount };
  }, [entries]);

  // Filter
  const filteredEntries = useMemo(() => {
    if (filter === 'reconciled') return entries.filter((e) => e.is_reconciled);
    if (filter === 'pending') return entries.filter((e) => !e.is_reconciled);
    return entries;
  }, [entries, filter]);

  async function handleToggle(entryId: string, currentValue: boolean) {
    setToggling(entryId);
    try {
      const res = await toggleReconciled(entryId, !currentValue);
      if (res.success) {
        setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_reconciled: !currentValue } : e)));
      }
    } catch {
      toast('Erro ao alterar conciliacao', 'error');
    } finally {
      setToggling(null);
    }
  }

  function fmtDateTime(dt: string) {
    return new Date(dt).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Sub-tab config
  const subTabs: { key: SubTab; label: string; count?: number }[] = [
    { key: 'chippix', label: 'ChipPix' },
    { key: 'ofx', label: 'OFX (Bancos)' },
    { key: 'ledger', label: 'Ledger', count: kpis.total },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5" role="tablist" aria-label="Sub-abas de conciliacao">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeSubTab === tab.key}
            aria-label={tab.label}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all duration-200 ${
              activeSubTab === tab.key
                ? 'bg-poker-900/20 border-poker-500 text-poker-400'
                : 'bg-dark-800 border-dark-700 text-dark-400 hover:border-poker-500/50 hover:text-poker-400'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 text-xs bg-dark-800 px-1.5 py-0.5 rounded font-mono">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeSubTab === 'chippix' && (
        <ChipPixTab
          weekStart={weekStart}
          clubId={clubId}
          isDraft={isDraft}
          canEdit={canEdit}
          onDataChange={onDataChange}
          agents={agents}
          players={players}
        />
      )}
      {activeSubTab === 'ofx' && (
        <OFXTab
          weekStart={weekStart}
          isDraft={isDraft}
          canEdit={canEdit}
          onDataChange={onDataChange}
          agents={agents}
          players={players}
        />
      )}
      {activeSubTab === 'ledger' && (
        <LedgerTab
          entries={filteredEntries}
          kpis={kpis}
          filter={filter}
          setFilter={setFilter}
          loading={loading}
          isDraft={isDraft}
          canEdit={canEdit}
          toggling={toggling}
          onToggle={handleToggle}
          fmtDateTime={fmtDateTime}
        />
      )}
    </div>
  );
}

// ─── Entity Picker (autocomplete dropdown) ──────────────────────────

interface EntityPickerProps {
  agents: AgentOption[];
  players: PlayerOption[];
  value: string;
  onChange: (entityId: string, entityName: string) => void;
  autoFocus?: boolean;
}

function EntityPicker({ agents, players, value, onChange, autoFocus }: EntityPickerProps) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Filter agents and players based on search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filteredAgents = agents.filter((a) => {
      const name = (a.agent_name || '').toLowerCase();
      const id = (a.agent_id || '').toLowerCase();
      return !q || name.includes(q) || id.includes(q);
    });
    const filteredPlayers = players.filter((p) => {
      const name = (p.nickname || '').toLowerCase();
      const id = (p.external_player_id || '').toLowerCase();
      return !q || name.includes(q) || id.includes(q);
    });
    return { agents: filteredAgents, players: filteredPlayers };
  }, [search, agents, players]);

  const totalResults = filtered.agents.length + filtered.players.length;

  // Build flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const items: { type: 'agent' | 'player'; id: string; name: string }[] = [];
    for (const a of filtered.agents) {
      items.push({ type: 'agent', id: a.agent_id || a.agent_name, name: a.agent_name });
    }
    for (const p of filtered.players) {
      items.push({ type: 'player', id: p.external_player_id || p.nickname || '', name: p.nickname || '' });
    }
    return items;
  }, [filtered]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIdx(0);
  }, [flatItems.length]);

  function selectItem(entityId: string, entityName: string) {
    setSearch(entityName);
    setOpen(false);
    onChange(entityId, entityName);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatItems.length > 0 && highlightIdx < flatItems.length) {
          const item = flatItems[highlightIdx];
          selectItem(item.id, item.name);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar agente ou jogador..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="input text-xs w-full"
        autoFocus={autoFocus}
        autoComplete="off"
      />

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {totalResults === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-dark-500">Nenhum resultado</div>
          ) : (
            <>
              {/* Agents section */}
              {filtered.agents.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-dark-500 bg-dark-800 sticky top-0">
                    Agentes ({filtered.agents.length})
                  </div>
                  {filtered.agents.map((a, i) => {
                    const flatIdx = i;
                    const isHighlighted = highlightIdx === flatIdx;
                    return (
                      <button
                        key={`agent-${a.agent_id || a.agent_name}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(a.agent_id || a.agent_name, a.agent_name);
                        }}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                          isHighlighted ? 'bg-poker-600/20 text-white' : 'text-dark-200 hover:bg-dark-700'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{a.agent_name}</span>
                        {a.agent_id && (
                          <span className="text-[10px] text-dark-500 font-mono ml-2 flex-shrink-0">{a.agent_id}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Players section */}
              {filtered.players.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-dark-500 bg-dark-800 sticky top-0">
                    Jogadores ({filtered.players.length})
                  </div>
                  {filtered.players.map((p, i) => {
                    const flatIdx = filtered.agents.length + i;
                    const isHighlighted = highlightIdx === flatIdx;
                    return (
                      <button
                        key={`player-${p.external_player_id || p.nickname}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(p.external_player_id || p.nickname || '', p.nickname || '');
                        }}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                          isHighlighted ? 'bg-poker-600/20 text-white' : 'text-dark-200 hover:bg-dark-700'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{p.nickname || '(sem nome)'}</span>
                        {p.external_player_id && (
                          <span className="text-[10px] text-dark-500 font-mono ml-2 flex-shrink-0">
                            {p.external_player_id}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ChipPix Tab (functional) ────────────────────────────────────────

interface BankTx {
  id: string;
  fitid: string;
  tx_date: string;
  amount: number;
  memo: string | null;
  bank_name: string | null;
  dir: string;
  status: string;
  entity_id: string | null;
  entity_name: string | null;
  category: string | null;
}

type ChipPixFilter = 'all' | 'pending' | 'linked' | 'locked' | 'applied' | 'ignored';

function ChipPixTab({
  weekStart,
  clubId,
  isDraft,
  canEdit,
  onDataChange,
  agents,
  players,
}: {
  weekStart: string;
  clubId: string;
  isDraft: boolean;
  canEdit: boolean;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}) {
  const [txns, setTxns] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [filter, setFilter] = useState<ChipPixFilter>('all');
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { toast } = useToast();
  const [linkForm, setLinkForm] = useState({ entity_id: '', entity_name: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [verificadoOk, setVerificadoOk] = useState(false);
  const [ledgerStats, setLedgerStats] = useState<VerificadorStats | null>(null);

  const loadLedgerSummary = useCallback(async () => {
    try {
      const res = await getChipPixLedgerSummary(weekStart);
      if (res.success && res.data) setLedgerStats(res.data);
    } catch {
      /* silent — verificador just won't show */
    }
  }, [weekStart]);

  const loadTxns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listChipPixTransactions(weekStart);
      if (res.success) setTxns(res.data || []);
    } catch {
      toast('Erro ao carregar transações ChipPix', 'error');
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

  // Parse memo: "ChipPix · Nome · ent X.XX − saí Y.YY · taxa Z.ZZ · N txns"
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
    if (!confirm(`Lockar ${kpis.linked} registros? Isso vai aplicar o impacto no ledger de cada jogador.`)) return;
    setApplying(true);
    try {
      const res = await applyChipPixTransactions(weekStart);
      if (res.success) {
        toast(`${res.data?.applied || 0} movimentações aplicadas ao Ledger`, 'success');
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
    if (!confirm(`Limpar ${deletable.length} registros não aplicados?`)) return;
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
        <div className="text-sm font-bold text-white">Conciliação ChipPix</div>
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

      {/* ── Verificador de Conciliação ───────────────────────────── */}
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
                      Saída
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
                        {/* Saída */}
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
              <span className="text-[10px] text-dark-500">Progresso de vinculação</span>
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
    </div>
  );
}

// ─── OFX Tab (functional) ────────────────────────────────────────────

type OFXFilter = 'all' | 'pending' | 'linked' | 'applied' | 'ignored';

function OFXTab({
  weekStart,
  isDraft,
  canEdit,
  onDataChange,
  agents,
  players,
}: {
  weekStart: string;
  isDraft: boolean;
  canEdit: boolean;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}) {
  const [txns, setTxns] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [filter, setFilter] = useState<OFXFilter>('all');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { toast } = useToast();
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
      if (res.success) setTxns(res.data || []);
    } catch {
      toast('Erro ao carregar transacoes OFX', 'error');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

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
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
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
    if (!confirm('Excluir esta transacao?')) return;
    await deleteOFXTransaction(txId);
    loadTxns();
  }

  async function handleApply() {
    if (!confirm(`Aplicar ${kpis.linked} transacoes vinculadas? Serao criadas como movimentacoes no Ledger.`)) return;
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
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
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
    if (!confirm(`Aceitar ${actionable.length} sugestoes (alta + media confianca)?`)) return;

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
    </div>
  );
}

// ─── Fonte Badge ──────────────────────────────────────────────────────

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

// ─── Ledger Tab ──────────────────────────────────────────────────────

function LedgerTab({
  entries,
  kpis,
  filter,
  setFilter,
  loading,
  isDraft,
  canEdit,
  toggling,
  onToggle,
  fmtDateTime,
}: {
  entries: LedgerEntry[];
  kpis: {
    total: number;
    reconciled: number;
    pending: number;
    totalIn: number;
    totalOut: number;
    pendingAmount: number;
  };
  filter: FilterMode;
  setFilter: (f: FilterMode) => void;
  loading: boolean;
  isDraft: boolean;
  canEdit: boolean;
  toggling: string | null;
  onToggle: (id: string, current: boolean) => void;
  fmtDateTime: (dt: string) => string;
}) {
  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
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
            <table className="w-full text-sm">
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
                          onClick={() => isDraft && canEdit && onToggle(e.id, e.is_reconciled)}
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
                      <td className="px-3 py-2.5 text-dark-300 text-xs font-mono">{fmtDateTime(e.created_at)}</td>
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
              className={`h-2.5 rounded-full transition-all duration-500 shadow-glow-green ${
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
