// ══════════════════════════════════════════════════════════════════════
//  round2 — REGRA DE OURO para valores monetários
// ══════════════════════════════════════════════════════════════════════

export function round2(v: number): number {
  return Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}
