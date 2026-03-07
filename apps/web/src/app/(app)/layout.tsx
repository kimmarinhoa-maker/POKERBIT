'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/Toast';
import ScrollToTop from '@/components/ui/ScrollToTop';
import { AuthProvider, useAuth } from '@/lib/useAuth';
import { getOrgTree, listSettlements } from '@/lib/api';
import ClubLogo from '@/components/ClubLogo';

const CommandPalette = dynamic(() => import('@/components/ui/CommandPalette'), { ssr: false });
import {
  LayoutDashboard,
  Upload,
  Wallet,
  Users,
  Spade,
  Menu,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import TenantSelector from '@/components/TenantSelector';

// ─── Sidebar nav structure ───────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permKey?: string;
}

const operacaoItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permKey: 'page:dashboard' },
  { href: '/import', label: 'Importar', icon: Upload, permKey: 'page:import' },
];

const adminItems: NavItem[] = [
  { href: '/caixa-geral', label: 'Caixa Geral', icon: Wallet, permKey: 'page:caixa_geral' },
  { href: '/config/equipe', label: 'Equipe', icon: Users },
];

// ─── Club tree types ─────────────────────────────────────────────────

interface SidebarSubclub {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface SidebarClub {
  id: string;
  name: string;
  platform: string;
  externalId: string | null;
  ligaId: string | null;
  logoUrl: string | null;
  subclubes: SidebarSubclub[];
  lastSettlementId: string | null;
}

// ─── Active route check ─────────────────────────────────────────────

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/import') return pathname === '/import' || pathname.startsWith('/import/');
  if (href === '/caixa-geral') return pathname === '/caixa-geral';
  if (href === '/config/equipe') return pathname === '/config/equipe';
  return pathname === href || pathname.startsWith(href + '/');
}

// ─── Reusable nav link styles (Apple-style) ─────────────────────────

function navLinkClass(isActive: boolean, collapsed: boolean): string {
  return `flex items-center gap-3 rounded-lg transition-all duration-150 text-[13px] font-medium ${
    collapsed ? 'lg:justify-center lg:px-0 lg:py-2 px-3 py-[7px]' : 'px-3 py-[7px]'
  } ${
    isActive
      ? 'bg-white/[0.08] text-white'
      : 'text-dark-400 hover:bg-white/[0.04] hover:text-dark-200'
  }`;
}

