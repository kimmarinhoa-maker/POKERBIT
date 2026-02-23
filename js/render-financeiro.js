// ══════════════════════════════════════════════════════════════════════
//  render-financeiro.js — Financeiro + Pagamentos + Liquidação (Poker Manager)
//  Depende de: financeEngine.js, dataLayer.js, utils.js, app-state.js, render-rakeback.js
// ══════════════════════════════════════════════════════════════════════

// ══════════════════ FECHAMENTOS (LIQUIDAÇÃO) ══════════════════

let _fechTab = 'agentes';
let _fechSubTab = 'pagar'; // 'pagar' | 'receber'
let _fechSearch = '';
let _fechSort = 'pendente_desc';
let _fechSearchTimer = null;

function setFechSort(s){ _fechSort = s; renderFechamentos(); }
function setFechSearch(q){
  _fechSearch = q.toLowerCase().trim();
  clearTimeout(_fechSearchTimer);
  _fechSearchTimer = setTimeout(() => {
    const prev = document.activeElement;
    const wasSrch = prev && prev.id === 'fech-search';
    const pos = wasSrch ? prev.selectionStart : 0;
    renderFechamentos();
    if(wasSrch){ const inp = document.getElementById('fech-search'); if(inp){ inp.focus(); inp.setSelectionRange(pos,pos); } }
  }, 200);
}
function switchFechTab(tab){ _fechTab = tab; _fechSubTab = 'pagar'; renderFechamentos(); }
function switchFechSubTab(t){ _fechSubTab = t; _fechFilter = 'todos'; renderFechamentos(); }

let _activeCompTab = 'agencias';
function switchCompTab(tab){ _activeCompTab = tab; renderAgentClosing(); }

function calcSettlements(){
  if(!activeClube) return [];
  const cp = allPlayers.filter(p=>p.clube===activeClube);
  if(!cp.length) return [];

  const settlements = [];

  // ── AGENTES ──
  const agentMap = {};
  cp.forEach(p => {
    const raw = (p.aname||'').trim();
    const k = (!raw || /^(none|null|undefined)$/i.test(raw)) ? '(sem agente)' : raw;
    if(!agentMap[k]) agentMap[k] = [];
    agentMap[k].push(p);
  });

  Object.entries(agentMap).forEach(([agKey, allPlayersInAgent]) => {
    if(agentDirect[agKey]) return;
    const players = allPlayersInAgent.filter(p => !playerDirect[p.id]);
    if(!players.length) return;

    const ganhosTotal = players.reduce((s,p) => s + (Number(p.ganhos)||0), 0);
    const rakeTotal = players.reduce((s,p) => s + (Number(p.rake)||0), 0);
    const rbAg = calcAgentRB(agKey, players);
    const avista = !!(agentRB[agKey]||{}).avista;
    const resultadoSemana = ganhosTotal + rbAg;

    const entityId = makeEntityId('ag', agKey);
    const saldoAnterior = getSaldoAnterior(entityId);
    const saStatus = Math.abs(saldoAnterior) > 0.01 ? 'locked' : 'novo';

    const ledger = getEntityLedgerNet(entityId);
    const pago = ledger.net;
    const totalDevido = saldoAnterior + resultadoSemana;
    const pendente = FinanceEngine.calcPendente(totalDevido, pago);

    settlements.push({
      id: entityId, tipo: 'agente', nome: agKey,
      jogadores: players.length, saldoAnterior, saStatus,
      resultadoSemana, totalDevido, pago, pendente,
      entradas: ledger.entradas, saidas: ledger.saidas,
      _players: players
    });
  });

  // ── JOGADORES DIRETOS ──
  cp.filter(p => isPlayerDirectSettlement(p.id, (p.aname||'').trim())).forEach(p => {
    const resultadoSemana = FinanceEngine.calcPlayerResult(p, getPlayerPctRB(p));
    const entityId = makeEntityId('pl', p.id||p.nick);
    const saldoAnterior = getSaldoAnterior(entityId);
    const saStatus = Math.abs(saldoAnterior) > 0.01 ? 'locked' : 'novo';
    const ledger = getEntityLedgerNet(entityId);
    const pago = ledger.net;
    const totalDevido = saldoAnterior + resultadoSemana;
    const pendente = FinanceEngine.calcPendente(totalDevido, pago);
    const agRaw = (p.aname||'').trim();
    const agName = (!agRaw || /^(none|null|undefined)$/i.test(agRaw)) ? '' : agRaw;

    settlements.push({
      id: entityId, tipo: 'direto', nome: p.nick || String(p.id),
      agencia: agName, jogadores: 1,
      saldoAnterior, saStatus,
      resultadoSemana, totalDevido, pago, pendente,
      entradas: ledger.entradas, saidas: ledger.saidas
    });
  });

  return settlements;
}

function getSettlementStatus(s){
  if(Math.abs(s.totalDevido) < 0.01 && Math.abs(s.pago) < 0.01)
    return { label: 'Sem Mov.', cls: 'sem-mov', bg: 'rgba(148,163,184,.08)', border: 'rgba(148,163,184,.15)', color: '#94a3b8' };
  if(Math.abs(s.pendente) < 0.01)
    return { label: 'Quitado', cls: 'quitado', bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.15)', color: '#10b981' };
  // Crédito: pagou a mais — pendente tem sinal oposto ao totalDevido
  if(Math.abs(s.totalDevido) > 0.01 && (
    (s.totalDevido > 0 && s.pendente < -0.01) ||
    (s.totalDevido < 0 && s.pendente > 0.01)
  ))
    return { label: 'Crédito', cls: 'credito', bg: 'rgba(168,139,250,.08)', border: 'rgba(168,139,250,.15)', color: '#a78bfa' };
  return { label: 'Em Aberto', cls: 'em-aberto', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.15)', color: '#ef4444' };
}

