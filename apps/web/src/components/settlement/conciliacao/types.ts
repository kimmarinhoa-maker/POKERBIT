// ─── Shared Types for Conciliacao sub-tabs ──────────────────────────

export interface LedgerEntry {
  id: string;
  entity_id: string;
  entity_name: string | null;
  dir: 'IN' | 'OUT';
  amount: number;
  method: string | null;
  description: string | null;
  external_ref: string | null;
  is_reconciled: boolean;
  created_at: string;
}

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
