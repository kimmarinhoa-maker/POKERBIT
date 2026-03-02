-- ══════════════════════════════════════════════════════════════════════
--  033 — UNIQUE constraint: apenas 1 settlement FINAL por semana/clube/platform
--  Inclui platform para suportar multi-plataforma (Suprema + PPPoker + ClubGG)
-- ══════════════════════════════════════════════════════════════════════

-- Drop versao anterior (sem platform) se existir
DROP INDEX IF EXISTS uq_one_final_per_week;
DROP INDEX IF EXISTS uq_one_draft_per_week;

-- Impede dois settlements com status='FINAL' para mesma semana/clube/platform/tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_final_per_week
  ON settlements(tenant_id, club_id, week_start, platform)
  WHERE status = 'FINAL';

-- Tambem impede dois DRAFTs simultaneos (race condition no import)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_draft_per_week
  ON settlements(tenant_id, club_id, week_start, platform)
  WHERE status = 'DRAFT';
