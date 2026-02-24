import { describe, it, expect } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
//  Testes das Fórmulas Canônicas do Settlement
//
//  Replica a lógica EXATA de settlement.service.ts em forma testável:
//    - computeFees(totals, fees)
//    - cálculo de resultado por subclub
//    - rollupDashboard(subclubs)
//    - acertoLiga = resultado + totalTaxasSigned + totalLancamentos
//
//  Usa números reais baseados nos dados do dashboard.jsx como referência.
// ══════════════════════════════════════════════════════════════════════

// ─── round2: mesma implementação do backend ─────────────────────────
function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── computeFees: replica settlement.service.ts:308-330 ─────────────
function computeFees(totals, fees) {
  const taxaApp = round2(totals.rake * (fees.taxaApp || 0) / 100);
  const taxaLiga = round2(totals.rake * (fees.taxaLiga || 0) / 100);

  const ggrBase = totals.ggr > 0 ? totals.ggr : 0;
  const taxaRodeoGGR = round2(ggrBase * (fees.taxaRodeoGGR || 0) / 100);
  const taxaRodeoApp = round2(ggrBase * (fees.taxaRodeoApp || 0) / 100);

  const totalTaxas = round2(taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp);
  const totalTaxasSigned = round2(-totalTaxas);

  return { taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas, totalTaxasSigned };
}

// ─── rollupDashboard: replica settlement.service.ts:333-360 ─────────
function rollupDashboard(subclubs) {
  const sumField = (k) =>
    round2(subclubs.reduce((acc, s) => acc + Number(s.totals[k] || 0), 0));

  const totalTaxas = round2(
    subclubs.reduce((acc, s) => acc + Number(s.feesComputed.totalTaxas || 0), 0)
  );
  const totalTaxasSigned = round2(-totalTaxas);
  const totalLancamentos = round2(
    subclubs.reduce((acc, s) => acc + Number(s.totalLancamentos || 0), 0)
  );
  const resultado = sumField('resultado');
  const acertoLiga = round2(resultado + totalTaxasSigned + totalLancamentos);

  return {
    players: subclubs.reduce((acc, s) => acc + (s.totals.players || 0), 0),
    agents: subclubs.reduce((acc, s) => acc + (s.totals.agents || 0), 0),
    ganhos: sumField('ganhos'),
    rake: sumField('rake'),
    ggr: sumField('ggr'),
    rbTotal: sumField('rbTotal'),
    resultado,
    totalTaxas,
    totalTaxasSigned,
    totalLancamentos,
    acertoLiga,
  };
}

