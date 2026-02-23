// ══════════════════════════════════════════════════════════════════════
//  testes-console.js — Testes manuais para colar no DevTools Console
//
//  COMO USAR:
//    1. Abra fechamento-poker.html no Chrome/Edge
//    2. Abra DevTools (F12) → Console
//    3. Cole este arquivo inteiro ou cada bloco separadamente
//    4. Verifique se todos os testes passam (✅) ou falham (❌)
// ══════════════════════════════════════════════════════════════════════

(function runTests() {
  'use strict';

  var passed = 0, failed = 0;

  function assert(label, expected, actual) {
    var ok = Math.abs(actual - expected) < 0.01;
    if (ok) {
      console.log('✅ ' + label + ' → ' + actual);
      passed++;
    } else {
      console.error('❌ ' + label + ' → esperado ' + expected + ', obtido ' + actual);
      failed++;
    }
  }

  function assertEq(label, expected, actual) {
    var ok = (expected === actual);
    if (ok) {
      console.log('✅ ' + label + ' → "' + actual + '"');
      passed++;
    } else {
      console.error('❌ ' + label + ' → esperado "' + expected + '", obtido "' + actual + '"');
      failed++;
    }
  }

  console.group('══ TESTES FINANCE ENGINE ══');

  // ── Teste 1: entrada reduz openBalance ─────────────────────────────
  // saldoAnterior=100, resultadoSemana=0, dir='in' de 30 → deve virar 70
  console.group('Teste 1 — dir=in reduz openBalance');
  var hist1 = [{ dir: 'in', valor: 30 }];
  var ledger1 = FinanceEngine.calcLedgerNet(hist1);
  assert('calcLedgerNet.net',      30, ledger1.net);
  assert('calcLedgerNet.entradas', 30, ledger1.entradas);
  assert('calcLedgerNet.saidas',    0, ledger1.saidas);
  var saldo1 = FinanceEngine.calcSaldoAtual(100, 0, ledger1.net);
  assert('calcSaldoAtual (100 + 0 - 30)', 70, saldo1);
  console.groupEnd();

  // ── Teste 2: saída aumenta openBalance ────────────────────────────
  // saldoAnterior=100, resultadoSemana=0, dir='out' de 30 → deve virar 130
  console.group('Teste 2 — dir=out aumenta openBalance');
  var hist2 = [{ dir: 'out', valor: 30 }];
  var ledger2 = FinanceEngine.calcLedgerNet(hist2);
  assert('calcLedgerNet.net',       -30, ledger2.net);
  assert('calcLedgerNet.entradas',    0, ledger2.entradas);
  assert('calcLedgerNet.saidas',     30, ledger2.saidas);
  var saldo2 = FinanceEngine.calcSaldoAtual(100, 0, ledger2.net);
  assert('calcSaldoAtual (100 + 0 - (-30))', 130, saldo2);
  console.groupEnd();

  // ── Teste 3: entrada + saída iguais = saldo inalterado ────────────
  // saldoAnterior=100, resultadoSemana=0, dir='in' 30 + dir='out' 30 → deve ser 100
  console.group('Teste 3 — in=30 + out=30 → saldo inalterado');
  var hist3 = [{ dir: 'in', valor: 30 }, { dir: 'out', valor: 30 }];
  var ledger3 = FinanceEngine.calcLedgerNet(hist3);
  assert('calcLedgerNet.net',      0, ledger3.net);
  assert('calcLedgerNet.entradas', 30, ledger3.entradas);
  assert('calcLedgerNet.saidas',   30, ledger3.saidas);
  var saldo3 = FinanceEngine.calcSaldoAtual(100, 0, ledger3.net);
  assert('calcSaldoAtual (100 + 0 - 0)', 100, saldo3);
  console.groupEnd();

  // ── Teste 4: determineStatus — neutro ─────────────────────────────
  console.group('Teste 4 — determineStatus neutro');
  assertEq('openBalance=0, sem mov', 'neutro', FinanceEngine.determineStatus(0, []));
  assertEq('openBalance≈0, sem mov', 'neutro', FinanceEngine.determineStatus(0.001, []));
  console.groupEnd();

  // ── Teste 5: determineStatus — aberto ────────────────────────────
  console.group('Teste 5 — determineStatus aberto');
  assertEq('openBalance=70, sem mov', 'aberto', FinanceEngine.determineStatus(70, []));
  assertEq('openBalance=70, sem mov (null)', 'aberto', FinanceEngine.determineStatus(70, null));
  console.groupEnd();

  // ── Teste 6: determineStatus — parcial ───────────────────────────
  console.group('Teste 6 — determineStatus parcial');
  var histParcial = [{ dir: 'in', valor: 30 }];
  assertEq('openBalance=70, mov 30', 'parcial', FinanceEngine.determineStatus(70, histParcial));
  console.groupEnd();

  // ── Teste 7: determineStatus — pago ──────────────────────────────
  console.group('Teste 7 — determineStatus pago');
  var histPago = [{ dir: 'in', valor: 100 }];
  assertEq('openBalance≈0, mov 100', 'pago', FinanceEngine.determineStatus(0, histPago));
  assertEq('openBalance=0.005, mov', 'pago', FinanceEngine.determineStatus(0.005, histPago));
  console.groupEnd();

  // ── Teste 8: in+out não cria "houveMov" falso ────────────────────
  console.group('Teste 8 — in=30 + out=30 não gera status falso');
  // Se totalPago fosse usado (errado): soma = 60 → "houve pagamento" → marcaria parcial
  // Com calcLedgerNet: net=0, entradas=30, saidas=30 → houveMov=true, openBalance=100 → parcial
  // NOTA: neste caso há movimento real (30 in + 30 out), então parcial É correto
  var histCancel = [{ dir: 'in', valor: 30 }, { dir: 'out', valor: 30 }];
  var statusCancel = FinanceEngine.determineStatus(100, histCancel);
  assertEq('in=30 out=30 com saldo 100 → parcial', 'parcial', statusCancel);
  console.groupEnd();

  // ── Teste 9: resultado do jogador ────────────────────────────────
  console.group('Teste 9 — calcPlayerResult');
  var player = { ganhos: -500, rake: 200 };
  assert('ganhos=-500, rake=200, RB=50% → -400', -400, FinanceEngine.calcPlayerResult(player, 50));
  assert('ganhos=0,    rake=100, RB=20% → 20',    20,  FinanceEngine.calcPlayerResult({ ganhos: 0, rake: 100 }, 20));
  console.groupEnd();

  // ── Teste 10: calcAgentRB normal ─────────────────────────────────
  console.group('Teste 10 — calcAgentRB modo normal');
  var players10 = [{ rake: 100 }, { rake: 200 }];
  assert('totalRake=300, 50% → 150', 150, FinanceEngine.calcAgentRB(players10, 50, false, null));
  console.groupEnd();

  // ── Resumo ───────────────────────────────────────────────────────
  console.groupEnd(); // ══ TESTES FINANCE ENGINE ══
  console.log('');
  console.log('══ RESULTADO: ' + passed + ' passou(aram) · ' + failed + ' falhou(aram) ══');
  if (failed === 0) console.log('✅ Todos os testes passaram!');
  else              console.error('❌ ' + failed + ' teste(s) falhando — verifique acima.');

})();
