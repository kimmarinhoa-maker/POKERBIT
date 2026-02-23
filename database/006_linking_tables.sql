-- ══════════════════════════════════════════════════════════════════════
--  Migration 006: Tabelas de Linking (Vinculação)
--
--  Resolve jogadores/agentes não classificados automaticamente:
--    1. agent_manual_links — agente (por nome) → subclube
--    2. player_links — jogador individual → agente + subclube
--
--  Usado pelo parseWorkbook() via config.manualLinks e config.playerLinks
-- ══════════════════════════════════════════════════════════════════════

-- ─── 0. Pré-requisitos ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. Agent Manual Links ─────────────────────────────────────────
-- Quando o nome do agente não bate com nenhum prefixo,
-- o usuário vincula manualmente: "AG ANDRÉ" → IMPERIO
-- Mapeamento: agent_name_upper → subclub_id (organização)

CREATE TABLE IF NOT EXISTS agent_manual_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL,          -- Nome uppercase do agente (ex: 'AG ANDRÉ')
  subclub_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_aml_tenant
  ON agent_manual_links(tenant_id);

-- ─── 2. Player Links ────────────────────────────────────────────────
-- Jogadores sem agente (aname = 'None') precisam de link individual:
-- player external_id → agente + subclube
-- Permite atribuir o jogador a um agente E subclube

CREATE TABLE IF NOT EXISTS player_links (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_player_id  TEXT NOT NULL,     -- ID do jogador na planilha (ex: '5140877')
  agent_external_id   TEXT,              -- ID externo do agente (opcional)
  agent_name          TEXT,              -- Nome do agente (opcional)
  subclub_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, external_player_id)
);

CREATE INDEX IF NOT EXISTS idx_pl_tenant
  ON player_links(tenant_id);

-- ═══ Verificação ═══
-- SELECT count(*) FROM agent_manual_links;  -- deve retornar 0
-- SELECT count(*) FROM player_links;        -- deve retornar 0
