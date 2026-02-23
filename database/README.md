# Database Migrations — Poker Manager SaaS

## Arquivos (ordem canonica)

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `001_schema.sql` | Extensoes, enums, 16 tabelas, triggers, RLS + policies + helper `get_user_tenant_ids()` |
| 2 | `003_seed_initial.sql` | Tenant "Minha Operacao", Suprema + 5 subclubes, prefixos, metodos pagamento, funcao `link_first_user()` |
| 3 | `004_alter_nullable.sql` | Torna `player_id` e `agent_id` nullable nas metricas |
| 4 | `005_enhancements.sql` | Adiciona `subclub_name/id/week_start` nas metricas, `fee_config`, `club_adjustments` |
| 5 | `006_linking_tables.sql` | Cria `agent_manual_links` e `player_links` |
| 6 | `007_rbac.sql` | Cria `user_org_access` (RBAC por subclube) |
| 7 | `007b_is_direct_and_reconcile.sql` | Adiciona COMMENTs documentando `metadata.is_direct` e `is_reconciled` |
| 8 | `008_bank_transactions.sql` | Cria `bank_transactions` (staging OFX/ChipPix) |
| 9 | `009_integrity_fixes.sql` | UNIQUE parciais, CHECK(amount>0) no ledger, FK cascade |

> **Nota**: `001_core_tables.sql` e `002_rls_policies.sql` foram removidos — eram subconjuntos redundantes do `001_schema.sql`.

---

## CENARIO A: Banco NOVO (do zero)

Rode cada passo em uma aba separada do SQL Editor do Supabase. Espere o "Success" antes de ir pro proximo.

### Passo 1 — Schema completo
```sql
-- Copiar e colar TODO o conteudo de 001_schema.sql
```

### Passo 2 — Seed inicial
```sql
-- Copiar e colar TODO o conteudo de 003_seed_initial.sql
```

### Passo 3 — Nullable metrics
```sql
-- Copiar e colar TODO o conteudo de 004_alter_nullable.sql
```

### Passo 4 — Enhancements
```sql
-- Copiar e colar TODO o conteudo de 005_enhancements.sql
```

### Passo 5 — Linking tables
```sql
-- Copiar e colar TODO o conteudo de 006_linking_tables.sql
```

### Passo 6 — RBAC
```sql
-- Copiar e colar TODO o conteudo de 007_rbac.sql
```

### Passo 7 — Comments
```sql
-- Copiar e colar TODO o conteudo de 007b_is_direct_and_reconcile.sql
```

### Passo 8 — Bank transactions
```sql
-- Copiar e colar TODO o conteudo de 008_bank_transactions.sql
```

### Passo 9 — Integrity fixes
```sql
-- Copiar e colar TODO o conteudo de 009_integrity_fixes.sql
```

### Passo 10 — Vincular primeiro usuario
Apos o primeiro signup no app, rode:
```sql
SELECT link_first_user();
```

---

## CENARIO B: Banco JA EXISTE (aplicar apenas 009)

### Passo 1 — Pre-verificacao

Copie e rode no SQL Editor:

```sql
-- 1a. Duplicatas em player_week_metrics?
SELECT settlement_id, player_id, count(*)
FROM player_week_metrics
WHERE player_id IS NOT NULL
GROUP BY settlement_id, player_id
HAVING count(*) > 1;

-- 1b. Duplicatas em agent_week_metrics?
SELECT settlement_id, agent_id, count(*)
FROM agent_week_metrics
WHERE agent_id IS NOT NULL
GROUP BY settlement_id, agent_id
HAVING count(*) > 1;

-- 1c. Amounts negativos ou zero em ledger_entries?
SELECT id, entity_id, dir, amount
FROM ledger_entries
WHERE amount <= 0;
```

Se todos retornarem **0 rows** — va pro Passo 2.
Se algum retornar dados — rode o Passo 1.5 primeiro.

### Passo 1.5 — Correcao de dados (SE necessario)

