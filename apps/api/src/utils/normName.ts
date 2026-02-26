// ══════════════════════════════════════════════════════════════════════
//  normName — Normalização canônica de nomes
//
//  Lowercase + remove acentos (NFD → strip combining marks).
//  Usado para matching robusto de nomes de agentes/subclubes.
// ══════════════════════════════════════════════════════════════════════

export function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
