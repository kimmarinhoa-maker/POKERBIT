#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
//  tools/run_golden.js — Golden Test Runner (Fase 0)
//
//  Uso:
//    node tools/run_golden.js                  → gera output e imprime
//    node tools/run_golden.js --update         → salva como expected
//    node tools/run_golden.js --inspect        → mostra headers/abas do XLSX
//
//  Lê XLSX de fixtures/input/, roda adapter + engine, gera JSON canônico.
// ══════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const FinanceEngine = require('../packages/engine');
const { adapterImport, resolveClubeInterno } = require('../packages/importer/adapter');

// ─── Paths ──────────────────────────────────────────────────────────

const FIXTURES_DIR  = path.join(__dirname, '..', 'fixtures');
const INPUT_DIR     = path.join(FIXTURES_DIR, 'input');
const CONFIG_DIR    = path.join(FIXTURES_DIR, 'config');
const EXPECTED_DIR  = path.join(FIXTURES_DIR, 'expected');

// ─── Helpers ────────────────────────────────────────────────────────

function findXlsxFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.xlsx$/i.test(f));
}

function loadRates(configDir) {
  const ratesFile = path.join(configDir, 'rates.json');
  if (fs.existsSync(ratesFile)) {
    return JSON.parse(fs.readFileSync(ratesFile, 'utf8'));
  }
  return { playerRates: {}, agentRates: {} };
}

