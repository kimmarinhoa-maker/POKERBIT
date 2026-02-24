import { describe, it, expect } from 'vitest';
import FE from '../index.js';

// ─── calcPlayerResult ────────────────────────────────────────────────
describe('calcPlayerResult', () => {
  it('calcula ganhos + rake*rb/100 basico', () => {
    const player = { ganhos: 100, rake: 200 };
    expect(FE.calcPlayerResult(player, 10)).toBeCloseTo(120); // 100 + 200*10/100
  });

  it('rbPct=0 retorna so ganhos', () => {
    expect(FE.calcPlayerResult({ ganhos: 50, rake: 300 }, 0)).toBeCloseTo(50);
  });

  it('ganhos negativo (jogador perdeu)', () => {
    expect(FE.calcPlayerResult({ ganhos: -500, rake: 100 }, 20)).toBeCloseTo(-480);
  });

  it('nulls tratados como 0', () => {
    expect(FE.calcPlayerResult({ ganhos: null, rake: null }, null)).toBe(0);
  });

  it('rake negativo (credito)', () => {
    expect(FE.calcPlayerResult({ ganhos: 0, rake: -100 }, 50)).toBeCloseTo(-50);
  });

  it('pct grande (100%)', () => {
    expect(FE.calcPlayerResult({ ganhos: 0, rake: 200 }, 100)).toBeCloseTo(200);
  });
});

// ─── calcAgentRB ─────────────────────────────────────────────────────
describe('calcAgentRB', () => {
  const players = [
    { rake: 100 },
    { rake: 200 },
  ];

  it('modo nao-direto: totalRake * agRbPct/100', () => {
    expect(FE.calcAgentRB(players, 10, false)).toBeCloseTo(30); // 300*10/100
  });

  it('modo direto: soma rake*playerPct/100 por jogador', () => {
    const getPct = (p) => p.rake === 100 ? 20 : 10;
    expect(FE.calcAgentRB(players, 0, true, getPct)).toBeCloseTo(40); // 100*20/100 + 200*10/100
  });

  it('pct=0 retorna 0 (nao-direto)', () => {
    expect(FE.calcAgentRB(players, 0, false)).toBe(0);
  });

  it('array vazio retorna 0', () => {
    expect(FE.calcAgentRB([], 50, false)).toBe(0);
  });

  it('direto sem getPlayerPct usa 0', () => {
    expect(FE.calcAgentRB(players, 10, true)).toBe(0);
  });

  it('direto com pct diferente por jogador', () => {
    const ps = [{ rake: 500 }, { rake: 300 }];
    const getPct = (p) => p.rake === 500 ? 5 : 15;
    // 500*5/100 + 300*15/100 = 25+45 = 70
    expect(FE.calcAgentRB(ps, 0, true, getPct)).toBeCloseTo(70);
  });
});

// ─── calcAgentResult ─────────────────────────────────────────────────
describe('calcAgentResult', () => {
  const players = [
    { ganhos: 100, rake: 50 },
    { ganhos: -200, rake: 150 },
  ];

  it('retorna rakeTime, ganhosTime, pctAgente, rbAgente, resultadoAgente', () => {
    const r = FE.calcAgentResult(players, 20, false);
    expect(r.rakeTime).toBeCloseTo(200);     // 50+150
    expect(r.ganhosTime).toBeCloseTo(-100);  // 100-200
    expect(r.pctAgente).toBe(20);
    expect(r.rbAgente).toBeCloseTo(40);      // 200*20/100
    expect(r.resultadoAgente).toBeCloseTo(-60); // -100+40
  });

  it('direto: pctAgente=0, usa getPlayerPct', () => {
    const getPct = () => 10;
    const r = FE.calcAgentResult(players, 0, true, getPct);
    expect(r.pctAgente).toBe(0);
    expect(r.rbAgente).toBeCloseTo(20); // (50*10/100)+(150*10/100)
  });

  it('array vazio retorna zeros', () => {
    const r = FE.calcAgentResult([], 10, false);
    expect(r.rakeTime).toBe(0);
    expect(r.ganhosTime).toBe(0);
    expect(r.resultadoAgente).toBe(0);
  });

  it('resultadoAgente = ganhosTime + rbAgente', () => {
    const r = FE.calcAgentResult([{ ganhos: 300, rake: 100 }], 50, false);
    expect(r.resultadoAgente).toBeCloseTo(r.ganhosTime + r.rbAgente);
  });
});

