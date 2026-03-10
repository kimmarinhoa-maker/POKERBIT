-- ══════════════════════════════════════════════════════════════════════
--  Migration 048 — Caixa (Fluxo de Caixa) module
--  Tabela principal + views de resumo + RLS
-- ══════════════════════════════════════════════════════════════════════

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS caixa_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  club_id UUID NOT NULL REFERENCES organizations(id),
  settlement_id UUID REFERENCES settlements(id),

  -- Classificação
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  categoria TEXT NOT NULL CHECK (categoria IN (
    'cobranca',
    'pagamento_jogador',
    'rakeback',
    'despesa_operacional',
    'ajuste_saldo',
    'outros'
  )),

  -- Via / Canal
  via TEXT CHECK (via IN ('pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior', 'outro')),

  -- Valor (sempre positivo, tipo define direção)
  valor NUMERIC(18,6) NOT NULL CHECK (valor >= 0),

  -- Referências
  agente_id UUID REFERENCES organizations(id),
  jogador_id UUID REFERENCES players(id),
  descricao TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'cancelado')),
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_confirmacao TIMESTAMPTZ,

  -- Comprovante
  comprovante_url TEXT,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_caixa_tenant_club ON caixa_lancamentos(tenant_id, club_id);
CREATE INDEX IF NOT EXISTS idx_caixa_settlement ON caixa_lancamentos(settlement_id);
CREATE INDEX IF NOT EXISTS idx_caixa_status ON caixa_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_caixa_tipo ON caixa_lancamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_caixa_data ON caixa_lancamentos(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_caixa_agente ON caixa_lancamentos(agente_id);

-- Trigger updated_at
CREATE TRIGGER caixa_lancamentos_updated_at
  BEFORE UPDATE ON caixa_lancamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. RLS
ALTER TABLE caixa_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON caixa_lancamentos
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- 3. View: Resumo semanal por clube/settlement
CREATE OR REPLACE VIEW v_caixa_resumo AS
SELECT
  tenant_id,
  club_id,
  settlement_id,

  -- Totais por tipo
  SUM(CASE WHEN tipo = 'entrada' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN tipo = 'saida' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_saidas,
  SUM(CASE WHEN tipo = 'entrada' AND status != 'cancelado' THEN valor ELSE 0 END)
    - SUM(CASE WHEN tipo = 'saida' AND status != 'cancelado' THEN valor ELSE 0 END) AS saldo_liquido,

  -- Por via
  SUM(CASE WHEN via = 'pix' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_pix,
  SUM(CASE WHEN via = 'chippix' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_chippix,
  SUM(CASE WHEN via = 'rakeback_deduzido' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_rakeback,
  SUM(CASE WHEN via = 'saldo_anterior' AND status != 'cancelado' THEN valor ELSE 0 END) AS total_saldo_anterior,

  -- Por status (entradas)
  SUM(CASE WHEN status = 'confirmado' AND tipo = 'entrada' THEN valor ELSE 0 END) AS recebido_confirmado,
  SUM(CASE WHEN status = 'pendente' AND tipo = 'entrada' THEN valor ELSE 0 END) AS recebido_pendente,

  -- Por status (saídas)
  SUM(CASE WHEN status = 'confirmado' AND tipo = 'saida' THEN valor ELSE 0 END) AS pago_confirmado,
  SUM(CASE WHEN status = 'pendente' AND tipo = 'saida' THEN valor ELSE 0 END) AS pago_pendente,

  -- Contagens
  COUNT(*) FILTER (WHERE status = 'pendente') AS qtd_pendentes,
  COUNT(DISTINCT agente_id) FILTER (WHERE status = 'pendente' AND tipo = 'entrada') AS agentes_pendentes

FROM caixa_lancamentos
WHERE status != 'cancelado'
GROUP BY tenant_id, club_id, settlement_id;

-- 4. View: Breakdown por canal
CREATE OR REPLACE VIEW v_caixa_por_canal AS
SELECT
  tenant_id,
  club_id,
  settlement_id,
  via,
  SUM(valor) AS total,
  SUM(CASE WHEN status = 'confirmado' THEN valor ELSE 0 END) AS confirmado,
  SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) AS pendente,
  ROUND(
    SUM(CASE WHEN status = 'confirmado' THEN valor ELSE 0 END) * 100.0
    / NULLIF(SUM(valor), 0), 1
  ) AS pct_confirmado
FROM caixa_lancamentos
WHERE tipo = 'entrada' AND status != 'cancelado'
GROUP BY tenant_id, club_id, settlement_id, via;
