// ══════════════════════════════════════════════════════════════════════
//  render-tables.js — Visão Geral + Detalhamento (Poker Manager)
//  Depende de: financeEngine.js, dataLayer.js, utils.js, app-state.js
// ══════════════════════════════════════════════════════════════════════

// ══════════════════ OVERVIEW ══════════════════
function renderOverview(){
  updateOverviewKPIs();
  const unk=allPlayers.filter(p=>p.clube==='?').length;

  // Club cards
  const grid=document.getElementById('clubsGrid');grid.innerHTML='';
  CLUBS.forEach(c=>{
    const m=CMETA[c]||{};
    const cp=allPlayers.filter(p=>p.clube===c);
    const rake    = sumF(cp,'rake');
    const ganhos  = sumF(cp,'ganhos');
    const ggr     = sumF(cp,'ggr');
    // Resultado clube = soma de resultadoAgente por agente
    const _agMap={};
    cp.forEach(p=>{ const k=p.aname||'(sem agente)'; if(!_agMap[k])_agMap[k]=[]; _agMap[k].push(p); });
    const result = Object.entries(_agMap).reduce((s,[k,pl])=>s+calcAgentResult(k,pl).resultadoAgente,0);
    const unkC    = allPlayers.filter(p=>p.clube==='?').length;
    const card=document.createElement('div');
    card.className=`club-ov-card ${m.cc||''}`;
    const logoHtml = clubLogos[c]
      ? `<img src="${clubLogos[c]}" class="coc-logo">`
      : `<span style="margin-right:6px">${m.icon}</span>`;
    card.innerHTML=`
      <div class="coc-header">
        <div class="coc-name">${logoHtml}${c}</div>
        <span class="coc-count">${cp.length} jogadores</span>
      </div>
      <div class="coc-stats">
        <div class="coc-stat">
          <div class="coc-stat-lbl">Rake Total</div>
          <div class="coc-stat-val" style="color:${m.color}">${cp.length ? fV(rake,false) : '—'}</div>
        </div>
        <div class="coc-stat">
          <div class="coc-stat-lbl">Resultado</div>
          <div class="coc-stat-val" style="color:${clr(result)}">${cp.length ? fV(result,false) : '—'}</div>
        </div>
      </div>
      <div class="coc-action">
        <button class="coc-btn" onclick="goClube('${c}')">Abrir Fechamento →</button>
        ${unkC>0?`<span class="coc-unlinked">⚠ ${unkC} não classificados</span>`:'<span class="coc-unlinked ok">✓ Classificado</span>'}
      </div>`;
    grid.appendChild(card);
  });

  filteredAll=[...allPlayers];
  renderAllTable();
  checkUnlinkedOv();
}

function updateSidebar(){
  document.getElementById('sb-total').textContent=allPlayers.length;
  CLUBS.forEach(c=>{
    const key={'IMPÉRIO':'imp','CONFRARIA':'con','3BET':'3bt','TGP':'tgp','CH':'ch'}[c];
    if(key) document.getElementById('sb-'+key).textContent=allPlayers.filter(p=>p.clube===c).length;
  });
  // Update fech dashboard badge
  if(allPlayers.length){
    const saved = activeClube;
    let totalAberto = 0;
    CLUBS.forEach(c => {
      activeClube = c;
      const setts = calcSettlements();
      setts.forEach(s => {
        const st = getSettlementStatus(s);
        if(st.cls === 'em-aberto') totalAberto++;
      });
    });
    activeClube = saved;
    const badge = document.getElementById('sb-fech-status');
    if(badge){
      if(totalAberto > 0){ badge.textContent = totalAberto; badge.style.background = 'rgba(239,68,68,.15)'; badge.style.color = '#ef4444'; }
      else { badge.textContent = '✓'; badge.style.background = 'rgba(16,185,129,.1)'; badge.style.color = '#10b981'; }
    }
  }
}