// ─── Inner Layout (uses useAuth) ────────────────────────────────────

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isAdmin, hasPermission, logout, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  // Club tree state
  const [clubs, setClubs] = useState<SidebarClub[]>([]);
  const [clubsLoaded, setClubsLoaded] = useState(false);
  const [clubsOpen, setClubsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('sidebar-clubs-open') !== 'false';
  });

  useEffect(() => { localStorage.setItem('sidebar-collapsed', String(collapsed)); }, [collapsed]);
  useEffect(() => { localStorage.setItem('sidebar-clubs-open', String(clubsOpen)); }, [clubsOpen]);
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Load club tree
  const loadClubs = useCallback(async () => {
    try {
      const [treeRes, settRes] = await Promise.all([getOrgTree(), listSettlements()]);
      const lastSettMap = new Map<string, string>();
      if (settRes.success && settRes.data) {
        for (const s of settRes.data as any[]) {
          if (s.status === 'VOID') continue;
          if (!lastSettMap.has(s.club_id)) lastSettMap.set(s.club_id, s.id);
        }
      }
      if (treeRes.success && treeRes.data) {
        const result: SidebarClub[] = [];
        for (const club of treeRes.data) {
          if (club.type !== 'CLUB') continue;
          const subs: SidebarSubclub[] = (club.subclubes || []).map((s: any) => ({
            id: s.id, name: s.name,
            logoUrl: s.logo_url || s.metadata?.logo_url || null,
          }));
          result.push({
            id: club.id, name: club.name,
            platform: (club.metadata?.platform || 'outro').toLowerCase(),
            externalId: club.external_id || null,
            ligaId: club.metadata?.liga_id || null,
            logoUrl: club.logo_url || club.metadata?.logo_url || null,
            subclubes: subs,
            lastSettlementId: lastSettMap.get(club.id) || null,
          });
        }
        setClubs(result);
      }
    } catch {
      // silent
    } finally {
      setClubsLoaded(true);
    }
  }, []);

  useEffect(() => { if (user) loadClubs(); }, [user, loadClubs]);

  const prevPathRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (user && clubsLoaded && prev.startsWith('/import') && (pathname.startsWith('/s/') || pathname === '/clubs')) {
      loadClubs();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Group clubs by platform
  const platformOrder = ['suprema', 'pppoker', 'clubgg', 'outro'];
  const clubsByPlatform = new Map<string, SidebarClub[]>();
  for (const c of clubs) {
    const list = clubsByPlatform.get(c.platform) || [];
    list.push(c);
    clubsByPlatform.set(c.platform, list);
  }
  const sortedPlatforms = [...clubsByPlatform.entries()].sort(([a], [b]) => {
    const ia = platformOrder.indexOf(a);
    const ib = platformOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const PLATFORM_DOT: Record<string, string> = {
    suprema: 'bg-emerald-400',
    pppoker: 'bg-violet-400',
    clubgg: 'bg-blue-400',
  };
  const PLATFORM_LABELS: Record<string, string> = {
    suprema: 'Suprema',
    pppoker: 'PPPoker',
    clubgg: 'ClubGG',
  };

  function isClubActive(club: SidebarClub): boolean {
    if (!club.lastSettlementId) return false;
    return pathname.startsWith(`/s/${club.lastSettlementId}`);
  }

  // User initials for avatar
  const userInitials = (user.email || '?')
    .split('@')[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-md border-b border-white/[0.06] flex items-center px-4 h-14 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-dark-400 hover:text-white p-1.5 -ml-1 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 rounded-lg bg-poker-600 flex items-center justify-center">
            <Spade className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight">POKERBIT</span>
        </Link>
      </div>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        role="navigation"
        className={`
        fixed inset-y-0 left-0 z-50 bg-dark-950 border-r border-white/[0.06] flex flex-col
        transform transition-all duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'lg:w-[68px] w-64' : 'w-64'}
      `}
      >
        {/* Logo + Tenant */}
        <div className={`border-b border-white/[0.06] ${collapsed ? 'lg:p-3 p-5' : 'px-4 pt-5 pb-4'}`}>
          <Link href="/dashboard" className="flex items-center gap-3" title={collapsed ? 'POKERBIT' : undefined}>
            <div className="w-9 h-9 rounded-xl bg-poker-600 flex items-center justify-center shrink-0">
              <Spade className="w-[18px] h-[18px] text-white" />
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <h1 className="font-bold text-white text-base tracking-tight leading-none">POKERBIT</h1>
            </div>
          </Link>
          <TenantSelector collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'lg:px-2 lg:py-3 p-3' : 'px-3 py-3'} space-y-1`} aria-label="Menu principal">
          {/* ── OPERACAO ──────────────────────────────────── */}
          {(() => {
            const visible = operacaoItems.filter((item) => !item.permKey || hasPermission(item.permKey));
            if (visible.length === 0) return null;
            return (
              <div className="space-y-0.5">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = isRouteActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={navLinkClass(isActive, collapsed)}
                    >
                      <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-dark-500'}`} />
                      <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Divider ──────────────────────────────────── */}
          <div className={`border-t border-white/[0.06] my-2 ${collapsed ? 'lg:mx-1' : 'mx-1'}`} />

          {/* ── MEUS CLUBES ─────────────────────────────── */}
          <div className={collapsed ? 'lg:hidden' : ''}>
            <button
              onClick={() => {
                if (pathname === '/clubs' || pathname.startsWith('/s/')) {
                  setClubsOpen((o) => !o);
                } else {
                  setClubsOpen(true);
                  router.push('/clubs');
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-[7px] rounded-lg transition-all duration-150 text-[13px] font-medium ${
                pathname === '/clubs'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-dark-400 hover:bg-white/[0.04] hover:text-dark-200'
              }`}
            >
              <Spade className={`w-[18px] h-[18px] flex-shrink-0 ${pathname === '/clubs' ? 'text-white' : 'text-dark-500'}`} />
              <span className="flex-1 text-left">Meus Clubes</span>
              {clubs.length > 0 && (
                <span className="text-[10px] text-dark-500 font-mono tabular-nums">{clubs.length}</span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-dark-600 transition-transform duration-200 ${clubsOpen ? 'rotate-180' : ''}`} />
            </button>

            {clubsOpen && (
              <div className="mt-1 space-y-3 ml-1">
                {clubs.length === 0 && clubsLoaded ? (
                  <p className="px-3 text-[11px] text-dark-600">Importe uma planilha para ver seus clubes.</p>
                ) : (
                  sortedPlatforms.map(([platform, platformClubs]) => (
                    <div key={platform}>
                      {/* Platform label */}
                      <div className="flex items-center gap-1.5 px-3 mb-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${PLATFORM_DOT[platform] || 'bg-dark-500'}`} />
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-dark-500">
                          {PLATFORM_LABELS[platform] || platform}
                        </span>
                      </div>

                      {/* Clubs under this platform */}
                      {platformClubs.map((club) => {
                        const clubActive = isClubActive(club);
                        const clubHref = club.lastSettlementId
                          ? club.subclubes.length > 0
                            ? `/s/${club.lastSettlementId}/club/_all`
                            : `/s/${club.lastSettlementId}/club/${encodeURIComponent(club.name)}`
                          : `/clubs/${club.id}`;

                        const isAllActive = pathname === `/s/${club.lastSettlementId}/club/_all`;
                        const hasSubclubes = club.subclubes.length > 0;

                        return (
                          <div key={club.id} className="mb-1">
                            {/* Club row */}
                            <Link
                              href={clubHref}
                              className={`flex items-center gap-2.5 px-3 py-[6px] ml-1 rounded-lg transition-all duration-150 text-[12px] ${
                                (hasSubclubes ? isAllActive : clubActive)
                                  ? 'bg-white/[0.08] text-white font-semibold'
                                  : clubActive && hasSubclubes
                                    ? 'text-dark-200 font-semibold'
                                    : 'text-dark-400 hover:bg-white/[0.04] hover:text-dark-200'
                              }`}
                            >
                              <ClubLogo logoUrl={club.logoUrl} name={club.name} size="xs" />
                              <div className="flex-1 min-w-0">
                                <div className="truncate leading-tight">{club.name}</div>
                                {club.externalId && (
                                  <div className="text-[9px] text-dark-600 leading-tight">ID {club.externalId}</div>
                                )}
                              </div>
                              {hasSubclubes && (
                                <span className="text-[9px] text-dark-500 font-mono tabular-nums">
                                  {club.subclubes.length}
                                </span>
                              )}
                            </Link>

                            {/* Subclubes */}
                            {hasSubclubes && club.lastSettlementId && (
                              <div className="ml-6 mt-0.5 space-y-px pl-3 border-l border-white/[0.06]">
                                {club.subclubes.map((sub) => {
                                  const subActive = pathname === `/s/${club.lastSettlementId}/club/${encodeURIComponent(sub.name)}`;
                                  return (
                                    <Link
                                      key={sub.id}
                                      href={`/s/${club.lastSettlementId}/club/${encodeURIComponent(sub.name)}`}
                                      className={`flex items-center gap-2 px-2 py-[5px] rounded-md transition-all duration-150 text-[11px] ${
                                        subActive
                                          ? 'text-white bg-white/[0.08] font-medium'
                                          : 'text-dark-500 hover:text-dark-300 hover:bg-white/[0.03]'
                                      }`}
                                    >
                                      <ClubLogo logoUrl={sub.logoUrl} name={sub.name} size="xxs" />
                                      <span className="truncate">{sub.name}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Divider ──────────────────────────────────── */}
          {isAdmin && <div className={`border-t border-white/[0.06] my-2 ${collapsed ? 'lg:mx-1' : 'mx-1'}`} />}

          {/* ── ADMIN ─────────────────────────────────────── */}
          {isAdmin && (() => {
            const visible = adminItems.filter((item) => !item.permKey || hasPermission(item.permKey));
            if (visible.length === 0) return null;
            return (
              <div className="space-y-0.5">
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = isRouteActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={navLinkClass(isActive, collapsed)}
                    >
                      <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-dark-500'}`} />
                      <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className={`hidden lg:block border-t border-white/[0.06] ${collapsed ? 'p-2' : 'px-3 py-2'}`}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center text-dark-500 hover:text-dark-300 p-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-150"
            title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* User */}
        <div className={`border-t border-white/[0.06] ${collapsed ? 'lg:p-2 p-3' : 'p-3'}`}>
          <div className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center' : ''}`}>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-dark-800 border border-white/[0.08] flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-dark-400">{userInitials}</span>
            </div>
            {/* Info */}
            <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-[12px] font-medium text-dark-300 truncate">{user.email?.split('@')[0]}</p>
              <p className="text-[10px] text-dark-600 uppercase tracking-wider">{role}</p>
            </div>
            {/* Logout */}
            <button
              onClick={logout}
              className={`text-dark-600 hover:text-red-400 transition-colors p-1 ${collapsed ? 'lg:hidden' : ''}`}
              title="Sair"
              aria-label="Sair da conta"
            >
              <LogOut className="w-3.5 h-3.5" />
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