```sql
-- Remover duplicatas de player_week_metrics (mantem o mais recente)
DELETE FROM player_week_metrics a
USING player_week_metrics b
WHERE a.settlement_id = b.settlement_id
  AND a.player_id = b.player_id
  AND a.player_id IS NOT NULL
  AND a.created_at < b.created_at;

-- Remover duplicatas de agent_week_metrics (mantem o mais recente)
DELETE FROM agent_week_metrics a
USING agent_week_metrics b
WHERE a.settlement_id = b.settlement_id
  AND a.agent_id = b.agent_id
  AND a.agent_id IS NOT NULL
  AND a.created_at < b.created_at;

-- Corrigir amounts negativos no ledger (inverter pra positivo)
UPDATE ledger_entries
SET amount = ABS(amount)
WHERE amount < 0;

-- Corrigir amounts zero no ledger (deletar — entry sem valor nao faz sentido)
DELETE FROM ledger_entries WHERE amount = 0;
```

### Passo 2 — Aplicar migration

```sql
-- UNIQUE parcial em player_week_metrics
CREATE UNIQUE INDEX IF NOT EXISTS uq_pwm_settlement_player
  ON player_week_metrics(settlement_id, player_id)
  WHERE player_id IS NOT NULL;

-- UNIQUE parcial em agent_week_metrics
CREATE UNIQUE INDEX IF NOT EXISTS uq_awm_settlement_agent
  ON agent_week_metrics(settlement_id, agent_id)
  WHERE agent_id IS NOT NULL;

-- CHECK amount > 0 em ledger_entries
ALTER TABLE ledger_entries
  ADD CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0);

-- Corrigir FK settlement_id para ON DELETE SET NULL
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_settlement_id_fkey;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_settlement_id_fkey
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;
```

> **IMPORTANTE**: NAO adicionar `CHECK(amount > 0)` em `carry_forward`!
> O carry-forward armazena `saldoFinal` que pode ser negativo (entidade deve ao clube) ou zero (saldo zerado).
> Formula: `saldoFinal = saldoAnterior + resultado - ledgerNet`

### Passo 3 — Verificacao pos-migration

```sql
-- Constraints criadas no ledger_entries?
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'ledger_entries'::regclass
  AND conname IN ('chk_ledger_amount_positive', 'ledger_entries_settlement_id_fkey');
-- Esperado: 2 rows (c = check, f = foreign key)

-- Indices unicos criados?
SELECT indexname FROM pg_indexes
WHERE tablename IN ('player_week_metrics', 'agent_week_metrics')
  AND indexname LIKE 'uq_%';
-- Esperado: 2 rows (uq_pwm_settlement_player, uq_awm_settlement_agent)
```

Se os 2 queries retornarem o esperado, a migration foi aplicada com sucesso.

---

## Resumo das tabelas (19 total)

| Tabela | Migration | Descricao |
|--------|-----------|-----------|
| `tenants` | 001 | Multi-tenant raiz |
| `user_profiles` | 001 | Perfil do usuario |
| `user_tenants` | 001 | Usuario ↔ Tenant (role) |
| `organizations` | 001 | Hierarquia Club → Subclub → Agent |
| `agent_prefix_map` | 001 | Sigla → Subclube |
| `agent_overrides` | 001 | Override manual de agente |
| `players` | 001 | Jogadores |
| `player_agent_assignments` | 001 | Jogador → Agente (por periodo) |
| `player_rb_rates` | 001 | Taxas RB jogador (versionadas) |
| `agent_rb_rates` | 001 | Taxas RB agente (versionadas) |
| `imports` | 001 | Arquivos importados |
| `settlements` | 001 | Fechamentos semanais (DRAFT/FINAL/VOID) |
| `player_week_metrics` | 001 | Metricas semanais por jogador |
| `agent_week_metrics` | 001 | Metricas semanais por agente |
| `ledger_entries` | 001 | Movimentacoes financeiras |
| `carry_forward` | 001 | Saldo anterior entre semanas |
| `payment_methods` | 001 | Metodos de pagamento |
| `bank_accounts` | 001 | Contas bancarias |
| `audit_log` | 001 | Trilha de auditoria |
| `fee_config` | 005 | Taxas automaticas (App, Liga, Rodeo) |
| `club_adjustments` | 005 | Lancamentos por subclube (overlay, compras, etc) |
| `agent_manual_links` | 006 | Link manual agente → subclube |
| `player_links` | 006 | Link jogador → agente + subclube |
| `user_org_access` | 007 | RBAC por organizacao |
| `bank_transactions` | 008 | Staging OFX/ChipPix |
