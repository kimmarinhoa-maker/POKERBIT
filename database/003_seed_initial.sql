-- ══════════════════════════════════════════════════════════════════════
--  Migration 003: Seed Inicial (rodar DEPOIS das policies)
--
--  Cria o primeiro tenant e os métodos de pagamento padrão.
--  O user_profile e user_tenants serão criados via API no primeiro login.
-- ══════════════════════════════════════════════════════════════════════

-- ─── Tenant Inicial ────────────────────────────────────────────────

INSERT INTO tenants (id, name, slug)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Minha Operação',
  'minha-operacao'
) ON CONFLICT (slug) DO NOTHING;


-- ─── Organizações (Club → Subclubes) ──────────────────────────────

-- Club raiz: Suprema
INSERT INTO organizations (id, tenant_id, type, name, external_id)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'CLUB',
  'Suprema Poker',
  'suprema'
) ON CONFLICT DO NOTHING;

-- Subclubes
INSERT INTO organizations (id, tenant_id, parent_id, type, name, external_id)
VALUES
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SUBCLUB', 'IMPERIO',    'imperio'),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SUBCLUB', 'TGP',        'tgp'),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SUBCLUB', 'CONFRARIA',  'confraria'),
  ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SUBCLUB', '3BET',       '3bet'),
  ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'SUBCLUB', 'CH',         'ch')
ON CONFLICT DO NOTHING;


-- ─── Regras de Prefixo ─────────────────────────────────────────────

INSERT INTO agent_prefix_map (tenant_id, prefix, subclub_id, priority)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'AMS',    'b0000000-0000-0000-0000-000000000010', 10),
  ('a0000000-0000-0000-0000-000000000001', 'TW',     'b0000000-0000-0000-0000-000000000010', 10),
  ('a0000000-0000-0000-0000-000000000001', 'BB',     'b0000000-0000-0000-0000-000000000010', 10),
  ('a0000000-0000-0000-0000-000000000001', 'TGP',    'b0000000-0000-0000-0000-000000000011', 10),
  ('a0000000-0000-0000-0000-000000000001', 'CONFRA', 'b0000000-0000-0000-0000-000000000012', 10),
  ('a0000000-0000-0000-0000-000000000001', '3BET',   'b0000000-0000-0000-0000-000000000013', 10),
  ('a0000000-0000-0000-0000-000000000001', 'CH',     'b0000000-0000-0000-0000-000000000014', 10)
ON CONFLICT DO NOTHING;


-- ─── Métodos de Pagamento ──────────────────────────────────────────

INSERT INTO payment_methods (tenant_id, name, is_default, sort_order)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'PIX',       true,  1),
  ('a0000000-0000-0000-0000-000000000001', 'ChipPix',   false, 2),
  ('a0000000-0000-0000-0000-000000000001', 'Depósito',  false, 3),
  ('a0000000-0000-0000-0000-000000000001', 'Cash',      false, 4)
ON CONFLICT DO NOTHING;


-- ─── Função auxiliar: vincular primeiro user ao tenant ──────────────
-- Use depois do primeiro signup: SELECT link_first_user();

CREATE OR REPLACE FUNCTION link_first_user()
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'Nenhum usuário encontrado. Faça signup primeiro.';
  END IF;

  -- Criar profile
  INSERT INTO user_profiles (id, full_name)
  VALUES (v_user_id, 'Admin')
  ON CONFLICT (id) DO NOTHING;

  -- Vincular ao tenant como OWNER
  INSERT INTO user_tenants (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant_id, 'OWNER')
  ON CONFLICT (user_id, tenant_id) DO NOTHING;

  RETURN 'Usuário ' || v_user_id || ' vinculado ao tenant como OWNER ✅';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
