'use client';

import { useState } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import ConfigEstrutura from '@/components/config/ConfigEstrutura';
import ConfigPagamentos from '@/components/config/ConfigPagamentos';
import ConfigTaxas from '@/components/config/ConfigTaxas';
import ConfigWhatsApp from '@/components/config/ConfigWhatsApp';
import ConfigCategorias from '@/components/config/ConfigCategorias';
import ConfigMembros from '@/components/config/ConfigMembros';
import ConfigPermissoes from '@/components/config/ConfigPermissoes';

type ConfigTab = 'estrutura' | 'pagamentos' | 'taxas' | 'categorias' | 'whatsapp' | 'equipe' | 'permissoes';

const tabs: { key: ConfigTab; label: string }[] = [
  { key: 'estrutura', label: 'Estrutura' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'taxas', label: 'Taxas' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'permissoes', label: 'Permissoes' },
];

export default function ConfigPage() {
  usePageTitle('Configuracao');
  const [activeTab, setActiveTab] = useState<ConfigTab>('estrutura');

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-white">Configuracao</h2>
        <p className="text-dark-400 text-sm">Estrutura, pagamentos, taxas, equipe e integracoes</p>
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
      {activeTab === 'categorias' && <ConfigCategorias />}
      {activeTab === 'whatsapp' && <ConfigWhatsApp />}
      {activeTab === 'equipe' && <ConfigMembros />}
      {activeTab === 'permissoes' && <ConfigPermissoes />}
    </div>
  );
}