// ─── calcLedgerNet ───────────────────────────────────────────────────
describe('calcLedgerNet', () => {
  it('entradas somam dir=in', () => {
    const h = [{ dir: 'in', valor: 100 }, { dir: 'in', valor: 50 }];
    expect(FE.calcLedgerNet(h).entradas).toBe(150);
  });

  it('saidas somam dir=out', () => {
    const h = [{ dir: 'out', valor: 200 }];
    expect(FE.calcLedgerNet(h).saidas).toBe(200);
  });

  it('net = entradas - saidas', () => {
    const h = [{ dir: 'in', valor: 300 }, { dir: 'out', valor: 100 }];
    const r = FE.calcLedgerNet(h);
    expect(r.net).toBe(200);
  });

  it('vazio retorna zeros', () => {
    const r = FE.calcLedgerNet([]);
    expect(r).toEqual({ entradas: 0, saidas: 0, net: 0 });
  });

  it('null retorna zeros', () => {
    expect(FE.calcLedgerNet(null)).toEqual({ entradas: 0, saidas: 0, net: 0 });
  });

  it('sem dir assume in', () => {
    const h = [{ valor: 100 }];
    expect(FE.calcLedgerNet(h).entradas).toBe(100);
  });
});

// ─── calcSaldoAtual ──────────────────────────────────────────────────
describe('calcSaldoAtual', () => {
  it('formula canonica: saldoAnterior + resultadoSemana - ledgerNet', () => {
    expect(FE.calcSaldoAtual(1000, -200, 300)).toBe(500);
  });

  it('todos zeros', () => {
    expect(FE.calcSaldoAtual(0, 0, 0)).toBe(0);
  });

  it('valores negativos', () => {
    expect(FE.calcSaldoAtual(-100, -50, -30)).toBe(-120); // -100 + -50 - -30 = -120
  });

  it('nulls tratados como 0', () => {
    expect(FE.calcSaldoAtual(null, null, null)).toBe(0);
  });
});

// ─── determineStatus ─────────────────────────────────────────────────
describe('determineStatus', () => {
  it('neutro: saldo ~0 sem movimentacoes', () => {
    expect(FE.determineStatus(0, [])).toBe('neutro');
  });

  it('neutro: saldo < 0.01 sem movimentacoes', () => {
    expect(FE.determineStatus(0.005, [])).toBe('neutro');
  });

  it('aberto: saldo > 0 sem movimentacoes', () => {
    expect(FE.determineStatus(500, [])).toBe('aberto');
  });

  it('parcial: saldo > 0 com movimentacoes', () => {
    expect(FE.determineStatus(200, [{ dir: 'in', valor: 100 }])).toBe('parcial');
  });

  it('pago: saldo ~0 com movimentacoes', () => {
    expect(FE.determineStatus(0, [{ dir: 'in', valor: 500 }])).toBe('pago');
  });

  it('aberto negativo: saldo < 0 sem movimentacoes', () => {
    expect(FE.determineStatus(-500, [])).toBe('aberto');
  });
});

// ─── calcClubKPIs ────────────────────────────────────────────────────
describe('calcClubKPIs', () => {
  const players = [
    { ganhos: 1000, rake: 500, ggr: 200, aname: 'Agent1' },
    { ganhos: -300, rake: 300, ggr: 100, aname: 'Agent2' },
  ];
  const ligaConfig = { taxaApp: 10, taxaLiga: 5, taxaRodeoGGR: 20, taxaRodeoApp: 10 };

  it('calcula totais corretos', () => {
    const r = FE.calcClubKPIs(players, ligaConfig, () => 0);
    expect(r.totGanhos).toBe(700);
    expect(r.totRake).toBe(800);
    expect(r.totGGR).toBe(300);
    expect(r.totResult).toBe(1800); // 700+800+300
  });

  it('calcula taxas corretas', () => {
    const r = FE.calcClubKPIs(players, ligaConfig, () => 0);
    expect(r.taxaApp).toBeCloseTo(80);    // 800*10/100
    expect(r.taxaLiga).toBeCloseTo(40);   // 800*5/100
    expect(r.taxaRodeoGGR).toBeCloseTo(60);  // 300*20/100
    expect(r.taxaRodeoApp).toBeCloseTo(30);  // 300*10/100
    expect(r.totalTaxas).toBeCloseTo(210);
    expect(r.resultado).toBeCloseTo(1590); // 1800-210
  });

  it('GGR negativo: taxaRodeo = 0', () => {
    const ps = [{ ganhos: 100, rake: 200, ggr: -50, aname: 'A' }];
    const r = FE.calcClubKPIs(ps, ligaConfig, () => 0);
    expect(r.taxaRodeoGGR).toBe(0);
    expect(r.taxaRodeoApp).toBe(0);
  });

  it('sem jogadores retorna zeros', () => {
    const r = FE.calcClubKPIs([], ligaConfig, () => 0);
    expect(r.totGanhos).toBe(0);
    expect(r.totRake).toBe(0);
    expect(r.resultado).toBe(0);
  });
});
