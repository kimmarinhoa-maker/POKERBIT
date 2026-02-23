-- Migration 011: Rakeback Defaults por subclube
CREATE TABLE IF NOT EXISTS rb_defaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subclub_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_rb_default NUMERIC(5,2) NOT NULL DEFAULT 0,
  player_rb_default NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, subclub_id)
);

CREATE INDEX IF NOT EXISTS idx_rb_defaults_tenant ON rb_defaults(tenant_id);

-- Trigger updated_at
CREATE TRIGGER trg_rb_defaults_updated
  BEFORE UPDATE ON rb_defaults
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE rb_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rb_defaults
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));
