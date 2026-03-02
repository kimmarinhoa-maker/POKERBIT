-- ══════════════════════════════════════════════════════════════════════
--  Migration 024 — ChipPix Enhancements
--
--  1. Fee (taxa) por operação no ledger
--  2. JSONB para dados do Manager Trade Record importados com a planilha Suprema
--  3. ChipPix manager ID por subclube (ex: "Chippix_143" → IMPERIO)
-- ══════════════════════════════════════════════════════════════════════

-- Fee (taxa) por operação no ledger
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS fee NUMERIC(18,6) DEFAULT 0;

-- settlement_id foreign key no ledger_entries (para vincular ao settlement)
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;

-- JSONB para dados do Manager Trade Record importados com a planilha Suprema
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS chippix_import_data JSONB DEFAULT NULL;

-- ChipPix manager ID por subclube (ex: "Chippix_143" → IMPERIO)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS chippix_manager_id VARCHAR(50);

-- Índice para buscar ledger_entries por settlement
CREATE INDEX IF NOT EXISTS idx_ledger_entries_settlement_id ON ledger_entries(settlement_id);

-- Índice para buscar organizations por chippix_manager_id
CREATE INDEX IF NOT EXISTS idx_organizations_chippix_manager_id ON organizations(chippix_manager_id) WHERE chippix_manager_id IS NOT NULL;
