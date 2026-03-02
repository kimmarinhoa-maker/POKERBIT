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

// ─── MANAGER TRADE RECORD (ChipPix cross-reference) ─────────────────

/**
 * Parse aba "Manager Trade Record" da Suprema.
 * Filtra apenas rows onde Manager Remark começa com "Chippix_".
 * Agrupa por operador e jogador.
 *
 * Direção (perspectiva do clube):
 *   Chip NEGATIVO + "Send=>" = manager enviou fichas = jogador depositou = dir='IN'
 *   Chip POSITIVO + "<=Claim" = manager recebeu fichas = jogador sacou = dir='OUT'
 *
 * Valores 1:1 em BRL (NÃO multiplicar por 5x).
 *
 * @param {any[][]} tradeRows - sheet_to_json(sheet, { header: 1 })
 * @returns {Object} Map de operador → { manager, managerId, totals, players }
 */
function parseManagerTradeRecord(tradeRows) {
  if (!tradeRows || tradeRows.length < 4) return {};

  // Find header row (look for "Manager Name" or "Member Name")
  let hIdx = -1;
  for (let i = 0; i < Math.min(tradeRows.length, 10); i++) {
    const cells = (tradeRows[i] || []).map(c => String(c || '').trim());
    if (cells.some(c => c === 'Manager Name') && cells.some(c => c === 'Member Name')) {
      hIdx = i;
      break;
    }
  }
  if (hIdx === -1) return {};

  const headerRow = tradeRows[hIdx];
  const col = {};
  (headerRow || []).forEach((cell, idx) => {
    const name = String(cell || '').trim();
    if (name) col[name] = idx;
  });

  const C = {
    managerName:   col['Manager Name'],
    managerId:     col['Manager ID'],
    managerRemark: col['Manager Remark'],
    chip:          col['Chip'],
    action:        col['Action'],
    memberName:    col['Member Name'],
    memberId:      col['Member ID'],
  };

  if (C.managerRemark === undefined || C.chip === undefined || C.memberId === undefined) {
    return {};
  }

  const operators = {};

  for (let i = hIdx + 1; i < tradeRows.length; i++) {
    const r = tradeRows[i];
    if (!r || r.length === 0) continue;

    const remark = String(r[C.managerRemark] || '').trim();

    // Only process ChipPix operators
    if (!remark.startsWith('Chippix_') && !remark.startsWith('chippix_')) continue;

    const chipVal = parseNum(r[C.chip]);
    if (chipVal === 0) continue;

    const action = String(r[C.action] || '').trim();
    const memberId = String(r[C.memberId] || '').trim();
    const memberName = C.memberName !== undefined ? String(r[C.memberName] || '').trim() : '';
    const managerId = C.managerId !== undefined ? String(r[C.managerId] || '').trim() : '';
    const managerName = C.managerName !== undefined ? String(r[C.managerName] || '').trim() : remark;

    if (!memberId) continue;

    // Determine direction (perspective of the club):
    // Chip NEGATIVE + Send=> = club received BRL = IN
    // Chip POSITIVE + <=Claim = club paid BRL = OUT
    const isSend = action.includes('Send') || chipVal < 0;
    const amount = Math.abs(chipVal); // 1:1 BRL, no 5x multiplier

    // Initialize operator
    if (!operators[remark]) {
      operators[remark] = {
        manager: remark,
        managerId: managerId,
        managerName: managerName,
        totalIN: 0,
        totalOUT: 0,
        saldo: 0,
        txnCount: 0,
        playerCount: 0,
        players: {},
      };
    }

    const op = operators[remark];
    op.txnCount++;

    if (isSend) {
      op.totalIN += amount;
    } else {
      op.totalOUT += amount;
    }

    // Initialize player
    if (!op.players[memberId]) {
      op.players[memberId] = {
        name: memberName,
        in: 0,
        out: 0,
        saldo: 0,
        txns: 0,
      };
    }

    const pl = op.players[memberId];
    pl.txns++;
    if (isSend) {
      pl.in += amount;
    } else {
      pl.out += amount;
    }
  }

  // Compute saldos and player counts
  for (const key of Object.keys(operators)) {
    const op = operators[key];
    op.saldo = round2val(op.totalIN - op.totalOUT);
    op.totalIN = round2val(op.totalIN);
    op.totalOUT = round2val(op.totalOUT);
    op.playerCount = Object.keys(op.players).length;

    for (const pid of Object.keys(op.players)) {
      const pl = op.players[pid];
      pl.saldo = round2val(pl.in - pl.out);
      pl.in = round2val(pl.in);
      pl.out = round2val(pl.out);
    }
  }

  return operators;
}

