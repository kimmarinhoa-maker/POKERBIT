// ══════════════════════════════════════════════════════════════════════
//  adapterImport.js — Importação Grand Union (Suprema Poker)
//  Fonte primária: aba "Grand Union Member Resume" (valores GU × 5)
//  Enriquecimento: aba "Grand Union Member Statistics" (breakdown Local)
//  Multiplicador GU → BRL: fixo ×5
// ══════════════════════════════════════════════════════════════════════

const GU_TO_BRL = 5;

// ─── CLASSIFICAÇÃO DE CLUBE ─────────────────────────────────────────

/**
 * Resolve o clube interno a partir do nome do agente.
 * Remove prefixos comuns (AG, AG.) e compara por startsWith.
 *
 * Exemplos reais:
 *   "AG AMS IMPÉRIO"       → IMPERIO
 *   "AG TW The Wolf"       → IMPERIO
 *   "AG BB AMS BB"         → IMPERIO
 *   "Ag. TGP Nacho"        → TGP
 *   "CONFRA MKT"           → CONFRARIA
 *   "3BET Tufao"           → 3BET
 *   "AG CH CF"             → CH
 *   "None"                 → OUTROS
 */
function resolveClubeInterno(agentName) {
  let name = String(agentName || '').toUpperCase().trim();

  // Remove prefixos de agente: "AG." / "AG " (com ou sem ponto)
  name = name.replace(/^AG[\.\s]+/i, '').trim();

  // Se ficou vazio ou é "NONE", retorna OUTROS
  if (!name || name === 'NONE') return 'OUTROS';

  // Regras por prefixo (após remoção do "AG"/"AG.")
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

  // Fallback: busca "TGP" em qualquer posição do nome
  // (cobre casos como "Capaneze.TGP", "HOME GAME UDI.TGP")
  if (name.includes('TGP')) return 'TGP';

  return 'OUTROS';
}


// ─── UTILITÁRIOS ────────────────────────────────────────────────────

/** Converte valor bruto da célula em número (trata formatos BR e EN) */
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

/**
 * Encontra a linha de header em um array de rows (array de arrays).
 * Procura pela primeira linha que contém "Player ID".
 * @returns {number} índice da linha de header, ou -1
 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim());
    if (cells.some(c => c === 'Player ID')) return i;
  }
  return -1;
}

/**
 * Cria um mapa { nomeColuna → índice } a partir de uma linha de header.
 * Nomes são mantidos exatamente como estão na planilha.
 */
function mapCols(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, idx) => {
    const name = String(cell || '').trim();
    if (name) {
      // Se a coluna já existe, armazena com sufixo ":idx" para desambiguar
      // (a planilha tem colunas duplicadas como "Total(Local)" em seções diferentes)
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

/**
 * Lê a aba "Grand Union Member Resume" e retorna array normalizado.
 * Valores estão em GU — multiplica por GU_TO_BRL (5) para obter BRL.
 *
 * @param {Array<Array>} resumeRows - Linhas brutas do sheet_to_json(header:1)
 * @returns {Array<Object>} Array normalizado
 */
function adapterImportResume(resumeRows) {
  if (!resumeRows || resumeRows.length < 2) return [];

  const hIdx = findHeaderRow(resumeRows);
  if (hIdx === -1) {
    console.error('[adapterImport] Header "Player ID" não encontrado na aba Resume');
    return [];
  }

  const headers = resumeRows[hIdx];
  const col = mapCols(headers);

  // Colunas esperadas (Resume)
  const C = {
    playerId:    col['Player ID'],
    nickName:    col['nickName'],
    agentId:     col['Agent ID'],
    agentName:   col['Agent Name'],
    subAgentId:  col['Sub Agent ID'],
    subAgentName:col['Sub Agent Name'],
    winnings:    col['Winnings'],          // GU
    totalFee:    col['Total Fee'],          // GU (= rake total)
    adminFee:    col['Admin Fee'],          // GU
    jackpotFee:  col['Jackpot Fee'],        // GU (NÃO entra no rake)
    rodeioProfit:col['RODEO Total Profit'], // GU
    games:       col['Games'],
    hands:       col['Hands'],
    role:        col['Role'],
  };

  // Validação
  if (C.playerId === undefined || C.winnings === undefined || C.totalFee === undefined) {
    console.error('[adapterImport] Colunas obrigatórias não encontradas:', C);
    return [];
  }

  console.log('[adapterImport] Resume — mapeamento de colunas:', C);

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
      ganhos:       parseNum(r[C.winnings])      * GU_TO_BRL,
      rakeGerado:   parseNum(r[C.totalFee])      * GU_TO_BRL,
      ggr:          parseNum(r[C.rodeioProfit])   * GU_TO_BRL,
      games:        parseNum(r[C.games]),
      hands:        parseNum(r[C.hands]),
    });
  }

  console.log(`[adapterImport] Resume: ${result.length} jogadores importados`);
  return result;
}


// ─── ENRIQUECIMENTO (STATISTICS) ────────────────────────────────────

