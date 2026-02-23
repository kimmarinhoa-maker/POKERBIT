#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
//  tools/compare.js — Golden Test Comparator (Fase 0)
//
//  Uso: node tools/compare.js
//
//  Roda o pipeline e compara com fixtures/expected/*.json
//  Tolerância: 0.005 (meio centavo) para valores numéricos
// ══════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const FinanceEngine = require('../packages/engine');
const { adapterImport } = require('../packages/importer/adapter');

// ─── Config ─────────────────────────────────────────────────────────

const TOLERANCE = 0.005; // meio centavo
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const INPUT_DIR    = path.join(FIXTURES_DIR, 'input');
const CONFIG_DIR   = path.join(FIXTURES_DIR, 'config');
const EXPECTED_DIR = path.join(FIXTURES_DIR, 'expected');

// ─── Helpers ────────────────────────────────────────────────────────

function loadRates(configDir) {
  const ratesFile = path.join(configDir, 'rates.json');
  if (fs.existsSync(ratesFile)) {
    return JSON.parse(fs.readFileSync(ratesFile, 'utf8'));
  }
  return { playerRates: {}, agentRates: {} };
}

function deepCompare(expected, actual, path_str, errors) {
  if (expected === null || expected === undefined) {
    if (actual !== expected) {
      errors.push({ path: path_str, expected, actual, type: 'null_mismatch' });
    }
    return;
  }

  if (typeof expected === 'number') {
    if (typeof actual !== 'number') {
      errors.push({ path: path_str, expected, actual, type: 'type_mismatch' });
      return;
    }
    if (Math.abs(expected - actual) > TOLERANCE) {
      errors.push({ path: path_str, expected, actual, diff: Math.abs(expected - actual), type: 'numeric' });
    }
    return;
  }

  if (typeof expected === 'string') {
    if (expected !== actual) {
      errors.push({ path: path_str, expected, actual, type: 'string' });
    }
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push({ path: path_str, expected: 'array', actual: typeof actual, type: 'type_mismatch' });
      return;
    }
    if (expected.length !== actual.length) {
      errors.push({ path: path_str, expected: `length=${expected.length}`, actual: `length=${actual.length}`, type: 'array_length' });
    }
    const len = Math.min(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      deepCompare(expected[i], actual[i], `${path_str}[${i}]`, errors);
    }
    return;
  }

  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null) {
      errors.push({ path: path_str, expected: 'object', actual: typeof actual, type: 'type_mismatch' });
      return;
    }

    // Check expected keys
    for (const key of Object.keys(expected)) {
      if (key === 'generatedAt') continue; // skip timestamp
      if (!(key in actual)) {
        errors.push({ path: `${path_str}.${key}`, expected: expected[key], actual: 'MISSING', type: 'missing_key' });
      } else {
        deepCompare(expected[key], actual[key], `${path_str}.${key}`, errors);
      }
    }

    // Check extra keys in actual
    for (const key of Object.keys(actual)) {
      if (key === 'generatedAt') continue;
      if (!(key in expected)) {
        errors.push({ path: `${path_str}.${key}`, expected: 'MISSING', actual: actual[key], type: 'extra_key' });
      }
    }
    return;
  }

  // boolean, etc.
  if (expected !== actual) {
    errors.push({ path: path_str, expected, actual, type: 'value' });
  }
}

// ─── Invariant Checks ───────────────────────────────────────────────

function checkInvariants(output, errors) {
  if (!output || !output.clubs) return;

  Object.entries(output.clubs).forEach(([clube, data]) => {
    if (!data.agents) return;

    data.agents.forEach(agent => {
      // Invariante 1: rakeTime == soma do rake dos players
      if (agent.players) {
        const somaRake = agent.players.reduce((s, p) => s + p.rakeGerado, 0);
        if (Math.abs(agent.rakeTime - somaRake) > TOLERANCE) {
          errors.push({
            path: `invariant.${clube}.${agent.agentName}.rakeTime`,
            expected: somaRake,
            actual: agent.rakeTime,
            type: 'invariant_rake_sum',
          });
        }

        // Invariante 2: ganhosTime == soma dos ganhos dos players
        const somaGanhos = agent.players.reduce((s, p) => s + p.ganhos, 0);
        if (Math.abs(agent.ganhosTime - somaGanhos) > TOLERANCE) {
          errors.push({
            path: `invariant.${clube}.${agent.agentName}.ganhosTime`,
            expected: somaGanhos,
            actual: agent.ganhosTime,
            type: 'invariant_ganhos_sum',
          });
        }

        // Invariante 3: rbAgente == rakeTime * agentRate / 100 (se não for modo direto)
        if (agent.agentRate > 0) {
          const expectedRB = agent.rakeTime * agent.agentRate / 100;
          if (Math.abs(agent.rbAgente - expectedRB) > TOLERANCE) {
            errors.push({
              path: `invariant.${clube}.${agent.agentName}.rbAgente`,
              expected: expectedRB,
              actual: agent.rbAgente,
              type: 'invariant_rb_formula',
            });
          }
        }
      }
    });
  });
}

// ─── Run Pipeline (duplicado de run_golden — mínimo) ────────────────

