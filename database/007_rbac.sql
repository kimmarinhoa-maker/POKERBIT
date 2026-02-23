-- ══════════════════════════════════════════════════════════════════════
--  007 — RBAC: Tabela de acesso por organização (subclube)
--
--  Mapeia quais organizações (subclubes) cada usuário pode acessar.
--  OWNER/ADMIN têm acesso implícito total (não precisam de registros).
--  Apenas AGENTE/FINANCEIRO/AUDITOR com escopo limitado terão registros.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_org_access (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id, org_id)
);

-- Index para queries frequentes (middleware busca por user + tenant)
CREATE INDEX IF NOT EXISTS idx_user_org_access_user_tenant
  ON user_org_access(user_id, tenant_id);

-- RLS
ALTER TABLE user_org_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_org_access
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));
