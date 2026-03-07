'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, Download, MessageCircle, Pencil } from 'lucide-react';
import { formatBRL } from '@/lib/api';
import { captureElement } from '@/lib/captureElement';
import { useToast } from '@/components/Toast';
import type { AgentConsolidatedSettlement } from '@/types/financeiro';

const PLATFORM_COLORS: Record<string, string> = {
  suprema: 'border-emerald-500',
  pppoker: 'border-violet-500',
  clubgg: 'border-blue-500',
};

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

interface AgentGroupDetailProps {
  data: AgentConsolidatedSettlement;
  onBack: () => void;
  onEdit: () => void;
  onWhatsApp: () => void;
}

export default function AgentGroupDetail({ data, onBack, onEdit, onWhatsApp }: AgentGroupDetailProps) {
  const statementRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const isPositive = data.total.resultado >= 0;

  async function handleExportJpg() {
    setExporting(true);
    try {
      const canvas = await captureElement(statementRef.current);
      if (!canvas) return;
      const link = document.createElement('a');
      const safeName = data.group.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `fechamento_${safeName}_${data.weekStart}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      toast('JPG exportado!', 'success');
    } catch {
      toast('Erro ao exportar JPG', 'error');
    } finally {
      setExporting(false);
    }
  }

  function fmtDate(d: string) {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  }

  return (
    <div className="space-y-4">
      {/* Back + Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-dark-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-dark-800"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-bold text-white flex-1">{data.group.name}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Editar
          </button>
          <button
            onClick={handleExportJpg}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            JPG
          </button>
          {data.group.phone && (
            <button
              onClick={onWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
            >
              <MessageCircle className="w-3 h-3" />
              WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Statement (capturable) */}
      <div ref={statementRef} className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">{data.group.name}</h3>
              <p className="text-xs text-dark-400 mt-0.5">
                {data.platforms.map((p) => PLATFORM_LABELS[p.platform] || p.platform).join(' + ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-dark-500">Semana</p>
              <p className="text-sm font-mono text-dark-300">
                {fmtDate(data.weekStart)} - {fmtDate(data.weekEnd)}
              </p>
            </div>
          </div>
        </div>

        {/* Platform cards */}
        <div className="p-4 space-y-3">
          {data.platforms.map((p, i) => (
            <div
              key={i}
              className={`bg-dark-800 border-l-4 ${PLATFORM_COLORS[p.platform] || 'border-dark-600'} rounded-lg p-4`}
            >
              <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider mb-3">
                {PLATFORM_LABELS[p.platform] || p.platform}
                {p.club_name && <span className="text-dark-500 font-normal ml-1">({p.club_name})</span>}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-dark-500 uppercase">P/L</p>
                  <p className={`text-sm font-mono font-bold ${p.winnings >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatBRL(p.winnings)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-dark-500 uppercase">Rake</p>
                  <p className="text-sm font-mono font-bold text-white">{formatBRL(p.rake)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-dark-500 uppercase">
                    RB ({(p.rb_rate * 100).toFixed(0)}%)
                  </p>
                  <p className="text-sm font-mono font-bold text-amber-400">{formatBRL(p.rb_value)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-dark-500 uppercase">Resultado</p>
                  <p className={`text-sm font-mono font-bold ${p.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatBRL(p.resultado)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {data.platforms.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-dark-500">Sem dados para esta semana</p>
            </div>
          )}
        </div>

        {/* Total */}
        {data.platforms.length > 0 && (
          <div className="border-t-2 border-dark-600 px-6 py-4 bg-dark-800/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">Resultado Final</p>
                <p className={`text-2xl font-bold font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {formatBRL(data.total.resultado)}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  isPositive
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}
              >
                {isPositive ? 'A RECEBER' : 'A PAGAR'}
              </span>
            </div>
            <div className="flex gap-6 mt-2 text-[11px] text-dark-500">
              <span>P/L: {formatBRL(data.total.winnings)}</span>
              <span>Rake: {formatBRL(data.total.rake)}</span>
              <span>RB: {formatBRL(data.total.rb_value)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
