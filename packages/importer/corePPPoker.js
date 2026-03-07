// ══════════════════════════════════════════════════════════════════════
//  packages/importer/corePPPoker.js — Core de importação PPPoker (Node.js)
//
//  Lógica pura para planilhas PPPoker.
//  Sem DOM, sem DataLayer, sem modais.
//
//  Diferenças vs Suprema:
//    - Aba "Geral" (vs "Grand Union Member Resume")
//    - Headers multi-row (rows 2-3)
//    - Hierarquia: Superagente → Agente → Jogador
//    - Valores já em BRL (sem GU × 5)
//    - Aba "Retorno de taxa" com % rakeback por agente
//    - Sem ChipPix, sem RODEO/GGR
//
//  Interface:
//    parseWorkbook(workbook, config) → ImportResult
// ══════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');
const { parseNum } = require('./adapter');

// PPPoker NÃO usa resolveSubclube — todos jogadores vão para UM único subclube

// ─── Normalize agent name: strip PPPoker prefixes ────────────────

function normalizeAgentName(raw) {
  if (!raw) return '';
  let name = String(raw).trim();
  // Strip known PPPoker prefixes: "SAG - ", "AG - ", "AG."
  name = name.replace(/^SAG\s*[-–—]\s*/i, '');
  name = name.replace(/^AG\s*[-–—]\s*/i, '');
  name = name.replace(/^AG\.\s*/i, '');
  return name.trim();
}

// ─── Find column range for a merged header ───────────────────────
// PPPoker uses merged cells in row 2 for group headers like
// "Ganhos do jogador" and "Ganhos do clube". Sub-columns are in row 3.
// We find the start col of the group header, then collect all sub-cols
// until the next group header or empty cell.

function findGroupRange(headerRow2, groupName) {
  const cols = [];
  let startCol = -1;

  // Find start of the group
  for (let c = 0; c < headerRow2.length; c++) {
    const val = String(headerRow2[c] || '').trim();
    if (val === groupName) {
      startCol = c;
      break;
    }
  }

  if (startCol === -1) return cols;

  // The group spans from startCol until we hit another non-empty cell in row 2
  // or run out of columns
  cols.push(startCol);
  for (let c = startCol + 1; c < headerRow2.length; c++) {
    const val = String(headerRow2[c] || '').trim();
    if (val && val !== groupName) break; // Next group header
    cols.push(c);
  }

  return cols;
}

// ─── Parse completo do workbook PPPoker ──────────────────────────

/**
 * Parse do workbook PPPoker com resolução de subclube e flags de validação.
 *
 * @param {Object} workbook - XLSX workbook
 * @param {Object} [config={}]
 * @param {Object} config.playerLinks     - { playerId: { agentId, agentName, subclube } }
 * @param {Object} config.agentOverrides  - { agentId: { subclube, agentName } }
 * @param {Object} config.ignoredAgents   - { agentId: true }
 * @param {Object} config.manualLinks     - { AGENT_NAME_UPPER: 'SUBCLUBE' }
 * @param {Array}  config.prefixRules     - [{ prefixes: [...], clube: '...' }]
 * @returns {ImportResult}
 */
