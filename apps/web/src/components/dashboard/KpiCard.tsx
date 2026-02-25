'use client';

import { formatCurrency } from '@/lib/formatters';

interface BreakdownItem {
  label: string;
  value: string;
  rawValue?: number;
}

interface KpiCardProps {
  label: string;
  subtitle?: string;
  value: string;
  accent: 'green' | 'blue' | 'red' | 'yellow' | 'purple';
  delta?: { pct: string; isUp: boolean; isZero: boolean; invert?: boolean };
  breakdown?: BreakdownItem[];
}

const ACCENT_BAR: Record<string, string> = {
  green: 'bg-poker-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-warning-500',
  purple: 'bg-purple-500',
};

const ACCENT_VALUE: Record<string, string> = {
  green: 'text-poker-500',
  blue: 'text-blue-400',
  red: 'text-red-400',
  yellow: 'text-dark-100',
  purple: 'text-purple-400',
};

const ACCENT_GLOW: Record<string, string> = {
  green: 'hover:shadow-glow-green',
  blue: 'hover:shadow-glow-blue',
  red: 'hover:shadow-glow-red',
  yellow: 'hover:shadow-glow-amber',
  purple: 'hover:shadow-glow-purple',
};

export default function KpiCard({ label, subtitle, value, accent, delta, breakdown }: KpiCardProps) {
  const filteredBreakdown = breakdown?.filter((item) => (item.rawValue !== undefined ? item.rawValue !== 0 : true));

  return (
    <div
      className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px hover:border-dark-600 transition-all duration-200 cursor-pointer ${ACCENT_GLOW[accent]}`}
    >
      {/* Accent bar */}
      <div className={`h-[2px] ${ACCENT_BAR[accent]}`} />

      <div className="p-5">
        {/* Label */}
        <p className="text-xs font-semibold text-dark-400 uppercase tracking-widest mb-0.5">{label}</p>
        {subtitle && <p className="text-[10px] text-dark-500 mb-1.5">{subtitle}</p>}
        {!subtitle && <div className="mb-1.5" />}

        {/* Value */}
        <p className={`font-mono text-2xl font-semibold ${ACCENT_VALUE[accent]}`}>{value}</p>

        {/* Delta badge */}
        {delta && !delta.isZero && (
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                delta.isUp ? 'bg-poker-900 text-poker-500' : 'bg-red-900/50 text-red-400'
              }`}
            >
              {delta.isUp ? '▲' : '▼'} {delta.pct}% vs sem. anterior
            </span>
          </div>
        )}
        {delta && delta.isZero && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-dark-800 text-dark-400">
              — sem variacao
            </span>
          </div>
        )}

        {/* Breakdown */}
        {filteredBreakdown && filteredBreakdown.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-800 space-y-1.5">
            {filteredBreakdown.map((item) => {
              const raw = item.rawValue;
              const colorClass =
                raw !== undefined
                  ? raw < 0
                    ? 'text-danger-500'
                    : raw > 0
                      ? 'text-poker-500'
                      : 'text-dark-400'
                  : item.value.startsWith('-')
                    ? 'text-red-400'
                    : 'text-dark-100';

              return (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">{item.label}</span>
                  <span className={`font-mono text-xs ${colorClass}`}>
                    {raw !== undefined ? formatCurrency(raw) : item.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
