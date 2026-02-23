// ══════════════════════════════════════════════════════════════════════
//  round2 — REGRA DE OURO para valores monetários
//
//  Aplica Math.round com epsilon para evitar floating point errors.
//  DEVE ser aplicado antes de TODA persistência de valor monetário.
// ══════════════════════════════════════════════════════════════════════

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
