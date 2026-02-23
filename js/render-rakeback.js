// ══════════════════════════════════════════════════════════════════════
//  render-rakeback.js — Configuração de Rakeback (Poker Manager)
//  Depende de: financeEngine.js, dataLayer.js, utils.js, app-state.js
// ══════════════════════════════════════════════════════════════════════

const playerDirect = DataLayer.getPlayerDirect();

// ── ACERTO DIRETO POR AGÊNCIA ──
// agentDirect[agKey] = true → todos os jogadores dessa agência são "diretos"
const agentDirect = DataLayer.getAgentDirect();
function saveAgentDirect(){ DataLayer.saveAgentDirect(agentDirect); }

// Helper: verifica se jogador é "direto" (flag individual OU agência marcada)
function isPlayerDirectSettlement(playerId, agKey){
  if(playerDirect[playerId]) return true;
  if(agKey && agentDirect[agKey]) return true;
  return false;
}

// ── RB POR JOGADOR (override) ──
const playerRB = DataLayer.getPlayerRB();
function savePlayerRB(){ DataLayer.savePlayerRB(playerRB); }

// ── WEEK LOCK / SNAPSHOT SYSTEM ──
const weekLocked     = DataLayer.getWeekLocked();
const rbSnapPlayers  = DataLayer.getRbSnapPlayers();
const rbSnapAgents   = DataLayer.getRbSnapAgents();
const finSnapshot    = DataLayer.getFinSnapshot();
function saveWeekLocked(){   DataLayer.saveWeekLocked(weekLocked); }
function saveRbSnapPlayers(){DataLayer.saveRbSnapPlayers(rbSnapPlayers); }
function saveRbSnapAgents(){ DataLayer.saveRbSnapAgents(rbSnapAgents); }
function saveFinSnapshot(){  DataLayer.saveFinSnapshot(finSnapshot); }

function getWeekKey(){ return weeks[selWeekIdx] || '0'; }

function isWeekLocked(wk){ return !!weekLocked[wk || getWeekKey()]; }

function lockWeekRakeback(wk){
  wk = wk || getWeekKey();
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  const cp = allPlayers.filter(p=>p.clube===activeClube);
  if(!cp.length){ showToast('⚠️ Nenhum jogador importado','e'); return; }

  // Snapshot de players: salva pctEfetivo de cada jogador
  if(!rbSnapPlayers[wk]) rbSnapPlayers[wk] = {};
  cp.forEach(p => {
    rbSnapPlayers[wk][String(p.id)] = getPlayerPctRB(p);
  });

  // Snapshot de agentes: salva pctAgente
  if(!rbSnapAgents[wk]) rbSnapAgents[wk] = {};
  const agNames = [...new Set(cp.map(p=>(p.aname||'').trim()))];
  agNames.forEach(ag => {
    const cfg = agentRB[ag] || {};
    rbSnapAgents[wk][ag] = {
      pctAgente: Number(cfg.pctAgente ?? cfg.pct ?? 0) || 0
    };
  });

  weekLocked[wk] = true;
  saveWeekLocked(); saveRbSnapPlayers(); saveRbSnapAgents();

  // ── Snapshot financeiro: grava saldoFinal de cada entidade ──
  const snapKey = activeClube + '||' + wk;
  const entities = calcFinEntities();
  const balances = {};
  entities.forEach(e => {
    const saldoPrev        = getSaldoAnterior(e.id);
    const resultadoFinal   = -(e.valor);
    const pagamentosLiquido = getMovTotal(e.id);
    const saldoFinal       = saldoPrev + resultadoFinal - pagamentosLiquido;
    balances[e.id] = { saldoFinal, resultadoFinal, pagamentosLiquido, nome: e.nome, tipo: e.tipo };
  });
  finSnapshot[snapKey] = { lockedAt: Date.now(), weekKey: wk, balances };

  // ── Snapshot per-player: grava saldoAtual de cada jogador para carry-forward ──
  const playerBalances = {};
  cp.forEach(p => {
    const rbPct = getPlayerPctRB(p);
    const rbVal = (Number(p.rake)||0) * rbPct / 100;
    const resultado = (Number(p.ganhos)||0) + rbVal;
    // Pagamentos do jogador nesta semana
    const fk = activeClube + '||' + wk;
    const allFinData = getFinData();
    const finWeekData = allFinData[fk] || {};
    let pEntrada = 0, pSaida = 0;
    Object.values(finWeekData).forEach(entity => {
      (entity.historico||[]).forEach(h => {
        if(String(h.cpId||'') === String(p.id)){
          if(h.dir === 'out') pSaida += h.valor || 0;
          else pEntrada += h.valor || 0;
        }
      });
    });
    const pPagamento = pSaida - pEntrada;
    const prevSaldo = getPlayerSaldoAnterior(p.id);
    playerBalances[String(p.id)] = prevSaldo.value + resultado - pPagamento;
  });
  finSnapshot[snapKey].playerBalances = playerBalances;
  saveFinSnapshot();

  // Persistir carry semanal ao lockar (legado)
  DataLayer.persistCarry(activeClube, wk, selWeekIdx, weeks, allPlayers);

  showToast('🔒 Semana lockada — snapshot + carry salvos');
  renderLockButton();
  renderRakebackTab();
  renderClubTable();
  renderAgentClosing();
  updateClubKPIs();
}

function unlockWeekRakeback(wk){
  wk = wk || getWeekKey();
  if(!confirm('⚠️ Desbloquear semana? Os % salvos no snapshot serão mantidos mas não serão mais usados nos cálculos desta semana até novo lock.')) return;
  weekLocked[wk] = false;
  saveWeekLocked();
  showToast('🔓 Semana desbloqueada');
  renderLockButton();
  renderRakebackTab();
  renderClubTable();
  renderAgentClosing();
  updateClubKPIs();
}

