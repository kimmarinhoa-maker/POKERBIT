'use client';

import type { SettlementFullResponse, SubclubData } from '@/types/settlement';
import KpiCard from '@/components/ui/KpiCard';
import { formatBRL } from '@/lib/formatters';

interface Props {
  data: SettlementFullResponse;
  subclubs: SubclubData[];
  activeSubclub: string;
  onSubclubClick: (name: string) => void;
}

export default function ClubDashboard({ data, subclubs, activeSubclub, onSubclubClick }: Props) {
  const { settlement } = data;

  // If a subclub is selected, show its data
  const filtered = activeSubclub
    ? subclubs.filter((s) => s.name === activeSubclub)
    : subclubs;

  const totalPlayers = filtered.reduce((sum, s) => sum + (s.players?.length || 0), 0);
  const totalRake = filtered.reduce((sum, s) => sum + (s.totals?.rake || 0), 0);
  const totalResult = filtered.reduce((sum, s) => sum + (s.totals?.ganhos || 0) + (s.totals?.rake || 0) + (s.totals?.ggr || 0), 0);
  return (
    <div className="p-4 lg:p-6 animate-tab-fade">
      <div className="mb-4">
        <h3 className="text-base font-bold text-white">Dashboard do Clube</h3>
        <p className="text-dark-500 text-xs mt-0.5">
          Semana {settlement.week_start}
          {activeSubclub && <span className="text-amber-400 ml-2">Filtro: {activeSubclub}</span>}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Jogadores" value={String(totalPlayers)} />
        <KpiCard label="Rake" value={formatBRL(totalRake)} />
        <KpiCard label="Resultado" value={formatBRL(totalResult)} />
        <KpiCard label="Subclubes" value={String(subclubs.length)} />
      </div>

      {/* Subclub cards */}
      {subclubs.length > 1 && (
        <>
          <p className="text-sm font-semibold text-dark-300 mb-3">Subclubes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subclubs.map((sub) => {
              const rake = sub.totals?.rake || 0;
              const players = sub.players?.length || 0;
              const isActive = activeSubclub === sub.name;
              return (
                <button
                  key={sub.name}
                  onClick={() => onSubclubClick(sub.name)}
                  className={`text-left bg-dark-900 border rounded-xl p-4 transition-all hover:border-poker-600/50 ${
                    isActive
                      ? 'border-poker-500/40 shadow-glow-green'
                      : 'border-dark-700'
                  }`}
                >
                  <div className="text-sm font-bold text-white">{sub.name}</div>
                  <div className="text-xs text-dark-500 mt-1">
                    {players} jog · {formatBRL(rake)} rake
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
