'use client';

interface SubclubInfo {
  id: string;
  name: string;
  totals: { players: number };
}

interface Props {
  subclubs: SubclubInfo[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  weekStart: string;
  status: string;
}

export default function SubclubSidebar({ subclubs, selected, onSelect, weekStart, status }: Props) {
  return (
    <div className="w-[180px] min-w-[180px] bg-dark-900 border-r border-dark-700 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-dark-700">
        <p className="text-xs text-dark-500 uppercase tracking-wider font-medium">Fechamento</p>
        <p className="text-sm text-dark-200 mt-1">
          {new Date(weekStart + 'T00:00:00').toLocaleDateString('pt-BR')}
        </p>
        <span className={`mt-1 inline-block ${
          status === 'DRAFT' ? 'badge-draft' : status === 'FINAL' ? 'badge-final' : 'badge-void'
        }`}>
          {status === 'DRAFT' ? 'RASCUNHO' : status}
        </span>
      </div>

      {/* Dashboard (visão geral) */}
      <div className="p-2">
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selected === null
              ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
              : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
          }`}
        >
          <span className="text-base">📊</span>
          Dashboard
          {selected === null && <span className="ml-auto text-xs text-poker-500">✓</span>}
        </button>
      </div>

      {/* Subclubes */}
      <div className="p-2 pt-0">
        <p className="px-3 py-1.5 text-[10px] text-dark-500 uppercase tracking-wider font-medium">
          Subclubes
        </p>
        <div className="space-y-0.5">
          {subclubs.map((sc) => (
            <button
              key={sc.id || sc.name}
              onClick={() => onSelect(sc.name)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                selected === sc.name
                  ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
                  : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
              }`}
            >
              <span className="font-medium truncate">{sc.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                selected === sc.name
                  ? 'bg-poker-700/30 text-poker-300'
                  : 'bg-dark-800 text-dark-400'
              }`}>
                {sc.totals.players}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
