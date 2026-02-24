// ══════════════════════════════════════════════════════════════════════
//  packages/importer/adapter.js — Importação Grand Union (Suprema Poker)
//  Adaptado de adapterImport.js (browser) para módulo CommonJS.
//  Fonte primária: aba "Grand Union Member Resume" (valores GU × 5)
//  Enriquecimento: aba "Grand Union Member Statistics" (breakdown Local)
// ══════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');

const GU_TO_BRL_DEFAULT = 5;

// ─── CLASSIFICAÇÃO DE CLUBE ─────────────────────────────────────────

function resolveClubeInterno(agentName) {
  let name = String(agentName || '').toUpperCase().trim();
  name = name.replace(/^AG[\.\s]+/i, '').trim();
  if (!name || name === 'NONE') return 'OUTROS';

  const rules = [
    { prefixes: ['AMS', 'TW', 'BB'], clube: 'IMPERIO' },
    { prefixes: ['TGP'],             clube: 'TGP' },
    { prefixes: ['CONFRA'],          clube: 'CONFRARIA' },
    { prefixes: ['3BET'],            clube: '3BET' },
    { prefixes: ['CH'],              clube: 'CH' },
  ];

  for (const rule of rules) {
    for (const prefix of rule.prefixes) {
      if (name.startsWith(prefix)) return rule.clube;
    }
  }

  if (name.includes('TGP')) return 'TGP';
  return 'OUTROS';
}

// ─── UTILITÁRIOS ────────────────────────────────────────────────────

function parseNum(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  let s = String(raw).trim();
  if (!s || s === '--' || s.toLowerCase() === 'none') return 0;
  const isNeg = s.startsWith('(') && s.endsWith(')');
  if (isNeg) s = s.slice(1, -1);
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  s = s.replace(/[^\d.\-]/g, '');
  const num = parseFloat(s);
  return isNaN(num) ? 0 : (isNeg ? -num : num);
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim());
    if (cells.some(c => c === 'Player ID')) return i;
  }
  return -1;
}

function mapCols(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, idx) => {
    const name = String(cell || '').trim();
    if (name) {
      if (map[name] !== undefined) {
        map[name + ':' + idx] = idx;
      } else {
        map[name] = idx;
      }
    }
  });
  return map;
}

// ─── IMPORTAÇÃO PRINCIPAL (RESUME) ──────────────────────────────────

function adapterImportResume(resumeRows) {
  if (!resumeRows || resumeRows.length < 2) return [];

  const hIdx = findHeaderRow(resumeRows);
  if (hIdx === -1) {
    console.error('[adapterImport] Header "Player ID" não encontrado na aba Resume');
    return [];
  }

  const headers = resumeRows[hIdx];
  const col = mapCols(headers);

  const C = {
    playerId:    col['Player ID'],
    nickName:    col['nickName'],
    agentId:     col['Agent ID'],
    agentName:   col['Agent Name'],
    subAgentId:  col['Sub Agent ID'],
    subAgentName:col['Sub Agent Name'],
    winnings:    col['Winnings'],
    totalFee:    col['Total Fee'],
    adminFee:    col['Admin Fee'],
    jackpotFee:  col['Jackpot Fee'],
    rodeioProfit:col['RODEO Total Profit'],
    games:       col['Games'],
    hands:       col['Hands'],
    role:        col['Role'],
  };

  if (C.playerId === undefined || C.winnings === undefined || C.totalFee === undefined) {
    console.error('[adapterImport] Colunas obrigatórias não encontradas:', C);
    return [];
  }

  const result = [];

  for (let i = hIdx + 1; i < resumeRows.length; i++) {
    const r = resumeRows[i];
    if (!r || r.length === 0) continue;

    const playerId = String(r[C.playerId] || '').trim();
    if (!playerId || playerId.toLowerCase() === 'none') continue;

    const agentName = String(r[C.agentName] || '').trim();

    result.push({
      id:           playerId,
      nick:         String(r[C.nickName] || '').trim(),
      func:         String(r[C.role] || '').trim(),
      aid:          String(r[C.agentId] || '').trim(),
      aname:        agentName,
      said:         String(r[C.subAgentId] || '').trim(),
      saname:       String(r[C.subAgentName] || '').trim(),
      clubeInterno: resolveClubeInterno(agentName),
      ganhos:       parseNum(r[C.winnings])      * GU_TO_BRL_DEFAULT,
      rakeGerado:   parseNum(r[C.totalFee])      * GU_TO_BRL_DEFAULT,
      ggr:          parseNum(r[C.rodeioProfit])   * GU_TO_BRL_DEFAULT,
      games:        parseNum(r[C.games]),
      hands:        parseNum(r[C.hands]),
    });
  }

  return result;
}

