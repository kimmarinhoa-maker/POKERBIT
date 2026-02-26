'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartDataPoint } from '@/types/dashboard';

interface Props {
  data: ChartDataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-2 text-xs font-mono">
      <p className="text-dark-400 mb-1">Semana {label}</p>
      {payload.map((p: any) => {
        const value = (p.value as number).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <p key={p.dataKey} className={p.dataKey === 'rake' ? 'text-poker-500' : 'text-dark-300'}>
            {p.dataKey === 'rake' ? 'Atual' : 'Anterior'}: R$ {value}
          </p>
        );
      })}
    </div>
  );
}

function CustomDot(props: any) {
  const { cx, cy, index, dataLength } = props;
  const isLast = index === dataLength - 1;
  return <circle cx={cx} cy={cy} r={isLast ? 7 : 4} fill={isLast ? '#22c55e' : '#15803d'} stroke="none" />;
}

export default function ComparativeLineChart({ data }: Props) {
  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-poker-500" />
          <span className="text-[11px] text-dark-400">Rake atual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-dark-500" />
          <span className="text-[11px] text-dark-400">Rake anterior</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="rakeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="rakeAnteriorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="semana" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 'auto']}
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="rakeAnterior"
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="url(#rakeAnteriorGrad)"
            dot={false}
            activeDot={{ r: 5, fill: '#64748b' }}
          />
          <Area
            type="monotone"
            dataKey="rake"
            stroke="#22c55e"
            strokeWidth={2.5}
            fill="url(#rakeGrad)"
            dot={(props: any) => <CustomDot {...props} dataLength={data.length} />}
            activeDot={{ r: 8, fill: '#22c55e' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
