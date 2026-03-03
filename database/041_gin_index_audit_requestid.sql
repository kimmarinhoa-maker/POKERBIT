-- ══════════════════════════════════════════════════════════════════════
--  Migration 039 — GIN index on imports.metadata + audit request_id
-- ══════════════════════════════════════════════════════════════════════

-- Add request_id column to audit_log for log correlation
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
