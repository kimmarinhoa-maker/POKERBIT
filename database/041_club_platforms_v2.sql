-- ══════════════════════════════════════════════════════════════════════
--  041 — Club Platforms V2 (multi-platform per subclub)
--
--  Changes:
--    1. Add subclub_id to club_platforms (link platform to specific subclub)
--    2. Replace old UNIQUE(tenant_id, platform) with new compound key
--    3. Add club_platform_id FK to settlements, imports, fee_config,
--       bank_transactions, ledger_entries, carry_forward
--    4. Create indexes for efficient lookups
-- ══════════════════════════════════════════════════════════════════════

-- 1. Add subclub_id to club_platforms
ALTER TABLE club_platforms ADD COLUMN IF NOT EXISTS subclub_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Replace UNIQUE constraint: allow multiple platforms per tenant
ALTER TABLE club_platforms DROP CONSTRAINT IF EXISTS club_platforms_tenant_id_platform_key;

ALTER TABLE club_platforms ADD CONSTRAINT club_platforms_subclub_platform_extid_key
  UNIQUE (tenant_id, subclub_id, platform, club_external_id);

-- 3a. club_platform_id on settlements
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE SET NULL;

-- 3b. club_platform_id on imports
ALTER TABLE imports ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE SET NULL;

-- 3c. club_platform_id on fee_config
ALTER TABLE fee_config ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE CASCADE;

-- 3d. club_platform_id on bank_transactions (conciliacao)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE SET NULL;

-- 3e. club_platform_id on ledger_entries (conciliacao)
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE SET NULL;

-- 3f. club_platform_id on carry_forward
ALTER TABLE carry_forward ADD COLUMN IF NOT EXISTS club_platform_id UUID REFERENCES club_platforms(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_club_platforms_subclub ON club_platforms(subclub_id);
CREATE INDEX IF NOT EXISTS idx_settlements_platform_id ON settlements(tenant_id, club_platform_id);
CREATE INDEX IF NOT EXISTS idx_imports_platform_id ON imports(tenant_id, club_platform_id);
