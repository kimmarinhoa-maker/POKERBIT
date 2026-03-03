-- ══════════════════════════════════════════════════════════════════════
--  040 — Fix phantom "IMPÉRIO" subclub (should be "GRUPO IMPÉRIO")
--  Run this in Supabase SQL Editor to clean up the auto-created phantom.
--  This script reassigns all FK references and deletes the phantom org.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Identify the phantom and the real org
-- Adjust the WHERE clause if your tenant has different names
CREATE TEMP TABLE phantom_fix AS
SELECT
  phantom.id AS phantom_id,
  keeper.id  AS keeper_id,
  phantom.name AS phantom_name,
  keeper.name  AS keeper_name
FROM organizations phantom
JOIN organizations keeper
  ON keeper.tenant_id = phantom.tenant_id
  AND keeper.type = 'SUBCLUB'
  AND keeper.name ILIKE '%GRUPO IMP%'
WHERE phantom.type = 'SUBCLUB'
  AND phantom.name = 'IMPÉRIO'
  AND phantom.name NOT ILIKE '%GRUPO%';

-- Verify before proceeding
SELECT * FROM phantom_fix;

-- 2. Reassign: organizations.parent_id (agents linked under phantom)
UPDATE organizations SET parent_id = pf.keeper_id
FROM phantom_fix pf
WHERE organizations.parent_id = pf.phantom_id;

-- 3. Reassign: agent_week_metrics.subclub_id
UPDATE agent_week_metrics SET subclub_id = pf.keeper_id
FROM phantom_fix pf
WHERE agent_week_metrics.subclub_id = pf.phantom_id;

-- 4. Reassign: player_week_metrics.subclub_id
UPDATE player_week_metrics SET subclub_id = pf.keeper_id
FROM phantom_fix pf
WHERE player_week_metrics.subclub_id = pf.phantom_id;

-- 5. Reassign: club_adjustments.subclub_id
UPDATE club_adjustments SET subclub_id = pf.keeper_id
FROM phantom_fix pf
WHERE club_adjustments.subclub_id = pf.phantom_id;

-- 6. Reassign: ledger_entries.entity_id
UPDATE ledger_entries SET entity_id = pf.keeper_id::text
FROM phantom_fix pf
WHERE ledger_entries.entity_id = pf.phantom_id::text;

-- 7. Reassign: bank_transactions.entity_id (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bank_transactions' AND column_name='entity_id') THEN
    EXECUTE 'UPDATE bank_transactions SET entity_id = pf.keeper_id::text FROM phantom_fix pf WHERE bank_transactions.entity_id = pf.phantom_id::text';
  END IF;
END $$;

-- 8. Reassign: agent_prefix_map.subclub_id (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_prefix_map' AND column_name='subclub_id') THEN
    EXECUTE 'UPDATE agent_prefix_map SET subclub_id = pf.keeper_id FROM phantom_fix pf WHERE agent_prefix_map.subclub_id = pf.phantom_id';
  END IF;
END $$;

-- 9. Reassign: subclub_rb_defaults.subclub_id (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subclub_rb_defaults' AND column_name='subclub_id') THEN
    EXECUTE 'UPDATE subclub_rb_defaults SET subclub_id = pf.keeper_id FROM phantom_fix pf WHERE subclub_rb_defaults.subclub_id = pf.phantom_id';
  END IF;
END $$;

-- 10. Delete the phantom org
DELETE FROM organizations
WHERE id IN (SELECT phantom_id FROM phantom_fix);

-- 11. Also fix subclub_name in metrics to match the real org name
UPDATE agent_week_metrics SET subclub_name = pf.keeper_name
FROM phantom_fix pf
WHERE agent_week_metrics.subclub_name = pf.phantom_name;

UPDATE player_week_metrics SET subclub_name = pf.keeper_name
FROM phantom_fix pf
WHERE player_week_metrics.subclub_name = pf.phantom_name;

-- 12. Verify
SELECT 'Phantom removed:' AS info, COUNT(*) AS cnt FROM phantom_fix;
SELECT id, name, type FROM organizations WHERE type = 'SUBCLUB' ORDER BY name;

DROP TABLE phantom_fix;

COMMIT;
