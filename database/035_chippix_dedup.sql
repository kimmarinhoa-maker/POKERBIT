-- ══════════════════════════════════════════════════════════════════════
--  035 — Deduplicacao robusta no ChipPix e ledger_entries
-- ══════════════════════════════════════════════════════════════════════

-- Previne pagamento duplicado no staging (bank_transactions)
-- Mesmo jogador, mesmo valor, mesma data, mesma source = duplicata
CREATE UNIQUE INDEX IF NOT EXISTS uq_banktx_chippix_dedup
  ON bank_transactions(tenant_id, source, entity_id, amount, tx_date)
  WHERE source = 'chippix' AND status != 'ignored';

-- Previne ledger_entry duplicada por external_ref (ChipPix)
-- A query de dedup ja existe no service, mas o constraint garante no DB
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_chippix_ref
  ON ledger_entries(tenant_id, external_ref, week_start)
  WHERE source = 'chippix' AND external_ref IS NOT NULL;
