-- ══════════════════════════════════════════════════════════════════════
--  Migration 016: WhatsApp Config (Evolution API)
--  Tabela para armazenar configuracao da Evolution API por tenant
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_url       TEXT NOT NULL DEFAULT '',
  api_key       TEXT NOT NULL DEFAULT '',
  instance_name TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_tenant ON whatsapp_config(tenant_id);

-- RLS
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_config_tenant_isolation ON whatsapp_config;
CREATE POLICY whatsapp_config_tenant_isolation ON whatsapp_config
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS whatsapp_config_tenant_insert ON whatsapp_config;
CREATE POLICY whatsapp_config_tenant_insert ON whatsapp_config
  FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

DROP POLICY IF EXISTS whatsapp_config_tenant_update ON whatsapp_config;
CREATE POLICY whatsapp_config_tenant_update ON whatsapp_config
  FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids()));
