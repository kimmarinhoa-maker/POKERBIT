'use client';

import { formatBRL } from '@/lib/api';
import ClubLogo from '@/components/ClubLogo';

interface Props {
  subclubs: any[];
  dashboardTotals: any;
  onSelectSubclub: (name: string) => void;
  logoMap?: Record<string, string | null>;
}

export default function SettlementDashboard({ subclubs, dashboardTotals, onSelectSubclub, logoMap = {} }: Props) {
  const t = dashboardTotals;

  return (
    <div>
      {/* KPIs globais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <DashKpiCard label="Jogadores" value={String(t.players)} icon="users" borderColor="bg-blue-500" />
        <DashKpiCard label="Agentes" value={String(t.agents)} icon="building" borderColor="bg-purple-500" />
        <DashKpiCard label="Rake Total" value={formatBRL(t.rake)} icon="game" borderColor="bg-poker-500" />
        <DashKpiCard label="GGR Total" value={formatBRL(t.ggr)} icon="target" borderColor="bg-purple-500" />
        <DashKpiCard
          label="Resultado Total"
          value={formatBRL(t.resultado)}
          icon="trend"
          borderColor={t.resultado >= 0 ? 'bg-amber-500' : 'bg-red-500'}
          textColor={t.resultado < 0 ? 'text-red-400' : 'text-amber-400'}
        />
      </div>

      {/* Cards por subclube */}
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        Subclubes
        <span className="text-sm font-normal text-dark-400">({subclubs.length})</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {subclubs.map((sc) => (
          <button
            key={sc.id || sc.name}
            onClick={() => onSelectSubclub(sc.name)}
            className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-poker-600/50 shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 cursor-pointer text-left group"
          >
            {/* Borda superior colorida */}
            <div className={`h-0.5 ${sc.acertoLiga >= 0 ? 'bg-poker-500' : 'bg-red-500'}`} />

            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ClubLogo
                    logoUrl={logoMap[sc.name.toLowerCase()]}
                    name={sc.name}
                    size="md"
                    className="group-hover:ring-1 group-hover:ring-poker-500/30 transition-all"
                  />
                  <div>
                    <h4 className="font-bold text-white group-hover:text-poker-400 transition-colors">{sc.name}</h4>
                    <p className="text-xs text-dark-400">
                      {sc.totals.players} jogadores · {sc.totals.agents} agentes
                    </p>
                  </div>
                </div>
                <span className="text-dark-500 group-hover:text-poker-400 transition-colors text-lg">&rarr;</span>
              </div>

              {/* Mini KPIs */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-dark-700/50">
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Rake</p>
                  <p className="text-sm font-mono text-dark-200 font-medium">{formatBRL(sc.totals.rake)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Resultado</p>
                  <p
                    className={`text-sm font-mono font-medium ${sc.totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'}`}
                  >
                    {formatBRL(sc.totals.resultado)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider">Acerto</p>
                  <p
                    className={`text-sm font-mono font-medium ${sc.acertoLiga < 0 ? 'text-red-400' : 'text-poker-400'}`}
                  >
                    {formatBRL(sc.acertoLiga)}
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashKpiCard({
  label,
  value,
  icon,
  borderColor,
  textColor,
}: {
  label: string;
  value: string;
  icon: string;
  borderColor: string;
  textColor?: string;
}) {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default">
      <div className={`h-0.5 ${borderColor}`} />
      <div className="p-4">
        <div className="min-w-0">
          <p className="text-[10px] text-dark-400 uppercase tracking-wider">{label}</p>
          <p className={`text-lg font-bold font-mono truncate ${textColor || 'text-white'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