function parseWorkbook(workbook, config = {}) {
  const {
    playerLinks    = {},
    agentOverrides = {},
    ignoredAgents  = {},
    manualLinks    = {},
    prefixRules    = [],
  } = config;

  // 1) Ler aba "Geral"
  const geralSheet = workbook.Sheets['Geral'];
  if (!geralSheet) {
    return { error: 'Aba "Geral" não encontrada', sheets: workbook.SheetNames };
  }
  const rows = XLSX.utils.sheet_to_json(geralSheet, { header: 1, defval: '' });

  // 2) Find header rows — PPPoker uses rows 2-3 (0-indexed: 1-2)
  // Row 2 (index 1) has group headers and main column headers
  // Row 3 (index 2) has sub-column headers
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim());
    if (cells.some(c => c === 'ID do jogador' || c === 'Player ID')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return { error: 'Header "ID do jogador" não encontrado na aba Geral' };
  }

  const headerRow = rows[headerRowIdx];

  // Map main columns
  const col = {};
  (headerRow || []).forEach((cell, idx) => {
    const name = String(cell || '').trim();
    if (name) {
      if (col[name] !== undefined) col[name + ':' + idx] = idx;
      else col[name] = idx;
    }
  });

  // Core column indices (PPPoker format)
  const C = {
    playerId:       col['ID do jogador'] ?? col['Player ID'],
    nick:           col['Apelido'] ?? col['Nickname'] ?? col['nickName'],
    memo:           col['Nota'] ?? col['Memo'],
    agentId:        col['ID do agente'] ?? col['Agent ID'],
    agentName:      col['Agente'] ?? col['Agent Name'],
    superAgentId:   col['ID do superagente'] ?? col['Super Agent ID'],
    superAgentName: col['Superagente'] ?? col['Super Agent Name'] ?? col['Super Agent'],
  };

  if (C.playerId === undefined) {
    return { error: 'Coluna "ID do jogador" não encontrada', columns: col };
  }

  // 3) Find "Ganhos do jogador" and "Ganhos do clube" ranges
  // These may be in the same header row or a row above
  let ganhosPlayerCols = findGroupRange(headerRow, 'Ganhos do jogador');
  let ganhosClubeCols = findGroupRange(headerRow, 'Ganhos do clube');

  // If not found in header row, try the row above (merged headers)
  if (ganhosPlayerCols.length === 0 && headerRowIdx > 0) {
    const rowAbove = rows[headerRowIdx - 1] || [];
    ganhosPlayerCols = findGroupRange(rowAbove, 'Ganhos do jogador');
    ganhosClubeCols = findGroupRange(rowAbove, 'Ganhos do clube');
  }

  // Fallback: try common column names as direct values
  if (ganhosPlayerCols.length === 0) {
    // Look for columns with "Winnings" or "Ganhos" in header
    const winIdx = col['Winnings'] ?? col['Ganhos'];
    if (winIdx !== undefined) ganhosPlayerCols = [winIdx];
  }
  if (ganhosClubeCols.length === 0) {
    const feeIdx = col['Total Fee'] ?? col['Taxa total'] ?? col['Fee'];
    if (feeIdx !== undefined) ganhosClubeCols = [feeIdx];
  }

  // 3b) Filter "Ganhos do clube" to ONLY actual tax columns
  // PPPoker includes many non-rake sub-columns under "Ganhos do clube":
  //   Geral (total), Taxa (subtotal), Taxa (jogos PPST/PPSR/...), Buy-in SPINUP,
  //   Apostas Caribbean+, Taxa do Jackpot, Prêmios Jackpot, Dividir EV, etc.
  // Only "Taxa (jogos ...)" columns are actual rake — exclude Geral, summaries,
  // jackpot, dividir EV, buy-ins, premiações, apostas, prêmios.
  const subHeaderRow = rows[headerRowIdx + 1] || [];
  if (ganhosClubeCols.length > 1 && subHeaderRow.length > 0) {
    const taxaPattern = /^taxa\s*\(/i; // Matches "Taxa (jogos PPST)" etc.
    const filteredCols = ganhosClubeCols.filter(c => {
      const sub = String(subHeaderRow[c] || '').trim();
      return taxaPattern.test(sub);
    });
    if (filteredCols.length > 0) {
      ganhosClubeCols = filteredCols;
    }
  }

  // 4) Parse data rows
  const dataStartRow = headerRowIdx + 1;
  // Check if there's a sub-header row (row 3) - skip it if so
  const firstDataRow = rows[dataStartRow];
  const firstCellVal = firstDataRow ? String(firstDataRow[C.playerId] || '').trim() : '';
  const hasSubHeader = firstCellVal === '' || /^(sub|tipo|type)/i.test(firstCellVal);
  const actualStartRow = hasSubHeader ? dataStartRow + 1 : dataStartRow;

  const players = [];
  for (let i = actualStartRow; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const pid = String(r[C.playerId] || '').trim();
    if (!pid || pid.toLowerCase() === 'total' || pid.toLowerCase() === 'none') continue;

    // Skip non-numeric player IDs (likely totals or labels)
    if (!/^\d+$/.test(pid)) continue;

    const rawAgentName    = String(r[C.agentName] || '').trim();
    const rawAgentId      = String(r[C.agentId] || '').trim();
    const rawSuperName    = C.superAgentName !== undefined ? String(r[C.superAgentName] || '').trim() : '';
    const rawSuperId      = C.superAgentId !== undefined ? String(r[C.superAgentId] || '').trim() : '';

    // Effective Agent: Superagente != "None" → Superagente, else → Agente
    const isSuperNone = !rawSuperName || /^(none|null|undefined|0)$/i.test(rawSuperName);
    const effectiveName = isSuperNone ? rawAgentName : rawSuperName;
    const effectiveId   = isSuperNone ? rawAgentId : rawSuperId;

    // Normalize agent name (strip SAG/AG prefixes)
    const normalizedAgent = normalizeAgentName(effectiveName);

    const isNoneAid  = !effectiveId || effectiveId === '0' || /^(none|null|undefined)$/i.test(effectiveId);
    const isNoneName = !normalizedAgent || /^(none|null|undefined)$/i.test(normalizedAgent);
    const isNone     = isNoneAid && isNoneName;

    // Sum ganhos do jogador (all sub-columns)
    let ganhos = 0;
    for (const c of ganhosPlayerCols) {
      ganhos += parseNum(r[c]);
    }

    // Sum ganhos do clube (rake) — all sub-columns
    let rake = 0;
    for (const c of ganhosClubeCols) {
      rake += parseNum(r[c]);
    }

    const p = {
      id:     pid,
      nick:   C.nick !== undefined ? String(r[C.nick] || '').trim() : '',
      func:   '',
      aid:    effectiveId,
      aname:  normalizedAgent,
      said:   '',  // PPPoker doesn't have sub-agents in same sense
      saname: '',
      clube:  '?',
      ganhos: ganhos,  // Already in BRL
      rake:   rake,    // Already in BRL
      ggr:    0,       // PPPoker has no GGR/RODEO
      games:  0,
      hands:  0,
      memo:   C.memo !== undefined ? String(r[C.memo] || '').trim() : '',
      _status: 'ok',
    };

    if (ignoredAgents[effectiveId]) {
      p._status = 'ignored';

    } else if (isNone) {
      const link = playerLinks[pid];
      if (link) {
        p.aid   = link.agentId;
        p.aname = link.agentName;
        p.clube = link.subclube;
        p._status = 'auto_resolved';
      } else {
        p._status = 'missing_agency';
      }

    } else {
      // PPPoker: todos jogadores vão para UM único subclube (sem prefix rules)
      // Honrar apenas overrides/links explícitos do usuário
      const ovr = agentOverrides[effectiveId];
      const upper = normalizedAgent.toUpperCase().trim();
      if (ovr && ovr.subclube) {
        p.clube = ovr.subclube;
      } else if (manualLinks[upper]) {
        p.clube = manualLinks[upper];
      } else {
        // Default: todos para o mesmo subclube
        p.clube = config.pppokerSubclube || 'PPPOKER';
        p._status = 'ok';
      }
    }

    players.push(p);
  }

  // 5) Detectar e mergear IDs duplicados
  const idCount = new Map();
  for (const p of players) {
    idCount.set(p.id, (idCount.get(p.id) || 0) + 1);
  }

  const duplicates = [];
  const mergedPlayers = [];
  const seen = new Map();

  for (const p of players) {
    if (idCount.get(p.id) > 1) {
      if (seen.has(p.id)) {
        const first = seen.get(p.id);
        first.ganhos += p.ganhos;
        first.rake   += p.rake;
        first.ggr    += p.ggr;
      } else {
        seen.set(p.id, p);
        mergedPlayers.push(p);
      }
    } else {
      mergedPlayers.push(p);
    }
  }

  for (const [id, count] of idCount) {
    if (count > 1) {
      const merged = seen.get(id);
      duplicates.push({
        id,
        nick: merged.nick,
        count,
        merged_ganhos: merged.ganhos,
        merged_rake: merged.rake,
      });
    }
  }

  const dedupPlayers = mergedPlayers;

  // 6) Ler aba "Retorno de taxa" para rbRates
  const rbRates = parseRetornoDeTaxa(workbook);

  // 7) Agrupar por status
  const all          = dedupPlayers.filter(p => p._status !== 'ignored');
  const ignored      = dedupPlayers.filter(p => p._status === 'ignored');
  const missing      = dedupPlayers.filter(p => p._status === 'missing_agency');
  const unknown      = dedupPlayers.filter(p => p._status === 'unknown_subclub');
  const autoResolved = dedupPlayers.filter(p => p._status === 'auto_resolved');
  const ok           = dedupPlayers.filter(p => p._status === 'ok');

  return {
    all,
    ignored,
    missing,
    unknown,
    autoResolved,
    ok,
    duplicates,
    rakeValidation: { matches: 0, diffs: 0, diffDetails: [] },
    chippixTrades: {},
    rbRates,
    meta: {
      totalRows: rows.length - actualStartRow,
      parsed: dedupPlayers.length,
      sheets: workbook.SheetNames,
      hasStatistics: false,
      hasTradeRecord: false,
    },
  };
}