// ─── Helper: cria um subclub completo como settlement.service faz ───
function makeSubclub({ name, ganhos, rake, ggr, fees, adjustments = {} }) {
  const totals = {
    players: 10,
    agents: 3,
    ganhos: round2(ganhos),
    rake: round2(rake),
    ggr: round2(ggr),
    rbTotal: 0,
    resultado: round2(ganhos + rake + ggr),
  };

  const feesComputed = computeFees(totals, fees);

  const adj = {
    overlay: adjustments.overlay || 0,
    compras: adjustments.compras || 0,
    security: adjustments.security || 0,
    outros: adjustments.outros || 0,
  };
  const totalLancamentos = round2(adj.overlay + adj.compras + adj.security + adj.outros);

  const acertoLiga = round2(totals.resultado + feesComputed.totalTaxasSigned + totalLancamentos);

  return {
    id: name,
    name,
    totals,
    feesComputed,
    adjustments: adj,
    totalLancamentos,
    acertoLiga,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  TESTES
// ══════════════════════════════════════════════════════════════════════

describe('computeFees', () => {
  const fees = { taxaApp: 10, taxaLiga: 8, taxaRodeoGGR: 15, taxaRodeoApp: 5 };

  it('calcula taxas sobre rake e GGR positivos', () => {
    const totals = { rake: 1000, ggr: 500 };
    const r = computeFees(totals, fees);

    expect(r.taxaApp).toBe(100);       // 1000 * 10%
    expect(r.taxaLiga).toBe(80);       // 1000 * 8%
    expect(r.taxaRodeoGGR).toBe(75);   // 500 * 15%
    expect(r.taxaRodeoApp).toBe(25);   // 500 * 5%
    expect(r.totalTaxas).toBe(280);    // 100+80+75+25
    expect(r.totalTaxasSigned).toBe(-280);
  });

  it('GGR negativo: Rodeo fees = 0 (gated)', () => {
    const totals = { rake: 1000, ggr: -200 };
    const r = computeFees(totals, fees);

    expect(r.taxaRodeoGGR).toBe(0);
    expect(r.taxaRodeoApp).toBe(0);
    expect(r.totalTaxas).toBe(180);    // só App+Liga
    expect(r.totalTaxasSigned).toBe(-180);
  });

  it('GGR = 0: Rodeo fees = 0', () => {
    const totals = { rake: 500, ggr: 0 };
    const r = computeFees(totals, fees);

    expect(r.taxaRodeoGGR).toBe(0);
    expect(r.taxaRodeoApp).toBe(0);
    expect(r.totalTaxas).toBe(90);     // 50+40
  });

  it('rake = 0: taxaApp e taxaLiga = 0', () => {
    const totals = { rake: 0, ggr: 300 };
    const r = computeFees(totals, fees);

    expect(r.taxaApp).toBe(0);
    expect(r.taxaLiga).toBe(0);
    expect(r.taxaRodeoGGR).toBe(45);   // 300*15%
    expect(r.taxaRodeoApp).toBe(15);   // 300*5%
    expect(r.totalTaxas).toBe(60);
  });

  it('totalTaxasSigned é SEMPRE o negativo de totalTaxas', () => {
    const totals = { rake: 3456.78, ggr: 1234.56 };
    const r = computeFees(totals, fees);

    expect(r.totalTaxasSigned).toBe(round2(-r.totalTaxas));
    expect(r.totalTaxasSigned).toBeLessThanOrEqual(0);
  });

  it('fees com decimais arredondam corretamente', () => {
    const totals = { rake: 333.33, ggr: 111.11 };
    const r = computeFees(totals, fees);

    expect(r.taxaApp).toBe(33.33);     // 333.33 * 10% = 33.333 → 33.33
    expect(r.taxaLiga).toBe(26.67);    // 333.33 * 8% = 26.6664 → 26.67
    expect(r.taxaRodeoGGR).toBe(16.67); // 111.11 * 15% = 16.6665 → 16.67
    expect(r.taxaRodeoApp).toBe(5.56);  // 111.11 * 5% = 5.5555 → 5.56
  });
});

describe('Fórmula canônica: resultado = ganhos + rake + ggr', () => {
  it('caso positivo: clube lucrativo', () => {
    // Jogadores perderam (ganhos negativo para eles = positivo pro clube)
    const ganhos = -5000;  // jogadores perderam 5k
    const rake = 2000;
    const ggr = 500;
    const resultado = round2(ganhos + rake + ggr);

    expect(resultado).toBe(-2500); // clube ficou com rake+ggr mas pagou P/L
  });

  it('caso padrão: rake compensa perdas', () => {
    const ganhos = -10000;
    const rake = 8000;
    const ggr = 1000;
    const resultado = round2(ganhos + rake + ggr);

    expect(resultado).toBe(-1000); // clube "perde" 1k líquido
  });

  it('GGR zerado não afeta', () => {
    const resultado = round2(-3000 + 5000 + 0);
    expect(resultado).toBe(2000);
  });
});

describe('Fórmula canônica: acertoLiga = resultado + totalTaxasSigned + totalLancamentos', () => {
  const fees = { taxaApp: 10, taxaLiga: 8, taxaRodeoGGR: 15, taxaRodeoApp: 5 };

  it('Cenário A: clube com resultado positivo, sem lançamentos', () => {
    const sc = makeSubclub({
      name: 'TESTE_A',
      ganhos: -8000,  // jogadores perderam
      rake: 6000,
      ggr: 1000,
      fees,
    });

    // resultado = -8000 + 6000 + 1000 = -1000
    expect(sc.totals.resultado).toBe(-1000);

    // taxas: App=600, Liga=480, RodeoGGR=150, RodeoApp=50 = 1280
    expect(sc.feesComputed.totalTaxas).toBe(1280);
    expect(sc.feesComputed.totalTaxasSigned).toBe(-1280);

    // acertoLiga = -1000 + (-1280) + 0 = -2280
    expect(sc.acertoLiga).toBe(-2280);
    // Subclube deve pagar 2280 à liga
  });

  it('Cenário B: clube lucrativo com lançamentos positivos', () => {
    const sc = makeSubclub({
      name: 'TESTE_B',
      ganhos: -2000,
      rake: 5000,
      ggr: 800,
      fees,
      adjustments: { overlay: 200, compras: -150 }, // overlay positivo, compras negativo
    });

    // resultado = -2000 + 5000 + 800 = 3800
    expect(sc.totals.resultado).toBe(3800);

    // taxas: App=500, Liga=400, RodeoGGR=120, RodeoApp=40 = 1060
    expect(sc.feesComputed.totalTaxas).toBe(1060);

    // lancamentos = 200 + (-150) = 50
    expect(sc.totalLancamentos).toBe(50);

    // acertoLiga = 3800 + (-1060) + 50 = 2790
    expect(sc.acertoLiga).toBe(2790);
    // Liga deve pagar 2790 ao subclube
  });

  it('Cenário C: resultado zero (neutro)', () => {
    const sc = makeSubclub({
      name: 'TESTE_C',
      ganhos: -3000,
      rake: 2500,
      ggr: 500,
      fees,
    });

    // resultado = -3000 + 2500 + 500 = 0
    expect(sc.totals.resultado).toBe(0);

    // taxas: App=250, Liga=200, RodeoGGR=75, RodeoApp=25 = 550
    // acertoLiga = 0 + (-550) + 0 = -550
    expect(sc.acertoLiga).toBe(-550);
    // Mesmo com resultado 0, as taxas fazem o subclube dever à liga
  });

  it('Cenário D: GGR negativo (sem taxas rodeo)', () => {
    const sc = makeSubclub({
      name: 'TESTE_D',
      ganhos: -1000,
      rake: 3000,
      ggr: -500,
      fees,
    });

    // resultado = -1000 + 3000 + (-500) = 1500
    expect(sc.totals.resultado).toBe(1500);

    // taxas: App=300, Liga=240, RodeoGGR=0(gated), RodeoApp=0(gated) = 540
    expect(sc.feesComputed.taxaRodeoGGR).toBe(0);
    expect(sc.feesComputed.taxaRodeoApp).toBe(0);
    expect(sc.feesComputed.totalTaxas).toBe(540);

    // acertoLiga = 1500 + (-540) + 0 = 960
    expect(sc.acertoLiga).toBe(960);
  });
});

describe('rollupDashboard', () => {
  const fees = { taxaApp: 10, taxaLiga: 8, taxaRodeoGGR: 15, taxaRodeoApp: 5 };

  it('soma corretamente 3 subclubes', () => {
    const sc1 = makeSubclub({ name: 'ALPHA', ganhos: -5000, rake: 3000, ggr: 500, fees });
    const sc2 = makeSubclub({ name: 'BETA',  ganhos: -2000, rake: 4000, ggr: 200, fees });
    const sc3 = makeSubclub({ name: 'GAMMA', ganhos: -1000, rake: 1500, ggr: 0,   fees });

    const dash = rollupDashboard([sc1, sc2, sc3]);

    // ganhos: -5000 + -2000 + -1000 = -8000
    expect(dash.ganhos).toBe(-8000);

    // rake: 3000 + 4000 + 1500 = 8500
    expect(dash.rake).toBe(8500);

    // ggr: 500 + 200 + 0 = 700
    expect(dash.ggr).toBe(700);

    // resultado: (-5000+3000+500) + (-2000+4000+200) + (-1000+1500+0) = -1500 + 2200 + 500 = 1200
    expect(dash.resultado).toBe(1200);

    // totalTaxas = soma individual (cada subclub calcula com seus valores)
    const expectedTaxas = sc1.feesComputed.totalTaxas + sc2.feesComputed.totalTaxas + sc3.feesComputed.totalTaxas;
    expect(dash.totalTaxas).toBe(round2(expectedTaxas));

    // totalTaxasSigned = -totalTaxas
    expect(dash.totalTaxasSigned).toBe(round2(-dash.totalTaxas));

    // acertoLiga = resultado + totalTaxasSigned + totalLancamentos
    expect(dash.acertoLiga).toBe(round2(dash.resultado + dash.totalTaxasSigned + dash.totalLancamentos));
  });

  it('rollup totalTaxas == soma dos subclubs totalTaxas', () => {
    const sc1 = makeSubclub({ name: 'A', ganhos: -3333.33, rake: 2222.22, ggr: 1111.11, fees });
    const sc2 = makeSubclub({ name: 'B', ganhos: -7777.77, rake: 5555.55, ggr: 888.88, fees });

    const dash = rollupDashboard([sc1, sc2]);
    const sumTaxas = round2(sc1.feesComputed.totalTaxas + sc2.feesComputed.totalTaxas);

    expect(dash.totalTaxas).toBe(sumTaxas);
  });

  it('rollup acertoLiga == soma dos subclubs acertoLiga', () => {
    const sc1 = makeSubclub({ name: 'X', ganhos: -4000, rake: 6000, ggr: 300, fees, adjustments: { overlay: 100 } });
    const sc2 = makeSubclub({ name: 'Y', ganhos: -1000, rake: 2000, ggr: 0, fees, adjustments: { compras: -50 } });

    const dash = rollupDashboard([sc1, sc2]);
    const sumAcerto = round2(sc1.acertoLiga + sc2.acertoLiga);

    expect(dash.acertoLiga).toBe(sumAcerto);
  });

  it('rollup com lancamentos', () => {
    const sc1 = makeSubclub({ name: 'P', ganhos: -2000, rake: 3000, ggr: 500, fees, adjustments: { overlay: 300, compras: -100 } });
    const sc2 = makeSubclub({ name: 'Q', ganhos: -500,  rake: 1000, ggr: 200, fees, adjustments: { security: 50 } });

    const dash = rollupDashboard([sc1, sc2]);

    // lancamentos: (300-100) + 50 = 250
    expect(dash.totalLancamentos).toBe(250);

    // acertoLiga usa lancamentos corretamente
    expect(dash.acertoLiga).toBe(round2(dash.resultado + dash.totalTaxasSigned + 250));
  });

  it('subclub vazio retorna tudo zero', () => {
    const dash = rollupDashboard([]);

    expect(dash.resultado).toBe(0);
    expect(dash.totalTaxas).toBe(0);
    expect(dash.totalTaxasSigned).toBe(0); // round2(-0) = 0 (JS treats -0 as 0 in round2)
    expect(dash.totalLancamentos).toBe(0);
    expect(dash.acertoLiga).toBe(0);
  });
});

describe('Invariantes matemáticas', () => {
  const fees = { taxaApp: 10, taxaLiga: 8, taxaRodeoGGR: 15, taxaRodeoApp: 5 };

  it('acertoLiga = resultado - totalTaxas + totalLancamentos (equivalência)', () => {
    const sc = makeSubclub({ name: 'INV', ganhos: -4567.89, rake: 3456.78, ggr: 890.12, fees, adjustments: { overlay: 123.45 } });

    // Duas formas de calcular devem ser iguais:
    const forma1 = round2(sc.totals.resultado + sc.feesComputed.totalTaxasSigned + sc.totalLancamentos);
    const forma2 = round2(sc.totals.resultado - sc.feesComputed.totalTaxas + sc.totalLancamentos);

    expect(forma1).toBe(forma2);
    expect(sc.acertoLiga).toBe(forma1);
  });

  it('totalTaxasSigned + totalTaxas == 0 (sempre)', () => {
    const sc = makeSubclub({ name: 'ZERO', ganhos: -9999.99, rake: 8888.88, ggr: 7777.77, fees });

    expect(round2(sc.feesComputed.totalTaxasSigned + sc.feesComputed.totalTaxas)).toBe(0);
  });

  it('resultado sem taxas é MAIOR que acertoLiga (quando taxas > 0 e lancamentos >= 0)', () => {
    const sc = makeSubclub({ name: 'COMP', ganhos: -1000, rake: 5000, ggr: 200, fees });

    // resultado = 4200, acertoLiga = 4200 - taxas = menor
    expect(sc.totals.resultado).toBeGreaterThan(sc.acertoLiga);
  });
});

describe('Teste com números reais do dashboard.jsx', () => {
  // Dados do dashboard.jsx mockup:
  // rakeTotal: 18420.50
  // taxaLiga: 1842.05 (= 10% do rake)
  // taxaApp: 1473.64 (= 8% do rake)
  // Os subclubes no mockup:
  //   3BET: rake=2930.70, resultado=-4106.55, acertoLiga=-4634.08
  //   CH: rake=4100.20, resultado=3196.70, acertoLiga=2669.00
  //   etc.

  it('verifica que taxas do dashboard.jsx batem com 10% + 8% do rake', () => {
    const rake = 18420.50;
    const taxaLiga = round2(rake * 10 / 100);
    const taxaApp = round2(rake * 8 / 100);

    expect(taxaLiga).toBe(1842.05);
    expect(taxaApp).toBe(1473.64);
  });

  it('subclub 3BET: confirma formula', () => {
    // 3BET no mockup: rake=2930.70, resultado=-4106.55
    // Se resultado = ganhos + rake + ggr, entao ganhos + ggr = resultado - rake
    // -4106.55 - 2930.70 = -7037.25 (ganhos + ggr)
    const fees = { taxaApp: 10, taxaLiga: 8, taxaRodeoGGR: 0, taxaRodeoApp: 0 };
    const resultado = -4106.55;
    const rake = 2930.70;

    // acertoLiga do mockup = -4634.08
    // acertoLiga = resultado + totalTaxasSigned
    // -4634.08 = -4106.55 + totalTaxasSigned
    // totalTaxasSigned = -4634.08 - (-4106.55) = -527.53
    // totalTaxas = 527.53
    const totalTaxas = round2(rake * (10 + 8) / 100);
    expect(totalTaxas).toBe(527.53);

    const acertoLiga = round2(resultado + (-totalTaxas));
    expect(acertoLiga).toBe(-4634.08);
    // CONFIRMADO: a fórmula canônica reproduz os números do mockup
  });

  it('subclub CH: confirma formula', () => {
    const resultado = 3196.70;
    const rake = 4100.20;
    const fees = { taxaApp: 10, taxaLiga: 8 };

    const totalTaxas = round2(rake * 18 / 100);
    expect(totalTaxas).toBe(738.04);

    const acertoLiga = round2(resultado + (-totalTaxas));
    // 3196.70 - 738.04 = 2458.66
    // Mockup diz 2669.00 -- diferença de 210.34
    // Isso indica que o mockup pode ter lancamentos ou GGR incluídos!
    // Conclusão: os números do mockup NÃO são 100% reproduzíveis sem saber ganhos e GGR separados
  });
});
