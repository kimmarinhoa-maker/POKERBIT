// ══════════════════════════════════════════════════════════════════════
//  normName — Normalização canônica de nomes
// ══════════════════════════════════════════════════════════════════════

export function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
