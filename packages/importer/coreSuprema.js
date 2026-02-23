// ══════════════════════════════════════════════════════════════════════
//  packages/importer/coreSuprema.js — Core de importação Suprema (Node.js)
//
//  Lógica pura extraída de import-processor.js (browser).
//  Sem DOM, sem DataLayer, sem modais.
//  Todas as dependências externas são injetadas via parâmetros.
//
//  Interface:
//    parseWorkbook(workbook, config) → ImportResult
//    validatePlayers(players)        → ValidationReport
// ══════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');
const { adapterImportResume, parseStatisticsBreakdown, parseNum, GU_TO_BRL } = require('./adapter');

// ─── Resolve clube interno com suporte a config injetada ────────────

/**
 * Resolve o subclube a partir do agentName, usando regras configuráveis.
 *
 * Ordem de resolução (igual ao import-processor.js do browser):
 *   1. Override por agentId (mais forte)
 *   2. Manual link por agentName normalizado
 *   3. Regras de prefixo (configuráveis)
 *   4. Fallback: busca TGP no nome
 *   5. Se nada bater: retorna '?'
 *
 * @param {string} agentName
 * @param {string} agentId
 * @param {Object} config
 * @param {Object} config.agentOverrides   - { agentId: { subclube, agentName } }
 * @param {Object} config.manualLinks      - { AGENT_NAME_UPPER: 'SUBCLUBE' }
 * @param {Array}  config.prefixRules      - [{ prefixes: ['AMS','TW'], clube: 'IMPERIO' }]
 * @returns {string} nome do subclube ou '?'
 */
function resolveSubclube(agentName, agentId, config) {
  const { agentOverrides = {}, manualLinks = {}, prefixRules = [] } = config;

  // 1. Override por agentId
  const ovr = agentOverrides[agentId];
  if (ovr && ovr.subclube) return ovr.subclube;

  // 2. Manual link
  const upper = String(agentName || '').toUpperCase().trim();
  if (manualLinks[upper]) return manualLinks[upper];

  // 3. Regras de prefixo
  let name = upper.replace(/^AG[\.\s]+/i, '').trim();
  if (!name || name === 'NONE') return '?';

  const defaultRules = prefixRules.length > 0 ? prefixRules : [
    { prefixes: ['AMS', 'TW', 'BB'], clube: 'IMPERIO' },
    { prefixes: ['TGP'],             clube: 'TGP' },
    { prefixes: ['CONFRA'],          clube: 'CONFRARIA' },
    { prefixes: ['3BET'],            clube: '3BET' },
    { prefixes: ['CH'],              clube: 'CH' },
  ];

  for (const rule of defaultRules) {
    for (const prefix of rule.prefixes) {
      if (name.startsWith(prefix)) return rule.clube;
    }
  }

  // 4. Fallback TGP
  if (name.includes('TGP')) return 'TGP';

  return '?';
}


// ─── Parse completo do workbook com validação ───────────────────────

