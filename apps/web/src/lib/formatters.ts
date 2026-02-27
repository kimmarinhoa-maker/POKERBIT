/** Round to 2 decimal places (financial precision) */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Format a number as BRL currency using Intl (R$ 1.234,56) */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Format ISO datetime string as dd/mm HH:mm (pt-BR) */
export function fmtDateTime(dt: string): string {
  return new Date(dt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
