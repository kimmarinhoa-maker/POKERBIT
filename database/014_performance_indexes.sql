-- ══════════════════════════════════════════════════════════════════════
--  Migration 014: Performance Indexes
--
--  Adiciona indexes para otimizar as queries mais frequentes:
--    - Settlement tab navigation (groupBy subclub)
--    - Carry-forward & ledger processing (entity_id + week_start)
--    - Reconciliacao e auditoria
--
--  Impacto: ~50-80% melhoria em dashboard loads, finalizacao,
--           carry-forward e navegacao entre tabs.
--
--  Todos os indexes usam IF NOT EXISTS para idempotencia.
--
--  NOTA: bank_transactions indexes e auth.tenant_id() function
--  removidos (tabela nao existe ainda / permissao schema auth).
-- ══════════════════════════════════════════════════════════════════════


-- ─── 1. CRITICAL: Settlement Tab Navigation ─────────────────────────
-- getSettlementWithSubclubs() agrupa player/agent metrics por subclub_id.
-- Indexes existentes (settlement_id) sao muito amplos.

CREATE INDEX IF NOT EXISTS idx_pwm_settlement_subclub
  ON player_week_metrics(settlement_id, subclub_id, external_player_id);

CREATE INDEX IF NOT EXISTS idx_awm_settlement_subclub
  ON agent_week_metrics(settlement_id, subclub_id, agent_name);


-- ─── 2. CRITICAL: Carry-Forward & Ledger ────────────────────────────
-- computeAndPersist() faz loop por entity_ids calculando ledger net.
-- calcLedgerNet() filtra por (tenant_id, week_start, entity_id, dir).

CREATE INDEX IF NOT EXISTS idx_carry_entity_week
  ON carry_forward(tenant_id, club_id, week_start, entity_id);

CREATE INDEX IF NOT EXISTS idx_ledger_dir_week
  ON ledger_entries(tenant_id, week_start, entity_id, dir);


-- ─── 3. HIGH: Reconciliacao ─────────────────────────────────────────
-- Tab Conciliacao filtra ledger por is_reconciled.
-- Tab Extrato ordena por created_at.

CREATE INDEX IF NOT EXISTS idx_ledger_reconciled
  ON ledger_entries(tenant_id, is_reconciled, created_at DESC);


-- ─── 4. HIGH: Club Adjustments por Settlement ──────────────────────
-- club_adjustments tem FK settlement_id sem index.
-- getSettlementWithSubclubs() faz join nesta coluna.

CREATE INDEX IF NOT EXISTS idx_club_adj_settlement
  ON club_adjustments(settlement_id);


-- ─── 6. MEDIUM: Agent RB Rate History ───────────────────────────────
-- Rakeback tab busca rate vigente: effective_from <= date AND
-- (effective_to IS NULL OR effective_to >= date).

CREATE INDEX IF NOT EXISTS idx_arr_agent_date
  ON agent_rb_rates(agent_id, effective_from, effective_to);


-- ─── 7. MEDIUM: Data Linking (Import) ───────────────────────────────
-- Import preview resolve agents/players por subclub_id.

CREATE INDEX IF NOT EXISTS idx_override_subclub
  ON agent_overrides(tenant_id, subclub_id);

CREATE INDEX IF NOT EXISTS idx_pl_subclub
  ON player_links(tenant_id, subclub_id);


-- ═══ VERIFICACAO POS-MIGRATION ═══
-- Rodar apos aplicar:
--
--   SELECT indexname, tablename
--   FROM pg_indexes
--   WHERE indexname IN (
--     'idx_pwm_settlement_subclub', 'idx_awm_settlement_subclub',
--     'idx_carry_entity_week', 'idx_ledger_dir_week',
--     'idx_ledger_reconciled', 'idx_club_adj_settlement',
--     'idx_arr_agent_date', 'idx_override_subclub', 'idx_pl_subclub'
--   )
--   ORDER BY tablename, indexname;
--
--   -- Esperado: 9 rows
