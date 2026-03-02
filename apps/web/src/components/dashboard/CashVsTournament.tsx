'use client';

import { formatBRL } from '@/lib/formatters';

interface SegmentData {
  rake: number;
  players: number;
  hands: number;
  pct: number;
}

interface Props {
  cash: SegmentData;
  tournament: SegmentData;
  activePlayers?: {
    thisWeek: number;
    lastWeek: number | null;
    newPlayers: number | null;
  };
}

export default function CashVsTournament({ cash, tournament, activePlayers }: Props) {
  const totalRake = cash.rake + tournament.rake;
  if (totalRake === 0) return null;

  const delta = activePlayers && activePlayers.lastWeek !== null
    ? activePlayers.thisWeek - activePlayers.lastWeek
    : null;
  const deltaPct = activePlayers && activePlayers.lastWeek !== null && activePlayers.lastWeek > 0
    ? ((delta! / activePlayers.lastWeek) * 100).toFixed(1)
    : null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Cash vs Torneios
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Cash Card */}
        <div className="bg-dark-800/50 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-400">Cash</span>
          </div>
          <p className="text-lg font-bold text-white font-mono mb-1">{formatBRL(cash.rake)}</p>
          <div className="space-y-0.5 text-[10px] text-dark-400">
            <p>{cash.players} jogadores</p>
            <p>{cash.hands.toLocaleString('pt-BR')} maos</p>
          </div>
        </div>

        {/* Tournament Card */}
        <div className="bg-dark-800/50 border border-blue-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-400">Torneios</span>
          </div>
          <p className="text-lg font-bold text-white font-mono mb-1">{formatBRL(tournament.rake)}</p>
          <div className="space-y-0.5 text-[10px] text-dark-400">
            <p>{tournament.players} jogadores</p>
            <p>{tournament.hands.toLocaleString('pt-BR')} maos</p>
          </div>
        </div>
      </div>

      {/* Proportion bar */}
      <div className="relative">
        <div className="flex rounded-full h-2.5 overflow-hidden bg-dark-800">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${cash.pct}%` }}
          />
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${tournament.pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-emerald-400 font-mono">{cash.pct}%</span>
          <span className="text-[10px] text-blue-400 font-mono">{tournament.pct}%</span>
        </div>
      </div>

      {/* Active Players (inline) */}
      {activePlayers && (
        <div className="mt-4 pt-4 border-t border-dark-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Jogadores Ativos</p>
              <p className="text-xl font-bold text-white font-mono">{activePlayers.thisWeek}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Sem. Anterior</p>
              <p className="text-sm font-bold text-dark-300 font-mono">
                {activePlayers.lastWeek !== null ? activePlayers.lastWeek : 'N/D'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">Novos</p>
              <div className="flex items-center gap-1.5 justify-end">
                <p className="text-sm font-bold text-dark-300 font-mono">
                  {activePlayers.newPlayers !== null ? activePlayers.newPlayers : 'N/D'}
                </p>
                {delta !== null && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      delta > 0
                        ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                        : delta < 0
                          ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                          : 'text-dark-400 bg-dark-800 border border-dark-700'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}{delta} ({deltaPct}%)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
