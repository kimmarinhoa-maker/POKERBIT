-- ══════════════════════════════════════════════════════════════════════
--  049: Bank Accounts per Organization (Club/Subclub)
--  Move bank_accounts from tenant-scoped to organization-scoped.
--  Each club/subclub has its own set of bank accounts.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Add organization_id column (nullable for backward compat during migration)
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2) Index for fast lookups by organization
CREATE INDEX IF NOT EXISTS idx_bank_accounts_org
  ON bank_accounts(organization_id);

-- 3) Update is_default to be scoped per organization (not per tenant)
--    When setting default, unset others in same org, not all tenant accounts.
--    This is handled in application code.

-- 4) Comment for clarity
COMMENT ON COLUMN bank_accounts.organization_id IS
  'Club or Subclub that owns this bank account. Each org has its own accounts.';
