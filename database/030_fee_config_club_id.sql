-- ══════════════════════════════════════════════════════════════════════
--  Migration 030: fee_config.platform → club_id
--
--  Refactors fee_config to scope fees per CLUB organization instead of
--  per platform string. This allows multiple clubs of the same platform
--  (e.g., two PPPoker clubs) to have independent fee configurations.
--
--  The platform info is now stored in organizations.metadata.platform
--  and is used only to determine which parser to use on import.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Add club_id column (nullable initially for backfill)
ALTER TABLE fee_config
ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES organizations(id);

-- 2. Backfill: map existing platform values to actual CLUB org IDs
--    Run this manually after migration if you have existing data:
--
--    UPDATE fee_config fc
--    SET club_id = (
--      SELECT o.id FROM organizations o
--      WHERE o.tenant_id = fc.tenant_id
--        AND o.type = 'CLUB'
--        AND o.metadata->>'platform' = fc.platform
--      LIMIT 1
--    )
--    WHERE fc.club_id IS NULL;
--
--    Or set platform metadata on clubs first:
--    UPDATE organizations SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{platform}', '"suprema"')
--      WHERE type = 'CLUB' AND name ILIKE '%suprema%';
--    UPDATE organizations SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{platform}', '"pppoker"')
--      WHERE type = 'CLUB' AND name ILIKE '%pppoker%';

-- 3. Drop old constraint and create new one
ALTER TABLE fee_config
DROP CONSTRAINT IF EXISTS fee_config_tenant_name_platform_key;

ALTER TABLE fee_config
ADD CONSTRAINT fee_config_tenant_club_name_key
UNIQUE (tenant_id, club_id, name);

-- 4. Drop old platform column
ALTER TABLE fee_config
DROP COLUMN IF EXISTS platform;

-- 5. Index for fast lookups
DROP INDEX IF EXISTS idx_fee_config_platform;
CREATE INDEX IF NOT EXISTS idx_fee_config_club_id
ON fee_config (tenant_id, club_id, is_active);
