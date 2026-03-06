'use client';

import ClubDadosClube from '@/components/club/ClubDadosClube';
import ClubSubclubes from '@/components/club/ClubSubclubes';
import ClubTaxas from '@/components/club/ClubTaxas';

interface Props {
  clubId: string;
}

export default function ConfigTab({ clubId }: Props) {
  return (
    <div className="p-4 lg:p-6 animate-tab-fade max-w-2xl space-y-6">
      <div>
        <h3 className="text-base font-bold text-white mb-1">Configuracoes do Clube</h3>
        <p className="text-dark-500 text-xs">Dados, taxas e subclubes</p>
      </div>

      {/* Dados do Clube */}
      <div className="card p-0 overflow-hidden">
        <ClubDadosClube clubId={clubId} />
      </div>

      {/* Taxas */}
      <div className="card p-0 overflow-hidden">
        <ClubTaxas clubId={clubId} />
      </div>

      {/* Subclubes */}
      <div className="card p-0 overflow-hidden">
        <ClubSubclubes clubId={clubId} />
      </div>
    </div>
  );
}
