-- ══════════════════════════════════════════════════════════════════════
--  039 — Cleanup duplicate organizations
--  Keeps the OLDEST record (first created_at) per (tenant_id, name, type)
--  Reassigns all FK references from duplicate → keeper, then deletes dupes
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Build mapping: for each duplicate group, identify keeper (oldest) and dupes
CREATE TEMP TABLE dup_map AS
WITH ranked AS (
  SELECT id, name, type, tenant_id, parent_id,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, name, type ORDER BY created_at ASC) AS rn
  FROM organizations
),
keepers AS (
  SELECT id AS keeper_id, name, type, tenant_id
  FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON k.tenant_id = r.tenant_id AND k.name = r.name AND k.type = r.type
  WHERE r.rn > 1
)
SELECT dupe_id, keeper_id FROM dupes;

-- Verify what we're about to do
SELECT 'Duplicates to remove:' AS info, COUNT(*) AS cnt FROM dup_map;

-- 2. Reassign FK references: organizations.parent_id
UPDATE organizations SET parent_id = dm.keeper_id
FROM dup_map dm
WHERE organizations.parent_id = dm.dupe_id;

-- 3. Reassign FK: agent_week_metrics.org_id
UPDATE agent_week_metrics SET org_id = dm.keeper_id
FROM dup_map dm
WHERE agent_week_metrics.org_id = dm.dupe_id;

-- 4. Reassign FK: agent_week_metrics.subclub_id
UPDATE agent_week_metrics SET subclub_id = dm.keeper_id
FROM dup_map dm
WHERE agent_week_metrics.subclub_id = dm.dupe_id;

-- 5. Reassign FK: agent_rb_rates.organization_id (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_rb_rates' AND column_name='organization_id') THEN
    EXECUTE 'UPDATE agent_rb_rates SET organization_id = dm.keeper_id FROM dup_map dm WHERE agent_rb_rates.organization_id = dm.dupe_id';
  END IF;
END $$;

-- 6. Reassign FK: ledger_entries.entity_id
UPDATE ledger_entries SET entity_id = dm.keeper_id
FROM dup_map dm
WHERE ledger_entries.entity_id = dm.dupe_id::text;

-- 7. Reassign FK: bank_transactions.entity_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bank_transactions' AND column_name='entity_id') THEN
    EXECUTE 'UPDATE bank_transactions SET entity_id = dm.keeper_id FROM dup_map dm WHERE bank_transactions.entity_id = dm.dupe_id::text';
  END IF;
END $$;

-- 8. Reassign FK: player_links (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_links' AND column_name='organization_id') THEN
    EXECUTE 'UPDATE player_links SET organization_id = dm.keeper_id FROM dup_map dm WHERE player_links.organization_id = dm.dupe_id';
  END IF;
END $$;

-- 9. Reassign FK: agent_prefix_map.subclub_id (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_prefix_map' AND column_name='subclub_id') THEN
    EXECUTE 'UPDATE agent_prefix_map SET subclub_id = dm.keeper_id FROM dup_map dm WHERE agent_prefix_map.subclub_id = dm.dupe_id';
  END IF;
END $$;

-- 10. Delete the duplicates
DELETE FROM organizations
WHERE id IN (SELECT dupe_id FROM dup_map);

-- 11. Verify result
SELECT 'Remaining orgs:' AS info, name, type, COUNT(*) AS cnt
FROM organizations
GROUP BY name, type
HAVING COUNT(*) > 1
ORDER BY name;

DROP TABLE dup_map;

COMMIT;
