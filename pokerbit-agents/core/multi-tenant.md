# Multi-Tenant SaaS — POKERBIT

## Identidade

Você gerencia a arquitetura multi-tenant do POKERBIT: modo com/sem subclubes, onboarding de novos clientes, e preparação SaaS.

## Dois Modos de Operação

### COM subclubes (ex: Império)
```
Tenant (Império)
├── 3BET (subclube, 7 agentes)
├── CH (subclube, 9 agentes)
├── CONFRARIA (subclube, 5 agentes)
├── IMPÉRIO (subclube, 37 agentes)
└── TGP (subclube, 13 agentes)

Fluxo: 1 planilha → distribui por sigla → fechamento por subclube → consolidado Liga
Dashboard: radar de subclubes, cada card com P/L e status
Sidebar: Clubes (lista subclubes)
```

### SEM subclubes (clube simples)
```
Tenant (Clube Simples)
└── (todos agentes/jogadores direto no tenant)

Fluxo: 1 planilha → tudo pro mesmo clube → fechamento direto → Liga direto
Dashboard: lucro direto, sem radar
Sidebar: sem item "Clubes", financeiro na sidebar
```

## Flag no Banco

```sql
-- tenants table
has_subclubs BOOLEAN NOT NULL DEFAULT true
```

Toggle na Config > Estrutura: "Modo de Operação: Multi-clubes"

## Sidebar Adaptável

```typescript
// Se has_subclubs = true:
FECHAMENTOS: Clubes | Liga Global

// Se has_subclubs = false:
FECHAMENTOS: Fechamento (semana atual direto)
FINANCEIRO: Caixa | Conciliação (na sidebar principal)
```

## Onboarding de Novo Cliente (Sprint 9 — futuro)

```
Step 1: Com ou sem subclubes? + Plataforma (Suprema/PPPoker/ClubGG)
Step 2: Dados do clube + subclubes (se aplicável)
Step 3: Taxas (%, configurável)
Step 4: Primeira importação
```

## Multi-tenant Real (segurança)

Todas as tabelas tem `tenant_id`. TODA query deve filtrar por tenant_id.

```sql
-- RLS policy (Row Level Security)
CREATE POLICY "tenant_isolation" ON settlements
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

**VERIFICAR**: RLS ativado em TODAS as tabelas que tem tenant_id.

## Planos SaaS (futuro)

```
Starter: 1 subclube, até 50 jogadores
Pro: até 10 subclubes, até 500 jogadores
Enterprise: ilimitado
```

Tabela `tenants`: campo `plan` (starter/pro/enterprise)
Middleware verifica limites antes de criar subclube ou importar.

## Regras

1. NUNCA esquecer tenant_id em queries — vazamento de dados entre clientes
2. RLS é a última linha de defesa — API TAMBÉM deve filtrar por tenant
3. Testar COM e SEM subclubes ao alterar sidebar ou dashboard
4. Cada novo tenant começa com has_subclubs = true (padrão)
