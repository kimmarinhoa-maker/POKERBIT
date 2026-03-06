'use client';

import {
  LayoutDashboard,
  CalendarDays,
  Network,
  Users,
  UserCheck,
  Wallet,
  Search,
  TrendingUp,
  FileText,
  Trophy,
  Building2,
  SlidersHorizontal,
  Percent,
  CreditCard,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export interface ClubTabItem {
  key: string;
  icon: LucideIcon;
  label: string;
  permKey: string;
}

interface ClubTabSection {
  label: string;
  items: ClubTabItem[];
}

const sections: ClubTabSection[] = [
  {
    label: 'OPERACAO',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', permKey: 'tab:dashboard' },
      { key: 'fechamentos', icon: CalendarDays, label: 'Fechamentos', permKey: 'tab:resumo' },
    ],
  },
  {
    label: 'CADASTRO',
    items: [
      { key: 'subclubes', icon: Network, label: 'Subclubes', permKey: 'tab:liga' },
      { key: 'agentes', icon: UserCheck, label: 'Agentes', permKey: 'tab:detalhamento' },
      { key: 'jogadores', icon: Users, label: 'Jogadores', permKey: 'tab:jogadores' },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { key: 'caixa', icon: Wallet, label: 'Caixa', permKey: 'tab:extrato' },
      { key: 'conciliacao', icon: Search, label: 'Conciliacao', permKey: 'tab:conciliacao' },
      { key: 'dre', icon: TrendingUp, label: 'DRE', permKey: 'tab:dre' },
      { key: 'comprovantes', icon: FileText, label: 'Comprovantes', permKey: 'tab:comprovantes' },
      { key: 'liga', icon: Trophy, label: 'Liga', permKey: 'tab:liga' },
    ],
  },
  {
    label: 'CONFIGURACAO',
    items: [
      { key: 'dados', icon: Building2, label: 'Dados do Clube', permKey: 'tab:resumo' },
      { key: 'taxas', icon: SlidersHorizontal, label: 'Taxas', permKey: 'tab:ajustes' },
      { key: 'rakeback', icon: Percent, label: 'Rakeback', permKey: 'tab:rakeback' },
      { key: 'pagamentos', icon: CreditCard, label: 'Pagamentos', permKey: 'tab:extrato' },
      { key: 'categorias', icon: Tag, label: 'Categorias', permKey: 'tab:ajustes' },
    ],
  },
];

export function getClubVisibleTabKeys(hasPermission: (resource: string) => boolean): Set<string> {
  const keys = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (hasPermission(item.permKey)) keys.add(item.key);
    }
  }
  return keys;
}

export function getClubVisibleTabList(hasPermission: (resource: string) => boolean): string[] {
  const keys: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (hasPermission(item.permKey)) keys.push(item.key);
    }
  }
  return keys;
}

/** Filter out 'subclubes' tab if club has no subclubes */
export function getClubSections(hasSubclubes: boolean): ClubTabSection[] {
  if (hasSubclubes) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.key !== 'subclubes'),
  }));
}

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasSubclubes?: boolean;
}

export default function ClubNavTabs({ activeTab, onTabChange, hasSubclubes = true }: Props) {
  const { hasPermission } = useAuth();
  const filteredSections = getClubSections(hasSubclubes);

  return (
    <div
      className="w-[200px] min-w-[200px] bg-dark-900/50 border-r border-dark-700/50 overflow-y-auto py-4"
      role="tablist"
      aria-label="Navegacao do clube"
    >
      {filteredSections.map((section) => {
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
                return (
                  <button
                    key={item.key}
                    role="tab"
                    aria-selected={activeTab === item.key}
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
