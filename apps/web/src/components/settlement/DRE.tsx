'use client';

import { useMemo, type ReactNode } from 'react';
import { formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { cc } from '@/lib/colorUtils';
import KpiCard from '@/components/ui/KpiCard';
import { SubclubData } from '@/types/settlement';

interface Props {
  subclub: Pick<SubclubData, 'name' | 'totals' | 'feesComputed' | 'adjustments' | 'totalLancamentos' | 'acertoLiga' | 'acertoDirecao'>;
  fees: Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────

function nz(v: number): boolean {
  return Math.abs(v) > 0.01;
}

const clr = cc;

// ─── Component ────────────────────────────────────────────────────

export default function DRE({ subclub, fees }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, acertoDirecao, name } = subclub;

  // ── Computed values ──
  const receita = round2(totals.rake + totals.ggr);
  const custos = round2(totals.rbTotal || 0);
  const resultadoAposTaxas = round2(totals.resultado + feesComputed.totalTaxasSigned);

  // ── Waterfall steps ──
  const waterfallSteps = useMemo(() => {
    const steps: { label: string; value: number; color: string }[] = [];
    steps.push({ label: 'Resultado', value: totals.resultado, color: nz(totals.resultado) ? (totals.resultado > 0 ? '#10b981' : '#ef4444') : '#374151' });
    if (nz(feesComputed.totalTaxasSigned)) {
      steps.push({ label: 'Taxas', value: feesComputed.totalTaxasSigned, color: '#ef4444' });
    }
    if (nz(totalLancamentos)) {
      steps.push({ label: 'Lanc.', value: totalLancamentos, color: totalLancamentos > 0 ? '#10b981' : '#ef4444' });
    }
    steps.push({ label: 'Acerto', value: acertoLiga, color: acertoLiga > 0.01 ? '#a855f7' : acertoLiga < -0.01 ? '#ef4444' : '#374151' });
    return steps;
  }, [totals.resultado, feesComputed.totalTaxasSigned, totalLancamentos, acertoLiga]);

  // Waterfall bar calculations
  const waterfallData = useMemo(() => {
    const allValues = waterfallSteps.map((s) => Math.abs(s.value));
    const maxVal = Math.max(...allValues, 1);
    return waterfallSteps.map((s) => ({
      ...s,
      widthPct: Math.max((Math.abs(s.value) / maxVal) * 100, 2), // min 2% for visibility
      isPositive: s.value > 0.01,
      isZero: !nz(s.value),
    }));
  }, [waterfallSteps]);

  // Filter non-zero taxas
  const taxaRows = useMemo(() => {
    const rows: { label: string; sublabel: string; value: number }[] = [];
    if (nz(feesComputed.taxaApp)) rows.push({ label: 'Taxa Aplicativo', sublabel: `${fees.taxaApp || 0}% do Rake`, value: -feesComputed.taxaApp });
    if (nz(feesComputed.taxaLiga)) rows.push({ label: 'Taxa Liga', sublabel: `${fees.taxaLiga || 0}% do Rake`, value: -feesComputed.taxaLiga });
    if (nz(feesComputed.taxaRodeoGGR)) rows.push({ label: 'Taxa Rodeo GGR', sublabel: `${fees.taxaRodeoGGR || 0}% do GGR`, value: -feesComputed.taxaRodeoGGR });
    if (nz(feesComputed.taxaRodeoApp)) rows.push({ label: 'Taxa Rodeo App', sublabel: `${fees.taxaRodeoApp || 0}% do GGR`, value: -feesComputed.taxaRodeoApp });
    return rows;
  }, [feesComputed, fees]);

  // Filter non-zero lancamentos
  const lancRows = useMemo(() => {
    const rows: { label: string; value: number }[] = [];
    if (nz(adjustments.overlay)) rows.push({ label: 'Overlay', value: adjustments.overlay });
    if (nz(adjustments.compras)) rows.push({ label: 'Compras', value: adjustments.compras });
    if (nz(adjustments.security)) rows.push({ label: 'Security', value: adjustments.security });
    if (nz(adjustments.outros)) rows.push({ label: 'Outros', value: adjustments.outros });
    return rows;
  }, [adjustments]);

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">DRE — {name}</h2>
        <p className="text-dark-400 text-sm">Demonstrativo de Resultado</p>
      </div>

      {/* ── 3 KPIs ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Receita Bruta"
          value={formatBRL(receita)}
          accentColor="bg-blue-500"
          valueColor="text-blue-400"
          subtitle={`Rake ${formatBRL(totals.rake)}`}
          tooltip={`receita = rake + ggr = ${formatBRL(totals.rake)} + ${formatBRL(totals.ggr)}`}
        />
        <KpiCard
          label="Custos (RB)"
          value={nz(custos) ? formatBRL(-custos) : 'R$ 0'}
          accentColor="bg-red-500"
          valueColor={nz(custos) ? 'text-red-400' : 'text-dark-400'}
          subtitle={custos > 0 && receita > 0.01 ? `${((custos / receita) * 100).toFixed(0)}% da receita` : undefined}
          tooltip="Soma do rakeback pago a agentes e jogadores"
        />
        <KpiCard
          label="Res. Liquido"
          value={formatBRL(resultadoAposTaxas + totalLancamentos)}
          accentColor={(resultadoAposTaxas + totalLancamentos) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          valueColor={(resultadoAposTaxas + totalLancamentos) >= 0 ? 'text-emerald-400' : 'text-red-400'}
          tooltip={`resultado apos taxas + lancamentos = ${formatBRL(resultadoAposTaxas)} + ${formatBRL(totalLancamentos)}`}
        />
      </div>

      {/* ── Waterfall Visual ── */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 mb-5">
        <h3 className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-4">Fluxo Financeiro</h3>
        <div className="space-y-3">
          {waterfallData.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-dark-400 w-16 text-right shrink-0 font-medium">{step.label}</span>
              <div className="flex-1 relative h-7 flex items-center">
                <div
                  className="h-full rounded-md transition-all duration-500 ease-out"
                  style={{
                    width: `${step.widthPct}%`,
                    backgroundColor: step.isZero ? '#1f2937' : step.color,
                    opacity: step.isZero ? 0.3 : 0.85,
                  }}
                />
                {/* Connector line to next step */}
                {i < waterfallData.length - 1 && (
                  <div className="absolute -bottom-3 left-0 w-px h-3 bg-dark-700" style={{ left: `${Math.min(step.widthPct, 98)}%` }} />
                )}
              </div>
              <span className={`font-mono text-sm font-bold w-28 text-right shrink-0 ${step.isZero ? 'text-dark-600' : (step.isPositive ? 'text-emerald-400' : 'text-red-400')}`}>
                {step.isZero ? '—' : formatBRL(step.value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section Cards ── */}
      <div className="space-y-4">

        {/* RECEITAS */}
        <SectionCard title="Receitas" accentColor="border-t-blue-500">
          <Row label="Rake Gerado" value={totals.rake} color="text-poker-400" />
          {nz(totals.ggr) && <Row label="GGR Rodeo" value={totals.ggr} color="text-purple-400" />}
          <Row
            label="P/L Jogadores"
            sublabel="Ganhos/Perdas"
            value={totals.ganhos}
            color={totals.ganhos < 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          {nz(custos) && <Row label="Rakeback Total" value={-custos} color="text-amber-400" />}
          <TotalRow label="Resultado Bruto" value={totals.resultado} />
        </SectionCard>

        {/* TAXAS (hide entire section if no taxes) */}
        {taxaRows.length > 0 && (
          <SectionCard title="Taxas" accentColor="border-t-red-500">
            {taxaRows.map((t, i) => (
              <Row key={i} label={t.label} sublabel={t.sublabel} value={t.value} color="text-red-400" />
            ))}
            <TotalRow label="Resultado Apos Taxas" value={resultadoAposTaxas} />
          </SectionCard>
        )}

        {/* LANCAMENTOS (hide if no items) */}
        {lancRows.length > 0 && (
          <SectionCard title="Lancamentos" accentColor="border-t-amber-500">
            {lancRows.map((l, i) => (
              <Row key={i} label={l.label} value={l.value} />
            ))}
            <TotalRow label="Total Lancamentos" value={totalLancamentos} />
          </SectionCard>
        )}
      </div>

      {/* ── ACERTO LIGA (Hero Card) ── */}
      <div
        className={`mt-6 rounded-xl p-6 border-2 ${
          acertoLiga > 0.01
            ? 'bg-emerald-950/20 border-emerald-600/40'
            : acertoLiga < -0.01
              ? 'bg-red-950/20 border-red-600/40'
              : 'bg-dark-800/50 border-dark-600/50'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">Acerto Liga</p>
            <p className={`text-sm font-medium ${
              acertoLiga > 0.01 ? 'text-emerald-400' : acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-400'
            }`}>
              {acertoDirecao}
            </p>
          </div>
          <p
            className={`text-3xl font-extrabold font-mono ${
              acertoLiga > 0.01 ? 'text-emerald-400' : acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-300'
            } explainable inline-block`}
            title={`acertoLiga = resultado + totalTaxasSigned + lancamentos = ${formatBRL(totals.resultado)} + ${formatBRL(feesComputed.totalTaxasSigned)} + ${formatBRL(totalLancamentos)}`}
          >
            {formatBRL(acertoLiga)}
          </p>
        </div>

        {/* Mini formula breakdown */}
        <div className="mt-4 pt-3 border-t border-dark-700/30 flex items-center gap-2 text-[11px] text-dark-500 font-mono flex-wrap">
          <span className={clr(totals.resultado)}>{formatBRL(totals.resultado)}</span>
          <span>resultado</span>
          {nz(feesComputed.totalTaxasSigned) && (
            <>
              <span className="text-dark-600">+</span>
              <span className="text-red-400">{formatBRL(feesComputed.totalTaxasSigned)}</span>
              <span>taxas</span>
            </>
          )}
          {nz(totalLancamentos) && (
            <>
              <span className="text-dark-600">+</span>
              <span className={clr(totalLancamentos)}>{formatBRL(totalLancamentos)}</span>
              <span>lanc.</span>
            </>
          )}
          <span className="text-dark-600">=</span>
          <span className={`font-bold ${clr(acertoLiga)}`}>{formatBRL(acertoLiga)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function SectionCard({
  title,
  accentColor,
  children,
}: {
  title: string;
  accentColor: string;
  children: ReactNode;
}) {
  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden border-t-2 ${accentColor}`}>
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">{title}</h3>
      </div>
      <div className="px-5 pb-4">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  sublabel,
  value,
  color,
}: {
  label: string;
  sublabel?: string;
  value: number;
  color?: string;
}) {
  const textColor = color || (value > 0.01 ? 'text-emerald-400' : value < -0.01 ? 'text-red-400' : 'text-dark-500');
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-800/40 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-dark-300">{label}</span>
        {sublabel && <span className="text-[10px] text-dark-600">{sublabel}</span>}
      </div>
      <span className={`font-mono text-sm font-semibold ${textColor}`}>{formatBRL(value)}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  const color = value > 0.01 ? 'text-emerald-400' : value < -0.01 ? 'text-red-400' : 'text-dark-300';
  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-dark-600/60">
      <span className="text-sm font-bold text-dark-200 uppercase tracking-wide">{label}</span>
      <span className={`font-mono text-base font-extrabold ${color}`}>{formatBRL(value)}</span>
    </div>
  );
}