// ── LOCK BUTTON NO HEADER (visível em todas as sub-tabs) ──
function renderLockButton(){
  const el = document.getElementById('dc-lock-btn');
  if(!el) return;
  const locked = isWeekLocked();
  if(locked){
    el.innerHTML = `<div style="display:inline-flex;align-items:center;gap:6px;">
      <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:5px 10px;border-radius:7px;font-size:.62rem;font-weight:700;">🔒 LOCKED</span>
      <button onclick="unlockWeekRakeback()" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:5px 10px;border-radius:7px;font-size:.62rem;font-weight:700;cursor:pointer;">🔓 Desbloquear</button>
    </div>`;
  } else {
    el.innerHTML = `<button onclick="openLockChecklist()" style="background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:5px 12px;border-radius:7px;font-size:.62rem;font-weight:700;cursor:pointer;">🔒 Lockar Semana</button>`;
  }
  // Also update dc-week LOCKED badge
  const dcw = document.getElementById('dc-week');
  if(dcw){
    dcw.innerHTML = '📅 ' + fWL(weeks[selWeekIdx]) + (locked ? ' <span style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:2px 8px;border-radius:5px;font-size:.62rem;font-weight:700;margin-left:6px;">🔒 LOCKED</span>' : '');
  }
}

// ── LOCK CHECKLIST ──
function openLockChecklist(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  const cp = allPlayers.filter(p=>p.clube===activeClube);
  if(!cp.length){ showToast('⚠️ Nenhum jogador importado','e'); return; }

  const setts = calcSettlements();
  const emAberto = setts.filter(s => { const st = getSettlementStatus(s); return st.cls === 'em-aberto'; });
  const quitados = setts.filter(s => { const st = getSettlementStatus(s); return st.cls === 'quitado'; });
  const comMov = setts.filter(s => getSettlementStatus(s).cls !== 'sem-mov');

  // Check items
  const checks = [];

  // 1. Players imported
  checks.push({ ok: cp.length > 0, label: cp.length + ' jogadores importados', icon: '👥' });

  // 2. RB configured
  const agents = [...new Set(cp.map(p=>(p.aname||'').trim()).filter(Boolean))];
  const agentsWithRB = agents.filter(a => { const cfg = agentRB[a]||{}; return Number(cfg.pctAgente ?? cfg.pct ?? 0) > 0; });
  checks.push({ ok: agentsWithRB.length === agents.length, label: agentsWithRB.length + '/' + agents.length + ' agentes com RB configurado', icon: '💸' });

  // 3. Settlement status
  const totalEntidades = comMov.length;
  checks.push({ ok: quitados.length === totalEntidades, label: quitados.length + '/' + totalEntidades + ' entidades quitadas', icon: '✅' });

  // 4. Em aberto
  checks.push({ ok: emAberto.length === 0, label: emAberto.length === 0 ? 'Nenhum pagamento em aberto' : emAberto.length + ' pagamento(s) em aberto', icon: '💳' });

  // 6. Liga manual entries
  const m = clubManual[activeClube] || {};
  const hasLancamentos = Number(m.compras||0) > 0 || Number(m.security||0) > 0 || Number(m.overlay||0) > 0 || Number(m.outros||0) > 0;
  checks.push({ ok: true, label: hasLancamentos ? 'Lançamentos manuais registrados' : 'Sem lançamentos manuais (OK se não houver)', icon: '📝', neutral: !hasLancamentos });

  // Render
  const el = document.getElementById('lock-checklist-items');
  let html = '';
  checks.forEach(c => {
    const color = c.ok ? '#10b981' : (c.neutral ? '#94a3b8' : '#f59e0b');
    const bg = c.ok ? 'rgba(16,185,129,.06)' : (c.neutral ? 'rgba(148,163,184,.06)' : 'rgba(245,158,11,.06)');
    const border = c.ok ? 'rgba(16,185,129,.12)' : (c.neutral ? 'rgba(148,163,184,.12)' : 'rgba(245,158,11,.15)');
    const check = c.ok ? '✅' : (c.neutral ? '➖' : '⚠️');
    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:'+bg+';border:1px solid '+border+';border-radius:7px;margin-bottom:5px;">';
    html += '<span style="font-size:.8rem;">'+check+'</span>';
    html += '<span style="font-size:.74rem;color:var(--t1);flex:1;">'+c.icon+' '+c.label+'</span>';
    html += '</div>';
  });
  el.innerHTML = html;

  // Warnings
  const wEl = document.getElementById('lock-checklist-warnings');
  let wHtml = '';
  const hasWarnings = pendentes.length > 0 || parciais.length > 0;
  if(hasWarnings){
    wHtml += '<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:10px 14px;font-size:.72rem;color:#f59e0b;">';
    wHtml += '⚠️ <strong>Atenção:</strong> existem pagamentos em aberto. O lock vai salvar o snapshot com saldos pendentes, que serão carregados como <strong>Saldo Anterior</strong> na próxima semana.';
    wHtml += '</div>';
  } else {
    wHtml += '<div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.12);border-radius:8px;padding:10px 14px;font-size:.72rem;color:#10b981;">';
    wHtml += '✅ Tudo conferido! Pode lockar com segurança.';
    wHtml += '</div>';
  }
  wEl.innerHTML = wHtml;

  // Enable/disable confirm button (always enabled — warnings are advisory)
  const btn = document.getElementById('lock-checklist-confirm');
  if(btn) btn.disabled = false;

  openM('mLockChecklist');
}

function confirmLockFromChecklist(){
  closeM('mLockChecklist');
  lockWeekRakeback();
}
function setPlayerRB(playerId, pct){
  const v = parseFloat(pct);
  if(isNaN(v)) return;
  playerRB[String(playerId)] = v;
  savePlayerRB();
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  renderRakebackTab();
  if(typeof renderAgentClosing==='function') renderAgentClosing();
}
function clearPlayerRB(playerId){
  delete playerRB[String(playerId)];
  savePlayerRB();
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  renderRakebackTab();
  if(typeof renderAgentClosing==='function') renderAgentClosing();
}

function savePlayerDirect(){ DataLayer.savePlayerDirect(playerDirect); }

