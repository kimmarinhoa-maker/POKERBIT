/** Round to 2 decimal places (financial precision) */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

export function calcDelta(current: number, previous: number): { pct: string; isUp: boolean; isZero: boolean } {
  if (previous === 0) return { pct: '0.0', isUp: current > 0, isZero: current === 0 };
  const diff = current - previous;
  const pct = Math.abs((diff / Math.abs(previous)) * 100).toFixed(1);
  return { pct, isUp: diff > 0, isZero: diff === 0 };
}
