'use client';

import Link from 'next/link';
import { FileWarning } from 'lucide-react';

interface Props {
  settlementId: string;
  weekLabel: string;
}

export default function DraftBanner({ settlementId, weekLabel }: Props) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <FileWarning className="w-5 h-5 text-yellow-400 shrink-0" />
        <div>
          <p className="text-sm text-yellow-300 font-medium">Fechamento em rascunho</p>
          <p className="text-xs text-dark-400">Semana {weekLabel} ainda nao foi finalizada.</p>
        </div>
      </div>
      <Link
        href={`/s/${settlementId}`}
        className="text-xs font-medium text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 px-3 py-1.5 rounded-lg hover:bg-yellow-500/20 transition-colors whitespace-nowrap"
      >
        Finalizar
      </Link>
    </div>
  );
}
