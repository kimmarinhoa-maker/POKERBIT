'use client';

interface Props {
  thisWeek: number;
  lastWeek: number | null;
  newPlayers: number | null;
}

export default function ActivePlayersCard({ thisWeek, lastWeek, newPlayers }: Props) {
  const delta = lastWeek !== null ? thisWeek - lastWeek : null;
  const deltaPct = lastWeek !== null && lastWeek > 0 ? ((delta! / lastWeek) * 100).toFixed(1) : null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Jogadores Ativos
      </h3>

      <div className="space-y-4">
        {/* This week */}
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">
            Esta Semana
          </p>
          <p className="text-2xl font-bold text-white font-mono">{thisWeek}</p>
        </div>

        {/* Last week */}
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">
            Semana Anterior
          </p>
          <p className="text-lg font-bold text-dark-300 font-mono">
            {lastWeek !== null ? lastWeek : 'N/D'}
          </p>
        </div>

        {/* New players */}
        <div>
          <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">
            Novos
          </p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-dark-300 font-mono">
              {newPlayers !== null ? newPlayers : 'N/D'}
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
  );
}
