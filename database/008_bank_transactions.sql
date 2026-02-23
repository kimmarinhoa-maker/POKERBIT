-- ══════════════════════════════════════════════════════════════════════
--  008: Bank Transactions — Staging table for OFX/ChipPix imports
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id   UUID REFERENCES bank_accounts(id),
  source            TEXT NOT NULL DEFAULT 'ofx',          -- 'ofx' | 'chippix'
  fitid             TEXT NOT NULL,                        -- OFX unique transaction ID
  tx_date           DATE NOT NULL,
  amount            NUMERIC(18,6) NOT NULL,
  memo              TEXT,
  bank_name         TEXT,
  dir               TEXT NOT NULL DEFAULT 'in',           -- 'in' | 'out'
  status            TEXT NOT NULL DEFAULT 'pending',      -- pending | linked | applied | ignored
  category          TEXT,
  entity_id         TEXT,                                 -- entity vinculada (agent_id etc)
  entity_name       TEXT,
  week_start        DATE,                                 -- semana do settlement
  applied_ledger_id UUID REFERENCES ledger_entries(id),   -- referencia ao ledger criado
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, fitid)
);

CREATE INDEX IF NOT EXISTS idx_banktx_tenant_week ON bank_transactions(tenant_id, week_start);
CREATE INDEX IF NOT EXISTS idx_banktx_status ON bank_transactions(tenant_id, status);

-- RLS
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_transactions
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));
