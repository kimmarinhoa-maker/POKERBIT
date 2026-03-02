'use client';

import { formatBRL } from '@/lib/formatters';
import { getColor, getLabel } from './modalityColors';

interface PlayerEntry {
  name: string;
  rake: number;
  mainModality: string;
  hands: number;
}

interface Props {
  players: PlayerEntry[];
}

const MEDAL_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];

export default function TopPlayersChart({ players }: Props) {
  if (players.length === 0) return null;

  const maxRake = players[0]?.rake || 1;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Top 10 Jogadores por Rake
      </h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="w-8 text-center">#</th>
              <th>Jogador</th>
              <th className="text-right">Rake</th>
              <th className="text-center">Modalidade</th>
              <th className="text-right">Maos</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const barWidth = maxRake > 0 ? (p.rake / maxRake) * 100 : 0;
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
                    {p.name}
                  </td>
                  <td className="text-right">
                    <div className="relative">
                      <div
                        className="absolute inset-y-0 right-0 rounded opacity-15"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: getColor(p.mainModality),
                        }}
                      />
                      <span className="relative font-mono text-sm text-dark-200">
                        {formatBRL(p.rake)}
                      </span>
                    </div>
                  </td>
                  <td className="text-center">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                      style={{
                        color: getColor(p.mainModality),
                        borderColor: getColor(p.mainModality) + '40',
                        backgroundColor: getColor(p.mainModality) + '15',
                      }}
                    >
                      {getLabel(p.mainModality)}
                    </span>
                  </td>
                  <td className="text-right font-mono text-sm text-dark-400">
                    {p.hands.toLocaleString('pt-BR')}
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
