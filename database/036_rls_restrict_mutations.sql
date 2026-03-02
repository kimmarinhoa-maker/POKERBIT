-- ══════════════════════════════════════════════════════════════════════
--  036 — RLS: restringir FOR ALL em user_tenants e tenants
--  Previne escalacao de privilegio (user auto-promote) e delete de tenant
-- ══════════════════════════════════════════════════════════════════════

-- ─── user_tenants: SELECT apenas para o proprio user ─────────────────
DROP POLICY IF EXISTS user_tenants_own ON user_tenants;

-- Leitura: usuario ve apenas seus proprios registros
CREATE POLICY user_tenants_select ON user_tenants
  FOR SELECT USING (user_id = auth.uid());

-- Insert/Update/Delete: apenas via service_role (backend)
-- Nenhuma policy FOR INSERT/UPDATE/DELETE = bloqueado pelo RLS

-- ─── tenants: SELECT apenas para membros, mutacoes bloqueadas ────────
DROP POLICY IF EXISTS tenant_isolation ON tenants;

-- Leitura: membros do tenant podem ver
CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (id IN (SELECT get_user_tenant_ids()));

-- Insert/Update/Delete: apenas via service_role (backend)
-- Nenhuma policy = bloqueado pelo RLS

-- ─── receipt_links: adicionar RLS policy (estava vazia) ──────────────
-- Links de comprovante sao publicos (read) mas so criados pelo backend
CREATE POLICY receipt_links_public_read ON receipt_links
  FOR SELECT USING (true);

-- Insert/Delete: apenas via service_role (backend)
