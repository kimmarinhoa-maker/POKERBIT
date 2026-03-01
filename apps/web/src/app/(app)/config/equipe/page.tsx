'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import { useAuth } from '@/lib/useAuth';
import ConfigMembros from '@/components/config/ConfigMembros';
import ConfigPermissoes from '@/components/config/ConfigPermissoes';

type EquipeTab = 'membros' | 'permissoes';

const tabs: { key: EquipeTab; label: string }[] = [
  { key: 'membros', label: 'Membros' },
  { key: 'permissoes', label: 'Permissoes' },
];

export default function EquipePage() {
  usePageTitle('Equipe');
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EquipeTab>('membros');

  if (!loading && !isAdmin) {
    router.replace('/dashboard');
    return null;
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-white">Equipe</h2>
        <p className="text-dark-400 text-sm">Membros e permissoes por funcao</p>
      </div>

      {/* Sub-tabs — underline style (same pattern as /config) */}
      <div className="flex gap-4 sm:gap-6 mb-6 border-b border-dark-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-semibold transition-colors relative ${
              activeTab === tab.key ? 'text-white' : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-poker-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'membros' && <ConfigMembros />}
      {activeTab === 'permissoes' && <ConfigPermissoes />}
    </div>
  );
}
