// ══════════════════════════════════════════════════════════════════════
//  packages/engine/index.js — Engine Financeira Pura (Node.js)
//  Adaptado de financeEngine.js (browser) para módulo CommonJS.
//  Sem DOM, sem localStorage, sem variáveis globais.
//
//  CONVENÇÃO DE SINAIS (canônica):
//    openBalance > 0  → clube deve à entidade (entidade a RECEBER)
//    openBalance < 0  → entidade deve ao clube (entidade a PAGAR)
//    dir = 'in'       → pagamento recebido pelo clube → reduz openBalance
//    dir = 'out'      → pagamento enviado pelo clube   → aumenta openBalance
//    ledgerNet        = entradas(dir='in') − saidas(dir='out')
//
//  FÓRMULA CANÔNICA:
//    resultadoSemana = ganhos + rakeback
//    ledgerNet       = entradas − saidas
//    saldoAtual      = saldoAnterior + resultadoSemana − ledgerNet
// ══════════════════════════════════════════════════════════════════════

const FinanceEngine = (function () {
  'use strict';

  // ─── RESULTADO DA SEMANA ─────────────────────────────────────────────

  function calcPlayerResult(player, rbPct) {
    const rbVal = (Number(player.rake) || 0) * (Number(rbPct) || 0) / 100;
    return (Number(player.ganhos) || 0) + rbVal;
  }

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

  function calcAgentResult(players, agRbPct, isDirect, getPlayerPct) {
    const rakeTime   = players.reduce(function (s, p) { return s + (Number(p.rake)   || 0); }, 0);
    const ganhosTime = players.reduce(function (s, p) { return s + (Number(p.ganhos) || 0); }, 0);
    const rbAgente   = calcAgentRB(players, agRbPct, isDirect, getPlayerPct);
    const pctAgente  = isDirect ? 0 : (Number(agRbPct) || 0);
    return { rakeTime, ganhosTime, pctAgente, rbAgente, resultadoAgente: ganhosTime + rbAgente };
  }

  // ─── LEDGER NET ──────────────────────────────────────────────────────

  function calcLedgerNet(historico) {
    var entradas = 0, saidas = 0;
    (historico || []).forEach(function (h) {
      if ((h.dir || 'in') === 'in') entradas += (h.valor || 0);
      else                          saidas   += (h.valor || 0);
    });
    return { entradas: entradas, saidas: saidas, net: entradas - saidas };
  }

  // ─── FÓRMULA CANÔNICA DO SALDO ───────────────────────────────────────

  function calcSaldoAtual(saldoAnterior, resultadoSemana, ledgerNet) {
    return (Number(saldoAnterior)   || 0)
         + (Number(resultadoSemana) || 0)
         - (Number(ledgerNet)       || 0);
  }

  // ─── STATUS DE LIQUIDAÇÃO ────────────────────────────────────────────

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

  function calcClubKPIs(players, ligaConfig, getAgentRBFn) {
    function sumF(arr, key) {
      return arr.reduce(function (s, p) { return s + (Number(p[key]) || 0); }, 0);
    }
    function rate(v) { return (Number(v) || 0) / 100; }

    const totGanhos = sumF(players, 'ganhos');
    const totRake   = sumF(players, 'rake');
    const totGGR    = sumF(players, 'ggr');

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

Object.freeze(FinanceEngine);
module.exports = FinanceEngine;