function runPipeline(filePath, rates) {
  const wb = XLSX.readFile(filePath);
  const players = adapterImport(wb);
  if (!players.length) return null;

  const clubMap = {};
  players.forEach(p => {
    const c = p.clubeInterno || 'OUTROS';
    if (!clubMap[c]) clubMap[c] = [];
    clubMap[c].push(p);
  });

  const clubResults = {};
  Object.entries(clubMap).forEach(([clube, clubPlayers]) => {
    const agentMap = {};
    clubPlayers.forEach(p => {
      const ag = (p.aname || '').trim() || '(sem agente)';
      if (!agentMap[ag]) agentMap[ag] = [];
      agentMap[ag].push(p);
    });

    const agentMetrics = Object.entries(agentMap).map(([agName, agPlayers]) => {
      const agRate = (rates.agentRates || {})[agName] || 0;
      const playerMetrics = agPlayers.map(p => {
        const plRate = (rates.playerRates || {})[p.id] || (rates.playerRates || {})[p.nick] || 0;
        const enginePlayer = { ganhos: p.ganhos, rake: p.rakeGerado };
        const resultado = FinanceEngine.calcPlayerResult(enginePlayer, plRate);
        return {
          id: p.id, nick: p.nick, agentId: p.aid, agentName: p.aname,
          ganhos: p.ganhos, rakeGerado: p.rakeGerado, ggr: p.ggr,
          rbRate: plRate, rbValor: p.rakeGerado * plRate / 100, resultado,
          rakeBreakdown: p.rakeBreakdown || null,
        };
      });

      const enginePlayers = agPlayers.map(p => ({ ganhos: p.ganhos, rake: p.rakeGerado }));
      const agResult = FinanceEngine.calcAgentResult(enginePlayers, agRate, false, null);

      return { agentName: agName, agentRate: agRate, playerCount: agPlayers.length, ...agResult, players: playerMetrics };
    });

    const totals = {
      players: clubPlayers.length,
      agents: Object.keys(agentMap).length,
      ganhos: clubPlayers.reduce((s, p) => s + p.ganhos, 0),
      rakeGerado: clubPlayers.reduce((s, p) => s + p.rakeGerado, 0),
      ggr: clubPlayers.reduce((s, p) => s + p.ggr, 0),
    };

    clubResults[clube] = { totals, agents: agentMetrics };
  });

  const filename = path.basename(filePath);
  const weekM = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    meta: { fileName: filename, weekStart: weekM ? weekM[1] : 'unknown', playerCount: players.length, clubes: Object.keys(clubMap) },
    clubs: clubResults,
    allPlayers: players.map(p => ({ id: p.id, nick: p.nick, clube: p.clubeInterno, agentName: p.aname, ganhos: p.ganhos, rakeGerado: p.rakeGerado, ggr: p.ggr })),
  };
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  const xlsxFiles = fs.readdirSync(INPUT_DIR).filter(f => /\.xlsx$/i.test(f));
  if (!xlsxFiles.length) {
    console.log('⚠️  Nenhum XLSX em fixtures/input/');
    process.exit(1);
  }

  const expectedFiles = fs.readdirSync(EXPECTED_DIR).filter(f => /\.json$/i.test(f));
  if (!expectedFiles.length) {
    console.log('⚠️  Nenhum golden output em fixtures/expected/');
    console.log('   Rode: npm run golden:update');
    process.exit(1);
  }

  const rates = loadRates(CONFIG_DIR);
  let totalErrors = 0;
  let totalInvariantErrors = 0;

  xlsxFiles.forEach(file => {
    console.log(`\n🔄 Testing: ${file}`);

    const actual = runPipeline(path.join(INPUT_DIR, file), rates);
    if (!actual) {
      console.log('  ❌ Pipeline falhou');
      totalErrors++;
      return;
    }

    // Find matching expected
    const weekKey = actual.meta.weekStart;
    const expFile = expectedFiles.find(f => f.includes(weekKey)) || expectedFiles[0];
    const expectedPath = path.join(EXPECTED_DIR, expFile);
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

    console.log(`  📋 Comparando com: ${expFile}`);

    // Deep compare
    const errors = [];
    deepCompare(expected, actual, 'root', errors);

    if (errors.length === 0) {
      console.log('  ✅ Golden test PASSED — output idêntico');
    } else {
      console.log(`  ❌ Golden test FAILED — ${errors.length} diferença(s):`);
      errors.slice(0, 10).forEach(e => {
        if (e.type === 'numeric') {
          console.log(`     ${e.path}: expected=${e.expected}, actual=${e.actual}, diff=${e.diff.toFixed(6)}`);
        } else {
          console.log(`     ${e.path}: [${e.type}] expected=${JSON.stringify(e.expected)}, actual=${JSON.stringify(e.actual)}`);
        }
      });
      if (errors.length > 10) console.log(`     ... e mais ${errors.length - 10} erro(s)`);
      totalErrors += errors.length;
    }

    // Invariant checks
    const invErrors = [];
    checkInvariants(actual, invErrors);
    if (invErrors.length === 0) {
      console.log('  ✅ Invariantes OK');
    } else {
      console.log(`  ⚠️  ${invErrors.length} invariante(s) violada(s):`);
      invErrors.forEach(e => {
        console.log(`     ${e.path}: [${e.type}] expected=${e.expected}, actual=${e.actual}`);
      });
      totalInvariantErrors += invErrors.length;
    }
  });

  // Final summary
  console.log('\n' + '═'.repeat(60));
  if (totalErrors === 0 && totalInvariantErrors === 0) {
    console.log('✅ TODOS OS TESTES PASSARAM');
    process.exit(0);
  } else {
    console.log(`❌ ${totalErrors} erro(s) de comparação, ${totalInvariantErrors} invariante(s) violada(s)`);
    process.exit(1);
  }
}

main();
