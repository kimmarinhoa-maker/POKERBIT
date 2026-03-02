# ANALISE COMPLETA — POKERBIT (Product Owner)
> Data: 2026-03-02 | Autor: PO Agent | Escopo: Full-stack audit

---

## SUMARIO EXECUTIVO

O POKERBIT e um SaaS maduro para gestao de poker clubs, com **202 arquivos TypeScript**, **28 tabelas**, **70+ endpoints**, **11 tabs de settlement** e um sistema RBAC completo. A base esta **solida**, mas existem **riscos de integridade financeira**, **gaps de seguranca** e **oportunidades de UX** que devem ser tratados antes do go-to-market.

**Score Geral: 7.8/10**

| Area | Score | Status |
|------|-------|--------|
| Arquitetura | 9/10 | Monorepo bem estruturado |
| Seguranca | 7/10 | Auth solido, mas gaps em permissoes |
| Integridade Financeira | 8/10 | Formulas corretas, 1 risco de arredondamento |
| UX/UI | 8/10 | Premium polish, boas animacoes |
| Performance | 7/10 | Cache basico, falta otimizacao de queries |
| Testes | 5/10 | Poucos testes, cobertura baixa |
| Deploy/Infra | 7/10 | Vercel pronto, falta CI/CD |
| Database | 7.5/10 | Schema robusto, 10 gaps de integridade |

---

## PARTE 1: ERROS E PROBLEMAS ENCONTRADOS

### P0 — CRITICOS (resolver antes de produca)

#### 1. RLS Bypassed — Todas queries usam supabaseAdmin
**Onde**: `apps/api/src/config/supabase.ts`
**Problema**: O client com JWT do usuario existe mas NUNCA e usado. Todas as queries usam `supabaseAdmin` (service_role), que bypassa RLS completamente.
**Risco**: Se qualquer middleware falhar, dados de TODOS os tenants ficam exposiveis.
**Solucao**: Usar user client para reads, ou garantir que TODA query tem `.eq('tenant_id', req.tenantId)`.

#### 2. Endpoints GET sem permission check
**Onde**: `organizations.routes.ts` (linhas 30, 63, 124)
**Problema**: GET /api/organizations, /tree e /prefix-rules nao tem `requirePermission()`.
**Risco**: Qualquer usuario autenticado ve TODA hierarquia de clubes, agentes e regras de prefix.
**Solucao**: Adicionar `requirePermission('page:clubs')`.

#### 3. Race condition no import — version collision
**Onde**: `importConfirm.service.ts:157-174`
**Problema**: Busca max version e incrementa, mas outro import concorrente pode criar mesma version.
**Risco**: Dois imports simultaneos = settlement corrompido com dados duplicados.
**Solucao**: Usar `SELECT ... FOR UPDATE` ou UNIQUE constraint em (tenant_id, week_start, club_id, status='DRAFT').

#### 4. Foreign Keys sem ON DELETE definido
**Onde**: 6 tabelas (bank_transactions, carry_forward, player/agent_week_metrics)
**Problema**: FKs como `bank_transactions.bank_account_id` e `carry_forward.source_settlement_id` nao tem ON DELETE.
**Risco**: DELETE em settlements/accounts falha com FK violation, travando operacoes de limpeza.
**Solucao**: Migration 024 com ON DELETE SET NULL ou CASCADE explicito.

---

### P1 — IMPORTANTES (resolver em 2 semanas)

#### 5. Double-rounding no saldo do jogador
**Onde**: `settlement.service.ts:445`
**Codigo**: `round2(resultadoSemana + saldoAnterior + round2(totalPagamentos))`
**Problema**: `totalPagamentos` ja e rounded na linha 435. Duplo round2 pode gerar discrepancia de R$0.01.
**Impacto**: Pequeno mas acumulativo — em 214 jogadores x 52 semanas = ate R$111 de erro/ano.
**Solucao**: Remover round2 interno: `round2(resultadoSemana + saldoAnterior + totalPagamentos)`.

