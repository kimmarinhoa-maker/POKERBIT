'use client';

import { useRef, useState } from 'react';
import { formatBRL } from '@/lib/api';
import { exportElementAsJpg } from '@/lib/exportJpg';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';

interface Props {
  subclub: any;
  fees: Record<string, number>;
  weekStart?: string;
  weekEnd?: string;
  logoUrl?: string | null;
}

export default function ResumoClube({ subclub, fees, weekStart, weekEnd, logoUrl }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, name } = subclub;
  const resumoRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  async function handleExportJPG() {
    if (!resumoRef.current || exporting) return;
    setExporting(true);
    try {
      const safeName = (name || 'resumo').replace(/[^a-zA-Z0-9_-]/g, '_');
      await exportElementAsJpg(
        resumoRef.current,
        `resumo_${safeName}_${weekStart || 'semana'}`,
        { backgroundColor: '#0f0f13' }
      );
    } catch {
      toast('Erro ao exportar JPG', 'error');
    } finally {
      setExporting(false);
    }
  }

  // Formatar datas para exibicao (DD/MM/AAAA)
  const fmtDate = (d?: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <div>
      {/* Export button (print hidden) */}
      <div className="flex justify-end mb-2 print:hidden">
        <button
          onClick={handleExportJPG}
          disabled={exporting}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          {exporting ? '⏳ Exportando...' : '📷 Exportar JPG'}
        </button>
      </div>

      <div ref={resumoRef}>
      {/* ── Header do subclube ──────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6">
        <ClubLogo logoUrl={logoUrl} name={name} size="lg" className="shadow-lg shadow-poker-900/20" />
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{name}</h2>
          {weekStart && (
            <p className="text-dark-400 text-sm flex items-center gap-1">
              {fmtDate(weekStart)}
              <span className="text-dark-600 mx-1">&rarr;</span>
              {fmtDate(weekEnd)}
            </p>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── 5 cards com borda colorida no topo ────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <KpiCard
          label="Jogadores Ativos"
          value={String(totals.players)}
          borderColor="border-blue-500"
          textColor="text-blue-400"
        />
        <KpiCard
          label="Profit/Loss"
          sublabel="Ganhos e Perdas"
          value={formatBRL(totals.ganhos)}
          borderColor={totals.ganhos < 0 ? 'border-red-500' : 'border-poker-500'}
          textColor={totals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}
        />
        <KpiCard
          label="Rake Gerado"
          value={formatBRL(totals.rake)}
          borderColor="border-poker-500"
          textColor="text-poker-400"
        />
        <KpiCard
          label="GGR Rodeo P/L"
          value={formatBRL(totals.ggr)}
          borderColor="border-purple-500"
          textColor="text-purple-400"
        />
        <KpiCard
          label="Resultado do Clube"
          sublabel="P/L + Rake + GGR"
          value={formatBRL(totals.resultado)}
          borderColor={totals.resultado >= 0 ? 'border-amber-500' : 'border-red-500'}
          textColor={totals.resultado >= 0 ? 'text-amber-400' : 'text-red-400'}
          highlight
        />
      </div>

      {/* ── Taxas + Lancamentos (side by side) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">

        {/* TAXAS AUTOMATICAS */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-dark-400 mb-4">
            Taxas Automáticas
          </h3>
          <div>
            <TaxaRow
              label="Taxa Aplicativo"
              sublabel={`${fees.taxaApp}% do Rake`}
              value={feesComputed.taxaApp}
            />
            <TaxaRow
              label="Taxa Liga"
              sublabel={`${fees.taxaLiga}% do Rake`}
              value={feesComputed.taxaLiga}
            />
            <TaxaRow
              label="Taxa Rodeo GGR"
              sublabel={`${fees.taxaRodeoGGR}% do GGR`}
              value={feesComputed.taxaRodeoGGR}
            />
            <TaxaRow
              label="Taxa Rodeo App"
              sublabel={`${fees.taxaRodeoApp}% do GGR`}
              value={feesComputed.taxaRodeoApp}
              isLast
            />
            {/* Total */}
            <div className="border-t-2 border-danger-500/30 mt-1 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-dark-100">Total Taxas</span>
              <span className="font-mono text-danger-500 font-bold text-sm">
                {formatBRL(feesComputed.totalTaxasSigned)}
              </span>
            </div>
          </div>
        </div>

        {/* LANCAMENTOS */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-dark-400">
              Lançamentos
            </h3>
            <span className="text-xs text-dark-600">(editáveis em Lançamentos)</span>
          </div>
          <div>
            <LancRow label="Overlay (parte do clube)" value={adjustments.overlay} />
            <LancRow label="Compras" value={adjustments.compras} />
            <LancRow label="Security" value={adjustments.security} />
            <LancRow label="Outros" value={adjustments.outros} isLast />
            {/* Total */}
            <div className="border-t border-dark-700 mt-1 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-dark-100">Total Lanc.</span>
              <span className={`font-mono font-bold text-sm ${totalLancamentos < 0 ? 'text-danger-500' : totalLancamentos > 0 ? 'text-poker-500' : 'text-dark-500'}`}>
                {formatBRL(totalLancamentos)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Acerto Total Liga ── card destacado ────────────────── */}
      <div className={`rounded-xl p-6 flex justify-between items-center ${
        acertoLiga < 0
          ? 'bg-danger-900/20 border-2 border-danger-500'
          : 'bg-poker-900/20 border-2 border-poker-500'
      }`}>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-dark-400 mb-1">
            🏆 ACERTO TOTAL LIGA
          </div>
          <div className="text-xs text-dark-400">
            Resultado + Taxas + Lançamentos
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-3xl font-bold ${
            acertoLiga < 0 ? 'text-danger-500' : 'text-poker-500'
          }`}>
            {formatBRL(acertoLiga)}
          </div>
          <div className={`text-xs mt-1 ${
            acertoLiga < 0 ? 'text-danger-500' : 'text-poker-500'
          }`}>
            {acertoLiga < 0
              ? `${name} deve pagar à Liga`
              : `Liga deve pagar ao ${name}`}
          </div>
        </div>
      </div>
      </div>{/* /resumoRef */}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function KpiCard({ label, sublabel, value, borderColor, textColor, highlight }: {
  label: string;
  sublabel?: string;
  value: string;
  borderColor: string;
  textColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:border-dark-600 cursor-default ${
      highlight ? 'ring-1 ring-amber-700/30' : ''
    }`}>
      <div className={`h-0.5 ${borderColor.replace('border-', 'bg-')}`} />
      <div className="p-4">
        <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">{label}</p>
        {sublabel && (
          <p className="text-[9px] text-dark-600 -mt-0.5">{sublabel}</p>
        )}
        <p className={`text-xl font-bold mt-2 font-mono ${textColor}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function TaxaRow({ label, sublabel, value, isLast }: { label: string; sublabel: string; value: number; isLast?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
      <div>
        <span className="text-sm text-dark-100">{label}</span>
        <span className="text-xs text-dark-400 ml-2">{sublabel}</span>
      </div>
      <span className="font-mono text-sm text-danger-500">
        {formatBRL(-value)}
      </span>
    </div>
  );
}

function LancRow({ label, value, isLast }: { label: string; value: number; isLast?: boolean }) {
  if (value === undefined || value === null) return (
    <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
      <span className="text-sm text-dark-400">{label}</span>
      <span className="text-dark-600 text-sm">—</span>
    </div>
  );

  return (
    <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
      <span className={`text-sm ${value !== 0 ? 'text-dark-100' : 'text-dark-400'}`}>
        {label}
      </span>
      <span className={`font-mono text-sm ${
        value > 0 ? 'text-poker-500' : value < 0 ? 'text-danger-500' : 'text-dark-600'
      }`}>
        {value === 0 ? '—' : formatBRL(value)}
      </span>
    </div>
  );
}

