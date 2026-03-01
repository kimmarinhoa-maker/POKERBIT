-- Migration 022: WhatsApp fields for organizations and tenants
-- Adds whatsapp_group_link for subclubes, pix_key for tenants (billing)

-- WhatsApp group link per subclub (organizations with type SUBCLUB)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_group_link VARCHAR(255);

-- PIX key for the tenant (used in billing messages)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_key VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20);
