'use client';

import { useState } from 'react';
import { SubClub } from '@/types/launches';
import { formatCurrency } from '@/lib/formatters';
import ClubLogo from '@/components/ClubLogo';

interface OverlaySectionProps {
  clubs: SubClub[];
  totalOverlay: number;
  selectedClubIds: string[];
  onOverlayChange: (value: number) => void;
  onSelectionChange: (ids: string[]) => void;
}

export default function OverlaySection({
  clubs,
  totalOverlay,
  selectedClubIds,
  onOverlayChange,
  onSelectionChange,
}: OverlaySectionProps) {
  const [inputValue, setInputValue] = useState('');
  const [locked, setLocked] = useState(false);
  const selectedCount = selectedClubIds.length;
  const perClub = selectedCount > 0 ? totalOverlay / selectedCount : 0;

  function handleConfirm() {
    const cleaned = inputValue.replace(',', '.');
    const n = parseFloat(cleaned);
    onOverlayChange(isNaN(n) ? 0 : n);
    setLocked(true);
  }

  function handleUnlock() {
    setLocked(false);
  }

  function handleToggle(clubId: string) {
    if (locked) return;
    if (selectedClubIds.includes(clubId)) {
      onSelectionChange(selectedClubIds.filter((id) => id !== clubId));
    } else {
      onSelectionChange([...selectedClubIds, clubId]);
    }
  }

  return (
    <div className="card px-4 py-3 space-y-2">
      {/* Header: titulo + input compacto a direita */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-widest">
            <span>{'\u{1F30D}'}</span> Overlay Global
          </h2>
          <p className="text-[10px] text-dark-500 mt-0.5">
            Valor total dividido entre os clubes selecionados abaixo
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 bg-dark-800 border rounded-lg px-3 py-1.5 ${
            locked ? 'border-dark-600 opacity-60' : 'border-dark-700'
          }`}>
            <span className="text-dark-500 font-mono text-[11px]">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={locked ? String(totalOverlay || '') : inputValue}
              onChange={(e) => { if (!locked) setInputValue(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !locked) handleConfirm(); }}
              placeholder="0,00"
              readOnly={locked}
              className={`bg-transparent font-mono text-base font-bold outline-none w-24 text-right placeholder:text-dark-600 ${
                locked ? 'cursor-not-allowed' : ''
              } ${totalOverlay !== 0 ? 'text-danger-500' : 'text-dark-100'}`}
            />
          </div>
          {locked ? (
            <button
              type="button"
              onClick={handleUnlock}
              className="w-8 h-8 rounded-lg bg-dark-800 border border-dark-700 flex items-center justify-center text-dark-400 hover:border-dark-500 hover:text-dark-100 transition-all shrink-0"
              title="Editar"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 flex items-center justify-center text-white transition-all shadow-lg shadow-blue-500/20 shrink-0"
              title="Confirmar"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Label */}
      <p className="text-[10px] font-semibold text-dark-500 uppercase tracking-widest">
        Aplicar a:
      </p>

      {/* Clubes em linha */}
      <div className="flex flex-wrap gap-2">
        {clubs.map((club) => {
          const isSelected = selectedClubIds.includes(club.id);
          const clubValue = isSelected ? perClub : 0;
          return (
            <button
              type="button"
              key={club.id}
              onClick={() => handleToggle(club.id)}
              disabled={locked}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all flex-1 min-w-0 ${
                locked ? 'cursor-not-allowed' : ''
              } ${
                isSelected
                  ? 'border-dark-600 bg-dark-800/50'
                  : 'border-dark-700 bg-dark-900 hover:border-dark-600 opacity-40'
              }`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] ${
                isSelected
                  ? locked ? 'bg-dark-500 border-dark-500 text-white' : 'bg-poker-500 border-poker-500 text-white'
                  : 'border-dark-600 bg-dark-800'
              }`}>
                {isSelected && '\u2713'}
              </span>
              <ClubLogo name={club.name} logoUrl={club.logoUrl} size="sm" />
              <span className="text-xs font-bold text-dark-200 uppercase tracking-wide whitespace-nowrap">
                {club.name}
              </span>
              <span
                className={`ml-auto font-mono text-xs whitespace-nowrap ${
                  clubValue < 0 ? 'text-danger-500' : clubValue > 0 ? 'text-poker-500' : 'text-dark-500'
                }`}
              >
                {formatCurrency(clubValue)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {selectedCount > 0 && (
        <p className="text-center text-[11px] text-dark-500 font-mono">
          {formatCurrency(totalOverlay)}
          <span className="text-dark-600"> {'\u00F7'} </span>
          {selectedCount} clube{selectedCount > 1 ? 's' : ''}
          <span className="text-dark-600"> : </span>
          <span className="font-bold text-dark-200">
            {formatCurrency(perClub)} por clube
          </span>
        </p>
      )}
    </div>
  );
}
