-- ══════════════════════════════════════════════════════════════════════
-- Migration 019: Additional composite indexes for performance
-- ══════════════════════════════════════════════════════════════════════

-- role_permissions: lookup por tenant+role+resource (RBAC middleware)
CREATE INDEX IF NOT EXISTS idx_role_perm_tenant_role_resource
  ON role_permissions(tenant_id, role, resource);

-- audit_log: busca por user_id (quem fez o quê)
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_log(tenant_id, user_id, created_at DESC);

-- players: busca por external_id (import matching)
CREATE INDEX IF NOT EXISTS idx_player_external_id
  ON players(tenant_id, external_id);
