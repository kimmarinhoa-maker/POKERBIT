-- ══════════════════════════════════════════════════════════════════════
--  Migration 047: Add platform + league_id columns to organizations
--  Dedicated columns (replaces metadata.platform for querying)
-- ══════════════════════════════════════════════════════════════════════

-- Coluna dedicada para plataforma (suprema, pppoker, clubgg)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS platform VARCHAR(30);

-- ID da liga/union na plataforma (ex: 106 para Suprema, 4105 para PPPoker)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS league_id VARCHAR(50);

-- Backfill: copiar metadata->>'platform' para a nova coluna
UPDATE organizations
SET platform = metadata->>'platform'
WHERE platform IS NULL
  AND metadata->>'platform' IS NOT NULL;

-- Index para busca por platform + external_id (auto-detect clube no import)
CREATE INDEX IF NOT EXISTS idx_org_platform_extid
  ON organizations(tenant_id, platform, external_id)
  WHERE type = 'CLUB' AND is_active = true;

-- Index para busca por league_id
CREATE INDEX IF NOT EXISTS idx_org_league
  ON organizations(tenant_id, league_id)
  WHERE type = 'CLUB' AND is_active = true;
