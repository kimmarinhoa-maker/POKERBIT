# 🎯 Guia de Configuração — Supabase + Poker Manager SaaS

## Pré-requisitos
- Conta no [Supabase](https://supabase.com) (plano Free é suficiente para dev)
- Node.js 18+ instalado
- Os arquivos SQL em `database/` prontos

---

## PASSO 1 — Criar Projeto no Supabase

1. Acesse **https://supabase.com** → Login (ou Sign Up com GitHub)
2. Clique em **"New Project"**
3. Preencha:
   - **Name**: `poker-manager` (ou o nome que preferir)
   - **Database Password**: Crie uma senha forte e **ANOTE** (vai precisar)
   - **Region**: `South America (São Paulo)` — `sa-east-1`
   - **Pricing Plan**: Free (para dev)
4. Clique **"Create new project"**
5. Aguarde ~2 minutos até o projeto ficar pronto

---

## PASSO 2 — Coletar as Credenciais

Com o projeto criado, vá em **Settings** (ícone de engrenagem) → **API**:

| Credencial | Onde encontrar | Para quê |
|---|---|---|
| **Project URL** | Settings → API → Project URL | Frontend + API |
| **anon (public) key** | Settings → API → Project API keys → `anon` | Frontend (acesso público com RLS) |
| **service_role key** | Settings → API → Project API keys → `service_role` | API server-side (NUNCA expor no front!) |
| **JWT Secret** | Settings → API → JWT Secret | Validação de tokens no backend |

Agora vá em **Settings → Database**:

| Credencial | Onde encontrar |
|---|---|
| **Connection string (URI)** | Settings → Database → Connection string → URI |

> ⚠️ Na connection string, troque `[YOUR-PASSWORD]` pela senha que criou no Passo 1.

---

## PASSO 3 — Configurar .env

Na raiz do projeto, copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

Edite o `.env` com os valores coletados:

```env
SUPABASE_URL=https://abc123xyz.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres.abc123xyz:SuaSenha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
JWT_SECRET=sua-jwt-secret
```

---

## PASSO 4 — Aplicar o Schema no Banco

### Opção A: Via SQL Editor do Supabase (Recomendado para setup inicial)

1. No Dashboard do Supabase, vá em **SQL Editor** (ícone `</>` na barra lateral)
2. Clique em **"New Query"**

#### Executar Migration 001 (Tabelas):
3. Abra o arquivo `database/001_core_tables.sql`
4. Copie **TODO** o conteúdo
5. Cole no SQL Editor
6. Clique **"Run"** (ou Ctrl+Enter)
7. Deve aparecer: `Success. No rows returned` ✅

#### Executar Migration 002 (RLS):
8. Clique **"New Query"** novamente
9. Abra o arquivo `database/002_rls_policies.sql`
10. Copie todo o conteúdo → Cole → **"Run"**
11. Deve aparecer: `Success. No rows returned` ✅

#### Executar Migration 003 (Seed):
12. **"New Query"** → Abra `database/003_seed_initial.sql`
13. Cole → **"Run"**
14. Deve aparecer: `Success. No rows returned` ✅

### Opção B: Via psql (linha de comando)

```bash
# Substitua pela sua connection string
export DATABASE_URL="postgresql://postgres.abc123xyz:SuaSenha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

psql "$DATABASE_URL" -f database/001_core_tables.sql
psql "$DATABASE_URL" -f database/002_rls_policies.sql
psql "$DATABASE_URL" -f database/003_seed_initial.sql
```

---

## PASSO 5 — Verificar as Tabelas

No SQL Editor do Supabase, rode:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Deve retornar **16 tabelas**:

```
agent_overrides
agent_prefix_map
agent_rb_rates
agent_week_metrics
audit_log
bank_accounts
carry_forward
imports
ledger_entries
organizations
payment_methods
player_agent_assignments
player_rb_rates
player_week_metrics
players
settlements
tenants
user_profiles
user_tenants
```

Verificar o seed:

```sql
-- Deve retornar "Minha Operação"
SELECT * FROM tenants;

-- Deve retornar 6 organizações (1 CLUB + 5 SUBCLUB)
SELECT type, name, external_id FROM organizations ORDER BY type, name;

-- Deve retornar 7 regras de prefixo
SELECT prefix, (SELECT name FROM organizations WHERE id = subclub_id) as subclub
FROM agent_prefix_map ORDER BY prefix;

-- Deve retornar 4 métodos de pagamento
SELECT name, is_default, sort_order FROM payment_methods ORDER BY sort_order;
```

---

## PASSO 6 — Criar Storage Bucket para Uploads

1. No Dashboard do Supabase, vá em **Storage** (ícone de bucket)
2. Clique **"New Bucket"**
3. Configure:
   - **Name**: `imports`
   - **Public bucket**: **NÃO** (desmarcar)
   - **File size limit**: `10MB`
   - **Allowed MIME types**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel`
4. Clique **"Create bucket"**

### Adicionar Policy no Bucket:

5. Clique no bucket `imports` → aba **"Policies"**
6. Clique **"New Policy"** → **"For full customization"**
7. Configure:
   - **Policy name**: `authenticated_users_upload`
   - **Allowed operation**: `INSERT`
   - **Target roles**: `authenticated`
   - **WITH CHECK expression**:
   ```sql
   (bucket_id = 'imports')
   ```
8. **Save policy**

9. Crie outra policy para **SELECT** (download):
   - **Policy name**: `authenticated_users_read`
   - **Allowed operation**: `SELECT`
   - **Target roles**: `authenticated`
   - **USING expression**:
   ```sql
   (bucket_id = 'imports')
   ```

---

## PASSO 7 — Configurar Auth

### Habilitar Email Auth (já vem habilitado por padrão):

1. Vá em **Authentication** → **Providers**
2. Confirme que **Email** está habilitado
3. Para desenvolvimento, desabilite **"Confirm email"**:
   - Vá em **Authentication** → **Settings** (ícone de engrenagem)
   - Na seção **"Email Auth"**
   - Desmarque **"Enable email confirmations"** (só para dev!)
   - **Save**

### Criar seu primeiro usuário:

4. Vá em **Authentication** → **Users**
5. Clique **"Add user"** → **"Create new user"**
6. Preencha email e senha
7. Clique **"Create user"**

### Vincular usuário ao tenant:

8. Vá em **SQL Editor** → **"New Query"**
9. Execute:
```sql
SELECT link_first_user();
```
10. Deve retornar: `Usuário <uuid> vinculado ao tenant como OWNER ✅`

---

## PASSO 8 — Testar a Conexão

### Teste rápido via SQL Editor:

```sql
-- Verificar RLS está funcionando
-- (Como estamos logados como postgres, temos bypass automático)
SELECT
  t.name as tenant,
  o.type,
  o.name as org_name,
  o.external_id
FROM tenants t
JOIN organizations o ON o.tenant_id = t.id
ORDER BY o.type, o.name;
```

### Teste via API (opcional):

```bash
# Substitua com suas credenciais do .env
SUPABASE_URL="https://abc123xyz.supabase.co"
ANON_KEY="eyJ..."

# Isso deve retornar [] (vazio) porque RLS bloqueia sem auth
curl "${SUPABASE_URL}/rest/v1/tenants" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}"

