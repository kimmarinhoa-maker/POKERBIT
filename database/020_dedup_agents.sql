-- ══════════════════════════════════════════════════════════════════════
--  Migration 020: Dedup duplicate AGENT organizations + UNIQUE constraint
-- ══════════════════════════════════════════════════════════════════════

-- Step 1: Identify and merge duplicate agents (keep oldest, delete newer)
-- A duplicate = same tenant_id + parent_id + LOWER(name) + type='AGENT'

-- First, update any references in agent_week_metrics that point to the duplicate org
-- (keep pointing to the oldest/first org)
WITH dupes AS (
  SELECT
    id,
    tenant_id,
    parent_id,
    name,
    LOWER(TRIM(name)) as norm_name,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, parent_id, LOWER(TRIM(name))
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM organizations
  WHERE type = 'AGENT' AND is_active = true
),
-- The "keeper" is rn=1, duplicates are rn>1
keepers AS (
  SELECT tenant_id, parent_id, norm_name, id as keeper_id
  FROM dupes WHERE rn = 1
),
to_delete AS (
  SELECT d.id as dupe_id, k.keeper_id
  FROM dupes d
  JOIN keepers k ON k.tenant_id = d.tenant_id
    AND k.parent_id = d.parent_id
    AND k.norm_name = d.norm_name
  WHERE d.rn > 1
)
-- Update agent_rb_rates to point to keeper
UPDATE agent_rb_rates
SET organization_id = td.keeper_id
FROM to_delete td
WHERE agent_rb_rates.organization_id = td.dupe_id;

-- Step 2: Update agent_week_metrics.agent_id references
WITH dupes AS (
  SELECT
    id,
    tenant_id,
    parent_id,
    LOWER(TRIM(name)) as norm_name,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, parent_id, LOWER(TRIM(name))
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM organizations
  WHERE type = 'AGENT' AND is_active = true
),
keepers AS (
  SELECT tenant_id, parent_id, norm_name, id as keeper_id
  FROM dupes WHERE rn = 1
),
to_delete AS (
  SELECT d.id as dupe_id, k.keeper_id
  FROM dupes d
  JOIN keepers k ON k.tenant_id = d.tenant_id
    AND k.parent_id = d.parent_id
    AND k.norm_name = d.norm_name
  WHERE d.rn > 1
)
UPDATE agent_week_metrics
SET agent_id = td.keeper_id
FROM to_delete td
WHERE agent_week_metrics.agent_id = td.dupe_id;

-- Step 3: Soft-delete the duplicate organizations (mark inactive)
WITH dupes AS (
  SELECT
    id,
    tenant_id,
    parent_id,
    LOWER(TRIM(name)) as norm_name,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, parent_id, LOWER(TRIM(name))
      ORDER BY created_at ASC, id ASC
    ) as rn
  FROM organizations
  WHERE type = 'AGENT' AND is_active = true
)
UPDATE organizations
SET is_active = false, name = name || ' [DUPE-REMOVED]'
FROM dupes
WHERE organizations.id = dupes.id AND dupes.rn > 1;

-- Step 4: Add UNIQUE constraint to prevent future duplicates
-- Using a partial unique index (only active orgs, case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_agent_name_parent
  ON organizations (tenant_id, parent_id, LOWER(TRIM(name)))
  WHERE type = 'AGENT' AND is_active = true;

-- Also add for SUBCLUB type to prevent subclub duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_subclub_name_parent
  ON organizations (tenant_id, parent_id, LOWER(TRIM(name)))
  WHERE type = 'SUBCLUB' AND is_active = true;
