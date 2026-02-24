'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/lib/useAuth';

// ─── Sidebar structure ──────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
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
      { href: '/dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
      { href: '/import',    label: 'Importar',  icon: '\u{1F4E4}', roles: ['OWNER', 'ADMIN'] },
      { href: '/import/history', label: 'Historico', icon: '\u{1F4CB}', roles: ['OWNER', 'ADMIN'] },
      { href: '/lancamentos', label: 'Lancamentos', icon: '\u{1F4CB}', roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    label: 'FECHAMENTOS',
    items: [
      { href: '/s', label: 'Clubes', icon: '\u{1F3E2}' },
      { href: '/overview', label: 'Visao Geral', icon: '\u{1F465}' },
      { href: '/liga-global', label: 'Liga Global', icon: '\u{1F3C6}' },
      { href: '/caixa-geral', label: 'Caixa Geral', icon: '\u{1F4B0}' },
    ],
  },
  {
    label: 'CADASTRO',
    items: [
      { href: '/players', label: 'Jogadores', icon: '\u{1F465}', roles: ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR'] },
      { href: '/clubs',   label: 'Clubes',    icon: '\u{1F3E2}', roles: ['OWNER', 'ADMIN'] },
      { href: '/links',   label: 'Vincular',  icon: '\u{1F517}', roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    label: 'CONFIGURACOES',
    roles: ['OWNER', 'ADMIN'],
    items: [
      { href: '/config/estrutura', label: 'Estrutura', icon: '\u{1F3D7}\uFE0F' },
      { href: '/config/pagamentos', label: 'Pagamentos', icon: '\u{1F4B3}' },
      { href: '/config/taxas', label: 'Taxas', icon: '\u{1F4B2}' },
      { href: '/config/users', label: 'Equipe', icon: '\u{1F464}' },
    ],
  },
];

// ─── Active route check ─────────────────────────────────────────────

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '#') return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/s') return pathname.startsWith('/s');
  if (href === '/import') return pathname === '/import';
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

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-dark-900 border-b border-dark-700 flex items-center px-4 h-14 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-dark-300 hover:text-white p-1.5 -ml-1 transition-colors"
          aria-label="Abrir menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 rounded-lg bg-poker-600 flex items-center justify-center">
            <span className="text-sm">{'\u{1F0CF}'}</span>
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
      <aside role="navigation" className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 border-r border-dark-700 flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-dark-700">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-poker-600 flex items-center justify-center">
              <span className="text-xl">{'\u{1F0CF}'}</span>
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
            .filter(section => !section.roles || section.roles.includes(role))
            .map((section) => {
              const visibleItems = section.items.filter(
                item => !item.roles || item.roles.includes(role)
              );
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.label}>
                  <p className="px-3 mb-1.5 text-[10px] text-dark-500 uppercase tracking-wider font-semibold">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      if (item.disabled) {
                        return (
                          <span
                            key={item.label}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-dark-600 cursor-not-allowed"
                          >
                            <span className="text-lg w-5 text-center">{item.icon}</span>
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
                              ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
                              : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100'
                          }`}
                        >
                          <span className="text-lg w-5 text-center">{item.icon}</span>
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
              <p className="text-sm font-medium text-dark-200 truncate">
                {user.email}
              </p>
              <p className="text-xs text-dark-500">{role}</p>
            </div>
            <button
              onClick={logout}
              className="text-dark-400 hover:text-red-400 transition-colors text-sm"
              title="Sair"
              aria-label="Sair da conta"
            >
              {'\u23FB'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">
        {children}
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