#### 6. ILIKE search com escaping incompleto
**Onde**: `players.routes.ts:117-118`
**Problema**: Custom escaping de `%`, `_`, `\` mas pode nao cobrir todos os wildcards do PostgreSQL.
**Risco**: Baixo (Supabase parametriza), mas search pode retornar resultados inesperados.
**Solucao**: Usar funcao de escape do Supabase ou regex `~*` ao inves de ILIKE.

#### 7. ChipPix sem deduplicacao robusta
**Onde**: `chippix.service.ts:81-134`
**Problema**: Dedup por ID, mas se mesmo pagamento vem de dois uploads diferentes, nao tem FITID.
**Risco**: Pagamento duplicado aplicado ao ledger = saldo errado.
**Solucao**: Adicionar UNIQUE em (tenant_id, source, entity_id, amount, tx_date).

#### 8. Sem constraint de settlement FINAL unico
**Onde**: Database — tabela `settlements`
**Problema**: Nada impede dois settlements com status='FINAL' para mesma semana/clube.
**Risco**: Carry-forward pode pegar o errado, ou dashboard mostra dados duplicados.
**Solucao**:
```sql
CREATE UNIQUE INDEX uq_one_final_per_week
ON settlements(tenant_id, club_id, week_start) WHERE status='FINAL';
```

#### 9. Audit log quebra se usuario for deletado
**Onde**: `audit_log.user_id` sem ON DELETE
**Problema**: FK para auth.users sem acao de delete. Se usuario removido, audit trail fica orfao.
**Risco**: Compliance — nao consegue rastrear quem fez alteracoes.
**Solucao**: `ON DELETE SET NULL` + guardar user_email no log.

#### 10. Console.warn/error em producao (32 instancias)
**Onde**: 14 arquivos no backend
**Problema**: Logs com console.warn/error sem structured logging.
**Impacto**: Sem alertas, sem metricas, dificil debugar em producao.
**Solucao**: Implementar Pino ou Winston com log levels.

---

### P2 — NICE TO HAVE (proximo sprint)

#### 11. `any` types em 5 arquivos criticos
**Onde**: dashboard/page.tsx, players/page.tsx, auth/login/route.ts
**Impacto**: Reduz type safety em estruturas financeiras.

#### 12. Sem virus scanning em uploads
**Onde**: import.routes.ts, ofx.routes.ts
**Risco**: XLSX com macros maliciosas (baixo risco, mas best practice).

#### 13. OFX parsing com regex fragil
**Onde**: `ofx.service.ts:62-104`
**Problema**: Regex-based ao inves de parser dedicado.
**Risco**: OFX malformado = regex DoS ou extracao parcial.

#### 14. Sem pagination explicitay em varias tabelas
**Onde**: Frontend (Detalhamento, Jogadores, Extrato)
**Impacto**: Com 214+ jogadores, tabelas podem ficar lentas.

#### 15. Permission cache permite acesso indevido em falha de DB
**Onde**: `middleware/permission.ts:58-67`
**Problema**: Se role_permissions falha, fallback para defaults que podem ser permissivos.

---

## PARTE 2: IDEIAS DE MELHORIAS

### Categoria: VALOR IMEDIATO (alto impacto, baixo esforto)

| # | Melhoria | Impact | Ease | ICE |
|---|----------|--------|------|-----|
| M1 | **Notificacao push de fechamento** — Toast/banner no dashboard mostrando "Semana X aguardando finalizacao" com botao direto | 9 | 8 | 720 |
| M2 | **Resumo semanal automatico** — Email/WhatsApp todo domingo com preview do resultado da semana | 9 | 7 | 630 |
| M3 | **Atalho de teclado global** — Ctrl+Enter finalizar semana, Ctrl+S salvar notas (ja tem Ctrl+K) | 7 | 9 | 630 |
| M4 | **Auto-backup antes de finalizar** — Snapshot JSON do settlement antes do lock (rollback manual) | 8 | 8 | 512 |
| M5 | **Indicador de saude dos dados** — Badge verde/amarelo/vermelho no dashboard mostrando: jogadores sem link, agentes sem rate, conciliacao pendente | 9 | 7 | 504 |

### Categoria: EXPERIENCIA DO USUARIO

| # | Melhoria | Impact | Ease | ICE |
|---|----------|--------|------|-----|
| M6 | **Modo comparativo** — Comparar 2 semanas lado a lado (KPIs, jogadores, resultado) | 8 | 5 | 320 |
| M7 | **Timeline de atividades** — Feed de acoes recentes (quem importou, quem pagou, quem finalizou) | 7 | 6 | 294 |
| M8 | **Filtro global de agente** — Selecionar agente no header e todas as tabs filtram automaticamente | 8 | 6 | 384 |
| M9 | **Dark/Light mode toggle** — Alguns usuarios preferem modo claro | 6 | 5 | 180 |
| M10 | **Onboarding wizard** — Tour guiado na primeira vez (tooltips nas areas principais) | 8 | 5 | 320 |

### Categoria: OPERACIONAL

| # | Melhoria | Impact | Ease | ICE |
|---|----------|--------|------|-----|
| M11 | **Import automatico** — Webhook que recebe XLSX da Suprema automaticamente | 10 | 4 | 400 |
| M12 | **Alertas de anomalia** — Jogador com resultado >3x desvio padrao, agente com rake zero | 9 | 5 | 360 |
| M13 | **Relatorio mensal** — DRE consolidado do mes (4-5 semanas) com grafico de evolucao | 8 | 6 | 384 |
| M14 | **Conciliacao automatica** — Open Finance (Pluggy/Belvo) para reconciliar PIX automaticamente | 10 | 3 | 300 |
| M15 | **Multi-plataforma real** — Parser de PPPoker e ClubGG (atualmente so Suprema funciona) | 8 | 5 | 320 |

### Categoria: TECNICA

| # | Melhoria | Impact | Ease | ICE |
|---|----------|--------|------|-----|
| M16 | **CI/CD pipeline** — GitHub Actions: lint + test + build + deploy automatico | 9 | 7 | 504 |
| M17 | **Cobertura de testes** — Minimo 60% nos services (settlement, import, carry-forward) | 8 | 5 | 320 |
| M18 | **Structured logging** — Pino + request tracing (correlation ID) | 7 | 7 | 343 |
| M19 | **Database transactions** — Wrap import+settlement+metrics em transacao atomica | 9 | 4 | 324 |
| M20 | **API docs (OpenAPI)** — Swagger UI para documentar todos endpoints | 6 | 6 | 216 |

---

## PARTE 3: FLUXO PERFEITO DO SISTEMA

### 3.1 VISAO GERAL DO FLUXO

```
 SEGUNDA-FEIRA (Dia do Fechamento)
 ==================================

 06:00  Suprema envia XLSX por email/WhatsApp
   |
   v
 [1. IMPORT] ─────────────────────────────────────────────
   |  Upload XLSX → Preview → Vincular pendentes → Confirmar
   |  Auto: cria settlement DRAFT, popula player/agent metrics
   |  Auto: detecta semana (week_start), multi-club split
   |
   v
 [2. REVISAO] ────────────────────────────────────────────
   |  Dashboard mostra KPIs da semana
   |  Verificar: jogadores sem link, agentes sem rate
   |  Acao: resolver pendencias no /players e /links
   |
   v
 [3. AJUSTES] ────────────────────────────────────────────
   |  Tab Ajustes: overlay, compras, security, outros
   |  Tab Rakeback: conferir/ajustar rates por agente/jogador
   |  Tab Extrato: lancamentos manuais (PIX recebido, cash, etc)
   |
   v
 [4. CONCILIACAO] ─────────────────────────────────────────
   |  Upload OFX bancario → auto-match transacoes
   |  Upload ChipPix → vincular jogadores
   |  Tab Ledger: verificar entradas reconciliadas vs pendentes
   |  Meta: 100% conciliado
   |
   v
 [5. CONFERENCIA] ─────────────────────────────────────────
   |  DRE: verificar receita vs despesas vs resultado
   |  Liga: conferir totais consolidados de todos subclubes
   |  Cross-Club: verificar agentes multi-subclube
   |  Resumo: KPIs finais + acerto liga
   |
   v
 [6. FINALIZACAO] ─────────────────────────────────────────
   |  Lock Week Modal → checklist pre-finalizacao
   |  [x] Todos jogadores vinculados
   |  [x] Rates configurados
   |  [x] Conciliacao 100%
   |  [x] Ajustes conferidos
   |  [x] DRE batendo
   |  Confirmar → status DRAFT → FINAL
   |  Auto: carry-forward para proxima semana
   |
   v
 [7. COMUNICACAO] ─────────────────────────────────────────
   |  Comprovantes: gerar JPG por agente
   |  WhatsApp: enviar cobranca individual (Evolution API)
   |  WhatsApp: enviar resumo grupo (consolidado)
   |
   v
 [8. LIQUIDACAO] ──────────────────────────────────────────
   |  Acompanhar pagamentos (status: pendente → pago)
   |  Quick-pay: marcar como pago direto na tabela
   |  Filtros: devendo, pago, parcial, fiado, avista
   |  Progress bar: % quitado
   |
   v
 PROXIMA SEGUNDA: Repetir ciclo
