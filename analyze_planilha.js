const XLSX = require('xlsx');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node analyze_planilha.js <file>');
  process.exit(1);
}

const wb = XLSX.readFile(file);
const ws = wb.Sheets['Grand Union Member Resume'];
const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

function resolveClubeInterno(agentName){
  let name = String(agentName||'').toUpperCase().trim();
  name = name.replace(/^AG[\.\s]+/i,'').trim();
  if (!name || name === 'NONE') return '?';
  const rules = [
    {prefixes:['AMS','TW','BB'], clube:'IMPERIO'},
    {prefixes:['TGP'],           clube:'TGP'},
    {prefixes:['CONFRA'],        clube:'CONFRARIA'},
    {prefixes:['3BET'],          clube:'3BET'},
    {prefixes:['CH'],            clube:'CH'},
  ];
  for (const rule of rules)
    for (const prefix of rule.prefixes)
      if (name.startsWith(prefix)) return rule.clube;
  if (name.includes('TGP')) return 'TGP';
  return '?';
}

const manualLinks = {'NONE': 'IMPERIO', 'AG ANDRE': 'IMPERIO'};

const agents = {};
rows.slice(4).forEach(r => {
  const aname = String(r[12]||'').trim();
  const u = aname.toUpperCase().trim();
  const clube = manualLinks[u] || resolveClubeInterno(aname);
  if (!agents[u]) agents[u] = {name: aname, clube, count: 0};
  agents[u].count++;
});

console.log('=== Agentes nao resolvidos (?) ===');
Object.entries(agents).filter(([k,v]) => v.clube === '?').forEach(([k,v]) =>
  console.log(' [?]', v.name, '('+v.count+' jog.)')
);

console.log('\n=== Todos os agentes por clube ===');
const byCl = {};
Object.values(agents).forEach(a => {
  if (!byCl[a.clube]) byCl[a.clube] = [];
  byCl[a.clube].push(a.name + ' (' + a.count + ')');
});
Object.entries(byCl).sort().forEach(([c, names]) => console.log(c + ': ' + names.join(', ')));

// Check players with aname = None
console.log('\n=== Jogadores com agentName = None ou vazio ===');
let noneCount = 0;
rows.slice(4).forEach(r => {
  const aname = String(r[12]||'').trim();
  if (!aname || aname.toLowerCase() === 'none') {
    noneCount++;
    console.log('  pid='+r[4]+' name='+r[5]+' aname='+aname+' role='+r[7]);
  }
});
if (noneCount === 0) console.log('  (nenhum)');

// Summary stats
const GU_TO_BRL = 5;
let totalWin = 0, totalFee = 0, totalGGR = 0;
rows.slice(4).forEach(r => {
  totalWin += (parseFloat(r[15])||0);
  totalFee += (parseFloat(r[16])||0);
  totalGGR += (parseFloat(r[25])||0); // RODEO Total Profit col index 25
});
console.log('\n=== Totais brutos (GU, antes de *5) ===');
console.log('Winnings:', totalWin.toFixed(2), '-> BRL:', (totalWin*GU_TO_BRL).toFixed(2));
console.log('Total Fee:', totalFee.toFixed(2), '-> BRL:', (totalFee*GU_TO_BRL).toFixed(2));
console.log('RODEO GGR:', totalGGR.toFixed(2), '-> BRL:', (totalGGR*GU_TO_BRL).toFixed(2));
console.log('Total jogadores:', rows.length - 4);
