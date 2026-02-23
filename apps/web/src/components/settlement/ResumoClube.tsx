'use client';

import { useRef, useState } from 'react';
import { formatBRL } from '@/lib/api';
import { exportElementAsJpg } from '@/lib/exportJpg';
import { useToast } from '@/components/Toast';

interface Props {
  subclub: any;
  fees: Record<string, number>;
  weekStart?: string;
  weekEnd?: string;
}

export default function ResumoClube({ subclub, fees, weekStart, weekEnd }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, acertoDirecao, name } = subclub;
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
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-poker-900/80 to-dark-800 flex items-center justify-center text-3xl shadow-lg shadow-poker-900/20">
          <span>🏢</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{name}</h2>
          {weekStart && (
            <p className="text-dark-400 text-sm flex items-center gap-1">
              <span className="text-dark-500">📅</span>
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
          icon="👥"
        />
        <KpiCard
          label="Profit/Loss"
          sublabel="Ganhos e Perdas"
          value={formatBRL(totals.ganhos)}
          borderColor={totals.ganhos < 0 ? 'border-red-500' : 'border-poker-500'}
          textColor={totals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}
          icon="📉"
        />
        <KpiCard
          label="Rake Gerado"
          value={formatBRL(totals.rake)}
          borderColor="border-poker-500"
          textColor="text-poker-400"
          icon="🎰"
        />
        <KpiCard
          label="GGR Rodeo P/L"
          value={formatBRL(totals.ggr)}
          borderColor="border-purple-500"
          textColor="text-purple-400"
          icon="🎯"
        />
        <KpiCard
          label="Resultado do Clube"
          sublabel="P/L + Rake + GGR"
          value={formatBRL(totals.resultado)}
          borderColor={totals.resultado >= 0 ? 'border-amber-500' : 'border-red-500'}
          textColor={totals.resultado >= 0 ? 'text-amber-400' : 'text-red-400'}
          icon="🏆"
          highlight
        />
      </div>

      {/* ── Taxas + Lancamentos (side by side) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* TAXAS AUTOMATICAS */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
            <span className="text-base">📋</span>
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Taxas Automaticas
            </h3>
          </div>
          <div className="space-y-3">
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
            />
            {/* Total */}
            <div className="pt-3 mt-1 border-t border-dark-600 flex items-center justify-between">
              <span className="text-sm font-semibold text-red-400">Total Taxas</span>
              <span className="font-mono text-red-400 font-bold text-base">
                - R$ {formatNumber(feesComputed.totalTaxas)}
              </span>
            </div>
          </div>
        </div>

        {/* LANCAMENTOS */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-dark-700/60">
            <span className="text-base">📝</span>
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Lancamentos
            </h3>
            <span className="text-[10px] text-dark-500 ml-1">(editaveis em Config)</span>
          </div>
          <div className="space-y-3">
            <LancRow label="Overlay (parte do clube)" value={adjustments.overlay} />
            <LancRow label="Compras" value={adjustments.compras} />
            <LancRow label="Security" value={adjustments.security} />
            <LancRow label="Outros" value={adjustments.outros} />
            {/* Total */}
            <div className="pt-3 mt-1 border-t border-dark-600 flex items-center justify-between">
              <span className="text-sm font-semibold text-dark-300">Total Lanc.</span>
              <span className={`font-mono font-bold text-base ${totalLancamentos < 0 ? 'text-red-400' : totalLancamentos > 0 ? 'text-poker-400' : 'text-dark-500'}`}>
                {formatBRL(totalLancamentos)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Acerto Total Liga ── card destacado ────────────────── */}
      <div className={`rounded-xl p-6 border-2 ${
        acertoLiga > 0
          ? 'bg-poker-950/40 border-poker-700/60'
          : acertoLiga < 0
            ? 'bg-red-950/30 border-red-700/50'
            : 'bg-dark-800/50 border-dark-600/50'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🏆</span>
              <h3 className="text-lg font-bold text-white uppercase tracking-wide">
                Acerto Total Liga
              </h3>
            </div>
            <p className="text-xs text-dark-400 ml-8">
              Resultado + Taxas + Lancamentos
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold font-mono ${
              acertoLiga > 0 ? 'text-poker-400' : acertoLiga < 0 ? 'text-red-400' : 'text-dark-300'
            }`}>
              {formatBRL(acertoLiga)}
            </p>
            <p className={`text-sm mt-1 font-medium ${
              acertoLiga > 0 ? 'text-poker-400' : acertoLiga < 0 ? 'text-red-400' : 'text-dark-400'
            }`}>
              {acertoLiga > 0 ? '🟢 ' : acertoLiga < 0 ? '🔴 ' : '⚪ '}
              {acertoDirecao}
            </p>
          </div>
        </div>

        {/* Mini breakdown */}
        <div className="mt-4 pt-3 border-t border-dark-700/50 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[10px] text-dark-500 uppercase">Resultado</p>
            <p className={`text-sm font-mono ${totals.resultado >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
              {formatBRL(totals.resultado)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-dark-500 uppercase">Taxas</p>
            <p className="text-sm font-mono text-red-400">
              - R$ {formatNumber(feesComputed.totalTaxas)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-dark-500 uppercase">Lancamentos</p>
            <p className={`text-sm font-mono ${totalLancamentos >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
              {formatBRL(totalLancamentos)}
            </p>
          </div>
        </div>
      </div>
      </div>{/* /resumoRef */}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function KpiCard({ label, sublabel, value, borderColor, textColor, icon, highlight }: {
  label: string;
  sublabel?: string;
  value: string;
  borderColor: string;
  textColor: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden ${
      highlight ? 'ring-1 ring-amber-700/30' : ''
    }`}>
      {/* Borda colorida no topo */}
      <div className={`h-1 ${borderColor.replace('border-', 'bg-')}`} />
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{icon}</span>
          <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">{label}</p>
        </div>
        {sublabel && (
          <p className="text-[9px] text-dark-600 ml-6 -mt-0.5">{sublabel}</p>
        )}
        <p className={`text-xl font-bold mt-2 font-mono ${textColor}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function TaxaRow({ label, sublabel, value }: { label: string; sublabel: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-dark-200">{label}</span>
        <span className="text-[11px] text-dark-500">{sublabel}</span>
      </div>
      <span className="font-mono text-red-400 text-sm font-medium">
        - R$ {formatNumber(value)}
      </span>
    </div>
  );
}

function LancRow({ label, value }: { label: string; value: number }) {
  if (value === undefined || value === null) return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-dark-400">{label}</span>
      <span className="text-dark-600 text-sm">--</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${value !== 0 ? 'text-dark-100 font-medium' : 'text-dark-400'}`}>
        {label}
      </span>
      <span className={`font-mono text-sm font-medium ${
        value > 0 ? 'text-poker-400' : value < 0 ? 'text-red-400' : 'text-dark-500'
      }`}>
        {formatBRL(value)}
      </span>
    </div>
  );
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}
