'use client';

import { formatBRL } from '@/lib/api';
import { ChevronRight, Users } from 'lucide-react';
import type { AgentGroup } from '@/types/financeiro';

const PLATFORM_DOTS: Record<string, string> = {
  suprema: 'bg-emerald-400',
  pppoker: 'bg-violet-400',
  clubgg: 'bg-blue-400',
};

interface AgentGroupListProps {
  groups: AgentGroup[];
  weekTotals: Map<string, number>; // group_id -> resultado
  onSelect: (group: AgentGroup) => void;
}

export default function AgentGroupList({ groups, weekTotals, onSelect }: AgentGroupListProps) {
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const resultado = weekTotals.get(group.id);
        const platforms = [...new Set(group.members.map((m) => m.platform))];

        return (
          <button
            key={group.id}
            onClick={() => onSelect(group)}
            className="w-full bg-dark-900 border border-dark-700 rounded-xl p-4 flex items-center gap-4 hover:border-dark-600 hover:bg-dark-800/50 transition-all duration-150 text-left group"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-dark-500" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{group.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {platforms.map((p) => (
                  <div key={p} className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${PLATFORM_DOTS[p] || 'bg-dark-500'}`} />
                    <span className="text-[10px] text-dark-500 uppercase">{p}</span>
                  </div>
                ))}
                <span className="text-[10px] text-dark-600">
                  {group.members.length} agente{group.members.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Result */}
            {resultado !== undefined && (
              <div className="text-right shrink-0">
                <p className={`text-sm font-mono font-bold ${resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatBRL(resultado)}
                </p>
                <p className="text-[10px] text-dark-500">
                  {resultado >= 0 ? 'A receber' : 'A pagar'}
                </p>
              </div>
            )}

            <ChevronRight className="w-4 h-4 text-dark-600 group-hover:text-dark-400 transition-colors shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
