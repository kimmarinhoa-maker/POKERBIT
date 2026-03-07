'use client';

import { useState } from 'react';
import ClubDadosClube from '@/components/club/ClubDadosClube';
import ClubSubclubes from '@/components/club/ClubSubclubes';
import ClubTaxas from '@/components/club/ClubTaxas';
import ConfigAgentes from '@/components/club/ConfigAgentes';

interface Props {
  clubId: string;
  subclubOrgId?: string;
  isSubclub?: boolean;
}

type ConfigSection = 'geral' | 'taxas' | 'subclubes' | 'agentes';

const mainTabs: { key: ConfigSection; label: string }[] = [
  { key: 'geral', label: 'Geral' },
  { key: 'taxas', label: 'Taxas' },
  { key: 'subclubes', label: 'Subclubes' },
];

const subclubTabs: { key: ConfigSection; label: string }[] = [
  { key: 'geral', label: 'Configuracoes Subclube' },
  { key: 'agentes', label: 'Agentes' },
];

export default function ConfigTab({ clubId, subclubOrgId, isSubclub }: Props) {
  const [activeSection, setActiveSection] = useState<ConfigSection>('geral');
  const orgIdForDados = isSubclub && subclubOrgId ? subclubOrgId : clubId;
  const tabs = isSubclub ? subclubTabs : mainTabs;

  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-3xl">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-white">
          {isSubclub ? 'Configuracoes do Subclube' : 'Configuracoes do Clube'}
        </h3>
        <p className="text-dark-500 text-xs mt-0.5">
          {isSubclub ? 'Dados e agentes do subclube' : 'Dados, taxas e subclubes'}
        </p>
      </div>

      {/* Tabs — underline style */}
      {tabs.length > 1 && (
        <div className="flex gap-6 mb-6 border-b border-dark-700/50">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`pb-2.5 text-sm font-semibold transition-colors relative whitespace-nowrap ${
                activeSection === tab.key
                  ? 'text-white'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              {tab.label}
              {activeSection === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-poker-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeSection === 'geral' && <ClubDadosClube orgId={orgIdForDados} />}
      {activeSection === 'taxas' && !isSubclub && <ClubTaxas clubId={clubId} />}
      {activeSection === 'subclubes' && !isSubclub && <ClubSubclubes clubId={clubId} />}
      {activeSection === 'agentes' && isSubclub && subclubOrgId && (
        <ConfigAgentes subclubOrgId={subclubOrgId} />
      )}
    </div>
  );
}
