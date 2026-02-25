'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import RoleGuard from '@/components/RoleGuard';

const TABS = [
  { href: '/import', label: 'Nova Importacao', icon: '\u{1F4E4}' },
  { href: '/import/history', label: 'Historico', icon: '\u{1F4CB}' },
];

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <RoleGuard allowed={['OWNER', 'ADMIN']}>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            {'\u{1F4E4}'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Importar Planilha</h1>
            <p className="text-dark-400 text-sm">Upload XLSX, pre-analise e confirmacao</p>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="flex gap-1 mb-6 border-b border-dark-700">
          {TABS.map((tab) => {
            const isActive = tab.href === '/import' ? pathname === '/import' : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  isActive ? 'border-poker-500 text-poker-400' : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </RoleGuard>
  );
}
