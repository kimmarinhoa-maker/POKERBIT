const XLSX = require('xlsx');
const path = require('path');
const { parseWorkbook } = require('../packages/importer/coreSuprema');

// Find the XLSX file
const xlsxPath = path.join(__dirname, '..', 'planilha import', '106-343122-20260209-20260215 (1).xlsx');
console.log('Reading:', xlsxPath);

const wb = XLSX.readFile(xlsxPath);

const config = {
  prefixRules: [
    { prefixes: ['AMS', 'TW', 'BB'], clube: 'IMPERIO' },
    { prefixes: ['TGP'],             clube: 'TGP' },
    { prefixes: ['CONFRA'],          clube: 'CONFRARIA' },
    { prefixes: ['3BET'],            clube: '3BET' },
    { prefixes: ['CH'],              clube: 'CH' },
  ],
  manualLinks: {},
  agentOverrides: {},
  ignoredAgents: [],
};

const result = parseWorkbook(wb, config);

console.log('\nTotal players:', result.all.length);

// Show unlinked players
const unlinked = result.all.filter(function(p) {
  return p.clube === '?' || !p.clube;
});
console.log('Unlinked players:', unlinked.length);

// Group by agent name
const byAgent = {};
unlinked.forEach(function(p) {
  const agent = p.agentName || p.aname || 'SEM AGENTE';
  if (!byAgent[agent]) byAgent[agent] = [];
  byAgent[agent].push(p.nick || p.id);
});

console.log('\n=== AGENTES SEM CLUBE ===');
Object.entries(byAgent).forEach(function(entry) {
  const agent = entry[0];
  const players = entry[1];
  console.log('  ' + agent + ' (' + players.length + ' jogadores)');
  players.forEach(function(nick) {
    console.log('    - ' + nick);
  });
});

// Also show the status breakdown
const byStatus = {};
result.all.forEach(function(p) {
  const s = p._status || 'unknown';
  if (!byStatus[s]) byStatus[s] = 0;
  byStatus[s]++;
});
console.log('\n=== STATUS BREAKDOWN ===');
Object.entries(byStatus).forEach(function(entry) {
  console.log('  ' + entry[0] + ': ' + entry[1]);
});

// Show club distribution
const byClub = {};
result.all.forEach(function(p) {
  const c = p.clube || '?';
  if (!byClub[c]) byClub[c] = 0;
  byClub[c]++;
});
console.log('\n=== DISTRIBUICAO POR CLUBE ===');
Object.entries(byClub).sort().forEach(function(entry) {
  console.log('  ' + entry[0] + ': ' + entry[1] + ' jogadores');
});
