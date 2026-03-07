-- ══════════════════════════════════════════════════════════════════════
--  018: Agent Consolidated Groups + Members
--  Permite vincular agentes de multiplas plataformas como a mesma pessoa
-- ══════════════════════════════════════════════════════════════════════

-- Grupo consolidado = uma pessoa real (ex: "Andre Takeshi")
CREATE TABLE agent_consolidated_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index com expressao (nao pode ser inline UNIQUE constraint)
CREATE UNIQUE INDEX idx_acg_tenant_name ON agent_consolidated_groups(tenant_id, LOWER(TRIM(name)));

-- Membro = uma org AGENT de uma plataforma
CREATE TABLE agent_consolidated_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES agent_consolidated_groups(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, organization_id)
);

-- RLS
ALTER TABLE agent_consolidated_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_consolidated_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_iso_groups" ON agent_consolidated_groups
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY "tenant_iso_members" ON agent_consolidated_members
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acg_tenant ON agent_consolidated_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acm_group ON agent_consolidated_members(group_id);
CREATE INDEX IF NOT EXISTS idx_acm_org ON agent_consolidated_members(organization_id);
