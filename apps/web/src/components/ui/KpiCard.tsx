'use client';

interface KpiCardProps {
  label: string;
  value: string | number;
  accentColor?: string;
  valueColor?: string;
  subtitle?: string;
  ring?: string;
  /** Formula tooltip — shows on hover over value to explain the calculation */
  tooltip?: string;
  /** Hide this card when value is zero or "R$ 0,00" */
  hideIfZero?: boolean;
}

export default function KpiCard({
  label,
  value,
  accentColor,
  valueColor,
  subtitle,
  ring,
  tooltip,
  hideIfZero,
}: KpiCardProps) {
  if (hideIfZero) {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (numVal === 0 || isNaN(numVal)) return null;
  }
  return (
    <div
      className={`bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-200 hover:border-dark-600 cursor-default ${ring || ''}`}
    >
      <div className={`h-0.5 ${accentColor || 'bg-dark-700'}`} />
      <div className="p-4">
        <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-0.5">
          {label}
        </p>
        {subtitle && <p className="text-[10px] text-dark-600 uppercase tracking-wider">{subtitle}</p>}
        <p
          className={`text-xl font-bold mt-2 font-mono ${valueColor || 'text-white'} ${tooltip ? 'explainable inline-block' : ''}`}
          title={tooltip}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