// ══════════════════ ALL TABLE ══════════════════
function filterAll(q){
  const s=q.toLowerCase();
  filteredAll=allPlayers.filter(p=>!s||
    (p.id+'').toLowerCase().includes(s)||
    p.nick.toLowerCase().includes(s)||
    p.aname.toLowerCase().includes(s)||
    p.clube.toLowerCase().includes(s));
  renderAllTable();
}

function renderAllTable(){
  renderTableRows('allBody', filteredAll, 'allPgInfo', 'allPgBtns', 'all');
}

// ══════════════════ CLUB TABLE ══════════════════
function filterClub(q){
  const s=q.toLowerCase();
  const base=allPlayers.filter(p=>p.clube===activeClube);
  filteredClub=base.filter(p=>!s||
    (p.id+'').toLowerCase().includes(s)||
    p.nick.toLowerCase().includes(s)||
    p.aname.toLowerCase().includes(s));
  renderClubTable();
}
function filterClubFunc(v){
  const base=allPlayers.filter(p=>p.clube===activeClube);
  filteredClub=base.filter(p=>!v||p.func.toLowerCase().includes(v));
  renderClubTable();
}
function renderClubTable(){
  renderTableRows('clubBody', filteredClub, 'clubPgInfo', 'clubPgBtns', 'club');
  document.getElementById('dn-count').textContent=filteredClub.length;
  checkUnlinkedClub();
}

// Estado de agentes expandidos por tabela
const expandedAgents = { all: new Set(), club: new Set() };

// Resultado CALCULADO do jogador = ganhos + rakeback
// Delega para FinanceEngine.calcPlayerResult
function calcResult(p){
  return FinanceEngine.calcPlayerResult(p, getPlayerPctRB(p));
}

// ══ UNIFIED RB CALCULATION ══
// Delega para FinanceEngine.calcAgentRB (puro)
// Wrapper mantém a assinatura original (agKey, players)
function calcAgentRB(agKey, players){
  return FinanceEngine.calcAgentRB(
    players,
    getAgentPctAgente(agKey),
    !!agentDirect[agKey],
    getPlayerPctRB
  );
}

// Resultado do agente = ganhos + RB (unified)
// Delega para FinanceEngine.calcAgentResult (puro)
function calcAgentResult(agKey, players){
  return FinanceEngine.calcAgentResult(
    players,
    getAgentPctAgente(agKey),
    !!agentDirect[agKey],
    getPlayerPctRB
  );
}