// ─── Parse "Retorno de taxa" sheet ───────────────────────────────

function parseRetornoDeTaxa(workbook) {
  const sheet = workbook.Sheets['Retorno de taxa'] || workbook.Sheets['Retorno de Taxa'];
  if (!sheet) return {};

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  // Find header row
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
    if (cells.some(c => c.includes('agente') || c.includes('agent'))) {
      hIdx = i;
      break;
    }
  }
  if (hIdx === -1) return {};

  const headerRow = rows[hIdx];
  const col = {};
  (headerRow || []).forEach((cell, idx) => {
    const name = String(cell || '').trim();
    if (name) col[name.toLowerCase()] = idx;
  });

  // Find relevant columns
  const agentCol = col['agente'] ?? col['agent'] ?? col['superagente'] ?? col['super agent'];
  const agentIdCol = col['id do agente'] ?? col['agent id'] ?? col['id do superagente'];
  const rateCol = col['retorno médio de taxa'] ?? col['retorno medio de taxa'] ?? col['taxa de retorno'] ?? col['rate'] ?? col['%'];
  const totalCol = col['total'] ?? col['valor total'] ?? col['retorno total'];

  if (agentCol === undefined) return {};

  const rbRates = {};

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const rawName = String(r[agentCol] || '').trim();
    if (!rawName || rawName.toLowerCase() === 'total') continue;

    const agentId = agentIdCol !== undefined ? String(r[agentIdCol] || '').trim() : '';
    const normalizedName = normalizeAgentName(rawName);
    const key = agentId || normalizedName;

    if (!key) continue;

    let rate = 0;
    if (rateCol !== undefined) {
      rate = parseNum(r[rateCol]);
      // If rate > 1, it's a percentage (e.g., 50 means 50%)
      if (rate > 1) rate = rate / 100;
    }

    let total = 0;
    if (totalCol !== undefined) {
      total = parseNum(r[totalCol]);
    }

    rbRates[key] = {
      agentName: normalizedName,
      agentId: agentId,
      rate,
      total,
    };
  }

  return rbRates;
}


// ─── Validação de prontidão ──────────────────────────────────────

function validateReadiness(importResult) {
  const blockers = [];

  if (importResult.error) {
    blockers.push(`Erro no parse: ${importResult.error}`);
  }

  if (importResult.missing && importResult.missing.length > 0) {
    blockers.push(`${importResult.missing.length} jogador(es) sem agência — vincular antes de calcular`);
  }

  if (importResult.unknown && importResult.unknown.length > 0) {
    blockers.push(`${importResult.unknown.length} agente(s) com subclube desconhecido — mapear prefixo`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    summary: {
      total: (importResult.all || []).length,
      ok: (importResult.ok || []).length,
      autoResolved: (importResult.autoResolved || []).length,
      missing: (importResult.missing || []).length,
      unknown: (importResult.unknown || []).length,
      ignored: (importResult.ignored || []).length,
    },
  };
}


// ─── EXPORTS ────────────────────────────────────────────────────

module.exports = {
  parseWorkbook,
  validateReadiness,
  normalizeAgentName,
};
