'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/useAuth';
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
  Settings,
  UserCog,
  Spade,
  Menu,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

// ─── Sidebar structure ──────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  roles?: string[];
}

interface NavSection {
  label: string;
  items: NavItem[];
  roles?: string[];
}

const navSections: NavSection[] = [
  {
    label: 'OPERACAO',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/import', label: 'Importar', icon: Upload, roles: ['OWNER', 'ADMIN'] },
      { href: '/import/history', label: 'Historico', icon: Clock, roles: ['OWNER', 'ADMIN'] },
      { href: '/lancamentos', label: 'Lancamentos', icon: Receipt, roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { href: '/s', label: 'Clubes', icon: Building2 },
      { href: '/overview', label: 'Visao Geral', icon: Eye, roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { href: '/liga-global', label: 'Liga Global', icon: Trophy, roles: ['OWNER', 'ADMIN'] },
      { href: '/caixa-geral', label: 'Caixa Geral', icon: Wallet, roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
    ],
  },
  {
    label: 'CADASTRO',
    items: [
      { href: '/players', label: 'Agentes / Jogadores', icon: Users, roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { href: '/clubs', label: 'Clubes', icon: Building2, roles: ['OWNER', 'ADMIN'] },
      { href: '/links', label: 'Vincular', icon: LinkIcon, roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    label: 'CONFIGURACOES',
    roles: ['OWNER', 'ADMIN'],
    items: [
      { href: '/config', label: 'Configuracao', icon: Settings },
      { href: '/config/users', label: 'Equipe', icon: UserCog },
    ],
  },
];

// ─── Active route check ─────────────────────────────────────────────

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '#') return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/s') return pathname.startsWith('/s');
  if (href === '/import') return pathname === '/import';
  if (href === '/config') return pathname === '/config';
  return pathname === href || pathname.startsWith(href + '/');
}

// ─── Inner Layout (uses useAuth) ────────────────────────────────────

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, role, tenantName, logout, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
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
        fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 border-r border-dark-700 flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-dark-700">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-poker-600 flex items-center justify-center">
              <Spade className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight">Poker Manager</h1>
              <p className="text-xs text-dark-400">{tenantName || 'SaaS'}</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-5 overflow-y-auto" aria-label="Menu principal">
          {navSections
            .filter((section) => !section.roles || section.roles.includes(role))
            .map((section) => {
              const visibleItems = section.items.filter((item) => !item.roles || item.roles.includes(role));
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.label}>
                  <p className="px-3 mb-1.5 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;

                      if (item.disabled) {
                        return (
                          <span
                            key={item.label}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-dark-600 cursor-not-allowed"
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {item.label}
                            <span className="ml-auto text-[9px] text-dark-600 uppercase">Em breve</span>
                          </span>
                        );
                      }

                      const isActive = isRouteActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                            isActive
                              ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30 shadow-glow-green'
                              : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-dark-700">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-dark-200 truncate">{user.email}</p>
              <p className="text-xs text-dark-500">{role}</p>
            </div>
            <button
              onClick={logout}
              className="text-dark-400 hover:text-red-400 transition-colors"
              title="Sair"
              aria-label="Sair da conta"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">{children}</main>
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
