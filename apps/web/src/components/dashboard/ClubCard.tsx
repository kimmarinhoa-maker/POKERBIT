'use client';

import type { ClubeData } from '@/types/dashboard';
import { formatCurrency } from '@/lib/formatters';
import ClubLogo from '@/components/ClubLogo';

interface ClubCardProps {
  clube: ClubeData;
  enabled?: boolean;
  onToggle?: () => void;
}

function getBadge(acertoLiga: number): { label: string; cls: string } {
  if (acertoLiga < 0) return { label: 'A PAGAR', cls: 'bg-red-900/50 text-red-400 border-red-500/20' };
  if (acertoLiga > 0) return { label: 'A RECEBER', cls: 'bg-poker-900 text-poker-500 border-poker-500/20' };
  return { label: 'QUITADO', cls: 'bg-dark-800 text-dark-400 border-dark-700' };
}

export default function ClubCard({ clube, enabled = true, onToggle }: ClubCardProps) {
  const resultColor = clube.resultado >= 0 ? 'text-poker-500' : 'text-red-400';
  const acertoColor = clube.acertoLiga >= 0 ? 'text-poker-500' : 'text-red-400';

  return (
    <div
      className={`bg-dark-900 border border-dark-700 rounded-xl p-4 shadow-card hover:shadow-card-hover hover:-translate-y-px hover:border-dark-600 transition-all duration-200 flex flex-col ${!enabled ? 'opacity-40' : 'cursor-pointer'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <ClubLogo logoUrl={clube.logoUrl} name={clube.nome} size="sm" />
          <h3 className="text-lg font-extrabold tracking-wide uppercase text-dark-100">{clube.nome}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getBadge(clube.acertoLiga).cls}`}>
            {getBadge(clube.acertoLiga).label}
          </span>
          {onToggle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-poker-500' : 'bg-dark-600'}`}
              title={enabled ? 'Desativar do calculo' : 'Ativar no calculo'}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'left-[18px]' : 'left-0.5'}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Subheader */}
      <p className="text-xs text-dark-400 mb-3">{clube.agentes} agentes</p>

      {/* Grid: Rake | Resultado */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dark-400 mb-0.5">Rake</p>
          <p className="font-mono font-semibold text-sm text-poker-500">{formatCurrency(clube.rake)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-dark-400 mb-0.5">Resultado</p>
          <p className={`font-mono font-semibold text-sm ${resultColor}`}>{formatCurrency(clube.resultado)}</p>
        </div>
      </div>

      {/* Acerto Liga */}
      <div className="bg-dark-800 rounded-lg p-2.5 mb-3">
        <p className="text-[10px] uppercase tracking-widest text-dark-400 mb-0.5">Acerto Liga</p>
        <p className={`font-mono font-bold text-base ${acertoColor}`}>{formatCurrency(clube.acertoLiga)}</p>
      </div>

      {/* Button */}
      <button className="mt-auto w-full border border-dark-700 bg-transparent hover:bg-dark-800 text-dark-400 hover:text-dark-100 text-xs font-semibold py-1.5 rounded-lg transition-colors">
        Abrir Fechamento →
      </button>
    </div>
  );
}
