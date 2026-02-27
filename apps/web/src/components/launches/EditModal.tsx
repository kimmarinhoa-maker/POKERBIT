'use client';

import { useState, useEffect, useMemo } from 'react';
import { LaunchRow } from '@/types/launches';
import { formatBRL } from '@/lib/formatters';
import ClubLogo from '@/components/ClubLogo';

interface EditModalProps {
  row: LaunchRow | null;
  onSave: (data: { subclubId: string; compras: number; security: number; outros: number; obs: string }) => void;
  onClose: () => void;
}

function parseNum(val: string): number {
  const cleaned = val.replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function numToStr(val: number): string {
  if (val === 0) return '';
  return String(val);
}

export default function EditModal({ row, onSave, onClose }: EditModalProps) {
  const [compras, setCompras] = useState('');
  const [security, setSecurity] = useState('');
  const [outros, setOutros] = useState('');
  const [obs, setObs] = useState('');

  useEffect(() => {
    if (row) {
      setCompras(numToStr(Math.abs(row.compras)));
      setSecurity(numToStr(row.security));
      setOutros(numToStr(row.outros));
      setObs(row.obs);
    }
  }, [row]);

  const comprasValue = -Math.abs(parseNum(compras));
  const totalLancamentos = useMemo(
    () => comprasValue + parseNum(security) + parseNum(outros),
    [comprasValue, security, outros],
  );

  if (!row) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      subclubId: row!.subclubId,
      compras: -Math.abs(parseNum(compras)),
      security: parseNum(security),
      outros: parseNum(outros),
      obs,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700 bg-dark-800/40">
          <div className="flex items-center gap-3">
            <ClubLogo name={row.subclubName} logoUrl={row.logoUrl} size="sm" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{row.subclubName}</h3>
              <p className="text-[11px] text-dark-400">Editar lancamentos do clube</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Campos de valor */}
          <div className="px-6 pt-5 pb-4">
            <p className="text-[10px] font-semibold text-dark-500 uppercase tracking-widest mb-3">Valores</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-dark-400">
                  Compras <span className="text-danger-500">(negativo)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-danger-500 text-[11px] font-mono">
                    -R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={compras}
                    onChange={(e) => setCompras(e.target.value)}
                    placeholder="0,00"
                    className="input w-full pl-9 font-mono text-right text-sm focus:border-poker-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-dark-400">Security</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-[11px] font-mono">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={security}
                    onChange={(e) => setSecurity(e.target.value)}
                    placeholder="0,00"
                    className="input w-full pl-9 font-mono text-right text-sm focus:border-poker-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-dark-400">Outros</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-[11px] font-mono">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={outros}
                    onChange={(e) => setOutros(e.target.value)}
                    placeholder="0,00"
                    className="input w-full pl-9 font-mono text-right text-sm focus:border-poker-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Total em tempo real */}
          <div className="mx-6 px-4 py-3 rounded-lg bg-dark-800/60 border border-dark-700 flex items-center justify-between">
            <span className="text-[11px] font-medium text-dark-400 uppercase tracking-wide">Total lancamentos</span>
            <span
              className={`font-mono text-base font-bold ${
                totalLancamentos < 0 ? 'text-danger-500' : totalLancamentos > 0 ? 'text-poker-500' : 'text-dark-400'
              }`}
            >
              {formatBRL(totalLancamentos)}
            </span>
          </div>

          {/* Observacao */}
          <div className="px-6 pt-4 pb-5">
            <p className="text-[10px] font-semibold text-dark-500 uppercase tracking-widest mb-3">Observacao</p>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Ajuste referente a compra de fichas extras..."
              rows={2}
              className="input w-full text-sm resize-none focus:border-poker-500 transition-colors"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-700 bg-dark-800/20">
            <button type="button" onClick={onClose} className="btn-secondary px-5">
              Cancelar
            </button>
            <button type="submit" className="btn-primary px-6">
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