function renderFechamentos(){
  const container = document.getElementById('fech-full-content');
  if(!container) return;
  const all = calcSettlements();
  if(!all.length){
    container.innerHTML = '<div class="cs"><div class="ci">📂</div><h3>Importe a planilha primeiro</h3></div>';
    return;
  }

  const agentes = all.filter(s => s.tipo === 'agente');
  const diretos  = all.filter(s => s.tipo === 'direto');

  // ── KPI calculations ──
  const cntSemMov  = all.filter(e => getSettlementStatus(e).cls === 'sem-mov').length;
  const cntQuitado = all.filter(e => { const c = getSettlementStatus(e).cls; return c === 'quitado' || c === 'credito'; }).length;
  const baseCount  = all.length - cntSemMov;
  const progresso  = baseCount > 0 ? Math.round(cntQuitado / baseCount * 100) : 0;
  const aPagarTot  = all.reduce((s,e) => s + (e.pendente < -0.01 ? Math.abs(e.pendente) : 0), 0);
  const aReceberTot= all.reduce((s,e) => s + (e.pendente > 0.01 ? e.pendente : 0), 0);
  const saldoLiq   = aReceberTot - aPagarTot;
  const totalMov   = all.reduce((s,e) => s + Math.abs(e.pago), 0);

  // ── Split by totalDevido in current tab (before filter/search) ──
  const tabData    = _fechTab === 'agentes' ? agentes : diretos;
  const secPagar   = tabData.filter(s => s.totalDevido < -0.01);
  const secReceber = tabData.filter(s => s.totalDevido > 0.01);

  // ── Active sub-tab + filter/search/sort ──
  const subData = _fechSubTab === 'pagar' ? secPagar : secReceber;
  let items = subData.map(s => ({ ...s, _st: getSettlementStatus(s) }));
  if(_fechSearch) items = items.filter(s => s.nome.toLowerCase().includes(_fechSearch) || (s.agencia||'').toLowerCase().includes(_fechSearch));
  items.sort((a,b) => {
    if(_fechSort === 'pendente_desc') return a.pendente - b.pendente;
    if(_fechSort === 'pendente_asc')  return b.pendente - a.pendente;
    if(_fechSort === 'resultado')     return a.resultadoSemana - b.resultadoSemana;
    if(_fechSort === 'nome')          return a.nome.localeCompare(b.nome);
    const so = {'em-aberto':0, credito:1, quitado:2, 'sem-mov':3};
    return (so[a._st.cls]||5) - (so[b._st.cls]||5);
  });

  // ── Helpers ──
  function kC(icon,lbl,val,color,sub){
    return '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:10px 12px;border-top:2px solid '+color+';min-width:0;">'
      +'<div style="font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);margin-bottom:3px;">'+icon+' '+lbl+'</div>'
      +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:.92rem;font-weight:800;color:'+color+';">'+val+'</div>'
      +(sub?'<div style="font-size:.48rem;color:var(--t3);margin-top:2px;">'+sub+'</div>':'')
      +'</div>';
  }
  let html = '';
  const isAg  = _fechTab === 'agentes';
  const ths   = 'padding:9px 8px;font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);background:var(--s2);white-space:nowrap;';
  const rs    = 'padding:7px 8px;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;border-bottom:1px solid var(--b1);';
  const trs   = 'padding:9px 8px;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;font-weight:800;';
  let rowIdx  = 0;

  // ── KPIs ──
  const progressHtml =
    '<div style="display:flex;align-items:center;gap:5px;margin-top:6px;">'
    +'<div style="flex:1;height:4px;background:var(--b1);border-radius:2px;overflow:hidden;">'
    +'<div style="height:100%;width:'+progresso+'%;background:#10b981;border-radius:2px;transition:width .4s;"></div></div>'
    +'<span style="font-size:.48rem;color:#10b981;font-weight:700;white-space:nowrap;">'+progresso+'%</span>'
    +'</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:14px;">';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:10px 12px;border-top:2px solid #10b981;min-width:0;">'
    +'<div style="font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);margin-bottom:3px;">✅ Progresso</div>'
    +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:.92rem;font-weight:800;color:#10b981;">'+cntQuitado+' de '+baseCount+'</div>'
    +'<div style="font-size:.48rem;color:var(--t3);margin-top:1px;">quitados</div>'
    +progressHtml+'</div>';
  html += kC('📤','A Pagar',      aPagarTot  > 0.01 ? 'R$ '+fV(aPagarTot,false)  : '—', '#ef4444', secPagar.length  +' entidade'+(secPagar.length!==1?'s':''));
  html += kC('📥','A Receber',    aReceberTot> 0.01 ? 'R$ '+fV(aReceberTot,false) : '—', '#10b981', secReceber.length+' entidade'+(secReceber.length!==1?'s':''));
  html += kC('⚖️','Saldo Líquido','R$ '+fV(saldoLiq,false), clr(saldoLiq), saldoLiq>0?'favorável ao clube':saldoLiq<0?'favorável a agentes':'zerado');
  html += kC('💰','Movimentado',   totalMov   > 0.01 ? 'R$ '+fV(totalMov,false)   : '—', '#60a5fa', 'total já pago/recebido');
  html += '</div>';

  // ── Main tabs + controls ──
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">';
  html += '<button class="fin-stab '+(_fechTab==='agentes'?'active':'')+'" onclick="switchFechTab(\'agentes\')">🤝 Agências ('+agentes.length+')</button>';
  html += '<button class="fin-stab '+(_fechTab==='diretos'?'active':'')+'" onclick="switchFechTab(\'diretos\')">👤 Jogadores ('+diretos.length+')</button>';
  html += '<div style="flex:1;"></div>';
  html += '<input type="text" id="fech-search" value="'+_fechSearch+'" oninput="setFechSearch(this.value)" placeholder="🔍 Buscar..." style="background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:5px 10px;border-radius:6px;font-size:.72rem;width:170px;">';
  html += '<select onchange="setFechSort(this.value)" style="background:var(--s2);border:1px solid var(--b1);color:var(--t2);padding:5px 8px;border-radius:6px;font-size:.6rem;cursor:pointer;">';
  html += '<option value="pendente_desc"'+(_fechSort==='pendente_desc'?' selected':'')+'>↓ Maior devedor</option>';
  html += '<option value="pendente_asc"'+(_fechSort==='pendente_asc'?' selected':'')+'>↑ Maior credor</option>';
  html += '<option value="resultado"'+(_fechSort==='resultado'?' selected':'')+'>Resultado</option>';
  html += '<option value="nome"'+(_fechSort==='nome'?' selected':'')+'>Nome A-Z</option>';
  html += '<option value="status"'+(_fechSort==='status'?' selected':'')+'>Status</option>';
  html += '</select>';
  html += '</div>';

  // ── Sub-tabs A Pagar / A Receber ──
  html += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
  html += '<button class="rb-itab '+(_fechSubTab==='pagar'?'rb-itab-active':'')+'" onclick="switchFechSubTab(\'pagar\')" style="'+(_fechSubTab==='pagar'?'color:#ef4444;border-color:rgba(239,68,68,.35);':'')+'">📤 A Pagar ('+secPagar.length+')</button>';
  html += '<button class="rb-itab '+(_fechSubTab==='receber'?'rb-itab-active':'')+'" onclick="switchFechSubTab(\'receber\')" style="'+(_fechSubTab==='receber'?'color:#10b981;border-color:rgba(16,185,129,.35);':'')+'">📥 A Receber ('+secReceber.length+')</button>';
  html += '</div>';

  // ── Section renderer ──
  function renderSection(sectionItems, label, accentClr, bgClr, colLabel){
    if(!sectionItems.length) return '';
    let h = '';

    // Section header bar
    const secPend = sectionItems.reduce((s,e) => {
      const cls = getSettlementStatus(e).cls;
      return s + (cls === 'em-aberto' ? Math.abs(e.pendente) : 0);
    }, 0);
    h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;padding:7px 12px;background:'+bgClr+';border-radius:8px;border-left:3px solid '+accentClr+';">'
      +'<span style="font-size:.65rem;font-weight:800;color:'+accentClr+';">'+label+' ('+sectionItems.length+')</span>'
      +(secPend > 0.01 ? '<span style="font-size:.6rem;color:var(--t3);margin-left:auto;">em aberto: R$ '+fV(secPend,false)+'</span>' : '')
      +'</div>';

    h += '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;margin-bottom:16px;">';
    h += '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">';
    h += '<colgroup><col style="width:22%;"><col style="width:12%;"><col style="width:10%;"><col style="width:13%;"><col style="width:10%;"><col style="width:11%;"><col style="width:10%;"><col style="width:12%;"></colgroup>';
    h += '<thead><tr>';
    h += '<th style="'+ths+'text-align:left;">Agente</th>';
    h += '<th style="'+ths+'text-align:right;">Resultado Semana</th>';
    h += '<th style="'+ths+'text-align:right;">Saldo Ant.</th>';
    h += '<th style="'+ths+'text-align:right;">'+colLabel+'</th>';
    h += '<th style="'+ths+'text-align:right;">Total Pago</th>';
    h += '<th style="'+ths+'text-align:right;">Em Aberto</th>';
    h += '<th style="'+ths+'text-align:center;">Status</th>';
    h += '<th style="'+ths+'text-align:center;">Ação</th>';
    h += '</tr></thead><tbody>';

    let gtRes=0, gtSA=0, gtDev=0, gtPago=0, gtPend=0;
    sectionItems.forEach(s => {
      const st = s._st;
      const saBadge = s.saStatus==='locked'
        ? '<span style="font-size:.48rem;color:#10b981;vertical-align:super;margin-left:1px;">✓</span>'
        : s.saStatus==='provisorio'
          ? '<span style="font-size:.48rem;color:var(--gold);vertical-align:super;margin-left:1px;">⚠</span>' : '';

      gtRes+=s.resultadoSemana; gtSA+=s.saldoAnterior; gtDev+=s.totalDevido; gtPago+=s.pago; gtPend+=s.pendente;

      // Action button with amount
      let actionBtn = '';
      if(st.cls === 'sem-mov') actionBtn = '<span style="color:var(--t3);font-size:.6rem;">—</span>';
      else if(st.cls === 'quitado') actionBtn = '<span style="color:#10b981;font-size:.68rem;font-weight:700;">✓ Quitado</span>';
      else if(st.cls === 'credito'){
        const amt = fV(s.pendente,false);
        actionBtn = '<span style="display:inline-block;background:rgba(168,139,250,.1);border:1px solid rgba(168,139,250,.2);color:#a78bfa;padding:4px 7px;border-radius:5px;font-size:.52rem;font-weight:700;white-space:nowrap;">🔄 Crédito R$ '+amt+'</span>';
      } else {
        const sid = s.id.replace(/'/g,"\\'");
        const amt = fV(s.pendente,false);
        if(s.pendente < -0.01)
          actionBtn = '<button onclick="abrirPagFechamento(\''+sid+'\')" style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:4px 7px;border-radius:5px;font-size:.52rem;font-weight:700;cursor:pointer;white-space:nowrap;">💳 Pagar R$ '+amt+'</button>';
        else
          actionBtn = '<button onclick="abrirPagFechamento(\''+sid+'\')" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:#10b981;padding:4px 7px;border-radius:5px;font-size:.52rem;font-weight:700;cursor:pointer;white-space:nowrap;">💰 Receber R$ '+amt+'</button>';
      }

      // Entity cell
      h += '<tr style="border-bottom:1px solid var(--b1);" id="fech-row-'+rowIdx+'">';
      if(isAg && s._players && s._players.length > 0){
        h += '<td style="padding:7px 8px;border-bottom:1px solid var(--b1);overflow:hidden;cursor:pointer;" onclick="toggleFechAccordion('+rowIdx+')">'
          +'<div style="display:flex;align-items:center;gap:4px;">'
          +'<span id="fech-chevron-'+rowIdx+'" style="font-size:.55rem;color:var(--t3);transition:transform .2s;">▶</span>'
          +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:600;font-size:.74rem;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+s.nome+'</div>'
          +'<div style="font-size:.5rem;color:var(--t3);">'+s._players.length+' jogadores</div>'
          +'</div></div></td>';
      } else {
        const subLbl = isAg ? 'Agente' : 'Direto'+(s.agencia?' · '+s.agencia:'');
        h += '<td style="padding:7px 8px;border-bottom:1px solid var(--b1);overflow:hidden;">'
          +'<div style="font-weight:600;font-size:.74rem;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+s.nome+'</div>'
          +'<div style="font-size:.52rem;color:var(--t3);">'+subLbl+'</div></td>';
      }
      h += '<td style="'+rs+'text-align:right;color:'+clr(s.resultadoSemana)+';">'+fV(s.resultadoSemana,false)+'</td>';
      h += '<td style="'+rs+'text-align:right;color:'+clr(s.saldoAnterior)+';">'+(Math.abs(s.saldoAnterior)>0.01?fV(s.saldoAnterior,false):'—')+saBadge+'</td>';
      h += '<td style="'+rs+'text-align:right;font-weight:700;color:'+accentClr+';">'+(Math.abs(s.totalDevido)>0.01?fV(s.totalDevido,false):'—')+'</td>';
      h += '<td style="'+rs+'text-align:right;color:'+(Math.abs(s.pago)>0.01?clr(s.pago):'var(--t3)')+';">'+(Math.abs(s.pago)>0.01?fV(s.pago,false):'—')+'</td>';
      const _emAbVal = st.cls === 'credito'
        ? fV(s.pendente, false)
        : Math.abs(s.pendente) > 0.01 ? fV(s.pendente, false) : '—';
      h += '<td style="'+rs+'text-align:right;font-weight:700;color:'+st.color+';">'+_emAbVal+'</td>';
      h += '<td style="padding:7px 4px;text-align:center;border-bottom:1px solid var(--b1);"><span style="display:inline-block;background:'+st.bg+';border:1px solid '+st.border+';color:'+st.color+';padding:2px 6px;border-radius:5px;font-size:.52rem;font-weight:700;white-space:nowrap;">'+st.label+'</span></td>';
      h += '<td style="padding:6px 4px;text-align:center;border-bottom:1px solid var(--b1);">'+actionBtn+'</td>';
      h += '</tr>';

      // Accordion — histórico de pagamentos
      if(isAg && s._players && s._players.length > 0){
        const _allData = getFinData();
        const _hist = (_allData[finKey()]?.[s.id]?.historico || [])
          .slice().sort((a,b) => (a.ts||0) - (b.ts||0));
        let _histHtml = '';
        if(!_hist.length){
          _histHtml = '<div style="padding:8px 0;font-size:.7rem;color:var(--t3);font-style:italic;">Nenhum pagamento registrado.</div>';
        } else {
          _hist.forEach(h2 => {
            const _dt = new Date(h2.ts||0);
            const _ds = _dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
            const _isIn = h2.dir === 'in';
            const _clr  = _isIn ? '#10b981' : '#60a5fa';
            const _sgn  = _isIn ? '+' : '−';
            _histHtml += '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);">'
              +'<span style="font-size:.62rem;color:var(--t3);min-width:46px;">'+_ds+'</span>'
              +'<span style="font-size:.62rem;color:var(--t3);flex:1;">'+((h2.origem||h2.metodo||'—')+(h2.comp?' · '+h2.comp:''))+'</span>'
              +'<span style="font-family:\'JetBrains Mono\',monospace;font-size:.7rem;font-weight:700;color:'+_clr+';">'+_sgn+' R$ '+fV(h2.valor,false)+'</span>'
              +'</div>';
          });
        }
        const _totalPago = s.pago;
        const _stAcc     = getSettlementStatus(s);
        const _isCredito = _stAcc.cls === 'credito';
        const _emAbertoAmt = s.pendente;
        const _emAbertoLbl = _isCredito ? '🔄 Crédito' : '⏳ Em Aberto';
        const _emAbertoClr = _isCredito ? '#a78bfa'    : '#ef4444';
        const _emAbertoBg  = _isCredito ? 'rgba(168,139,250,.06)' : 'rgba(239,68,68,.06)';
        const _emAbertoBrd = _isCredito ? 'rgba(168,139,250,.12)' : 'rgba(239,68,68,.12)';
        const _emAbertoStr = _isCredito
          ? 'R$ '+fV(_emAbertoAmt,false)+' a devolver'
          : (Math.abs(_emAbertoAmt)>0.01?'R$ '+fV(_emAbertoAmt,false):'✓ Zerado');
        h += '<tr id="fech-accordion-'+rowIdx+'" style="display:none;">';
        h += '<td colspan="8" style="padding:0;background:var(--s2);border-bottom:1px solid var(--b1);">';
        h += '<div style="padding:8px 16px 10px 28px;">'
          +'<div style="font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:8px;">📋 Histórico de Pagamentos</div>'
          +_histHtml
          +'<div style="display:flex;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid var(--b1);">'
          +'<div style="flex:1;background:'+(_totalPago>=0?'rgba(16,185,129,.06)':'rgba(239,68,68,.06)')+';border:1px solid '+(_totalPago>=0?'rgba(16,185,129,.12)':'rgba(239,68,68,.12)')+';border-radius:7px;padding:7px 12px;">'
          +'<div style="font-size:.5rem;color:var(--t3);margin-bottom:2px;">✅ Total Pago</div>'
          +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:.8rem;font-weight:700;color:'+clr(_totalPago)+';">'+(Math.abs(_totalPago)>0.01?fV(_totalPago,false):'—')+'</div></div>'
          +'<div style="flex:1;background:'+_emAbertoBg+';border:1px solid '+_emAbertoBrd+';border-radius:7px;padding:7px 12px;">'
          +'<div style="font-size:.5rem;color:var(--t3);margin-bottom:2px;">'+_emAbertoLbl+'</div>'
          +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:.8rem;font-weight:700;color:'+_emAbertoClr+';">'+_emAbertoStr+'</div></div>'
          +'</div></div></td></tr>';
      }

      rowIdx++;
    });

    // Section total row
    h += '<tr style="background:var(--s2);">';
    h += '<td style="padding:9px 8px;font-weight:800;font-size:.74rem;color:var(--t1);">TOTAL</td>';
    h += '<td style="'+trs+'text-align:right;color:'+clr(gtRes)+';">'+fV(gtRes,false)+'</td>';
    h += '<td style="'+trs+'text-align:right;color:'+clr(gtSA)+';">'+(Math.abs(gtSA)>0.01?fV(gtSA,false):'—')+'</td>';
    h += '<td style="'+trs+'text-align:right;color:'+accentClr+';">'+(Math.abs(gtDev)>0.01?fV(gtDev,false):'—')+'</td>';
    h += '<td style="'+trs+'text-align:right;color:'+clr(gtPago)+';">'+(Math.abs(gtPago)>0.01?fV(gtPago,false):'—')+'</td>';
    h += '<td style="'+trs+'text-align:right;color:'+(Math.abs(gtPend)>0.01?'var(--red)':'#10b981')+';">'+(Math.abs(gtPend)>0.01?fV(gtPend,false):'✓ Zerado')+'</td>';
    h += '<td colspan="2" style="padding:9px 8px;text-align:center;font-size:.52rem;color:var(--t3);">'+sectionItems.length+' entidade'+(sectionItems.length!==1?'s':'')+'</td>';
    h += '</tr>';
    h += '</tbody></table></div>';
    return h;
  }

  // ── Render active sub-tab ──
  if(!subData.length){
    html += '<div class="cs" style="padding:30px;"><div class="ci">✅</div><h3>Sem entidades nesta seção</h3><p style="color:var(--t3);font-size:.78rem;">Troque a sub-aba ou verifique os dados.</p></div>';
  } else if(!items.length){
    html += '<div class="cs" style="padding:30px;"><div class="ci">🔍</div><h3>Nenhuma entidade encontrada</h3><p style="color:var(--t3);font-size:.78rem;">Ajuste filtros ou busca</p></div>';
  } else {
    const subLabel  = _fechSubTab === 'pagar' ? '📤 A Pagar'   : '📥 A Receber';
    const subColor  = _fechSubTab === 'pagar' ? '#ef4444'       : '#10b981';
    const subBg     = _fechSubTab === 'pagar' ? 'rgba(239,68,68,.04)' : 'rgba(16,185,129,.04)';
    const subColLbl = _fechSubTab === 'pagar' ? 'Total Devido'  : 'Total a Receber';
    html += renderSection(items, subLabel, subColor, subBg, subColLbl);
  }

  container.innerHTML = html;
}

function abrirPagFechamento(entityId){
  abrirModalPagamento(entityId);
}

function toggleFechAccordion(idx){
  const row = document.getElementById('fech-accordion-'+idx);
  const chevron = document.getElementById('fech-chevron-'+idx);
  if(!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : '';
  if(chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
}

function toggleAgentDirect(agKey){
  if(agentDirect[agKey]){
    unmarkAgentDirect(agKey);
  } else {
    markAgentDirect(agKey);
  }
}

function addDirectFromSelect(){
  const sel = document.getElementById('rb-direct-add-sel');
  if(!sel || !sel.value) return;
  markAgentDirect(sel.value);
}

function markAgentDirect(agKey){
  showConfirmModal(
    '👤 Marcar como Direto',
    `Marcar <strong>${agKey}</strong> como acerto direto?<br><br><span style="font-size:.75rem;color:var(--t3);">Os jogadores desta agência serão fechados individualmente, cada um com seu próprio % de RB.</span>`,
    () => {
      agentDirect[agKey] = true;
      saveAgentDirect();
      showToast('👤 ' + agKey + ' → acerto direto (jogadores individuais)');
      renderRakebackTab();
      renderFechamentos();
      if(typeof renderAgentClosing==='function') renderAgentClosing();
    }
  );
}

function unmarkAgentDirect(agKey){
  showConfirmModal(
    '🤝 Remover Acerto Direto',
    `Tem certeza que quer remover <strong>${agKey}</strong> do acerto direto?<br><br><span style="font-size:.75rem;color:var(--t3);">Voltará ao fechamento via agente, com % único para toda a agência.</span>`,
    () => {
      delete agentDirect[agKey];
      saveAgentDirect();
      showToast('🤝 ' + agKey + ' voltou para acerto via agente');
      renderRakebackTab();
      renderFechamentos();
      if(typeof renderAgentClosing==='function') renderAgentClosing();
    }
  );
}
// ══════════════════ LANÇAMENTOS (OVERLAY + PER-CLUB) ══════════════════
window.overlayGlobal = DataLayer.getOverlay();
window.overlayClubes = DataLayer.getOverlayClubes();
const clubManual  = DataLayer.getClubManual();

function saveOverlay(){ DataLayer.saveOverlay(overlayGlobal); }
function saveOverlayClubes(){ DataLayer.saveOverlayClubes(overlayClubes); }
function saveClubManual(){ DataLayer.saveClubManual(clubManual); }

function getOverlayClubesList(){ return overlayClubes || [...CLUBS]; }
function getOverlayPerClub(clube){
  clube = clube || activeClube;
  const sel = getOverlayClubesList();
  if(!sel.length || overlayGlobal === 0) return 0;
  if(clube && !sel.includes(clube)) return 0;
  return overlayGlobal / sel.length;
}

// ── Financeiro core + Pagamentos ──

function getFinData(){ return DataLayer.getFinData(); }
function saveFinData(d){ DataLayer.saveFinData(d); }
function getPayMethods(){ return DataLayer.getPayMethodsAlt(); }
function savePayMethods(arr){ DataLayer.savePayMethodsAlt(arr); }

function finKey(){ return activeClube + '||' + (weeks[selWeekIdx]||'0'); }

// ── Helpers matemáticos (rbValor e resPlayer ficam no HTML) ──
function rbValor(rakeGerado, pct){ return n(rakeGerado) * (n(pct)/100); }
function resPlayer(ganhos, rakeGerado, pctPlayer, ajustes){
  // GGR (ajustes/rodeio) é receita do CLUBE, não entra no acerto com agentes
  return n(ganhos) + rbValor(rakeGerado, pctPlayer);
}

function calcFinEntities(){
  if(!activeClube) return [];
  const cp   = allPlayers.filter(p=>p.clube===activeClube);
  const week = weeks[selWeekIdx]||'0';
  const entities = [];

  // AGENTES
  const agentMap = {};
  cp.forEach(p=>{
    const raw = (p.aname||'').trim();
    const k = (!raw || /^(none|null|undefined)$/i.test(raw)) ? '(sem agente)' : raw;
    if(!agentMap[k]) agentMap[k]=[];
    agentMap[k].push(p);
  });

  Object.entries(agentMap).forEach(([agKey, allPlInAgent])=>{
    // Se agência inteira é "direto", pula do agrupamento por agente
    if(agentDirect[agKey]) return;
    // Filtra jogadores com flag individual de "direto"
    const players = allPlInAgent.filter(p => !playerDirect[p.id]);
    if(!players.length) return;

    const ganhosTime  = players.reduce((s,p)=>s+n(p.ganhos),0);
    const ajustesTime = players.reduce((s,p)=>s+n(p.ggr),0);
    const rakeTime    = players.reduce((s,p)=>s+n(p.rake),0);

    const cfg        = agentRB[agKey] || {};
    const pctAgente  = getAgentPctAgente(agKey); // snapshot-aware
    const avista     = !!cfg.avista;

    const rbAgente   = calcAgentRB(agKey, players);

    // Resultado do time: cada player com seu % efetivo (override > padrão agente)
    const totalResPlayers = players.reduce((s,p)=>{
      const pct = getPlayerPctRB(p);
      return s + resPlayer(p.ganhos, p.rake, pct, p.ggr);
    }, 0);

    // % efetivo informativo (média ponderada)
    const rbPlTotal = players.reduce((s,p)=>s+(Number(p.rake)||0)*getPlayerPctRB(p)/100, 0);
    const pctPlayer = rakeTime > 0 ? (rbPlTotal / rakeTime * 100) : 0;

    const resultadoFinal = ganhosTime + rbAgente;
    const valor = -resultadoFinal;

    entities.push({
      id: makeEntityId('ag', agKey),
      tipo: 'agente', nome: agKey,
      ganhos: ganhosTime, ggr: ajustesTime, rakeGerado: rakeTime,
      pctAgente, pctPlayer, rbAgente,
      resultadoFinal, valor,
      semana: week, clube: activeClube,
      // compatibilidade legada
      rake: rakeTime, pct: pctAgente, rbVal: rbAgente, avista
    });
  });

  // JOGADORES DIRETOS (flag individual + agências marcadas como "direto")
  cp.filter(p => isPlayerDirectSettlement(p.id, (p.aname||'').trim())).forEach(p=>{
    const pctP   = getPlayerPctRB(p);
    const rbP    = rbValor(p.rake, pctP);
    const res    = resPlayer(p.ganhos, p.rake, pctP, p.ggr);
    entities.push({
      id: makeEntityId('pl', p.id||p.nick),
      tipo: 'jogador', nome: p.nick||p.id,
      ganhos: n(p.ganhos), ggr: n(p.ggr), rakeGerado: n(p.rake),
      pctAgente: pctP, pctPlayer: pctP, rbAgente: rbP,
      resultadoFinal: res, valor: -res,
      semana: week, clube: activeClube,
      rake: n(p.rake), pct: pctP, rbVal: rbP, avista: false
    });
  });

  return entities;
}

// ── getSaldoAnterior: delega para DataLayer.getSaldoAnterior ──
// Hierarquia: pm_saldo_prev → pm_finSnapshot → pm_fin.saldoAberto (legado)
function getSaldoAnterior(entityId){
  return DataLayer.getSaldoAnterior(
    entityId,
    activeClube,
    weeks[selWeekIdx],
    selWeekIdx,
    weeks
  );
}

// ── Carry automático: Fechar Semana Financeiro ──────────────────
// getPrevMap/savePrevMap removidos — acesso ao pm_saldo_prev
// agora centralizado em DataLayer.getSaldoAnterior / DataLayer.setCarryForEntity

function fecharSemanaFinanceiro(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  const entities = calcFinEntities();
  if(!entities.length){ showToast('⚠️ Importe dados primeiro','e'); return; }

  const currentWeek = weeks[selWeekIdx];
  const nextIdx     = selWeekIdx + 1;
  const nextWeek    = weeks[nextIdx];

  if(!nextWeek){
    showToast('⚠️ Não há semana seguinte para propagar o carry','e');
    return;
  }

  if(!confirm('Fechar semana financeiro?\n\nIsso vai salvar o saldo de cada entidade como carry para a próxima semana ('+fWL(nextWeek)+').\n\nNão altera dados anteriores.')) return;

  let cnt = 0;

  entities.forEach(e => {
    const saldoPrev  = getSaldoAnterior(e.id);
    const ledger     = getEntityLedgerNet(e.id);
    const resultSem  = -(e.valor);
    // FÓRMULA CANÔNICA: saldoAtual = saldoAnterior + resultado − ledgerNet
    const saldoAtual = FinanceEngine.calcSaldoAtual(saldoPrev, resultSem, ledger.net);

    if(Math.abs(saldoAtual) > 0.01){
      DataLayer.setCarryForEntity(e.id, activeClube, nextWeek, saldoAtual);
      cnt++;
    }
  });

  showToast('✅ Semana financeira fechada — '+cnt+' saldo'+(cnt!==1?'s':'')+' propagado'+(cnt!==1?'s':'')+' para '+fWL(nextWeek));
  renderFinanceiro();
}

// ── Helpers centrais de movimentação ──────────────────────────
// dir: "in"  = jogador/agente PAGOU ao clube   (soma +)
//      "out" = clube PAGOU ao jogador/agente   (soma −)

function addMov(entityId, valor, metodo, dir, extra){
  const allData = getFinData();
  const key = finKey();
  if(!allData[key]) allData[key] = {};
  if(!allData[key][entityId]) allData[key][entityId] = { historico:[], saldoAberto:0 };
  allData[key][entityId].historico.push({
    valor, metodo, dir,
    source: extra?.source || 'manual',
    conciliado: extra?.conciliado || false,
    ts: Date.now(),
    ...extra
  });
  saveFinData(allData);
}

function getMovTotal(entityId){
  // Delegado para getEntityLedgerNet (função canônica)
  return getEntityLedgerNet(entityId).net;
}

// ── getEntityLedgerNet: delega para FinanceEngine.calcLedgerNet ──
// Retorna { entradas, saidas, net } para uma entidade na semana ativa
function getEntityLedgerNet(entityId){
  const allData = getFinData();
  const key = finKey();
  const hist = allData[key]?.[entityId]?.historico || [];
  const result = FinanceEngine.calcLedgerNet(hist);
  if (window.DEBUG_FINANCE) console.log('[ledger] ' + entityId + ' entradas=' + result.entradas + ' saidas=' + result.saidas + ' net=' + result.net);
  return result;
}

function getTotalPago(entityId){
  const allData = getFinData();
  const key = finKey();
  const ent  = allData[key]?.[entityId];
  if(!ent || !ent.historico) return 0;
  return FinanceEngine.calcLedgerNet(ent.historico).net;
}

function setSaldoAberto(entityId, saldo){
  const allData = getFinData();
  const key     = finKey();
  if(!allData[key]) allData[key] = {};
  if(!allData[key][entityId]) allData[key][entityId] = { historico: [], saldoAberto: 0 };
  allData[key][entityId].saldoAberto = saldo;
  saveFinData(allData);
}

let _finModalEntity = null;

let _finFilter = 'todos';
let _finSearch = '';
let _finSort = 'devedores'; // devedores | credores | nome | status
let _activeFinTab = 'agencias';
function switchFinTab(tab){ _activeFinTab = tab; renderFinanceiro(); }

function setFinFilter(filter){
  _finFilter = filter;
  renderFinanceiro();
}

// getEntityStatus — delega para FinanceEngine.determineStatus
// Usa FÓRMULA CANÔNICA: saldoAt = saldoAnterior + resultado − ledgerNet
function getEntityStatus(e){
  const saldoPrev  = getSaldoAnterior(e.id);
  const resultSem  = -(e.valor);   // e.valor = -resultado
  const ledger     = getEntityLedgerNet(e.id);
  const saldoAt    = FinanceEngine.calcSaldoAtual(saldoPrev, resultSem, ledger.net);

  // historico para contagem de pagamentos
  const allData = getFinData();
  const hist = allData[finKey()]?.[e.id]?.historico || [];
  const status = FinanceEngine.determineStatus(saldoAt, hist);
  if (window.DEBUG_FINANCE) console.log('[status] ' + e.id + ' saldoPrev=' + saldoPrev + ' resultSem=' + resultSem + ' ledgerNet=' + ledger.net + ' saldoAt=' + saldoAt + ' → ' + status);
  return status;
}


let _finSearchTimer = null;
function setFinSearch(q){
  _finSearch = q.toLowerCase().trim();
  clearTimeout(_finSearchTimer);
  _finSearchTimer = setTimeout(() => {
    const prev = document.activeElement;
    const wasSearch = prev && prev.classList.contains('fin-search');
    const cursorPos = wasSearch ? prev.selectionStart : 0;
    renderFinanceiro();
    if(wasSearch){
      const inp = document.querySelector('.fin-search');
      if(inp){ inp.focus(); inp.setSelectionRange(cursorPos, cursorPos); }
    }
  }, 200);
}

// ════════════════════════════════════════════════════════════
// computeFinanceKPIs()
//   Profit/Loss       = Σ ganhos de todos os jogadores do clube
//   Rakeback Distrib. = Σ (rake_i × pctRB_i / 100) — snapshot-aware
//   Recebido Semana   = Σ mov dir="in"  (entradas no ledger)
//   Pago Semana       = Σ mov dir="out" (saídas no ledger, sempre positivo)
//   Saldo Final       = SaldoAnterior_Líq + (P/L + RB) + (Recebido − Pago)
// ════════════════════════════════════════════════════════════
function computeFinanceKPIs(){
  if(!activeClube) return { profitLoss:0, rakeback:0, recebido:0, pago:0, saldoAnteriorLiq:0, saldoFinal:0, badge:'quitado' };

  const cp = allPlayers.filter(p => p.clube === activeClube);

  // 1) Profit / Loss = soma dos ganhos brutos (perspectiva do clube)
  const profitLoss = cp.reduce((s,p) => s + (Number(p.ganhos)||0), 0);

  // 2) Rakeback Distribuído = soma de RB Agente por agente
  const agMap = {};
  cp.forEach(p => { const k = (p.aname||'').trim()||'(sem agente)'; if(!agMap[k]) agMap[k]=[]; agMap[k].push(p); });
  const rakeback = Object.entries(agMap).reduce((s,[agKey,pls]) => s + calcAgentRB(agKey, pls), 0);

  // 3 e 4) Recebido / Pago via getEntityLedgerNet (fonte única)
  const entities = calcFinEntities();
  let recebido = 0, pago = 0, saldoAnteriorLiq = 0, ledgerNetTotal = 0;
  entities.forEach(e => {
    const ledger = getEntityLedgerNet(e.id);
    recebido       += ledger.entradas;
    pago           += ledger.saidas;
    ledgerNetTotal += ledger.net;
    saldoAnteriorLiq += getSaldoAnterior(e.id);
  });

  // FÓRMULA CANÔNICA: saldoFinal = saldoAnterior + resultadoSemana − ledgerNet
  const saldoFinal = FinanceEngine.calcSaldoAtual(saldoAnteriorLiq, profitLoss + rakeback, ledgerNetTotal);

  const badge = Math.abs(saldoFinal) < 0.01 ? 'quitado'
    : saldoFinal > 0 ? 'receber' : 'pagar';

  return { profitLoss, rakeback, recebido, pago, saldoAnteriorLiq, saldoFinal, badge };
}

// ── Staged panel for Financeiro (Pendentes de Aplicação) ──────
function _renderStagedPanel(){
  const staged = getWeekStaged();
  const pending = staged.filter(s=>s.status==='staged');
  if(!pending.length) return '';

  const entities = calcFinEntities();
  const wkLock = isWeekLocked();
  const totalIn  = pending.filter(s=>s.dir==='in').reduce((s,x)=>s+x.amount,0);
  const totalOut = pending.filter(s=>s.dir==='out').reduce((s,x)=>s+x.amount,0);

  let rows = pending.map(s=>{
    const e = entities.find(x=>x.id===s.entityId);
    const nome = e ? e.nome : s.entityId;
    const ico = s.dir==='in' ? '↓' : '↑';
    const dirCls = s.dir==='in' ? 'color:#10b981;' : 'color:#60a5fa;';
    const dirTxt = s.dir==='in' ? 'Entrada' : 'Saída';
    const metIco = s.method==='chippix' ? '🎰' : s.method==='ofx' ? '🏦' : '📝';
    const sid = s.id.replace(/'/g,"\\'");
    const dt = new Date(s.createdAt);
    const datStr = dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

    const btns = wkLock
      ? '<span style="color:var(--t3);font-size:.65rem;">🔒</span>'
      : '<button class="btn-sm" onclick="applyStagedAndRefresh(\''+sid+'\')" style="font-size:.62rem;background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.25);color:#10b981;padding:3px 8px;">✓ Aplicar</button>'
      + '<button class="btn-sm" onclick="openEditStaged(\''+sid+'\')" style="font-size:.62rem;background:rgba(96,165,250,.1);border-color:rgba(96,165,250,.25);color:#60a5fa;padding:3px 8px;">✏️</button>'
      + '<button class="btn-sm" onclick="rejectStagedAndRefresh(\''+sid+'\')" style="font-size:.62rem;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.25);color:#ef4444;padding:3px 8px;">✕</button>';

    return '<tr>'
      + '<td><div style="font-weight:600;font-size:.76rem;">'+nome+'</div><div style="font-size:.6rem;color:var(--t3);">'+datStr+'</div></td>'
      + '<td style="text-align:center;"><span class="fd-dir '+(s.dir==='out'?'out':'in')+'" style="display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:6px;font-size:.72rem;">'+ico+'</span><div style="font-size:.55rem;'+dirCls+'">'+dirTxt+'</div></td>'
      + '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:700;'+dirCls+'font-size:.8rem;">'+(s.dir==='in'?'+':'-')+'R$ '+fV(s.amount,false)+'</td>'
      + '<td style="text-align:left;font-family:inherit;">'+metIco+' <span style="font-size:.65rem;color:var(--t3);">'+s.method+'</span></td>'
      + '<td style="max-width:180px;font-size:.62rem;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-family:inherit;">'+s.description+'</td>'
      + '<td style="text-align:right;"><div style="display:flex;gap:4px;justify-content:flex-end;">'+btns+'</div></td>'
      + '</tr>';
  }).join('');

  return '<div style="background:rgba(251,191,36,.04);border:1px solid rgba(251,191,36,.15);border-radius:10px;padding:14px 16px;margin-bottom:14px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    + '<div style="font-size:.78rem;font-weight:700;color:#fbbf24;">📌 Pendentes de Aplicação <span style="font-weight:400;font-size:.66rem;color:var(--t3);">('+pending.length+')</span></div>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<span style="font-size:.62rem;color:#10b981;">▲ R$ '+fV(totalIn,false)+'</span>'
    + '<span style="font-size:.62rem;color:#60a5fa;">▼ R$ '+fV(totalOut,false)+'</span>'
    + (wkLock ? '' : '<button class="btn-sm" onclick="applyAllStaged()" style="font-size:.62rem;background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.25);color:#10b981;padding:4px 10px;">✅ Aplicar Todos ('+pending.length+')</button>')
    + '</div></div>'
    + '<table class="tbl" style="margin:0;"><thead><tr>'
    + '<th>Entidade</th><th style="text-align:center;">Dir</th><th style="text-align:right;">Valor</th><th>Método</th><th>Descrição</th><th style="text-align:right;">Ações</th>'
    + '</tr></thead><tbody>'+rows+'</tbody></table>'
    + '</div>';
}

function applyStagedAndRefresh(stagedId){
  if(applyStagedMovement(stagedId)){
    showToast('✅ Lançamento aplicado ao ledger');
    renderFinanceiro();
    renderAgentClosing();
    if(typeof renderConcChipPix==='function') renderConcChipPix();
  }
}

function rejectStagedAndRefresh(stagedId){
  if(!confirm('Rejeitar este lançamento?\nEle não será aplicado ao ledger.')) return;
  rejectStagedMovement(stagedId);
  showToast('🚫 Lançamento rejeitado');
  renderFinanceiro();
  if(typeof renderConcChipPix==='function') renderConcChipPix();
}

function openEditStaged(stagedId){
  const all = getStaged();
  const sm = all.find(s=>s.id===stagedId);
  if(!sm) return;

  const entities = calcFinEntities();
  const entOpts = entities.map(e=>'<option value="'+e.id+'" '+(e.id===sm.entityId?'selected':'')+'>'+e.nome+'</option>').join('');

  const content = '<div style="display:flex;flex-direction:column;gap:12px;">'
    + '<div><label style="font-size:.68rem;color:var(--t3);display:block;margin-bottom:4px;">Entidade</label>'
    + '<select id="stg-edit-ent" class="conc-entity-sel" style="width:100%;font-size:.76rem;">'+entOpts+'</select></div>'
    + '<div style="display:flex;gap:10px;">'
    + '<div style="flex:1;"><label style="font-size:.68rem;color:var(--t3);display:block;margin-bottom:4px;">Direção</label>'
    + '<select id="stg-edit-dir" class="conc-entity-sel" style="width:100%;font-size:.76rem;">'
    + '<option value="in" '+(sm.dir==='in'?'selected':'')+'>↓ Entrada</option>'
    + '<option value="out" '+(sm.dir==='out'?'selected':'')+'>↑ Saída</option></select></div>'
    + '<div style="flex:1;"><label style="font-size:.68rem;color:var(--t3);display:block;margin-bottom:4px;">Valor (R$)</label>'
    + '<input id="stg-edit-val" type="number" step="0.01" value="'+sm.amount.toFixed(2)+'" style="width:100%;background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:7px 10px;border-radius:8px;font-size:.76rem;"></div></div>'
    + '<div><label style="font-size:.68rem;color:var(--t3);display:block;margin-bottom:4px;">Descrição</label>'
    + '<input id="stg-edit-desc" type="text" value="'+sm.description.replace(/"/g,'&quot;')+'" style="width:100%;background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:7px 10px;border-radius:8px;font-size:.76rem;"></div>'
    + '</div>';

  window._editStagedId = stagedId;
  document.getElementById('mextrato-body').innerHTML = content;
  document.querySelector('#mExtratoPag .modal-title').textContent = '✏️ Editar Lançamento Pendente';
  document.querySelector('#mExtratoPag .ma').innerHTML = '<button class="btn-primary" onclick="saveEditStaged()">💾 Salvar</button> <button class="btn-cancel" onclick="closeM(\'mExtratoPag\')">Cancelar</button>';
  openM('mExtratoPag');
}

function saveEditStaged(){
  const sid = window._editStagedId;
  if(!sid) return;
  editStagedMovement(sid, {
    entityId: document.getElementById('stg-edit-ent').value,
    dir: document.getElementById('stg-edit-dir').value,
    amount: parseFloat(document.getElementById('stg-edit-val').value)||0,
    description: document.getElementById('stg-edit-desc').value
  });
  closeM('mExtratoPag');
  showToast('✏️ Lançamento editado');
  renderFinanceiro();
}

function renderFinanceiro(){
  const el = document.getElementById('fin-content');
  if(!el) return;
  const entities = calcFinEntities();
  if(!entities.length){
    el.innerHTML='<div class="cs"><div class="ci">📂</div><h3>Importe a planilha primeiro</h3><p>Configure agentes na aba Comprovantes e marque jogadores como Acerto Direto na aba Jogadores.</p></div>';
    return;
  }

  const allData = getFinData();
  const key = finKey();

  // ── Compute all entity data ──
  const rows = entities.map(e => {
    const saldoPrev  = getSaldoAnterior(e.id);
    const ledger     = getEntityLedgerNet(e.id);
    const movTotal   = ledger.net;
    const resultSem  = -(e.valor);
    const saldoAt    = FinanceEngine.calcSaldoAtual(saldoPrev, resultSem, movTotal);
    const status     = getEntityStatus(e);
    const hist       = allData[key]?.[e.id]?.historico || [];
    return { ...e, saldoPrev, movTotal, resultSem, saldoAt, status, hist, entradas: ledger.entradas, saidas: ledger.saidas };
  }).filter(r => r.status !== 'neutro');

  // ── KPIs via computeFinanceKPIs() ──
  const kpi = computeFinanceKPIs();

  // ── Split por tipo ──
  const agentRows  = rows.filter(r => r.tipo === 'agente');
  const playerRows = rows.filter(r => r.tipo !== 'agente');
  const tabRows    = _activeFinTab === 'agencias' ? agentRows : playerRows;

  // ── Filter & sort ──
  let filtered = tabRows;
  if(_finFilter !== 'todos') filtered = filtered.filter(r => r.status === _finFilter);
  if(_finSearch) filtered = filtered.filter(r => r.nome.toLowerCase().includes(_finSearch));

  // Sort: most negative first by default
  filtered.sort((a,b) => {
    if(_finSort === 'devedores') return a.saldoAt - b.saldoAt;
    if(_finSort === 'credores')  return b.saldoAt - a.saldoAt;
    if(_finSort === 'nome')      return a.nome.localeCompare(b.nome);
    const so = {aberto:0, parcial:1, pago:2};
    return (so[a.status]||0) - (so[b.status]||0);
  });

  const countByStatus = { todos: tabRows.length, aberto:0, parcial:0, pago:0 };
  tabRows.forEach(r => { if(countByStatus[r.status] !== undefined) countByStatus[r.status]++; });

  // Badge do saldo final
  const badgeMap = {
    receber: { txt:'A RECEBER', bg:'rgba(16,185,129,.1)', border:'rgba(16,185,129,.25)', color:'#10b981' },
    pagar:   { txt:'A PAGAR',   bg:'rgba(239,68,68,.1)',  border:'rgba(239,68,68,.25)',  color:'#ef4444' },
    quitado: { txt:'QUITADO',   bg:'rgba(240,180,41,.1)', border:'rgba(240,180,41,.25)', color:'var(--gold)' }
  };
  const bdg = badgeMap[kpi.badge] || badgeMap.quitado;

  el.innerHTML = `
    <!-- KPI Strip -->
    <div class="fkpi-strip">
      <div class="fkpi ${kpi.profitLoss > 0 ? 'green' : kpi.profitLoss < 0 ? 'red' : ''}">
        <div class="fkpi-lbl"><span style="font-size:.7rem;">📊</span> Profit / Loss</div>
        <div class="fkpi-val" style="color:${clr(kpi.profitLoss)};">R$ ${fV(kpi.profitLoss,false)}</div>
        <div class="fkpi-sub">Σ Percas e ganhos</div>
      </div>
      <div class="fkpi purple">
        <div class="fkpi-lbl"><span style="font-size:.7rem;">💸</span> Rakeback Distribuído</div>
        <div class="fkpi-val" style="color:#a78bfa;">${kpi.rakeback > 0.01 ? 'R$ '+fV(kpi.rakeback,false) : '—'}</div>
        <div class="fkpi-sub">Σ RB Agentes</div>
      </div>
      <div class="fkpi blue">
        <div class="fkpi-lbl"><span style="font-size:.7rem;">📥</span> Recebido na Semana (+)</div>
        <div class="fkpi-val" style="color:#60a5fa;">${kpi.recebido > 0.01 ? 'R$ '+fV(kpi.recebido,false) : '—'}</div>
        <div class="fkpi-sub">Σ Entradas</div>
      </div>
      <div class="fkpi red">
        <div class="fkpi-lbl"><span style="font-size:.7rem;">📤</span> Pago na Semana (−)</div>
        <div class="fkpi-val" style="color:#ef4444;">${kpi.pago > 0.01 ? '−R$ '+fV(kpi.pago,false) : '—'}</div>
        <div class="fkpi-sub">Σ Saídas</div>
      </div>
      <div class="fkpi gold" style="border-color:${bdg.border};">
        <div class="fkpi-lbl"><span style="font-size:.7rem;">🏦</span> Saldo Final</div>
        <div class="fkpi-val" style="color:${bdg.color};">R$ ${fV(kpi.saldoFinal,false)}</div>
        <div class="fkpi-sub" style="margin-top:5px;">
          <span style="display:inline-block;background:${bdg.bg};border:1px solid ${bdg.border};color:${bdg.color};padding:2px 8px;border-radius:5px;font-size:.58rem;font-weight:800;letter-spacing:.5px;">
            ${bdg.txt}
          </span>
          ${Math.abs(kpi.saldoAnteriorLiq) > 0.01
            ? `<span style="font-size:.55rem;color:var(--t3);margin-left:6px;">carry: R$ ${fV(kpi.saldoAnteriorLiq,false)}</span>`
            : ''}
        </div>
        <div class="fkpi-sub" style="margin-top:2px;font-size:.54rem;color:var(--t3);">
          Liquidação (Carry + Semana Atual)
        </div>
      </div>
    </div>

    <!-- Staged / Pendentes Panel -->
    ${_renderStagedPanel()}

    <!-- Sub-tabs Agências | Jogadores -->
    <div style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--b1);padding-bottom:10px;">
      <button class="rb-itab ${_activeFinTab==='agencias'?'rb-itab-active':''}" onclick="switchFinTab('agencias')">🤝 Agências (${agentRows.length})</button>
      <button class="rb-itab ${_activeFinTab==='jogadores'?'rb-itab-active':''}" onclick="switchFinTab('jogadores')">👤 Jogadores (${playerRows.length})</button>
    </div>

    <!-- Controls -->
    <div style="background:rgba(240,180,41,.05);border:1px solid rgba(240,180,41,.12);border-radius:8px;padding:9px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:.72rem;color:var(--gold);">💼 Pagamentos e acertos agora ficam na aba <strong>Fechamentos</strong></span>
      <button onclick="document.querySelectorAll('.dn-item').forEach((i,idx)=>{if(i.textContent.includes('Liquidação')){i.click();}});" style="background:rgba(240,180,41,.1);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:4px 10px;border-radius:6px;font-size:.62rem;font-weight:700;cursor:pointer;">Ir para Liquidação →</button>
    </div>
    <div class="fin-controls">
      <input class="fin-search" type="text" placeholder="Buscar agente..." value="${_finSearch}" oninput="setFinSearch(this.value)">
      <div style="flex:1;"></div>
      <div style="display:flex;gap:5px;">
        <button class="fin-filter-btn ${_finFilter==='todos'?'active':''}" data-filter="todos" onclick="setFinFilter('todos')">Todos <span style="opacity:.5;font-size:.6rem;">${countByStatus.todos}</span></button>
        <button class="fin-filter-btn ${_finFilter==='aberto'?'active':''}" data-filter="aberto" onclick="setFinFilter('aberto')">⏳ Aberto <span style="opacity:.5;font-size:.6rem;">${countByStatus.aberto}</span></button>
        <button class="fin-filter-btn ${_finFilter==='parcial'?'active':''}" data-filter="parcial" onclick="setFinFilter('parcial')">◑ Parcial <span style="opacity:.5;font-size:.6rem;">${countByStatus.parcial}</span></button>
        <button class="fin-filter-btn ${_finFilter==='pago'?'active':''}" data-filter="pago" onclick="setFinFilter('pago')">✅ Quitado <span style="opacity:.5;font-size:.6rem;">${countByStatus.pago}</span></button>
      </div>
    </div>

    <!-- Table -->
    ${filtered.length ? `
    <div class="tw">
    <table class="tbl">
      <thead><tr>
        <th>Agente</th>
        <th style="text-align:right;">Profit/Loss</th>
        <th style="text-align:right;">RB Total</th>
        <th style="text-align:right;">Resultado Final</th>
        <th style="text-align:right;">Pagamentos</th>
        <th style="text-align:right;">Saldo Anterior (Carry)</th>
        <th style="text-align:right;">Saldo</th>
        <th style="text-align:center;">Status</th>
        <th style="text-align:center;">Ações</th>
      </tr></thead>
      <tbody>
        ${filtered.map(r => _renderFinRow(r)).join('')}
      </tbody>
    </table>
    </div>
    <div style="font-size:.65rem;color:var(--t3);margin-top:8px;text-align:right;">${filtered.length} entidade${filtered.length!==1?'s':''} exibida${filtered.length!==1?'s':''}</div>
    ` : `
    <div class="cs" style="padding:40px;">
      <div class="ci">🔍</div>
      <h3>Nenhuma entidade encontrada</h3>
      <p style="color:var(--t3);font-size:.8rem;">Ajuste os filtros ou busca</p>
    </div>`}
  `;
}

function _renderFinRow(r){
  // ── Entity label ──
  const isAgent  = r.tipo === 'agente';
  const rawName  = (r.nome || '').trim();
  const isSemAg  = isAgent && (!rawName || /^(sem agente|\(sem agente\)|none|null|undefined)$/i.test(rawName));
  const ico      = isAgent ? (isSemAg ? '👤' : '🤝') : '👤';
  const icoCls   = isAgent ? (isSemAg ? 'pl' : 'ag') : 'pl';
  const dispNome = isSemAg ? 'Diretos (Sem Agente)' : rawName;
  const subTxt   = isAgent
    ? `Rake ${fV(r.rakeGerado||r.rake,false)} · RB ${r.pctAgente}%`
    : 'Jogador direto';

  // ── Derived columns ──
  // P/L = ganhos agregados (para avista o resultado é apenas RB)
  const profitLoss  = r.ganhos || 0;
  // RB Total = resultSem - ganhos (não-avista) ou resultSem inteiro (avista)
  const rbTotal     = r.avista ? r.resultSem : (r.resultSem - (r.ganhos || 0));
  // Resultado Final = P/L + RB = resultSem (sempre)
  const resultFinal = r.resultSem;
  // Pagamentos = movTotal líquido
  const pagLiq      = r.movTotal;
  // Saldo = saldoPrev + resultFinal + pagamentos (= saldoAt)
  const saldo       = r.saldoAt;

  // ── Colors ──
  const plCor  = clr(profitLoss);
  const rbCor  = Math.abs(rbTotal) < 0.01 ? 'var(--t3)' : '#a78bfa';
  const rfCor  = clr(resultFinal);
  const pgCor  = Math.abs(pagLiq) < 0.01 ? 'var(--t3)' : pagLiq > 0 ? '#10b981' : '#60a5fa';
  const sdCor  = clr(saldo);

  // ── Status pill ──
  const pillMap = { aberto: '⏳ Em Aberto', parcial: '◑ Parcial', pago: '✅ Quitado' };
  const pill = `<span class="fin-pill ${r.status}">${pillMap[r.status]||'—'}</span>`;

  // ── Actions (read-only: history only) ──
  const idSafe = r.id.replace(/'/g,"\\'");
  let actBtns = `<button class="fa-hist" onclick="openHistoryDrawer('${idSafe}')" title="Histórico">📋</button>`;

  const rowCls = r.status === 'pago' ? ' class="fin-pago"' : '';

  return `<tr${rowCls} data-status="${r.status}" data-entity="${r.id}">
    <td>
      <div class="fin-ent">
        <div class="fin-ent-ico ${icoCls}">${ico}</div>
        <div>
          <div class="fin-ent-name">${dispNome}${!isAgent ? '<span style="font-size:.48rem;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px;">DIRETO</span>' : ''}</div>
          <div class="fin-ent-sub">${subTxt}</div>
        </div>
      </div>
    </td>
    <td style="text-align:right;color:${plCor};font-weight:700;">${fV(profitLoss,false)}</td>
    <td style="text-align:right;color:${rbCor};font-weight:700;">${Math.abs(rbTotal)>0.01 ? fV(rbTotal,false) : '—'}</td>
    <td style="text-align:right;color:${rfCor};font-weight:800;">${fV(resultFinal,false)}</td>
    <td style="text-align:right;color:${pgCor};font-weight:700;">${Math.abs(pagLiq)>0.01 ? fV(pagLiq,false) : '—'}</td>
    <td style="text-align:right;color:${clr(r.saldoPrev)};font-weight:700;">${Math.abs(r.saldoPrev)>0.01 ? fV(r.saldoPrev,false) : '—'}</td>
    <td style="text-align:right;color:${sdCor};font-weight:800;">${Math.abs(saldo)<0.01 ? '0,00' : fV(saldo,false)}</td>
    <td style="text-align:center;">${pill}</td>
    <td style="text-align:center;"><div class="fin-act">${actBtns}</div></td>
  </tr>`;
}

// ── History Drawer ──
function openHistoryDrawer(entityId){
  const entities = calcFinEntities();
  const e = entities.find(x => x.id === entityId);
  if(!e) return;

  const saldoPrev = getSaldoAnterior(entityId);
  const ledger    = getEntityLedgerNet(entityId);
  const movTotal  = ledger.net;
  const resultSem = -(e.valor);
  const saldoAt   = saldoPrev + resultSem + movTotal;
  const allData   = getFinData();
  const key       = finKey();
  const hist      = allData[key]?.[entityId]?.historico || [];
  const entradas  = ledger.entradas;
  const saidas    = ledger.saidas;

  const ico = e.tipo === 'agente' ? '🤝' : '👤';
  document.getElementById('fd-title').textContent = `${ico} ${e.nome}`;
  document.getElementById('fd-subtitle').textContent = `Semana ${weeks[selWeekIdx] ? fWL(weeks[selWeekIdx]) : '—'}`;

  const idSafe = entityId.replace(/'/g,"\\'");

  document.getElementById('fd-body').innerHTML = `
    <!-- Summary boxes -->
    <div class="fd-summary"${Math.abs(saldoPrev)>0.01?' style="grid-template-columns:repeat(4,1fr);"':''}>
      ${Math.abs(saldoPrev)>0.01?`<div class="fd-box" style="border-left:2px solid #f59e0b;">
        <div class="fd-box-lbl">Saldo Anterior</div>
        <div class="fd-box-val" style="color:#f59e0b;">${fV(saldoPrev,false)}</div>
      </div>`:''}
      <div class="fd-box">
        <div class="fd-box-lbl">Resultado</div>
        <div class="fd-box-val" style="color:${clr(resultSem)};">${fV(resultSem,false)}</div>
      </div>
      <div class="fd-box">
        <div class="fd-box-lbl">Mov. Líquida</div>
        <div class="fd-box-val" style="color:${movTotal>0?'#10b981':movTotal<0?'#ef4444':'var(--t3)'};">${Math.abs(movTotal)>0.01?fV(movTotal,false):'—'}</div>
      </div>
      <div class="fd-box">
        <div class="fd-box-lbl">Saldo Atual</div>
        <div class="fd-box-val" style="color:${clr(saldoAt)};">${Math.abs(saldoAt)<0.01?'✅ 0,00':fV(saldoAt,false)}</div>
      </div>
    </div>
    ${Math.abs(saldoPrev) > 0.01 ? `<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:.68rem;color:#fbbf24;">
      ⚠️ Carry de semana lockada anterior: <strong>R$ ${fV(saldoPrev,false)}</strong>
      <span style="color:var(--t3);margin-left:4px;">(${saldoPrev > 0 ? 'clube deve receber' : 'clube deve pagar'})</span>
    </div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t3);">Lançamentos (${hist.length})</div>
      <div style="display:flex;gap:6px;font-size:.62rem;color:var(--t3);">
        <span style="color:#10b981;">▲ ${fV(entradas,false)}</span>
        <span>·</span>
        <span style="color:#60a5fa;">▼ ${fV(saidas,false)}</span>
      </div>
    </div>

    ${hist.length ? hist.map((h,i) => {
      const isOut = h.dir === 'out';
      const dt = new Date(h.ts);
      const dataStr = dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const temComp = h.comp && h.comp.length > 0;
      const ehFoto = temComp && h.comp.startsWith('data:image');
      return `<div class="fd-item">
        <div class="fd-dir ${isOut?'out':'in'}">${isOut?'↑':'↓'}</div>
        <div class="fd-info">
          <div class="fd-metodo">${h.metodo}${temComp && !ehFoto ? ' · <span style="color:var(--t3);font-weight:400;font-size:.62rem;">'+h.comp.substring(0,30)+'</span>' : ''}${ehFoto ? ' · <span style="color:var(--t3);font-weight:400;font-size:.62rem;">📷 foto</span>' : ''}</div>
          <div class="fd-meta">${dataStr}${h.obs ? ' · '+h.obs : ''}</div>
        </div>
        <div class="fd-val" style="color:${isOut?'#60a5fa':'#10b981'};">${isOut?'−':'+'}${fV(h.valor,false)}</div>
        <div class="fd-actions">
          ${ehFoto ? `<button onclick="verExtratoPag('${idSafe}',${i})" title="Ver comprovante">🧾</button>` : ''}
          <button onclick="confirmarExcluirPag('${idSafe}',${i},'${e.nome.replace(/'/g,"\\'")}',${h.valor})" title="Excluir">✕</button>
        </div>
      </div>`;
    }).join('') : '<div class="fd-empty">Nenhum lançamento registrado</div>'}
  `;

  // Footer: read-only — link to Fechamentos for actions
  const status = getEntityStatus(e);
  if(status !== 'pago'){
    document.getElementById('fd-foot').innerHTML = `
      <button onclick="closeHistoryDrawer();document.querySelectorAll('.dn-item').forEach(i=>{if(i.textContent.includes('Liquidação'))i.click();});" style="width:100%;background:rgba(240,180,41,.1);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:10px;border-radius:8px;font-weight:700;font-size:.78rem;cursor:pointer;">💼 Acertar via Liquidação</button>`;
  } else {
    document.getElementById('fd-foot').innerHTML = `<div style="text-align:center;font-size:.78rem;color:#10b981;font-weight:700;">✅ Quitado</div>`;
  }

  document.getElementById('finDrawerOverlay').classList.add('open');
  document.getElementById('finDrawer').classList.add('open');
}

function closeHistoryDrawer(){
  document.getElementById('finDrawerOverlay').classList.remove('open');
  document.getElementById('finDrawer').classList.remove('open');
}

function abrirModalPagamento(entityId, dirOverride){
  const entities = calcFinEntities();
  const e = entities.find(x=>x.id===entityId);
  if(!e) return;
  _finModalEntity = e;

  const saldoPrev      = getSaldoAnterior(entityId);
  const movTotal       = getMovTotal(entityId);
  const resultadoSem   = -(e.valor);
  const saldoAt        = FinanceEngine.calcSaldoAtual(saldoPrev, resultadoSem, movTotal);
  const restante       = Math.abs(saldoAt);

  // Direção: usa override se fornecido, senão auto-detecta
  const dir = dirOverride || (saldoAt > 0 ? 'out' : 'in');
  window._finPayDir = dir;

  const isOut = dir === 'out';
  const tituloModal = isOut ? '💳 Registrar Pagamento' : '💰 Registrar Recebimento';
  const btnLabel    = isOut ? '✓ Confirmar Pagamento' : '✓ Confirmar Recebimento';

  document.querySelector('#mPagamento .modal-title').textContent = tituloModal;
  document.querySelector('#mPagamento .btn-primary').textContent = btnLabel;

  document.getElementById('mpag-info').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:700;font-size:.88rem;">${e.tipo==='agente'?'🤝':'👤'} ${e.nome}</div>
        <div style="font-size:.72rem;color:var(--t3);margin-top:3px;">Semana: ${weeks[selWeekIdx]?fWL(weeks[selWeekIdx]):'—'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:.68rem;color:var(--t3);">Restante</div>
        <div style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${isOut?'#60a5fa':'#ef4444'};font-size:1rem;">R$ ${fV(restante,false)}</div>
      </div>
    </div>
    ${Math.abs(saldoPrev)>0.01?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--b1);font-size:.72rem;color:var(--t3);">
      ⚠️ Inclui saldo anterior: <strong style="color:var(--gold)">R$ ${fV(saldoPrev,false)}</strong>
    </div>`:''}`;

  document.getElementById('mpag-valor').value = '';
  document.getElementById('mpag-comp-txt').value = '';
  document.getElementById('mpag-comp-preview').style.display = 'none';
  document.getElementById('mpag-comp-preview').innerHTML = '';
  window._finCompImg = null;
  window._finPayMetodo = null;

  const methods = getPayMethods();
  document.getElementById('mpag-metodos').innerHTML = methods.map(m=>
    '<button class="fin-metodo-btn" onclick="selectPayMetodo(this,\''+m+'\')">'+m+'</button>'
  ).join('');

  document.getElementById('mPagamento').classList.add('open');
}

function selectPayMetodo(btn, metodo){
  document.querySelectorAll('#mpag-metodos .fin-metodo-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  window._finPayMetodo = metodo;
}

function setPayFull(){
  if(!_finModalEntity) return;
  const saldoPrev = getSaldoAnterior(_finModalEntity.id);
  const movTotal  = getMovTotal(_finModalEntity.id);
  const saldoAt   = FinanceEngine.calcSaldoAtual(saldoPrev, -(_finModalEntity.valor), movTotal);
  document.getElementById('mpag-valor').value = Math.abs(saldoAt).toFixed(2);
}

function previewComp(input){
  if(!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    window._finCompImg = ev.target.result;
    const prev = document.getElementById('mpag-comp-preview');
    prev.style.display='block';
    prev.innerHTML='<img src="'+ev.target.result+'" style="max-width:100%;max-height:120px;border-radius:8px;border:1px solid var(--b2);">';
  };
  reader.readAsDataURL(input.files[0]);
}

function confirmarPagamento(){
  if(!_finModalEntity){ showToast('⚠️ Erro interno','e'); return; }
  const val = parseFloat(document.getElementById('mpag-valor').value);
  if(!val || val<=0){ showToast('⚠️ Informe um valor válido','e'); return; }
  if(!window._finPayMetodo){ showToast('⚠️ Selecione a forma de pagamento','e'); return; }

  const comp = window._finCompImg || document.getElementById('mpag-comp-txt').value || '';
  const allData = getFinData();
  const key = finKey();
  if(!allData[key]) allData[key] = {};
  if(!allData[key][_finModalEntity.id]) allData[key][_finModalEntity.id] = { historico:[] };

  // Usa direção explícita definida ao abrir o modal
  const dir = window._finPayDir || 'in';

  allData[key][_finModalEntity.id].historico.push({
    valor: val, metodo: window._finPayMetodo, dir, comp, ts: Date.now(),
    source: 'fechamento', conciliado: false
  });

  const saldoPrev       = getSaldoAnterior(_finModalEntity.id);
  const resultadoSemana = -(_finModalEntity.valor);
  const movTotal        = getMovTotal(_finModalEntity.id);
  allData[key][_finModalEntity.id].saldoAberto = saldoPrev + resultadoSemana - movTotal;

  saveFinData(allData);
  closeM('mPagamento');
  showToast(dir === 'out' ? '✅ Pagamento registrado!' : '✅ Recebimento registrado!');
  renderFinanceiro();
  renderAgentClosing();
  if(document.getElementById('dn-fechamentos')?.classList.contains('active')) renderFechamentos();
  renderClubTable();
}

function verExtratoPag(entityId, idx){
  const allData = getFinData();
  const key = finKey();
  const h = allData[key]?.[entityId]?.historico?.[idx];
  if(!h) return;

  const entities = calcFinEntities();
  const e = entities.find(x=>x.id===entityId);
  const nome = e ? e.nome : entityId;
  const tipo = e ? (e.tipo==='agente'?'🤝 Agente':'👤 Jogador') : '';

  const dt = new Date(h.ts);
  const dataFmt = dt.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const horaFmt = dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const ehFoto = h.comp && h.comp.startsWith('data:image');
  const temTxt = h.comp && !ehFoto && h.comp.length > 0;

  document.getElementById('mextrato-body').innerHTML = `
    <div style="background:var(--s2);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--b1);">
        <div style="width:38px;height:38px;border-radius:9px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;">✅</div>
        <div>
          <div style="font-weight:700;font-size:.88rem;">${tipo} ${nome}</div>
          <div style="font-size:.68rem;color:var(--t3);margin-top:2px;">${weeks[selWeekIdx]?fWL(weeks[selWeekIdx]):'—'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Valor Pago</div>
          <div style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#10b981;font-size:1.1rem;margin-top:3px;">R$ ${fV(h.valor,false)}</div>
        </div>
        <div>
          <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Forma</div>
          <div style="margin-top:4px;"><span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);color:#10b981;padding:3px 10px;border-radius:6px;font-size:.78rem;font-weight:700;">${h.metodo}</span></div>
        </div>
        <div>
          <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Data</div>
          <div style="font-size:.78rem;color:var(--t1);margin-top:3px;">${dataFmt}</div>
        </div>
        <div>
          <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);">Hora</div>
          <div style="font-size:.78rem;color:var(--t1);margin-top:3px;">🕐 ${horaFmt}</div>
        </div>
      </div>
      ${temTxt?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--b1);">
        <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:5px;">📎 Comprovante</div>
        <div style="font-size:.8rem;color:var(--t2);word-break:break-all;">${h.comp}</div>
      </div>`:''}
    </div>
    ${ehFoto?`
    <div>
      <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:8px;">📷 Foto do Comprovante</div>
      <img src="${h.comp}" style="width:100%;border-radius:10px;border:1px solid var(--b1);display:block;">
    </div>`:''}
  `;
  document.getElementById('mExtratoPag').classList.add('open');
}

function confirmarExcluirPag(entityId, idx, nome, valor){
  document.getElementById('mconfirm-body').innerHTML =
    `Tem certeza que deseja excluir o pagamento de <strong style="color:#10b981;">R$ ${fV(valor,false)}</strong> de <strong>${nome}</strong>?
    <br><br><span style="font-size:.78rem;color:var(--t3);">Esta ação não pode ser desfeita.</span>`;

  const btn = document.getElementById('mconfirm-ok');
  // Remove listeners anteriores clonando o botão
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', ()=>{
    closeM('mConfirmExcluir');
    excluirPagamento(entityId, idx);
  });
  document.getElementById('mConfirmExcluir').classList.add('open');
}

function excluirPagamento(entityId, idx){
  const allData = getFinData();
  const key = finKey();
  if(!allData[key]?.[entityId]?.historico) return;
  allData[key][entityId].historico.splice(idx,1);

  const entities  = calcFinEntities();
  const e         = entities.find(x=>x.id===entityId);
  const saldoPrev = getSaldoAnterior(entityId);
  if(e){
    const resultado = -(e.valor);
    const ledger = FinanceEngine.calcLedgerNet(allData[key][entityId].historico);
    const saldoAberto = saldoPrev + resultado - ledger.net;
    allData[key][entityId].saldoAberto = Math.abs(saldoAberto) < 0.01 ? 0 : saldoAberto;
  }
  saveFinData(allData);
  renderFinanceiro();
  renderAgentClosing(); // sincroniza fechamento de agentes
}

function addPaymentMethod(){
  const methods = getPayMethods();
  document.getElementById('mpay-list').innerHTML = methods.map((m,i)=>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:8px;margin-bottom:6px;">'
    +'<span style="font-size:.82rem;font-weight:600;">'+m+'</span>'
    +(i<3?'<span style="font-size:.68rem;color:var(--t3);">padrão</span>'
        :'<button onclick="removePayMethod('+i+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:.8rem;">✕</button>')
    +'</div>'
  ).join('');
  document.getElementById('mpay-new').value='';
  document.getElementById('mPayMethods').classList.add('open');
}

function addNewPayMethod(){
  const val = document.getElementById('mpay-new').value.trim();
  if(!val){ showToast('⚠️ Digite um nome','e'); return; }
  const methods = getPayMethods();
  if(methods.includes(val)){ showToast('⚠️ Já existe','e'); return; }
  methods.push(val);
  savePayMethods(methods);
  showToast('✅ Forma adicionada!');
  addPaymentMethod();
}

function removePayMethod(idx){
  const methods = getPayMethods();
  methods.splice(idx,1);
  savePayMethods(methods);
  addPaymentMethod();
}


// ══════════════════ CONCILIAÇÃO OFX ══════════════════

// Mapeamento persistido: descrição normalizada → entityId
