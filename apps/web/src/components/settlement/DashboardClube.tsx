'use client';

import { useState, useEffect } from 'react';
import KpiCard from '@/components/ui/KpiCard';
import { getDashboardModalities, formatBRL } from '@/lib/api';
import type { ModalityData } from '@/lib/api';
import { SubclubData } from '@/types/settlement';
import ModalitySectionWrapper from '@/components/dashboard/ModalitySectionWrapper';

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

interface Props {
  subclub: SubclubData;
  fees: Record<string, number>;
  settlementId: string;
  subclubName: string;
}

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

export default function DashboardClube({ subclub, settlementId, subclubName }: Props) {
  const { totals, feesComputed, totalLancamentos, acertoLiga, name } = subclub;

  // ── Modality analysis ───────────────────────────────────────────────
  const [modalityData, setModalityData] = useState<ModalityData | null>(null);
  const [modalityLoading, setModalityLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setModalityLoading(true);
    getDashboardModalities(settlementId, subclub.id).then((res) => {
      if (!cancelled && res.success && res.data) setModalityData(res.data);
      if (!cancelled) setModalityLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [settlementId, subclub.id]);

  // ── Derived ──────────────────────────────────────────────────────
  const totalTaxas = Math.abs(feesComputed.totalTaxasSigned || 0);
  const absLancamentos = Math.abs(totalLancamentos || 0);
  const totalDespesas = totalTaxas + absLancamentos;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">Dashboard — {name}</h2>
        <p className="text-xs text-dark-500">Visao consolidada do subclube</p>
      </div>

      {/* ── 6 KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        <KpiCard
          label="Jogadores"
          value={String(totals.players)}
          accentColor="bg-blue-500"
        />
        <KpiCard
          label="Profit / Loss"
          value={formatBRL(totals.ganhos)}
          accentColor={totals.ganhos < 0 ? 'bg-red-500' : 'bg-poker-500'}
          valueColor={totals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}
        />
        <KpiCard
          label="Rake Total"
          value={formatBRL(totals.rake)}
          accentColor="bg-poker-500"
        />
        <KpiCard
          label="Resultado"
          value={formatBRL(totals.resultado)}
          accentColor={totals.resultado < 0 ? 'bg-red-500' : 'bg-poker-500'}
          valueColor={totals.resultado < 0 ? 'text-red-400' : 'text-poker-400'}
        />
        <KpiCard
          label="Despesas"
          value={formatBRL(-totalDespesas)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
        />
        <KpiCard
          label="Fechamento"
          value={formatBRL(acertoLiga)}
          accentColor={acertoLiga < 0 ? 'bg-red-500' : 'bg-amber-500'}
          valueColor={acertoLiga < 0 ? 'text-red-400' : 'text-amber-400'}
        />
      </div>

      {/* ── Analise por Modalidade ───────────────────────────────────── */}
      <ModalitySectionWrapper data={modalityData} loading={modalityLoading} />
    </div>
  );
}

