'use client';

import { useState, useCallback } from 'react';
import { formatBRL } from '@/lib/api';
import { round2 } from '@/lib/formatters';
import KpiCard from '@/components/ui/KpiCard';

interface Props {
  subclub: {
    name: string;
    totals: { ganhos: number; rake: number; ggr: number; resultado: number; rbTotal?: number };
    feesComputed: {
      taxaApp: number;
      taxaLiga: number;
      taxaRodeoGGR: number;
      taxaRodeoApp: number;
      totalTaxas: number;
      totalTaxasSigned: number;
    };
    adjustments: { overlay: number; compras: number; security: number; outros: number };
    totalLancamentos: number;
    acertoLiga: number;
    acertoDirecao: string;
  };
  fees: Record<string, number>;
}

const ALL_SECTIONS = ['receitas', 'taxas', 'lancamentos', 'acerto'] as const;
type SectionId = (typeof ALL_SECTIONS)[number];

export default function DRE({ subclub, fees }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, acertoDirecao, name } = subclub;
  const resultadoAposTaxas = round2(totals.resultado + feesComputed.totalTaxasSigned);

  // ── KPI values ────────────────────────────────────────────────
  const receita = round2(totals.rake + totals.ggr);
  const custos = round2(totals.rbTotal || 0);
  const resOperacional = round2(receita - custos);
  const resLiquido = round2(resultadoAposTaxas + totalLancamentos);
  // acertoLiga already available from subclub

  // All sections expanded by default
  const [openSections, setOpenSections] = useState<Set<SectionId>>(() => new Set(ALL_SECTIONS));

  const allExpanded = openSections.size === ALL_SECTIONS.length;

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setOpenSections(new Set());
    } else {
      setOpenSections(new Set(ALL_SECTIONS));
    }
  }, [allExpanded]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">DRE — {name}</h2>
          <p className="text-dark-400 text-sm">Demonstracao de Resultado do Exercicio</p>
        </div>

        {/* Expandir / Colapsar Todos */}
        <button
          onClick={toggleAll}
          className="text-xs font-medium text-dark-400 hover:text-white border border-dark-600 hover:border-dark-400 rounded-lg px-3 py-1.5 transition-colors"
        >
          {allExpanded ? 'Colapsar Todos' : 'Expandir Todos'}
        </button>
      </div>

      {/* ── KPI Strip ── 5 cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard
          label="Receita Bruta"
          value={formatBRL(receita)}
          accentColor="bg-blue-500"
          valueColor="text-blue-400"
          subtitle={totals.rake > 0 ? `Rake ${formatBRL(totals.rake)}` : undefined}
        />
        <KpiCard
          label="Custos (RB)"
          value={formatBRL(-custos)}
          accentColor="bg-red-500"
          valueColor="text-red-400"
          subtitle={custos > 0 && receita > 0.01 ? `${((custos / receita) * 100).toFixed(1)}% da receita` : undefined}
        />
        <KpiCard
          label="Res. Operacional"
          value={formatBRL(resOperacional)}
          accentColor={resOperacional >= 0 ? 'bg-poker-500' : 'bg-red-500'}
          valueColor={resOperacional >= 0 ? 'text-poker-400' : 'text-red-400'}
        />
        <KpiCard
          label="Res. Liquido"
          value={formatBRL(resLiquido)}
          accentColor={resLiquido >= 0 ? 'bg-poker-500' : 'bg-red-500'}
          valueColor={resLiquido >= 0 ? 'text-poker-400' : 'text-red-400'}
        />
        <KpiCard
          label="Acerto Liga"
          value={formatBRL(acertoLiga)}
          accentColor={acertoLiga > 0 ? 'bg-poker-500' : acertoLiga < 0 ? 'bg-red-500' : 'bg-dark-600'}
          valueColor={acertoLiga > 0 ? 'text-poker-400' : acertoLiga < 0 ? 'text-red-400' : 'text-dark-300'}
          subtitle={acertoDirecao || undefined}
        />
      </div>

      <div className="card max-w-2xl">
        {/* ── RECEITAS ──────────────────────────────────────────── */}
        <AccordionSection
          id="receitas"
          label="Receitas"
          isOpen={openSections.has('receitas')}
          onToggle={() => toggleSection('receitas')}
        >
          <DRERow label="Rake Gerado" value={totals.rake} color="text-poker-400" />
          <DRERow label="GGR Rodeo" value={totals.ggr} color="text-purple-400" />

          <Separator />

          <DRERow
            label="Ganhos/Perdas Jogadores"
            sublabel="P/L dos jogadores"
            value={totals.ganhos}
            color={totals.ganhos < 0 ? 'text-poker-400' : 'text-red-400'}
          />

          <SectionTotal label="Resultado Bruto" value={totals.resultado} />
        </AccordionSection>

        {/* ── TAXAS ──────────────────────────────────────────── */}
        <AccordionSection
          id="taxas"
          label="Taxas Automaticas"
          isOpen={openSections.has('taxas')}
          onToggle={() => toggleSection('taxas')}
          className="mt-6"
        >
          <DRERow
            label="Taxa Aplicativo"
            sublabel={`${fees.taxaApp || 0}% do Rake`}
            value={-feesComputed.taxaApp}
            color="text-red-400"
          />
          <DRERow
            label="Taxa Liga"
            sublabel={`${fees.taxaLiga || 0}% do Rake`}
            value={-feesComputed.taxaLiga}
            color="text-red-400"
          />
          <DRERow
            label="Taxa Rodeo GGR"
            sublabel={`${fees.taxaRodeoGGR || 0}% do GGR`}
            value={-feesComputed.taxaRodeoGGR}
            color="text-red-400"
          />
          <DRERow
            label="Taxa Rodeo App"
            sublabel={`${fees.taxaRodeoApp || 0}% do GGR`}
            value={-feesComputed.taxaRodeoApp}
            color="text-red-400"
          />

          <Separator />
          <DRERow label="Total Taxas" value={feesComputed.totalTaxasSigned} color="text-red-400" bold />

          <SectionTotal label="Resultado Apos Taxas" value={resultadoAposTaxas} />
        </AccordionSection>

        {/* ── LANCAMENTOS ────────────────────────────────────── */}
        <AccordionSection
          id="lancamentos"
          label="Lancamentos"
          isOpen={openSections.has('lancamentos')}
          onToggle={() => toggleSection('lancamentos')}
          className="mt-6"
        >
          <DRERow label="Overlay" value={adjustments.overlay} />
          <DRERow label="Compras" value={adjustments.compras} />
          <DRERow label="Security" value={adjustments.security} />
          <DRERow label="Outros" value={adjustments.outros} />

          <Separator />
          <DRERow label="Total Lancamentos" value={totalLancamentos} bold />
        </AccordionSection>

        {/* ── ACERTO LIGA ────────────────────────────────────── */}
        <AccordionSection
          id="acerto"
          label="Acerto Liga"
          isOpen={openSections.has('acerto')}
          onToggle={() => toggleSection('acerto')}
          className="mt-6"
        >
          <div
            className={`rounded-lg p-5 border-2 ${
              acertoLiga > 0.01
                ? 'bg-poker-950/40 border-poker-700/60'
                : acertoLiga < -0.01
                  ? 'bg-red-950/30 border-red-700/50'
                  : 'bg-dark-800/50 border-dark-600/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-dark-400 uppercase tracking-wider font-medium mb-1">Acerto Liga</p>
                <p
                  className={`text-sm font-medium ${
                    acertoLiga > 0.01 ? 'text-poker-400' : acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-400'
                  }`}
                >
                  {acertoDirecao}
                </p>
              </div>
              <p
                className={`text-2xl font-bold font-mono ${
                  acertoLiga > 0.01 ? 'text-poker-400' : acertoLiga < -0.01 ? 'text-red-400' : 'text-dark-300'
                }`}
              >
                {formatBRL(acertoLiga)}
              </p>
            </div>
          </div>
        </AccordionSection>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function AccordionSection({
  id,
  label,
  isOpen,
  onToggle,
  className,
  children,
}: {
  id: string;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className || ''}>
      {/* Clickable section header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 pb-2 group cursor-pointer select-none"
        aria-expanded={isOpen}
        aria-controls={`dre-section-${id}`}
      >
        <span
          className={`text-[10px] text-dark-500 group-hover:text-dark-300 transition-transform duration-200 inline-block ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
          aria-hidden="true"
        >
          ▼
        </span>
        <span className="text-[10px] text-dark-500 group-hover:text-dark-300 uppercase tracking-wider font-semibold transition-colors">
          {label}
        </span>
      </button>

      {/* Collapsible content with smooth transition */}
      <div
        id={`dre-section-${id}`}
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: isOpen ? '1000px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DRERow({
  label,
  sublabel,
  value,
  color,
  bold,
}: {
  label: string;
  sublabel?: string;
  value: number;
  color?: string;
  bold?: boolean;
}) {
  const textColor = color || (value > 0 ? 'text-poker-400' : value < 0 ? 'text-red-400' : 'text-dark-500');
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-baseline gap-2">
        <span className={`text-sm ${bold ? 'font-semibold text-dark-200' : 'text-dark-300'}`}>{label}</span>
        {sublabel && <span className="text-[11px] text-dark-500">{sublabel}</span>}
      </div>
      <span className={`font-mono text-sm ${bold ? 'font-bold' : 'font-medium'} ${textColor}`}>{formatBRL(value)}</span>
    </div>
  );
}

function SectionTotal({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? 'text-poker-400' : value < 0 ? 'text-red-400' : 'text-dark-300';
  return (
    <div className="flex items-center justify-between py-2.5 mt-1 border-t-2 border-dark-600">
      <span className="text-sm font-bold text-white uppercase tracking-wide">{label}</span>
      <span className={`font-mono text-lg font-bold ${color}`}>{formatBRL(value)}</span>
    </div>
  );
}

function Separator() {
  return <div className="border-t border-dark-700/50 my-1" />;
}

// round2 imported from @/lib/formatters
