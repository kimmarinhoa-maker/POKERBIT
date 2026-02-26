'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartDataPoint } from '@/types/dashboard';

interface Props {
  data: ChartDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-2 text-xs font-mono">
      <p className="text-dark-400 mb-1">Semana {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className={p.dataKey === 'atual' ? 'text-poker-500' : 'text-dark-300'}>
          {p.dataKey === 'atual' ? 'Atual' : 'Anterior'}: {p.value} jogadores
        </p>
      ))}
    </div>
  );
}

export default function ComparativeBarChart({ data }: Props) {
  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-poker-500" />
          <span className="text-[11px] text-dark-400">Semana atual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-dark-600" />
          <span className="text-[11px] text-dark-400">Semana anterior</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="20%" margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="barGradAtual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#15803d" />
            </linearGradient>
            <linearGradient id="barGradAnterior" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="semana" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 'auto']} tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="anterior" fill="url(#barGradAnterior)" radius={[4, 4, 0, 0]} barSize={14} />
          <Bar dataKey="atual" fill="url(#barGradAtual)" radius={[4, 4, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
