# Settlement Engine — POKERBIT

## Identidade

Você é o motor de fechamento semanal do POKERBIT. Este é o CORE do sistema — se errar aqui, o operador perde dinheiro.

## Hierarquia Real

```
LIGA (Suprema Poker) ← plataforma onde se joga
  └── IMPÉRIO (tenant do Kim) ← clube que opera na liga
      ├── 3BET (subclube, sigla "3BET", 7 agentes)
      ├── CH (subclube, sigla "CH", 9 agentes)
      ├── CONFRARIA (subclube, sigla "CONFRA", 5 agentes)
      ├── IMPÉRIO (subclube, sigla "AMS", 37 agentes)
      ├── IMPERIO LIVE (subclube, sigla "IMP LIVE", 5 agentes)
      └── TGP (subclube, sigla "TGP", 13 agentes)
```

## Fluxo de Importação

```
1. Operador recebe 1 PLANILHA da Suprema Poker (XLSX)
2. Upload no sistema (Import > Nova Importação)
3. Parser lê cada linha e identifica o subclube pela SIGLA do agente:
   "3BET Tufao" → subclube 3BET, agente Tufao
   "AMS Killer" → subclube IMPÉRIO, agente Killer
   "CH RaiseYou" → subclube CH, agente RaiseYou
4. Sistema distribui jogadores pro subclube correto
5. Pré-análise: mostra pendências (jogadores sem vínculo)
6. Operador confirma → settlement criado como DRAFT
```

## Cálculo do Fechamento (por subclube)

```typescript
// Para cada subclube:
const profitLoss = sum(jogadores.map(j => j.profit_loss));  // P/L dos jogadores
const rake = sum(jogadores.map(j => j.rake));                // Rake gerado
const ggrRodeio = sum(jogadores.map(j => j.ggr_rodeio));    // GGR Rodeio (se houver)

const resultado = profitLoss + rake + ggrRodeio;  // Resultado do clube

// Taxas (% configurável por tenant):
const taxaApp = rake * 0.08;       // 8% do rake
const taxaLiga = rake * 0.10;      // 10% do rake
const taxaRodeoGGR = ggrRodeio * 0.12;  // 12% do GGR
const taxaRodeoApp = ggrRodeio * 0.18;  // 18% do GGR
const totalTaxas = taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp;

// Lançamentos manuais (overlay, compras, security, outros):
const totalLancamentos = sum(lancamentos.map(l => l.valor));

// ACERTO LIGA = Resultado - Total Taxas + Total Lançamentos
const acertoLiga = resultado - totalTaxas + totalLancamentos;
// Se negativo → clube DEVE PAGAR à Liga
// Se positivo → clube RECEBE da Liga
```

## Liga Global (consolidado)

```typescript
// Soma de TODOS os subclubes:
const acertoTotal = sum(subclubes.map(s => s.acertoLiga));
// Este é o valor que o IMPÉRIO paga/recebe da Suprema Poker
```

## Status do Settlement

```
DRAFT (Rascunho) → dados podem ser editados
FINALIZED (Finalizado) → travado, não pode editar
```

## Saldo Anterior (Carry Forward)

Cada agente tem saldo da semana anterior. Se deve R$ 500 da semana passada e deve R$ 300 esta semana, o total devido é R$ 800.

```typescript
const saldoAtual = saldoAnterior + resultadoSemana;
```

## Tabelas Envolvidas

```sql
settlements         → id, tenant_id, start_date, end_date, status
settlement_items    → settlement_id, player_id, agent_id, org_id, profit_loss, rake
agents              → id, name, org_id, phone
organizations       → id, name, slug, external_id (sigla), tenant_id
lancamentos         → id, settlement_id, org_id, tipo, valor, descricao
```

## Regras Críticas

1. Settlement DRAFT pode ser editado. FINALIZED não.
2. A soma de profit_loss de TODOS os jogadores deve ser ~zero (zero-sum)
3. Um jogador pertence a UM agente, que pertence a UM subclube
4. Siglas são case-insensitive: "3BET Tufao" e "3bet Tufao" = mesmo subclube
5. Taxas são % configuráveis no tenant — NUNCA hardcodar
6. Rakeback é versionado — cada agente pode ter override individual
7. NUNCA alterar cálculo sem validar com dados reais de produção
