'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listLedger, toggleReconciled, getChipPixLedgerSummary } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import ChipPixTab from './conciliacao/ChipPixTab';
import OFXTab from './conciliacao/OFXTab';
import LedgerTab from './conciliacao/LedgerTab';
import VerificadorConciliacao from './conciliacao/VerificadorConciliacao';
import type { VerificadorStats } from './conciliacao/VerificadorConciliacao';
import type { LedgerEntry, AgentOption, PlayerOption, FilterMode } from './conciliacao/types';

// ─── Helpers ────────────────────────────────────────────────────────

/** Parse gross entrada/saida/taxa from ChipPix description memo.
 *  Matches the format: "ChipPix · Nome · ent 1000.00 − saí 500.00 · taxa 50.00 · 5 txns"
 *  Used by the uploadChipPix pathway (aggregated per player). */
function parseGross(desc: string | null): { entrada: number; saida: number; taxa: number } {
  if (!desc) return { entrada: 0, saida: 0, taxa: 0 };
  const entMatch = desc.match(/ent\s+([\d.]+)/);
  const saiMatch = desc.match(/sa[íi]\s+([\d.]+)/);
  const taxMatch = desc.match(/taxa\s+([\d.]+)/);
  return {
    entrada: entMatch ? parseFloat(entMatch[1]) : 0,
    saida: saiMatch ? parseFloat(saiMatch[1]) : 0,
    taxa: taxMatch ? parseFloat(taxMatch[1]) : 0,
  };
}

/** Compute gross entrada/saida for a single ledger entry.
 *  For ChipPix (uploadChipPix pathway): parses gross from description.
 *  For ChipPix (importExtrato pathway): amount is already gross per txn.
 *  For fees/other: uses amount + dir directly. */
function entryGrossValues(e: LedgerEntry): { entrada: number; saida: number } {
  if (e.source === 'chippix_fee') return { entrada: 0, saida: Number(e.amount) };
  if (e.source === 'chippix_ignored') return { entrada: 0, saida: 0 };

  // Try parsing gross from description (uploadChipPix aggregated entries)
  const gross = parseGross(e.description ?? null);
  if (gross.entrada > 0 || gross.saida > 0) {
    return { entrada: gross.entrada, saida: gross.saida };
  }

  // Fallback: amount is already the gross value (importExtrato per-txn or non-ChipPix)
  return {
    entrada: e.dir === 'IN' ? Number(e.amount) : 0,
    saida: e.dir === 'OUT' ? Number(e.amount) : 0,
  };
}

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
  const [verificadoOk, setVerificadoOk] = useState(false);
  const [backendChipPixStats, setBackendChipPixStats] = useState<VerificadorStats | null>(null);

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

  // Fetch backend-computed ChipPix summary (independent computation path for Verificador)
  const loadBackendSummary = useCallback(async () => {
    try {
      const res = await getChipPixLedgerSummary(weekStart);
      if (mountedRef.current && res.success && res.data) setBackendChipPixStats(res.data);
    } catch {
      /* silent — verificador just won't have backend data */
    }
  }, [weekStart]);

  useEffect(() => {
    loadEntries();
    loadBackendSummary();
  }, [loadEntries, loadBackendSummary]);

  // KPIs (Ledger) — uses gross values for ChipPix entries so numbers match ChipPix tab
  const kpis = useMemo(() => {
    const total = entries.length;
    const reconciled = entries.filter((e) => e.is_reconciled).length;
    const pending = total - reconciled;
    let totalIn = 0;
    let totalOut = 0;
    for (const e of entries) {
      const g = entryGrossValues(e);
      totalIn += g.entrada;
      totalOut += g.saida;
    }
    const pendingAmount = entries.filter((e) => !e.is_reconciled).reduce((s, e) => s + Number(e.amount), 0);
    return { total, reconciled, pending, totalIn, totalOut, pendingAmount };
  }, [entries]);

  // ChipPix-specific stats computed from ledger entries (for Verificador)
  const chipPixLedgerStats = useMemo<VerificadorStats | null>(() => {
    const cpEntries = entries.filter((e) => e.source === 'chippix' || e.source === 'chippix_fee');
    if (cpEntries.length === 0) return null;

    const playerIds = new Set<string>();
    let entradas = 0;
    let saidas = 0;
    let taxas = 0;

    for (const e of cpEntries) {
      if (e.source === 'chippix_fee') {
        taxas += Number(e.amount);
        continue;
      }
      if (e.entity_id) playerIds.add(e.entity_id);
      const gross = parseGross(e.description ?? null);
      if (gross.entrada > 0 || gross.saida > 0) {
        entradas += gross.entrada;
        saidas += gross.saida;
        taxas += gross.taxa;
      } else {
        // importExtrato pathway
        if (e.dir === 'IN') entradas += Number(e.amount);
        else saidas += Number(e.amount);
      }
    }

    return {
      jogadores: playerIds.size || cpEntries.filter((e) => e.source === 'chippix').length,
      entradas: Math.round(entradas * 100) / 100,
      saidas: Math.round(saidas * 100) / 100,
      impacto: Math.round((entradas - saidas) * 100) / 100,
      taxas: Math.round(taxas * 100) / 100,
    };
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

      {/* Verificador — always visible when ChipPix data exists */}
      {chipPixLedgerStats && backendChipPixStats && (
        <VerificadorConciliacao
          extrato={chipPixLedgerStats}
          ledger={backendChipPixStats}
          onVerificado={setVerificadoOk}
        />
      )}

      {/* Tab content */}
      {activeSubTab === 'chippix' && (
        <ChipPixTab
          weekStart={weekStart}
          clubId={clubId}
          isDraft={isDraft}
          canEdit={canEdit}
          onDataChange={() => { onDataChange(); loadEntries(); loadBackendSummary(); }}
          agents={agents}
          players={players}
          verificadoOk={verificadoOk}
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
