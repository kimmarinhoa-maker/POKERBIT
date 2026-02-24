'use client';

import {
  BarChart3,
  Search,
  LineChart,
  Percent,
  Users,
  ClipboardList,
  FileText,
  BookOpen,
  Landmark,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

// All roles constant for tabs visible to everyone
const ALL_ROLES = ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];

interface TabItem {
  key: string;
  icon: LucideIcon;
  label: string;
  roles: string[];
}

interface TabSection {
  label: string;
  items: TabItem[];
}

const sections: TabSection[] = [
  {
    label: 'OPERACAO',
    items: [
      { key: 'resumo',       icon: BarChart3,     label: 'Resumo do Clube', roles: ALL_ROLES },
      { key: 'detalhamento', icon: Search,         label: 'Detalhamento',    roles: ALL_ROLES },
      { key: 'dashboard',    icon: LineChart,      label: 'Dashboard',       roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { key: 'rakeback',     icon: Percent,        label: 'Rakeback',        roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { key: 'jogadores',    icon: Users,          label: 'Jogadores',    roles: ALL_ROLES },
      { key: 'liquidacao',   icon: ClipboardList,  label: 'Liquidacao',   roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { key: 'comprovantes', icon: FileText,       label: 'Comprovantes', roles: ALL_ROLES },
      { key: 'extrato',      icon: BookOpen,       label: 'Extrato',      roles: ALL_ROLES },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { key: 'conciliacao',  icon: Landmark,          label: 'Conciliacao', roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { key: 'ajustes',      icon: SlidersHorizontal, label: 'Ajustes',     roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
    ],
  },
  {
    label: 'RESULTADO',
    items: [
      { key: 'dre',          icon: TrendingUp,  label: 'DRE',  roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { key: 'liga',         icon: Trophy,       label: 'Liga', roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
    ],
  },
];

/** Returns the set of tab keys visible for a given role */
export function getVisibleTabKeys(role: string): Set<string> {
  const keys = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (item.roles.includes(role)) keys.add(item.key);
    }
  }
  return keys;
}

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SubNavTabs({ activeTab, onTabChange }: Props) {
  const { role } = useAuth();

  return (
    <div className="w-[200px] min-w-[200px] bg-dark-900/50 border-r border-dark-700/50 overflow-y-auto py-4" role="tablist" aria-label="Navegacao do settlement">
      {sections.map((section) => {
        const visibleItems = section.items.filter(item => item.roles.includes(role));
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
                    aria-label={item.label}
                    onClick={() => onTabChange(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === item.key
                        ? 'bg-poker-600/15 text-poker-400 font-medium'
                        : 'text-dark-300 hover:bg-dark-800/50 hover:text-dark-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.label}</span>
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
