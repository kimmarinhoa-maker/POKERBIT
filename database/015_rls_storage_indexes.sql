-- ═══════════════════════════════════════════════════════════════════
-- Migration 015: RLS policies, storage fix, additional indexes
-- ═══════════════════════════════════════════════════════════════════
-- Fixes:
--   1. Missing RLS on fee_config, club_adjustments, agent_manual_links, player_links
--   2. Club-logos storage policy restricted to tenant-scoped paths
--   3. Additional composite indexes for common query patterns
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. RLS: fee_config ─────────────────────────────────────────

ALTER TABLE fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fee_config;
CREATE POLICY tenant_isolation ON fee_config
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ─── 2. RLS: club_adjustments ───────────────────────────────────

ALTER TABLE club_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON club_adjustments;
CREATE POLICY tenant_isolation ON club_adjustments
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ─── 3. RLS: agent_manual_links ─────────────────────────────────

ALTER TABLE agent_manual_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON agent_manual_links;
CREATE POLICY tenant_isolation ON agent_manual_links
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ─── 4. RLS: player_links ──────────────────────────────────────

ALTER TABLE player_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON player_links;
CREATE POLICY tenant_isolation ON player_links
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ─── 5. Club-logos storage: restrict to authenticated user's path ─

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated upload club-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete club-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update club-logos" ON storage.objects;

-- Re-create with tenant-scoped path restriction
-- Files must be stored under: club-logos/<user_id>/filename
CREATE POLICY "Tenant-scoped upload club-logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tenant-scoped delete club-logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Tenant-scoped update club-logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read stays (logos are public)
-- "Public read club-logos" policy remains unchanged

-- ─── 6. Additional composite indexes ────────────────────────────

-- ChipPix dedup check: ledger_entries by source + external_ref
CREATE INDEX IF NOT EXISTS idx_ledger_source_ref
  ON ledger_entries (tenant_id, source, external_ref)
  WHERE external_ref IS NOT NULL;

-- ChipPix/OFX listing: ledger by source + week
CREATE INDEX IF NOT EXISTS idx_ledger_source_week
  ON ledger_entries (tenant_id, source, week_start);

-- OFX auto-match: bank_transactions by status + week
CREATE INDEX IF NOT EXISTS idx_banktx_source_status_week
  ON bank_transactions (tenant_id, source, status, week_start);

-- Rakeback rate lookup: active rates (no end date)
CREATE INDEX IF NOT EXISTS idx_prr_active_rate
  ON player_rb_rates (tenant_id, player_id, effective_from)
  WHERE effective_to IS NULL;

-- Agent RB active rate lookup
CREATE INDEX IF NOT EXISTS idx_arr_active_rate
  ON agent_rb_rates (tenant_id, agent_id, effective_from)
  WHERE effective_to IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DONE. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════
