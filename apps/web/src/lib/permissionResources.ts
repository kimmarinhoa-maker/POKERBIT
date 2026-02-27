// ══════════════════════════════════════════════════════════════════════
//  Permission Resources — Metadata para UI de configuracao
// ══════════════════════════════════════════════════════════════════════

import {
  LayoutDashboard,
  Upload,
  Clock,
  Receipt,
  Building2,
  Eye,
  Trophy,
  Wallet,
  Users,
  Link as LinkIcon,
  BarChart3,
  Search,
  LineChart,
  Percent,
  ClipboardList,
  FileText,
  BookOpen,
  Landmark,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface PermResourceItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface PermResourceSection {
  label: string;
  items: PermResourceItem[];
}

export const permissionSections: PermResourceSection[] = [
  {
    label: 'Operacao',
    items: [
      { key: 'page:dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'page:import', label: 'Importar', icon: Upload },
      { key: 'page:import_history', label: 'Historico', icon: Clock },
      { key: 'page:lancamentos', label: 'Lancamentos', icon: Receipt },
    ],
  },
  {
    label: 'Fechamentos',
    items: [
      { key: 'page:clubes', label: 'Clubes', icon: Building2 },
      { key: 'page:overview', label: 'Visao Geral', icon: Eye },
      { key: 'page:liga_global', label: 'Liga Global', icon: Trophy },
      { key: 'page:caixa_geral', label: 'Caixa Geral', icon: Wallet },
    ],
  },
  {
    label: 'Cadastro',
    items: [
      { key: 'page:players', label: 'Agentes / Jogadores', icon: Users },
      { key: 'page:clubs', label: 'Hierarquia Clubes', icon: Building2 },
      { key: 'page:links', label: 'Vincular', icon: LinkIcon },
    ],
  },
  {
    label: 'Tabs do Settlement',
    items: [
      { key: 'tab:resumo', label: 'Resumo', icon: BarChart3 },
      { key: 'tab:detalhamento', label: 'Detalhamento', icon: Search },
      { key: 'tab:dashboard', label: 'Dashboard', icon: LineChart },
      { key: 'tab:rakeback', label: 'Rakeback', icon: Percent },
      { key: 'tab:jogadores', label: 'Jogadores', icon: Users },
      { key: 'tab:liquidacao', label: 'Liquidacao', icon: ClipboardList },
      { key: 'tab:comprovantes', label: 'Comprovantes', icon: FileText },
      { key: 'tab:extrato', label: 'Extrato', icon: BookOpen },
      { key: 'tab:conciliacao', label: 'Conciliacao', icon: Landmark },
      { key: 'tab:ajustes', label: 'Ajustes', icon: SlidersHorizontal },
      { key: 'tab:dre', label: 'DRE', icon: TrendingUp },
      { key: 'tab:liga', label: 'Liga', icon: Trophy },
    ],
  },
];
