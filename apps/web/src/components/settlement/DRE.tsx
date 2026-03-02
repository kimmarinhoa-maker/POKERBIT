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

// ─── DRE Calculation ─────────────────────────────────────────────

export interface DREData {
  // Receitas
  rakeTotal: number;
  ggrRodeio: number;
  receitaBruta: number;

  // Taxas
  taxaApp: number;
  taxaLiga: number;
  taxaRodeoGGR: number;
  taxaRodeoApp: number;
  totalTaxas: number;

  // Custos operacionais
  overlay: number;
  compras: number;
  security: number;
  outros: number;
  totalCustos: number;

  // Rakeback
  totalRakeback: number;

  // Resultado
  lucroLiquido: number;
  margem: number;

  // Fluxo de caixa (informativo)
  profitLoss: number;
  acertoLiga: number;
}

export function calcDRE(subclub: Pick<SubclubData, 'totals' | 'feesComputed' | 'adjustments' | 'totalLancamentos' | 'acertoLiga'>): DREData {
  const rakeTotal = subclub.totals.rake;
  const ggrRodeio = subclub.totals.ggr;
  const receitaBruta = round2(rakeTotal + ggrRodeio);

  const taxaApp = subclub.feesComputed.taxaApp;
  const taxaLiga = subclub.feesComputed.taxaLiga;
  const taxaRodeoGGR = subclub.feesComputed.taxaRodeoGGR;
  const taxaRodeoApp = subclub.feesComputed.taxaRodeoApp;
  const totalTaxas = round2(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp);

  const overlay = Math.abs(subclub.adjustments.overlay || 0);
  const compras = Math.abs(subclub.adjustments.compras || 0);
  const security = Math.abs(subclub.adjustments.security || 0);
  const outros = Math.abs(subclub.adjustments.outros || 0);
  const totalCustos = round2(overlay + compras + security + outros);

  const totalRakeback = subclub.totals.rbTotal || 0;

  const lucroLiquido = round2(receitaBruta - totalTaxas - totalCustos - totalRakeback);
  const margem = receitaBruta > 0.01 ? round2((lucroLiquido / receitaBruta) * 100) : 0;

  return {
    rakeTotal, ggrRodeio, receitaBruta,
    taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas,
    overlay, compras, security, outros, totalCustos,
    totalRakeback,
    lucroLiquido, margem,
    profitLoss: subclub.totals.ganhos,
    acertoLiga: subclub.acertoLiga,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function nz(v: number): boolean {
  return Math.abs(v) > 0.01;
}

const clr = cc;

// ─── Component ────────────────────────────────────────────────────

export default function DRE({ subclub, fees }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, acertoDirecao, name } = subclub;

  const dre = useMemo(() => calcDRE(subclub), [subclub]);

  // ── Waterfall steps (revenue → lucro) ──
  const waterfallSteps = useMemo(() => {
    const steps: { label: string; value: number; color: string }[] = [];
    steps.push({ label: 'Receita', value: dre.receitaBruta, color: dre.receitaBruta > 0.01 ? '#3b82f6' : '#374151' });
    if (nz(dre.totalTaxas)) {
      steps.push({ label: 'Taxas', value: -dre.totalTaxas, color: '#ef4444' });
    }
    if (nz(dre.totalCustos)) {
      steps.push({ label: 'Custos', value: -dre.totalCustos, color: '#f97316' });
    }
    if (nz(dre.totalRakeback)) {
      steps.push({ label: 'Rakeback', value: -dre.totalRakeback, color: '#f59e0b' });
    }
    steps.push({ label: 'Lucro', value: dre.lucroLiquido, color: dre.lucroLiquido > 0.01 ? '#10b981' : dre.lucroLiquido < -0.01 ? '#ef4444' : '#374151' });
    return steps;
  }, [dre]);

  const waterfallData = useMemo(() => {
    const allValues = waterfallSteps.map((s) => Math.abs(s.value));
    const maxVal = Math.max(...allValues, 1);
    return waterfallSteps.map((s) => ({
      ...s,
      widthPct: Math.max((Math.abs(s.value) / maxVal) * 100, 2),
      isPositive: s.value > 0.01,
      isZero: !nz(s.value),
    }));
  }, [waterfallSteps]);

  // Filter non-zero taxas
  const taxaRows = useMemo(() => {
    const rows: { label: string; sublabel: string; value: number }[] = [];
    if (nz(feesComputed.taxaApp)) rows.push({ label: 'Taxa Aplicativo', sublabel: `${fees.taxaApp || 0}% do Rake`, value: feesComputed.taxaApp });
    if (nz(feesComputed.taxaLiga)) rows.push({ label: 'Taxa Liga', sublabel: `${fees.taxaLiga || 0}% do Rake`, value: feesComputed.taxaLiga });
    if (nz(feesComputed.taxaRodeoGGR)) rows.push({ label: 'Taxa Rodeo GGR', sublabel: `${fees.taxaRodeoGGR || 0}% do GGR`, value: feesComputed.taxaRodeoGGR });
    if (nz(feesComputed.taxaRodeoApp)) rows.push({ label: 'Taxa Rodeo App', sublabel: `${fees.taxaRodeoApp || 0}% do GGR`, value: feesComputed.taxaRodeoApp });
    return rows;
  }, [feesComputed, fees]);

  // Filter non-zero custos
  const custoRows = useMemo(() => {
    const rows: { label: string; value: number }[] = [];
    if (nz(dre.overlay)) rows.push({ label: 'Overlay', value: dre.overlay });
    if (nz(dre.compras)) rows.push({ label: 'Compras', value: dre.compras });
    if (nz(dre.security)) rows.push({ label: 'Security', value: dre.security });
    if (nz(dre.outros)) rows.push({ label: 'Outros', value: dre.outros });
    return rows;
  }, [dre]);

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">DRE — {name}</h2>
        <p className="text-dark-400 text-sm">Demonstrativo de Resultado do Exercício</p>
      </div>

      {/* ── HERO: Lucro Líquido ── */}
      <div
        className={`p-6 rounded-xl border-2 mb-6 ${
          dre.lucroLiquido >= 0
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-red-500/50 bg-red-500/5'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">LUCRO LÍQUIDO DA SEMANA</div>
            <div
              className={`text-3xl font-extrabold font-mono ${
                dre.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'
              } explainable inline-block`}
              title={`Lucro = Receita Bruta - Taxas - Custos - Rakeback = ${formatBRL(dre.receitaBruta)} - ${formatBRL(dre.totalTaxas)} - ${formatBRL(dre.totalCustos)} - ${formatBRL(dre.totalRakeback)}`}
            >
              {formatBRL(dre.lucroLiquido)}
            </div>
            <div className="text-sm text-dark-500 mt-1">
              Margem: <span className={dre.margem >= 0 ? 'text-green-400' : 'text-red-400'}>{dre.margem.toFixed(1)}%</span>
              <span className="text-dark-600 mx-2">·</span>
              Receita: {formatBRL(dre.receitaBruta)}
            </div>
          </div>
          <div className={`text-5xl ${dre.lucroLiquido >= 0 ? 'text-green-500/20' : 'text-red-500/20'}`}>
            {dre.lucroLiquido >= 0 ? '↑' : '↓'}
          </div>
        </div>
      </div>

      {/* ── 3 KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Receita Bruta"
          value={formatBRL(dre.receitaBruta)}
          accentColor="bg-blue-500"
          valueColor="text-blue-400"
          tooltip={`receita = rake + ggr = ${formatBRL(dre.rakeTotal)} + ${formatBRL(dre.ggrRodeio)}`}
        />
        <KpiCard
          label="Total Deduções"
          value={formatBRL(-(dre.totalTaxas + dre.totalCustos + dre.totalRakeback))}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          tooltip={`taxas (${formatBRL(dre.totalTaxas)}) + custos (${formatBRL(dre.totalCustos)}) + rakeback (${formatBRL(dre.totalRakeback)})`}
        />
        <KpiCard
          label="Lucro Líquido"
          value={formatBRL(dre.lucroLiquido)}
          accentColor={dre.lucroLiquido >= 0 ? 'bg-green-500' : 'bg-red-500'}
          valueColor={dre.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'}
          ring="ring-1 ring-green-700/30"
          tooltip={`lucro = receita - taxas - custos - rakeback = ${formatBRL(dre.lucroLiquido)}`}
        />
      </div>

      {/* ── Waterfall Visual ── */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 mb-5">
        <h3 className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-4">Fluxo de Resultado</h3>
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

      {/* ── DRE Detalhado (Section Cards) ── */}
      <div className="space-y-4">

        {/* RECEITA BRUTA */}
        <SectionCard title="Receita Bruta" accentColor="border-t-blue-500">
          <Row label="Rake Gerado" value={dre.rakeTotal} color="text-poker-400" />
          {nz(dre.ggrRodeio) && <Row label="GGR Rodeio" value={dre.ggrRodeio} color="text-purple-400" />}
          <TotalRow label="Total Receita" value={dre.receitaBruta} />
        </SectionCard>

        {/* TAXAS PLATAFORMA */}
        {taxaRows.length > 0 && (
          <SectionCard title="(-) Taxas Plataforma" accentColor="border-t-red-500">
            {taxaRows.map((t, i) => (
              <Row key={i} label={t.label} sublabel={t.sublabel} value={-t.value} color="text-red-400" />
            ))}
            <TotalRow label="Total Taxas" value={-dre.totalTaxas} />
          </SectionCard>
        )}

        {/* CUSTOS OPERACIONAIS */}
        {custoRows.length > 0 && (
          <SectionCard title="(-) Custos Operacionais" accentColor="border-t-orange-500">
            {custoRows.map((l, i) => (
              <Row key={i} label={l.label} value={-l.value} color="text-orange-400" />
            ))}
            <TotalRow label="Total Custos" value={-dre.totalCustos} />
          </SectionCard>
        )}

        {/* RAKEBACK */}
        {nz(dre.totalRakeback) && (
          <SectionCard title="(-) Rakeback" accentColor="border-t-amber-500">
            <Row label="Rakeback Agentes" value={-dre.totalRakeback} color="text-amber-400" />
            <TotalRow label="Total Rakeback" value={-dre.totalRakeback} />
          </SectionCard>
        )}
      </div>

      {/* ── LUCRO LÍQUIDO (Bottom Hero) ── */}
      <div
        className={`mt-6 rounded-xl p-6 border-2 ${
          dre.lucroLiquido >= 0
            ? 'bg-green-950/20 border-green-600/40'
            : 'bg-red-950/20 border-red-600/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">Lucro Líquido</p>
            <p className="text-sm text-dark-500">
              Margem: <span className={`font-semibold ${dre.margem >= 0 ? 'text-green-400' : 'text-red-400'}`}>{dre.margem.toFixed(1)}%</span>
            </p>
          </div>
          <p
            className={`text-3xl font-extrabold font-mono ${
              dre.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'
            } explainable inline-block`}
            title={`Lucro = ${formatBRL(dre.receitaBruta)} - ${formatBRL(dre.totalTaxas)} - ${formatBRL(dre.totalCustos)} - ${formatBRL(dre.totalRakeback)} = ${formatBRL(dre.lucroLiquido)}`}
          >
            {formatBRL(dre.lucroLiquido)}
          </p>
        </div>

        {/* Mini formula breakdown */}
        <div className="mt-4 pt-3 border-t border-dark-700/30 flex items-center gap-2 text-[11px] text-dark-500 font-mono flex-wrap">
          <span className="text-blue-400">{formatBRL(dre.receitaBruta)}</span>
          <span>receita</span>
          {nz(dre.totalTaxas) && (
            <>
              <span className="text-dark-600">−</span>
              <span className="text-red-400">{formatBRL(dre.totalTaxas)}</span>
              <span>taxas</span>
            </>
          )}
          {nz(dre.totalCustos) && (
            <>
              <span className="text-dark-600">−</span>
              <span className="text-orange-400">{formatBRL(dre.totalCustos)}</span>
              <span>custos</span>
            </>
          )}
          {nz(dre.totalRakeback) && (
            <>
              <span className="text-dark-600">−</span>
              <span className="text-amber-400">{formatBRL(dre.totalRakeback)}</span>
              <span>rb</span>
            </>
          )}
          <span className="text-dark-600">=</span>
          <span className={`font-bold ${clr(dre.lucroLiquido)}`}>{formatBRL(dre.lucroLiquido)}</span>
        </div>
      </div>

      {/* ── FLUXO DE CAIXA (Informativo) ── */}
      <div className="mt-4 bg-dark-900/50 border border-dark-800 rounded-xl p-5">
        <h3 className="text-[10px] text-dark-600 uppercase tracking-wider font-bold mb-3">Fluxo de Caixa (informativo)</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-dark-400">P/L Jogadores (movimentação)</span>
            <span className={`font-mono text-sm ${clr(dre.profitLoss)}`}>{formatBRL(dre.profitLoss)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-dark-400">Acerto Liga</span>
            <span className={`font-mono text-sm font-semibold ${clr(dre.acertoLiga)}`}>{formatBRL(dre.acertoLiga)}</span>
          </div>
          <div className="pt-2 border-t border-dark-800/60">
            <p className={`text-xs ${acertoLiga > 0.01 ? 'text-emerald-400' : acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-500'}`}>
              {acertoDirecao}
            </p>
          </div>
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