function round2val(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── ENRIQUECIMENTO (STATISTICS) ────────────────────────────────────

function parseStatisticsBreakdown(statsRows) {
  if (!statsRows || statsRows.length < 2) return {};

  const hIdx = findHeaderRow(statsRows);
  if (hIdx === -1) return {};

  const headers = statsRows[hIdx];
  const col = mapCols(headers);

  // All header names for diagnostics
  const allHeaders = (headers || []).map(c => String(c || '').trim()).filter(Boolean);
  console.log('[Statistics] All headers:', JSON.stringify(allHeaders));

  // Helper: find column by exact name, alternatives, or case-insensitive match
  function findCol(exactName, altNames) {
    if (col[exactName] !== undefined) return col[exactName];
    if (altNames) {
      for (const alt of altNames) {
        if (col[alt] !== undefined) return col[alt];
      }
    }
    const lower = exactName.toLowerCase();
    for (const [name, idx] of Object.entries(col)) {
      if (name.toLowerCase() === lower) return idx;
    }
    return undefined;
  }

  // Fuzzy search: find a column containing ALL specified terms (case-insensitive)
  function findColFuzzy(...terms) {
    const lowerTerms = terms.map(t => t.toLowerCase());
    for (const [name, idx] of Object.entries(col)) {
      const lowerName = name.toLowerCase();
      if (lowerTerms.every(t => lowerName.includes(t))) return idx;
    }
    return undefined;
  }

  // ── Data-driven modality definitions ──────────────────────────────
  // Each entry: [key, winCols, feeCols, handsCols, fuzzyTerms]
  const MODALITIES = [
    // Cash
    ['nlh',      ['NLH(GU)'],                       ['NLH Fee(GU)', 'NLH Total Fee(GU)'],                 ['NLH Hands', 'NLH(Hands)'],                 ['nlh']],
    ['plo4',     ['PLO4(GU)'],                      ['PLO4 Fee(GU)', 'PLO4 Total Fee(GU)'],               ['PLO4 Hands', 'PLO4(Hands)'],               ['plo4']],
    ['plo5',     ['PLO5(GU)'],                      ['PLO5 Fee(GU)', 'PLO5 Total Fee(GU)'],               ['PLO5 Hands', 'PLO5(Hands)'],               ['plo5']],
    ['plo6',     ['PLO6(GU)'],                      ['PLO6 Fee(GU)', 'PLO6 Total Fee(GU)'],               ['PLO6 Hands', 'PLO6(Hands)'],               ['plo6']],
    ['mixgame',  ['Mix Game(GU)', 'MixGame(GU)'],   ['Mix Game Fee(GU)', 'MixGame Fee(GU)'],              ['Mix Game Hands', 'MixGame(Hands)'],        ['mix']],
    ['ofc',      ['OFC(GU)'],                       ['OFC Fee(GU)', 'OFC Total Fee(GU)'],                 ['OFC Hands', 'OFC(Hands)'],                 ['ofc']],
    // MTT sub-modalities
    ['mtt_nlh',  ['MTT-NLH(GU)'],                   ['MTT-NLH Fee(GU)', 'MTT-NLH Total Fee(GU)'],        ['MTT-NLH Hands', 'MTT-NLH(Hands)'],        ['mtt-nlh', 'mtt', 'nlh']],
    ['mtt_plo4', ['MTT-PLO4(GU)'],                  ['MTT-PLO4 Fee(GU)', 'MTT-PLO4 Total Fee(GU)'],      ['MTT-PLO4 Hands', 'MTT-PLO4(Hands)'],      ['mtt-plo4', 'mtt', 'plo4']],
    ['mtt_plo5', ['MTT-PLO5(GU)'],                  ['MTT-PLO5 Fee(GU)', 'MTT-PLO5 Total Fee(GU)'],      ['MTT-PLO5 Hands', 'MTT-PLO5(Hands)'],      ['mtt-plo5', 'mtt', 'plo5']],
    ['mtt_plo6', ['MTT-PLO6(GU)'],                  ['MTT-PLO6 Fee(GU)', 'MTT-PLO6 Total Fee(GU)'],      ['MTT-PLO6 Hands', 'MTT-PLO6(Hands)'],      ['mtt-plo6', 'mtt', 'plo6']],
    // SNG sub-modalities
    ['sng_nlh',  ['SNG-NLH(GU)'],                   ['SNG-NLH Fee(GU)', 'SNG-NLH Total Fee(GU)'],        ['SNG-NLH Hands', 'SNG-NLH(Hands)'],        ['sng-nlh', 'sng', 'nlh']],
    ['sng_plo4', ['SNG-PLO4(GU)'],                  ['SNG-PLO4 Fee(GU)', 'SNG-PLO4 Total Fee(GU)'],      ['SNG-PLO4 Hands', 'SNG-PLO4(Hands)'],      ['sng-plo4', 'sng', 'plo4']],
    ['sng_plo5', ['SNG-PLO5(GU)'],                  ['SNG-PLO5 Fee(GU)', 'SNG-PLO5 Total Fee(GU)'],      ['SNG-PLO5 Hands', 'SNG-PLO5(Hands)'],      ['sng-plo5', 'sng', 'plo5']],
    ['sng_plo6', ['SNG-PLO6(GU)'],                  ['SNG-PLO6 Fee(GU)', 'SNG-PLO6 Total Fee(GU)'],      ['SNG-PLO6 Hands', 'SNG-PLO6(Hands)'],      ['sng-plo6', 'sng', 'plo6']],
    // Spin (no sub-modalities)
    ['spin',     ['SPIN(GU)'],                       ['SPIN Fee(GU)', 'SPIN Total Fee(GU)'],               ['SPIN Hands', 'SPIN(Hands)'],               ['spin']],
  ];

  // Build column index map from modality definitions
  const modCols = {};
  for (const [key, winCols, feeCols, handsCols, fuzzy] of MODALITIES) {
    modCols[key] = {
      win:   findCol(winCols[0], winCols.slice(1)),
      fee:   findCol(feeCols[0], feeCols.slice(1))   ?? findColFuzzy(...fuzzy, 'fee', 'gu'),
      hands: findCol(handsCols[0], handsCols.slice(1)) ?? findColFuzzy(...fuzzy, 'hands'),
    };
  }

  const C = {
    playerId:  col['Player ID'],
    // Rake totals by category (Local currency, for fallback)
    ringGame:  findCol('Ring Game Total(Local)'),
    mttLocal:  findCol('MTT Total(Local)'),
    sngLocal:  findCol('SNG Total(Local)'),
    spinLocal: findCol('SPIN Total(Local)'),
    tlt:       findCol('TLT Total(Local)'),
    handsTotal: findCol('Hands'),
  };

  // Log diagnostics
  const found = {};
  const notFound = [];
  for (const [key, idx] of Object.entries(C)) {
    if (idx !== undefined) found[key] = idx;
    else notFound.push(key);
  }
  for (const [key, cols] of Object.entries(modCols)) {
    for (const [type, idx] of Object.entries(cols)) {
      const k = `${key}.${type}`;
      if (idx !== undefined) found[k] = idx;
      else notFound.push(k);
    }
  }
  console.log('[Statistics] Columns found:', JSON.stringify(found));
  if (notFound.length > 0) console.log('[Statistics] Columns NOT found:', JSON.stringify(notFound));

  if (C.playerId === undefined) return {};

  const map = {};

  function safeGet(r, idx) {
    return idx !== undefined ? parseNum(r[idx]) : 0;
  }

  const CASH_KEYS = ['nlh', 'plo4', 'plo5', 'plo6', 'mixgame', 'ofc'];
  const MTT_KEYS  = ['mtt_nlh', 'mtt_plo4', 'mtt_plo5', 'mtt_plo6'];
  const SNG_KEYS  = ['sng_nlh', 'sng_plo4', 'sng_plo5', 'sng_plo6'];
  const ALL_MOD_KEYS = MODALITIES.map(m => m[0]);

  for (let i = hIdx + 1; i < statsRows.length; i++) {
    const r = statsRows[i];
    if (!r || r.length === 0) continue;

    const pid = String(r[C.playerId] || '').trim();
    if (!pid || pid.toLowerCase() === 'none') continue;

    // Local totals (backward compat)
    const entry = {
      ringGame: safeGet(r, C.ringGame),
      mttLocal: safeGet(r, C.mttLocal),
      sngLocal: safeGet(r, C.sngLocal),
      spinLocal: safeGet(r, C.spinLocal),
      tlt:      safeGet(r, C.tlt),
    };
    entry.total = entry.ringGame + entry.mttLocal + entry.sngLocal + entry.spinLocal + entry.tlt;

    // Build winnings, rake, hands from modality columns (GU × 5 → BRL)
    entry.winnings = {};
    entry.rake = {};
    entry.hands = { total: safeGet(r, C.handsTotal) };
    for (const key of ALL_MOD_KEYS) {
      const mc = modCols[key];
      entry.winnings[key] = safeGet(r, mc.win)   * GU_TO_BRL_DEFAULT;
      entry.rake[key]     = safeGet(r, mc.fee)   * GU_TO_BRL_DEFAULT;
      entry.hands[key]    = safeGet(r, mc.hands);
    }

    // ── Per-category fallback: if GU Fee columns produced zero for a
    //    category, use Local total instead. Each category is independent.
    //    TLT always uses Local (no GU column exists). ─────────────────

    // Cash: use Local if GU Fee produced zero
    const cashGU = CASH_KEYS.reduce((s, k) => s + (entry.rake[k] || 0), 0);
    if (cashGU === 0 && entry.ringGame > 0) {
      const cashWins = CASH_KEYS.map(k => [k, Math.abs(entry.winnings[k] || 0)]);
      const totalCashWin = cashWins.reduce((s, [, v]) => s + v, 0);
      if (totalCashWin > 0) {
        for (const [mod, absWin] of cashWins) {
          entry.rake[mod] = round2val((absWin / totalCashWin) * entry.ringGame);
        }
      } else {
        entry.rake.nlh = entry.ringGame;
      }
    }

    // MTT: use Local if GU Fee produced zero
    const mttGU = MTT_KEYS.reduce((s, k) => s + (entry.rake[k] || 0), 0);
    if (mttGU === 0 && entry.mttLocal > 0) {
      const mttWins = MTT_KEYS.map(k => [k, Math.abs(entry.winnings[k] || 0)]);
      const totalMttWin = mttWins.reduce((s, [, v]) => s + v, 0);
      if (totalMttWin > 0) {
        for (const [mod, absWin] of mttWins) {
          entry.rake[mod] = round2val((absWin / totalMttWin) * entry.mttLocal);
        }
      } else {
        entry.rake.mtt_nlh = entry.mttLocal;
      }
    }

    // SNG: use Local if GU Fee produced zero
    const sngGU = SNG_KEYS.reduce((s, k) => s + (entry.rake[k] || 0), 0);
    if (sngGU === 0 && entry.sngLocal > 0) {
      const sngWins = SNG_KEYS.map(k => [k, Math.abs(entry.winnings[k] || 0)]);
      const totalSngWin = sngWins.reduce((s, [, v]) => s + v, 0);
      if (totalSngWin > 0) {
        for (const [mod, absWin] of sngWins) {
          entry.rake[mod] = round2val((absWin / totalSngWin) * entry.sngLocal);
        }
      } else {
        entry.rake.sng_nlh = entry.sngLocal;
      }
    }

    // Spin: use Local if GU Fee produced zero
    if ((entry.rake.spin || 0) === 0 && entry.spinLocal > 0) {
      entry.rake.spin = entry.spinLocal;
    }

    // TLT: ALWAYS add to mtt_nlh (no GU Fee column exists for TLT)
    if (entry.tlt > 0) {
      entry.rake.mtt_nlh = (entry.rake.mtt_nlh || 0) + entry.tlt;
    }

    // Diagnostic: verify sum of rake.* matches entry.total
    const rakeDistSum = ALL_MOD_KEYS.reduce((s, k) => s + (entry.rake[k] || 0), 0);
    const gap = entry.total - rakeDistSum;
    if (Math.abs(gap) > 0.1) {
      if (!map._diagGaps) map._diagGaps = [];
      if (map._diagGaps.length < 5) {
        map._diagGaps.push({ pid, total: entry.total, distributed: round2val(rakeDistSum), gap: round2val(gap), tlt: entry.tlt, cashGU, mttGU, sngGU, spin: entry.rake.spin || 0 });
      }
    }

    map[pid] = entry;
  }

  // Log gap diagnostics
  if (map._diagGaps && map._diagGaps.length > 0) {
    console.log(`[Statistics] Players with rake gap (total vs distributed):`, JSON.stringify(map._diagGaps));
  }

  // Log TLT column status
  console.log(`[Statistics] TLT column index: ${C.tlt}, spinLocal column: ${C.spinLocal}`);

  // Attach metadata for diagnostics
  map.__meta = { allHeaders, found, notFound };

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
  parseManagerTradeRecord,
  resolveClubeInterno,
  parseNum,
  findHeaderRow,
  mapCols,
  GU_TO_BRL: GU_TO_BRL_DEFAULT,
};
