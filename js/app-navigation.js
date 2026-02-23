// ══════════════════════════════════════════════════════════════════════
//  app-navigation.js — Navegação, semanas, sidebar (Poker Manager)
//  Depende de: dataLayer.js, utils.js, app-state.js
// ══════════════════════════════════════════════════════════════════════

// ── Semanas ──
function getMon(d){const dt=new Date(d),dy=dt.getDay();dt.setDate(dt.getDate()-dy+(dy===0?-6:1));dt.setHours(0,0,0,0);return dt;}
function fW(d){const s=new Date(d),e=new Date(d);e.setDate(e.getDate()+6);const f=x=>`${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}`;return`${f(s)} → ${f(e)}`;}
function fWL(d){const s=new Date(d),e=new Date(d);e.setDate(e.getDate()+6);const f=x=>`${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;return`${f(s)}  →  ${f(e)}`;}

function initWeeks(){
  const m=getMon(new Date()); weeks=[];
  for(let i=12;i>=0;i--){const d=new Date(m);d.setDate(d.getDate()-i*7);weeks.push(d);}
  selWeekIdx=weeks.length-1;
  renderChips();updWeek();
}

function renderChips(){
  const c=document.getElementById('weekChips');c.innerHTML='';
  weeks.forEach((w,i)=>{
    const ch=document.createElement('div');
    const hasData = DataLayer.hasImport(String(w));
    const isLock = !!weekLocked[String(w)];
    ch.className='wchip'+(i===selWeekIdx?' active':'');
    ch.innerHTML=fW(w)+(i===weeks.length-1?' (atual)':'')
      + (hasData ? ' <span style="color:#10b981;font-size:.55rem;">●</span>' : '')
      + (isLock  ? ' <span style="color:#ef4444;font-size:.55rem;">🔒</span>' : '');
    ch.onclick=()=>{selWeekIdx=i;renderChips();updWeek();};
    c.appendChild(ch);
  });
}

function updWeek(){
  const wt=fWL(weeks[selWeekIdx]);
  document.getElementById('weekDisplay').textContent='📅  '+wt;
  document.getElementById('sb-week').innerHTML = fW(weeks[selWeekIdx])
    + (isWeekLocked() ? ' <span style="color:#ef4444;font-size:.55rem;">🔒</span>' : ' <span style="color:var(--t3);font-size:.55rem;">🟡</span>');
  document.getElementById('ov-week').textContent=fW(weeks[selWeekIdx]);
  const dcw = document.getElementById('dc-week');
  if(dcw && dcw.textContent!=='—') renderLockButton();

  // ── Layer 1: Restaurar import da semana selecionada ──
  const saved = DataLayer.loadImport(getWeekKey());
  if(saved && saved.players && saved.players.length){
    allPlayers = saved.players;
    filteredAll = [...allPlayers];
    filteredClub = activeClube ? allPlayers.filter(p=>p.clube===activeClube) : [];
    const badge = document.getElementById('import-status-badge');
    if(badge) badge.style.display = 'block';
    const impFile = document.getElementById('imp-status-file');
    if(impFile) impFile.textContent = (saved.fileName||'Importação') + ' · ' + saved.players.length + ' jogadores';
  } else {
    // Semana sem import — limpa dados para não mostrar de outra semana
    allPlayers = [];
    filteredAll = [];
    filteredClub = [];
    const badge = document.getElementById('import-status-badge');
    if(badge) badge.style.display = 'none';
  }

  // ── Layer 4: Computar carry semanal ──
  if(activeClube){
    DataLayer.persistCarry(activeClube, getWeekKey(), selWeekIdx, weeks, allPlayers);
  }

  // Re-render tudo se estiver em tela de clube
  if(activeClube && typeof renderClubTable === 'function'){
    renderClubTable();
    if(typeof updateClubKPIs === 'function') updateClubKPIs();
    if(typeof renderRakebackTab === 'function') renderRakebackTab();
    if(typeof renderAgentClosing === 'function') renderAgentClosing();
    if(typeof renderFinanceiro === 'function') renderFinanceiro();
  }
  // Atualiza overview e sidebar em qualquer tela
  if(typeof renderOverview === 'function') renderOverview();
  if(typeof renderAllTable === 'function') renderAllTable();
  if(typeof updateSidebar === 'function') updateSidebar();
}

function changeWeek(d){selWeekIdx=Math.max(0,Math.min(weeks.length-1,selWeekIdx+d));renderChips();updWeek();}

function toggleWeekDropdown(e){
  e.stopPropagation();
  const dd = document.getElementById('week-dropdown');
  if(!dd) return;
  const isOpen = dd.style.display !== 'none';
  if(isOpen){ dd.style.display = 'none'; return; }

  // Render items
  const el = document.getElementById('week-dropdown-items');
  let html = '<div style="padding:6px 10px;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);border-bottom:1px solid var(--b1);">📅 Semanas Disponíveis</div>';
  weeks.forEach((w, i) => {
    const wk = String(w);
    const hasData = DataLayer.hasImport(wk);
    const isLock = !!weekLocked[wk];
    const isActive = i === selWeekIdx;
    const isCurrent = i === weeks.length - 1;

    let badges = '';
    if(isCurrent) badges += '<span style="background:rgba(96,165,250,.1);color:#60a5fa;padding:1px 5px;border-radius:3px;font-size:.46rem;font-weight:700;">ATUAL</span> ';
    if(isLock) badges += '<span style="background:rgba(239,68,68,.08);color:#ef4444;padding:1px 5px;border-radius:3px;font-size:.46rem;font-weight:700;">🔒</span> ';
    if(hasData && !isLock) badges += '<span style="background:rgba(16,185,129,.08);color:#10b981;padding:1px 5px;border-radius:3px;font-size:.46rem;font-weight:700;">●</span> ';
    if(!hasData) badges += '<span style="font-size:.46rem;color:var(--t3);">vazia</span>';

    html += '<div onclick="event.stopPropagation();selectWeekFromDropdown('+i+')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--b1);'
      + (isActive ? 'background:rgba(240,180,41,.08);border-left:3px solid var(--gold);' : 'border-left:3px solid transparent;')
      + '" onmouseenter="this.style.background=\'rgba(240,180,41,.04)\'" onmouseleave="this.style.background=\''+(isActive?'rgba(240,180,41,.08)':'transparent')+'\'">';
    html += '<div>';
    html += '<div style="font-size:.72rem;font-weight:'+(isActive?'700':'500')+';color:'+(isActive?'var(--gold)':'var(--t1)')+';">'+fWL(w)+'</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:3px;">'+badges+'</div>';
    html += '</div>';
  });
  el.innerHTML = html;
  dd.style.display = 'block';

  // Close on outside click
  const closeHandler = (ev) => {
    if(!dd.contains(ev.target)){ dd.style.display = 'none'; document.removeEventListener('click', closeHandler); }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

function selectWeekFromDropdown(idx){
  selWeekIdx = idx;
  document.getElementById('week-dropdown').style.display = 'none';
  renderChips();
  updWeek();
}

// ── Mobile Sidebar ──
function toggleMobileSidebar(){
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if(!sb) return;
  sb.classList.toggle('open');
  if(ov) ov.classList.toggle('open');
}
function closeMobileSidebar(){
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if(sb) sb.classList.remove('open');
  if(ov) ov.classList.remove('open');
}

// ── Pages & Routing ──
function goPage(name){
  closeMobileSidebar();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  // sidebar active
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const labels={import:'Importação Geral',overview:'Visão Geral',lancamentos:'Lançamentos','liga-global':'Liga Consolidado','caixa-global':'Caixa Geral','fech-dash':'Fechamento por Clube',config:'Configurações',clube:'Fechamento · '+activeClube};
  document.getElementById('topbarLabel').textContent=labels[name]||name;
  if(name==='import')   document.getElementById('nav-home').classList.add('active');
  if(name==='overview') document.getElementById('nav-overview').classList.add('active');
  if(name==='lancamentos'){ document.getElementById('nav-lancamentos').classList.add('active'); renderLancamentos(); }
  if(name==='liga-global'){ document.getElementById('nav-liga-global').classList.add('active'); renderLigaGlobal(); }
  if(name==='caixa-global'){ document.getElementById('nav-caixa-global').classList.add('active'); renderCaixaGlobal(); }
  if(name==='fech-dash'){ document.getElementById('nav-fech-dash').classList.add('active'); renderFechDash(); }
  if(name==='config'){  document.getElementById('nav-config').classList.add('active'); renderConfigPage(); }
  if(name==='clube'){
    const key={'IMPÉRIO':'imp','CONFRARIA':'con','3BET':'3bt','TGP':'tgp','CH':'ch'}[activeClube];
    if(key) document.getElementById('nav-'+key).classList.add('active');
  }
}

function goClube(nome){
  if(!allPlayers.length){showToast('Importe a planilha primeiro!','e');return;}
  activeClube=nome;
  const m=CMETA[nome]||{};
  const logo = clubLogos[nome];
  const iconEl = document.getElementById('dc-icon');
  if(iconEl){
    if(logo) iconEl.innerHTML = `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
    else     iconEl.textContent = m.icon||'♠';
  }
  document.getElementById('dc-name').textContent=nome;
  renderLockButton();
  // reset tabs
  document.querySelectorAll('.dn-item').forEach(i=>i.classList.remove('active'));
  document.querySelector('.dn-item').classList.add('active');
  document.querySelectorAll('.sub-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('dn-resumo').classList.add('active');
  filteredClub=allPlayers.filter(p=>p.clube===nome);
  pgClub=1;
  renderClubTable();
  updateClubKPIs();
  goPage('clube');
}

function switchDN(item,tabId){
  document.querySelectorAll('.dn-item').forEach(i=>i.classList.remove('active'));
  document.querySelectorAll('.sub-tab').forEach(t=>t.classList.remove('active'));
  item.classList.add('active');
  document.getElementById(tabId).classList.add('active');
  if(tabId==='dn-resumo') renderResumo();
  if(tabId==='dn-detalhamento') renderDetalhamento();
  if(tabId==='dn-agentes') renderAgentClosing();
  if(tabId==='dn-rakeback') renderRakebackTab();
  if(tabId==='dn-extrato') renderFinanceiro();
  if(tabId==='dn-fechamentos') renderFechamentos();
  if(tabId==='dn-conciliacao') renderConciliacao();
  if(tabId==='dn-ajustes') renderAjustes();
  if(tabId==='dn-resultado') renderResultadoClube();
  if(tabId==='dn-liga') renderLiga();
}
