// ══════════════════════════════════════════════════════════════════════
//  dataLayer.js — Camada de Armazenamento (Poker Manager)
//  Centraliza todo acesso ao localStorage.
//
//  CARRY-FORWARD — hierarquia de leitura (backward-compat):
//    1. pm_saldo_prev[clube][weekKey][entityId]   ← escrita canônica
//    2. pm_finSnapshot[clube||weekKey].balances[entityId].saldoFinal
//    3. pm_fin[clube||weekKey][entityId].saldoAberto       (legado)
// ══════════════════════════════════════════════════════════════════════

window.DataLayer = (function () {
  'use strict';

  // ─── CHAVES DE STORAGE ───────────────────────────────────────────────
  const KEYS = {
    imports        : 'pm_imports',
    agentRB        : 'pm_agentRB',
    playerRB       : 'pm_playerRB',
    agentDirect    : 'pm_agentDirect',
    rbSnapPlayers  : 'pm_rbSnapPlayers',
    rbSnapAgents   : 'pm_rbSnapAgents',
    fin            : 'pm_fin',
    finSnapshot    : 'pm_finSnapshot',
    weekLocked     : 'pm_weekLocked',
    saldoPrev      : 'pm_saldo_prev',
    carry          : 'pm_carry',
    playerLink     : 'pm_playerLink',
    agentSubclubOvr: 'pm_agentSubclubOvr',
    agentsBySubclub: 'pm_agentsBySubclub',
    ignoredAgents  : 'pm_ignoredAgents',
    // ── Novas keys (Passo 2) ──
    ligaConfig     : 'pm_ligaConfig',
    playerDirect   : 'pm_playerDirect',
    clubLogos      : 'pm_club_logos',
    overlay        : 'pm_overlay',
    overlayClubes  : 'pm_overlayClubes',
    clubManual     : 'pm_clubManual',
    payMethods     : 'pm_pay_methods',
    payMethodsAlt  : 'pm_payMethods',
    ofxMap         : 'pm_ofx_map',
    cpMap          : 'pm_cp_map',
    transCategories: 'pm_transactionCategories',
    bankAccounts   : 'pm_bankAccounts',
    movements      : 'pm_movements',
    staged         : 'pm_staged',
    snapshots      : 'pm_snapshots',
  };

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch(e) { console.error('[DataLayer] Erro ao ler ' + key, e); return {}; }
  }
  function _getArr(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch(e) { console.error('[DataLayer] Erro ao ler ' + key, e); return []; }
  }
  function _getRaw(key, fallback) {
    var raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); }
    catch(e) { return fallback; }
  }
  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ─── LAYER 1: IMPORTAÇÕES ────────────────────────────────────────────

  function saveImport(weekKey, players, fileName) {
    var all = _get(KEYS.imports);
    all[String(weekKey)] = {
      players: players.map(function (p) {
        return {
          id: p.id, nick: p.nick, func: p.func, aid: p.aid, aname: p.aname,
          said: p.said, saname: p.saname, ganhos: p.ganhos, rake: p.rake,
          ggr: p.ggr, result: p.result, clube: p.clube, rakeback: p.rakeback || 0
        };
      }),
      fileName: fileName || '',
      importedAt: new Date().toISOString()
    };
    _set(KEYS.imports, all);
  }

  function loadImport(weekKey) {
    var all = _get(KEYS.imports);
    return all[String(weekKey)] || null;
  }

  function hasImport(weekKey) {
    return !!(_get(KEYS.imports)[String(weekKey)]);
  }

  function listImportedWeeks() {
    return Object.keys(_get(KEYS.imports));
  }

  // ─── LAYER 2: RB CONFIG & SNAPSHOT ──────────────────────────────────

  function getRBConfig() {
    return {
      agents : _get(KEYS.agentRB),
      players: _get(KEYS.playerRB)
    };
  }

  function getRBSnapshot(weekKey) {
    var sp = _get(KEYS.rbSnapPlayers);
    var sa = _get(KEYS.rbSnapAgents);
    return {
      players: sp[String(weekKey)] || null,
      agents : sa[String(weekKey)] || null
    };
  }

  // ─── LAYER 3: PAGAMENTOS (sempre editável) ───────────────────────────

  function getPayments(clubeWeekKey) {
    return _get(KEYS.fin)[clubeWeekKey] || {};
  }

  function savePayments(clubeWeekKey, data) {
    var all = _get(KEYS.fin);
    all[clubeWeekKey] = data;
    _set(KEYS.fin, all);
  }

  // ─── LAYER 4: CARRY-FORWARD ──────────────────────────────────────────

  /**
   * Lê o carry de uma agência para um clube/semana.
   * (acesso legado por agKey — mantido para compatibilidade)
   *
   * @param {string} clube
   * @param {string} weekKey
   * @returns {Object} mapa { agKey → saldoFinal }
   */
  function getCarry(clube, weekKey) {
    var all = _get(KEYS.carry);
    return all[clube + '||' + String(weekKey)] || {};
  }

  /**
   * Salva o carry de uma agência para um clube/semana.
   *
   * @param {string} clube
   * @param {string} weekKey
   * @param {Object} carryMap - { agKey → saldoFinal }
   */
  function saveCarry(clube, weekKey, carryMap) {
    var all = _get(KEYS.carry);
    all[clube + '||' + String(weekKey)] = carryMap;
    _set(KEYS.carry, all);
  }

  /**
   * Lê o saldo anterior de uma entidade (entityId) para um clube/semana.
   * Hierarquia: pm_saldo_prev → pm_finSnapshot → pm_fin.saldoAberto (legado)
   *
   * @param {string} entityId     - makeEntityId('ag', agKey) | makeEntityId('pl', id)
   * @param {string} clube
   * @param {string} weekKey      - semana ATUAL (não a anterior)
   * @param {number} currentIdx   - índice da semana atual em weeks[]
   * @param {Array}  weeks        - array de datas/chaves das semanas
   * @returns {number}
   */
  function getSaldoAnterior(entityId, clube, weekKey, currentIdx, weeks) {
    if (!clube || currentIdx <= 0) return 0;

    // 1ª fonte: pm_saldo_prev (escrita por fecharSemanaFinanceiro)
    var prevMap = _get(KEYS.saldoPrev);
    var clubePrev = prevMap[clube];
    if (clubePrev && clubePrev[weekKey] && typeof clubePrev[weekKey][entityId] === 'number') {
      var v1 = clubePrev[weekKey][entityId];
      if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← saldo_prev:', v1);
      return v1;
    }

    // 2ª fonte: pm_finSnapshot (lock de semana)
    // Busca SOMENTE a semana locked mais recente antes da atual.
    // INTENCIONAL: se a semana locked mais recente não tem dado para esta entidade,
    // retorna 0 — a entidade estava zerada naquele ponto. Não busca semanas ainda
    // mais antigas (evita carry de dados obsoletos). Comportamento herdado do original.
    var snapAll = _get(KEYS.finSnapshot);
    for (var i = currentIdx - 1; i >= 0; i--) {
      var sem = weeks[i];
      if (!sem) continue;
      var locked = _get(KEYS.weekLocked);
      if (!locked[String(sem)]) continue;  // pula semanas não-lockadas

      // Encontrou a semana locked mais recente — usa SÓ esta, depois para.
      var snapKey = clube + '||' + sem;
      var snap = snapAll[snapKey];
      if (snap && snap.balances && snap.balances[entityId]) {
        var val = snap.balances[entityId].saldoFinal;
        if (typeof val === 'number' && Math.abs(val) > 0.01) {
          if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← finSnapshot(' + sem + '):', val);
          return val;
        }
        if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← finSnapshot(' + sem + '): 0 (saldo zero no snapshot)');
        return 0;  // entidade existia no snapshot com saldo zero
      }

      // 3ª fonte: pm_fin.saldoAberto (legado — mesma semana locked)
      var allFin = _get(KEYS.fin);
      var k = clube + '||' + sem;
      var ent = allFin[k] && allFin[k][entityId];
      if (ent && typeof ent.saldoAberto === 'number' && Math.abs(ent.saldoAberto) > 0.01) {
        if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← fin.saldoAberto(' + sem + '):', ent.saldoAberto);
        return ent.saldoAberto;
      }
      if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← sem registro na semana locked ' + sem + ' → 0');
      return 0;  // semana locked encontrada, entidade sem registro → saldo zero
    }
    if (window.DEBUG_FINANCE) console.log('[carry] ' + entityId + ' ← sem semana locked encontrada → 0');
    return 0;
  }

  /**
   * Grava o saldo anterior de uma entidade no pm_saldo_prev.
   * (Canônico — chamado por fecharSemanaFinanceiro)
   *
   * @param {string} entityId
   * @param {string} clube
   * @param {string} nextWeekKey - semana SEGUINTE (destino do carry)
   * @param {number} valor
   */
  function setCarryForEntity(entityId, clube, nextWeekKey, valor) {
    var prevMap = _get(KEYS.saldoPrev);
    if (!prevMap[clube]) prevMap[clube] = {};
    if (!prevMap[clube][nextWeekKey]) prevMap[clube][nextWeekKey] = {};
    prevMap[clube][nextWeekKey][entityId] = valor;
    _set(KEYS.saldoPrev, prevMap);
  }

  // ─── CARRY AUTO (computeCarryForWeek) ───────────────────────────────
  //
  // Calcula o carry automático da semana anterior.
  // FÓRMULA CANÔNICA: saldoFinal = saldoAnterior + resultado − ledgerNet
  // onde ledgerNet = entradas(dir='in') − saidas(dir='out')
  //
  // Nota: este método lê diretamente do localStorage para manter-se
  // independente do estado global da UI.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Calcula carry da semana anterior → semana atual para um clube.
   *
   * @param {string} clube
   * @param {number} currentWeekIdx - índice da semana atual
   * @param {Array}  weeksArr       - array de datas/chaves das semanas
   * @returns {Object} mapa { agKey → saldoFinal }
   */
  function computeCarryForWeek(clube, currentWeekIdx, weeksArr) {
    if (currentWeekIdx <= 0) return {};

    var prevWeekKey  = String(weeksArr[currentWeekIdx - 1]);
    var prevImport   = loadImport(prevWeekKey);
    if (!prevImport || !prevImport.players.length) return {};

    var prevPlayers  = prevImport.players.filter(function (p) { return p.clube === clube; });
    if (!prevPlayers.length) return {};

    // Agrupa por agência
    var agMap = {};
    prevPlayers.forEach(function (p) {
      var k = p.aname || '(sem agente)';
      if (!agMap[k]) agMap[k] = [];
      agMap[k].push(p);
    });

    var prevFinKey   = clube + '||' + prevWeekKey;
    var prevPayments = getPayments(prevFinKey);
    var prevCarry    = getCarry(clube, prevWeekKey);
    var snap         = getRBSnapshot(prevWeekKey);
    var agentDirectMap = _get(KEYS.agentDirect);
    var agentRBMap   = _get(KEYS.agentRB);
    var playerRBMap  = _get(KEYS.playerRB);

    var carry = {};

    Object.entries(agMap).forEach(function (kv) {
      var agKey   = kv[0];
      var players = kv[1];

      var totGanhos = players.reduce(function (s, p) { return s + (Number(p.ganhos) || 0); }, 0);
      var totRake   = players.reduce(function (s, p) { return s + (Number(p.rake)   || 0); }, 0);

      var isDirect = !!(agentDirectMap[agKey]);
      var totRB = 0;

      if (isDirect) {
        totRB = players.reduce(function (s, p) {
          var pct = 0;
          if (snap.players && snap.players[String(p.id)] !== undefined) {
            pct = Number(snap.players[String(p.id)]) || 0;
          } else {
            var pOv = playerRBMap[String(p.id)];
            if (pOv !== undefined && pOv !== null && pOv !== '') {
              pct = Number(pOv) || 0;
            } else {
              var cfg = agentRBMap[agKey] || {};
              pct = Number(cfg.pctAgente != null ? cfg.pctAgente : cfg.pct) || 0;
            }
          }
          return s + (Number(p.rake) || 0) * pct / 100;
        }, 0);
      } else {
        var pctAg = 0;
        if (snap.agents && snap.agents[agKey] !== undefined) {
          pctAg = Number(snap.agents[agKey]) || 0;
        } else {
          var cfg = agentRBMap[agKey] || {};
          pctAg = Number(cfg.pctAgente != null ? cfg.pctAgente : cfg.pct) || 0;
        }
        totRB = totRake * pctAg / 100;
      }

      var resultado = totGanhos + totRB;

      // Coleta historico relevante para os jogadores desta agência
      var allHistorico = [];
      players.forEach(function (p) {
        Object.values(prevPayments).forEach(function (entity) {
          (entity.historico || []).forEach(function (h) {
            if (String(h.cpId || '') === String(p.id)) {
              allHistorico.push(h);
            }
          });
        });
      });
      var ledgerNet = window.FinanceEngine.calcLedgerNet(allHistorico).net;

      var saldoAnterior = Number(prevCarry[agKey]) || 0;

      var saldoFinal = window.FinanceEngine.calcSaldoAtual(saldoAnterior, resultado, ledgerNet);
      carry[agKey] = saldoFinal;
    });

    return carry;
  }

  /**
   * Persiste carry ao trocar de semana ou lockar.
   *
   * @param {string} clube
   * @param {string} weekKey        - semana ATUAL
   * @param {number} currentWeekIdx
   * @param {Array}  weeksArr
   * @returns {Object} carry calculado
   */
  function persistCarry(clube, weekKey, currentWeekIdx, weeksArr) {
    var carry = computeCarryForWeek(clube, currentWeekIdx, weeksArr);
    saveCarry(clube, weekKey, carry);
    return carry;
  }

  // ─── VÍNCULOS DE JOGADORES E AGENTES ─────────────────────────────────

  // pm_playerLink: vínculo permanente player → agente+subclube (para NONE players)
  function getPlayerLinks() { return _get(KEYS.playerLink); }

  function savePlayerLink(playerId, data) {
    var all = _get(KEYS.playerLink);
    all[String(playerId)] = {
      subclube : data.subclube,
      agentId  : String(data.agentId || ''),
      agentName: data.agentName || '',
      updatedAt: new Date().toISOString()
    };
    _set(KEYS.playerLink, all);
  }

  function removePlayerLink(playerId) {
    var all = _get(KEYS.playerLink);
    delete all[String(playerId)];
    _set(KEYS.playerLink, all);
  }

  // pm_agentSubclubOvr: override explícito agente → subclube
  function getAgentSubclubOvr() { return _get(KEYS.agentSubclubOvr); }

  function saveAgentSubclubOvr(agentId, data) {
    var all = _get(KEYS.agentSubclubOvr);
    all[String(agentId)] = {
      subclube : data.subclube,
      agentName: data.agentName || '',
      updatedAt: new Date().toISOString()
    };
    _set(KEYS.agentSubclubOvr, all);
  }

  // pm_agentsBySubclub: registry {subclube: {agentId: agentName}} (cresce com imports)
  function getAgentsBySubclub() { return _get(KEYS.agentsBySubclub); }

  function saveAgentToSubclub(subclube, agentId, agentName) {
    var all = _get(KEYS.agentsBySubclub);
    if (!all[subclube]) all[subclube] = {};
    all[subclube][String(agentId)] = agentName || '';
    _set(KEYS.agentsBySubclub, all);
  }

  // pm_ignoredAgents: agentes explicitamente ignorados (fora dos fechamentos)
  function getIgnoredAgents() { return _get(KEYS.ignoredAgents); }

  function ignoreAgent(agentId, agentName) {
    var all = _get(KEYS.ignoredAgents);
    all[String(agentId)] = { agentName: agentName || '', ignoredAt: new Date().toISOString() };
    _set(KEYS.ignoredAgents, all);
  }

  function unignoreAgent(agentId) {
    var all = _get(KEYS.ignoredAgents);
    delete all[String(agentId)];
    _set(KEYS.ignoredAgents, all);
  }

  // ─── WEEK LOCK ───────────────────────────────────────────────────────

  function isLocked(weekKey) {
    return !!(_get(KEYS.weekLocked)[String(weekKey)]);
  }

  // ─── LIGA CONFIG ────────────────────────────────────────────────────

  function getLigaConfig()        { return _get(KEYS.ligaConfig); }
  function saveLigaConfig(config) { _set(KEYS.ligaConfig, config); }

  // ─── PLAYER / AGENT CONFIG ─────────────────────────────────────────

  function getPlayerDirect()      { return _get(KEYS.playerDirect); }
  function savePlayerDirect(data) { _set(KEYS.playerDirect, data); }
  function getAgentDirect()       { return _get(KEYS.agentDirect); }
  function saveAgentDirect(data)  { _set(KEYS.agentDirect, data); }
  function getPlayerRB()          { return _get(KEYS.playerRB); }
  function savePlayerRB(data)     { _set(KEYS.playerRB, data); }
  function getAgentRBConfig()     { return _get(KEYS.agentRB); }
  function saveAgentRBConfig(data){ _set(KEYS.agentRB, data); }

  // ─── WEEK LOCKED / RB SNAPSHOTS ────────────────────────────────────

  function getWeekLocked()           { return _get(KEYS.weekLocked); }
  function saveWeekLocked(data)      { _set(KEYS.weekLocked, data); }
  function getRbSnapPlayers()        { return _get(KEYS.rbSnapPlayers); }
  function saveRbSnapPlayers(data)   { _set(KEYS.rbSnapPlayers, data); }
  function getRbSnapAgents()         { return _get(KEYS.rbSnapAgents); }
  function saveRbSnapAgents(data)    { _set(KEYS.rbSnapAgents, data); }

  // ─── FINANCE SNAPSHOT / DATA ───────────────────────────────────────

  function getFinSnapshot()        { return _get(KEYS.finSnapshot); }
  function saveFinSnapshot(data)   { _set(KEYS.finSnapshot, data); }
  function getFinData()            { return _get(KEYS.fin); }
  function saveFinData(data)       { _set(KEYS.fin, data); }

  // ─── CLUB CONFIG ───────────────────────────────────────────────────

  function getClubLogos()          { return _get(KEYS.clubLogos); }
  function saveClubLogos(data)     { _set(KEYS.clubLogos, data); }

  // ─── OVERLAY / MANUAL ──────────────────────────────────────────────

  function getOverlay()            { return Number(localStorage.getItem(KEYS.overlay)) || 0; }
  function saveOverlay(val)        { localStorage.setItem(KEYS.overlay, String(val)); }
  function getOverlayClubes()      { return _getRaw(KEYS.overlayClubes, null); }
  function saveOverlayClubes(data) { _set(KEYS.overlayClubes, data); }
  function getClubManual()         { return _get(KEYS.clubManual); }
  function saveClubManual(data)    { _set(KEYS.clubManual, data); }

  // ─── PAYMENT METHODS ──────────────────────────────────────────────

  var PAY_DEFAULTS = ['PIX','ChipPix','Depósito','Cash'];
  function getPayMethods()         { return _getRaw(KEYS.payMethods, []); }
  function savePayMethods(arr)     { _set(KEYS.payMethods, arr); }
  function getPayMethodsAlt()      { return _getRaw(KEYS.payMethodsAlt, PAY_DEFAULTS); }
  function savePayMethodsAlt(arr)  { _set(KEYS.payMethodsAlt, arr); }

  // ─── OFX / CHIPPIX ────────────────────────────────────────────────

  function getOFXMap()             { return _get(KEYS.ofxMap); }
  function saveOFXMap(data)        { _set(KEYS.ofxMap, data); }
  function getCPMap()              { return _get(KEYS.cpMap); }
  function saveCPMap(data)         { _set(KEYS.cpMap, data); }
  function getOFXSessao(key)       { return _getRaw(key, []); }
  function saveOFXSessao(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }
  function getCPSessao(key)        { return _getRaw(key, []); }
  function saveCPSessao(key, arr)  { localStorage.setItem(key, JSON.stringify(arr)); }

  // ─── TRANSACTION CATEGORIES ────────────────────────────────────────

  function getTransactionCategories() { return _getRaw(KEYS.transCategories, null); }
  function saveTransactionCategories(cats) { _set(KEYS.transCategories, cats); }

  // ─── BANK ACCOUNTS ────────────────────────────────────────────────

  function getBankAccounts()       { return _getArr(KEYS.bankAccounts); }
  function saveBankAccounts(arr)   { _set(KEYS.bankAccounts, arr); }

  // ─── MOVEMENTS ────────────────────────────────────────────────────

  function getMovements()          { return _getArr(KEYS.movements); }
  function saveMovements(arr)      { _set(KEYS.movements, arr); }

  // ─── STAGED ───────────────────────────────────────────────────────

  function getStaged()             { return _getArr(KEYS.staged); }
  function saveStaged(arr)         { _set(KEYS.staged, arr); }

  // ─── SNAPSHOTS ────────────────────────────────────────────────────

  function getSnapshots()          { return _getArr(KEYS.snapshots); }
  function saveSnapshots(arr)      { _set(KEYS.snapshots, arr); }

  // ─── BULK STATE (backup/restore) ──────────────────────────────────

  function getAllPMKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('pm_') === 0) keys.push(k);
    }
    return keys;
  }

  function collectState() {
    var state = {};
    getAllPMKeys().forEach(function (k) {
      state[k] = localStorage.getItem(k);
    });
    return state;
  }

  function restoreState(state) {
    getAllPMKeys().forEach(function (k) { localStorage.removeItem(k); });
    Object.keys(state).forEach(function (k) {
      if (k !== '_meta' && state[k] != null) localStorage.setItem(k, state[k]);
    });
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────────────

  return {
    // Importações
    saveImport       : saveImport,
    loadImport       : loadImport,
    hasImport        : hasImport,
    listImportedWeeks: listImportedWeeks,

    // RB Config & Snapshot (existentes)
    getRBConfig      : getRBConfig,
    getRBSnapshot    : getRBSnapshot,

    // Pagamentos
    getPayments      : getPayments,
    savePayments     : savePayments,

    // Carry
    getCarry         : getCarry,
    saveCarry        : saveCarry,
    getSaldoAnterior : getSaldoAnterior,
    setCarryForEntity: setCarryForEntity,

    // Carry auto
    computeCarryForWeek: computeCarryForWeek,
    persistCarry       : persistCarry,

    // Lock
    isLocked         : isLocked,

    // Vínculos de jogadores (pm_playerLink)
    getPlayerLinks   : getPlayerLinks,
    savePlayerLink   : savePlayerLink,
    removePlayerLink : removePlayerLink,

    // Overrides agente→subclube (pm_agentSubclubOvr)
    getAgentSubclubOvr : getAgentSubclubOvr,
    saveAgentSubclubOvr: saveAgentSubclubOvr,

    // Registry agentes por subclube (pm_agentsBySubclub)
    getAgentsBySubclub : getAgentsBySubclub,
    saveAgentToSubclub : saveAgentToSubclub,

    // Agentes ignorados (pm_ignoredAgents)
    getIgnoredAgents : getIgnoredAgents,
    ignoreAgent      : ignoreAgent,
    unignoreAgent    : unignoreAgent,

    // ── Novas funções (Passo 2) ──

    // Liga Config
    getLigaConfig    : getLigaConfig,
    saveLigaConfig   : saveLigaConfig,

    // Player/Agent Config
    getPlayerDirect  : getPlayerDirect,
    savePlayerDirect : savePlayerDirect,
    getAgentDirect   : getAgentDirect,
    saveAgentDirect  : saveAgentDirect,
    getPlayerRB      : getPlayerRB,
    savePlayerRB     : savePlayerRB,
    getAgentRBConfig : getAgentRBConfig,
    saveAgentRBConfig: saveAgentRBConfig,

    // Week Locked / RB Snapshots
    getWeekLocked    : getWeekLocked,
    saveWeekLocked   : saveWeekLocked,
    getRbSnapPlayers : getRbSnapPlayers,
    saveRbSnapPlayers: saveRbSnapPlayers,
    getRbSnapAgents  : getRbSnapAgents,
    saveRbSnapAgents : saveRbSnapAgents,

    // Finance
    getFinSnapshot   : getFinSnapshot,
    saveFinSnapshot  : saveFinSnapshot,
    getFinData       : getFinData,
    saveFinData      : saveFinData,

    // Club Config
    getClubLogos     : getClubLogos,
    saveClubLogos    : saveClubLogos,

    // Overlay / Manual
    getOverlay       : getOverlay,
    saveOverlay      : saveOverlay,
    getOverlayClubes : getOverlayClubes,
    saveOverlayClubes: saveOverlayClubes,
    getClubManual    : getClubManual,
    saveClubManual   : saveClubManual,

    // Payment Methods
    getPayMethods    : getPayMethods,
    savePayMethods   : savePayMethods,
    getPayMethodsAlt : getPayMethodsAlt,
    savePayMethodsAlt: savePayMethodsAlt,

    // OFX / ChipPix
    getOFXMap        : getOFXMap,
    saveOFXMap       : saveOFXMap,
    getCPMap         : getCPMap,
    saveCPMap        : saveCPMap,
    getOFXSessao     : getOFXSessao,
    saveOFXSessao    : saveOFXSessao,
    getCPSessao      : getCPSessao,
    saveCPSessao     : saveCPSessao,

    // Transaction Categories
    getTransactionCategories : getTransactionCategories,
    saveTransactionCategories: saveTransactionCategories,

    // Bank Accounts
    getBankAccounts  : getBankAccounts,
    saveBankAccounts : saveBankAccounts,

    // Movements
    getMovements     : getMovements,
    saveMovements    : saveMovements,

    // Staged
    getStaged        : getStaged,
    saveStaged       : saveStaged,

    // Snapshots
    getSnapshots     : getSnapshots,
    saveSnapshots    : saveSnapshots,

    // Bulk State
    getAllPMKeys      : getAllPMKeys,
    collectState     : collectState,
    restoreState     : restoreState,
  };

})();
