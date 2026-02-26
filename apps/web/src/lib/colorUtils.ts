// ══════════════════════════════════════════════════════════════════════
//  Color Utilities — Funcoes de cor para valores financeiros
//  Centralizado para evitar duplicacao nos componentes de settlement
// ══════════════════════════════════════════════════════════════════════

/** Cor condicional: verde (positivo), vermelho (negativo), cinza (zero) */
export function valueColor(v: number, pos = 'text-emerald-400', neg = 'text-red-400', zero = 'text-dark-400'): string {
  if (v > 0.005) return pos;
  if (v < -0.005) return neg;
  return zero;
}

/** Cor de GGR: vermelho (negativo/perda), amarelo (positivo/lucro), cinza (zero) */
export function ggrColor(v: number): string {
  if (v < -0.005) return 'text-red-400';
  if (v > 0.005) return 'text-amber-400';
  return 'text-dark-400';
}

/** Alias curto — compativel com o antigo `cc()` */
export function cc(val: number, pos = 'text-emerald-400', neg = 'text-red-400'): string {
  return valueColor(val, pos, neg);
}