function getWeekStartFromFilename(filename) {
  // Tenta extrair data do nome do arquivo (ex: "semana_2026-02-09.xlsx")
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ─── Inspect Mode ───────────────────────────────────────────────────

function inspectFile(filePath) {
  console.log('\n📋 INSPECT:', path.basename(filePath));
  console.log('─'.repeat(60));

  const wb = XLSX.readFile(filePath);
  console.log('Abas:', wb.SheetNames.join(', '));

  wb.SheetNames.forEach(name => {
    const sheet = wb.Sheets[name];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    console.log(`\n  📄 "${name}" — ${rows.length} linhas`);

    // Mostra primeiras 5 linhas
    const preview = rows.slice(0, 5);
    preview.forEach((row, i) => {
      const cells = row.slice(0, 10).map(c => String(c || '').substring(0, 20));
      console.log(`    [${i}] ${cells.join(' | ')}`);
    });

    if (rows.length > 5) console.log(`    ... (+ ${rows.length - 5} linhas)`);
  });
}

// ─── Pipeline Principal ─────────────────────────────────────────────

function runPipeline(filePath, rates) {
  const filename = path.basename(filePath);
  console.log(`\n🔄 Processing: ${filename}`);

  // 1) Parse XLSX
  const wb = XLSX.readFile(filePath);
  const players = adapterImport(wb);

  if (!players.length) {
    console.error('  ❌ Nenhum jogador importado!');
    return null;
  }
  console.log(`  ✅ ${players.length} jogadores importados`);

  // 2) Agrupar por clube
  const clubMap = {};
  players.forEach(p => {
    const c = p.clubeInterno || 'OUTROS';
    if (!clubMap[c]) clubMap[c] = [];
    clubMap[c].push(p);
  });
  console.log(`  📊 Clubes: ${Object.keys(clubMap).join(', ')}`);

  // 3) Agrupar por agente (dentro de cada clube)
  const clubResults = {};

  Object.entries(clubMap).forEach(([clube, clubPlayers]) => {
    // Agrupa por agente
    const agentMap = {};
    clubPlayers.forEach(p => {
      const ag = (p.aname || '').trim() || '(sem agente)';
      if (!agentMap[ag]) agentMap[ag] = [];
      agentMap[ag].push(p);
    });

    // Calcula métricas por agente
    const agentMetrics = Object.entries(agentMap).map(([agName, agPlayers]) => {
      const agRate = (rates.agentRates || {})[agName] || 0;

      // Player metrics
      const playerMetrics = agPlayers.map(p => {
        const plRate = (rates.playerRates || {})[p.id] || (rates.playerRates || {})[p.nick] || 0;
        // Compatibilidade: engine espera { ganhos, rake }
        const enginePlayer = { ganhos: p.ganhos, rake: p.rakeGerado };
        const resultado = FinanceEngine.calcPlayerResult(enginePlayer, plRate);
        return {
          id: p.id,
          nick: p.nick,
          agentId: p.aid,
          agentName: p.aname,
          ganhos: p.ganhos,
          rakeGerado: p.rakeGerado,
          ggr: p.ggr,
          rbRate: plRate,
          rbValor: p.rakeGerado * plRate / 100,
          resultado,
          rakeBreakdown: p.rakeBreakdown || null,
        };
      });

      // Agent metrics via engine
      const enginePlayers = agPlayers.map(p => ({ ganhos: p.ganhos, rake: p.rakeGerado }));
      const agResult = FinanceEngine.calcAgentResult(enginePlayers, agRate, false, null);

      return {
        agentName: agName,
        agentRate: agRate,
        playerCount: agPlayers.length,
        ...agResult,
        players: playerMetrics,
      };
    });

    // Totais do clube
    const totals = {
      players: clubPlayers.length,
      agents: Object.keys(agentMap).length,
      ganhos: clubPlayers.reduce((s, p) => s + p.ganhos, 0),
      rakeGerado: clubPlayers.reduce((s, p) => s + p.rakeGerado, 0),
      ggr: clubPlayers.reduce((s, p) => s + p.ggr, 0),
    };

    clubResults[clube] = { totals, agents: agentMetrics };
  });

  // 4) Montar output canônico
  const weekStart = getWeekStartFromFilename(filename);
  const output = {
    meta: {
      fileName: filename,
      weekStart: weekStart || 'unknown',
      generatedAt: new Date().toISOString(),
      playerCount: players.length,
      clubes: Object.keys(clubMap),
    },
    clubs: clubResults,
    // Flat list pra facilitar comparação
    allPlayers: players.map(p => ({
      id: p.id,
      nick: p.nick,
      clube: p.clubeInterno,
      agentName: p.aname,
      ganhos: p.ganhos,
      rakeGerado: p.rakeGerado,
      ggr: p.ggr,
    })),
  };

  return output;
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isUpdate  = args.includes('--update');
  const isInspect = args.includes('--inspect');

  const xlsxFiles = findXlsxFiles(INPUT_DIR);

  if (!xlsxFiles.length) {
    console.log('⚠️  Nenhum XLSX encontrado em fixtures/input/');
    console.log('   Coloque um arquivo .xlsx da Suprema lá e rode novamente.');
    process.exit(1);
  }

  const rates = loadRates(CONFIG_DIR);
  console.log('📋 Rates carregadas:', {
    playerRates: Object.keys(rates.playerRates || {}).length,
    agentRates: Object.keys(rates.agentRates || {}).length,
  });

  xlsxFiles.forEach(file => {
    const filePath = path.join(INPUT_DIR, file);

    // Inspect mode
    if (isInspect) {
      inspectFile(filePath);
      return;
    }

    // Run pipeline
    const output = runPipeline(filePath, rates);
    if (!output) return;

    // Print summary
    console.log('\n📊 Resultado:');
    console.log(`   Jogadores: ${output.meta.playerCount}`);
    console.log(`   Clubes: ${output.meta.clubes.join(', ')}`);
    Object.entries(output.clubs).forEach(([clube, data]) => {
      console.log(`   ${clube}: ${data.totals.players} jogadores, ${data.totals.agents} agentes`);
      console.log(`     Ganhos: R$ ${data.totals.ganhos.toFixed(2)}`);
      console.log(`     Rake:   R$ ${data.totals.rakeGerado.toFixed(2)}`);
      console.log(`     GGR:    R$ ${data.totals.ggr.toFixed(2)}`);
    });

    if (isUpdate) {
      // Salva como expected
      const weekKey = output.meta.weekStart || file.replace(/\.xlsx$/i, '');
      const outPath = path.join(EXPECTED_DIR, `week_${weekKey}.json`);

      // Remove generatedAt pra comparação estável
      const stableOutput = JSON.parse(JSON.stringify(output));
      delete stableOutput.meta.generatedAt;

      fs.writeFileSync(outPath, JSON.stringify(stableOutput, null, 2), 'utf8');
      console.log(`\n💾 Golden output salvo: ${outPath}`);
    } else {
      // Imprime JSON completo
      console.log('\n' + JSON.stringify(output, null, 2));
    }
  });
}

main();
