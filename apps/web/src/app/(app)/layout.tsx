'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/Toast';
import ScrollToTop from '@/components/ui/ScrollToTop';
import { AuthProvider, useAuth } from '@/lib/useAuth';

const CommandPalette = dynamic(() => import('@/components/ui/CommandPalette'), { ssr: false });
import {
  LayoutDashboard,
  Upload,
  Receipt,
  Building2,
  Trophy,
  Users,
  Settings,
  Spade,
  Menu,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import TenantSelector from '@/components/TenantSelector';
import { useSidebarClubs } from '@/lib/useSidebarClubs';

// ─── Sidebar structure ──────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  permKey?: string; // permission resource key (checked via hasPermission)
}

interface NavSection {
  label: string;
  items: NavItem[];
  adminOnly?: boolean; // section visible only to OWNER/ADMIN
  requireSubclubs?: boolean; // section visible only when has_subclubs=true
}

const navSections: NavSection[] = [
  {
    label: 'OPERACAO',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permKey: 'page:dashboard' },
      { href: '/import', label: 'Importar', icon: Upload, permKey: 'page:import' },
      { href: '/lancamentos', label: 'Lancamentos', icon: Receipt, permKey: 'page:lancamentos' },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { href: '/s', label: 'Fechamentos', icon: Building2, permKey: 'page:clubes' },
      { href: '/liga-global', label: 'Liga Global', icon: Trophy, permKey: 'page:liga_global' },
    ],
  },
  {
    label: 'CADASTRO',
    items: [
      { href: '/clubs', label: 'Clubes', icon: Building2, permKey: 'page:clubes' },
      { href: '/players', label: 'Agentes / Jogadores', icon: Users, permKey: 'page:players' },
    ],
  },
  {
    label: 'CONFIGURACOES',
    adminOnly: true,
    items: [
      { href: '/config', label: 'Configuracao', icon: Settings },
      { href: '/config/equipe', label: 'Equipe', icon: Users },
    ],
  },
];

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
  outro: 'Outros',
};

const PLATFORM_COLORS: Record<string, string> = {
  suprema: 'bg-amber-500',
  pppoker: 'bg-green-500',
  clubgg: 'bg-blue-500',
  outro: 'bg-dark-500',
};

const PLATFORM_ICON_BG: Record<string, string> = {
  suprema: 'bg-amber-900/30 text-amber-400',
  pppoker: 'bg-green-900/30 text-green-400',
  clubgg: 'bg-blue-900/30 text-blue-400',
  outro: 'bg-dark-800 text-dark-400',
};

// ─── Active route check ─────────────────────────────────────────────

function isRouteActive(pathname: string, href: string, hasClubLinks: boolean): boolean {
  if (href === '#') return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  // When dynamic club links exist, only highlight "Fechamentos" on the exact /s page (redirect)
  // When no club links, highlight for all /s/* pages (legacy behavior)
  if (href === '/s') return hasClubLinks ? pathname === '/s' : pathname.startsWith('/s');
  if (href === '/import') return pathname === '/import';
  if (href === '/config') return pathname === '/config' || (pathname.startsWith('/config/') && pathname !== '/config/equipe');
  if (href === '/config/equipe') return pathname === '/config/equipe';
  return pathname === href || pathname.startsWith(href + '/');
}

