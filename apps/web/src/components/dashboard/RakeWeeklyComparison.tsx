'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
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
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-dark-400 mb-1.5 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {formatBRL(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function RakeWeeklyComparison({ data }: Props) {
  if (data.length < 2) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
          Cash vs Torneios — Evolucao Semanal
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
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorTournament" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="cash"
              name="Cash"
              stroke="#10B981"
              fill="url(#colorCash)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="tournament"
              name="Torneios"
              stroke="#3B82F6"
              fill="url(#colorTournament)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
