-- ══════════════════════════════════════════════════════════════════════
--  Migration 037 — updated_at triggers + cleanup duplicate index
--
--  1. Add updated_at auto-update trigger to whatsapp_config & role_permissions
--  2. Drop duplicate ledger index (015 vs 023)
-- ══════════════════════════════════════════════════════════════════════

-- 1. Generic updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. whatsapp_config trigger
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_whatsapp_config_updated_at'
  ) THEN
    CREATE TRIGGER trg_whatsapp_config_updated_at
      BEFORE UPDATE ON whatsapp_config
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 3. role_permissions trigger
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_role_permissions_updated_at'
  ) THEN
    CREATE TRIGGER trg_role_permissions_updated_at
      BEFORE UPDATE ON role_permissions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 4. Drop duplicate index from migration 015 (023 has the same index)
DROP INDEX IF EXISTS idx_ledger_source_week;
