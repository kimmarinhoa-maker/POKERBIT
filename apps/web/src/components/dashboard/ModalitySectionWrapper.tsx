'use client';

import { BarChart3 } from 'lucide-react';
import type { ModalityData } from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import RakeDonutChart from './RakeDonutChart';
import TopPlayersChart from './TopPlayersChart';
import HandsVolumeChart from './HandsVolumeChart';
import CashVsTournament from './CashVsTournament';
import ActivePlayersCard from './ActivePlayersCard';


interface Props {
  data: ModalityData | null;
  loading: boolean;
}

export default function ModalitySectionWrapper({ data, loading }: Props) {
  return (
    <div className="mt-8">
      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-dark-700" />
        <h2 className="text-sm font-bold text-dark-400 uppercase tracking-widest flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Analise por Modalidade
        </h2>
        <div className="h-px flex-1 bg-dark-700" />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="animate-tab-fade">
          <KpiSkeleton count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-dark-900 border border-dark-700 rounded-xl p-6 h-[300px]">
                <div className="h-4 skeleton-shimmer w-40 mb-4" style={{ animationDelay: `${i * 0.1}s` }} />
                <div className="h-full skeleton-shimmer rounded" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-dark-900 border border-dark-700 rounded-xl p-6 h-[240px]">
                <div className="h-4 skeleton-shimmer w-32 mb-4" style={{ animationDelay: `${i * 0.1}s` }} />
                <div className="h-full skeleton-shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && (
        <EmptyState
          icon={BarChart3}
          title="Dados de modalidade indisponiveis"
          description="Reimporte a planilha para ver dados de rake por modalidade (NLH, PLO, MTT, etc)."
        />
      )}

      {/* Content */}
      {!loading && data && (
        <div className="space-y-4 animate-tab-fade">
          {/* Row 1: Donut + Top Players */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RakeDonutChart rakeByModality={data.rakeByModality} />
            <TopPlayersChart players={data.topPlayersByRake} />
          </div>

          {/* Row 2: Hands + Cash vs Tournament + Active Players */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <HandsVolumeChart handsByModality={data.handsByModality} />
            <CashVsTournament
              cash={data.cashVsTournament.cash}
              tournament={data.cashVsTournament.tournament}
            />
            <ActivePlayersCard
              thisWeek={data.activePlayers.thisWeek}
              lastWeek={data.activePlayers.lastWeek}
              newPlayers={data.activePlayers.new}
            />
          </div>

        </div>
      )}
    </div>
  );
}
