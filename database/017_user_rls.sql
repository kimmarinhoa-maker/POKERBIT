-- ══════════════════════════════════════════════════════════════════════
--  Migration 017: RLS policies for user_profiles and user_tenants
--  Ensures users can only access their own profile and tenant links
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. RLS: user_profiles ────────────────────────────────────────

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_own ON user_profiles;
CREATE POLICY user_profiles_own ON user_profiles
  FOR ALL USING (id = auth.uid());

-- ─── 2. RLS: user_tenants ─────────────────────────────────────────

ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tenants_own ON user_tenants;
CREATE POLICY user_tenants_own ON user_tenants
  FOR ALL USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════
-- DONE. Run in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════