// ─── ENRIQUECIMENTO (STATISTICS) ────────────────────────────────────

function parseStatisticsBreakdown(statsRows) {
  if (!statsRows || statsRows.length < 2) return {};

  const hIdx = findHeaderRow(statsRows);
  if (hIdx === -1) return {};

  const headers = statsRows[hIdx];
  const col = mapCols(headers);

  const C = {
    playerId:  col['Player ID'],
    ringGame:  col['Ring Game Total(Local)'],
    mtt:       col['MTT Total(Local)'],
    sng:       col['SNG Total(Local)'],
    spin:      col['SPIN Total(Local)'],
    tlt:       col['TLT Total(Local)'],
  };

  if (C.playerId === undefined) return {};

  const map = {};

  for (let i = hIdx + 1; i < statsRows.length; i++) {
    const r = statsRows[i];
    if (!r || r.length === 0) continue;

    const pid = String(r[C.playerId] || '').trim();
    if (!pid || pid.toLowerCase() === 'none') continue;

    map[pid] = {
      ringGame: C.ringGame !== undefined ? parseNum(r[C.ringGame]) : 0,
      mtt:      C.mtt      !== undefined ? parseNum(r[C.mtt])      : 0,
      sng:      C.sng      !== undefined ? parseNum(r[C.sng])      : 0,
      spin:     C.spin     !== undefined ? parseNum(r[C.spin])     : 0,
      tlt:      C.tlt      !== undefined ? parseNum(r[C.tlt])      : 0,
    };
    map[pid].total = map[pid].ringGame + map[pid].mtt + map[pid].sng
                   + map[pid].spin + map[pid].tlt;
  }

  return map;
}

// ─── FUNÇÃO PRINCIPAL: IMPORTA E ENRIQUECE ──────────────────────────

function adapterImport(workbook) {
  const resumeSheet = workbook.Sheets['Grand Union Member Resume'];
  if (!resumeSheet) {
    console.error('[adapterImport] Aba "Grand Union Member Resume" não encontrada!');
    console.log('Abas disponíveis:', workbook.SheetNames);
    return [];
  }
  const resumeRows = XLSX.utils.sheet_to_json(resumeSheet, { header: 1, defval: '' });
  const players = adapterImportResume(resumeRows);

  const statsSheet = workbook.Sheets['Grand Union Member Statistics'];
  let breakdown = {};
  if (statsSheet) {
    const statsRows = XLSX.utils.sheet_to_json(statsSheet, { header: 1, defval: '' });
    breakdown = parseStatisticsBreakdown(statsRows);
  }

  for (const p of players) {
    p.rakeBreakdown = breakdown[p.id] || {
      ringGame: 0, mtt: 0, sng: 0, spin: 0, tlt: 0, total: 0
    };
  }

  // Validação cruzada
  let diffCount = 0;
  for (const p of players) {
    const resumeRake = p.rakeGerado;
    const statsRake  = p.rakeBreakdown.total;
    const diff = Math.abs(resumeRake - statsRake);
    if (diff > 0.1 && statsRake > 0) diffCount++;
  }
  if (diffCount > 0) {
    console.warn(`[validação] ${diffCount} jogador(es) com diferença entre Resume e Statistics`);
  }

  return players;
}

// ─── EXPORTS ────────────────────────────────────────────────────────

module.exports = {
  adapterImport,
  adapterImportResume,
  parseStatisticsBreakdown,
  resolveClubeInterno,
  parseNum,
  findHeaderRow,
  mapCols,
  GU_TO_BRL: GU_TO_BRL_DEFAULT,
};
