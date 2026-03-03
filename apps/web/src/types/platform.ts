// ══════════════════════════════════════════════════════════════════════
//  Platform Types — Multi-platform support
// ══════════════════════════════════════════════════════════════════════

export interface ClubPlatform {
  id: string;
  tenant_id: string;
  organization_id: string;
  subclub_id: string | null;
  platform: 'suprema' | 'pppoker' | 'clubgg' | string;
  club_name: string | null;
  club_external_id: string | null;
  is_primary: boolean;
  created_at: string;
  // JOIN enrichment
  subclub_name?: string;
  subclub_logo_url?: string;
}

export interface PlatformOption {
  id: string | null; // null = Suprema principal
  label: string;
  platform: string;
  subclub_id: string | null;
  club_external_id: string | null;
}

export const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  suprema: { bg: 'bg-poker-600/15', text: 'text-poker-400', border: 'border-poker-700/30' },
  pppoker: { bg: 'bg-blue-600/15', text: 'text-blue-400', border: 'border-blue-700/30' },
  clubgg: { bg: 'bg-purple-600/15', text: 'text-purple-400', border: 'border-purple-700/30' },
};

export const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

export function getPlatformColor(platform: string) {
  return PLATFORM_COLORS[platform] || PLATFORM_COLORS.suprema;
}
