-- ══════════════════════════════════════════════════════════════════════
--  034 — ON DELETE explicito em todas FKs orfas
--  Previne FK violation ao deletar settlements, accounts, users
-- ══════════════════════════════════════════════════════════════════════

-- ─── bank_transactions ────────────────────────────────────────────────
-- bank_account_id: conta pode ser deletada, transacao fica com NULL
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_bank_account_id_fkey;
ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- applied_ledger_id: ledger deletado, desvincula da transacao
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_applied_ledger_id_fkey;
ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_applied_ledger_id_fkey
  FOREIGN KEY (applied_ledger_id) REFERENCES ledger_entries(id) ON DELETE SET NULL;

-- ─── carry_forward ────────────────────────────────────────────────────
-- source_settlement_id: settlement deletado, carry fica com NULL (historico)
ALTER TABLE carry_forward DROP CONSTRAINT IF EXISTS carry_forward_source_settlement_id_fkey;
ALTER TABLE carry_forward
  ADD CONSTRAINT carry_forward_source_settlement_id_fkey
  FOREIGN KEY (source_settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;

-- ─── ledger_entries ───────────────────────────────────────────────────
-- settlement_id: settlement deletado, entries ficam orfas (SET NULL)
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_settlement_id_fkey;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;

-- created_by: user deletado, manter entry com NULL
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_created_by_fkey;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── player_week_metrics ──────────────────────────────────────────────
-- agent_id: agente deletado, metrics perde referencia (SET NULL)
ALTER TABLE player_week_metrics DROP CONSTRAINT IF EXISTS player_week_metrics_agent_id_fkey;
ALTER TABLE player_week_metrics
  ADD CONSTRAINT player_week_metrics_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- ─── settlements ──────────────────────────────────────────────────────
-- import_id: import deletado, settlement perde ref
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_import_id_fkey;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_import_id_fkey
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE SET NULL;

-- finalized_by / voided_by: user deletado, manter historico
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_finalized_by_fkey;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_finalized_by_fkey
  FOREIGN KEY (finalized_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_voided_by_fkey;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_voided_by_fkey
  FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── audit_log ────────────────────────────────────────────────────────
-- user_id: user deletado, manter audit trail
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── rb_rates (created_by) ───────────────────────────────────────────
ALTER TABLE player_rb_rates DROP CONSTRAINT IF EXISTS player_rb_rates_created_by_fkey;
ALTER TABLE player_rb_rates
  ADD CONSTRAINT player_rb_rates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE agent_rb_rates DROP CONSTRAINT IF EXISTS agent_rb_rates_created_by_fkey;
ALTER TABLE agent_rb_rates
  ADD CONSTRAINT agent_rb_rates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── imports ──────────────────────────────────────────────────────────
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_uploaded_by_fkey;
ALTER TABLE imports
  ADD CONSTRAINT imports_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
