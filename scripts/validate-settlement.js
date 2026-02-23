// ══════════════════════════════════════════════════════════════════════
//  Script de Validacao: Compara numeros Web API vs HTML App
//
//  Uso:
//    1. Rodar migration 005 no Supabase
//    2. Re-importar XLSX
//    3. Abrir o terminal na pasta do projeto
//    4. Rodar: node scripts/validate-settlement.js
//
//  Requer: API rodando em localhost:3001
//  Saida: tabela comparativa por subclube
// ══════════════════════════════════════════════════════════════════════

const API_BASE = 'http://localhost:3001/api';

// ─── Config: ajuste conforme seu ambiente ─────────────────────────
const CONFIG = {
  // Credenciais de login (ajuste para as suas)
  email: 'admin@poker.com',
  password: 'admin123',
};

// ─── Helpers ──────────────────────────────────────────────────────
function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  VALIDACAO DO SETTLEMENT — Web API');
  console.log('══════════════════════════════════════════════════\n');

  // 1. Login
  console.log('1. Fazendo login...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CONFIG.email, password: CONFIG.password }),
  });
  const loginData = await loginRes.json();

  if (!loginData.success) {
    console.error('   FALHA no login:', loginData.error);
    process.exit(1);
  }

  const token = loginData.data.session.access_token;
  const tenantId = loginData.data.tenants[0]?.id;
  console.log('   OK — tenant:', tenantId);

  // 2. Listar settlements
  console.log('\n2. Buscando settlements...');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
  };

  const settRes = await fetch(`${API_BASE}/settlements`, { headers });
  const settData = await settRes.json();

  if (!settData.success || !settData.data?.length) {
    console.error('   Nenhum settlement encontrado. Reimporte o XLSX primeiro.');
    process.exit(1);
  }

  const settlements = settData.data;
  console.log(`   Encontrados: ${settlements.length} settlement(s)`);

  // 3. Pegar o settlement mais recente
  const sett = settlements[0];
  console.log(`   Usando: ${sett.week_start} (${sett.status}) — ID: ${sett.id}`);

  // 4. Chamar /full
  console.log('\n3. Chamando /settlements/:id/full...');
  const fullRes = await fetch(`${API_BASE}/settlements/${sett.id}/full`, { headers });
  const fullData = await fullRes.json();

  if (!fullData.success || !fullData.data) {
    console.error('   FALHA ao carregar /full:', fullData.error);
    process.exit(1);
  }

  const { subclubs, dashboardTotals, fees, meta } = fullData.data;

  // 5. Exibir meta
  console.log('\n── META ──────────────────────────────────────────');
  console.log('   Rounding:', meta?.roundingPolicy);
  console.log('   Version:', meta?.calculationVersion);
  console.log('   Formula:', meta?.formula);
  console.log('   Generated:', meta?.generatedAt);

  // 6. Exibir fees
  console.log('\n── FEES CONFIG ───────────────────────────────────');
  console.log('   taxaApp:       ', fees.taxaApp, '% (base: rake)');
  console.log('   taxaLiga:      ', fees.taxaLiga, '% (base: rake)');
  console.log('   taxaRodeoGGR:  ', fees.taxaRodeoGGR, '% (base: ggr)');
  console.log('   taxaRodeoApp:  ', fees.taxaRodeoApp, '% (base: ggr)');

  // 7. Tabela por subclube
  console.log('\n══════════════════════════════════════════════════');
  console.log('  BREAKDOWN POR SUBCLUBE');
  console.log('══════════════════════════════════════════════════');

  for (const sc of subclubs) {
    console.log(`\n┌─────────────────────────────────────────────────`);
    console.log(`│ ${sc.name}  (${sc.totals.players} jogadores, ${sc.totals.agents} agentes)`);
    console.log(`├─────────────────────────────────────────────────`);
    console.log(`│ Ganhos:          ${formatBRL(sc.totals.ganhos)}`);
    console.log(`│ Rake:            ${formatBRL(sc.totals.rake)}`);
    console.log(`│ GGR:             ${formatBRL(sc.totals.ggr)}`);
    console.log(`│ RB Total:        ${formatBRL(sc.totals.rbTotal)}`);
    console.log(`│ Resultado:       ${formatBRL(sc.totals.resultado)}`);
    console.log(`│`);
    console.log(`│ ── Taxas Computadas ──`);
    console.log(`│ taxaApp:         ${formatBRL(sc.feesComputed.taxaApp)}  (${fees.taxaApp}% de ${formatBRL(sc.totals.rake)})`);
    console.log(`│ taxaLiga:        ${formatBRL(sc.feesComputed.taxaLiga)}  (${fees.taxaLiga}% de ${formatBRL(sc.totals.rake)})`);
    console.log(`│ taxaRodeoGGR:    ${formatBRL(sc.feesComputed.taxaRodeoGGR)}  (${fees.taxaRodeoGGR}% de ${formatBRL(sc.totals.ggr)})`);
    console.log(`│ taxaRodeoApp:    ${formatBRL(sc.feesComputed.taxaRodeoApp)}  (${fees.taxaRodeoApp}% de ${formatBRL(sc.totals.ggr)})`);
    console.log(`│ TOTAL TAXAS:     ${formatBRL(sc.feesComputed.totalTaxas)} (abs)  /  ${formatBRL(sc.feesComputed.totalTaxasSigned)} (signed)`);
    console.log(`│`);
    console.log(`│ ── Lancamentos ──`);
    console.log(`│ Overlay:         ${formatBRL(sc.adjustments.overlay)}`);
    console.log(`│ Compras:         ${formatBRL(sc.adjustments.compras)}`);
    console.log(`│ Security:        ${formatBRL(sc.adjustments.security)}`);
    console.log(`│ Outros:          ${formatBRL(sc.adjustments.outros)}`);
    console.log(`│ TOTAL LANC:      ${formatBRL(sc.totalLancamentos)}`);
    console.log(`│`);
    console.log(`│ ══ ACERTO LIGA ══`);
    console.log(`│ ${formatBRL(sc.totals.resultado)} + ${formatBRL(sc.feesComputed.totalTaxasSigned)} + ${formatBRL(sc.totalLancamentos)} = ${formatBRL(sc.acertoLiga)}`);
    console.log(`│ Direcao: ${sc.acertoDirecao}`);
    console.log(`└─────────────────────────────────────────────────`);

    // Validacao manual: resultado + taxasSigned + lancamentos = acertoLiga
    const check = round2(sc.totals.resultado + sc.feesComputed.totalTaxasSigned + sc.totalLancamentos);
    if (Math.abs(check - sc.acertoLiga) > 0.01) {
      console.log(`   ⚠️  DIVERGENCIA: calc=${check}, acertoLiga=${sc.acertoLiga}, diff=${round2(check - sc.acertoLiga)}`);
    } else {
      console.log(`   ✅ Formula validada: acertoLiga bate com calc`);
    }

    // Validacao taxas: rate * base = computed
    const checkTaxaApp = round2(sc.totals.rake * fees.taxaApp / 100);
    const checkTaxaLiga = round2(sc.totals.rake * fees.taxaLiga / 100);
    const ggrBase = sc.totals.ggr > 0 ? sc.totals.ggr : 0;
    const checkRodeoGGR = round2(ggrBase * fees.taxaRodeoGGR / 100);
    const checkRodeoApp = round2(ggrBase * fees.taxaRodeoApp / 100);

    const taxaErrors = [];
    if (Math.abs(checkTaxaApp - sc.feesComputed.taxaApp) > 0.01) taxaErrors.push(`taxaApp: expected ${checkTaxaApp}, got ${sc.feesComputed.taxaApp}`);
    if (Math.abs(checkTaxaLiga - sc.feesComputed.taxaLiga) > 0.01) taxaErrors.push(`taxaLiga: expected ${checkTaxaLiga}, got ${sc.feesComputed.taxaLiga}`);
    if (Math.abs(checkRodeoGGR - sc.feesComputed.taxaRodeoGGR) > 0.01) taxaErrors.push(`rodeoGGR: expected ${checkRodeoGGR}, got ${sc.feesComputed.taxaRodeoGGR}`);
    if (Math.abs(checkRodeoApp - sc.feesComputed.taxaRodeoApp) > 0.01) taxaErrors.push(`rodeoApp: expected ${checkRodeoApp}, got ${sc.feesComputed.taxaRodeoApp}`);

    if (taxaErrors.length > 0) {
      console.log(`   ⚠️  TAXAS DIVERGENTES:`);
      taxaErrors.forEach(e => console.log(`      - ${e}`));
    } else {
      console.log(`   ✅ Todas as taxas batem com rate * base`);
    }
  }

  // 8. Dashboard totals
  console.log('\n══════════════════════════════════════════════════');
  console.log('  DASHBOARD TOTALS (ROLLUP)');
  console.log('══════════════════════════════════════════════════');
  console.log(`   Jogadores:    ${dashboardTotals.players}`);
  console.log(`   Agentes:      ${dashboardTotals.agents}`);
  console.log(`   Ganhos:       ${formatBRL(dashboardTotals.ganhos)}`);
  console.log(`   Rake:         ${formatBRL(dashboardTotals.rake)}`);
  console.log(`   GGR:          ${formatBRL(dashboardTotals.ggr)}`);
  console.log(`   RB Total:     ${formatBRL(dashboardTotals.rbTotal)}`);
  console.log(`   Resultado:    ${formatBRL(dashboardTotals.resultado)}`);
  console.log(`   Total Taxas:  ${formatBRL(dashboardTotals.totalTaxas)}`);

  // Validacao: rollup bate com soma dos subclubs
  const sumCheck = {
    players: subclubs.reduce((s, sc) => s + sc.totals.players, 0),
    rake: round2(subclubs.reduce((s, sc) => s + sc.totals.rake, 0)),
    resultado: round2(subclubs.reduce((s, sc) => s + sc.totals.resultado, 0)),
    totalTaxas: round2(subclubs.reduce((s, sc) => s + sc.feesComputed.totalTaxas, 0)),
  };

  const rollupOk =
    sumCheck.players === dashboardTotals.players &&
    Math.abs(sumCheck.rake - dashboardTotals.rake) <= 0.01 &&
    Math.abs(sumCheck.resultado - dashboardTotals.resultado) <= 0.01 &&
    Math.abs(sumCheck.totalTaxas - dashboardTotals.totalTaxas) <= 0.01;

  if (rollupOk) {
    console.log(`\n   ✅ Rollup dashboard bate com soma dos subclubes`);
  } else {
    console.log(`\n   ⚠️  ROLLUP DIVERGENTE:`);
    console.log(`      players: dashboard=${dashboardTotals.players}, sum=${sumCheck.players}`);
    console.log(`      rake: dashboard=${dashboardTotals.rake}, sum=${sumCheck.rake}`);
    console.log(`      resultado: dashboard=${dashboardTotals.resultado}, sum=${sumCheck.resultado}`);
    console.log(`      totalTaxas: dashboard=${dashboardTotals.totalTaxas}, sum=${sumCheck.totalTaxas}`);
  }

  // 9. Edge cases
  console.log('\n══════════════════════════════════════════════════');
  console.log('  EDGE CASE CHECKS');
  console.log('══════════════════════════════════════════════════');

  for (const sc of subclubs) {
    const issues = [];

    // GGR negativo
    if (sc.totals.ggr < 0) {
      if (sc.feesComputed.taxaRodeoGGR !== 0 || sc.feesComputed.taxaRodeoApp !== 0) {
        issues.push(`GGR negativo (${formatBRL(sc.totals.ggr)}) mas taxas GGR nao sao zero!`);
      } else {
        issues.push(`GGR negativo (${formatBRL(sc.totals.ggr)}) — taxas GGR corretamente zeradas ✅`);
      }
    }

    // Rake zero
    if (sc.totals.rake === 0) {
      issues.push(`Rake zero — verificar se taxas rake-based sao zero`);
    }

    // Sem agentes
    if (sc.totals.agents === 0) {
      issues.push(`Sem agentes — verificar se detalhamento funciona`);
    }

    // Acerto grande (possivel erro)
    if (Math.abs(sc.acertoLiga) > 100000) {
      issues.push(`Acerto Liga muito alto: ${formatBRL(sc.acertoLiga)} — verificar manualmente`);
    }

    if (issues.length > 0) {
      console.log(`\n   ${sc.name}:`);
      issues.forEach(i => console.log(`      - ${i}`));
    }
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  VALIDACAO CONCLUIDA');
  console.log('══════════════════════════════════════════════════');
  console.log('\n  Proximo passo: compare os numeros acima com o HTML antigo.');
  console.log('  Abra fechamento-poker.html, carregue o mesmo XLSX,');
  console.log('  e verifique subclube por subclube.\n');
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
