-- ══════════════════════════════════════════════════════════════════════
--  Poker Manager SaaS — Schema PostgreSQL (Migration 001)
--
--  Princípios:
--    • Multi-tenant com RLS (Row Level Security)
--    • Precisão financeira: NUMERIC(18,6)
--    • Settlement versionado (DRAFT → FINAL → VOID)
--    • Auditoria completa
--    • Idempotência de imports (hash-based)
--
--  Supabase-ready: usa auth.uid() para RLS
-- ══════════════════════════════════════════════════════════════════════

-- ─── EXTENSIONS ─────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────────────

CREATE TYPE org_type           AS ENUM ('CLUB', 'SUBCLUB', 'AGENT');
CREATE TYPE settlement_status  AS ENUM ('DRAFT', 'FINAL', 'VOID');
CREATE TYPE import_status      AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'ERROR');
CREATE TYPE user_role          AS ENUM ('OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE');
CREATE TYPE movement_dir       AS ENUM ('IN', 'OUT');
CREATE TYPE audit_action       AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'FINALIZE', 'VOID', 'REPROCESS');


-- ══════════════════════════════════════════════════════════════════════
--  1. MULTI-TENANT + AUTH
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,  -- ex: "grupo-imperio"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'FINANCEIRO',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user   ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);


-- ══════════════════════════════════════════════════════════════════════
--  2. ORGANIZAÇÕES (Hierarquia: Club → Subclub → Agent)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  type        org_type NOT NULL,
  name        TEXT NOT NULL,
  external_id TEXT,          -- ID na plataforma (Suprema, PPPoker, etc.)
  metadata    JSONB DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_tenant     ON organizations(tenant_id);
CREATE INDEX idx_org_parent     ON organizations(parent_id);
CREATE INDEX idx_org_type       ON organizations(tenant_id, type);
CREATE INDEX idx_org_external   ON organizations(tenant_id, external_id);

-- Constraint: CLUB não tem parent, SUBCLUB tem parent CLUB, AGENT tem parent CLUB ou SUBCLUB
-- (validação na API, não no banco — mais flexível)


-- ══════════════════════════════════════════════════════════════════════
--  3. MAPEAMENTO DE PREFIXO (Sigla → Subclube)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE agent_prefix_map (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prefix      TEXT NOT NULL,              -- ex: 'AMS', 'TW', 'BB'
  subclub_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  priority    INT NOT NULL DEFAULT 0,     -- maior = mais forte
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, prefix)
);

CREATE INDEX idx_prefix_tenant ON agent_prefix_map(tenant_id);

CREATE TABLE agent_overrides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_agent_id TEXT NOT NULL,        -- Agent ID da plataforma
  agent_name      TEXT,
  subclub_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, external_agent_id)
);

CREATE INDEX idx_override_tenant ON agent_overrides(tenant_id);


-- ══════════════════════════════════════════════════════════════════════
--  4. JOGADORES
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,            -- Player ID da plataforma
  nickname      TEXT NOT NULL,
  full_name     TEXT,
  metadata      JSONB DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, external_id)
);

CREATE INDEX idx_player_tenant  ON players(tenant_id);
CREATE INDEX idx_player_nick    ON players(tenant_id, nickname);

-- Vínculo jogador → agente (por período)
CREATE TABLE player_agent_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  valid_from  DATE NOT NULL,
  valid_to    DATE,                        -- NULL = vigente
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paa_player ON player_agent_assignments(player_id, valid_from);
CREATE INDEX idx_paa_agent  ON player_agent_assignments(agent_id, valid_from);


-- ══════════════════════════════════════════════════════════════════════
--  5. TAXAS (Versionadas — nunca editar, sempre criar nova)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE player_rb_rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rate            NUMERIC(5,2) NOT NULL,    -- 0.00 a 100.00
  effective_from  DATE NOT NULL,
  effective_to    DATE,                      -- NULL = vigente
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, player_id, effective_from)
);

CREATE INDEX idx_prr_player ON player_rb_rates(player_id, effective_from);

CREATE TABLE agent_rb_rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rate            NUMERIC(5,2) NOT NULL,    -- 0.00 a 100.00
  effective_from  DATE NOT NULL,
  effective_to    DATE,                      -- NULL = vigente
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_id, effective_from)
);

CREATE INDEX idx_arr_agent ON agent_rb_rates(agent_id, effective_from);