```

---

### 3.2 FLUXO DETALHADO POR ETAPA

#### ETAPA 1: IMPORT (Pagina /import)

```
Usuario abre /import
  |
  v
Step 1 — UPLOAD
  |── Arrasta/seleciona arquivo XLSX
  |── Frontend valida: tipo (.xlsx), tamanho (<10MB)
  |── POST /api/imports/preview (FormData)
  |── Backend:
  |     |── Multer recebe arquivo
  |     |── SHA256 hash → verifica duplicata
  |     |── XLSX parse → extrai sheets
  |     |── Detecta plataforma (Suprema/PPPoker/ClubGG)
  |     |── Detecta week_start (primeira data encontrada)
  |     |── Retorna: preview {players[], agents[], stats}
  |
  v
Step 2 — PREVIEW
  |── Mostra tabela com jogadores encontrados
  |── Destaca: novos jogadores, agentes desconhecidos
  |── Usuario confirma ou volta para re-upload
  |
  v
Step 3 — VINCULAR PENDENTES
  |── Lista jogadores sem vinculo (agente/subclube)
  |── EntityPicker: buscar agente existente ou criar novo
  |── Salvar vinculos: POST /api/links/player, /agent
  |
  v
Step 4 — CONFIRMAR
  |── Resumo final: X jogadores, Y agentes, Z subclubes
  |── POST /api/imports/confirm
  |── Backend:
  |     |── Cria registro em `imports`
  |     |── Cria/atualiza `players` (upsert por external_id)
  |     |── Cria/atualiza `organizations` (agentes)
  |     |── Cria `settlement` DRAFT (ou incrementa version)
  |     |── Popula `player_week_metrics` (ganhos, rake, ggr)
  |     |── Popula `agent_week_metrics` (agregado dos players)
  |     |── Sync-agents: auto-cria orgs para agentes novos
  |     |── Sync-rates: copia rb_rates globais → metrics
  |     |── Retorna: {settlementId, stats}
  |
  v