// SHARED TABLE RENDERER V2 — financial focus
function renderTableRows(tbodyId, filtered, infoId, btnsId, mode){
  const tbody = document.getElementById(tbodyId);
  const expSet = expandedAgents[mode] || new Set();
  const isClub = mode === 'club';
  const colSpan = isClub ? 9 : 6;

  if(!allPlayers.length || !filtered.length){
    tbody.innerHTML=`<tr><td colspan="${colSpan}"><div class="empty-tbl"><div class="ei">${allPlayers.length?'🔍':'📂'}</div><p>${allPlayers.length?'Nenhum resultado encontrado.':'Importe a planilha primeiro.'}</p></div></td></tr>`;
    document.getElementById(infoId).textContent='0 registros';
    document.getElementById(btnsId).innerHTML='';
    return;
  }

  const finData = isClub ? (getFinData()[finKey()] || {}) : {};

  function getPlayerLedger(playerId){
    return getEntityLedgerNet(makeEntityId('pl', playerId));
  }

  const agentOrder = [];
  const agentMap   = {};
  filtered.forEach(p => {
    const key = p.aname || '(sem agente)';
    if(!agentMap[key]){ agentMap[key]=[]; agentOrder.push(key); }
    agentMap[key].push(p);
  });

  let html = '';
  let totalAPagar = 0, totalAReceber = 0;
  let gtGanhos = 0, gtRake = 0, gtRB = 0, gtSaldoAnt = 0;

  agentOrder.forEach(agKey => {
    const players = agentMap[agKey];
    const isOpen  = expSet.has(agKey);
    const m       = CMETA[players[0].clube] || CMETA['?'];
    const lnk     = players[0].clube==='?' ? `onclick="event.stopPropagation();openLink(${allPlayers.indexOf(players[0])})"` : '';

    const totGanhos = players.reduce((s,p)=>s+(Number(p.ganhos)||0),0);
    const totRake   = players.reduce((s,p)=>s+(Number(p.rake)||0),0);
    const totRB     = calcAgentRB(agKey, players);
    const totResult = totGanhos + totRB;
    gtGanhos += totGanhos; gtRake += totRake; gtRB += totRB;

    // ══════════════════════════════════════════════════
    // FÓRMULAS (aba Jogadores — COM saldo anterior):
    //   resultadoSemana = ganhos + rakeback
    //   pagamento       = saída − entrada  (líquido pago AO jogador pelo clube)
    //   saldoAtual      = saldoAnterior + resultadoSemana − pagamento
    //
    // saldo > 0 → jogador tem a receber   → "A Receber" (verde)
    // saldo < 0 → jogador deve ao clube   → "A Pagar"   (vermelho)
    // ══════════════════════════════════════════════════
    let agPag = 0, agSaldo = 0, agSaldoAnt = 0;
    let agSaldoAntStatus = 'novo';
    if(isClub){
      players.forEach(p => {
        const ledger = getPlayerLedger(p.id);
        agPag += ledger.net;
        const sa = getPlayerSaldoAnterior(p.id);
        agSaldoAnt += sa.value;
        if(sa.status === 'provisorio' && agSaldoAntStatus !== 'provisorio') agSaldoAntStatus = sa.status;
        if(sa.status === 'locked') agSaldoAntStatus = sa.status;
      });
      agSaldo = FinanceEngine.calcSaldoAtual(agSaldoAnt, totResult, agPag);

      if(agSaldo > 0.01)  totalAReceber += agSaldo;
      if(agSaldo < -0.01) totalAPagar   += Math.abs(agSaldo);
      gtSaldoAnt += agSaldoAnt;
    }

    // ── LINHA DA AGÊNCIA ──
    let clubCells = '';
    if(isClub){
      const saldoAntStr = Math.abs(agSaldoAnt) < 0.01 ? '<span style="color:var(--t3);font-size:.68rem;">—</span>'
        : `<span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:${clr(agSaldoAnt)};font-weight:600;">${fV(agSaldoAnt,false)}</span>`;
      const saldoAntBadge = agSaldoAntStatus === 'locked' ? '<span style="font-size:.55rem;color:#10b981;margin-left:3px;vertical-align:super;">✓</span>'
        : agSaldoAntStatus === 'provisorio' ? '<span style="font-size:.55rem;color:var(--gold);margin-left:3px;vertical-align:super;">⚠</span>' : '';
      const pagStr = Math.abs(agPag) > 0.01
        ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:${agPag>0?'#10b981':'#60a5fa'};font-weight:600;">${fV(agPag,false)}</span>`
        : `<span style="color:var(--t3);font-size:.68rem;">—</span>`;
      const saldoStr = Math.abs(agSaldo) < 0.01 ? '—'
        : `<span style="color:${clr(agSaldo)};font-weight:600;">${fV(agSaldo,false)}</span>`;
      const hasPag = Math.abs(agPag) > 0.01;
      const sitBadge = Math.abs(agSaldo) < 0.01
        ? `<span class="pl2-saldo-badge quitado">🟡 Quitado</span>`
        : hasPag
          ? `<span class="pl2-saldo-badge" style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:#f59e0b;">🟠 Parcial</span>`
          : agSaldo > 0
            ? `<span class="pl2-saldo-badge" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#10b981;">🟢 A Receber</span>`
            : `<span class="pl2-saldo-badge deve">🔴 A Pagar</span>`;
      clubCells = `<td style="text-align:right;">${saldoAntStr}${saldoAntBadge}</td><td style="text-align:right;">${pagStr}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;">${saldoStr}</td><td>${sitBadge}</td>`;
    }

    html += `<tr class="ag2${isOpen?' open':''}" onclick="toggleAgent('${mode}','${agKey.replace(/'/g,"\\'")}','${tbodyId}','${infoId}','${btnsId}')">
      <td>
        <div class="ag2-name">
          <span class="ag2-toggle">▶</span>
          <span class="ag2-label">${agKey}</span>
          <span class="ag2-count">${players.length}</span>
        </div>
      </td>
      ${!isClub ? `<td><span class="ct ${m.cls}" ${lnk}>${m.icon} ${players[0].clube==='?'?'⚠':players[0].clube}</span></td>` : ''}
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;color:${clr(totGanhos)};font-weight:600;">${fV(totGanhos,false)}</td>
      <td class="v2-subtle" style="text-align:right;font-family:'JetBrains Mono',monospace;">${fV(totRake,false)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;color:#a3e635;font-weight:600;">${totRB>0?fV(totRB,false):'—'}</td>
      <td style="text-align:right;"><span class="ag2-resultado ${totResult>0?'pos':totResult<0?'neg':'zero'}">${fV(totResult,false)}</span></td>
      ${clubCells}
    </tr>`;

    // ── LINHAS DOS JOGADORES ──
    players.forEach(p => {
      const rbPct   = getPlayerPctRB(p);
      const rbVal   = (Number(p.rake)||0) * rbPct / 100;
      const pr      = calcResult(p);

      let plClubCells = '';
      if(isClub){
        const ledger = getPlayerLedger(p.id);
        const pagamento = ledger.net;   // ledgerNet via FinanceEngine
        const sa = getPlayerSaldoAnterior(p.id);
        const saldoAnt = sa.value;
        const saldo = FinanceEngine.calcSaldoAtual(saldoAnt, pr, pagamento);

        const saldoAntStr = Math.abs(saldoAnt) < 0.01 ? '<span style="color:var(--t3);font-size:.68rem;">—</span>'
          : `<span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:${clr(saldoAnt)};font-weight:600;">${fV(saldoAnt,false)}</span>`;
        const saBadge = sa.status === 'locked' ? '<span style="font-size:.55rem;color:#10b981;margin-left:3px;vertical-align:super;">✓</span>'
          : sa.status === 'provisorio' ? '<span style="font-size:.55rem;color:var(--gold);margin-left:3px;vertical-align:super;">⚠</span>' : '';
        const pagStr = Math.abs(pagamento) > 0.01
          ? `<span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:${pagamento>0?'#10b981':'#60a5fa'};font-weight:600;">${fV(pagamento,false)}</span>`
          : `<span style="color:var(--t3);font-size:.68rem;">—</span>`;
        const saldoStr = Math.abs(saldo) < 0.01 ? '—'
          : `<span style="color:${clr(saldo)};font-weight:600;">${fV(saldo,false)}</span>`;
        const hasPag = Math.abs(pagamento) > 0.01;
        const sitBadge = Math.abs(saldo) < 0.01
          ? `<span class="pl2-saldo-badge quitado">🟡 Quitado</span>`
          : hasPag
            ? `<span class="pl2-saldo-badge" style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:#f59e0b;">🟠 Parcial</span>`
            : saldo > 0
              ? `<span class="pl2-saldo-badge" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#10b981;">🟢 A Receber</span>`
              : `<span class="pl2-saldo-badge deve">🔴 A Pagar</span>`;
        plClubCells = `<td style="text-align:right;">${saldoAntStr}${saBadge}</td><td style="text-align:right;">${pagStr}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;">${saldoStr}</td><td>${sitBadge}</td>`;
      }

      const resClass = pr > 0 ? 'pos' : pr < 0 ? 'neg' : 'zero';

      html += `<tr class="pl2${isOpen?'':' hidden'}" data-agent="${agKey.replace(/"/g,'&quot;')}">
        <td>
          <div class="pl2-nick">${p.nick||'—'}</div>
          <div class="pl2-id">#${p.id||'—'}</div>
        </td>
        ${!isClub ? `<td><span class="ct ${m.cls}" ${lnk}>${m.icon} ${players[0].clube==='?'?'⚠':players[0].clube}</span></td>` : ''}
        <td style="text-align:right;" class="${p.ganhos>0?'vp':p.ganhos<0?'vn':'vz'}">${fV(p.ganhos)}</td>
        <td style="text-align:right;" class="v2-subtle" style="font-family:'JetBrains Mono',monospace;">${fV(p.rake)}</td>
        <td style="text-align:right;">
          <div class="pl2-rb">
            <span class="pl2-rb-pct">${rbPct>0?rbPct+'%':''}</span>
            ${rbVal>0?`<span class="pl2-rb-val">R$ ${fV(rbVal,false)}</span>`:`<span style="color:var(--t3);font-size:.68rem;">—</span>`}
          </div>
        </td>
        <td style="text-align:right;"><span class="pl2-resultado ${resClass}">${fV(pr,false)}</span></td>
        ${plClubCells}
      </tr>`;
    });

    // ── RODAPÉ DA AGÊNCIA ──
    if(isClub){
      const sitBadgeAg = Math.abs(agSaldo) < 0.01
        ? `<span style="color:var(--gold);font-weight:700;">🟡 Quitado</span>`
        : agSaldo < 0
          ? `<span style="color:var(--red);font-weight:700;">🔴 A Pagar ${fV(agSaldo,false)}</span>`
          : `<span style="color:var(--green);font-weight:700;">🟢 A Receber ${fV(agSaldo,false)}</span>`;

      html += `<tr class="ag2-footer${isOpen?'':' hidden'}" data-agent="${agKey.replace(/"/g,'&quot;')}">
        <td colspan="${colSpan}">
          <div class="ag2-summary">
            <div class="ag2-sum-item">
              <div class="ag2-sum-lbl">Rake do Time</div>
              <div class="ag2-sum-val" style="color:var(--green);">${fV(totRake,false)}</div>
            </div>
            <div class="ag2-sum-sep"></div>
            <div class="ag2-sum-item">
              <div class="ag2-sum-lbl">Rakeback</div>
              <div class="ag2-sum-val" style="color:#a3e635;">${totRB>0?fV(totRB,false):'—'}</div>
            </div>
            <div class="ag2-sum-sep"></div>
            <div class="ag2-sum-item">
              <div class="ag2-sum-lbl">Resultado</div>
              <div class="ag2-sum-val" style="color:${clr(totResult)};">${fV(totResult,false)}</div>
            </div>
            <div class="ag2-sum-sep"></div>
            <div class="ag2-sum-item">
              <div class="ag2-sum-lbl">Situação</div>
              <div class="ag2-sum-val">${sitBadgeAg}</div>
            </div>
          </div>
        </td>
      </tr>`;
    }
  });

  // ── TOTAL GERAL ──
  const gtResult = gtGanhos + gtRB;
  html += `<tr class="grand-total-row">
    <td>TOTAL</td>
    ${!isClub ? '<td></td>' : ''}
    <td style="text-align:right;">${fV(gtGanhos,false)}</td>
    <td style="text-align:right;">${fV(gtRake,false)}</td>
    <td style="text-align:right;color:#a3e635;">${fV(gtRB,false)}</td>
    <td style="text-align:right;font-weight:900;font-size:.85rem;">${fV(gtResult,false)}</td>
    ${isClub ? '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;color:'+clr(gtSaldoAnt)+';font-weight:600;">'+fV(gtSaldoAnt,false)+'</td><td></td><td></td><td style="font-size:.68rem;color:var(--gold);opacity:.7">'+agentOrder.length+' agências · '+filtered.length+' jogadores</td>' : ''}
  </tr>`;

  tbody.innerHTML = html;

  document.getElementById(infoId).textContent =
    `${agentOrder.length} agência${agentOrder.length!==1?'s':''} · ${filtered.length} jogador${filtered.length!==1?'es':''}`;
  document.getElementById(btnsId).innerHTML = '';

  if(isClub) updateV2KPIs(gtGanhos, gtRake, gtRB, gtResult, totalAPagar, totalAReceber);
}