/**
 * Parse do workbook Suprema com resolução de subclube e flags de validação.
 *
 * @param {Object} workbook - XLSX workbook (do XLSX.readFile ou XLSX.read)
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

  // 1) Ler aba Resume
  const resumeSheet = workbook.Sheets['Grand Union Member Resume'];
  if (!resumeSheet) {
    return { error: 'Aba "Grand Union Member Resume" não encontrada', sheets: workbook.SheetNames };
  }
  const resumeRows = XLSX.utils.sheet_to_json(resumeSheet, { header: 1, defval: '' });

  // 2) Parse header
  const hIdx = findHeaderRow(resumeRows);
  if (hIdx === -1) {
    return { error: 'Header "Player ID" não encontrado na aba Resume' };
  }
  const col = mapCols(resumeRows[hIdx]);

  const C = {
    playerId:     col['Player ID'],
    nickName:     col['nickName'],
    agentId:      col['Agent ID'],
    agentName:    col['Agent Name'],
    subAgentId:   col['Sub Agent ID'],
    subAgentName: col['Sub Agent Name'],
    winnings:     col['Winnings'],
    totalFee:     col['Total Fee'],
    rodeioProfit: col['RODEO Total Profit'],
    games:        col['Games'],
    hands:        col['Hands'],
    role:         col['Role'],
  };

  if (C.playerId === undefined || C.winnings === undefined || C.totalFee === undefined) {
    return { error: 'Colunas obrigatórias ausentes', columns: C };
  }

  // 3) Parse rows com resolução de subclube
  const players = [];
  for (let i = hIdx + 1; i < resumeRows.length; i++) {
    const r = resumeRows[i];
    if (!r || r.length === 0) continue;

    const pid = String(r[C.playerId] || '').trim();
    if (!pid || pid.toLowerCase() === 'none') continue;

    const aname  = String(r[C.agentName] || '').trim();
    const rawAid = String(r[C.agentId] || '').trim();

    const isNoneAid  = !rawAid || rawAid === '0' || /^(none|null|undefined)$/i.test(rawAid);
    const isNoneName = !aname  || /^(none|null|undefined)$/i.test(aname);
    const isNone     = isNoneAid || isNoneName;

    const p = {
      id:     pid,
      nick:   String(r[C.nickName] || '').trim(),
      func:   String(r[C.role] || '').trim(),
      aid:    rawAid,
      aname:  aname,
      said:   String(r[C.subAgentId] || '').trim(),
      saname: String(r[C.subAgentName] || '').trim(),
      clube:  '?',
      ganhos: parseNum(r[C.winnings])     * GU_TO_BRL,
      rake:   parseNum(r[C.totalFee])     * GU_TO_BRL,
      ggr:    C.rodeioProfit !== undefined ? parseNum(r[C.rodeioProfit]) * GU_TO_BRL : 0,
      games:  parseNum(r[C.games]),
      hands:  parseNum(r[C.hands]),
      // Flags de validação
      _status: 'ok',  // 'ok' | 'ignored' | 'missing_agency' | 'unknown_subclub' | 'auto_resolved'
    };

    if (ignoredAgents[rawAid]) {
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
      p.clube = resolveSubclube(aname, rawAid, { agentOverrides, manualLinks, prefixRules });
      if (p.clube === '?') p._status = 'unknown_subclub';
    }

    players.push(p);
  }

  // 3.5) Detectar e mergear IDs duplicados
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
        // Somar valores no primeiro registro
        const first = seen.get(p.id);
        first.ganhos += p.ganhos;
        first.rake   += p.rake;
        first.ggr    += p.ggr;
        first.games  += p.games;
        first.hands  += p.hands;
      } else {
        // Primeiro registro com este ID — guardar referência
        seen.set(p.id, p);
        mergedPlayers.push(p);
      }
    } else {
      mergedPlayers.push(p);
    }
  }

  // Montar array de duplicados para o frontend
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

  // Substituir players pelo array deduplicado
  const dedupPlayers = mergedPlayers;

  // 4) Ler aba Statistics (enriquecimento)
  const statsSheet = workbook.Sheets['Grand Union Member Statistics'];
  let breakdown = {};
  if (statsSheet) {
    const statsRows = XLSX.utils.sheet_to_json(statsSheet, { header: 1, defval: '' });
    breakdown = parseStatisticsBreakdown(statsRows);
  }

  // 5) Merge breakdown
  let rakeValidation = { matches: 0, diffs: 0, diffDetails: [] };
  for (const p of dedupPlayers) {
    p.rakeBreakdown = breakdown[p.id] || { ringGame: 0, mtt: 0, sng: 0, spin: 0, tlt: 0, total: 0 };
    if (p._status !== 'ignored' && p.rakeBreakdown.total > 0) {
      const diff = Math.abs(p.rake - p.rakeBreakdown.total);
      if (diff > 0.1) {
        rakeValidation.diffs++;
        if (rakeValidation.diffDetails.length < 5) {
          rakeValidation.diffDetails.push({ id: p.id, nick: p.nick, resume: p.rake, stats: p.rakeBreakdown.total, diff });
        }
      } else {
        rakeValidation.matches++;
      }
    }
  }

  // 6) Agrupar por status
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
    rakeValidation,
    meta: {
      totalRows: resumeRows.length - hIdx - 1,
      parsed: dedupPlayers.length,
      sheets: workbook.SheetNames,
      hasStatistics: !!statsSheet,
    },
  };
}


// ─── Validação de prontidão para fechamento ─────────────────────────

/**
 * Verifica se o resultado do import está pronto para calcular.
 * Retorna pendências bloqueantes.
 *
 * @param {ImportResult} importResult
 * @returns {{ ready: boolean, blockers: string[] }}
 */
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


// ─── Helpers (re-exportados do adapter, sem duplicar) ───────────────

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
      if (map[name] !== undefined) map[name + ':' + idx] = idx;
      else map[name] = idx;
    }
  });
  return map;
}


// ─── EXPORTS ────────────────────────────────────────────────────────

module.exports = {
  parseWorkbook,
  resolveSubclube,
  validateReadiness,
  GU_TO_BRL,
};
