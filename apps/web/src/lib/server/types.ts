// ══════════════════════════════════════════════════════════════════════
//  Tipos compartilhados do Poker Manager SaaS
// ══════════════════════════════════════════════════════════════════════

export type OrgType = 'CLUB' | 'SUBCLUB' | 'AGENT';
export type SettlementStatus = 'DRAFT' | 'FINAL' | 'VOID';
export type ImportStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
export type UserRole = 'OWNER' | 'ADMIN' | 'FINANCEIRO' | 'AUDITOR' | 'AGENTE';
export type MovementDir = 'IN' | 'OUT';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Organization {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  type: OrgType;
  name: string;
  external_id: string | null;
  is_active: boolean;
}

export interface Player {
  id: string;
  tenant_id: string;
  external_id: string;
  nickname: string;
  full_name: string | null;
  is_active: boolean;
}

export interface Import {
  id: string;
  tenant_id: string;
  club_id: string;
  week_start: string;
  file_name: string;
  file_path: string | null;
  file_hash: string;
  status: ImportStatus;
  row_count: number | null;
  player_count: number | null;
  error_message: string | null;
  processed_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Settlement {
  id: string;
  tenant_id: string;
  club_id: string;
  week_start: string;
  version: number;
  status: SettlementStatus;
  import_id: string | null;
  inputs_hash: string | null;
  rules_hash: string | null;
  notes: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface PlayerWeekMetrics {
  id: string;
  settlement_id: string;
  tenant_id: string;
  player_id: string;
  agent_id: string | null;
  external_player_id: string | null;
  nickname: string | null;
  external_agent_id: string | null;
  agent_name: string | null;
  winnings_brl: number;
  rake_total_brl: number;
  net_profit_brl: number;
  ggr_brl: number;
  rb_rate: number;
  rb_value_brl: number;
  resultado_brl: number;
  games: number;
  hands: number;
  rake_breakdown: Record<string, number>;
}

export interface AgentWeekMetrics {
  id: string;
  settlement_id: string;
  tenant_id: string;
  agent_id: string;
  agent_name: string;
  player_count: number;
  rake_total_brl: number;
  ganhos_total_brl: number;
  ggr_total_brl: number;
  rb_rate: number;
  commission_brl: number;
  resultado_brl: number;
}

export interface LedgerEntry {
  id: string;
  tenant_id: string;
  settlement_id: string | null;
  entity_id: string;
  entity_name: string | null;
  week_start: string;
  dir: MovementDir;
  amount: number;
  method: string | null;
  description: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
}

export interface UploadImportDTO {
  club_id: string;
  week_start: string;
}

export interface CreateSettlementDTO {
  club_id: string;
  week_start: string;
  import_id: string;
  notes?: string;
}

export interface CreateLedgerEntryDTO {
  entity_id: string;
  entity_name?: string;
  week_start: string;
  dir: MovementDir;
  amount: number;
  method?: string;
  description?: string;
}

export interface WeekQuery {
  club_id?: string;
  week_start: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, any>;
}

export interface ImportProcessResult {
  import_id: string;
  settlement_id: string;
  status: 'ok' | 'partial' | 'error';
  player_count: number;
  agent_count: number;
  club_count: number;
  unlinked_count: number;
  warnings: string[];
  blockers: string[];
}

export interface CarryForward {
  id: string;
  tenant_id: string;
  club_id: string;
  entity_id: string;
  week_start: string;
  amount: number;
  source_settlement_id: string | null;
  created_at: string;
}

export interface CarryForwardResult {
  entity_id: string;
  agent_name: string;
  saldo_anterior: number;
  resultado: number;
  ledger_net: number;
  saldo_final: number;
}

export interface CloseWeekResponse {
  count: number;
  week_closed: string;
  next_week: string;
  carries: CarryForwardResult[];
}

export interface PaymentMethod {
  id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface BankAccount {
  id: string;
  tenant_id: string;
  name: string;
  bank_code: string | null;
  agency: string | null;
  account_nr: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}