/**
 * Lê a aba "Grand Union Member Statistics" e retorna um mapa de
 * Player ID → breakdown de rake por modalidade (valores já em BRL/Local).
 *
 * @param {Array<Array>} statsRows - Linhas brutas do sheet_to_json(header:1)
 * @returns {Object} Mapa { playerId: { ringGame, mtt, sng, spin, tlt, total } }
 */
function parseStatisticsBreakdown(statsRows) {
  if (!statsRows || statsRows.length < 2) return {};

  const hIdx = findHeaderRow(statsRows);
  if (hIdx === -1) {
    console.warn('[adapterImport] Header não encontrado na aba Statistics');
    return {};
  }

  const headers = statsRows[hIdx];
  const col = mapCols(headers);

  // Rake por modalidade (Local) — já em BRL, sem multiplicar
  const C = {
    playerId:  col['Player ID'],
    ringGame:  col['Ring Game Total(Local)'],
    mtt:       col['MTT Total(Local)'],
    sng:       col['SNG Total(Local)'],
    spin:      col['SPIN Total(Local)'],
    tlt:       col['TLT Total(Local)'],
  };

  if (C.playerId === undefined) {
    console.warn('[adapterImport] Coluna Player ID não encontrada na Statistics');
    return {};
  }

  console.log('[adapterImport] Statistics — colunas de rake:', C);

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

  console.log(`[adapterImport] Statistics: breakdown de ${Object.keys(map).length} jogadores`);
  return map;
}


// ─── FUNÇÃO PRINCIPAL: IMPORTA E ENRIQUECE ──────────────────────────

/**
 * Função principal de importação. Recebe o workbook do SheetJS,
 * lê Resume (primária) e Statistics (enriquecimento), e retorna
 * o array final normalizado.
 *
 * @param {Object} workbook - Workbook do XLSX.read()
 * @returns {Array<Object>} Array de jogadores normalizado
 */
function adapterImport(workbook) {
  // 1) Ler aba Resume (fonte primária)
  const resumeSheet = workbook.Sheets['Grand Union Member Resume'];
  if (!resumeSheet) {
    console.error('[adapterImport] Aba "Grand Union Member Resume" não encontrada!');
    console.log('Abas disponíveis:', workbook.SheetNames);
    return [];
  }
  const resumeRows = XLSX.utils.sheet_to_json(resumeSheet, { header: 1, defval: '' });
  const players = adapterImportResume(resumeRows);

  // 2) Ler aba Statistics (enriquecimento — opcional)
  const statsSheet = workbook.Sheets['Grand Union Member Statistics'];
  let breakdown = {};
  if (statsSheet) {
    const statsRows = XLSX.utils.sheet_to_json(statsSheet, { header: 1, defval: '' });
    breakdown = parseStatisticsBreakdown(statsRows);
  } else {
    console.warn('[adapterImport] Aba Statistics não encontrada — sem breakdown');
  }

  // 3) Merge: adiciona breakdown a cada jogador
  for (const p of players) {
    p.rakeBreakdown = breakdown[p.id] || {
      ringGame: 0, mtt: 0, sng: 0, spin: 0, tlt: 0, total: 0
    };
  }

  // 4) Validação cruzada (log de conferência)
  let diffCount = 0;
  for (const p of players) {
    const resumeRake = p.rakeGerado;
    const statsRake  = p.rakeBreakdown.total;
    const diff = Math.abs(resumeRake - statsRake);
    if (diff > 0.1 && statsRake > 0) {
      diffCount++;
      if (diffCount <= 5) {
        console.warn(`[validação] ${p.id} ${p.nick}: Resume rake=${resumeRake.toFixed(2)}, Stats soma=${statsRake.toFixed(2)}, diff=${diff.toFixed(2)}`);
      }
    }
  }
  if (diffCount > 0) {
    console.warn(`[validação] ${diffCount} jogador(es) com diferença entre Resume e Statistics`);
  } else if (Object.keys(breakdown).length > 0) {
    console.log('[validação] ✅ Rake Resume × Statistics — todos batem!');
  }

  console.log(`[adapterImport] ✅ Importação completa: ${players.length} jogadores`);
  return players;
}


// ══════════════════════════════════════════════════════════════════════
//  USO:
// ══════════════════════════════════════════════════════════════════════
//
//  const workbook = XLSX.read(fileData, { type: 'array' });
//  const players  = adapterImport(workbook);
//
//  // Cada player retorna:
//  // {
//  //   id: "37490",
//  //   nick: "AG TGP AltoVale",
//  //   func: "SUPERAGENT",
//  //   aid: "37490",  aname: "AG TGP AltoVale",
//  //   said: "None",  saname: "None",
//  //   clubeInterno: "TGP",
//  //   ganhos: -6241.65,          ← Winnings × 5
//  //   rakeGerado: 1980.30,       ← Total Fee × 5
//  //   ggr: 0,                    ← RODEO Profit × 5
//  //   games: 36, hands: 1297,
//  //   rakeBreakdown: {           ← da aba Statistics (Local)
//  //     ringGame: 1921, mtt: 41.80, sng: 17.50,
//  //     spin: 0, tlt: 0, total: 1980.30
//  //   }
//  // }
//
// ══════════════════════════════════════════════════════════════════════
