# Checklist de Migrations — Deploy Supabase

Todas as migrations devem ser executadas **manualmente** no Supabase SQL Editor, na ordem abaixo.

## Ordem de Execucao

| # | Arquivo | O que faz | Dependencias |
|---|---------|-----------|--------------|
| 1 | `001_schema.sql` | Schema base: 14 tabelas, enums, RLS, triggers, funcoes | Nenhuma |
| 2 | `003_seed_initial.sql` | Seed: tenant, club, 5 subclubes, prefixos, payment methods | 001 |
| 3 | `004_alter_nullable.sql` | Torna player_id/agent_id nullable nas metrics | 001 |
| 4 | `005_enhancements.sql` | Adiciona subclub_name/id/week_start nas metrics + fee_config + club_adjustments | 001, 003 |
| 5 | `006_linking_tables.sql` | Cria agent_manual_links + player_links (import wizard) | 001 |
| 6 | `007_rbac.sql` | Cria user_org_access (RBAC por subclube) | 001 |
| 7 | `007b_is_direct_and_reconcile.sql` | Documenta is_direct e is_reconciled (COMMENTs apenas) | 001 |
| 8 | `008_bank_transactions.sql` | Cria bank_transactions (staging OFX/ChipPix) | 001 |
| 9 | `009_integrity_fixes.sql` | UNIQUE indexes parciais + CHECK amount > 0 + FK SET NULL | 001, 004, 008 |
| 10 | `010_payment_type.sql` | Adiciona payment_type em agent_week_metrics | 001 |
| 11 | `011_rb_defaults.sql` | Cria rb_defaults (rakeback defaults por subclube) | 001, 005 |
| 12 | `012_club_logos_storage.sql` | Cria bucket Supabase Storage (club-logos) | Storage API |
| 13 | `013_fix_multiclub_constraints.sql` | Corrige UNIQUE para multi-club (settlement+player+subclub) | 009 |
| 14 | `014_performance_indexes.sql` | 9 indexes de performance | Todas anteriores |

> **Nota:** Migration 002 nao existe (gap na numeracao).

## Verificacao Pos-Deploy

Apos rodar todas as migrations, execute no SQL Editor:

```sql
-- Verificar tabelas criadas (esperado: 16+)
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Verificar indexes de performance (esperado: 9)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
AND indexname IN (
  'idx_pwm_settlement_subclub', 'idx_awm_settlement_subclub',
  'idx_carry_entity_week', 'idx_ledger_dir_week',
  'idx_ledger_reconciled', 'idx_club_adj_settlement',
  'idx_arr_agent_date', 'idx_override_subclub', 'idx_pl_subclub'
);

-- Verificar RLS ativo em todas tabelas tenant-scoped
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- Vincular primeiro usuario (rodar UMA vez apos signup)
SELECT link_first_user();
```

## Notas Importantes

- **008_bank_transactions.sql** e necessaria para ChipPix/OFX funcionar
- **012_club_logos_storage.sql** usa API de Storage do Supabase (nao e SQL puro)
- **013_fix_multiclub_constraints.sql** limpa duplicatas antes de criar indexes — verificar dados antes
- Todas migrations sao **idempotentes** (usam IF NOT EXISTS / ON CONFLICT DO NOTHING)
