-- ══════════════════════════════════════════════════════════════════════
--  Migration 039 — GIN index on imports.metadata + audit request_id
-- ══════════════════════════════════════════════════════════════════════

-- GIN index for JSONB queries on imports.metadata
CREATE INDEX IF NOT EXISTS idx_imports_metadata_gin
  ON imports USING GIN (metadata);

-- Add request_id column to audit_log for log correlation
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
