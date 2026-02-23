// ══════════════════════════════════════════════════════════════════════
//  render-agents.js — Comprovantes, PDF, Linking, Export (Poker Manager)
//  Depende de: financeEngine.js, dataLayer.js, utils.js, app-state.js, render-rakeback.js
// ══════════════════════════════════════════════════════════════════════

const agentRB = DataLayer.getAgentRBConfig();
// Estado de expand por agente (apenas visual, não persiste)
const agentExpanded = {};

function saveAgentRB(){
  DataLayer.saveAgentRBConfig(agentRB);
}

function renderAgentClosing(){
  if(!activeClube) return;
  const list = document.getElementById('agent-closing-list');
  const kpiEl = document.getElementById('comp-kpis');
  if(!list) return;

  const cp = allPlayers.filter(p => p.clube === activeClube);
  if(!cp.length){
    list.innerHTML = '<div class="cs"><div class="ci">📂</div><h3>Importe a planilha primeiro</h3></div>';
    if(kpiEl) kpiEl.innerHTML = '';
    return;
  }

  // Agrupa jogadores por agente
  const agentOrder = [], agentMap = {};
  cp.forEach(p => {
    const key = p.aname || '(sem agente)';
    if(!agentMap[key]){ agentMap[key]=[]; agentOrder.push(key); }
    agentMap[key].push(p);
  });

  // (financial data loaded via getEntityLedgerNet — mesma função de calcSettlements)

  // Calcula dados de cada agente
  const agentData = agentOrder.map(agKey => {
    const players    = agentMap[agKey];
    const rakeTime   = players.reduce((s,p)=>s+n(p.rake),0);
    const ganhosTime = players.reduce((s,p)=>s+n(p.ganhos),0);
    const cfg        = agentRB[agKey] || {};
    const pctAgente  = getAgentPctAgente(agKey);
    const avista     = !!cfg.avista;
    const rbAgente   = calcAgentRB(agKey, players);
    const rbPlTotal  = players.reduce((s,p)=>s+(Number(p.rake)||0)*getPlayerPctRB(p)/100, 0);
    const pctPlayerEfetivo = rakeTime > 0 ? (rbPlTotal / rakeTime * 100) : 0;
    const totalResPlayers = players.reduce((s,p)=>
      s + resPlayer(p.ganhos, p.rake, getPlayerPctRB(p), p.ggr), 0);
    const netFinal   = ganhosTime + rbAgente;

    const agEntityId = makeEntityId('ag', agKey);
    const saldoPrev  = getSaldoAnterior(agEntityId);
    const totalDevido = netFinal + saldoPrev;

    // Pagamentos desta semana — usa helper canônico (mesmo de calcSettlements)
    const ledger = getEntityLedgerNet(agEntityId);
    const pago = ledger.net;
    const pendente = totalDevido + pago;

    const isDirect   = !!agentDirect[agKey];
    return { agKey, players, rakeTime, ganhosTime, pctAgente, avista, rbAgente, isDirect,
             rbPlTotal, pctPlayerEfetivo, totalResPlayers, netFinal, saldoPrev, totalDevido,
             pago, pendente, cfg };
  });

  // Sort by absolute value (biggest first) — preserve order on toggle/expand
  if(!window._skipCompSort){
    agentData.sort((a,b) => Math.abs(b.pendente) - Math.abs(a.pendente));
    window._lastCompOrder = agentData.map(d => d.agKey);
  } else if(window._lastCompOrder){
    const orderMap = {};
    window._lastCompOrder.forEach((k,i) => orderMap[k] = i);
    agentData.sort((a,b) => (orderMap[a.agKey]??999) - (orderMap[b.agKey]??999));
  }
  window._skipCompSort = false;

  // Split by direct / normal
  const normalData = agentData.filter(d => !d.isDirect);
  const directData = agentData.filter(d =>  d.isDirect);
  const activeData = _activeCompTab === 'agencias' ? normalData : directData;

  // KPIs
  if(kpiEl){
    const totalAgentes = activeData.length;
    const totalPagar   = activeData.filter(d=>d.pendente<-0.01).reduce((s,d)=>s+Math.abs(d.pendente),0);
    const totalReceber = activeData.filter(d=>d.pendente>0.01).reduce((s,d)=>s+d.pendente,0);
    const kpiStyle = 'background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:10px 12px;text-align:center;';
    const kpiLbl = 'font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-bottom:3px;';
    const kpiVal = "font-family:'JetBrains Mono',monospace;font-size:.92rem;font-weight:800;";
    kpiEl.innerHTML = `
      <div style="${kpiStyle}border-top:2px solid var(--gold);">
        <div style="${kpiLbl}">Agentes</div>
        <div style="${kpiVal}color:var(--t1);">${totalAgentes}</div>
      </div>
      <div style="${kpiStyle}border-top:2px solid #ef4444;">
        <div style="${kpiLbl}">Saldo a Pagar</div>
        <div style="${kpiVal}color:#ef4444;">${totalPagar>0?fV(totalPagar,false):'—'}</div>
      </div>
      <div style="${kpiStyle}border-top:2px solid #10b981;">
        <div style="${kpiLbl}">Saldo a Receber</div>
        <div style="${kpiVal}color:#10b981;">${totalReceber>0?fV(totalReceber,false):'—'}</div>
      </div>`;
  }

  // Tab buttons
  const tabsHtml = `<div style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--b1);padding-bottom:10px;">
    <button class="rb-itab ${_activeCompTab==='agencias'?'rb-itab-active':''}" onclick="switchCompTab('agencias')">🤝 Agências (${normalData.length})</button>
    <button class="rb-itab ${_activeCompTab==='diretos'?'rb-itab-active':''}" onclick="switchCompTab('diretos')">👤 Jogadores (${directData.length})</button>
  </div>`;

  // Cards — single row layout
  list.innerHTML = tabsHtml + activeData.map((d, idx) => {
    const { agKey, players, rakeTime, ganhosTime, pctAgente, avista, rbAgente, isDirect,
            rbPlTotal, pctPlayerEfetivo, totalResPlayers, netFinal, saldoPrev, totalDevido,
            pago, pendente, cfg } = d;
    const agSafe = agKey.replace(/'/g,"\\'");
    const isOpen = agentExpanded[agKey] || false;
    const hasMov = Math.abs(pendente) > 0.01 || Math.abs(totalDevido) > 0.01;
    const exported = window._compExported && window._compExported[agKey];
    const hasSaldo = Math.abs(saldoPrev) > 0.01;
    const hasPago = Math.abs(pago) > 0.01;
    const typeLocked = !!cfg.typeLocked;
    const typePending = !!cfg.typePending;
    const noMov = !hasMov;

    const typeHtml = typeLocked
      ? `<span onclick="event.stopPropagation()"><span class="comp-badge" style="background:${avista?'rgba(16,185,129,.08)':'rgba(239,68,68,.08)'};color:${avista?'#10b981':'#ef4444'};border-color:${avista?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)'};">🔒 ${avista?'À Vista':'Fiado'}</span><button onclick="unlockAgentType('${agSafe}')" class="comp-edit-btn">✎</button></span>`
      : typePending
      ? `<span onclick="event.stopPropagation()"><span class="comp-tog"><button class="comp-tog-btn ${!avista?'sel':''}" onclick="setAgentType('${agSafe}',false)">💳 Fiado</button><button class="comp-tog-btn ${avista?'sel':''}" onclick="setAgentType('${agSafe}',true)">💵 À Vista</button></span><button onclick="confirmAgentType('${agSafe}')" class="comp-ok-btn">✓</button></span>`
      : `<span class="comp-tog" onclick="event.stopPropagation()"><button class="comp-tog-btn ${!avista?'sel':''}" onclick="setAgentType('${agSafe}',false)">💳 Fiado</button><button class="comp-tog-btn ${avista?'sel':''}" onclick="setAgentType('${agSafe}',true)">💵 À Vista</button></span>`;

    return `<div class="comp-card ${noMov?'comp-card-dim':''}" data-result="${pendente < -0.01 ? 'pagar' : pendente > 0.01 ? 'receber' : 'zero'}" data-name="${agKey.toLowerCase()}">
      <div class="comp-row">
        <div class="comp-left">
          <div class="comp-avatar">${isDirect?'👤':'🤝'}</div>
          <div>
            <div class="comp-name-line">
              <span class="comp-name">${agKey}</span>
              ${isDirect ? '<span style="font-size:.48rem;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:1px 5px;border-radius:3px;font-weight:700;">DIRETO</span>' : ''}
              <span class="comp-cnt">${players.length} jog.</span>
            </div>
            <div class="comp-meta">${typeHtml}</div>
          </div>
        </div>
        <div class="comp-vals">
          <div class="comp-v" style="width:90px;">
            <div class="comp-v-lbl">GANHOS</div>
            <div class="comp-v-num ${ganhosTime>0?'vp':ganhosTime<0?'vn':'vz'}">${fV(ganhosTime,false)}</div>
          </div>
          <div class="comp-v" style="width:85px;">
            <div class="comp-v-lbl">${isDirect ? 'RB (Ind.)' : `RB AG. (${pctAgente}%)`}</div>
            <div class="comp-v-num" style="color:${isDirect?'#60a5fa':'#c084fc'};">${rbAgente>0.01?fV(rbAgente,false):'—'}</div>
          </div>
          <div class="comp-v" style="width:85px;">
            <div class="comp-v-lbl">SALDO ANT.</div>
            <div class="comp-v-num" style="color:var(--gold);">${hasSaldo?fV(saldoPrev,false):'—'}</div>
          </div>
          <div class="comp-v" style="width:85px;">
            <div class="comp-v-lbl">PAGO</div>
            <div class="comp-v-num" style="color:#38bdf8;">${hasPago?fV(pago,false):'—'}</div>
          </div>
          <div class="comp-v comp-v-final" style="width:100px;">
            <div class="comp-v-lbl">SALDO</div>
            <div class="comp-v-res ${pendente>0?'vp':pendente<0?'vn':'vz'}">${hasMov ? fV(pendente,false) : '—'}</div>
          </div>
        </div>
        <div class="comp-actions">
          ${hasMov
            ? `<button class="comp-btn-gen" onclick="event.stopPropagation();openAgentPDF('${agSafe}')">${exported?'✅ Comprovante Gerado':'📄 Gerar Comprovante'}</button>`
            : ''}
          <button class="comp-btn-det" onclick="event.stopPropagation();toggleAgentCard('${agSafe}')">
            ${isOpen ? '▲ Recolher' : '▶ Detalhes'}
          </button>
        </div>
      </div>
      ${isOpen ? `<div class="comp-expand">
        <div class="comp-fin">
          <div style="font-size:.65rem;font-weight:700;color:var(--t2);margin-bottom:6px;">🧮 Resumo Financeiro</div>
                    <div class="comp-fin-r"><span>Ganhos/Perdas</span><span class="${ganhosTime>0?'vp':ganhosTime<0?'vn':'vz'}" style="font-weight:700;">${fV(ganhosTime,false)}</span></div>
          <div class="comp-fin-r"><span style="color:var(--t3);">Rake Gerado</span><span style="color:var(--t3);">${fV(rakeTime,false)}</span></div>
          ${isDirect ? `<div class="comp-fin-r"><span>RB Individual (Σ jogadores)</span><span style="color:#60a5fa;font-weight:700;">${fV(rbAgente,false)}</span></div>` : (pctAgente > 0 ? `<div class="comp-fin-r"><span>RB Agente (${pctAgente}%)</span><span style="color:#c084fc;font-weight:700;">${fV(rbAgente,false)}</span></div>` : '')}
          <div class="comp-fin-r" style="border-top:1px solid var(--b1);padding-top:4px;margin-top:3px;"><span style="font-weight:700;">Resultado da Semana</span><span class="${netFinal>0?'vp':netFinal<0?'vn':'vz'}" style="font-weight:800;">${fV(netFinal,false)}</span></div>
          ${hasSaldo ? `<div class="comp-fin-r" style="color:var(--gold);"><span>Saldo Anterior</span><span style="font-weight:700;">${fV(saldoPrev,false)}</span></div>` : ''}
          <div class="comp-fin-r" style="border-top:1px solid var(--b1);padding-top:4px;margin-top:3px;"><span style="font-weight:700;">Total Devido</span><span class="${totalDevido>0?'vp':totalDevido<0?'vn':'vz'}" style="font-weight:800;">${fV(totalDevido,false)}</span></div>
          ${hasPago ? `<div class="comp-fin-r" style="color:#38bdf8;"><span>💳 Pagamentos</span><span style="font-weight:700;">${fV(pago,false)}</span></div>
          <div class="comp-fin-r" style="border-top:2px solid var(--b1);padding-top:4px;margin-top:3px;"><span style="font-weight:800;color:var(--t1);">Saldo Final</span><span class="${pendente>0?'vp':pendente<0?'vn':'vz'}" style="font-weight:900;font-size:.82rem;">${fV(pendente,false)}</span></div>` : ''}
        </div>
        <div style="margin-top:10px;">
          <div style="font-size:.62rem;font-weight:700;color:var(--t2);margin-bottom:4px;">👥 Jogadores (${players.length})</div>
          <div style="overflow-x:auto;">
          <table class="comp-pl">
            <thead><tr><th style="text-align:left;">Nick</th><th style="text-align:left;">ID</th><th style="text-align:right;">P/L</th><th style="text-align:right;">Rake</th><th style="text-align:right;">Resultado</th></tr></thead>
            <tbody>${players.map((p,pi) => {
              const pGanhos = n(p.ganhos);
              const pRes = resPlayer(p.ganhos, p.rake, getPlayerPctRB(p), p.ggr);
              return `<tr style="${pi%2?'background:rgba(255,255,255,.015);':''}"><td style="font-weight:600;">${p.nick||'—'}</td><td style="color:var(--t3);font-size:.58rem;">${p.id||'—'}</td><td style="text-align:right;" class="${pGanhos>0?'vp':pGanhos<0?'vn':'vz'}">${fV(pGanhos,false)}</td><td style="text-align:right;">${fV(n(p.rake),false)}</td><td style="text-align:right;font-weight:700;" class="${pRes>0?'vp':pRes<0?'vn':'vz'}">${fV(pRes,false)}</td></tr>`;
            }).join('')}</tbody>
          </table>
          </div>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function setAgentType(agKey, avista){
  const prev = agentRB[agKey] || {};
  // Only set pending, don't lock yet
  agentRB[agKey] = { ...prev, avista, typeLocked: false, typePending: true };
  saveAgentRB();
  window._skipCompSort = true;
  renderAgentClosing();
}

function confirmAgentType(agKey){
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, typeLocked: true, typePending: false };
  saveAgentRB();
  window._skipCompSort = true;
  renderAgentClosing();
}

function unlockAgentType(agKey){
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, typeLocked: false, typePending: false };
  saveAgentRB();
  window._skipCompSort = true;
  renderAgentClosing();
}

function lockAgentRB(agKey){
  const agId = agKey.replace(/[^a-zA-Z0-9]/g,'_');
  const inpAgente = document.getElementById('rb-inp-'+agId);
  const pctAgente = parseFloat(inpAgente?.value)||0;
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, pctAgente, pct: pctAgente, locked: true };
  saveAgentRB();
  renderAgentClosing();
}

function setAgentRBDual(agKey, tipo, val){
  const prev = agentRB[agKey] || {};
  const v    = parseFloat(val)||0;
  agentRB[agKey] = { ...prev, pctAgente: v, pct: v };
  saveAgentRB();
  // Re-render suave
  const entities = calcFinEntities();
  const e = entities.find(x=>x.nome===agKey);
  if(e){
    const agId = makeEntityId('ag', agKey);
    const saldoPrev = getSaldoAnterior(agId);
    const movTotal  = getMovTotal(agId);
    const saldoAt   = FinanceEngine.calcSaldoAtual(saldoPrev, -e.valor, movTotal);
    setSaldoAberto(agId, saldoAt);
  }
}
function unlockAgentRB(agKey){
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, locked: false };
  saveAgentRB();
  renderAgentClosing();
  setTimeout(()=>{
    const agId = agKey.replace(/[^a-zA-Z0-9]/g,'_');
    document.getElementById('rb-inp-'+agId)?.focus();
  },50);
}
function filterAgentList(q){
  const term = (q||'').toLowerCase().trim();
  const resultFilter = document.getElementById('comp-filter-result')?.value || 'all';
  document.querySelectorAll('#agent-closing-list .comp-card').forEach(el=>{
    const name = (el.dataset.name||'');
    const result = el.dataset.result||'zero';
    const matchName = !term || name.includes(term);
    const matchResult = resultFilter === 'all' || result === resultFilter;
    el.style.display = (matchName && matchResult) ? '' : 'none';
  });
}

