-- ══════════════════════════════════════════════════════════════════════
--  Migration 009: Correções de Integridade
--
--  Fixes:
--    1. UNIQUE em player_week_metrics(settlement_id, player_id)
--    2. UNIQUE em agent_week_metrics(settlement_id, agent_id)
--    3. CHECK(amount > 0) em ledger_entries
--    4. ON DELETE SET NULL em ledger_entries.settlement_id
--
--  ⚠️  carry_forward NÃO tem CHECK — amount pode ser negativo (dívida)
--
--  ⚠️  Antes de rodar: verificar se já existem duplicatas ou amounts <= 0
--      Use os queries de verificação no final do arquivo.
-- ══════════════════════════════════════════════════════════════════════


-- ─── 0. PRÉ-VERIFICAÇÃO (rodar antes para detectar dados inválidos) ──
-- Descomente e rode manualmente no SQL Editor ANTES de aplicar a migration.

-- Duplicatas em player_week_metrics:
--   SELECT settlement_id, player_id, count(*)
--   FROM player_week_metrics
--   WHERE player_id IS NOT NULL
--   GROUP BY settlement_id, player_id
--   HAVING count(*) > 1;

-- Duplicatas em agent_week_metrics:
--   SELECT settlement_id, agent_id, count(*)
--   FROM agent_week_metrics
--   WHERE agent_id IS NOT NULL
--   GROUP BY settlement_id, agent_id
--   HAVING count(*) > 1;

-- Amounts negativos ou zero em ledger_entries:
--   SELECT id, entity_id, dir, amount
--   FROM ledger_entries
--   WHERE amount <= 0;

-- ⚠️  carry_forward: NÃO verificar amounts negativos!
--   carry_forward.amount pode ser negativo (entidade deve ao clube)
--   ou zero (saldo zerado). Isso é CORRETO pela fórmula canônica.


-- ─── 1. UNIQUE em player_week_metrics ──────────────────────────────
-- Impede métricas duplicadas por jogador por settlement.
-- Usa unique parcial (WHERE player_id IS NOT NULL) porque a migration 004
-- tornou player_id nullable.

CREATE UNIQUE INDEX IF NOT EXISTS uq_pwm_settlement_player
  ON player_week_metrics(settlement_id, player_id)
  WHERE player_id IS NOT NULL;


-- ─── 2. UNIQUE em agent_week_metrics ───────────────────────────────
-- Impede métricas duplicadas por agente por settlement.
-- Usa unique parcial (WHERE agent_id IS NOT NULL) porque a migration 004
-- tornou agent_id nullable.

CREATE UNIQUE INDEX IF NOT EXISTS uq_awm_settlement_agent
  ON agent_week_metrics(settlement_id, agent_id)
  WHERE agent_id IS NOT NULL;


-- ─── 3. CHECK(amount > 0) em ledger_entries ───────────────────────
-- A direção é controlada pelo campo `dir` (IN/OUT).
-- O valor deve ser sempre positivo para evitar ambiguidade.

ALTER TABLE ledger_entries
  ADD CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0);


-- ─── 4. Corrigir FK ledger_entries.settlement_id ───────────────────
-- A FK original não tem ON DELETE, então deletar um settlement dá erro.
-- Troca para ON DELETE SET NULL (preserva o ledger entry como órfão seguro).

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_settlement_id_fkey;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;


-- ─── 5. carry_forward — SEM CHECK ─────────────────────────────────
-- ⚠️  carry_forward.amount pode ser NEGATIVO ou ZERO.
-- Fórmula canônica: saldoFinal = saldoAnterior + resultado - ledgerNet
-- Ex: saldoAnt=0, resultado=-500, ledgerNet=0 → saldoFinal=-500 (legítimo)
-- NÃO ADICIONAR CHECK(amount > 0) aqui!


-- ═══ VERIFICAÇÃO PÓS-MIGRATION ═══
-- Rodar após aplicar:
--
--   -- Constraints criadas no ledger_entries?
--   SELECT conname, contype FROM pg_constraint
--   WHERE conrelid = 'ledger_entries'::regclass
--     AND conname IN ('chk_ledger_amount_positive', 'ledger_entries_settlement_id_fkey');
--   -- Esperado: 2 rows (c = check, f = foreign key)
--
--   -- Índices únicos criados?
--   SELECT indexname FROM pg_indexes
--   WHERE tablename IN ('player_week_metrics', 'agent_week_metrics')
--     AND indexname LIKE 'uq_%';
--   -- Esperado: 2 rows (uq_pwm_settlement_player, uq_awm_settlement_agent)
