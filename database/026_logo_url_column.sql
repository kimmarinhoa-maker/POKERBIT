-- ══════════════════════════════════════════════════════════════════════
--  026 — Coluna dedicada logo_url em organizations
--
--  Motivo: logo_url vivia dentro de metadata (JSONB). Qualquer update
--  que sobrescrevesse metadata inteiro apagava a logo silenciosamente.
--  Com coluna dedicada, e impossível perder via metadata overwrites.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Adicionar coluna
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2) Copiar valores existentes de metadata->>'logo_url'
UPDATE organizations
SET logo_url = metadata->>'logo_url'
WHERE metadata->>'logo_url' IS NOT NULL
  AND (logo_url IS NULL OR logo_url = '');
