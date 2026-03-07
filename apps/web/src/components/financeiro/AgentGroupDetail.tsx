'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { formatBRL, sendWhatsApp } from '@/lib/api';
import { captureElement } from '@/lib/captureElement';
import { buildAgentConsolidadoMessage, openWhatsApp } from '@/lib/whatsappMessages';
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

function fmtDate(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

function clrVal(v: number) {
  if (v > 0.01) return 'text-emerald-400';
  if (v < -0.01) return 'text-red-400';
  return 'text-dark-400';
}

interface AgentGroupDetailProps {
  data: AgentConsolidatedSettlement;
  onBack: () => void;
  onEdit: () => void;
  onWhatsApp: () => void;
}

export default function AgentGroupDetail({ data, onBack, onEdit }: AgentGroupDetailProps) {
  const statementRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [hidePlayers, setHidePlayers] = useState(false);
  const [waDropdownOpen, setWaDropdownOpen] = useState(false);

  const isPositive = data.total.resultado >= 0;
  const totalPlayers = data.platforms.reduce((s, p) => s + (p.players?.length || 0), 0);

  async function handleExportJpg() {
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
    }
  }

  async function handleCopy() {
    try {
      const canvas = await captureElement(statementRef.current);
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          toast('Comprovante copiado!', 'success');
        }
      }, 'image/png');
    } catch {
      toast('Erro ao copiar', 'error');
    }
  }

  async function handleWhatsAppImage() {
    setWaDropdownOpen(false);
    const phone = data.group.phone;
    if (!phone) {
      toast('Nenhum telefone cadastrado. Edite o grupo para adicionar.', 'info');
      return;
    }
    try {
      toast('Enviando comprovante via WhatsApp...', 'info');
      const canvas = await captureElement(statementRef.current);
      if (!canvas) return;
      const base64 = canvas.toDataURL('image/png');
      const safeName = data.group.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanPhone = String(phone).replace(/\D/g, '');

      const res = await sendWhatsApp({
        phone: cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
        imageBase64: base64,
        caption: `Fechamento - ${data.group.name}`,
        fileName: `fechamento_${safeName}.png`,
      });

      if (res.success) {
        toast('Comprovante enviado via WhatsApp!', 'success');
      } else {
        // Fallback: copy + open wa.me
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
        toast(res.error || 'Evolution API indisponivel. Comprovante copiado, cole no WhatsApp.', 'info');
        const fallbackMsg = encodeURIComponent(`Fechamento - ${data.group.name} (${data.weekStart})`);
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        window.open(`https://wa.me/${fullPhone}?text=${fallbackMsg}`, '_blank');
      }
    } catch {
      toast('Erro ao enviar. Verifique a config em Configuracoes > WhatsApp.', 'error');
    }
  }

  function handleWhatsAppText() {
    setWaDropdownOpen(false);
    const phone = data.group.phone;
    if (!phone) {
      toast('Nenhum telefone cadastrado. Edite o grupo para adicionar.', 'info');
      return;
    }
    const msg = buildAgentConsolidadoMessage({
      agentName: data.group.name,
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      platforms: data.platforms,
      total: data.total,
    });
    openWhatsApp(phone, msg);
  }

  return (
    <div className="space-y-4">
      {/* Top bar: Back + Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-dark-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-dark-800"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-bold text-white flex-1">{data.group.name}</h2>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Editar
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 flex-wrap bg-dark-900 border border-dark-700 rounded-xl px-4 py-3">
        {/* Esconder Jogadores */}
        <label className="flex items-center gap-1.5 bg-dark-800/90 px-3 py-1.5 rounded-lg border border-dark-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hidePlayers}
            onChange={(e) => setHidePlayers(e.target.checked)}
            className="accent-poker-500 w-3.5 h-3.5"
          />
          <span className="text-[11px] text-dark-300 font-medium">Esconder Jogadores</span>
        </label>

        <div className="w-px h-6 bg-dark-700" />

        {/* Action buttons */}
        <button
          onClick={handleExportJpg}
          className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
        >
          Exportar JPG
        </button>
        <button
          onClick={handleCopy}
          className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-dark-800/90 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors"
        >
          Copiar
        </button>

        {/* WhatsApp dropdown */}
        <div className="relative">
          <button
            onClick={() => setWaDropdownOpen(!waDropdownOpen)}
            className="text-[11px] px-3 py-1.5 rounded-lg font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${waDropdownOpen ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {waDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-dark-800 border border-dark-600 rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={handleWhatsAppImage}
                className="w-full text-left px-3 py-2 text-[11px] text-dark-200 hover:bg-dark-700 transition-colors flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Enviar Comprovante
              </button>
              <div className="border-t border-dark-700" />
              <button
                onClick={handleWhatsAppText}
                className="w-full text-left px-3 py-2 text-[11px] text-dark-200 hover:bg-dark-700 transition-colors flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Enviar Cobranca (texto)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Statement Preview (capturable) */}
      <div
        ref={statementRef}
        className="bg-dark-900 border border-dark-700 rounded-xl p-6 max-w-2xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-5 mb-5">
          <div className="w-20 h-20 rounded-xl bg-dark-800 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-dark-500">
              {(data.group.name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">
              Fechamento Consolidado
            </p>
            <h2 className="text-lg font-bold text-poker-400 mt-0.5 flex items-center flex-wrap gap-1">
              <span>{data.group.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-poker-500/10 text-poker-400 border-poker-500/30 inline-flex items-center">
                {data.platforms.length} plataforma{data.platforms.length !== 1 ? 's' : ''}
              </span>
            </h2>
            <p className="text-dark-400 text-xs mt-0.5">
              {fmtDate(data.weekStart)} a {fmtDate(data.weekEnd)} · {totalPlayers} jogador{totalPlayers !== 1 ? 'es' : ''} · {data.platforms.map((p) => PLATFORM_LABELS[p.platform] || p.platform).join(' + ')}
            </p>
          </div>
        </div>

        <div className="border-t border-dark-700/50 mb-4" />

        {/* Per-platform sections */}
        {data.platforms.map((p, i) => (
          <div key={i} className="mb-4">
            {/* Platform header */}
            <div className={`border-l-4 ${PLATFORM_COLORS[p.platform] || 'border-dark-600'} pl-3 mb-3`}>
              <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider">
                {PLATFORM_LABELS[p.platform] || p.platform}
                {p.club_name && <span className="text-dark-500 font-normal ml-1">({p.club_name})</span>}
              </h3>
            </div>

            {/* Player table */}
            {!hidePlayers && p.players && p.players.length > 0 && (
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="border-b border-dark-700/50">
                    <th className="py-1.5 text-left text-[10px] text-dark-500 uppercase font-bold tracking-wider">Jogador</th>
                    <th className="py-1.5 text-center text-[10px] text-dark-500 uppercase font-bold tracking-wider">ID</th>
                    <th className="py-1.5 text-right text-[10px] text-dark-500 uppercase font-bold tracking-wider">Profit/Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/30">
                  {p.players.map((pl, j) => (
                    <tr key={j}>
                      <td className="py-1.5 text-dark-200 text-sm">{pl.nickname}</td>
                      <td className="py-1.5 text-center text-dark-400 font-mono text-xs">{pl.external_player_id || '—'}</td>
                      <td className={`py-1.5 text-right font-mono font-bold text-sm ${clrVal(pl.winnings_brl)}`}>
                        {formatBRL(pl.winnings_brl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Platform financial summary */}
            <div className="bg-dark-800/40 rounded-lg p-3 mb-1">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-dark-300 text-xs">Ganhos (P/L)</span>
                  <span className={`font-mono text-xs font-bold ${clrVal(p.winnings)}`}>
                    {formatBRL(p.winnings)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400 text-xs">Rake Gerado <span className="text-dark-600">(informativo)</span></span>
                  <span className="font-mono text-dark-400 text-xs">{formatBRL(p.rake)}</span>
                </div>
                {p.rb_value > 0.01 && (
                  <div className="flex justify-between">
                    <span className="text-dark-300 text-xs">RB Agente ({(p.rb_rate * 100).toFixed(0)}% do Rake)</span>
                    <span className="font-mono text-xs font-bold text-purple-400">{formatBRL(p.rb_value)}</span>
                  </div>
                )}
                <div className="border-t border-dark-700/30 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-dark-200 font-bold text-xs">Resultado</span>
                    <span className={`font-mono font-extrabold text-sm ${clrVal(p.resultado)}`}>
                      {formatBRL(p.resultado)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Separator between platforms */}
            {i < data.platforms.length - 1 && (
              <div className="border-t border-dark-700/30 my-4" />
            )}
          </div>
        ))}

        {data.platforms.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-dark-500">Sem dados para esta semana</p>
          </div>
        )}

        {/* Grand Total */}
        {data.platforms.length > 0 && (
          <div className={`rounded-lg p-3 border mt-4 ${
            isPositive
              ? 'bg-dark-800/30 border-dark-700/50'
              : 'bg-dark-800/30 border-dark-700/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-dark-300 text-sm font-bold uppercase tracking-wider">Resultado Final</span>
                <div className="flex gap-4 mt-1 text-[11px] text-dark-500">
                  <span>P/L: {formatBRL(data.total.winnings)}</span>
                  <span>Rake: {formatBRL(data.total.rake)}</span>
                  <span>RB: {formatBRL(data.total.rb_value)}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`font-mono font-extrabold text-lg ${clrVal(data.total.resultado)}`}>
                  {formatBRL(Math.abs(data.total.resultado))}
                </span>
                {Math.abs(data.total.resultado) > 0.01 && (
                  <span className={`block text-[10px] font-bold ${isPositive ? 'text-emerald-500' : 'text-red-400'}`}>
                    {isPositive ? 'a receber' : 'a pagar'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-5 pt-3 border-t border-dark-800/50">
          <p className="text-[10px] text-dark-600">
            {data.group.name} · Consolidado {data.platforms.map((p) => PLATFORM_LABELS[p.platform] || p.platform).join(' + ')} · Gerado em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
}
