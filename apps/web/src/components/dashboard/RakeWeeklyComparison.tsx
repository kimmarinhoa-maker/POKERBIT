'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatBRL } from '@/lib/formatters';

interface DataPoint {
  label: string;
  cash: number;
  tournament: number;
}

interface Props {
  data: DataPoint[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, e: any) => s + (e.value || 0), 0);
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-dark-400 mb-1.5 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {formatBRL(entry.value)}
        </p>
      ))}
      <p className="text-dark-300 font-bold mt-1 pt-1 border-t border-dark-700">
        Total: {formatBRL(total)}
      </p>
    </div>
  );
}

export default function RakeWeeklyComparison({ data }: Props) {
  if (data.length < 2) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
          Rake Semanal
        </h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-dark-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Cash
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-dark-400">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Torneios
          </span>
        </div>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              width={35}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#374151', opacity: 0.3 }} />
            <Bar dataKey="cash" name="Cash" stackId="rake" fill="#10B981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="tournament" name="Torneios" stackId="rake" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