// ─── Inner Layout (uses useAuth) ────────────────────────────────────

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, role, tenantName, isAdmin, hasSubclubs, hasPermission, logout, loading } = useAuth();
  const { groups: clubGroups, loading: clubsLoading, reload: reloadClubs, settlementClubMap } = useSidebarClubs(!loading && !!user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clubsExpanded, setClubsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('sidebar-clubs-expanded') !== 'false';
  });
  const [activePlatformTab, setActivePlatformTab] = useState<string>('');
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  // Persist clubs expanded state
  useEffect(() => {
    localStorage.setItem('sidebar-clubs-expanded', String(clubsExpanded));
  }, [clubsExpanded]);

  // Auto-select first platform tab when clubs load (or match active club's platform)
  useEffect(() => {
    if (clubGroups.length === 0) return;
    // If user is viewing a settlement, select its platform
    const pathSettlementId = pathname.startsWith('/s/') ? pathname.split('/')[2] : '';
    const currentClubId = pathSettlementId ? settlementClubMap.get(pathSettlementId) : undefined;
    if (currentClubId) {
      for (const g of clubGroups) {
        if (g.clubs.some((c) => c.clubId === currentClubId)) {
          setActivePlatformTab(g.platform);
          return;
        }
      }
    }
    // Default to first platform or keep current
    if (!activePlatformTab || !clubGroups.some((g) => g.platform === activePlatformTab)) {
      setActivePlatformTab(clubGroups[0].platform);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubGroups, pathname, settlementClubMap]);

  // Close sidebar on route change (mobile) + reload clubs when leaving /import
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    setSidebarOpen(false);
    // Reload sidebar clubs when navigating away from import (new settlement may have been created)
    if (prevPathRef.current === '/import' && pathname !== '/import') {
      reloadClubs();
    }
    prevPathRef.current = pathname;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-dark-800" />
          <div className="h-2 w-24 bg-dark-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-dark-900 border-b border-dark-700 flex items-center px-4 h-14 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-dark-300 hover:text-white p-1.5 -ml-1 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 rounded-lg bg-poker-600 flex items-center justify-center">
            <Spade className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm">Poker Manager</span>
        </Link>
      </div>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        role="navigation"
        className={`
        fixed inset-y-0 left-0 z-50 bg-dark-900 border-r border-dark-700 flex flex-col
        transform transition-all duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'lg:w-[68px] w-64' : 'w-64'}
      `}
      >
        {/* Logo + Tenant Selector */}
        <div className={`border-b border-dark-700 ${collapsed ? 'lg:p-3 p-6' : 'px-4 pt-5 pb-4'}`}>
          <Link href="/dashboard" className="flex items-center gap-3" title={collapsed ? 'Poker Manager' : undefined}>
            <div className="w-10 h-10 rounded-xl bg-poker-600 flex items-center justify-center shrink-0">
              <Spade className="w-5 h-5 text-white" />
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <h1 className="font-bold text-white text-lg leading-tight">Poker Manager</h1>
            </div>
          </Link>
          <TenantSelector collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'lg:p-2 p-4 lg:space-y-3 space-y-5' : 'p-4 space-y-5'}`} aria-label="Menu principal">
          {navSections
            .filter((section) => (!section.adminOnly || isAdmin) && (!section.requireSubclubs || hasSubclubs))
            .map((section) => {
              const visibleItems = section.items.filter((item) => !item.permKey || hasPermission(item.permKey));
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.label}>
                  <p className={`px-3 mb-1.5 text-[10px] text-dark-500 uppercase tracking-wider font-semibold ${collapsed ? 'lg:hidden' : ''}`}>
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;

                      if (item.disabled) {
                        return (
                          <span
                            key={item.label}
                            className={`flex items-center gap-3 rounded-lg text-sm text-dark-600 cursor-not-allowed ${collapsed ? 'lg:justify-center lg:px-0 lg:py-2 px-3 py-2' : 'px-3 py-2'}`}
                            title={collapsed ? item.label : undefined}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                            <span className={`ml-auto text-[9px] text-dark-600 uppercase ${collapsed ? 'lg:hidden' : ''}`}>Em breve</span>
                          </span>
                        );
                      }

                      const isActive = isRouteActive(pathname, item.href, clubGroups.length > 0);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                          className={`flex items-center gap-3 rounded-lg transition-colors text-sm font-medium ${
                            collapsed ? 'lg:justify-center lg:px-0 lg:py-2 px-3 py-2' : 'px-3 py-2'
                          } ${
                            isActive
                              ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30 shadow-glow-green'
                              : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          {/* ── Dynamic Clubs Section (Tabs) ── */}
          {!clubsLoading && clubGroups.length > 0 && (() => {
            const pathSettlementId = pathname.startsWith('/s/') ? pathname.split('/')[2] : '';
            const activeClubId = pathSettlementId ? settlementClubMap.get(pathSettlementId) : undefined;
            const activeGroup = clubGroups.find((g) => g.platform === activePlatformTab) || clubGroups[0];
            return (
            <div>
              {/* Section header with toggle */}
              <button
                onClick={() => setClubsExpanded((v) => !v)}
                className={`flex items-center w-full px-3 mb-2 text-[10px] text-dark-500 uppercase tracking-wider font-semibold hover:text-dark-300 transition-colors ${collapsed ? 'lg:hidden' : ''}`}
              >
                {clubsExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                MEUS CLUBES
              </button>

              {(clubsExpanded || collapsed) && (
                <div>
                  {/* Platform tabs — hidden when collapsed */}
                  {clubGroups.length > 1 && (
                    <div className={`flex gap-1 px-2 mb-2 ${collapsed ? 'lg:hidden' : ''}`}>
                      {clubGroups.map((group) => {
                        const isTabActive = group.platform === activePlatformTab;
                        const dotColor = PLATFORM_COLORS[group.platform] || PLATFORM_COLORS.outro;
                        return (
                          <button
                            key={group.platform}
                            onClick={() => setActivePlatformTab(group.platform)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all ${
                              isTabActive
                                ? 'bg-dark-700/80 text-white'
                                : 'text-dark-500 hover:text-dark-300 hover:bg-dark-800/50'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            {PLATFORM_LABELS[group.platform]?.split(' ')[0] || group.platform}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Single platform label when only one platform */}
                  {clubGroups.length === 1 && (
                    <div className={`flex items-center gap-2 px-3 mb-1.5 ${collapsed ? 'lg:hidden' : ''}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${PLATFORM_COLORS[activeGroup.platform] || PLATFORM_COLORS.outro}`} />
                      <span className="text-[9px] text-dark-500 uppercase tracking-wider font-medium">
                        {PLATFORM_LABELS[activeGroup.platform] || activeGroup.platform}
                      </span>
                    </div>
                  )}

                  {/* Club list for active platform */}
                  <div className="space-y-0.5">
                    {(collapsed
                      ? clubGroups.flatMap((g) => g.clubs)
                      : activeGroup.clubs
                    ).map((club) => {
                      const clubHref = `/s/${club.settlementId}`;
                      const isActive = activeClubId === club.clubId;
                      const iconBg = PLATFORM_ICON_BG[club.platform] || PLATFORM_ICON_BG.outro;
                      return (
                        <Link
                          key={club.clubId}
                          href={clubHref}
                          title={collapsed ? club.clubName : undefined}
                          className={`flex items-center gap-2.5 rounded-lg transition-colors text-sm font-medium ${
                            collapsed ? 'lg:justify-center lg:px-0 lg:py-2 px-3 py-1.5' : 'px-3 py-1.5'
                          } ${
                            isActive
                              ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30 shadow-glow-green'
                              : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
                            <Building2 className="w-3 h-3" />
                          </div>
                          <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{club.clubName}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex justify-center py-2 border-t border-dark-700">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-dark-400 hover:text-white p-2 rounded-lg hover:bg-dark-800 transition-colors"
            title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* User */}
        <div className={`border-t border-dark-700 ${collapsed ? 'lg:p-2 p-4' : 'p-4'}`}>
          <div className={`flex items-center ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
            <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-sm font-medium text-dark-200 truncate">{user.email}</p>
              <p className="text-xs text-dark-500">{role}</p>
            </div>
            <button
              onClick={logout}
              className="text-dark-400 hover:text-red-400 transition-colors p-1"
              title="Sair"
              aria-label="Sair da conta"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">
        <div className="animate-fade-in">
          {children}
        </div>
        <ScrollToTop />
        <CommandPalette />
      </main>
    </div>
  );
}

// ─── Layout (wraps with providers) ──────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </AuthProvider>
    </ToastProvider>
  );
}
