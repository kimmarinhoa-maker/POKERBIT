-- ══════════════════════════════════════════════════════════════════════
--  032 — Club Platforms (multi-platform support)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS club_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  club_name VARCHAR(100),
  club_external_id VARCHAR(50),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, platform)
);

-- Index for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_club_platforms_tenant
  ON club_platforms(tenant_id);

-- RLS
ALTER TABLE club_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_platforms_tenant_isolation ON club_platforms
  USING (tenant_id IN (
    SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
  ));
