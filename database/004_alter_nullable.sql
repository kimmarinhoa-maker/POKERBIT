-- ══════════════════════════════════════════════════════════════════════
--  Migration 004: Tornar player_id e agent_id nullable nas métricas
--
--  Motivo: Na importação, nem sempre conseguimos resolver o UUID
--  interno do player/agent na primeira passada. O external_id
--  garante rastreabilidade enquanto o UUID é resolvido.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE player_week_metrics ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE agent_week_metrics ALTER COLUMN agent_id DROP NOT NULL;

-- Limpar registros órfãos de imports com erro
DELETE FROM settlements WHERE id NOT IN (
  SELECT DISTINCT settlement_id FROM player_week_metrics WHERE settlement_id IS NOT NULL
) AND id NOT IN (
  SELECT DISTINCT settlement_id FROM agent_week_metrics WHERE settlement_id IS NOT NULL
);
DELETE FROM imports WHERE status = 'ERROR';
