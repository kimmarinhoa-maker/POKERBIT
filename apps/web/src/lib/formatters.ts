/** Round to 2 decimal places (financial precision) — usa Math.abs para negativos */
export function round2(v: number): number {
  return Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

/** Cached Intl formatter for BRL (avoid recreating on every call) */
const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Format a number as BRL currency using Intl (R$ 1.234,56) */
export function formatBRL(value: number): string {
  return brlFormatter.format(value);
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

/** Normalize a string for map keys: lowercase + strip accents (e.g. "Império" → "imperio") */
export function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Build a logo map from org tree data (clubs + subclubes) keyed by normalizeKey(name) */
export function buildLogoMap(
  treeData: Array<{ name: string; logo_url?: string | null; metadata?: Record<string, any>; subclubes?: Array<{ name: string; logo_url?: string | null; metadata?: Record<string, any> }> }>,
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const club of treeData) {
    map[normalizeKey(club.name)] = club.logo_url || club.metadata?.logo_url || null;
    for (const sub of club.subclubes || []) {
      map[normalizeKey(sub.name)] = sub.logo_url || sub.metadata?.logo_url || null;
    }
  }
  return map;
}