function toggleAgent(mode, agKey, tbodyId, infoId, btnsId){
  const expSet = expandedAgents[mode] || new Set();
  if(expSet.has(agKey)) expSet.delete(agKey);
  else expSet.add(agKey);
  expandedAgents[mode] = expSet;
  renderTableRows(tbodyId, mode==='all'?filteredAll:filteredClub, infoId, btnsId, mode);
}

// Atualiza KPIs executivos da aba Jogadores
function updateV2KPIs(gtGanhos, gtRake, gtRB, gtResult, totalAPagar, totalAReceber){
  const e = id => document.getElementById(id);
  // Jogadores ativos = ganhos ≠ 0 (jogou na semana)
  const ativos = filteredClub.filter(p => Math.abs(Number(p.ganhos)||0) > 0.01).length;
  if(e('v2k-ativos')) e('v2k-ativos').textContent = ativos;
  if(e('v2k-pl')){
    e('v2k-pl').textContent = 'R$ ' + fV(gtGanhos, false);
    e('v2k-pl').style.color = clr(gtGanhos);
  }
  if(e('v2k-rake'))   e('v2k-rake').textContent   = 'R$ ' + fV(gtRake, false);
  if(e('v2k-rb'))     e('v2k-rb').textContent     = gtRB > 0 ? 'R$ ' + fV(gtRB, false) : '—';
  if(e('v2k-resultado')){
    e('v2k-resultado').textContent = 'R$ ' + fV(gtResult, false);
    e('v2k-resultado').style.color = clr(gtResult);
  }
}

