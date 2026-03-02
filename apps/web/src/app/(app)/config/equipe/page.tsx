'use client';

import { useState } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import ConfigMembros from '@/components/config/ConfigMembros';
import ConfigPermissoes from '@/components/config/ConfigPermissoes';

type SubTab = 'membros' | 'permissoes';

export default function EquipePage() {
  usePageTitle('Equipe');
  const [subTab, setSubTab] = useState<SubTab>('membros');

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-white">Equipe</h2>
        <p className="text-dark-400 text-sm">Membros e permissoes por funcao</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-4 sm:gap-6 mb-6 border-b border-dark-700/50">
        {(['membros', 'permissoes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`pb-3 text-sm font-semibold transition-colors relative whitespace-nowrap ${
              subTab === tab ? 'text-white' : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab === 'membros' ? 'Membros' : 'Permissoes'}
            {subTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-poker-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'membros' && <ConfigMembros />}
      {subTab === 'permissoes' && <ConfigPermissoes />}
    </div>
  );
}
