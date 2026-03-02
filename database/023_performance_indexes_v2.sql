-- ══════════════════════════════════════════════════════════════════════
--  Migration 023: Additional Performance Indexes
--
--  Complementa migration 014 com indexes para:
--    - Organization tree building (parent_id + type)
--    - Ledger entries by source (ChipPix reconciliation)
--    - Settlements lookup by tenant + week + status
--    - Player RB rates active lookup
--
--  Todos os indexes usam IF NOT EXISTS para idempotencia.
-- ══════════════════════════════════════════════════════════════════════


-- ─── 1. Organization tree building ────────────────────────────────────
-- GET /api/organizations/tree filters by tenant_id and groups by type + parent_id.
-- Without index: sequential scan on entire organizations table.

CREATE INDEX IF NOT EXISTS idx_org_tenant_type_parent
  ON organizations(tenant_id, type, parent_id);


-- ─── 2. Ledger entries by source (ChipPix) ───────────────────────────
-- ChipPix reconciliation filters ledger_entries by source IN ('chippix', 'chippix_fee', 'chippix_ignored').
-- getLedgerSummary() and listChipPixTransactions() both need this.

CREATE INDEX IF NOT EXISTS idx_ledger_source_week
  ON ledger_entries(tenant_id, week_start, source);


-- ─── 3. Settlements by tenant + status ───────────────────────────────
-- listSettlements() filters by tenant_id + status, ordered by week_start DESC.
-- Dashboard, Liga Global, Caixa all query this on load.

CREATE INDEX IF NOT EXISTS idx_settlements_tenant_status
  ON settlements(tenant_id, status, week_start DESC);


-- ─── 4. Player RB rates active lookup ────────────────────────────────
-- Rakeback tab fetches active rates: effective_to IS NULL.

CREATE INDEX IF NOT EXISTS idx_player_rb_active
  ON player_rb_rates(tenant_id, player_id)
  WHERE effective_to IS NULL;


-- ─── 5. Agent week metrics by settlement + agent ─────────────────────
-- sync-agents and sync-rates loop over agents per settlement.

CREATE INDEX IF NOT EXISTS idx_awm_settlement_agent
  ON agent_week_metrics(settlement_id, agent_name);


-- ═══ VERIFICACAO POS-MIGRATION ═══
-- Rodar apos aplicar:
--
--   SELECT indexname, tablename
--   FROM pg_indexes
--   WHERE indexname IN (
--     'idx_org_tenant_type_parent', 'idx_ledger_source_week',
--     'idx_settlements_tenant_status', 'idx_player_rb_active',
--     'idx_awm_settlement_agent'
--   )
--   ORDER BY tablename, indexname;
--
--   -- Esperado: 5 rows