// ── ACERTO DIRETO COM JOGADORES ──
// playerDirect[playerId] = true/false

// ── Detalhamento + Overview KPIs ──

let _detSearch = '';
let _detSearchTimer = null;
let _detExpanded = {};

function filterDet(q){
  _detSearch = q.toLowerCase().trim();
  clearTimeout(_detSearchTimer);
  _detSearchTimer = setTimeout(() => {
    const prev = document.activeElement;
    const wasSrch = prev && prev.id === 'det-search';
    const pos = wasSrch ? prev.selectionStart : 0;
    renderDetalhamento();
    if(wasSrch){ const inp = document.getElementById('det-search'); if(inp){ inp.focus(); inp.setSelectionRange(pos,pos); } }
  }, 200);
}

function toggleDetAgent(agKey){
  _detExpanded[agKey] = !_detExpanded[agKey];
  renderDetalhamento();
}

function exportDet(){
  if(!activeClube) return;
  const cp = allPlayers.filter(p => p.clube === activeClube);
  if(!cp.length) return;
  const rows = [['Agência','ID Agente','Jogador','ID Jogador','Ganhos','Rake','Rodeo GGR','Resultado Final']];
  const agMap = {};
  cp.forEach(p => { const k = p.aname||'(sem agente)'; if(!agMap[k]) agMap[k]=[]; agMap[k].push(p); });
  Object.entries(agMap).forEach(([ag, players]) => {
    players.forEach(p => {
      const res = (Number(p.ganhos)||0) + (Number(p.rake)||0) + (Number(p.ggr)||0);
      rows.push([ag, p.aid||'', p.nick||p.id||'', p.id||'', Number(p.ganhos)||0, Number(p.rake)||0, Number(p.ggr)||0, res]);
    });
  });
  const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'detalhamento.csv';
  a.click();
}

