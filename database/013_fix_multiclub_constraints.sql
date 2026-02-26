-- ══════════════════════════════════════════════════════════════════════
--  Migration 013: Corrigir constraints para multi-club imports
--
--  Problema:
--    As constraints uq_pwm_settlement_player e uq_awm_settlement_agent
--    impedem que o mesmo jogador/agente apareça em subclubes diferentes
--    dentro do mesmo settlement. Isso quebra quando se importa múltiplas
--    planilhas (ex: IMPERIO LIVE + IMPERIO) na mesma semana.
--
--  Fix:
--    - player_week_metrics: UNIQUE(settlement_id, external_player_id, subclub_name)
--    - agent_week_metrics:  UNIQUE(settlement_id, agent_name, subclub_name)
--
--  Isso permite o mesmo agente/jogador em subclubes diferentes.
-- ══════════════════════════════════════════════════════════════════════


-- ─── 1. Remover constraints antigas ──────────────────────────────────

DROP INDEX IF EXISTS uq_pwm_settlement_player;
DROP INDEX IF EXISTS uq_awm_settlement_agent;


-- ─── 2. Limpar duplicatas existentes (se houver) ────────────────────
-- Remove duplicatas mantendo apenas a row mais recente (maior id).

DELETE FROM player_week_metrics a
  USING player_week_metrics b
  WHERE a.settlement_id = b.settlement_id
    AND a.external_player_id = b.external_player_id
    AND COALESCE(a.subclub_name, '') = COALESCE(b.subclub_name, '')
    AND a.id < b.id;

DELETE FROM agent_week_metrics a
  USING agent_week_metrics b
  WHERE a.settlement_id = b.settlement_id
    AND a.agent_name = b.agent_name
    AND COALESCE(a.subclub_name, '') = COALESCE(b.subclub_name, '')
    AND a.id < b.id;


-- ─── 3. Criar novas constraints com subclub granularity ─────────────

-- Um jogador pode aparecer em subclubes diferentes no mesmo settlement.
-- A combinação (settlement, player, subclub) é única.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pwm_settlement_player_subclub
  ON player_week_metrics(settlement_id, external_player_id, COALESCE(subclub_name, ''))
  WHERE external_player_id IS NOT NULL;

-- Um agente pode gerenciar jogadores em subclubes diferentes.
-- A combinação (settlement, agent_name, subclub) é única.
CREATE UNIQUE INDEX IF NOT EXISTS uq_awm_settlement_agent_subclub
  ON agent_week_metrics(settlement_id, agent_name, COALESCE(subclub_name, ''))
  WHERE agent_name IS NOT NULL AND agent_name != '';


-- ═══ VERIFICAÇÃO PÓS-MIGRATION ═══
-- Rodar após aplicar:
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('player_week_metrics', 'agent_week_metrics')
--     AND indexname LIKE 'uq_%';
--   -- Esperado: 2 rows:
--   --   uq_pwm_settlement_player_subclub
--   --   uq_awm_settlement_agent_subclub
--
--   -- Verificar que constraints antigas foram removidas:
--   SELECT indexname FROM pg_indexes
--   WHERE indexname IN ('uq_pwm_settlement_player', 'uq_awm_settlement_agent');
--   -- Esperado: 0 rows
