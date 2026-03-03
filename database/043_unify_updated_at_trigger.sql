-- ══════════════════════════════════════════════════════════════════════
--  043 — Unify updated_at trigger functions
--  Consolidates update_updated_at() and set_updated_at() into one
-- ══════════════════════════════════════════════════════════════════════

-- Ensure the canonical function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migrate any triggers using the duplicate name to the canonical one
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tgname, tgrelid::regclass AS table_name
    FROM pg_trigger
    WHERE tgfoid = 'set_updated_at()'::regprocedure
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %s', r.tgname, r.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      r.tgname, r.table_name
    );
  END LOOP;
END $$;

-- Drop the duplicate function
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
