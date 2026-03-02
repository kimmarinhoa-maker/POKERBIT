'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/useAuth';
import { buildSubclubEntityIds } from '@/lib/subclubEntityIds';
import type { SubclubData, AgentMetric, PlayerMetric } from '@/types/settlement';
import PosicaoTab from './caixa/PosicaoTab';
import FluxoTab from './caixa/FluxoTab';
import Conciliacao from './Conciliacao';

// ─── Types ──────────────────────────────────────────────────────────

interface AgentOption {
  agent_id: string | null;
  agent_name: string;
  is_direct?: boolean;
  metadata?: Record<string, unknown>;
}

interface PlayerOption {
  external_player_id: string | null;
  nickname: string | null;
}

interface Props {
  weekStart: string;
  clubId: string;
  clubName?: string;
  subclub: SubclubData & { id: string; agents: AgentMetric[]; players: PlayerMetric[] };
  fees: Record<string, number>;
  chippixManagerId?: string | null;
  settlementStatus: string;
  onDataChange: () => void;
  agents: AgentOption[];
  players: PlayerOption[];
}

type CaixaSubTab = 'posicao' | 'fluxo' | 'conciliacao';

// ─── Component ──────────────────────────────────────────────────────

export default function Caixa({
  weekStart, clubId, clubName, subclub, fees, chippixManagerId,
  settlementStatus, onDataChange, agents, players,
}: Props) {
  const { hasPermission } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<CaixaSubTab>('posicao');
  const subclubEntityIds = useMemo(
    () => buildSubclubEntityIds(subclub.agents || [], subclub.players || []),
    [subclub.agents, subclub.players],
  );

  // Reset sub-tab when week changes
  useEffect(() => { setActiveSubTab('posicao'); }, [weekStart]);

  // Build sub-tab config
  const showConciliacao = hasPermission('tab:conciliacao');
  const subTabs: { key: CaixaSubTab; label: string }[] = [
    { key: 'posicao', label: 'Posicao' },
    { key: 'fluxo', label: 'Fluxo' },
    ...(showConciliacao ? [{ key: 'conciliacao' as CaixaSubTab, label: 'Conciliacao' }] : []),
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5" role="tablist" aria-label="Sub-abas do caixa">
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeSubTab === 'posicao' && (
        <PosicaoTab
          subclub={subclub}
          weekStart={weekStart}
          clubId={clubId}
          fees={fees}
          settlementStatus={settlementStatus}
          onDataChange={onDataChange}
        />
      )}
      {activeSubTab === 'fluxo' && (
        <FluxoTab
          weekStart={weekStart}
          settlementStatus={settlementStatus}
          onDataChange={onDataChange}
          subclubEntityIds={subclubEntityIds}
        />
      )}
      {activeSubTab === 'conciliacao' && showConciliacao && (
        <Conciliacao
          weekStart={weekStart}
          clubId={clubId}
          clubName={clubName}
          chippixManagerId={chippixManagerId}
          settlementStatus={settlementStatus}
          onDataChange={onDataChange}
          agents={agents}
          players={players}
          subclubEntityIds={subclubEntityIds}
        />
      )}
    </div>
  );
}
