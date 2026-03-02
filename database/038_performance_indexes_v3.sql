-- ══════════════════════════════════════════════════════════════════════
--  Migration 038 — Composite indexes + CHECK constraints
--
--  1. Composite indexes for hot query paths
--  2. CHECK constraints on TEXT enum columns (no native ENUM)
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Composite indexes ────────────────────────────────────────────

-- ledger_entries: calcEntityLedgerNet uses (tenant_id, entity_id, week_start)
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_entity_week
  ON ledger_entries (tenant_id, entity_id, week_start);

-- player_week_metrics: aggregation by (settlement_id, agent_id)
CREATE INDEX IF NOT EXISTS idx_pwm_settlement_agent
  ON player_week_metrics (settlement_id, agent_id);

-- bank_transactions: ChipPix queries use (tenant_id, week_start, status)
CREATE INDEX IF NOT EXISTS idx_banktx_tenant_week_status
  ON bank_transactions (tenant_id, week_start, status);

-- bank_transactions: matching queries use (tenant_id, matched)
CREATE INDEX IF NOT EXISTS idx_banktx_tenant_matched
  ON bank_transactions (tenant_id, matched)
  WHERE matched = false;

-- ─── 2. CHECK constraints on TEXT columns ────────────────────────────

-- bank_transactions.status
DO $$ BEGIN
  ALTER TABLE bank_transactions
    ADD CONSTRAINT chk_banktx_status
    CHECK (status IN ('pending', 'linked', 'applied', 'ignored'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bank_transactions.dir
DO $$ BEGIN
  ALTER TABLE bank_transactions
    ADD CONSTRAINT chk_banktx_dir
    CHECK (dir IN ('in', 'out'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bank_transactions.source
DO $$ BEGIN
  ALTER TABLE bank_transactions
    ADD CONSTRAINT chk_banktx_source
    CHECK (source IN ('ofx', 'chippix'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ledger_entries.source (broader set of valid values)
DO $$ BEGIN
  ALTER TABLE ledger_entries
    ADD CONSTRAINT chk_ledger_source
    CHECK (source IN ('manual', 'ofx', 'chippix', 'fechamento', 'chippix_fee', 'chippix_ignored'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