// Retorna % efetivo de RB do jogador:
// snapshot lockado > override individual > padrão do agente > 0
function getPlayerPctRB(p){
  const wk = getWeekKey();
  // 1) Se semana lockada e snapshot existe, usar snapshot
  if(isWeekLocked(wk) && rbSnapPlayers[wk]){
    const snap = rbSnapPlayers[wk][String(p.id)];
    if(snap !== undefined && snap !== null) return Number(snap) || 0;
  }
  // 2) Override individual do player
  const ov = playerRB[String(p.id)];
  if(ov !== undefined && ov !== null && ov !== '') return Number(ov) || 0;
  // 3) Padrão do agente (pctAgente = RB que cada jogador recebe por padrão)
  const cfg = agentRB[(p.aname||'').trim()] || {};
  return Number(cfg.pctAgente ?? cfg.pct ?? 0) || 0;
}

// Retorna pctAgente efetivo (snapshot > atual)
function getAgentPctAgente(agKey){
  const wk = getWeekKey();
  if(isWeekLocked(wk) && rbSnapAgents[wk] && rbSnapAgents[wk][agKey]){
    return Number(rbSnapAgents[wk][agKey].pctAgente) || 0;
  }
  const cfg = agentRB[agKey] || {};
  return Number(cfg.pctAgente ?? cfg.pct ?? 0) || 0;
}

function togglePlayerDirect(playerId){
  playerDirect[playerId] = !playerDirect[playerId];
  if(!playerDirect[playerId]) delete playerDirect[playerId]; // remove falsy keys
  savePlayerDirect();
  renderClubTable();
  renderRakebackTab();
}

// ── SALDO ANTERIOR POR JOGADOR ──────────────────────────────
// RB% para uma semana específica (pode ser diferente da atual se lockada)
function getPlayerPctRBForWeek(player, weekKey){
  if(isWeekLocked(weekKey) && rbSnapPlayers[weekKey]){
    const snap = rbSnapPlayers[weekKey][String(player.id)];
    if(snap !== undefined && snap !== null) return Number(snap) || 0;
  }
  const ov = playerRB[String(player.id)];
  if(ov !== undefined && ov !== null && ov !== '') return Number(ov) || 0;
  const cfg = agentRB[(player.aname||'').trim()] || {};
  return Number(cfg.pctAgente ?? cfg.pct ?? 0) || 0;
}

// Calcula saldo de um jogador ao FINAL de uma semana (recursivo com snapshot short-circuit)
function getPlayerSaldoAtWeek(playerId, weekIdx){
  if(!activeClube || weekIdx < 0 || !weeks[weekIdx]) return { value: 0, status: 'novo' };

  const weekKey = String(weeks[weekIdx]);
  const snapKey = activeClube + '||' + weekKey;

  // 1) SHORT-CIRCUIT: snapshot lockado com playerBalances
  const snap = finSnapshot[snapKey];
  if(snap && snap.playerBalances && snap.playerBalances[String(playerId)] !== undefined){
    return { value: Number(snap.playerBalances[String(playerId)]) || 0, status: 'locked' };
  }

  // 2) Calcular: saldoAnterior + resultado - pagamento
  const prev = weekIdx > 0 ? getPlayerSaldoAtWeek(playerId, weekIdx - 1) : { value: 0, status: 'novo' };
  const saldoAnterior = prev.value;

  // Carregar dados importados desta semana
  const importData = DataLayer.loadImport(weekKey);
  if(!importData || !importData.players) return { value: saldoAnterior, status: prev.status === 'locked' ? 'locked' : 'provisorio' };

  const player = importData.players.find(p => String(p.id) === String(playerId) && p.clube === activeClube);
  if(!player) return { value: saldoAnterior, status: prev.status === 'locked' ? 'locked' : 'provisorio' };

  // Resultado = ganhos + rakeback
  const rbPct = getPlayerPctRBForWeek(player, weekKey);
  const rbVal = (Number(player.rake)||0) * rbPct / 100;
  const resultado = (Number(player.ganhos)||0) + rbVal;

  // Movimentações do ledger para este jogador nesta semana
  // Coleta todas as entradas do historico que referenciam este playerId
  const fk = activeClube + '||' + weekKey;
  const allFin = getFinData();
  const finWeek = allFin[fk] || {};
  const playerHist = [];
  Object.values(finWeek).forEach(entity => {
    (entity.historico||[]).forEach(h => {
      if(String(h.cpId||'') === String(playerId)) playerHist.push(h);
    });
  });
  // FÓRMULA CANÔNICA: saldoAtual = saldoAnterior + resultado − ledgerNet
  const ledger = FinanceEngine.calcLedgerNet(playerHist);
  const saldo  = FinanceEngine.calcSaldoAtual(saldoAnterior, resultado, ledger.net);
  const status = isWeekLocked(weekKey) ? 'locked' : 'provisorio';

  return { value: saldo, status };
}

// Convenience: saldo anterior = saldo ao final da semana ANTERIOR
function getPlayerSaldoAnterior(playerId){
  if(selWeekIdx <= 0) return { value: 0, status: 'novo' };
  return getPlayerSaldoAtWeek(playerId, selWeekIdx - 1);
}

// ── RAKEBACK TAB ──
// Estado de expand na aba Rakeback
const rbExpandedAgents = new Set();
let _rbSearch = '';
let _rbSearchTimer = null;
let _activeRbTab = 'agencias';

function switchRbTab(tab){
  _activeRbTab = tab;
  const pAg  = document.getElementById('rb-panel-agencias');
  const pDir = document.getElementById('rb-panel-diretos');
  if(pAg)  pAg.style.display = tab === 'agencias' ? '' : 'none';
  if(pDir) pDir.style.display = tab === 'diretos'  ? '' : 'none';
  renderRakebackTab();
}

function setRbSearch(q){
  _rbSearch = q.toLowerCase().trim();
  clearTimeout(_rbSearchTimer);
  _rbSearchTimer = setTimeout(() => {
    const prev = document.activeElement;
    const wasSearch = prev && prev.id === 'rb-search-input';
    const cursorPos = wasSearch ? prev.selectionStart : 0;
    renderRakebackTab();
    if(wasSearch){
      const inp = document.getElementById('rb-search-input');
      if(inp){ inp.focus(); inp.setSelectionRange(cursorPos, cursorPos); }
    }
  }, 200);
}

