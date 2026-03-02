'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBRL } from '@/lib/formatters';
import { filterNonZero, getColor, getLabel } from './modalityColors';

interface Props {
  rakeByModality: Record<string, number>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-dark-300 font-medium mb-1">{d.name}</p>
      <p className="text-white font-bold">{formatBRL(d.value)}</p>
      <p className="text-dark-400">{((d.payload.pct || 0) as number).toFixed(1)}%</p>
    </div>
  );
}

export default function RakeDonutChart({ rakeByModality }: Props) {
  const items = filterNonZero(rakeByModality);
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.value, 0);
  const chartData = items.map((i) => ({
    name: getLabel(i.key),
    value: i.value,
    color: getColor(i.key),
    pct: total > 0 ? (i.value / total) * 100 : 0,
  }));

  // Insight: top modality
  const top = items[0];
  const topPct = total > 0 ? ((top.value / total) * 100).toFixed(0) : '0';

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Rake por Modalidade
      </h3>
      <div className="flex flex-col items-center">
        <div className="h-[220px] w-full max-w-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {/* Center label */}
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-dark-400 text-[10px]"
              >
                Total
              </text>
              <text
                x="50%"
                y="56%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-sm font-bold"
              >
                {formatBRL(total)}
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-dark-400 truncate">{d.name}</span>
              <span className="text-dark-300 font-mono ml-auto">{d.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>

        {/* Insight */}
        <p className="text-[11px] text-dark-500 mt-3 text-center">
          {getLabel(top.key)} domina com {topPct}% do rake total
        </p>
      </div>
    </div>
  );
}
