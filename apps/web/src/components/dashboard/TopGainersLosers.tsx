'use client';

import { formatBRL } from '@/lib/formatters';

interface PlayerEntry {
  name: string;
  winnings: number;
  rake: number;
  agent: string;
}

interface Props {
  players: PlayerEntry[];
}

const MEDAL_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];

export default function TopGainersLosers({ players }: Props) {
  const gainers = players
    .filter((p) => p.winnings > 0)
    .sort((a, b) => b.winnings - a.winnings)
    .slice(0, 5);

  const losers = players
    .filter((p) => p.winnings < 0)
    .sort((a, b) => a.winnings - b.winnings)
    .slice(0, 5);

  if (gainers.length === 0 && losers.length === 0) return null;

  const maxGain = gainers[0]?.winnings || 1;
  const maxLoss = Math.abs(losers[0]?.winnings || 1);

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Top Ganhadores & Perdedores
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Gainers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-semibold text-green-400">Top 5 Ganhadores</span>
          </div>
          {gainers.length === 0 ? (
            <p className="text-xs text-dark-500">Nenhum ganhador nesta semana</p>
          ) : (
            <div className="space-y-2">
              {gainers.map((p, i) => {
                const barWidth = maxGain > 0 ? (p.winnings / maxGain) * 100 : 0;
                const medal = i < 3 ? MEDAL_COLORS[i] : null;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-center flex-shrink-0">
                      {medal ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: medal + '20', color: medal, border: `1px solid ${medal}40` }}
                        >
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-[10px] text-dark-500 font-mono">{i + 1}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs text-dark-200 font-medium truncate">{p.name}</span>
                        <span className="text-xs font-mono text-green-400 flex-shrink-0">
                          +{formatBRL(p.winnings)}
                        </span>
                      </div>
                      <div className="bg-dark-800 rounded-full h-1.5">
                        <div
                          className="bg-green-500/60 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Losers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-400">Top 5 Perdedores</span>
          </div>
          {losers.length === 0 ? (
            <p className="text-xs text-dark-500">Nenhum perdedor nesta semana</p>
          ) : (
            <div className="space-y-2">
              {losers.map((p, i) => {
                const barWidth = maxLoss > 0 ? (Math.abs(p.winnings) / maxLoss) * 100 : 0;
                const medal = i < 3 ? MEDAL_COLORS[i] : null;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-center flex-shrink-0">
                      {medal ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: medal + '20', color: medal, border: `1px solid ${medal}40` }}
                        >
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-[10px] text-dark-500 font-mono">{i + 1}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs text-dark-200 font-medium truncate">{p.name}</span>
                        <span className="text-xs font-mono text-red-400 flex-shrink-0">
                          {formatBRL(p.winnings)}
                        </span>
                      </div>
                      <div className="bg-dark-800 rounded-full h-1.5">
                        <div
                          className="bg-red-500/60 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
