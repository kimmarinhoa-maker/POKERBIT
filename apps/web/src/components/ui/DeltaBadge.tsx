'use client';

import { formatBRL } from '@/lib/formatters';

interface Props {
  current: number;
  previous: number;
  format?: 'brl' | 'number' | 'percent';
}

export default function DeltaBadge({ current, previous, format = 'brl' }: Props) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = ((diff / Math.abs(previous)) * 100).toFixed(0);
  const isPositive = diff >= 0;

  let formattedDiff: string;
  if (format === 'brl') formattedDiff = formatBRL(Math.abs(diff));
  else if (format === 'percent') formattedDiff = `${Math.abs(Number(pct))}%`;
  else formattedDiff = String(Math.abs(diff));

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
        isPositive
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
      title={`Diferenca vs semana anterior: ${isPositive ? '+' : '-'}${formattedDiff} (${isPositive ? '+' : ''}${pct}%)`}
    >
      {isPositive ? '\u25B2' : '\u25BC'} {pct}%
    </span>
  );
}
