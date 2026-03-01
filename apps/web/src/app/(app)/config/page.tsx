'use client';

import { useState } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import ConfigEstrutura from '@/components/config/ConfigEstrutura';
import ConfigPagamentos from '@/components/config/ConfigPagamentos';
import ConfigTaxas from '@/components/config/ConfigTaxas';
import ConfigWhatsApp from '@/components/config/ConfigWhatsApp';
import ConfigMembros from '@/components/config/ConfigMembros';
import ConfigPermissoes from '@/components/config/ConfigPermissoes';

type ConfigTab = 'estrutura' | 'pagamentos' | 'taxas' | 'whatsapp' | 'equipe';

const tabs: { key: ConfigTab; label: string }[] = [
  { key: 'estrutura', label: 'Estrutura' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'taxas', label: 'Taxas' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'equipe', label: 'Equipe' },
];

type EquipeSubTab = 'membros' | 'permissoes';

export default function ConfigPage() {
  usePageTitle('Configuracao');
  const [activeTab, setActiveTab] = useState<ConfigTab>('estrutura');
  const [equipeSubTab, setEquipeSubTab] = useState<EquipeSubTab>('membros');

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-white">Configuracao</h2>
        <p className="text-dark-400 text-sm">Estrutura, pagamentos, taxas, integracoes e equipe</p>
      </div>

      {/* Main tabs — underline style */}
      <div className="flex gap-4 sm:gap-6 mb-6 border-b border-dark-700/50 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-semibold transition-colors relative whitespace-nowrap ${
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
      {activeTab === 'estrutura' && <ConfigEstrutura />}
      {activeTab === 'pagamentos' && <ConfigPagamentos />}
      {activeTab === 'taxas' && <ConfigTaxas />}
      {activeTab === 'whatsapp' && <ConfigWhatsApp />}
      {activeTab === 'equipe' && (
        <div>
          {/* Equipe sub-tabs */}
          <div className="flex gap-3 mb-5">
            {(['membros', 'permissoes'] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => setEquipeSubTab(sub)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  equipeSubTab === sub
                    ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                }`}
              >
                {sub === 'membros' ? 'Membros' : 'Permissoes'}
              </button>
            ))}
          </div>
          {equipeSubTab === 'membros' && <ConfigMembros />}
          {equipeSubTab === 'permissoes' && <ConfigPermissoes />}
        </div>
      )}
    </div>
  );
}
