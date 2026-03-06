'use client';

import type { SubclubData } from '@/types/settlement';
import { Network } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { formatBRL } from '@/lib/formatters';

interface Props {
  subclubs: SubclubData[];
}

export default function ClubSubclubes({ subclubs }: Props) {
  if (subclubs.length <= 1) {
    return (
      <div className="p-4 lg:p-6">
        <div className="card">
          <EmptyState
            icon={Network}
            title="Sem subclubes"
            description="Este clube nao possui subclubes. Subclubes sao detectados automaticamente pelas siglas dos agentes na planilha."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 animate-tab-fade">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-white">Subclubes</h3>
          <p className="text-dark-500 text-xs mt-0.5">{subclubs.length} subclubes detectados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subclubs.map((sub) => {
          const players = sub.players?.length || 0;
          const agents = sub.agents?.length || 0;
          const rake = sub.totals?.rake || 0;

          return (
            <div
              key={sub.name}
              className="bg-dark-900 border border-dark-700 rounded-xl p-4 hover:border-dark-500 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-dark-800 flex items-center justify-center">
                  <Network className="w-5 h-5 text-dark-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{sub.name}</div>
                  <div className="text-[10px] text-dark-500 uppercase tracking-wider">Subclube</div>
                </div>
              </div>
              <div className="text-xs text-dark-400">
                {players} jogadores · {agents} agentes
              </div>
              <div className="text-xs text-dark-500 mt-1">
                Rake: {formatBRL(rake)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
