-- ══════════════════════════════════════════════════════════════════════
--  033 — UNIQUE constraint: apenas 1 settlement FINAL por semana/clube
-- ══════════════════════════════════════════════════════════════════════

-- Impede dois settlements com status='FINAL' para mesma semana/clube/tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_final_per_week
  ON settlements(tenant_id, club_id, week_start)
  WHERE status = 'FINAL';

-- Tambem impede dois DRAFTs simultaneos (race condition no import)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_draft_per_week
  ON settlements(tenant_id, club_id, week_start)
  WHERE status = 'DRAFT';