Redirect → /s/[settlementId]/club/[firstSubclubId]
```

#### ETAPA 2: REVISAO (Dashboard + Settlement Overview)

```
Dashboard (/dashboard)
  |── 5 KPIs: resultado, rake, jogadores, agentes, quitacao %
  |── Subclub cards: status de cada subclube
  |── Pendencias card: jogadores sem link, rates faltando
  |── Weekly chart: evolucao (ultimas 8 semanas)
  |
  v
Settlement Overview (/s/[id])
  |── Status banner: DRAFT (amarelo) / FINAL (verde) / VOID (vermelho)
  |── 5 KPIs consolidados: resultado, rake, GGR, acerto liga, carry
  |── Subclub filter cards (clicar → vai pro painel)
  |── Notas editaveis (PATCH /api/settlements/:id/notes)
  |── Quick actions: finalizar, voar, exportar
```

#### ETAPA 3: AJUSTES (Tab Ajustes + Rakeback + Extrato)

```
Tab Ajustes (/s/[id]/club/[subId]?tab=ajustes)
  |── 4 campos editaveis: overlay, compras, security, outros
  |── Observacao livre
  |── Total calculado em tempo real
  |── PUT /api/config/adjustments
  |
Tab Rakeback (/s/[id]/club/[subId]?tab=rakeback)
  |── Sub-tab Agencias: rate por agente (% do rake)
  |── Sub-tab Jogadores: rate individual por jogador
  |── Alert banner: agentes/jogadores sem rate definido
  |── PATCH /api/settlements/:id/agents/:agentId/rb-rate
  |
Tab Extrato (/s/[id]/club/[subId]?tab=extrato)
  |── Lancamentos manuais (IN/OUT)
  |── Filtro: direcao (in/out), metodo (PIX/TED/CASH/CHIPPIX)
  |── CRUD: POST/DELETE /api/ledger
  |── Method badges coloridos
```

#### ETAPA 4: CONCILIACAO (Tab Conciliacao — 3 sub-tabs)

```
Sub-tab ChipPix
  |── Upload XLSX de transacoes chip-pix
  |── Auto-match jogadores por nome/ID
  |── Status: pendente → vinculado → aplicado
  |── Aplicar: cria ledger_entry automatico
  |── Progress bar: % conciliado
  |
Sub-tab OFX
  |── Upload arquivo .OFX do banco
  |── 5-tier auto-match:
  |     1. FITID exato
  |     2. Nome + valor exato
  |     3. Nome fuzzy + valor
  |     4. Valor + data proxima
  |     5. Manual (EntityPicker)
  |── Aplicar: cria ledger_entry com ref bancaria
  |
