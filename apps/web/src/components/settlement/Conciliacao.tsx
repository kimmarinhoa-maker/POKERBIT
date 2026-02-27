'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, toggleReconciled } from '@/lib/api';
import { fmtDateTime } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import ChipPixTab from './conciliacao/ChipPixTab';
import OFXTab from './conciliacao/OFXTab';
import LedgerTab from './conciliacao/LedgerTab';
import type { LedgerEntry, AgentOption, PlayerOption, FilterMode } from './conciliacao/types';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  weekStart: string;
  clubId: string;
  settlementStatus: string;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}

type SubTab = 'chippix' | 'ofx' | 'ledger';

// ─── Component ──────────────────────────────────────────────────────

export default function Conciliacao({ weekStart, clubId, settlementStatus, onDataChange, agents, players }: Props) {
  const isDraft = settlementStatus === 'DRAFT';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('ledger');
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');

  // Reset sub-tab when week changes
  useEffect(() => { setActiveSubTab('ledger'); }, [weekStart]);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [toggling, setToggling] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLedger(weekStart);
      if (!mountedRef.current) return;
      if (res.success) setEntries(res.data || []);
    } catch {
      if (!mountedRef.current) return;
      toast('Erro ao carregar movimentacoes do ledger', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [weekStart, toast]);

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

  // fmtDateTime imported from @/lib/formatters

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
        />
      )}
    </div>
  );
}
