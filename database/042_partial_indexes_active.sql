-- ══════════════════════════════════════════════════════════════════════
--  Migration 040 — Partial indexes for common filtered queries
-- ══════════════════════════════════════════════════════════════════════

-- Organizations: most queries filter by is_active=true
CREATE INDEX IF NOT EXISTS idx_orgs_tenant_active
  ON organizations (tenant_id, type)
  WHERE is_active = true;

-- Settlements: DRAFT settlements are queried most often (active work)
CREATE INDEX IF NOT EXISTS idx_settlements_tenant_draft
  ON settlements (tenant_id, week_start DESC)
  WHERE status = 'DRAFT';

-- Ledger: un-reconciled entries are the main focus during settlement
CREATE INDEX IF NOT EXISTS idx_ledger_unreconciled
  ON ledger_entries (tenant_id, week_start)
  WHERE is_reconciled = false;

-- Audit log: recent entries (last 30 days) are queried for review
CREATE INDEX IF NOT EXISTS idx_audit_recent
  ON audit_log (tenant_id, created_at DESC);
