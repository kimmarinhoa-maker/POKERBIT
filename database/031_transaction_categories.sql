-- ══════════════════════════════════════════════════════════════════════
--  Migration 031 — Transaction Categories + category_id columns
--  Categorias configuraveis para classificar movimentacoes financeiras
-- ══════════════════════════════════════════════════════════════════════

-- 1) Tabela de categorias
CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  dre_type VARCHAR(20) CHECK (dre_type IN ('revenue', 'expense')),
  dre_group VARCHAR(50),
  color VARCHAR(7) DEFAULT '#6B7280',
  icon VARCHAR(30),
  is_system BOOLEAN DEFAULT FALSE,
  auto_match VARCHAR(200),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name, direction)
);

-- 2) Adicionar category_id nas tabelas de transacoes
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES transaction_categories(id);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES transaction_categories(id);

-- 3) Indices
CREATE INDEX IF NOT EXISTS idx_tx_categories_tenant ON transaction_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_ledger_category ON ledger_entries(category_id);

-- 4) RLS
ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'tx_cat_tenant_policy' AND tablename = 'transaction_categories'
  ) THEN
    CREATE POLICY tx_cat_tenant_policy ON transaction_categories
      FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));
  END IF;
END $$;
