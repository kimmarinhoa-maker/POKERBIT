// ══════════════════════════════════════════════════════════════════════
//  round2 — REGRA DE OURO para valores monetários
//
//  Aplica Math.round com epsilon para evitar floating point errors.
//  DEVE ser aplicado antes de TODA persistência de valor monetário.
// ══════════════════════════════════════════════════════════════════════

export function round2(v: number): number {
  // Usa abs + sign para tratar negativos corretamente (EPSILON só funciona com positivos)
  return Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}
