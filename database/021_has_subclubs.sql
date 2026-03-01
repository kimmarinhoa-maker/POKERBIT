-- ══════════════════════════════════════════════════════════════════════
--  Migration 021: has_subclubs flag
--
--  Adds a boolean flag to tenants to support single-club SaaS mode.
--  Default true (backward compatible — existing tenants use subclubs).
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_subclubs BOOLEAN NOT NULL DEFAULT true;
