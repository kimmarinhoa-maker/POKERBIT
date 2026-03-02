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
}

export default function CashVsTournament({ cash, tournament }: Props) {
  const totalRake = cash.rake + tournament.rake;
  if (totalRake === 0) return null;

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
    </div>
  );
}
