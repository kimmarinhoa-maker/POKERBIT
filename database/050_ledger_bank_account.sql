-- ══════════════════════════════════════════════════════════════════════
--  050: Add bank_account_id to ledger_entries
--  Links payments to specific bank accounts for tracking origin/destination.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_bank_account
  ON ledger_entries(bank_account_id);

COMMENT ON COLUMN ledger_entries.bank_account_id IS
  'Bank account used for this payment (PIX, TED). Nullable for ChipPix/Cash entries.';
