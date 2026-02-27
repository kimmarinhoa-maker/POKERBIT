// ══════════════════════════════════════════════════════════════════════
//  packages/engine/calculateWeek.js — Cálculo semanal completo
//
//  Função de alto nível que recebe o modelo canônico (players + rates)
//  e produz o resultado semanal completo (por player, por agente, totais).
//
//  Interface:
//    calculateWeek(players, rates) → WeekResult
//
//  O engine NUNCA sabe o que é "Suprema", "PPPoker", etc.
//  Ele recebe dados normalizados e calcula.
// ══════════════════════════════════════════════════════════════════════

const FinanceEngine = require('./index');

/**
 * Calcula métricas semanais completas.
 *
 * @param {Array<CanonicalPlayer>} players - Jogadores normalizados da semana
 *   Cada player deve ter: { id, nick, agentName, clube, ganhos, rake, ggr }
 *
 * @param {Object} rates
 * @param {Object} rates.playerRates - { playerId_or_nick: number (0-100) }
 * @param {Object} rates.agentRates  - { agentName: number (0-100) }
 *
 * @returns {WeekResult}
 */
function calculateWeek(players, rates = {}) {
  const { playerRates = {}, agentRates = {} } = rates;

  if (!players || !players.length) {
    return { clubs: {}, allPlayers: [], totals: _emptyTotals() };
  }

  // ── Agrupar por clube ─────────────────────────────────────────────

  const clubMap = {};
  players.forEach(p => {
    const c = p.clube || 'OUTROS';
    if (!clubMap[c]) clubMap[c] = [];
    clubMap[c].push(p);
  });

  // ── Calcular por clube → agente → player ──────────────────────────

  const clubs = {};
  const allPlayerMetrics = [];

  Object.entries(clubMap).forEach(([clube, clubPlayers]) => {
    // Agrupa por agente
    const agentMap = {};
    clubPlayers.forEach(p => {
      const ag = (p.agentName || p.aname || '').trim() || '(sem agente)';
      if (!agentMap[ag]) agentMap[ag] = [];
      agentMap[ag].push(p);
    });

    const agents = Object.entries(agentMap).map(([agName, agPlayers]) => {
      const agRate = agentRates[agName] || 0;

      // ── Player metrics ──
      const playerMetrics = agPlayers.map(p => {
        const plRate = playerRates[p.id] || playerRates[p.nick] || 0;
        // Use player rate if exists, otherwise fall back to agent rate
        const effectiveRate = plRate || agRate;
        const engineP = { ganhos: p.ganhos, rake: p.rake || p.rakeGerado || 0 };
        const resultado = FinanceEngine.calcPlayerResult(engineP, effectiveRate);
        const rbValor = (engineP.rake) * effectiveRate / 100;

        const pm = {
          id: p.id,
          nick: p.nick,
          agentId: p.aid || p.agentId || '',
          agentName: p.agentName || p.aname || '',
          clube,
          ganhos: p.ganhos,
          rake: engineP.rake,
          ggr: p.ggr || 0,
          rbRate: effectiveRate,
          rbValor,
          resultado,
          rakeBreakdown: p.rakeBreakdown || null,
        };
        allPlayerMetrics.push(pm);
        return pm;
      });

      // ── Agent metrics via engine ──
      const enginePlayers = agPlayers.map(p => ({
        ganhos: p.ganhos,
        rake: p.rake || p.rakeGerado || 0,
      }));
      const agResult = FinanceEngine.calcAgentResult(enginePlayers, agRate, false, null);

      return {
        agentName: agName,
        agentRate: agRate,
        playerCount: agPlayers.length,
        rakeTime: agResult.rakeTime,
        ganhosTime: agResult.ganhosTime,
        pctAgente: agResult.pctAgente,
        rbAgente: agResult.rbAgente,
        resultadoAgente: agResult.resultadoAgente,
        players: playerMetrics,
      };
    });

    // ── Club totals ──
    const totals = {
      players: clubPlayers.length,
      agents: Object.keys(agentMap).length,
      ganhos: _sum(clubPlayers, 'ganhos'),
      rake: _sum(clubPlayers, p => p.rake || p.rakeGerado || 0),
      ggr: _sum(clubPlayers, 'ggr'),
      rbTotal: agents.reduce((s, a) => s + a.rbAgente, 0),
      resultadoTotal: agents.reduce((s, a) => s + a.resultadoAgente, 0),
    };

    clubs[clube] = { totals, agents };
  });

  // ── Grand totals ──────────────────────────────────────────────────

  const totals = {
    players: players.length,
    clubs: Object.keys(clubs).length,
    ganhos: _sum(players, 'ganhos'),
    rake: _sum(players, p => p.rake || p.rakeGerado || 0),
    ggr: _sum(players, 'ggr'),
  };

  return { clubs, allPlayers: allPlayerMetrics, totals };
}

// ─── Helpers ────────────────────────────────────────────────────────

function _sum(arr, keyOrFn) {
  if (typeof keyOrFn === 'function') {
    return arr.reduce((s, p) => s + (keyOrFn(p) || 0), 0);
  }
  return arr.reduce((s, p) => s + (Number(p[keyOrFn]) || 0), 0);
}

function _emptyTotals() {
  return { players: 0, clubs: 0, ganhos: 0, rake: 0, ggr: 0, rbTotal: 0, resultadoTotal: 0 };
}

module.exports = { calculateWeek };
