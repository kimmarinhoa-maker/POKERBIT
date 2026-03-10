'use client';

import { useState, useEffect, useMemo } from 'react';
import { buildSubclubEntityIds } from '@/lib/subclubEntityIds';
import type { SubclubData, AgentMetric, PlayerMetric } from '@/types/settlement';
import PosicaoTab from './caixa/PosicaoTab';
import FluxoTab from './caixa/FluxoTab';
import CaixaLancamentosTab from './caixa/CaixaLancamentosTab';

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  weekStart: string;
  clubId: string;
  settlementId: string;
  subclub: SubclubData & { id: string; agents: AgentMetric[]; players: PlayerMetric[] };
  fees: Record<string, number>;
  settlementStatus: string;
  onDataChange: () => void;
}

type CaixaSubTab = 'posicao' | 'fluxo' | 'lancamentos';

// ─── Component ──────────────────────────────────────────────────────

export default function Caixa({
  weekStart, clubId, settlementId, subclub, fees,
  settlementStatus, onDataChange,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<CaixaSubTab>('posicao');
  const subclubEntityIds = useMemo(
    () => buildSubclubEntityIds(subclub.agents || [], subclub.players || []),
    [subclub.agents, subclub.players],
  );

  // Reset sub-tab when week changes
  useEffect(() => { setActiveSubTab('posicao'); }, [weekStart]);

  // P&L total = abs(ganhos dos jogadores)
  const plTotal = Math.abs(subclub.totals?.ganhos ?? 0);
  const agentCount = subclub.agents?.length ?? 0;

  const subTabs: { key: CaixaSubTab; label: string }[] = [
    { key: 'posicao', label: 'Posicao' },
    { key: 'fluxo', label: 'Fluxo' },
    { key: 'lancamentos', label: 'Fluxo de Caixa' },
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
      {activeSubTab === 'lancamentos' && (
        <CaixaLancamentosTab
          settlementId={settlementId}
          clubId={clubId}
          weekStart={weekStart}
          plTotal={plTotal}
          agentCount={agentCount}
          settlementStatus={settlementStatus}
          onDataChange={onDataChange}
        />
      )}
    </div>
  );
}