Sub-tab Ledger
  |── Visao consolidada de TODAS entradas
  |── Source badges: Import, ChipPix, Liquidacao, Manual
  |── Status: reconciliado (verde) vs pendente (amarelo)
  |── Progress bar: % do total reconciliado
```

#### ETAPA 5: CONFERENCIA (DRE + Liga + Cross-Club)

```
Tab DRE (/s/[id]/club/[subId]?tab=dre)
  |── Accordion sections:
  |     |── Receitas: ganhos + rake
  |     |── Despesas: taxas (app, liga, rodeo)
  |     |── Resultado: ganhos + rake + ggr
  |     |── Acerto Liga: resultado + taxas + lancamentos
  |── Formula tooltips em cada linha
  |
Tab Liga (/s/[id]/club/[subId]?tab=liga)
  |── Tabela com TODOS subclubes
  |── Colunas: resultado, rake, taxas, acerto
  |── Grand total card
  |
Cross-Club (/s/[id]/cross)
  |── Agentes que atuam em multiplos subclubes
  |── Consolidado por agente (soma cross-club)
  |── Sort + filter
```

#### ETAPA 6: FINALIZACAO (Lock Week Modal)

```
Botao "Finalizar Semana" → LockWeekModal
  |
  |── Checklist automatico:
  |     [x] Todos jogadores vinculados a agentes
  |     [x] Todos agentes vinculados a subclubes
  |     [x] Rates de rakeback configurados
  |     [x] Conciliacao >= 90%
  |     [x] DRE conferido (sem valores zerados suspeitos)
  |     [x] Notas preenchidas (opcional)
  |
  |── Warnings (nao bloqueiam):
  |     [!] 3 jogadores sem rate individual
  |     [!] Conciliacao OFX em 85%
  |
  |── Confirmar → POST /api/settlements/:id/finalize
  |     |── Backend:
  |     |     |── Muda status DRAFT → FINAL
  |     |     |── Registra finalized_by + finalized_at
  |     |     |── Calcula carry-forward por entidade
  |     |     |── INSERT carry_forward para proxima semana
  |     |     |── Audit log
  |     |── Frontend:
  |           |── Banner muda para FINAL (verde)
  |           |── Tabs ficam read-only
  |           |── Toast: "Semana finalizada com sucesso"
```

#### ETAPA 7: COMUNICACAO (Comprovantes + WhatsApp)

```
Tab Comprovantes (/s/[id]/club/[subId]?tab=comprovantes)
  |── Card por agente com:
  |     |── Nome + ID externo
  |     |── Jogadores do agente + resultados
  |     |── Total a receber/pagar
  |     |── Botao "Exportar JPG" (html2canvas)
  |     |── Botao "WhatsApp" (enviar comprovante)
  |
  |── Fluxo WhatsApp:
  |     |── Se Evolution API configurada:
  |     |     POST /api/whatsapp/send {to, image, caption}
  |     |── Se nao:
  |     |     1. Copia imagem para clipboard
  |     |     2. Abre wa.me/{celular}
  |     |     3. Toast: "Cole com Ctrl+V"
  |
  |── Cobranca em grupo:
  |     |── Gera mensagem consolidada (todos agentes)
  |     |── Envia para grupo WhatsApp do subclube
```

#### ETAPA 8: LIQUIDACAO (Tab Liquidacao)

```
Tab Liquidacao (/s/[id]/club/[subId]?tab=liquidacao)
  |── 5 KPIs: total, pago, pendente, fiado, avista
  |── Progress bar: % quitado
  |── Filtros: todos, devendo, pago, parcial, fiado, avista
  |── Tabela de agentes:
  |     |── Nome, jogadores, resultado, pago, saldo
  |     |── Quick-pay: checkbox → marca como pago
  |     |── Payment type toggle: fiado ↔ avista
  |── Sort por nome, valor, status
  |── CSV export
```

---

### 3.3 FLUXOS SECUNDARIOS

#### Gestao de Jogadores (/players)
```
Tab Agentes
  |── Lista de agentes com rate padrao
  |── Editar rate → atualiza agent_rb_rates
  |── Criar agente manual
  |
Tab Jogadores
  |── Lista de jogadores com dados
  |── Modal: Nome Completo, Celular (+55), E-mail
  |── Rate individual editavel
  |── Link para agente
