'use client';

import {
  BarChart3,
  Search,
  LineChart,
  Percent,
  Users,
  FileText,
  Wallet,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

interface TabItem {
  key: string;
  icon: LucideIcon;
  label: string;
  permKey: string; // permission resource key (e.g. 'tab:resumo')
}

interface TabSection {
  label: string;
  items: TabItem[];
}

const sections: TabSection[] = [
  {
    label: 'OPERACAO',
    items: [
      { key: 'resumo', icon: BarChart3, label: 'Resumo do Clube', permKey: 'tab:resumo' },
      { key: 'detalhamento', icon: Search, label: 'Detalhamento', permKey: 'tab:detalhamento' },
      { key: 'dashboard', icon: LineChart, label: 'Dashboard', permKey: 'tab:dashboard' },
      { key: 'rakeback', icon: Percent, label: 'Rakeback', permKey: 'tab:rakeback' },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { key: 'jogadores', icon: Users, label: 'Jogadores', permKey: 'tab:jogadores' },
      { key: 'comprovantes', icon: FileText, label: 'Comprovantes', permKey: 'tab:comprovantes' },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { key: 'caixa', icon: Wallet, label: 'Caixa', permKey: 'tab:extrato' },
      { key: 'ajustes', icon: SlidersHorizontal, label: 'Ajustes', permKey: 'tab:ajustes' },
    ],
  },
  {
    label: 'RESULTADO',
    items: [
      { key: 'dre', icon: TrendingUp, label: 'DRE', permKey: 'tab:dre' },
      { key: 'liga', icon: Trophy, label: 'Liga', permKey: 'tab:liga' },
    ],
  },
];

/** Returns the set of tab keys visible for a given hasPermission function */
export function getVisibleTabKeys(hasPermission: (resource: string) => boolean): Set<string> {
  const keys = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (hasPermission(item.permKey)) keys.add(item.key);
    }
  }
  return keys;
}

/** Returns ordered array of visible tab keys (for keyboard shortcuts 1-9) */
export function getVisibleTabList(hasPermission: (resource: string) => boolean): string[] {
  const keys: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (hasPermission(item.permKey)) keys.push(item.key);
    }
  }
  return keys;
}

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SubNavTabs({ activeTab, onTabChange }: Props) {
  const { hasPermission } = useAuth();

  // Build global shortcut index (1-9)
  let globalIdx = 0;
  const shortcutMap = new Map<string, number>();
  for (const section of sections) {
    for (const item of section.items) {
      if (hasPermission(item.permKey)) {
        globalIdx++;
        if (globalIdx <= 9) shortcutMap.set(item.key, globalIdx);
      }
    }
  }

  return (
    <div
      className="w-[200px] min-w-[200px] bg-dark-900/50 border-r border-dark-700/50 overflow-y-auto py-4"
      role="tablist"
      aria-label="Navegacao do settlement (atalhos: 1-9)"
    >
      {sections.map((section) => {
        const visibleItems = section.items.filter((item) => hasPermission(item.permKey));
        if (visibleItems.length === 0) return null;
        return (
          <div key={section.label} className="mb-4">
            <p className="px-5 py-1 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
              {section.label}
            </p>
            <div className="space-y-0.5 px-2">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const shortcut = shortcutMap.get(item.key);
                return (
                  <button
                    key={item.key}
                    role="tab"
                    aria-selected={activeTab === item.key}
                    aria-label={`${item.label}${shortcut ? ` (atalho: ${shortcut})` : ''}`}
                    onClick={() => onTabChange(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                      activeTab === item.key
                        ? 'bg-poker-600/15 text-poker-400 font-medium shadow-glow-green border-l-2 border-poker-500'
                        : 'text-dark-300 hover:bg-dark-800/50 hover:text-dark-100 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
