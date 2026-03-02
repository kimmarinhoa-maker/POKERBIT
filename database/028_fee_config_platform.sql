-- ══════════════════════════════════════════════════════════════════════
--  028: fee_config — Taxas separadas por plataforma (Suprema vs PPPoker)
-- ══════════════════════════════════════════════════════════════════════

-- 1) Add platform column (default 'suprema' for existing rows)
ALTER TABLE fee_config
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'suprema';

-- 2) Drop old unique constraint and recreate with platform
ALTER TABLE fee_config
DROP CONSTRAINT IF EXISTS fee_config_tenant_id_name_key;

ALTER TABLE fee_config
ADD CONSTRAINT fee_config_tenant_name_platform_key
UNIQUE (tenant_id, name, platform);

-- 3) Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_fee_config_platform
ON fee_config (tenant_id, platform, is_active);