```

#### Configuracoes (/config)
```
/config/estrutura    → Clubes e subclubes (hierarquia)
/config/pagamentos   → Metodos de pagamento + contas bancarias
/config/taxas        → Fees: app, liga, rodeo (% sobre rake/ggr)
/config/equipe       → Membros (invite, roles) + Permissoes (grid)
```

#### Caixa Geral (/caixa-geral)
```
Visao consolidada de TODAS transacoes do tenant
  |── Agrupado por semana e subclube
  |── Totais: entradas, saidas, saldo
  |── Progress bar de reconciliacao
  |── Tabela detalhada com sort
```

---

### 3.4 FLUXO DE AUTENTICACAO

```
Login (/login)
  |── Email + Senha
  |── POST /api/auth/login
  |── Supabase Auth valida credenciais
  |── Retorna: user + tokens + tenants[]
  |── Frontend:
  |     |── Salva em localStorage
  |     |── Agenda refresh 2min antes do expiry
  |     |── Busca permissions (GET /api/permissions/my)
  |     |── Redireciona para /dashboard
  |
  |── Cross-tab sync: custom event + storage listener
  |── Token expired: auto-refresh ou logout
  |── 401 retry: refresh + re-attempt (1x)
```

---

### 3.5 FLUXO DE PERMISSOES (RBAC)

```
Roles: OWNER > ADMIN > FINANCEIRO > AUDITOR > AGENTE

OWNER
  |── Tudo liberado (hardcoded, sem API call)
  |── Pode configurar permissoes dos outros roles
  |
ADMIN
  |── Quase tudo (exceto configurar permissoes)
  |── Pode finalizar, importar, pagar
  |
FINANCEIRO
  |── Settlements, pagamentos, conciliacao
  |── Nao pode alterar estrutura ou equipe
  |
AUDITOR
  |── Read-only na maioria
  |── Pode ver DRE, Liga, Caixa
  |
AGENTE
  |── Apenas dashboard + seus proprios dados
  |── Filtrado por user_org_access (ve so seus subclubes)

Enforcement:
  |── Sidebar: filtra itens por hasPermission(permKey)
  |── Tabs: SubNavTabs filtra por permKey
  |── API: requirePermission() middleware
  |── Config: /config/equipe > Permissoes (checkbox grid)
```

---

## PARTE 4: PLANO DE ACAO RECOMENDADO

### Sprint Imediato (1 semana) — FIXES CRITICOS

| # | Tarefa | Prioridade | Esforco |
|---|--------|-----------|---------|
| 1 | Adicionar permission checks nos GETs de organizations | P0 | 2h |
| 2 | Corrigir double-rounding no saldo do jogador | P0 | 1h |
| 3 | Adicionar UNIQUE constraint para settlement FINAL | P0 | 1h |
| 4 | Migration 024: ON DELETE explcitio nas FKs orfas | P1 | 3h |
| 5 | Remover console.warn/error (ou condicionar a NODE_ENV) | P1 | 2h |
| 6 | Adicionar deduplicacao robusta no ChipPix | P1 | 3h |

### Sprint 8 — Portal do Agente + Infra

| # | Tarefa | Prioridade |
|---|--------|-----------|
| 7 | CI/CD pipeline (GitHub Actions: lint + test + deploy) | P1 |
| 8 | Portal do Agente (link publico, mobile-first) | P1 |
| 9 | Testes nos services criticos (settlement, import, carry-forward) | P1 |
| 10 | Structured logging (Pino) | P2 |

### Sprint 9 — Go-to-Market

| # | Tarefa | Prioridade |
|---|--------|-----------|
| 11 | Landing Page + Onboarding wizard | P1 |
| 12 | Notificacao de fechamento (push/email) | P1 |
| 13 | Resumo semanal automatico (WhatsApp/email) | P2 |
| 14 | Indicador de saude dos dados no dashboard | P2 |
| 15 | Modo comparativo (2 semanas lado a lado) | P2 |

---

## PARTE 5: METRICAS DE SUCESSO

| Metrica | Atual | Meta |
|---------|-------|------|
| Tempo de fechamento semanal | ~2h (manual) | <30min |
| Erros de calculo reportados | Desconhecido | 0/semana |
| Cobertura de testes | ~10% | 60% |
| Conciliacao automatica | 0% | 70%+ |
| Jogadores sem link (apos import) | Variavel | <5% |
| Uptime | N/A (local) | 99.5% |
| Tempo de carregamento pagina | ~3s | <1.5s |

---

*Documento gerado pelo PO Agent — POKERBIT*
*Proxima revisao: apos Sprint 8*