# Com service_role key, bypassa RLS
SERVICE_KEY="eyJ..."
curl "${SUPABASE_URL}/rest/v1/tenants?select=name" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}"
# Deve retornar: [{"name":"Minha Operação"}]
```

---

## Resumo dos Arquivos

```
database/
├── 001_core_tables.sql    ← 16 tabelas + enums + triggers
├── 002_rls_policies.sql   ← RLS + tenant isolation
└── 003_seed_initial.sql   ← Tenant + orgs + prefixos + payment methods

.env.example               ← Template das variáveis
.env                       ← Suas credenciais (NÃO commitar!)
```

---

## Próximos Passos (Fase 2 continuação)

Depois do Supabase configurado:

1. **`apps/api/`** — Criar API Node.js/TypeScript com:
   - Endpoint de upload XLSX (`POST /api/imports`)
   - Endpoint de settlements (`GET/POST /api/settlements`)
   - Endpoint de players (`GET /api/players`)
   - Autenticação via JWT do Supabase

2. **Job de Processamento** — Pipeline automático:
   - Upload XLSX → Storage
   - Parse com `coreSuprema.parseWorkbook()`
   - Calcular com `calculateWeek()`
   - Persistir métricas no Postgres

3. **Teste end-to-end** com a planilha real

---

## Troubleshooting

### "permission denied for table..."
→ As RLS policies só funcionam com `auth.uid()`. Se estiver testando direto pelo SQL Editor, o Supabase usa o role `postgres` que tem bypass automático. Teste via API para validar RLS.

### "relation auth.users does not exist"
→ A tabela `auth.users` é gerenciada pelo Supabase Auth. Se você está rodando em Postgres local (não Supabase), precisa criar o schema `auth` manualmente. Para dev, use sempre o Supabase.

### Migration falhou
→ Rode os SQLs **na ordem**: 001 → 002 → 003. Se precisar recomeçar, rode `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` no SQL Editor (⚠️ apaga TUDO).
