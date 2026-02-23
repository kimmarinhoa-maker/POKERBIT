# Poker Manager — Testing Checklist (Operacional)

Este documento define o ritual mínimo de validação sempre que houver:

- Refatoração
- Alteração de sinal
- Mudança em carry-forward
- Mudança em ledger
- Ajuste em status
- Remoção de código legado
- Evolução para SaaS

Se algum teste falhar, não avançar.

---

# 1) Sanidade Matemática (Obrigatório)

### Teste A — Entrada reduz aberto
- saldoAnterior = 100
- resultadoSemana = 0
- historico: [{dir:'in', valor:30}]

Esperado:
- ledgerNet = 30
- openBalance = 70
- status = parcial

---

### Teste B — Saída aumenta aberto
- saldoAnterior = 100
- resultadoSemana = 0
- historico: [{dir:'out', valor:30}]

Esperado:
- ledgerNet = -30
- openBalance = 130

---

### Teste C — Entrada e saída iguais anulam
- saldoAnterior = 100
- historico: [{dir:'in',30},{dir:'out',30}]

Esperado:
- ledgerNet = 0
- openBalance = 100

---

# 2) Carry Forward

### Teste D — Navegação de semanas
1. Fechar semana N
2. Ir para semana N+1

Esperado:
- saldoAnterior da nova semana = openBalance final da semana anterior

---

### Teste E — Snapshot/Lock
1. Bloquear semana
2. Mudar configuração de RB
3. Voltar para semana bloqueada

Esperado:
- Resultados não mudam (snapshot congelado)

---

# 3) Status

### Teste F — Sem movimento
- openBalance ≠ 0
- historico vazio

Esperado:
- status = aberto

---

### Teste G — Parcial real
- openBalance ≠ 0
- historico tem movimento

Esperado:
- status = parcial

---

### Teste H — Quitado
- openBalance ~ 0
- historico com movimento

Esperado:
- status = pago

---

# 4) Importação

### Teste I — XLSX
1. Importar planilha
2. Conferir totais:
   - total rake
   - total ganhos
   - total RB
   - resultado final

Esperado:
- Nenhuma divergência matemática

---

# 5) Teste de Regressão Rápido (3 minutos)

Após qualquer mudança:

☐ Console sem erros vermelhos  
☐ window.FinanceEngine definido  
☐ window.DataLayer definido  
☐ Entrada reduz saldo  
☐ Saída aumenta saldo  
☐ Carry funciona  

Se todos marcados → sistema considerado estável.

---

# 6) Regra de Ouro

Nunca alterar:

- Fórmula canônica
- Convenção de sinal
- Hierarquia de carry

Sem atualizar:
- FINANCIAL_RULES.md
- E este checklist