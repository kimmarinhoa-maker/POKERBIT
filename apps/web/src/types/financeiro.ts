// ══════════════════════════════════════════════════════════════════════
//  Types: Financeiro — Agent Consolidated Groups
// ══════════════════════════════════════════════════════════════════════

export interface AgentGroupMember {
  id: string;
  organization_id: string;
  org_name: string;
  platform: string;
  club_name: string;
}

export interface AgentGroup {
  id: string;
  name: string;
  phone: string | null;
  members: AgentGroupMember[];
}

export interface AgentPlatformPlayer {
  nickname: string;
  external_player_id: string;
  winnings_brl: number;
}

export interface AgentPlatformResult {
  platform: string;
  club_name: string;
  settlement_id: string;
  agent_name: string;
  winnings: number;
  rake: number;
  rb_rate: number;
  rb_value: number;
  resultado: number;
  players: AgentPlatformPlayer[];
}

export interface AgentConsolidatedSettlement {
  group: AgentGroup;
  weekStart: string;
  weekEnd: string;
  platforms: AgentPlatformResult[];
  total: {
    winnings: number;
    rake: number;
    rb_value: number;
    resultado: number;
  };
}
