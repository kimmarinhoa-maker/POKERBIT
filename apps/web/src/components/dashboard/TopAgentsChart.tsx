'use client';

import { formatBRL } from '@/lib/formatters';

interface AgentEntry {
  name: string;
  rake: number;
  players: number;
}

interface Props {
  agents: AgentEntry[];
}

const MEDAL_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];

export default function TopAgentsChart({ agents }: Props) {
  if (agents.length === 0) return null;

  const maxRake = agents[0]?.rake || 1;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Top 10 Agentes por Rake
      </h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="w-8 text-center">#</th>
              <th>Agente</th>
              <th className="text-right">Rake</th>
              <th className="text-right">Jogadores</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => {
              const barWidth = maxRake > 0 ? (a.rake / maxRake) * 100 : 0;
              const medal = i < 3 ? MEDAL_COLORS[i] : null;

              return (
                <tr key={i}>
                  <td className="text-center font-mono text-xs">
                    {medal ? (
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: medal + '20', color: medal, border: `1px solid ${medal}40` }}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      <span className="text-dark-500">{i + 1}</span>
                    )}
                  </td>
                  <td className="font-medium text-dark-200 text-sm truncate max-w-[140px]">
                    {a.name}
                  </td>
                  <td className="text-right">
                    <div className="relative">
                      <div
                        className="absolute inset-y-0 right-0 rounded opacity-15 bg-poker-500"
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className="relative font-mono text-sm text-dark-200">
                        {formatBRL(a.rake)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-mono text-sm text-dark-400">
                    {a.players}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
