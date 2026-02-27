-- ══════════════════════════════════════════════════════════════════════
--  Migration 018 — Role Permissions
--  Tabela para controle de permissoes por funcao (configuravel via UI)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  resource    TEXT NOT NULL,
  allowed     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_perm_tenant_role ON role_permissions(tenant_id, role);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON role_permissions
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));
