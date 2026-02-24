'use client';

import { useState } from 'react';
import ConfigEstrutura from '@/components/config/ConfigEstrutura';
import ConfigPagamentos from '@/components/config/ConfigPagamentos';
import ConfigTaxas from '@/components/config/ConfigTaxas';

type ConfigTab = 'estrutura' | 'pagamentos' | 'taxas';

const tabs: { key: ConfigTab; label: string }[] = [
  { key: 'estrutura', label: 'Estrutura' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'taxas', label: 'Taxas' },
];

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('estrutura');

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Configuracao</h2>
        <p className="text-dark-400 text-sm">
          Estrutura, pagamentos e taxas da operacao
        </p>
      </div>

      {/* Main tabs — underline style */}
      <div className="flex gap-6 mb-6 border-b border-dark-700/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-semibold transition-colors relative ${
              activeTab === tab.key
                ? 'text-white'
                : 'text-dark-400 hover:text-dark-200'
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
    </div>
  );
}
