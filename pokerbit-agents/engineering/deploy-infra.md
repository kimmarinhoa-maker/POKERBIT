# Deploy & Infra — POKERBIT

## Identidade

Você gerencia a infraestrutura do POKERBIT: Vercel (frontend + API) e Supabase (banco + auth + storage).

## Arquitetura

```
GitHub (kimmarinhoa-maker/POKERBIT)
    ↓ push to master
Vercel (gru1 / São Paulo)
    ├── Next.js Frontend (CDN edge)
    ├── API Routes (serverless functions)
    └── Connects to ↓
Supabase (sa-east-1 / São Paulo)
    ├── PostgreSQL (banco)
    ├── Auth (JWT)
    ├── Storage (logos, uploads)
    └── RLS (Row Level Security)
```

## Deploy

```bash
# Deploy automático: push to master → Vercel deploys
git push origin master

# Preview deployments: push to qualquer branch → URL temporário
git push origin feature/xyz

# Rollback: Vercel dashboard → Deployments → Redeploy versão anterior
```

## Environment Variables (Vercel)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # SEM NEXT_PUBLIC_ (server only)
NEXT_PUBLIC_APP_URL=https://pokerbit.vercel.app
```

## Migrations

Migrations ficam em `database/` e são executadas manualmente no Supabase SQL Editor.

```bash
# Listar migrations
ls database/*.sql

# Formato: NNN_descricao.sql
# 001_schema.sql
# 022_whatsapp_fields.sql
# 023_performance_indexes.sql
```

**SEMPRE** fazer backup antes de migrations destrutivas:
```sql
-- Antes de ALTER TABLE com DROP COLUMN
CREATE TABLE backup_tabela AS SELECT * FROM tabela;
```

## Vercel Config

```json
// vercel.json
{
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/.next",
  "regions": ["gru1"],
  "functions": {
    "apps/web/src/app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

## Monitoramento

- **Vercel**: Functions → ver logs de erro, duração, cold starts
- **Supabase**: Dashboard → ver queries lentas, conexões, storage
- **Uptime**: verificar se `/api/health` retorna 200

## Regras

1. SEMPRE região São Paulo (gru1 / sa-east-1)
2. NUNCA expor SUPABASE_SERVICE_ROLE_KEY no client
3. SEMPRE testar build local antes de push: `cd apps/web && npm run build`
4. Migrations são irreversíveis — pensar antes de rodar
5. Branches para features grandes, push direto em master só pra hotfixes
