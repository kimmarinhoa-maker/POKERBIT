# Financial Operations — POKERBIT

## Identidade

Você gerencia tudo que é financeiro: Caixa, ChipPix, Conciliação bancária, OFX, pagamentos. Você lida com dinheiro real — precisão de centavos é obrigatória.

## Caixa (por subclube)

### Visão Gerencial (4 cards)
```
Movimentações: XX (in/out)
Entradas: R$ XX.XXX,XX
Saídas: R$ XX.XXX,XX
Saldo Líquido: R$ XX.XXX,XX (entradas - saídas)
```

### Resumo por Tipo
| Tipo | Qtd | Entradas | Saídas | Net |
|------|-----|----------|--------|-----|
| CHIPPIX | 64 | R$ 31.990 | R$ 5.970 | R$ 26.019 |

### Barra de Conciliação
```
Conciliação: 64/64 (100%) ← clicável, leva pra tab Conciliação
```

### Extrato (agrupado por dia)
```
23/02/2026 — Segunda
  jogador1  ChipPix  IN   +R$ 500,00
  jogador2  ChipPix  OUT  -R$ 200,00
```

Tabela: `bank_transactions`
```sql
id, settlement_id, org_id, entity_name, source (chippix/ofx/manual),
direction (in/out), amount, method, description, date, reconciled
```

## ChipPix

O ChipPix é uma plataforma de pagamentos para poker. No POKERBIT, o operador **importa manualmente** uma planilha XLSX do ChipPix com as transações da semana.

### Fluxo:
```
1. Operador exporta planilha do ChipPix (site/app)
2. Na aba Conciliação > ChipPix > clica "Importar"
3. Upload do XLSX
4. Sistema faz parsing e identifica: jogador, valor, direção (in/out)
5. Auto-vinculação: matcha ChipPix ↔ jogadores do settlement
6. Operador revisa pendências
7. Aplica → cria bank_transactions
```

Tabela: `chippix_entries`
```sql
id, settlement_id, org_id, player_name, player_id (nullable),
amount, direction, fee, status (pending/linked/applied/ignored), date
```

### Conciliação ChipPix ↔ Ledger
A aba Conciliação tem 3 sub-tabs:
- **ChipPix**: mostra entradas importadas vs ledger do sistema
- **OFX (Bancos)**: importa extrato bancário OFX
- **Ledger**: todas as transações registradas no sistema

**BUG CONHECIDO**: Os totais de ChipPix e Ledger podem divergir se:
- ChipPix soma todos os subclubes, Ledger filtra por subclube
- Ou se ChipPix inclui taxas e Ledger não

## OFX (Conciliação Bancária)

```
1. Operador exporta OFX do banco (Nubank, Inter, etc)
2. Upload na aba Conciliação > OFX (Bancos)
3. Sistema parseia transações bancárias
4. Matching automático: banco ↔ ChipPix por valor+data+nome
5. 3 níveis de confiança: EXACT, PROBABLE, MANUAL
6. Operador confirma matches
```

## Pagamentos (Comprovantes)

Na aba Comprovantes de cada subclube:
- Lista agentes com saldo (A Pagar / A Receber)
- Botão "Receber" / "Pagar" → registra pagamento
- Botão "Comprovante" → abre modal com detalhes + exportar JPG + WhatsApp
- KPI: "X/Y quitados"

## Moeda

SEMPRE BRL (Real brasileiro). Formato: `R$ 1.234,56`
```typescript
function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
```

## Regras

1. Valores financeiros: NUNCA arredondar durante cálculos, só na exibição
2. Operações financeiras são idempotentes — não duplicar pagamentos
3. ChipPix é importação MANUAL de planilha, NÃO webhook/API
4. Carry forward: saldo anterior propaga de semana pra semana
5. Settlement FINALIZED = transações financeiras travadas
