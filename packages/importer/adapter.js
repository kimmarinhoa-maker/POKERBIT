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

  // Helper: find column by exact name, alternatives, or fuzzy search
  function findCol(exactName, altNames) {
    if (col[exactName] !== undefined) return col[exactName];
    if (altNames) {
      for (const alt of altNames) {
        if (col[alt] !== undefined) return col[alt];
      }
    }
    // Fuzzy: case-insensitive exact match
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

  const C = {
    playerId:  col['Player ID'],
    // Rake by category (existing, Local currency)
    ringGame:  findCol('Ring Game Total(Local)'),
    mtt:       findCol('MTT Total(Local)'),
    sng:       findCol('SNG Total(Local)'),
    spin:      findCol('SPIN Total(Local)'),
    tlt:       findCol('TLT Total(Local)'),
    // Winnings by modality (GU values)
    winNLH:    findCol('NLH(GU)'),
    winPLO4:   findCol('PLO4(GU)'),
    winPLO5:   findCol('PLO5(GU)'),
    winPLO6:   findCol('PLO6(GU)'),
    winMixGame:findCol('Mix Game(GU)', ['MixGame(GU)']),
    winOFC:    findCol('OFC(GU)'),
    winMTT:    findCol('MTT(GU)'),
    winSNG:    findCol('SNG(GU)'),
    winSPIN:   findCol('SPIN(GU)'),
    // Rake by modality (GU values) — exact + fuzzy fallback
    rakeNLH:   findCol('NLH Fee(GU)', ['NLH Total Fee(GU)'])         ?? findColFuzzy('nlh', 'fee', 'gu'),
    rakePLO4:  findCol('PLO4 Fee(GU)', ['PLO4 Total Fee(GU)'])       ?? findColFuzzy('plo4', 'fee', 'gu'),
    rakePLO5:  findCol('PLO5 Fee(GU)', ['PLO5 Total Fee(GU)'])       ?? findColFuzzy('plo5', 'fee', 'gu'),
    rakePLO6:  findCol('PLO6 Fee(GU)', ['PLO6 Total Fee(GU)'])       ?? findColFuzzy('plo6', 'fee', 'gu'),
    rakeMixGame: findCol('Mix Game Fee(GU)', ['MixGame Fee(GU)'])     ?? findColFuzzy('mix', 'fee', 'gu'),
    rakeOFC:   findCol('OFC Fee(GU)', ['OFC Total Fee(GU)'])         ?? findColFuzzy('ofc', 'fee', 'gu'),
    rakeMTT:   findCol('MTT Fee(GU)', ['MTT Total Fee(GU)'])         ?? findColFuzzy('mtt', 'fee', 'gu'),
    rakeSNG:   findCol('SNG Fee(GU)', ['SNG Total Fee(GU)'])         ?? findColFuzzy('sng', 'fee', 'gu'),
    rakeSPIN:  findCol('SPIN Fee(GU)', ['SPIN Total Fee(GU)'])       ?? findColFuzzy('spin', 'fee', 'gu'),
    // Hands by modality
    handsTotal: findCol('Hands'),
    handsNLH:  findCol('NLH Hands', ['NLH(Hands)'])                  ?? findColFuzzy('nlh', 'hands'),
    handsPLO4: findCol('PLO4 Hands', ['PLO4(Hands)'])                ?? findColFuzzy('plo4', 'hands'),
    handsPLO5: findCol('PLO5 Hands', ['PLO5(Hands)'])                ?? findColFuzzy('plo5', 'hands'),
    handsPLO6: findCol('PLO6 Hands', ['PLO6(Hands)'])                ?? findColFuzzy('plo6', 'hands'),
    handsMixGame: findCol('Mix Game Hands', ['MixGame(Hands)'])       ?? findColFuzzy('mix', 'hands'),
    handsOFC:  findCol('OFC Hands', ['OFC(Hands)'])                  ?? findColFuzzy('ofc', 'hands'),
    handsMTT:  findCol('MTT Hands', ['MTT(Hands)'])                  ?? findColFuzzy('mtt', 'hands'),
    handsSNG:  findCol('SNG Hands', ['SNG(Hands)'])                  ?? findColFuzzy('sng', 'hands'),
    handsSPIN: findCol('SPIN Hands', ['SPIN(Hands)'])                ?? findColFuzzy('spin', 'hands'),
  };

  // Log which columns were found/not found for diagnostics
  const found = {};
  const notFound = [];
  for (const [key, idx] of Object.entries(C)) {
    if (idx !== undefined) found[key] = idx;
    else notFound.push(key);
  }
  console.log('[Statistics] Columns found:', JSON.stringify(found));
  if (notFound.length > 0) console.log('[Statistics] Columns NOT found:', JSON.stringify(notFound));

  if (C.playerId === undefined) return {};

  const map = {};

  function safeGet(r, idx) {
    return idx !== undefined ? parseNum(r[idx]) : 0;
  }

  // Track whether ANY row had per-modality rake data from GU columns
  const hasRakeGUColumns = C.rakeNLH !== undefined || C.rakePLO4 !== undefined ||
    C.rakePLO5 !== undefined || C.rakePLO6 !== undefined || C.rakeMTT !== undefined ||
    C.rakeSNG !== undefined || C.rakeSPIN !== undefined;

  for (let i = hIdx + 1; i < statsRows.length; i++) {
    const r = statsRows[i];
    if (!r || r.length === 0) continue;

    const pid = String(r[C.playerId] || '').trim();
    if (!pid || pid.toLowerCase() === 'none') continue;

    // Existing rake breakdown (Local, backward compat)
    const entry = {
      ringGame: safeGet(r, C.ringGame),
      mtt:      safeGet(r, C.mtt),
      sng:      safeGet(r, C.sng),
      spin:     safeGet(r, C.spin),
      tlt:      safeGet(r, C.tlt),
    };
    entry.total = entry.ringGame + entry.mtt + entry.sng + entry.spin + entry.tlt;

    // Winnings by modality (GU × 5 → BRL)
    entry.winnings = {
      nlh:     safeGet(r, C.winNLH)     * GU_TO_BRL_DEFAULT,
      plo4:    safeGet(r, C.winPLO4)    * GU_TO_BRL_DEFAULT,
      plo5:    safeGet(r, C.winPLO5)    * GU_TO_BRL_DEFAULT,
      plo6:    safeGet(r, C.winPLO6)    * GU_TO_BRL_DEFAULT,
      mixgame: safeGet(r, C.winMixGame) * GU_TO_BRL_DEFAULT,
      ofc:     safeGet(r, C.winOFC)     * GU_TO_BRL_DEFAULT,
      mtt:     safeGet(r, C.winMTT)     * GU_TO_BRL_DEFAULT,
      sng:     safeGet(r, C.winSNG)     * GU_TO_BRL_DEFAULT,
      spin:    safeGet(r, C.winSPIN)    * GU_TO_BRL_DEFAULT,
    };

    // Rake by modality (GU × 5 → BRL)
    entry.rake = {
      nlh:     safeGet(r, C.rakeNLH)     * GU_TO_BRL_DEFAULT,
      plo4:    safeGet(r, C.rakePLO4)    * GU_TO_BRL_DEFAULT,
      plo5:    safeGet(r, C.rakePLO5)    * GU_TO_BRL_DEFAULT,
      plo6:    safeGet(r, C.rakePLO6)    * GU_TO_BRL_DEFAULT,
      mixgame: safeGet(r, C.rakeMixGame) * GU_TO_BRL_DEFAULT,
      ofc:     safeGet(r, C.rakeOFC)     * GU_TO_BRL_DEFAULT,
      mtt:     safeGet(r, C.rakeMTT)     * GU_TO_BRL_DEFAULT,
      sng:     safeGet(r, C.rakeSNG)     * GU_TO_BRL_DEFAULT,
      spin:    safeGet(r, C.rakeSPIN)    * GU_TO_BRL_DEFAULT,
    };

    // Hands by modality (NOT multiplied)
    entry.hands = {
      total:   safeGet(r, C.handsTotal),
      nlh:     safeGet(r, C.handsNLH),
      plo4:    safeGet(r, C.handsPLO4),
      plo5:    safeGet(r, C.handsPLO5),
      plo6:    safeGet(r, C.handsPLO6),
      mixgame: safeGet(r, C.handsMixGame),
      ofc:     safeGet(r, C.handsOFC),
      mtt:     safeGet(r, C.handsMTT),
      sng:     safeGet(r, C.handsSNG),
      spin:    safeGet(r, C.handsSPIN),
    };

    // ── Fallback: when GU Fee columns don't exist, distribute total rake
    //    PROPORTIONALLY based on per-modality winnings (instead of dumping
    //    everything into NLH) ──────────────────────────────────────────────
    const rakeHasData = Object.values(entry.rake).some(v => v > 0);
    if (!rakeHasData && entry.total > 0) {
      // Check if we have per-modality winnings to distribute proportionally
      const winEntries = Object.entries(entry.winnings).filter(([, v]) => Math.abs(v) > 0);
      if (winEntries.length > 0) {
        // Distribute total rake proportionally by |winnings| per modality
        const totalAbsWin = winEntries.reduce((s, [, v]) => s + Math.abs(v), 0);
        if (totalAbsWin > 0) {
          // Cash modalities share ringGame, tournament modalities use their own Local values
          const cashMods = ['nlh', 'plo4', 'plo5', 'plo6', 'mixgame', 'ofc'];
          const tourneyMods = ['mtt', 'sng', 'spin'];

          // Distribute ringGame (cash total) proportionally among cash modalities by |winnings|
          const cashWins = cashMods.map(m => [m, Math.abs(entry.winnings[m] || 0)]);
          const totalCashWin = cashWins.reduce((s, [, v]) => s + v, 0);
          if (totalCashWin > 0 && entry.ringGame > 0) {
            for (const [mod, absWin] of cashWins) {
              entry.rake[mod] = round2val((absWin / totalCashWin) * entry.ringGame);
            }
          }

          // Tournament modalities: use their flat Local values directly
          for (const mod of tourneyMods) {
            entry.rake[mod] = entry[mod] || 0;
          }
        }
      } else {
        // No winnings data either — map tournament modalities directly,
        // ringGame goes to nlh as last resort
        entry.rake.nlh     = entry.ringGame || 0;
        entry.rake.mtt     = entry.mtt      || 0;
        entry.rake.sng     = entry.sng      || 0;
        entry.rake.spin    = entry.spin     || 0;
      }
    }

    map[pid] = entry;
  }

  // Attach metadata to the result for diagnostics
  map.__meta = { allHeaders, found, notFound, hasRakeGUColumns };

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
