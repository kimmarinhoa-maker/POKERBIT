// ─── Shared Types for Conciliacao sub-tabs ──────────────────────────

// Re-export LedgerEntry from shared types (single source of truth)
export type { LedgerEntry } from '@/types/settlement';

export interface AgentOption {
  agent_id: string | null;
  agent_name: string;
}

export interface PlayerOption {
  external_player_id: string | null;
  nickname: string | null;
}

export interface BankTx {
  id: string;
  fitid: string;
  tx_date: string;
  amount: number;
  memo: string | null;
  bank_name: string | null;
  dir: string;
  status: string;
  entity_id: string | null;
  entity_name: string | null;
  category: string | null;
}

export type FilterMode = 'all' | 'reconciled' | 'pending';