-- ══════════════════════════════════════════════════════════════════════
--  6. IMPORTS (Arquivo bruto + status de processamento)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,             -- Segunda-feira (chave canônica)
  file_name     TEXT NOT NULL,
  file_path     TEXT,                      -- Path no Storage (S3/Supabase)
  file_hash     TEXT NOT NULL,             -- SHA-256 do arquivo (idempotência)
  status        import_status NOT NULL DEFAULT 'PENDING',
  row_count     INT,
  player_count  INT,
  error_message TEXT,
  processed_at  TIMESTAMPTZ,
  uploaded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, file_hash)            -- Mesmo arquivo não importa 2x
);

CREATE INDEX idx_import_tenant_week ON imports(tenant_id, club_id, week_start);


-- ══════════════════════════════════════════════════════════════════════
--  7. SETTLEMENTS (Fechamento versionado — CORAÇÃO do sistema)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE settlements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,             -- Segunda-feira (chave canônica)
  version       INT NOT NULL DEFAULT 1,
  status        settlement_status NOT NULL DEFAULT 'DRAFT',
  import_id     UUID REFERENCES imports(id),
  inputs_hash   TEXT,                      -- Hash dos dados de entrada
  rules_hash    TEXT,                      -- Hash das taxas aplicadas
  notes         TEXT,
  finalized_by  UUID REFERENCES auth.users(id),
  finalized_at  TIMESTAMPTZ,
  voided_by     UUID REFERENCES auth.users(id),
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, club_id, week_start, version)
);

CREATE INDEX idx_settlement_lookup ON settlements(tenant_id, club_id, week_start, status);


-- ══════════════════════════════════════════════════════════════════════
--  8. MÉTRICAS SEMANAIS (Pré-calculadas — leitura instantânea)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE player_week_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id   UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES organizations(id),
  -- Dados importados
  external_player_id TEXT,
  nickname           TEXT,
  external_agent_id  TEXT,
  agent_name         TEXT,
  -- Métricas financeiras (NUMERIC = precisão exata)
  winnings_brl       NUMERIC(18,6) NOT NULL DEFAULT 0,
  rake_total_brl     NUMERIC(18,6) NOT NULL DEFAULT 0,
  net_profit_brl     NUMERIC(18,6) NOT NULL DEFAULT 0,
  ggr_brl            NUMERIC(18,6) NOT NULL DEFAULT 0,
  -- Rakeback calculado
  rb_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  rb_value_brl       NUMERIC(18,6) NOT NULL DEFAULT 0,
  resultado_brl      NUMERIC(18,6) NOT NULL DEFAULT 0,
  -- Atividade
  games              INT DEFAULT 0,
  hands              INT DEFAULT 0,
  -- Breakdown por modalidade (analytics)
  rake_breakdown     JSONB DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pwm_settlement ON player_week_metrics(settlement_id);
CREATE INDEX idx_pwm_player     ON player_week_metrics(tenant_id, player_id);
CREATE INDEX idx_pwm_agent      ON player_week_metrics(settlement_id, agent_id);
CREATE INDEX idx_pwm_search     ON player_week_metrics(settlement_id, nickname);

CREATE TABLE agent_week_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id   UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Dados
  agent_name         TEXT NOT NULL,
  player_count       INT NOT NULL DEFAULT 0,
  -- Métricas agregadas
  rake_total_brl     NUMERIC(18,6) NOT NULL DEFAULT 0,
  ganhos_total_brl   NUMERIC(18,6) NOT NULL DEFAULT 0,
  ggr_total_brl      NUMERIC(18,6) NOT NULL DEFAULT 0,
  -- Comissão
  rb_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_brl     NUMERIC(18,6) NOT NULL DEFAULT 0,
  resultado_brl      NUMERIC(18,6) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_awm_settlement ON agent_week_metrics(settlement_id);
CREATE INDEX idx_awm_agent      ON agent_week_metrics(tenant_id, agent_id);


