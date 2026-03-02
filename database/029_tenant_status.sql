-- ══════════════════════════════════════════════════════════════════════
--  029 — Tenant status (pending / active / suspended)
--  Novos tenants nascem como 'pending' até aprovação manual do admin
-- ══════════════════════════════════════════════════════════════════════

-- Tipo enum para status do tenant
DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Adicionar coluna status (default 'active' para tenants existentes)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status tenant_status NOT NULL DEFAULT 'active';

-- Flag de platform admin no user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- Marcar o primeiro usuario como platform admin (quem ja existe)
-- UPDATE user_profiles SET is_platform_admin = true WHERE id = (SELECT id FROM user_profiles ORDER BY created_at ASC LIMIT 1);
