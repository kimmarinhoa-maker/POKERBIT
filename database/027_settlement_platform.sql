-- ══════════════════════════════════════════════════════════════════════
--  027_settlement_platform.sql
--  Adds platform column to settlements for multi-platform support
--  (PPPoker, Suprema, ClubGG etc — each creates an independent settlement)
--
--  RODAR NO SUPABASE SQL EDITOR antes de deployar o backend.
-- ══════════════════════════════════════════════════════════════════════

-- Add platform column (default 'suprema' for backward compat)
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'suprema';

-- Drop old unique constraint and recreate with platform
ALTER TABLE settlements
DROP CONSTRAINT IF EXISTS settlements_tenant_id_club_id_week_start_version_key;

ALTER TABLE settlements
ADD CONSTRAINT settlements_tenant_club_week_version_platform_key
UNIQUE (tenant_id, club_id, week_start, version, platform);

-- Index for fast lookup by platform within a week
CREATE INDEX IF NOT EXISTS idx_settlements_platform
ON settlements (tenant_id, week_start, platform);
