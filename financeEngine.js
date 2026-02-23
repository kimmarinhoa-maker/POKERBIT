// ══════════════════════════════════════════════════════════════════════
//  financeEngine.js — Engine Financeira Pura (Poker Manager)
//  Sem acesso a DOM, localStorage ou variáveis globais de UI.
//  Todas as funções recebem dados como parâmetros e retornam valores.
//
//  CONVENÇÃO DE SINAIS (canônica):
//    openBalance > 0  → clube deve à entidade (entidade a RECEBER)
//    openBalance < 0  → entidade deve ao clube (entidade a PAGAR)
//    dir = 'in'       → pagamento recebido pelo clube da entidade → reduz openBalance
//    dir = 'out'      → pagamento enviado pelo clube à entidade   → aumenta openBalance
//    ledgerNet        = entradas(dir='in') − saidas(dir='out')
//
//  FÓRMULA CANÔNICA:
//    resultadoSemana = ganhos + rakeback
//    ledgerNet       = entradas − saidas
//    saldoAtual      = saldoAnterior + resultadoSemana − ledgerNet
//
//  Validação:
//    saldoAnterior=100, resultadoSemana=0, dir='in' 30
//    → ledgerNet=30, saldoAtual = 100 + 0 − 30 = 70 ✓
// ══════════════════════════════════════════════════════════════════════

