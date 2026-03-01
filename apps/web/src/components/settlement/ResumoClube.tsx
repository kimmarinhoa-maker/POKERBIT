'use client';

import { useRef, useState, useMemo } from 'react';
import { formatBRL, sendWhatsApp } from '@/lib/api';
import { exportCsv } from '@/lib/exportCsv';
import { useToast } from '@/components/Toast';
import { SubclubData, PlayerMetric } from '@/types/settlement';
import ClubLogo from '@/components/ClubLogo';
import KpiCard from '@/components/ui/KpiCard';

interface Props {
  subclub: SubclubData;
  fees: Record<string, number>;
  weekStart?: string;
  weekEnd?: string;
  logoUrl?: string | null;
}

export default function ResumoClube({ subclub, fees, weekStart, weekEnd, logoUrl }: Props) {
  const { totals, feesComputed, adjustments, totalLancamentos, acertoLiga, name, players } = subclub;
  const resumoRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  // ─── Agent grouping (for statement + CSV) ───────────────────────
  const agentGroups = useMemo(() => {
    const map = new Map<string, PlayerMetric[]>();
    for (const p of (players || [])) {
      const key = p.agent_name || 'SEM AGENTE';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([agentName, pls]) => ({
        agentName,
        players: pls.length,
        rake: pls.reduce((s, p) => s + Number(p.rake_total_brl || 0), 0),
        ganhos: pls.reduce((s, p) => s + Number(p.winnings_brl || 0), 0),
        ggr: pls.reduce((s, p) => s + Number(p.ggr_brl || 0), 0),
        resultado: 0,
      }))
      .map((g) => ({ ...g, resultado: g.ganhos + g.rake + g.ggr }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [players]);

  const agentTotals = useMemo(() => ({
    players: agentGroups.reduce((s, g) => s + g.players, 0),
    rake: agentGroups.reduce((s, g) => s + g.rake, 0),
    ganhos: agentGroups.reduce((s, g) => s + g.ganhos, 0),
    ggr: agentGroups.reduce((s, g) => s + g.ggr, 0),
    resultado: agentGroups.reduce((s, g) => s + g.resultado, 0),
  }), [agentGroups]);

  // Formatar datas para exibicao (DD/MM/AAAA)
  const fmtDate = (d?: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };
  // Formatar data curta (DD/MM)
  const fmtDateShort = (d?: string) => {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  };

  const safeName = (name || 'resumo').replace(/[^a-zA-Z0-9_-]/g, '_');

  // ─── Capture helpers (shared html2canvas logic) ─────────────────
  async function captureStatement(): Promise<HTMLCanvasElement | null> {
    if (!statementRef.current) return null;
    const html2canvas = (await import('html2canvas')).default;
    return html2canvas(statementRef.current, {
      backgroundColor: '#0f0f13',
      scale: 2,
      useCORS: true,
      logging: false,
    });
  }

  async function handleExportJPG() {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = await captureStatement();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `fechamento_${safeName}_${weekStart || 'semana'}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      toast('JPG exportado!', 'success');
    } catch {
      toast('Erro ao exportar JPG', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleCopy() {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = await captureStatement();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('Fechamento copiado!', 'success');
        }
        setExporting(false);
      }, 'image/png');
      return; // setExporting handled in callback
    } catch {
      toast('Erro ao copiar', 'error');
    }
    setExporting(false);
  }

  function handleCSV() {
    const headers = ['Agente', 'Jogadores', 'Rake', 'Ganhos', 'GGR', 'Resultado'];
    const rows = agentGroups.map((g) => [
      g.agentName,
      g.players,
      g.rake.toFixed(2),
      g.ganhos.toFixed(2),
      g.ggr.toFixed(2),
      g.resultado.toFixed(2),
    ]);
    // Total row
    rows.push([
      'TOTAL',
      agentTotals.players,
      agentTotals.rake.toFixed(2),
      agentTotals.ganhos.toFixed(2),
      agentTotals.ggr.toFixed(2),
      agentTotals.resultado.toFixed(2),
    ]);
    exportCsv(`fechamento_${safeName}_${weekStart || 'semana'}`, headers, rows);
    toast('CSV exportado!', 'success');
  }

  async function handleWhatsApp() {
    if (exporting) return;
    setExporting(true);
    try {
      toast('Gerando imagem para WhatsApp...', 'info');
      const canvas = await captureStatement();
      if (!canvas) { setExporting(false); return; }
      const base64 = canvas.toDataURL('image/png');
      const res = await sendWhatsApp({
        phone: '',
        imageBase64: base64,
        caption: `Fechamento - ${name} - ${fmtDateShort(weekStart)} a ${fmtDateShort(weekEnd)}`,
        fileName: `fechamento_${safeName}.png`,
      });
      if (res.success) {
        toast('Fechamento enviado via WhatsApp!', 'success');
      } else {
        // Fallback: copy image + open wa.me
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
        toast('Fechamento copiado! Cole no WhatsApp com Ctrl+V.', 'info');
        window.open('https://wa.me/', '_blank');
      }
    } catch {
      toast('Erro ao enviar. Verifique Config > WhatsApp.', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* ── Toolbar ─── print hidden ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 mb-3 print:hidden">
        <button
          onClick={() => setShowPreview(true)}
          className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-poker-600/20 border border-poker-500/30 text-poker-400 hover:bg-poker-600/30 transition-colors"
        >
          Fechamento
        </button>
        <button
          onClick={handleCSV}
          className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
        >
          CSV
        </button>
      </div>

      {/* ── Preview Modal ──────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="relative z-10 w-full max-w-[840px] mx-4">
            {/* Modal toolbar */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-dark-300">Preview — Fechamento {name}</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportJPG}
                  disabled={exporting}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
                >
                  {exporting ? 'Exportando...' : 'Exportar JPG'}
                </button>
                <button
                  onClick={handleCopy}
                  disabled={exporting}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
                >
                  Copiar
                </button>
                <button
                  onClick={handleWhatsApp}
                  disabled={exporting}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Statement content (visible preview + capture ref) */}
            <div
              ref={statementRef}
              className="bg-[#0f0f13] text-white p-6 rounded-xl border border-dark-700"
            >
              {/* 1. Cabecalho */}
              <div className="flex items-center gap-4 mb-3">
                <ClubLogo logoUrl={logoUrl} name={name} size="lg" className="shadow-lg shadow-poker-900/20" />
                <div>
                  <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Fechamento Semanal</p>
                  <h2 className="text-xl font-bold text-poker-400 mt-0.5">{name}</h2>
                  <p className="text-dark-400 text-xs mt-0.5">
                    {fmtDate(weekStart)} &rarr; {fmtDate(weekEnd)}
                  </p>
                </div>
              </div>

              <div className="border-t border-dark-700/50 mb-3" />

              {/* 2. Resumo financeiro — 4 KPIs */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <StatBox label="Ganhos (P/L)" value={totals.ganhos} color={totals.ganhos >= 0 ? 'text-emerald-400' : 'text-red-400'} border="border-t-red-500" />
                <StatBox label="Rake" value={totals.rake} color="text-poker-400" border="border-t-poker-500" />
                <StatBox label="GGR Rodeio" value={totals.ggr} color="text-purple-400" border="border-t-purple-500" />
                <StatBox label="Resultado" value={totals.resultado} color={totals.resultado >= 0 ? 'text-amber-400' : 'text-red-400'} border="border-t-amber-500" />
              </div>

              {/* 2b. Taxas + Lançamentos (detalhado, lado a lado) */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {/* Taxas Automáticas */}
                <div className="bg-dark-800/40 rounded-lg px-3 py-2.5 border border-dark-700/50">
                  <div className="text-[9px] text-dark-500 uppercase tracking-wider font-bold mb-1.5">Taxas Automáticas</div>
                  <StmtDetailRow label="Taxa Aplicativo" sublabel={`${fees.taxaApp}%`} value={-feesComputed.taxaApp} />
                  <StmtDetailRow label="Taxa Liga" sublabel={`${fees.taxaLiga}%`} value={-feesComputed.taxaLiga} />
                  <StmtDetailRow label="Taxa Rodeo GGR" sublabel={`${fees.taxaRodeoGGR}%`} value={-feesComputed.taxaRodeoGGR} />
                  <StmtDetailRow label="Taxa Rodeo App" sublabel={`${fees.taxaRodeoApp}%`} value={-feesComputed.taxaRodeoApp} isLast />
                  <div className="border-t border-dark-600 mt-1 pt-1.5 flex justify-between">
                    <span className="text-[10px] font-bold text-dark-200">Total Taxas</span>
                    <span className="font-mono text-[10px] font-bold text-red-400">{formatBRL(feesComputed.totalTaxasSigned)}</span>
                  </div>
                </div>

                {/* Lançamentos */}
                <div className="bg-dark-800/40 rounded-lg px-3 py-2.5 border border-dark-700/50">
                  <div className="text-[9px] text-dark-500 uppercase tracking-wider font-bold mb-1.5">Lançamentos</div>
                  <StmtDetailRow label="Overlay" value={adjustments.overlay} />
                  <StmtDetailRow label="Compras" value={adjustments.compras} />
                  <StmtDetailRow label="Security" value={adjustments.security} />
                  <StmtDetailRow label="Outros" value={adjustments.outros} isLast />
                  <div className="border-t border-dark-600 mt-1 pt-1.5 flex justify-between">
                    <span className="text-[10px] font-bold text-dark-200">Total Lanç.</span>
                    <span className={`font-mono text-[10px] font-bold ${totalLancamentos < 0 ? 'text-red-400' : totalLancamentos > 0 ? 'text-emerald-400' : 'text-dark-500'}`}>
                      {formatBRL(totalLancamentos)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Acerto Liga (destaque) */}
              <div
                className={`rounded-xl px-4 py-3 mb-3 flex justify-between items-center ${
                  acertoLiga < 0
                    ? 'bg-red-900/20 border-2 border-red-500'
                    : 'bg-emerald-900/20 border-2 border-emerald-500'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-dark-400">Acerto Liga</div>
                  <div className="text-xs text-dark-400 mt-0.5">Resultado + Taxas + Lançamentos</div>
                </div>
                <div className="text-right">
                  <div className={`font-mono text-2xl font-bold ${acertoLiga < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatBRL(acertoLiga)}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${acertoLiga < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {acertoLiga < 0 ? `${name} deve pagar à Liga` : `Liga deve pagar ao ${name}`}
                  </div>
                </div>
              </div>

              {/* 4. Tabela de agentes */}
              {agentGroups.length > 0 && (
                <div className="rounded-xl border border-dark-700 overflow-hidden mb-3">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-dark-800/80">
                        <th className="py-1.5 px-3 text-left text-[9px] text-dark-400 uppercase font-bold tracking-wider">Agente</th>
                        <th className="py-1.5 px-3 text-center text-[9px] text-dark-400 uppercase font-bold tracking-wider">Jog.</th>
                        <th className="py-1.5 px-3 text-right text-[9px] text-dark-400 uppercase font-bold tracking-wider">Rake</th>
                        <th className="py-1.5 px-3 text-right text-[9px] text-dark-400 uppercase font-bold tracking-wider">Ganhos</th>
                        <th className="py-1.5 px-3 text-right text-[9px] text-dark-400 uppercase font-bold tracking-wider">GGR Rodeio</th>
                        <th className="py-1.5 px-3 text-right text-[9px] text-dark-400 uppercase font-bold tracking-wider">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800">
                      {agentGroups.map((g) => (
                        <tr key={g.agentName}>
                          <td className="py-1.5 px-3 text-dark-100 font-medium">{g.agentName}</td>
                          <td className="py-1.5 px-3 text-center text-dark-300">{g.players}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-dark-300">{formatBRL(g.rake)}</td>
                          <td className={`py-1 px-3 text-right font-mono ${g.ganhos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(g.ganhos)}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-purple-400">{formatBRL(g.ggr)}</td>
                          <td className={`py-1 px-3 text-right font-mono font-bold ${g.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(g.resultado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-dark-800/80" style={{ boxShadow: '0 -1px 0 0 rgb(82 82 91)' }}>
                        <td className="py-1.5 px-3 text-dark-100 font-bold">TOTAL</td>
                        <td className="py-1.5 px-3 text-center text-dark-100 font-bold">{agentTotals.players}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-dark-100 font-bold">{formatBRL(agentTotals.rake)}</td>
                        <td className={`py-1.5 px-3 text-right font-mono font-bold ${agentTotals.ganhos >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatBRL(agentTotals.ganhos)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-purple-400 font-bold">{formatBRL(agentTotals.ggr)}</td>
                        <td className={`py-1.5 px-3 text-right font-mono font-bold ${agentTotals.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatBRL(agentTotals.resultado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* 5. Rodape */}
              <div className="flex justify-between items-center text-[10px] text-dark-600 pt-2 border-t border-dark-800">
                <span>{name}</span>
                <span>{new Date().toLocaleString('pt-BR')}</span>
              </div>
            </div>
            {/* /statementRef */}
          </div>
          {/* /modal */}
        </div>
      )}

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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
          <KpiCard
            label="Jogadores Ativos"
            value={String(totals.players)}
            accentColor="bg-blue-500"
            valueColor="text-blue-400"
            tooltip="Total de jogadores com movimentacao nesta semana"
          />
          <KpiCard
            label="Profit/Loss"
            value={formatBRL(totals.ganhos)}
            accentColor={totals.ganhos < 0 ? 'bg-red-500' : 'bg-poker-500'}
            valueColor={totals.ganhos < 0 ? 'text-red-400' : 'text-poker-400'}
            subtitle="Ganhos e Perdas"
            tooltip="Soma dos ganhos/perdas de todos jogadores (winnings_brl)"
          />
          <KpiCard
            label="Rake Gerado"
            value={formatBRL(totals.rake)}
            accentColor="bg-poker-500"
            valueColor="text-poker-400"
            tooltip="Soma do rake de todos jogadores (rake_total_brl)"
          />
          <KpiCard
            label="GGR Rodeo P/L"
            value={formatBRL(totals.ggr)}
            accentColor="bg-purple-500"
            valueColor="text-purple-400"
            tooltip="Gross Gaming Revenue do Rodeo (ggr_brl)"
          />
          <KpiCard
            label="Resultado do Clube"
            value={formatBRL(totals.resultado)}
            accentColor={totals.resultado >= 0 ? 'bg-amber-500' : 'bg-red-500'}
            valueColor={totals.resultado >= 0 ? 'text-amber-400' : 'text-red-400'}
            subtitle="P/L + Rake + GGR"
            ring="ring-1 ring-amber-700/30"
            tooltip={`resultado = ganhos + rake + ggr = ${formatBRL(totals.ganhos)} + ${formatBRL(totals.rake)} + ${formatBRL(totals.ggr)}`}
          />
        </div>

        {/* ── Taxas + Lancamentos (side by side) ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {/* TAXAS AUTOMATICAS */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-dark-400 mb-4">Taxas Automáticas</h3>
            <div>
              <TaxaRow label="Taxa Aplicativo" sublabel={`${fees.taxaApp}% do Rake`} value={feesComputed.taxaApp} />
              <TaxaRow label="Taxa Liga" sublabel={`${fees.taxaLiga}% do Rake`} value={feesComputed.taxaLiga} />
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
                <span
                  className="font-mono text-danger-500 font-bold text-sm explainable"
                  title={`totalTaxasSigned = -(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp) = -(${formatBRL(feesComputed.taxaApp)} + ${formatBRL(feesComputed.taxaLiga)} + ${formatBRL(feesComputed.taxaRodeoGGR)} + ${formatBRL(feesComputed.taxaRodeoApp)})`}
                >
                  {formatBRL(feesComputed.totalTaxasSigned)}
                </span>
              </div>
            </div>
          </div>

          {/* LANCAMENTOS */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-dark-400">Lançamentos</h3>
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
                <span
                  className={`font-mono font-bold text-sm ${totalLancamentos < 0 ? 'text-danger-500' : totalLancamentos > 0 ? 'text-poker-500' : 'text-dark-500'}`}
                >
                  {formatBRL(totalLancamentos)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Acerto Total Liga ── card destacado ────────────────── */}
        <div
          className={`rounded-xl p-6 flex justify-between items-center ${
            acertoLiga < 0 ? 'bg-danger-900/20 border-2 border-danger-500' : 'bg-poker-900/20 border-2 border-poker-500'
          }`}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-dark-400 mb-1">ACERTO TOTAL LIGA</div>
            <div className="text-xs text-dark-400">Resultado + Taxas + Lançamentos</div>
          </div>
          <div className="text-right">
            <div
              className={`font-mono text-3xl font-bold ${acertoLiga < 0 ? 'text-danger-500' : 'text-poker-500'} explainable inline-block`}
              title={`acertoLiga = resultado + totalTaxasSigned + lancamentos = ${formatBRL(totals.resultado)} + ${formatBRL(feesComputed.totalTaxasSigned)} + ${formatBRL(totalLancamentos)}`}
            >
              {formatBRL(acertoLiga)}
            </div>
            <div className={`text-xs mt-1 ${acertoLiga < 0 ? 'text-danger-500' : 'text-poker-500'}`}>
              {acertoLiga < 0 ? `${name} deve pagar à Liga` : `Liga deve pagar ao ${name}`}
            </div>
          </div>
        </div>
      </div>
      {/* /resumoRef */}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

/** Detail row for statement taxas/lancamentos cards */
function StmtDetailRow({ label, sublabel, value, isLast }: { label: string; sublabel?: string; value: number; isLast?: boolean }) {
  const isEmpty = value === undefined || value === null || value === 0;
  return (
    <div className={`flex justify-between items-center py-[3px] ${isLast ? '' : 'border-b border-dark-800/40'}`}>
      <div>
        <span className={`text-[10px] ${isEmpty ? 'text-dark-500' : 'text-dark-200'}`}>{label}</span>
        {sublabel && <span className="text-[8px] text-dark-500 ml-1">{sublabel}</span>}
      </div>
      <span className={`font-mono text-[10px] ${isEmpty ? 'text-dark-600' : value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {isEmpty ? '—' : formatBRL(value)}
      </span>
    </div>
  );
}

/** Stat box for the statement KPI grid */
function StatBox({ label, value, color, border }: { label: string; value: number; color: string; border: string }) {
  return (
    <div className={`bg-dark-800/60 rounded-lg p-3 border-t-2 ${border}`}>
      <div className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1">{label}</div>
      <div className={`font-mono text-sm font-bold ${color}`}>{formatBRL(value)}</div>
    </div>
  );
}

function TaxaRow({
  label,
  sublabel,
  value,
  isLast,
}: {
  label: string;
  sublabel: string;
  value: number;
  isLast?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
      <div>
        <span className="text-sm text-dark-100">{label}</span>
        <span className="text-xs text-dark-400 ml-2">{sublabel}</span>
      </div>
      <span className="font-mono text-sm text-danger-500">{formatBRL(-value)}</span>
    </div>
  );
}

function LancRow({ label, value, isLast }: { label: string; value: number; isLast?: boolean }) {
  if (value === undefined || value === null)
    return (
      <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
        <span className="text-sm text-dark-400">{label}</span>
        <span className="text-dark-600 text-sm">—</span>
      </div>
    );

  return (
    <div className={`flex justify-between items-center py-3 ${isLast ? '' : 'border-b border-dark-800'}`}>
      <span className={`text-sm ${value !== 0 ? 'text-dark-100' : 'text-dark-400'}`}>{label}</span>
      <span
        className={`font-mono text-sm ${
          value > 0 ? 'text-poker-500' : value < 0 ? 'text-danger-500' : 'text-dark-600'
        }`}
      >
        {value === 0 ? '—' : formatBRL(value)}
      </span>
    </div>
  );
}
