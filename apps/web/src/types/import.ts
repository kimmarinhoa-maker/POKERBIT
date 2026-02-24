// ══════════════════════════════════════════════════════════════════════
//  Tipos compartilhados do Import Wizard
// ══════════════════════════════════════════════════════════════════════

export type WizardStep = 'upload' | 'preview' | 'pendencies' | 'confirm';

export interface PreviewData {
  week: {
    week_start: string;
    week_end: string;
    detected_from: string;
    confidence: string;
  };
  summary: {
    total_players: number;
    total_agents: number;
    total_subclubs: number;
    total_winnings_brl: number;
    total_rake_brl: number;
    total_ggr_brl: number;
  };
  readiness: {
    ready: boolean;
    blockers_count: number;
  };
  blockers: {
    unknown_agencies: Array<{
      agent_name: string;
      agent_id: string;
      detected_prefix: string | null;
      players_count: number;
      sample_players: Array<{ player_id: string; player_name: string }>;
    }>;
    players_without_agency: Array<{
      player_id: string;
      player_name: string;
      original_agent: string;
    }>;
  };
  subclubs_found: Array<{
    subclub_name: string;
    players_count: number;
    agents_count: number;
    rake_brl: number;
  }>;
  available_subclubs: Array<{ id: string; name: string }>;
  duplicate_players: Array<{
    id: string;
    nick: string;
    count: number;
    merged_ganhos: number;
    merged_rake: number;
  }>;
  available_agents: Array<{
    agent_name: string;
    agent_id: string;
    subclub_name: string;
  }>;
  warnings: string[];
  // Phase 1: players list
  players?: PreviewPlayer[];
  // Phase 2: existing settlement info
  existing_settlement?: ExistingSettlement;
}

export interface PreviewPlayer {
  id: string;
  nick: string;
  aname: string;
  clube: string;
  ganhos: number;
  rake: number;
  ggr: number;
  _status: 'ok' | 'auto_resolved' | 'unknown_subclub' | 'missing_agency';
}

export interface ExistingSettlement {
  id: string;
  version: number;
  status: string;
  mode: 'reimport' | 'merge';
  summary: {
    total_players: number;
    total_agents: number;
    total_rake_brl: number;
    total_ggr_brl: number;
  };
  agents: string[];
}

export interface PlayerSelection {
  subclubId: string;
  mode: 'agent' | 'direct' | 'new_agent';
  agentName?: string;
  agentId?: string;
  newAgentName?: string;
}

// ─── Dynamic Club Colors (hash-based palette) ──────────────────────

const COLOR_PALETTE = [
  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/40' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40' },
  { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/40' },
  { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/40' },
  { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/40' },
  { bg: 'bg-pink-500/20',   text: 'text-pink-400',   border: 'border-pink-500/40' },
  { bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/40' },
];

const UNKNOWN_STYLE = 'bg-orange-500/20 text-orange-400 border-orange-500/40';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getClubStyle(name: string): string {
  if (!name || name === '?') return UNKNOWN_STYLE;
  const idx = hashString(name.toUpperCase()) % COLOR_PALETTE.length;
  const c = COLOR_PALETTE[idx];
  return `${c.bg} ${c.text} ${c.border}`;
}

export function getClubIcon(name: string): string {
  if (!name || name === '?') return '\u2753';
  return '\u{1F3E0}';
}
