// ══════════════════════════════════════════════════════════════════════
//  Modality Constants — Cores, labels e helpers para modalidades de jogo
// ══════════════════════════════════════════════════════════════════════

export const MODALITY_COLORS: Record<string, string> = {
  plo5: '#8B5CF6',
  plo6: '#EC4899',
  nlh: '#10B981',
  plo4: '#F59E0B',
  mtt: '#3B82F6',
  sng: '#6366F1',
  ofc: '#14B8A6',
  spin: '#F97316',
  mixgame: '#78716C',
};

export const MODALITY_LABELS: Record<string, string> = {
  nlh: 'NLH',
  plo4: 'PLO4',
  plo5: 'PLO5',
  plo6: 'PLO6',
  mtt: 'MTT',
  sng: 'SNG',
  ofc: 'OFC',
  spin: 'Spin',
  mixgame: 'Mix Game',
};

export const CASH_MODALITIES = ['nlh', 'plo4', 'plo5', 'plo6', 'mixgame', 'ofc'] as const;
export const TOURNAMENT_MODALITIES = ['mtt', 'sng', 'spin'] as const;

/** Filter entries with value > 0 and sort DESC by value */
export function filterNonZero(data: Record<string, number>): Array<{ key: string; value: number }> {
  return Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => ({ key, value }));
}

/** Get color for a modality key, with fallback */
export function getColor(mod: string): string {
  return MODALITY_COLORS[mod] || '#6B7280';
}

/** Get label for a modality key, with fallback */
export function getLabel(mod: string): string {
  return MODALITY_LABELS[mod] || mod.toUpperCase();
}
