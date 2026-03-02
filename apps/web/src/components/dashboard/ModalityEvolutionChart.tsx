'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { formatBRL } from '@/lib/formatters';
import { getColor, getLabel, MODALITY_COLORS } from './modalityColors';

interface Props {
  data: Array<Record<string, unknown>>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="text-dark-400 mb-1.5 font-medium">{label}</p>
      {payload
        .filter((e: any) => e.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((entry: any) => (
          <p key={entry.dataKey} className="flex items-center gap-2" style={{ color: entry.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {getLabel(entry.dataKey)}: {formatBRL(entry.value)}
          </p>
        ))}
    </div>
  );
}

export default function ModalityEvolutionChart({ data }: Props) {
  if (data.length < 2) return null;

  // Detect which modalities have data in at least 1 week
  const activeModalities = Object.keys(MODALITY_COLORS).filter((mod) =>
    data.some((week) => {
      const val = week[mod];
      return typeof val === 'number' && val > 0;
    }),
  );

  if (activeModalities.length === 0) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">
        Evolucao por Modalidade
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            {activeModalities.map((mod) => (
              <Line
                key={mod}
                type="monotone"
                dataKey={mod}
                name={getLabel(mod)}
                stroke={getColor(mod)}
                strokeWidth={2}
                dot={{ r: 3, fill: getColor(mod) }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {activeModalities.map((mod) => (
          <div key={mod} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getColor(mod) }} />
            <span className="text-dark-400">{getLabel(mod)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
