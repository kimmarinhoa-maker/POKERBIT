
---

## `docs/FINANCIAL_RULES.md`

```markdown
# Poker Manager — Regras Financeiras (Canônicas)

Este documento define a **verdade matemática** do sistema.
Se UI e storage divergirem, este documento é a referência.

---

## 1) Entidades
- **Agente**: agrega jogadores sob uma agência
- **Jogador Direto**: jogador sem agente (tratado como entidade própria)

Cada entidade possui:
- Resultado semanal
- Carry-forward (saldo anterior)
- Movimentações no ledger
- Saldo em aberto (openBalance)
- Status de liquidação

---

## 2) Convenção de sinais (canônica)

### Ganhos (Profit/Loss)
- `ganhos > 0` → jogador ganhou → **clube deve à entidade**
- `ganhos < 0` → jogador perdeu → **entidade deve ao clube**

### Open Balance (saldo em aberto)
- `openBalance > 0` → **clube deve pagar** (entidade a RECEBER)
- `openBalance < 0` → **entidade deve pagar** (clube a RECEBER)

### Ledger (movimentações)
Cada movimento tem `dir` e `valor`:

- `dir = 'in'`  → dinheiro entrou no clube vindo da entidade  
  efeito: **reduz openBalance**
- `dir = 'out'` → dinheiro saiu do clube para a entidade  
  efeito: **aumenta openBalance**

Ledger net:
- `ledgerNet = entradas - saidas`
  - entradas = soma(dir='in')
  - saidas   = soma(dir='out')

---

## 3) Fórmula canônica do saldo

### Resultado da semana
- `resultadoSemana = ganhos + rakeback`

### Saldo atual / openBalance
- `openBalance = saldoAnterior + resultadoSemana - ledgerNet`

**Por que “- ledgerNet”?**
- Se entrou dinheiro (`dir='in'`), `ledgerNet` aumenta e o aberto diminui.
- Se saiu dinheiro (`dir='out'`), `ledgerNet` diminui e o aberto aumenta.

---

## 4) Rakeback (RB)

### Jogador (individual)
- `rbJogador = rake * (rbPct/100)`
- `resultadoJogador = ganhos + rbJogador`

### Agente (dois modos)
1) **Modo normal (agência tem % único)**
- `rbAgente = totalRakePlayers * (agRbPct/100)`

2) **Modo direto (RB por jogador)**
- `rbAgente = Σ (rakePlayer * (playerPct/100))`

Resultado do agente:
- `resultadoAgente = somaGanhosPlayers + rbAgente`

---

## 5) Carry-forward (saldo anterior)

### Definição
- `saldoAnterior` é o openBalance final da semana anterior relevante.

### Hierarquia de leitura (backward compat)
O sistema pode ter estruturas antigas. A leitura deve ser centralizada no DataLayer.

Recomendação canônica:
1) Fonte nova canônica (ex: `pm_carry_v2`)
2) Fallback legado `pm_saldo_prev`
3) Fallback snapshot/lock (`pm_finsnapshot`)
4) Fallback legado final (`pm_fin.saldoAberto`)

Regra:
> A escrita deve ocorrer sempre na fonte canônica atual.

---

## 6) Status de liquidação

Estados lógicos:
- `neutro`  → openBalance ~ 0 e sem movimentos
- `aberto`  → openBalance ≠ 0 e sem movimentos
- `parcial` → houve movimento e openBalance ≠ 0
- `pago`    → openBalance ~ 0 (quitado)

Importante:
- “houve movimento” deve ser derivado de `calcLedgerNet()` (considerar `dir`)
- Não somar `valor` ignorando `dir`, pois isso gera falso “pagamento”.

Tolerância recomendada:
- `abs(openBalance) < 0.01` é considerado zero

---

## 7) Casos de teste (sanidade)

### Teste A — Entrada reduz aberto
- saldoAnterior = 100
- resultadoSemana = 0
- historico: [{dir:'in', valor:30}]
- ledgerNet = 30
- openBalance = 100 + 0 - 30 = 70 ✅

### Teste B — Saída aumenta aberto
- saldoAnterior = 100
- resultadoSemana = 0
- historico: [{dir:'out', valor:30}]
- ledgerNet = 0 - 30 = -30
- openBalance = 100 + 0 - (-30) = 130 ✅

### Teste C — Entrada e saída iguais anulam
- saldoAnterior = 100
- resultadoSemana = 0
- historico: [{dir:'in',30},{dir:'out',30}]
- ledgerNet = 0
- openBalance = 100 ✅

---

## 8) Regras de UI (para evitar bugs)
- A UI nunca reimplementa cálculo de saldo/status.
- A UI apenas chama:
  - `FinanceEngine.calcLedgerNet(historico)`
  - `FinanceEngine.calcSaldoAtual(saldoAnterior, resultadoSemana, ledgerNet)`
  - `FinanceEngine.determineStatus(openBalance, historico)`
- O DataLayer é o único ponto com `localStorage`.

---

## 9) Glossário rápido
- **ganhos**: Profit/Loss (positivo ganhou, negativo perdeu)
- **rake**: taxa gerada
- **rakeback**: % devolvida (para jogador/agente)
- **ledger**: registro de entradas/saídas
- **carry**: saldo anterior transportado
- **openBalance**: saldo em aberto da entidade na semana