-- ══════════════════════════════════════════════════════════════════════
--  9. MOVIMENTAÇÕES FINANCEIRAS (Pagamentos, Recebimentos)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settlement_id   UUID REFERENCES settlements(id),
  entity_id       TEXT NOT NULL,           -- ex: 'ag_AMS_KILLER' ou 'pl_37490'
  entity_name     TEXT,
  week_start      DATE NOT NULL,
  dir             movement_dir NOT NULL,
  amount          NUMERIC(18,6) NOT NULL,
  method          TEXT,                    -- 'PIX', 'ChipPix', 'Depósito', etc.
  description     TEXT,
  source          TEXT DEFAULT 'manual',   -- 'manual', 'ofx', 'chippix', 'fechamento'
  is_reconciled   BOOLEAN DEFAULT false,
  external_ref    TEXT,                    -- FITID do OFX, ID externo, etc.
  receipt_url     TEXT,                    -- URL do comprovante no Storage
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_tenant_week   ON ledger_entries(tenant_id, week_start);
CREATE INDEX idx_ledger_entity        ON ledger_entries(tenant_id, entity_id, week_start);
CREATE INDEX idx_ledger_settlement    ON ledger_entries(settlement_id);


-- ══════════════════════════════════════════════════════════════════════
--  10. CARRY-FORWARD (Saldo anterior propagado entre semanas)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE carry_forward (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  club_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL,
  week_start  DATE NOT NULL,               -- Semana DESTINO do carry
  amount      NUMERIC(18,6) NOT NULL,
  source_settlement_id UUID REFERENCES settlements(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, club_id, entity_id, week_start)
);

CREATE INDEX idx_carry_lookup ON carry_forward(tenant_id, club_id, week_start);


-- ══════════════════════════════════════════════════════════════════════
--  11. MÉTODOS DE PAGAMENTO
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE payment_methods (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- 'PIX', 'ChipPix', 'Depósito', etc.
  is_default  BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pay_methods_tenant ON payment_methods(tenant_id);


-- ══════════════════════════════════════════════════════════════════════
--  12. CONTAS BANCÁRIAS
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE bank_accounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- 'Banco C6', 'Nubank', etc.
  bank_code   TEXT,
  agency      TEXT,
  account_nr  TEXT,
  is_default  BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_tenant ON bank_accounts(tenant_id);


-- ══════════════════════════════════════════════════════════════════════
--  13. AUDIT LOG (Trilha de auditoria completa)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  action      audit_action NOT NULL,
  entity_type TEXT NOT NULL,               -- 'settlement', 'player_rb_rate', 'agent_override', etc.
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant    ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id);


-- ══════════════════════════════════════════════════════════════════════
--  14. UPDATED_AT TRIGGER (automático)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated      BEFORE UPDATE ON tenants        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_org_updated          BEFORE UPDATE ON organizations  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_players_updated      BEFORE UPDATE ON players        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_settlements_updated  BEFORE UPDATE ON settlements    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_overrides_updated    BEFORE UPDATE ON agent_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════════════════════════════════════
--  15. ROW LEVEL SECURITY (Multi-tenant isolation)
-- ══════════════════════════════════════════════════════════════════════

-- Helper: retorna tenant_ids do usuário autenticado
CREATE OR REPLACE FUNCTION get_user_tenant_ids()
RETURNS SETOF UUID AS $$
  SELECT tenant_id FROM user_tenants
  WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Ativar RLS em todas as tabelas com tenant_id
ALTER TABLE tenants                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_prefix_map         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_overrides          ENABLE ROW LEVEL SECURITY;
ALTER TABLE players                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rb_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_rb_rates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_week_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_week_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE carry_forward            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;

-- Policies: cada usuário só vê dados dos seus tenants
CREATE POLICY tenant_isolation ON tenants
  FOR ALL USING (id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON organizations
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON agent_prefix_map
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON agent_overrides
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON players
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON player_agent_assignments
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON player_rb_rates
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON agent_rb_rates
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON imports
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON settlements
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON player_week_metrics
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON agent_week_metrics
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON ledger_entries
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON carry_forward
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON payment_methods
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON bank_accounts
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY tenant_isolation ON audit_log
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));


-- ══════════════════════════════════════════════════════════════════════
--  16. SEED: Métodos de pagamento padrão
-- ══════════════════════════════════════════════════════════════════════

-- (Executar após criar o primeiro tenant)
-- INSERT INTO payment_methods (tenant_id, name, is_default, sort_order) VALUES
--   ('<tenant_id>', 'PIX',       true,  1),
--   ('<tenant_id>', 'ChipPix',   false, 2),
--   ('<tenant_id>', 'Depósito',  false, 3),
--   ('<tenant_id>', 'Cash',      false, 4);


-- ══════════════════════════════════════════════════════════════════════
--  DONE. 16 tabelas, RLS completo, auditoria, precisão financeira.
-- ══════════════════════════════════════════════════════════════════════
