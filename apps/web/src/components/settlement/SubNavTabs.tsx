'use client';

const sections = [
  {
    label: 'OPERACAO',
    items: [
      { key: 'resumo',       icon: '📊', label: 'Resumo do Clube' },
      { key: 'detalhamento', icon: '🔍', label: 'Detalhamento' },
      { key: 'rakeback',     icon: '💰', label: 'Rakeback' },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { key: 'jogadores',    icon: '👥', label: 'Jogadores' },
      { key: 'liquidacao',   icon: '📋', label: 'Liquidacao' },
      { key: 'comprovantes', icon: '📄', label: 'Comprovantes' },
      { key: 'extrato',      icon: '📜', label: 'Extrato' },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { key: 'conciliacao',  icon: '🏦', label: 'Conciliacao' },
      { key: 'ajustes',      icon: '⚙️', label: 'Ajustes' },
    ],
  },
  {
    label: 'RESULTADO',
    items: [
      { key: 'dre',          icon: '📈', label: 'DRE' },
      { key: 'liga',         icon: '🏆', label: 'Liga' },
    ],
  },
];

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SubNavTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="w-[200px] min-w-[200px] bg-dark-900/50 border-r border-dark-700/50 overflow-y-auto py-4" role="tablist" aria-label="Navegacao do settlement">
      {sections.map((section) => (
        <div key={section.label} className="mb-4">
          <p className="px-5 py-1 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
            {section.label}
          </p>
          <div className="space-y-0.5 px-2">
            {section.items.map((item) => (
              <button
                key={item.key}
                role="tab"
                aria-selected={activeTab === item.key}
                aria-label={item.label}
                onClick={() => onTabChange(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === item.key
                    ? 'bg-poker-600/15 text-poker-400 font-medium'
                    : 'text-dark-300 hover:bg-dark-800/50 hover:text-dark-100'
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