function toggleRbAgent(agKey){
  if(rbExpandedAgents.has(agKey)) rbExpandedAgents.delete(agKey);
  else rbExpandedAgents.add(agKey);
  renderRakebackTab();
}

function setPlayerRBFromRbTab(playerId, val){
  const v = parseFloat(val);
  if(isNaN(v)) return;
  playerRB[String(playerId)] = v;
  savePlayerRB();
  renderRakebackTab();
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  updateClubKPIs(); updateOverviewKPIs();
}

function clearPlayerRBFromRbTab(playerId){
  delete playerRB[String(playerId)];
  savePlayerRB();
  renderRakebackTab();
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  updateClubKPIs(); updateOverviewKPIs();
}

function renderRakebackTab(){
  if(!activeClube) return;
  const elCommon = document.getElementById('rb-common-area');
  const el  = document.getElementById('rb-summary-content');
  const el2 = document.getElementById('rb-diretos-content');
  if(!elCommon || !el) return;

  const cp = allPlayers.filter(p=>p.clube===activeClube);
  if(!cp.length){
    const empty = '<div class="cs"><div class="ci">📂</div><h3>Importe a planilha primeiro</h3></div>';
    elCommon.innerHTML = empty;
    el.innerHTML = '';
    if(el2) el2.innerHTML = '';
    return;
  }

  const wk = getWeekKey();
  const wkLocked = isWeekLocked(wk);

  const agentMap = {};
  cp.forEach(p=>{
    const raw = (p.aname||'').trim();
    const k = (!raw || /^(none|null|undefined)$/i.test(raw)) ? '(sem agente)' : raw;
    if(!agentMap[k]) agentMap[k]=[];
    agentMap[k].push(p);
  });

  const rakeGeral = cp.reduce((s,p)=>s+n(p.rake),0);
  let rbTotal = 0;

  // Separate normal vs direct
  const normalAgents = [];
  const directAgents = [];
  Object.entries(agentMap).forEach(([agKey, players])=>{
    const rakeTime = players.reduce((s,p)=>s+n(p.rake),0);
    if(agentDirect[agKey]){
      let agRB = 0;
      const plRows = players.map(p => {
        const pct = getPlayerPctRB(p);
        const rb = (Number(p.rake)||0) * pct / 100;
        agRB += rb;
        return { p, pct, rb };
      });
      rbTotal += agRB;
      directAgents.push({ agKey, players, rakeTime, agRB, plRows });
    } else {
      const pctAgente = getAgentPctAgente(agKey);
      const totalRBag = rakeTime * pctAgente / 100;
      const taxaAg = rakeTime * (getLigaRate('taxaApp') + getLigaRate('taxaLiga'));
      const lucroAg = rakeTime - totalRBag - taxaAg;
      rbTotal += totalRBag;
      normalAgents.push({ agKey, players, rakeTime, pctAgente, totalRBag, lucroAg });
    }
  });

  const taxaRate = getLigaRate('taxaApp') + getLigaRate('taxaLiga');
  const taxaLiga = rakeGeral * taxaRate;
  const lucroLiq = rakeGeral - rbTotal - taxaLiga;

  const card = (icon, lbl, val, color, sub='') =>
    `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:11px;padding:16px 18px;flex:1;min-width:160px;">
      <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t3);margin-bottom:8px;">${icon} ${lbl}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;font-weight:800;color:${color};">${fV(val,false)}</div>
      ${sub?`<div style="font-size:.7rem;color:var(--t3);margin-top:4px;">${sub}</div>`:''}
    </div>`;

  const lockBadge = wkLocked
    ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#ef4444;padding:5px 12px;border-radius:8px;font-size:.72rem;font-weight:700;">🔒 LOCKADA</span>`
    : `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:#10b981;padding:5px 12px;border-radius:8px;font-size:.72rem;font-weight:700;">🔓 Editável</span>`;

  const ths = 'padding:9px 12px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:var(--s2);';

  // Filter (applies to Agências tab only)
  let filtNormal = normalAgents;
  let filtDirect = directAgents;
  if(_rbSearch){
    filtNormal = normalAgents.filter(({agKey, players}) =>
      agKey.toLowerCase().includes(_rbSearch) ||
      players.some(p => (p.nick||'').toLowerCase().includes(_rbSearch) || String(p.id||'').includes(_rbSearch))
    );
    filtDirect = directAgents.filter(({agKey, players}) =>
      agKey.toLowerCase().includes(_rbSearch) ||
      players.some(p => (p.nick||'').toLowerCase().includes(_rbSearch) || String(p.id||'').includes(_rbSearch))
    );
  }

  // ── Helper: player row ──
  function playerRowHtml(p, pct, rb, isPlLocked){
    const hasOv = playerRB[String(p.id)] !== undefined;
    const pSafe = String(p.id).replace(/'/g,"\\'");
    const pInputId = 'rbpl-'+String(p.id).replace(/[^a-zA-Z0-9]/g,'_');
    const pConfirmed = hasOv;
    return `<tr style="border-top:1px solid rgba(255,255,255,.035);">
      <td style="padding:5px 12px 5px 36px;font-size:.77rem;">
        <span style="font-weight:500;">${p.nick||'—'}</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:.58rem;color:var(--t3);margin-left:5px;">#${p.id||''}</span>
      </td>
      <td style="padding:5px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--green);">${fV(p.rake,false)}</td>
      <td style="padding:5px 12px;text-align:center;">
        ${isPlLocked
          ? '<span style="font-family:\'JetBrains Mono\',monospace;font-size:.74rem;color:'+(hasOv?'#60a5fa':'var(--t2)')+';font-weight:'+(hasOv?'700':'400')+';">'+pct+'%</span>'
          : pConfirmed
            ? '<div style="display:flex;align-items:center;gap:3px;justify-content:center;"><span style="font-family:\'JetBrains Mono\',monospace;font-size:.74rem;color:#60a5fa;font-weight:700;">'+pct+'%</span><button onclick="clearPlayerRBFromRbTab(\''+pSafe+'\')" style="background:var(--s3);border:1px solid var(--b2);color:var(--t3);padding:1px 5px;border-radius:4px;font-size:.55rem;cursor:pointer;" title="Editar">✎</button></div>'
            : '<div style="display:flex;align-items:center;gap:3px;justify-content:center;"><input type="number" min="0" max="100" step="0.1" value="'+pct+'" id="'+pInputId+'" style="width:48px;background:var(--s3);border:1px solid var(--b2);border-radius:5px;padding:3px 5px;color:var(--gold);font-family:\'JetBrains Mono\',monospace;font-size:.72rem;text-align:center;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();confirmPlayerRB(\''+pSafe+'\',\''+pInputId+'\')}"><button onclick="confirmPlayerRB(\''+pSafe+'\',\''+pInputId+'\')" style="background:var(--green-d);border:1px solid rgba(16,185,129,.3);color:var(--green);padding:2px 5px;border-radius:4px;font-size:.6rem;font-weight:700;cursor:pointer;" title="Confirmar">✓</button></div>'}
      </td>
      <td style="padding:5px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.76rem;font-weight:700;color:#a3e635;">${rb>0?fV(rb,false):'—'}</td>
    </tr>`;
  }

  // ── NORMAL AGENT ROWS (sem botão 👤 Direto) ──
  const normalHtml = filtNormal.map(({agKey, players, rakeTime, pctAgente, totalRBag, lucroAg})=>{
    const isOpen = rbExpandedAgents.has(agKey);
    const agSafe = agKey.replace(/'/g,"\\'");
    const agInputId = 'rbag-'+agKey.replace(/[^a-zA-Z0-9]/g,'_');
    const cfg = agentRB[agKey] || {};
    const isConfirmed = !!cfg.locked;
    const isLocked = wkLocked || isConfirmed;

    let html = `<tr style="border-top:1px solid var(--b1);cursor:pointer;${isOpen?'background:rgba(240,180,41,.06);':''}" onclick="toggleRbAgent('${agSafe}')">
      <td style="padding:10px 12px;font-size:.82rem;font-weight:600;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:var(--s3);border:1px solid var(--b2);font-size:.6rem;color:var(--gold);transition:transform .2s;${isOpen?'transform:rotate(90deg);':''}flex-shrink:0;">▶</span>
          <span>${agKey}</span>
          <span style="background:var(--s3);border-radius:7px;padding:1px 7px;font-size:.6rem;font-family:'JetBrains Mono',monospace;color:var(--t3);">${players.length}</span>
          ${isConfirmed && !wkLocked ? '<span style="font-size:.5rem;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);color:#10b981;padding:1px 5px;border-radius:4px;font-weight:700;">✓ confirmado</span>' : ''}
        </div>
      </td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--green);">${fV(rakeTime,false)}</td>
      <td style="padding:10px 12px;text-align:center;" onclick="event.stopPropagation()">
        ${isLocked
          ? `<div style="display:flex;align-items:center;gap:4px;justify-content:center;">
              <span style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:#c084fc;font-weight:700;">${pctAgente}%</span>
              ${!wkLocked ? `<button onclick="event.stopPropagation();unlockAgentRBFromRbTab('${agSafe}')" style="background:var(--s3);border:1px solid var(--b2);color:var(--t3);padding:1px 5px;border-radius:4px;font-size:.58rem;cursor:pointer;" title="Editar">✎</button>` : ''}
            </div>`
          : `<div style="display:flex;align-items:center;gap:3px;justify-content:center;">
              <input type="number" min="0" max="100" step="0.1" value="${pctAgente}" id="${agInputId}" style="width:52px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:4px 6px;color:#c084fc;font-family:'JetBrains Mono',monospace;font-size:.76rem;text-align:center;" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmAgentRB('${agSafe}','${agInputId}')}">
              <button onclick="event.stopPropagation();confirmAgentRB('${agSafe}','${agInputId}')" style="background:var(--green-d);border:1px solid rgba(16,185,129,.3);color:var(--green);padding:2px 6px;border-radius:5px;font-size:.65rem;font-weight:700;cursor:pointer;" title="Confirmar">✓</button>
            </div>`}
      </td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;color:#c084fc;">${totalRBag>0?fV(totalRBag,false):'—'}</td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;color:${clr(lucroAg)};">${fV(lucroAg,false)}</td>
    </tr>`;

    if(isOpen){
      const agSafe2 = agSafe;
      html += `<tr><td colspan="5" style="padding:0;background:rgba(255,255,255,.015);">
        <div style="padding:6px 12px 4px 36px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Jogadores de ${agKey}</span>
          ${!wkLocked ? `<button onclick="event.stopPropagation();applyPctToAllPlayers('${agSafe2}')" style="background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.2);color:var(--gold);padding:3px 10px;border-radius:5px;font-size:.6rem;font-weight:700;cursor:pointer;">Aplicar % a todos</button>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="padding:5px 12px 5px 36px;text-align:left;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">Nick</th>
            <th style="padding:5px 12px;text-align:right;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">Rake</th>
            <th style="padding:5px 12px;text-align:center;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">RB %</th>
            <th style="padding:5px 12px;text-align:right;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">RB (R$)</th>
          </tr></thead>
          <tbody>`;
      players.forEach(p => {
        const pct = getPlayerPctRB(p);
        const rb = (Number(p.rake)||0) * pct / 100;
        html += playerRowHtml(p, pct, rb, wkLocked);
      });
      html += `<tr style="border-top:1px solid rgba(240,180,41,.15);background:rgba(240,180,41,.04);">
        <td style="padding:6px 12px 6px 36px;font-size:.7rem;font-weight:700;color:var(--gold);">Subtotal</td>
        <td style="padding:6px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--green);font-weight:700;">${fV(rakeTime,false)}</td>
        <td></td>
        <td style="padding:6px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;font-weight:700;color:#c084fc;">${totalRBag>0?fV(totalRBag,false):'—'}</td>
      </tr></tbody></table></td></tr>`;
    }
    return html;
  }).join('');

  // ── DIRECT AGENT ROWS ──
  // ── Totais para cada aba ──
  const nTotalRake  = filtNormal.reduce((s,a) => s + a.rakeTime, 0);
  const nTotalRB    = filtNormal.reduce((s,a) => s + a.totalRBag, 0);
  const nTotalLucro = filtNormal.reduce((s,a) => s + a.lucroAg, 0);
  const dTotalRake  = filtDirect.reduce((s,a) => s + a.rakeTime, 0);
  const dTotalRB    = filtDirect.reduce((s,a) => s + a.agRB, 0);
  const dTotalLucro = filtDirect.reduce((s,a) => s + (a.rakeTime - a.agRB - a.rakeTime * taxaRate), 0);

  const totTd = (v, color) =>
    `<td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:800;color:${color};">${v > 0.001 || v < -0.001 ? fV(v,false) : '—'}</td>`;

  // ══════════════════ ÁREA COMUM (KPIs + busca + tabs) ══════════════════
  elCommon.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      ${lockBadge}
      <span style="font-size:.7rem;color:var(--t3);">${wk}</span>
    </div>

    ${wkLocked ? `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.12);border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:.74rem;color:#fca5a5;">
      ⚠️ Semana lockada — % congelados. Alterações só afetam semanas futuras.
    </div>` : ''}

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      ${card('💎','Rake Total', rakeGeral, 'var(--green)', cp.length+' jogadores')}
      ${card('💸','Total Rakeback', rbTotal, '#f0b429', 'Agentes + Diretos')}
      ${card('📊','Lucro Líquido', lucroLiq, clr(lucroLiq), 'Rake − RB − Taxa Liga '+ligaConfig.taxaApp+'%+'+ligaConfig.taxaLiga+'% ('+fV(taxaLiga,false)+')')}
    </div>

    <div style="margin-bottom:10px;">
      <input class="fin-search" type="text" id="rb-search-input" placeholder="Buscar agente ou jogador..." value="${_rbSearch}" oninput="setRbSearch(this.value)" style="width:100%;max-width:300px;">
    </div>
    <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--b1);padding-bottom:10px;">
      <button id="rb-tab-agencias" onclick="switchRbTab('agencias')" class="rb-itab ${_activeRbTab==='agencias'?'rb-itab-active':''}">🤝 Agências (${filtNormal.length})</button>
      <button id="rb-tab-diretos" onclick="switchRbTab('diretos')" class="rb-itab ${_activeRbTab==='diretos'?'rb-itab-active':''}">👤 Jogadores (${filtDirect.length})</button>
    </div>
  `;

  // ══════════════════ PANEL: AGÊNCIAS ══════════════════
  el.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;">
      ${filtNormal.length ? `<table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${ths}text-align:left;">Agente</th>
          <th style="${ths}text-align:right;">Rake</th>
          <th style="${ths}text-align:center;">% RB Agente</th>
          <th style="${ths}text-align:right;">RB Agente</th>
          <th style="${ths}text-align:right;">Lucro Líq.</th>
        </tr></thead>
        <tbody>
          ${normalHtml}
          <tr style="border-top:2px solid var(--b2);background:rgba(240,180,41,.05);">
            <td style="padding:10px 12px;font-size:.72rem;font-weight:800;color:var(--gold);">TOTAL (${filtNormal.length} agentes)</td>
            ${totTd(nTotalRake, 'var(--green)')}
            <td></td>
            ${totTd(nTotalRB, '#c084fc')}
            ${totTd(nTotalLucro, clr(nTotalLucro))}
          </tr>
        </tbody>
      </table>` : `<div style="padding:24px;text-align:center;color:var(--t3);font-size:.78rem;">Nenhum agente nesta seção</div>`}
    </div>
    ${_rbSearch ? `<div style="font-size:.65rem;color:var(--t3);margin-top:6px;text-align:right;">${filtNormal.length} resultado(s)</div>` : ''}
  `;

  // ══════════════════ PANEL: JOGADORES ══════════════════
  if(!el2) return;

  // Select: apenas agências não-diretas
  const nonDirectKeys = Object.keys(agentMap).filter(k => !agentDirect[k]).sort();
  const selectOpts = nonDirectKeys.map(k =>
    `<option value="${k.replace(/"/g,'&quot;')}">${k}</option>`
  ).join('');

  // ── Tabela 5 colunas para agências diretas ──
  const thsD = 'padding:8px 12px;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:var(--s2);';

  const directHtml5 = filtDirect.map(({agKey, players, rakeTime, agRB, plRows})=>{
    const isOpen  = rbExpandedAgents.has(agKey);
    const agSafe  = agKey.replace(/'/g,"\\'");
    const agLucro = rakeTime - agRB - rakeTime * taxaRate;

    let html = `<tr style="border-top:1px solid rgba(96,165,250,.1);cursor:pointer;${isOpen?'background:rgba(96,165,250,.05);':''}" onclick="toggleRbAgent('${agSafe}')">
      <td style="padding:10px 12px;font-size:.82rem;font-weight:600;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:var(--s3);border:1px solid var(--b2);font-size:.6rem;color:#60a5fa;transition:transform .2s;${isOpen?'transform:rotate(90deg);':''}flex-shrink:0;">▶</span>
          <span>${agKey}</span>
          <span style="background:var(--s3);border-radius:7px;padding:1px 7px;font-size:.6rem;font-family:'JetBrains Mono',monospace;color:var(--t3);">${players.length}</span>
          <span style="font-size:.5rem;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:1px 6px;border-radius:4px;font-weight:700;">🔒 DIRETO</span>
          ${!wkLocked ? `<button onclick="event.stopPropagation();unmarkAgentDirect('${agSafe}')" style="background:var(--s3);border:1px solid var(--b2);color:var(--t3);padding:1px 5px;border-radius:4px;font-size:.55rem;cursor:pointer;" title="Voltar para acerto via agente">✎ Remover</button>` : ''}
        </div>
      </td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--green);">${fV(rakeTime,false)}</td>
      <td style="padding:10px 12px;text-align:center;font-size:.62rem;color:var(--t3);font-style:italic;">Individual</td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;color:#60a5fa;">${agRB>0?fV(agRB,false):'—'}</td>
      <td style="padding:10px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;color:${clr(agLucro)};">${fV(agLucro,false)}</td>
    </tr>`;

    if(isOpen){
      let subRake=0, subRB=0, subLucro=0;
      const playerRowsHtml = plRows.map(({p, pct, rb})=>{
        const rake  = n(p.rake);
        const lucro = rake - rb - rake * taxaRate;
        subRake  += rake; subRB += rb; subLucro += lucro;
        const hasOv     = playerRB[String(p.id)] !== undefined;
        const pSafe     = String(p.id).replace(/'/g,"\\'");
        const pInputId  = 'rbpld-'+String(p.id).replace(/[^a-zA-Z0-9]/g,'_');
        const pctCell   = wkLocked
          ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.74rem;color:${hasOv?'#60a5fa':'var(--t2)'};font-weight:${hasOv?'700':'400'};">${pct}%</span>`
          : hasOv
            ? `<div style="display:flex;align-items:center;gap:3px;justify-content:center;"><span style="font-family:'JetBrains Mono',monospace;font-size:.74rem;color:#60a5fa;font-weight:700;">${pct}%</span><button onclick="clearPlayerRBFromRbTab('${pSafe}')" style="background:var(--s3);border:1px solid var(--b2);color:var(--t3);padding:1px 5px;border-radius:4px;font-size:.55rem;cursor:pointer;" title="Editar">✎</button></div>`
            : `<div style="display:flex;align-items:center;gap:3px;justify-content:center;"><input type="number" min="0" max="100" step="0.1" value="${pct}" id="${pInputId}" style="width:48px;background:var(--s3);border:1px solid var(--b2);border-radius:5px;padding:3px 5px;color:var(--gold);font-family:'JetBrains Mono',monospace;font-size:.72rem;text-align:center;" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmPlayerRB('${pSafe}','${pInputId}')}"><button onclick="confirmPlayerRB('${pSafe}','${pInputId}')" style="background:var(--green-d);border:1px solid rgba(16,185,129,.3);color:var(--green);padding:2px 5px;border-radius:4px;font-size:.6rem;font-weight:700;cursor:pointer;" title="Confirmar">✓</button></div>`;
        return `<tr style="border-top:1px solid rgba(255,255,255,.03);">
          <td style="padding:5px 12px 5px 36px;font-size:.77rem;">
            <span style="font-weight:500;">${p.nick||'—'}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:.58rem;color:var(--t3);margin-left:5px;">#${p.id||''}</span>
          </td>
          <td style="padding:5px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--green);">${rake>0?fV(rake,false):'—'}</td>
          <td style="padding:5px 12px;text-align:center;">${pctCell}</td>
          <td style="padding:5px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;font-weight:700;color:#60a5fa;">${rb>0?fV(rb,false):'—'}</td>
          <td style="padding:5px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;font-weight:700;color:${clr(lucro)};">${fV(lucro,false)}</td>
        </tr>`;
      }).join('');

      html += `<tr><td colspan="5" style="padding:0;background:rgba(96,165,250,.02);">
        <div style="padding:6px 12px 4px 36px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Jogadores diretos de ${agKey}</span>
          ${!wkLocked ? `<button onclick="event.stopPropagation();applyPctToAllPlayers('${agSafe}')" style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:3px 10px;border-radius:5px;font-size:.6rem;font-weight:700;cursor:pointer;">Aplicar % a todos</button>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="padding:5px 12px 5px 36px;text-align:left;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">Jogador</th>
            <th style="padding:5px 12px;text-align:right;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">Rake</th>
            <th style="padding:5px 12px;text-align:center;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">% RB Jogador</th>
            <th style="padding:5px 12px;text-align:right;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">RB Jogador</th>
            <th style="padding:5px 12px;text-align:right;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);background:rgba(0,0,0,.12);">Lucro Líq.</th>
          </tr></thead>
          <tbody>
          ${playerRowsHtml}
          <tr style="border-top:1px solid rgba(96,165,250,.2);background:rgba(96,165,250,.04);">
            <td style="padding:6px 12px 6px 36px;font-size:.7rem;font-weight:700;color:#60a5fa;">Subtotal</td>
            <td style="padding:6px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--green);font-weight:700;">${fV(subRake,false)}</td>
            <td></td>
            <td style="padding:6px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;font-weight:700;color:#60a5fa;">${subRB>0?fV(subRB,false):'—'}</td>
            <td style="padding:6px 12px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.74rem;font-weight:700;color:${clr(subLucro)};">${fV(subLucro,false)}</td>
          </tr>
          </tbody>
        </table>
      </td></tr>`;
    }
    return html;
  }).join('');

  el2.innerHTML = `
    <!-- SEÇÃO: Definir agências diretas -->
    <div style="margin-bottom:20px;">
      <div style="margin-bottom:8px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t2);">📋 Definir Agências Diretas</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="rb-direct-add-sel" style="flex:1;min-width:200px;max-width:340px;background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:7px 10px;border-radius:7px;font-size:.76rem;font-family:'Outfit',sans-serif;">
          <option value="">Selecionar agência...</option>
          ${selectOpts}
        </select>
        ${!wkLocked
          ? `<button onclick="addDirectFromSelect()" style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.22);color:#60a5fa;padding:7px 16px;border-radius:7px;font-size:.74rem;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Outfit',sans-serif;">+ Marcar como Direto</button>`
          : ''}
      </div>
      ${nonDirectKeys.length===0 ? '<div style="font-size:.68rem;color:var(--t3);margin-top:8px;">✓ Todas as agências já são diretas.</div>' : ''}
      <div style="font-size:.62rem;color:var(--t3);margin-top:7px;">Agências diretas são fechadas individualmente — cada jogador com seu próprio % de rakeback.</div>
    </div>

    <div style="background:var(--s1);border:1px solid rgba(96,165,250,.15);border-radius:10px;overflow:hidden;">
      ${filtDirect.length ? `<table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${thsD}text-align:left;">Agência / Jogador</th>
          <th style="${thsD}text-align:right;">Rake</th>
          <th style="${thsD}text-align:center;">% RB Jogador</th>
          <th style="${thsD}text-align:right;">RB Jogador</th>
          <th style="${thsD}text-align:right;">Lucro Líq.</th>
        </tr></thead>
        <tbody>
          ${directHtml5}
          <tr style="border-top:2px solid rgba(96,165,250,.3);background:rgba(96,165,250,.06);">
            <td style="padding:10px 12px;font-size:.72rem;font-weight:800;color:#60a5fa;">TOTAL (${filtDirect.length} agências)</td>
            ${totTd(dTotalRake, 'var(--green)')}
            <td></td>
            ${totTd(dTotalRB, '#60a5fa')}
            ${totTd(dTotalLucro, clr(dTotalLucro))}
          </tr>
        </tbody>
      </table>` : `<div style="padding:28px;text-align:center;color:var(--t3);font-size:.78rem;">Nenhuma agência marcada como direto.<br><span style="font-size:.65rem;">Use o campo acima para selecionar uma agência.</span></div>`}
    </div>
  `;
}


// Confirma RB% do agente — trava o input
function confirmAgentRB(agKey, inputId){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  const v = parseFloat(inp.value) || 0;
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, pctAgente: v, pct: v, locked: true };
  saveAgentRB();
  renderRakebackTab();
  renderClubTable();
  renderTableRows('allBody', filteredAll, 'allPgInfo', 'allPgBtns', 'all');
  updateClubKPIs(); updateOverviewKPIs();
  if(typeof renderAgentClosing==='function') renderAgentClosing();
  showToast('✅ RB '+agKey+' confirmado: '+v+'%');
}

// Destrava agente para editar novamente
function unlockAgentRBFromRbTab(agKey){
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, locked: false };
  saveAgentRB();
  renderRakebackTab();
  setTimeout(()=>{
    const id = 'rbag-'+agKey.replace(/[^a-zA-Z0-9]/g,'_');
    document.getElementById(id)?.focus();
  },50);
}

// Confirma RB% do jogador — salva override e trava
function confirmPlayerRB(playerId, inputId){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  const v = parseFloat(inp.value) || 0;
  setPlayerRBFromRbTab(playerId, v);
  showToast('✅ RB jogador #'+playerId+' confirmado: '+v+'%');
}

// Aplica % a todos os jogadores de um agente
function applyPctToAllPlayers(agKey){
  const pct = prompt('Definir RB% para todos os jogadores de ' + agKey + ':');
  if(pct === null) return;
  const v = parseFloat(pct);
  if(isNaN(v)) return;
  const cp = allPlayers.filter(p=>p.clube===activeClube && (p.aname||'(sem agente)')===agKey);
  cp.forEach(p=>{ playerRB[String(p.id)] = v; });
  savePlayerRB();
  renderRakebackTab();
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  updateClubKPIs(); updateOverviewKPIs();
  if(typeof renderAgentClosing==='function') renderAgentClosing();
  showToast('✅ '+cp.length+' jogadores atualizados para '+v+'%');
}

// Atualiza % de agente vindo da aba Rakeback
function updateAgentRBFromTab(agKey, field, val){
  const v = parseFloat(val) || 0;
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, pctAgente: v, pct: v };
  saveAgentRB();
  renderRakebackTab();
  renderClubTable();
  updateClubKPIs();
  updateOverviewKPIs();
  if(typeof renderAgentClosing==='function') renderAgentClosing();
}

function setRB(idx,val){
  allPlayers[idx].rakeback=parseFloat(val)||0;
  updateClubKPIs();
  updateOverviewKPIs();
}

function updateRBLive(idx, pct, rake, ganhos, ggr){
  const p   = parseFloat(pct) || 0;
  const rb  = rake * p / 100;
  const res = ganhos + rb + ggr;

  // Atualiza célula Resultado Final
  const resEl = document.getElementById('res-'+idx);
  if(resEl){
    resEl.textContent = fV(res, false);
    resEl.className   = res >= 0 ? 'vp' : 'vn';
    resEl.style.fontWeight = '600';
  }

  // Atualiza célula Rakeback R$
  const rbEl = document.getElementById('rb-val-'+idx);
  if(rbEl){
    rbEl.textContent = rb !== 0 ? 'R$ '+fV(rb,false) : '—';
    rbEl.style.color = rb > 0 ? '#a3e635' : rb < 0 ? '#f87171' : 'var(--t3)';
  }

  // Atualiza valor no objeto para uso imediato
  if(allPlayers[idx]) allPlayers[idx].rakeback = p;
}

function previewRB(idx, pct, rake){
  const rb = rake * (parseFloat(pct)||0) / 100;
  const el = document.getElementById('rb-prev-'+idx);
  if(el) el.textContent = rb > 0 ? '= R$ '+fV(rb,false) : '';
}

function lockRB(idx, playerId){
  const inp = document.getElementById('rb-player-'+idx);
  const val = inp ? parseFloat(inp.value)||0 : getPlayerPctRB(allPlayers[idx]);
  if(playerId){
    playerRB[String(playerId)] = val;
    savePlayerRB();
  }
  allPlayers[idx].rakeback = val;
  allPlayers[idx].rbLocked = true;
  updateClubKPIs();
  updateOverviewKPIs();
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
}

function unlockRB(idx){
  allPlayers[idx].rbLocked = false;
  renderTableRows('allBody',  filteredAll,  'allPgInfo',  'allPgBtns',  'all');
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
}
// ══════════════════ LOGOS DOS CLUBES ══════════════════
// clubLogos: { IMPÉRIO: 'data:image/...', ... }