window.FinanceEngine = (function () {
  'use strict';

  // ─── RESULTADO DA SEMANA ─────────────────────────────────────────────

  /**
   * Resultado da semana de um jogador individual.
   * // GUARD:FORMULA — resultado = ganhos + (rake × pct / 100)
   *
   * @param {{ ganhos: number, rake: number }} player
   * @param {number} rbPct - percentual de rakeback (0–100)
   * @returns {number}
   */
  function calcPlayerResult(player, rbPct) {
    const rbVal = (Number(player.rake) || 0) * (Number(rbPct) || 0) / 100;
    return (Number(player.ganhos) || 0) + rbVal;
  }

  /**
   * Rakeback total de uma agência.
   *
   * Modo normal  (isDirect=false): totalRake × agRbPct / 100
   * Modo direto  (isDirect=true):  Σ (player.rake × getPlayerPct(player) / 100)
   *
   * @param {Array<{ rake: number }>} players
   * @param {number}   agRbPct       - % RB da agência (usado no modo normal)
   * @param {boolean}  isDirect      - true = modo direto por jogador
   * @param {Function} [getPlayerPct] - fn(player) → number — obrigatório no modo direto
   * @returns {number}
   */
  function calcAgentRB(players, agRbPct, isDirect, getPlayerPct) {
    if (isDirect) {
      return players.reduce(function (s, p) {
        const pct = getPlayerPct ? getPlayerPct(p) : 0;
        return s + (Number(p.rake) || 0) * pct / 100;
      }, 0);
    }
    const totalRake = players.reduce(function (s, p) { return s + (Number(p.rake) || 0); }, 0);
    return totalRake * (Number(agRbPct) || 0) / 100;
  }

  /**
   * Resultado completo de uma agência.
   *
   * @param {Array<{ ganhos: number, rake: number }>} players
   * @param {number}   agRbPct
   * @param {boolean}  isDirect
   * @param {Function} [getPlayerPct]
   * @returns {{ rakeTime, ganhosTime, pctAgente, rbAgente, resultadoAgente }}
   */
  function calcAgentResult(players, agRbPct, isDirect, getPlayerPct) {
    const rakeTime   = players.reduce(function (s, p) { return s + (Number(p.rake)   || 0); }, 0);
    const ganhosTime = players.reduce(function (s, p) { return s + (Number(p.ganhos) || 0); }, 0);
    const rbAgente   = calcAgentRB(players, agRbPct, isDirect, getPlayerPct);
    const pctAgente  = isDirect ? 0 : (Number(agRbPct) || 0);
    return { rakeTime, ganhosTime, pctAgente, rbAgente, resultadoAgente: ganhosTime + rbAgente };
  }

  // ─── LEDGER NET ──────────────────────────────────────────────────────

  /**
   * Movimentação líquida do ledger para uma entidade.
   * // GUARD:FORMULA — ledgerNet = entradas − saidas
   *
   * dir='in'  → entradas (pagamento recebido pelo clube, reduz openBalance)
   * dir='out' → saidas   (pagamento enviado pelo clube, aumenta openBalance)
   *
   * @param {Array<{ dir: string, valor: number }>} historico
   * @returns {{ entradas: number, saidas: number, net: number }}
   */
  function calcLedgerNet(historico) {
    var entradas = 0, saidas = 0;
    (historico || []).forEach(function (h) {
      if ((h.dir || 'in') === 'in') entradas += (h.valor || 0);
      else                          saidas   += (h.valor || 0);
    });
    return { entradas: entradas, saidas: saidas, net: entradas - saidas };
  }

  // ─── FÓRMULA CANÔNICA DO SALDO ───────────────────────────────────────

  /**
   * Saldo atual de uma entidade para a semana.
   * // GUARD:FORMULA — saldoAtual = saldoAnterior + resultado − ledgerNet
   *
   * FÓRMULA: saldoAtual = saldoAnterior + resultadoSemana − ledgerNet
   *
   * O sinal negativo de ledgerNet reflete que entradas (dir='in') reduzem
   * o openBalance — o clube recebeu pagamento, logo deve menos (ou a
   * entidade liquidou parte da dívida).
   *
   * @param {number} saldoAnterior   - saldo ao final da semana anterior
   * @param {number} resultadoSemana - ganhos + rakeback da semana atual
   * @param {number} ledgerNet       - entradas − saidas do ledger da semana
   * @returns {number} openBalance
   */
  function calcSaldoAtual(saldoAnterior, resultadoSemana, ledgerNet) {
    return (Number(saldoAnterior)   || 0)
         + (Number(resultadoSemana) || 0)
         - (Number(ledgerNet)       || 0);
  }

  // ─── STATUS DE LIQUIDAÇÃO ────────────────────────────────────────────

  /**
   * Status de liquidação de uma entidade.
   *
   * 'neutro'  → openBalance ≈ 0 e sem movimentações reais
   * 'aberto'  → há saldo em aberto e nenhuma movimentação registrada
   * 'parcial' → houve movimentação mas saldo ainda ≠ 0
   * 'pago'    → saldo ≈ 0 (quitado)
   *
   * IMPORTANTE: usa calcLedgerNet para detectar movimentação real.
   * Não soma h.valor direto — entrada+saída do mesmo valor NÃO é "houve pagamento".
   *
   * @param {number} openBalance - resultado de calcSaldoAtual()
   * @param {Array<{ dir: string, valor: number }>} historico - movimentações do ledger
   * @returns {'neutro' | 'aberto' | 'parcial' | 'pago'}
   */
  function determineStatus(openBalance, historico) {
    var mov        = calcLedgerNet(historico);
    var absBalance = Math.abs(openBalance);
    var houveMov   = (mov.entradas > 0 || mov.saidas > 0);

    if (absBalance < 0.01 && !houveMov) return 'neutro';
    if (!houveMov && absBalance > 0.01) return 'aberto';
    if (absBalance > 0.01)              return 'parcial';
    return 'pago';
  }

  // ─── KPIs DO CLUBE ───────────────────────────────────────────────────

  /**
   * Calcula KPIs financeiros do clube (P&L, rake, taxas, resultado).
   *
   * @param {Array}    players    - jogadores do clube com { ganhos, rake, ggr, aname }
   * @param {Object}   ligaConfig - { taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp } (em %)
   * @param {Function} getAgentRBFn - fn(agKey, players) → number
   * @returns {{
   *   totGanhos, totRake, totGGR, totRB, totResult,
   *   taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas,
   *   resultado
   * }}
   */
  function calcClubKPIs(players, ligaConfig, getAgentRBFn) {
    function sumF(arr, key) {
      return arr.reduce(function (s, p) { return s + (Number(p[key]) || 0); }, 0);
    }
    function rate(v) { return (Number(v) || 0) / 100; }

    const totGanhos = sumF(players, 'ganhos');
    const totRake   = sumF(players, 'rake');
    const totGGR    = sumF(players, 'ggr');

    // Agrupa por agência para calcular RB
    var agMap = {};
    players.forEach(function (p) {
      var k = (p.aname || '').trim() || '(sem agente)';
      if (!agMap[k]) agMap[k] = [];
      agMap[k].push(p);
    });
    const totRB = Object.entries(agMap).reduce(function (s, kv) {
      return s + (getAgentRBFn ? getAgentRBFn(kv[0], kv[1]) : 0);
    }, 0);

    const totResult    = totGanhos + totRake + totGGR;
    const taxaApp      = totRake * rate(ligaConfig.taxaApp);
    const taxaLiga     = totRake * rate(ligaConfig.taxaLiga);
    const taxaRodeoGGR = totGGR > 0 ? totGGR * rate(ligaConfig.taxaRodeoGGR) : 0;
    const taxaRodeoApp = totGGR > 0 ? totGGR * rate(ligaConfig.taxaRodeoApp) : 0;
    const totalTaxas   = taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp;
    const resultado    = totResult - totalTaxas;

    return {
      totGanhos, totRake, totGGR, totRB, totResult,
      taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas,
      resultado
    };
  }

  // ─── FÓRMULA DE LIQUIDAÇÃO (PENDENTE) ─────────────────────────────

  /**
   * Valor pendente de liquidação na semana.
   * // GUARD:FORMULA — pendente = totalDevido + pago (NÃO mudar sinal)
   *
   * pago = ledger.net (já carrega o sinal correto). Somar é CORRETO.
   * Exemplo: totalDevido = -3833, pago = 3000 → pendente = -833 (deve 833)
   * Exemplo: totalDevido = 968, pago = -1071 → pendente = -103 (crédito)
   *
   * @param {number} totalDevido - saldoAnterior + resultadoSemana
   * @param {number} pago        - ledger.net (entradas − saidas)
   * @returns {number} pendente
   */
  function calcPendente(totalDevido, pago) {
    return (Number(totalDevido) || 0) + (Number(pago) || 0);
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────────────

  return {
    calcPlayerResult : calcPlayerResult,
    calcAgentRB      : calcAgentRB,
    calcAgentResult  : calcAgentResult,
    calcLedgerNet    : calcLedgerNet,
    calcSaldoAtual   : calcSaldoAtual,
    calcPendente     : calcPendente,
    determineStatus  : determineStatus,
    calcClubKPIs     : calcClubKPIs,
  };

})();

Object.freeze(window.FinanceEngine);
