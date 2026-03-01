'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface Pendencia {
  label: string;
  count: number;
  href: string;
}

interface Props {
  items: Pendencia[];
}

export default function PendenciasCard({ items }: Props) {
  const active = items.filter((i) => i.count > 0);
  if (active.length === 0) return null;

  return (
    <div className="card border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-400">Pendencias</h3>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {active.length}
        </span>
      </div>
      <div className="space-y-2">
        {active.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-dark-800/50 transition-colors group"
          >
            <span className="text-sm text-dark-300 group-hover:text-white transition-colors">{item.label}</span>
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {item.count}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
