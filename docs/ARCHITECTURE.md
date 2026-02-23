# Poker Manager — Arquitetura (Base Local)

Este projeto é um sistema local (file://) de fechamento financeiro para clubes de poker online.
O foco é consistência matemática e auditabilidade.

## Objetivo da arquitetura
- Separar UI de regras financeiras
- Centralizar storage / carry-forward
- Evitar divergência de fórmula/sinal
- Manter compatibilidade com dados existentes no localStorage
- Permitir evolução futura para SaaS sem reescrever do zero

## Restrições técnicas atuais
- Rodando em `file://` (sem servidor local)
- ES Modules podem ser bloqueados por CORS
- Padrão adotado: **IIFE + namespace global**
  - `window.FinanceEngine`
  - `window.DataLayer`

## Camadas do sistema

### 1) UI + Orquestração (fechamento-poker.html)
Responsável por:
- Renderização, DOM, tabelas, cards, filtros, drawers
- Eventos (cliques, inputs, seleção de semana/agente)
- Chamadas para `DataLayer` e `FinanceEngine`
- Não deve conter regra financeira duplicada

Regra de ouro:
> A UI não calcula saldo, status ou carry. Ela só exibe resultados e aciona ações.

### 2) Engine Financeira (financeEngine.js)
Responsável por:
- Cálculos puros (sem DOM, sem localStorage)
- Fórmula canônica de saldo
- Cálculo de ledgerNet
- Status de liquidação (pendente/parcial/quitado)
- KPIs do clube (quando aplicável, sem dependência de UI)

Regra de ouro:
> Tudo aqui é determinístico, testável e sem efeitos colaterais.

### 3) Data Layer (dataLayer.js)
Responsável por:
- Leitura/escrita no localStorage
- Compatibilidade com estruturas antigas
- Fonte única de carry-forward (com fallback legado)
- Acesso ao histórico do ledger
- Lock/Snapshot de semana (quando existir)

Regra de ouro:
> Somente o DataLayer acessa o localStorage.

### 4) Adapters (adapterImport.js)
Responsável por:
- Importar XLSX
- Normalizar dados (ganhos, rake, ggr, agent/player)
- Não aplicar regra financeira final (isso é da engine)

## Ordem de carregamento (no HTML)
A ordem importa para garantir que os namespaces existam:

```html
<script src="adapterImport.js"></script>
<script src="dataLayer.js"></script>
<script src="financeEngine.js"></script>
<script>
  // app/UI principal
</script>