function renderDetalhamento(){
  const el = document.getElementById('det-content');
  if(!el) return;
  if(!activeClube || !allPlayers.filter(p => p.clube === activeClube).length){
    el.innerHTML = '<div class="cs"><div class="ci">🔍</div><h3>Importe a planilha primeiro</h3></div>';
    return;
  }

  const cp = allPlayers.filter(p => p.clube === activeClube);

  // Agrupar por agente
  const agOrder = [], agMap = {};
  cp.forEach(p => {
    const k = p.aname || '(sem agente)';
    if(!agMap[k]){ agMap[k] = { aid: p.aid||'', players: [] }; agOrder.push(k); }
    agMap[k].players.push(p);
  });

  // Filtro de busca
  const q = _detSearch;
  const filteredOrder = agOrder.filter(ag =>
    !q || ag.toLowerCase().includes(q) ||
    agMap[ag].players.some(p => (p.nick||'').toLowerCase().includes(q) || String(p.id||'').includes(q))
  );

  // Totais globais
  const totGanhos = cp.reduce((s,p) => s + (Number(p.ganhos)||0), 0);
  const totRake   = cp.reduce((s,p) => s + (Number(p.rake)||0), 0);
  const totGGR    = cp.reduce((s,p) => s + (Number(p.ggr)||0), 0);
  const totRes    = totGanhos + totRake + totGGR;
  // KPI helpers
  const kpiS = 'background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:10px 12px;border-top:2px solid ';
  const kpiL = 'font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-bottom:4px;';
  const kpiV = "font-family:'JetBrains Mono',monospace;font-size:.95rem;font-weight:800;";

  // Tabela helpers — estilos base fornecidos pela classe .tbl
  const thS  = '';
  const tdS  = '';
  const mono = "font-weight:600;";

  let rowsHtml = '';
  filteredOrder.forEach(ag => {
    const { aid, players } = agMap[ag];
    const agGanhos = players.reduce((s,p) => s + (Number(p.ganhos)||0), 0);
    const agRake   = players.reduce((s,p) => s + (Number(p.rake)||0), 0);
    const agGGR    = players.reduce((s,p) => s + (Number(p.ggr)||0), 0);
    const agRes    = agGanhos + agRake + agGGR;
    const isOpen   = !!_detExpanded[ag];
    const agSafe   = ag.replace(/'/g,"\\'");

    // Linha de agente
    rowsHtml += `<tr style="cursor:pointer;background:var(--s2);border-bottom:1px solid var(--b1);" onclick="toggleDetAgent('${agSafe}')">
      <td style="${tdS}font-weight:700;color:var(--t1);">
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <span style="font-size:.6rem;opacity:.5;">${isOpen?'▲':'▶'}</span>
          🤝 ${ag}
          <span style="font-size:.56rem;color:var(--t3);font-weight:400;">(${players.length} jog.)</span>
        </span>
      </td>
      <td style="${tdS}color:var(--t3);${mono}">${aid||'—'}</td>
      <td style="${tdS}text-align:right;${mono}color:${clr(agGanhos)};">${fV(agGanhos,false)}</td>
      <td style="${tdS}text-align:right;${mono}color:var(--green);">${agRake > 0.001 ? fV(agRake,false) : '—'}</td>
      <td style="${tdS}text-align:right;${mono}color:#a78bfa;">${Math.abs(agGGR) > 0.001 ? fV(agGGR,false) : '—'}</td>
      <td style="${tdS}text-align:right;${mono}color:${clr(agRes)};font-weight:800;">${fV(agRes,false)}</td>
    </tr>`;

    // Sub-linhas de jogadores (quando expandido)
    if(isOpen){
      players.forEach((p, pi) => {
        const pGanhos = Number(p.ganhos)||0;
        const pRake   = Number(p.rake)||0;
        const pGGR    = Number(p.ggr)||0;
        const pRes    = pGanhos + pRake + pGGR;
        const bg      = pi % 2 ? 'rgba(255,255,255,.015)' : 'transparent';
        rowsHtml += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,.04);">
          <td style="${tdS}padding-left:28px;color:var(--t2);">👤 ${p.nick||p.id||'—'}</td>
          <td style="${tdS}color:var(--t3);${mono}">${p.id||'—'}</td>
          <td style="${tdS}text-align:right;${mono}color:${clr(pGanhos)};">${fV(pGanhos,false)}</td>
          <td style="${tdS}text-align:right;${mono}color:var(--green);">${pRake > 0.001 ? fV(pRake,false) : '—'}</td>
          <td style="${tdS}text-align:right;${mono}color:#a78bfa;">${Math.abs(pGGR) > 0.001 ? fV(pGGR,false) : '—'}</td>
          <td style="${tdS}text-align:right;${mono}color:${clr(pRes)};">${fV(pRes,false)}</td>
        </tr>`;
      });
    }
  });

  // Linha de total
  rowsHtml += `<tr style="background:rgba(240,180,41,.05);border-top:2px solid rgba(240,180,41,.2);">
    <td style="${tdS}font-weight:800;color:var(--gold);" colspan="2">TOTAL</td>
    <td style="${tdS}text-align:right;${mono}color:${clr(totGanhos)};font-weight:800;">${fV(totGanhos,false)}</td>
    <td style="${tdS}text-align:right;${mono}color:var(--green);font-weight:800;">${fV(totRake,false)}</td>
    <td style="${tdS}text-align:right;${mono}color:#a78bfa;font-weight:800;">${Math.abs(totGGR) > 0.001 ? fV(totGGR,false) : '—'}</td>
    <td style="${tdS}text-align:right;${mono}color:${clr(totRes)};font-weight:800;">${fV(totRes,false)}</td>
  </tr>`;

  el.innerHTML = `
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
      <div style="${kpiS}var(--blue)">
        <div style="${kpiL}">👥 Jogadores Ativos</div>
        <div style="${kpiV}color:var(--t1);">${cp.filter(p => Math.abs(Number(p.ganhos)||0) > 0.01).length}</div>
      </div>
      <div style="${kpiS}var(--gold)">
        <div style="${kpiL}">📈 Profit / Loss</div>
        <div style="${kpiV}color:${clr(totGanhos)};">${fV(totGanhos,false)}</div>
      </div>
      <div style="${kpiS}var(--green)">
        <div style="${kpiL}">💎 Rake Gerado</div>
        <div style="${kpiV}color:var(--green);">${fV(totRake,false)}</div>
      </div>
      <div style="${kpiS}${clr(totRes)}">
        <div style="${kpiL}">📊 Resultado Final</div>
        <div style="${kpiV}color:${clr(totRes)};">${fV(totRes,false)}</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar" style="margin-bottom:12px;">
      <div class="tl">
        <input class="search-box" type="text" id="det-search" placeholder="🔍 Buscar agente ou jogador..." value="${_detSearch}" oninput="filterDet(this.value)">
      </div>
      <div class="tr">
        <button class="btn-sm" onclick="exportDet()">⬇ Exportar CSV</button>
      </div>
    </div>

    <!-- Tabela -->
    <div class="tw">
      <table class="tbl" style="min-width:960px;">
        <thead><tr>
          <th>Agência / Jogador</th>
          <th>ID Agente</th>
          <th style="text-align:right;">Ganhos</th>
          <th style="text-align:right;">Rake</th>
          <th style="text-align:right;">Rodeo GGR</th>
          <th style="text-align:right;">Resultado Final</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${filteredOrder.length === 0 ? '<div class="cs" style="padding:30px;"><div class="ci">🔍</div><h3>Nenhum resultado</h3></div>' : ''}
  `;
}

function updateOverviewKPIs(){
  const total     = allPlayers.length;
  const totGanhos = sumF(allPlayers,'ganhos');
  const totRake   = sumF(allPlayers,'rake');
  const totGGR    = sumF(allPlayers,'ggr');
  // Resultado = soma de resultadoAgente por agente
  const _agMap={};
  allPlayers.forEach(p=>{ const k=p.aname||'(sem agente)'; if(!_agMap[k])_agMap[k]=[]; _agMap[k].push(p); });
  const totResult = Object.entries(_agMap).reduce((s,[k,pl])=>s+calcAgentResult(k,pl).resultadoAgente,0);
  const rb        = Object.entries(_agMap).reduce((s,[k,pl])=> s + calcAgentRB(k, pl), 0);
  const unk       = allPlayers.filter(p=>p.clube==='?').length;
  document.getElementById('ov-total').textContent = total;
  document.getElementById('ov-rake').textContent  = total ? fV(totRake,false)   : '—';
  document.getElementById('ov-rb').textContent    = total ? fV(rb,false)        : '—';
  document.getElementById('ov-unk').textContent   = unk;
}

// ══════════════════ EXPORTAR RESUMO DO CLUBE ══════════════════
