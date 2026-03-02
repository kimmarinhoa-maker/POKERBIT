'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface InactivePlayer {
  name: string;
  lastRake: number;
  agent: string;
  weeksAway: number;
}

interface Props {
  players: InactivePlayer[];
}

export default function InactivePlayersAlert({ players }: Props) {
  if (players.length === 0) {
    return (
      <div className="card border-green-500/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-green-400">Todos os jogadores ativos</h3>
            <p className="text-xs text-dark-500">Nenhum jogador ausente nas ultimas 4 semanas</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-amber-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-400">Jogadores Inativos</h3>
            <p className="text-xs text-dark-500">Ausentes nesta semana (ate 4 sem. anteriores)</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {players.length} jogador{players.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
        {players.map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-dark-800/50 rounded-lg hover:bg-dark-800 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] text-dark-500 font-mono w-4 text-right flex-shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-dark-200 truncate">{p.name}</p>
                {p.agent && (
                  <p className="text-[10px] text-dark-500 truncate">{p.agent}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-dark-400 font-mono">{formatBRL(p.lastRake)}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {p.weeksAway}a sem.
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
