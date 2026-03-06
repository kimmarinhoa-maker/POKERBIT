'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/lib/usePageTitle';
import { useAuth } from '@/lib/useAuth';
import { ArrowLeft } from 'lucide-react';
import ClubDadosClube from '@/components/club/ClubDadosClube';
import ClubSubclubes from '@/components/club/ClubSubclubes';
import ClubTaxas from '@/components/club/ClubTaxas';

export default function ClubConfigPage() {
  const params = useParams();
  const clubId = params.clubId as string;
  usePageTitle('Configurar Clube');
  useAuth();

  return (
    <div className="p-4 lg:p-8 max-w-2xl animate-tab-fade">
      {/* Back link */}
      <Link href="/clubs" className="text-dark-400 hover:text-white text-sm flex items-center gap-1.5 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Voltar para Meus Clubes
      </Link>

      <h2 className="text-xl font-bold text-white mb-1">Configurar Clube</h2>
      <p className="text-dark-400 text-sm mb-8">Dados, subclubes e taxas</p>

      {/* Section: Dados do Clube */}
      <div className="card mb-6 p-0 overflow-hidden">
        <ClubDadosClube clubId={clubId} />
      </div>

      {/* Section: Subclubes */}
      <div className="card mb-6 p-0 overflow-hidden">
        <ClubSubclubes clubId={clubId} />
      </div>

      {/* Section: Taxas */}
      <div className="card mb-6 p-0 overflow-hidden">
        <ClubTaxas clubId={clubId} />
      </div>
    </div>
  );
}
