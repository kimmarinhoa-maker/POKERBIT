-- ══════════════════════════════════════════════════════════════════════
--  Migration 007: Documenta uso de campos existentes
--  Nao precisa ALTER TABLE: metadata JSONB ja existe em organizations
--  e is_reconciled ja existe em ledger_entries
-- ══════════════════════════════════════════════════════════════════════

-- Agencias diretas: metadata.is_direct = true em organizations (type = AGENT)
-- Usado na tab Rakeback para diferenciar RB de agente vs RB individual por jogador
COMMENT ON COLUMN organizations.metadata IS 'JSONB flexivel. Campos conhecidos: { is_direct: boolean } para agentes diretos';

-- Conciliacao: flag is_reconciled em ledger_entries
-- Usado na tab Conciliacao para marcar movimentacoes como conciliadas
COMMENT ON COLUMN ledger_entries.is_reconciled IS 'Flag de conciliacao financeira (true = conciliado)';
