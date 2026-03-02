// ══════════════════════════════════════════════════════════════════════
//  Modality Constants — Cores, labels e helpers para modalidades de jogo
// ══════════════════════════════════════════════════════════════════════

export const MODALITY_COLORS: Record<string, string> = {
  // Cash
  nlh: '#10B981',
  plo4: '#F59E0B',
  plo5: '#8B5CF6',
  plo6: '#EC4899',
  mixgame: '#78716C',
  ofc: '#14B8A6',
  // MTT sub-modalities
  mtt_nlh: '#3B82F6',
  mtt_plo4: '#2563EB',
  mtt_plo5: '#1D4ED8',
  mtt_plo6: '#1E40AF',
  // SNG sub-modalities
  sng_nlh: '#6366F1',
  sng_plo4: '#4F46E5',
  sng_plo5: '#4338CA',
  sng_plo6: '#3730A3',
  // Spin
  spin: '#F97316',
};

export const MODALITY_LABELS: Record<string, string> = {
  nlh: 'NLH',
  plo4: 'PLO4',
  plo5: 'PLO5',
  plo6: 'PLO6',
  mixgame: 'Mix Game',
  ofc: 'OFC',
  mtt_nlh: 'MTT NLH',
  mtt_plo4: 'MTT PLO4',
  mtt_plo5: 'MTT PLO5',
  mtt_plo6: 'MTT PLO6',
  sng_nlh: 'SNG NLH',
  sng_plo4: 'SNG PLO4',
  sng_plo5: 'SNG PLO5',
  sng_plo6: 'SNG PLO6',
  spin: 'Spin',
};

export const CASH_MODALITIES = ['nlh', 'plo4', 'plo5', 'plo6', 'mixgame', 'ofc'] as const;
export const TOURNAMENT_MODALITIES = ['mtt_nlh', 'mtt_plo4', 'mtt_plo5', 'mtt_plo6', 'sng_nlh', 'sng_plo4', 'sng_plo5', 'sng_plo6', 'spin'] as const;

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
