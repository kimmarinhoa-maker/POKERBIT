'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { filterNonZero, getColor, getLabel } from './modalityColors';

interface Props {
  handsByModality: Record<string, number>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-dark-300 font-medium mb-1">{d.payload.label}</p>
      <p className="text-white font-bold">{Number(d.value).toLocaleString('pt-BR')} maos</p>
    </div>
  );
}

export default function HandsVolumeChart({ handsByModality }: Props) {
  const items = filterNonZero(handsByModality);
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.value, 0);
  const chartData = items.map((i) => ({
    label: getLabel(i.key),
    value: i.value,
    color: getColor(i.key),
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
          Volume de Maos
        </h3>
        <span className="text-xs text-dark-500 font-mono">
          {total.toLocaleString('pt-BR')} total
        </span>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