function setAgentRB(agKey, val){
  const prev = agentRB[agKey] || {};
  const v = parseFloat(val)||0;
  agentRB[agKey] = { ...prev, pctAgente: v, pct: v, locked: false };
  saveAgentRB();
  renderAgentClosing();
}

function toggleAgentCard(agKey){
  agentExpanded[agKey] = !agentExpanded[agKey];
  window._skipCompSort = true;
  renderAgentClosing();
}

// ── EXPORTAÇÃO JPG do AGENTE ──
function openAgentPDF(agKey){
  if(!activeClube) return;
  const cp = allPlayers.filter(p=>p.clube===activeClube && p.aname===agKey);
  if(!cp.length) return;

  // Mark as exported
  if(!window._compExported) window._compExported = {};
  window._compExported[agKey] = true;

  const rakeTime   = cp.reduce((s,p)=>s+n(p.rake),0);
  const ganhosTime = cp.reduce((s,p)=>s+n(p.ganhos),0);
  const cfg        = agentRB[agKey] || {};
  const pctAgente  = getAgentPctAgente(agKey); // snapshot-aware
  const avista     = !!cfg.avista;
  const rbAg       = calcAgentRB(agKey, cp);
  const rbPlTotal  = cp.reduce((s,p)=>s+(Number(p.rake)||0)*getPlayerPctRB(p)/100, 0);
  const pctPlayerEfetivo = rakeTime > 0 ? (rbPlTotal / rakeTime * 100) : 0;
  const totalResPlayers = cp.reduce((s,p)=>s+resPlayer(p.ganhos,p.rake,getPlayerPctRB(p),p.ggr),0);
  const resultadoFinal  = ganhosTime + rbAg;

  // Fórmula de liquidação: pendente = totalDevido + pago (mesma de calcSettlements)
  const agId      = makeEntityId('ag', agKey);
  const saldoPrev = getSaldoAnterior(agId);
  const ledger    = getEntityLedgerNet(agId);
  const totalDevido = resultadoFinal + saldoPrev;
  const pago      = ledger.net;
  const pendente  = totalDevido + pago;
  const allData   = getFinData();
  const hist      = allData[finKey()]?.[agId]?.historico || [];
  const statusPag = Math.abs(pendente) < 0.01 ? 'pago' : Math.abs(pago) > 0.01 ? 'parcial' : 'aberto';

  const week  = weeks[selWeekIdx] ? fW(weeks[selWeekIdx]) : '—';
  const clube = activeClube;
  const m     = CMETA[clube]||{};

  const fmtA = v => (v<0?'-':'')+'R$ '+fV(Math.abs(v),false);
  const clrV = v => v>=0?'#16a34a':'#dc2626';
  const clrStatus = statusPag==='pago'?'#16a34a':statusPag==='parcial'?'#d97706':'#6b7280';
  const lblStatus = statusPag==='pago'?'✅ Quitado':statusPag==='parcial'?'◑ Parcialmente pago':'⏳ Em aberto';

  const html = `
  <div class="pdf-doc" id="pdf-capture">
    <div class="pdf-header-doc">
      <!-- Logo e nome do clube em destaque -->
      <div style="display:flex;align-items:center;gap:12px;">
        ${clubLogos[clube]
          ? `<img src="${clubLogos[clube]}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;">`
          : `<div style="width:48px;height:48px;border-radius:10px;background:#1e2538;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">${m.icon}</div>`
        }
        <div>
          <div style="font-size:1.2rem;font-weight:900;color:#111;letter-spacing:-.5px;">${clube}</div>
          <div style="font-size:.72rem;color:#888;font-weight:500;margin-top:1px;">Fechamento Semanal</div>
        </div>
      </div>
      <div class="pdf-period">
        <div style="font-weight:700;font-size:.85rem;color:#333">📅 ${week}</div>
      </div>
    </div>

    <div class="pdf-agent-title">🤝 ${agKey}</div>
    <div class="pdf-agent-sub">Extrato de fechamento · ${cp.length} jogador${cp.length!==1?'es':''} · ${avista?'À Vista':'Fiado'}</div>

    <!-- Player Breakdown Table -->
    <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:.72rem;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:6px 10px;text-align:left;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Jogador</th>
            <th style="padding:6px 8px;text-align:left;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">ID</th>
            <th style="padding:6px 8px;text-align:right;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">P/L</th>
            <th style="padding:6px 8px;text-align:right;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Rake</th>
            ${cp.some(p=>n(p.ggr)!==0)?'<th style="padding:6px 8px;text-align:right;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">GGR</th>':''}
            <th style="padding:6px 8px;text-align:right;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Resultado</th>
          </tr>
        </thead>
        <tbody>
          ${cp.map((p,pi) => {
            const pRake = n(p.rake);
            const pPct = getPlayerPctRB(p);
            const pGGR = n(p.ggr);
            const pGanhos = n(p.ganhos);
            const pRes = resPlayer(p.ganhos, p.rake, pPct, p.ggr);
            return `<tr style="border-top:1px solid #f1f5f9;${pi%2?'background:#fafbfc;':''}">
              <td style="padding:5px 10px;font-weight:600;color:#111;">${p.nick||'—'}</td>
              <td style="padding:5px 8px;color:#94a3b8;font-family:'Courier New',monospace;font-size:.65rem;">${p.id||'—'}</td>
              <td style="padding:5px 8px;text-align:right;font-family:'Courier New',monospace;color:${clrV(pGanhos)};font-weight:600;">${fmtA(pGanhos)}</td>
              <td style="padding:5px 8px;text-align:right;font-family:'Courier New',monospace;color:#16a34a;">${fV(pRake,false)}</td>
              ${cp.some(pp=>n(pp.ggr)!==0)?`<td style="padding:5px 8px;text-align:right;font-family:'Courier New',monospace;color:${clrV(pGGR)};">${pGGR!==0?fmtA(pGGR):'—'}</td>`:''}
              <td style="padding:5px 8px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:${clrV(pRes)};">${fmtA(pRes)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;">
            <td style="padding:6px 10px;font-weight:800;color:#111;" colspan="2">TOTAL</td>
            <td style="padding:6px 8px;text-align:right;font-family:'Courier New',monospace;font-weight:800;color:${clrV(ganhosTime)};">${fmtA(ganhosTime)}</td>
            <td style="padding:6px 8px;text-align:right;font-family:'Courier New',monospace;font-weight:800;color:#16a34a;">${fV(rakeTime,false)}</td>
            ${cp.some(p=>n(p.ggr)!==0)?`<td style="padding:6px 8px;text-align:right;font-family:'Courier New',monospace;font-weight:800;color:${clrV(cp.reduce((s,p)=>s+n(p.ggr),0))};">${fmtA(cp.reduce((s,p)=>s+n(p.ggr),0))}</td>`:''}
            <td style="padding:6px 8px;text-align:right;font-family:'Courier New',monospace;font-weight:800;color:${clrV(totalResPlayers)};">${fmtA(totalResPlayers)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Valores calculados -->
    <div class="pdf-totals" style="margin-top:20px;">
      ${avista ? '' : `<div class="pdf-total-row">
          <span class="pdf-total-label">Ganhos / Perdas dos Jogadores</span>
          <span class="pdf-total-val" style="color:${clrV(ganhosTime)}">${fmtA(ganhosTime)}</span>
        </div>`}
      <div class="pdf-total-row">
        <span class="pdf-total-label" style="color:#aaa;font-style:italic;">Rake Gerado <span style="font-size:.7rem;">(informativo)</span></span>
        <span class="pdf-total-val" style="color:#aaa;">R$ ${fV(rakeTime,false)}</span>
      </div>
      ${pctAgente>0?`<div class="pdf-total-row">
        <span class="pdf-total-label">RB Agente (${pctAgente}% do Rake)</span>
        <span class="pdf-total-val" style="color:#7c3aed;">R$ ${fV(rbAg,false)}</span>
      </div>`:''}
      ${Math.abs(saldoPrev)>0.01?`
      <div class="pdf-total-row" style="color:#b45309;">
        <span class="pdf-total-label">⚠ Saldo semana anterior</span>
        <span class="pdf-total-val" style="color:#b45309;">${fmtA(saldoPrev)}</span>
      </div>`:''}
      <div class="pdf-total-row" style="margin-top:8px;border-top:2px solid #e2e8f0;padding-top:8px;">
        <span style="font-weight:800;color:#111;">
          ${Math.abs(saldoPrev)>0.01 ? 'Total com Saldo' : 'Resultado Final'}
        </span>
        <span class="pdf-total-val" style="font-size:1.1rem;color:${clrV(totalDevido)};font-weight:900;">
          ${fmtA(totalDevido)}
        </span>
      </div>
      ${Math.abs(saldoPrev)>0.01?`<div class="pdf-total-row" style="margin-top:2px;">
        <span class="pdf-total-label" style="color:#aaa;font-size:.68rem;font-style:italic;">Resultado da semana: ${fmtA(resultadoFinal)}</span>
      </div>`:''}
    </div>

    <!-- Pagamentos realizados -->
    ${hist.length > 0 ? `
    <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:#f1f5f9;padding:8px 14px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#64748b;display:flex;justify-content:space-between;">
        <span>💳 Pagamentos Registrados</span>
        <span style="color:${clrStatus}">${lblStatus}</span>
      </div>
      ${hist.map(h=>{
        const dt = new Date(h.ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        const origem = h.origem==='OFX'?' · via OFX':'';
        const dirLabel = h.dir==='out' ? '−' : '+';
        const dirColor = h.dir==='out' ? '#dc2626' : '#16a34a';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;border-top:1px solid #e5e7eb;font-size:.78rem;">
          <div>
            <span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:5px;font-size:.68rem;font-weight:700;margin-right:8px;">${h.metodo}</span>
            <span style="color:#64748b;font-size:.7rem;">${dt}${origem}</span>
            ${h.comp&&!h.comp.startsWith('data:image')?`<span style="color:#94a3b8;font-size:.68rem;margin-left:6px;">— ${h.comp.substring(0,35)}${h.comp.length>35?'…':''}</span>`:''}
          </div>
          <span style="font-family:'Courier New',monospace;font-weight:700;color:${dirColor};">${dirLabel}R$ ${fV(h.valor,false)}</span>
        </div>`;
      }).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#f8fafc;border-top:2px solid #e5e7eb;">
        <div style="font-size:.78rem;">
          <span style="font-weight:700;color:#111;">Saldo atual:</span>
        </div>
        <span style="font-family:'Courier New',monospace;font-weight:900;font-size:.95rem;color:${clrStatus};">
          ${Math.abs(pendente)<0.01 ? '✅ Quitado' : (pendente<0?'R$ '+fV(Math.abs(pendente),false)+' a pagar':'R$ '+fV(pendente,false)+' a receber')}
        </span>
      </div>
    </div>` : ''}

    <div class="pdf-footer-doc">${clube} · Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>`;

  document.getElementById('pdf-doc-render').innerHTML = html;
  window._pdfAgentKey = agKey;
  document.getElementById('pdf-modal').classList.add('open');
}

function downloadAgentImage(){
  const el = document.getElementById('pdf-capture');
  if(!el || typeof html2canvas === 'undefined'){
    showToast('⚠️ Biblioteca de captura não disponível');
    return;
  }
  html2canvas(el, {scale:2, backgroundColor:'#fff', useCORS:true}).then(canvas=>{
    const link = document.createElement('a');
    link.download = `extrato_${(window._pdfAgentKey||'agente').replace(/[^a-zA-Z0-9]/g,'_')}_${activeClube}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    showToast('✅ Extrato salvo como JPG!');
    renderAgentClosing();
  });
}

function exportAllAgentsPDF(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro'); return; }
  const cp = allPlayers.filter(p=>p.clube===activeClube);
  const agents = [...new Set(cp.map(p=>p.aname||'(sem agente)'))];
  if(!agents.length){ showToast('⚠️ Nenhum agente encontrado'); return; }
  if(typeof html2canvas === 'undefined'){ showToast('⚠️ Biblioteca de captura não disponível'); return; }

  showToast(`📄 Exportando ${agents.length} extratos...`);
  let idx = 0;
  function next(){
    if(idx >= agents.length){ showToast(`✅ ${agents.length} extratos exportados!`); return; }
    openAgentPDF(agents[idx]);
    setTimeout(()=>{
      const el = document.getElementById('pdf-capture');
      if(el){
        html2canvas(el,{scale:2,backgroundColor:'#fff',useCORS:true}).then(canvas=>{
          const link = document.createElement('a');
          link.download = `extrato_${(agents[idx]||'agente').replace(/[^a-zA-Z0-9]/g,'_')}_${activeClube}.jpg`;
          link.href = canvas.toDataURL('image/jpeg', 0.95);
          link.click();
          idx++;
          setTimeout(next, 400);
        });
      } else { idx++; next(); }
    }, 300);
  }
  next();
}

// ══════════════════ UNLINKED ══════════════════
function checkUnlinkedOv(){
  const n=allPlayers.filter(p=>p.clube==='?').length;
  document.getElementById('unl-bar-ov').style.display=n>0?'flex':'none';
  document.getElementById('unl-count-ov').textContent=n;
  document.getElementById('ov-unk').textContent=n;
  checkIgnoredAgents();
  updateSidebar();
}
function checkUnlinkedClub(){
  if(!activeClube)return;
  const cp=allPlayers.filter(p=>p.clube===activeClube);
  const n=cp.filter(p=>p.clube==='?').length;
  document.getElementById('unl-bar-club').style.display=n>0?'flex':'none';
  document.getElementById('unl-count-club').textContent=n;
}

// ── Agentes Ignorados ─────────────────────────────────────────────────
function checkIgnoredAgents() {
  const ignored = DataLayer.getIgnoredAgents();
  const count   = Object.keys(ignored).length;
  const bar     = document.getElementById('ignored-bar');
  const cnt     = document.getElementById('ignored-count');
  if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent   = count;
}

function openIgnoredPanel() {
  const panel = document.getElementById('ignored-panel');
  const list  = document.getElementById('ignored-list');
  if (!panel || !list) return;
  const ignored = DataLayer.getIgnoredAgents();
  if (Object.keys(ignored).length === 0) {
    list.innerHTML = '<div style="font-size:.65rem;color:var(--t3);padding:6px 0;">Nenhum agente ignorado.</div>';
  } else {
    let html = '';
    Object.entries(ignored).forEach(([agentId, data]) => {
      const dt = data.ignoredAt ? new Date(data.ignoredAt).toLocaleDateString('pt-BR') : '';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1);">';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:.67rem;font-weight:600;color:var(--t1);">'+data.agentName+'</div>';
      html += '<div style="font-size:.55rem;color:var(--t3);">ID '+agentId+(dt?' · ignorado em '+dt:'')+'</div>';
      html += '</div>';
      html += '<button onclick="reativarAgent(\''+agentId+'\')" style="font-size:.6rem;padding:3px 10px;border-radius:5px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981;cursor:pointer;font-weight:700;">Reativar</button>';
      html += '</div>';
    });
    list.innerHTML = html;
  }
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function reativarAgent(agentId) {
  const ignored = DataLayer.getIgnoredAgents();
  const name    = (ignored[agentId] || {}).agentName || agentId;
  DataLayer.unignoreAgent(agentId);
  showToast('✅ Agente "'+name+'" reativado — será classificado na próxima importação');
  checkIgnoredAgents();
  openIgnoredPanel(); // re-render panel
}

// ══════════════════ LINK ══════════════════
function openLink(idx){
  pendingLinkIdx=idx;selOpt=null;
  const p=allPlayers[idx];
  document.getElementById('ml-id').textContent='ID: '+(p.id||'—');
  document.getElementById('ml-nick').textContent='Nick: '+(p.nick||'—');
  document.getElementById('ml-agent').textContent=p.aname||'—';
  document.querySelectorAll('.co').forEach(o=>o.classList.remove('sel'));
  document.getElementById('mLink').classList.add('open');
}
function pickOpt(el){document.querySelectorAll('.co').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');selOpt=el.dataset.opt;}
function confirmLink(){
  if(!selOpt||pendingLinkIdx===null){showToast('Selecione um clube!','e');return;}
  const agentName = allPlayers[pendingLinkIdx].aname;
  // Salva por agente — reclassifica todos com mesmo nome de agente
  saveManualLink(String(agentName).toUpperCase().trim(), selOpt);
  closeM('mLink');
  filteredAll=[...allPlayers];renderAllTable();
  if(activeClube){filteredClub=allPlayers.filter(p=>p.clube===activeClube);renderClubTable();}
  checkUnlinkedOv();updateSidebar();
  renderOverview();
  const unk = allPlayers.filter(p=>p.aname.toUpperCase().trim()===String(agentName).toUpperCase().trim()).length;
  showToast(`✅ ${agentName} → ${selOpt} (${unk} jogador${unk!==1?'es':''} reclassificado${unk!==1?'s':''})`);
}

// BULK
function openBulk(){buildBulkList(allPlayers.filter(p=>p.clube==='?'));}
function openBulkClub(){buildBulkList(allPlayers.filter(p=>p.clube==='?'));}
function buildBulkList(unk){
  document.getElementById('bulkSub').textContent=`${unk.length} jogadores sem classificação:`;
  const list=document.getElementById('bulkList');
  list.innerHTML=unk.map(p=>{
    const ri=allPlayers.indexOf(p);
    return`<div style="background:var(--s2);border:1px solid var(--b1);border-radius:9px;padding:10px 12px;margin-bottom:7px;" id="bl-${ri}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
        <div>
          <span style="font-family:'JetBrains Mono',monospace;color:var(--gold);font-size:.8rem;font-weight:600">${p.id||'—'}</span>
          <span style="color:var(--t2);font-size:.78rem;margin-left:7px">${p.nick}</span>
          <span style="color:var(--t3);font-size:.72rem;margin-left:5px">· ${p.aname||'—'}</span>
        </div>
        <span id="bls-${ri}" style="font-size:.73rem;color:var(--t3)">Pendente</span>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${CLUBS.map(c=>{const m=CMETA[c];return`<button onclick="bulkLink(${ri},'${c}')" 
          style="background:var(--s3);border:1px solid var(--b2);color:var(--t2);padding:4px 10px;border-radius:12px;cursor:pointer;font-size:.73rem;font-family:'Outfit',sans-serif"
          onmouseover="this.style.color='var(--gold)';this.style.borderColor='var(--gold)'"
          onmouseout="this.style.color='var(--t2)';this.style.borderColor='var(--b2)'">${m.icon} ${c}</button>`;}).join('')}
      </div>
    </div>`;
  }).join('');
  document.getElementById('mBulk').classList.add('open');
}
function bulkLink(idx,clube){
  const agentName = allPlayers[idx].aname;
  saveManualLink(String(agentName).toUpperCase().trim(), clube);
  const row=document.getElementById(`bl-${idx}`);
  if(row){row.style.opacity='.4';row.style.pointerEvents='none';}
  const s=document.getElementById(`bls-${idx}`);
  if(s){s.textContent='✓ '+clube;s.style.color='var(--green)';}
  filteredAll=[...allPlayers];renderAllTable();
  if(activeClube){filteredClub=allPlayers.filter(p=>p.clube===activeClube);renderClubTable();}
  checkUnlinkedOv();updateSidebar();
}

// EXPORTS
function exportAll(){
  if(!allPlayers.length){showToast('Nenhum dado!','e');return;}
  csvDl(filteredAll,`todos_clubes_${fW(weeks[selWeekIdx]).replace(/ /g,'').replace(/→/g,'-')}.csv`);
}
function exportClub(){
  if(!activeClube){return;}
  const data=allPlayers.filter(p=>p.clube===activeClube);
  if(!data.length){showToast('Clube sem jogadores!','e');return;}
  csvDl(data,`${activeClube}_${fW(weeks[selWeekIdx]).replace(/ /g,'').replace(/→/g,'-')}.csv`);
}
