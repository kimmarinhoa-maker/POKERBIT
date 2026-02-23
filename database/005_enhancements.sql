-- ══════════════════════════════════════════════════════════════════════
--  Migration 005: Enhancements para Paridade Funcional
--
--  Adiciona:
--    1. subclub_name + subclub_id + week_start nas métricas
--    2. fee_config — taxas automáticas por tenant
--    3. club_adjustments — lançamentos por subclube/semana
--    4. Índices de performance
--    5. Trigger updated_at
-- ══════════════════════════════════════════════════════════════════════

-- ─── 0. Pré-requisitos (idempotentes) ────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── 1. Colunas novas nas métricas ─────────────────────────────────
-- subclub_name = cache para queries rápidas (display)
-- subclub_id   = FK real para organizações (source of truth futuro)
-- week_start   = desnormalizado do settlement para queries diretas

ALTER TABLE player_week_metrics
  ADD COLUMN IF NOT EXISTS subclub_name TEXT,
  ADD COLUMN IF NOT EXISTS subclub_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS week_start DATE;

ALTER TABLE agent_week_metrics
  ADD COLUMN IF NOT EXISTS subclub_name TEXT,
  ADD COLUMN IF NOT EXISTS subclub_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS week_start DATE;


-- ─── 2. Índices de performance ───────────────────────────────────────

-- Por settlement + subclub (tela do settlement)
CREATE INDEX IF NOT EXISTS idx_pwm_subclub
  ON player_week_metrics(tenant_id, settlement_id, subclub_name);
CREATE INDEX IF NOT EXISTS idx_awm_subclub
  ON agent_week_metrics(tenant_id, settlement_id, subclub_name);

-- Por week_start + subclub (consolidação, liga, carry-forward)
CREATE INDEX IF NOT EXISTS idx_pwm_week_subclub
  ON player_week_metrics(tenant_id, week_start, subclub_id);
CREATE INDEX IF NOT EXISTS idx_awm_week_subclub
  ON agent_week_metrics(tenant_id, week_start, subclub_id);


-- ─── 3. Fee Config ───────────────────────────────────────────────────
-- Taxas automáticas: percentuais sobre rake ou GGR
-- CHECK constraint garante que base é 'rake' ou 'ggr'

CREATE TABLE IF NOT EXISTS fee_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rate        NUMERIC(5,2) NOT NULL,
  base        TEXT NOT NULL CHECK (base IN ('rake', 'ggr')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fee_config_tenant
  ON fee_config(tenant_id);

-- Seed padrão (dev only — prod via endpoint "init tenant config")
INSERT INTO fee_config (tenant_id, name, rate, base) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'taxaApp',       8.00, 'rake'),
  ('a0000000-0000-0000-0000-000000000001', 'taxaLiga',     10.00, 'rake'),
  ('a0000000-0000-0000-0000-000000000001', 'taxaRodeoGGR', 12.00, 'ggr'),
  ('a0000000-0000-0000-0000-000000000001', 'taxaRodeoApp', 18.00, 'ggr')
ON CONFLICT DO NOTHING;


-- ─── 4. Club Adjustments ─────────────────────────────────────────────
-- Lançamentos por subclube por semana: overlay, compras, security, outros
-- Valores ASSINADOS: negativo = despesa, positivo = receita
-- adjustments_total = overlay + compras + security + outros (soma direta)

CREATE TABLE IF NOT EXISTS club_adjustments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
  subclub_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,
  overlay       NUMERIC(18,6) NOT NULL DEFAULT 0,
  compras       NUMERIC(18,6) NOT NULL DEFAULT 0,
  security      NUMERIC(18,6) NOT NULL DEFAULT 0,
  outros        NUMERIC(18,6) NOT NULL DEFAULT 0,
  obs           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, subclub_id, week_start)
);

-- Trigger updated_at (idempotente)
DROP TRIGGER IF EXISTS trg_club_adj_updated ON club_adjustments;
CREATE TRIGGER trg_club_adj_updated
  BEFORE UPDATE ON club_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índice de lookup
CREATE INDEX IF NOT EXISTS idx_club_adj_lookup
  ON club_adjustments(tenant_id, week_start, subclub_id);


-- ═══ Verificação ═══
-- Rodar após migration:
--   SELECT count(*) FROM fee_config;                     -- deve retornar 4
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'player_week_metrics'
--     AND column_name IN ('subclub_name', 'subclub_id', 'week_start'); -- deve retornar 3 rows
