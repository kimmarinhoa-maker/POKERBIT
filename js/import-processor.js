// ══════════════════════════════════════════════════════════════════════
//  import-processor.js — Importação e processamento de planilhas (Poker Manager)
//  Depende de: dataLayer.js, utils.js, app-state.js
// ══════════════════════════════════════════════════════════════════════

// ══════════════════ IMPORT ══════════════════
const COL_DEFS=[
  {id:'c-id',    lbl:'ID Jogador',     hints:['id jogador','playerid','player id','userid','id do jogador']},
  {id:'c-nick',  lbl:'Nick',           hints:['nick','username','apelido','player name']},
  {id:'c-func',  lbl:'Função',         hints:['função','funcao','role','tipo','function']},
  {id:'c-aid',   lbl:'ID Agente',      hints:['id agente','agentid','agent id','id do agente']},
  {id:'c-aname', lbl:'Nome Agente',    hints:['nome do agente','nome agente','agente','agent name','agent']},
  {id:'c-said',  lbl:'ID Sub-Agente',  hints:['id sub','subagentid','id do sub agente']},
  {id:'c-saname',lbl:'Sub-Agente',     hints:['sub-agente','sub agente','subagente']},
  {id:'c-ganhos',lbl:'Ganhos',         hints:['ganhos','wins','winnings']},
  {id:'c-rake',  lbl:'Rake',           hints:['rake']},
  {id:'c-ggr',   lbl:'Rodeo GGR',      hints:['rodeo','ggr','gross']},
  {id:'c-result',lbl:'Resultado Semana',hints:['resultado','result','net','final']},
];
let rawHeaders=[],rawRows=[];

const dz=document.getElementById('dropZone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)handleFile(f);});

// ══════════════════ GRAND UNION ADAPTER ══════════════════
const GU_TO_BRL = 5;

function _findHeaderRow(rows){
  for(let i=0;i<Math.min(rows.length,15);i++){
    const cells=(rows[i]||[]).map(c=>String(c||'').trim());
    if(cells.some(c=>c==='Player ID')) return i;
  }
  return -1;
}

function _mapCols(headerRow){
  const map={};
  (headerRow||[]).forEach((cell,idx)=>{
    const name=String(cell||'').trim();
    if(name){
      if(map[name]!==undefined) map[name+':'+idx]=idx;
      else map[name]=idx;
    }
  });
  return map;
}

function _parseNum(raw){
  if(raw==null) return 0;
  if(typeof raw==='number') return isNaN(raw)?0:raw;
  let s=String(raw).trim();
  if(!s||s==='--'||s.toLowerCase()==='none') return 0;
  const isNeg=s.startsWith('(')&&s.endsWith(')');
  if(isNeg) s=s.slice(1,-1);
  const lc=s.lastIndexOf(','),ld=s.lastIndexOf('.');
  if(lc>ld){s=s.replace(/\./g,'').replace(',','.');}else{s=s.replace(/,/g,'');}
  s=s.replace(/[^\d.\-]/g,'');
  const num=parseFloat(s);
  return isNaN(num)?0:(isNeg?-num:num);
}

function resolveClubeInterno(agentName){
  let name=String(agentName||'').toUpperCase().trim();
  name=name.replace(/^AG[\.\s]+/i,'').trim();
  if(!name||name==='NONE') return '?';
  const rules=[
    {prefixes:['AMS','TW','BB'],clube:'IMPÉRIO'},
    {prefixes:['TGP'],          clube:'TGP'},
    {prefixes:['CONFRA'],       clube:'CONFRARIA'},
    {prefixes:['3BET'],         clube:'3BET'},
    {prefixes:['CH'],           clube:'CH'},
  ];
  for(const rule of rules){
    for(const prefix of rule.prefixes){
      if(name.startsWith(prefix)) return rule.clube;
    }
  }
  if(name.includes('TGP')) return 'TGP';
  return '?';
}

function _adapterImportResume(resumeRows){
  if(!resumeRows||resumeRows.length<2) return [];
  const hIdx=_findHeaderRow(resumeRows);
  if(hIdx===-1){console.error('[adapter] Header não encontrado na Resume');return [];}
  const col=_mapCols(resumeRows[hIdx]);
  const C={
    playerId:col['Player ID'], nickName:col['nickName'],
    agentId:col['Agent ID'], agentName:col['Agent Name'],
    subAgentId:col['Sub Agent ID'], subAgentName:col['Sub Agent Name'],
    winnings:col['Winnings'], totalFee:col['Total Fee'],
    rodeioProfit:col['RODEO Total Profit'],
    games:col['Games'], hands:col['Hands'], role:col['Role'],
  };
  if(C.playerId===undefined||C.winnings===undefined||C.totalFee===undefined){
    console.error('[adapter] Colunas obrigatórias ausentes:',C);return [];
  }
  console.log('[adapter] Resume mapeamento:',C);
  const playerLinks    = DataLayer.getPlayerLinks();
  const agentOvr       = DataLayer.getAgentSubclubOvr();
  const ignoredAgents  = DataLayer.getIgnoredAgents();
  const result=[];
  for(let i=hIdx+1;i<resumeRows.length;i++){
    const r=resumeRows[i];
    if(!r||r.length===0) continue;
    const pid=String(r[C.playerId]||'').trim();
    if(!pid||pid.toLowerCase()==='none') continue;

    const aname  = String(r[C.agentName]||'').trim();
    const rawAid = String(r[C.agentId]||'').trim();
    const u      = aname.toUpperCase().trim();

    // isNone: agentName vazio/None/null/undefined OU agentId vazio/0/None
    const isNoneAid  = !rawAid || rawAid==='0' || /^(none|null|undefined)$/i.test(rawAid);
    const isNoneName = !aname  || /^(none|null|undefined)$/i.test(aname);
    const isNone     = isNoneAid || isNoneName;

    const p = {
      id    : pid,
      nick  : String(r[C.nickName]||'').trim(),
      func  : String(r[C.role]||'').trim(),
      aid   : rawAid,
      aname : aname,
      said  : String(r[C.subAgentId]||'').trim(),
      saname: String(r[C.subAgentName]||'').trim(),
      clube : '?',
      ganhos: _parseNum(r[C.winnings])*GU_TO_BRL,
      rake  : _parseNum(r[C.totalFee])*GU_TO_BRL,
      ggr   : C.rodeioProfit!==undefined ? _parseNum(r[C.rodeioProfit])*GU_TO_BRL : 0,
      games : _parseNum(r[C.games]),
      hands : _parseNum(r[C.hands]),
      rakeback: 0,
      // flags de status (não persistidas no saveImport)
      _ignored      : false,
      _missingAgency: false,
      _unknownSubclub: false,
      _autoResolved : false,
    };

    if (ignoredAgents[rawAid]) {
      // Agente explicitamente ignorado — não entra nos fechamentos
      p._ignored = true;

    } else if (isNone) {
      // Jogador sem agência
      const link = playerLinks[pid];
      if (link) {
        // Auto-resolver via pm_playerLink
        p.aid    = link.agentId;
        p.aname  = link.agentName;
        p.clube  = link.subclube;
        p._autoResolved = true;
      } else {
        p._missingAgency = true;
      }

    } else {
      // Jogador com agência — resolver subclube
      const ovr = agentOvr[rawAid];
      if (ovr) {
        p.clube = ovr.subclube;
      } else {
        p.clube = manualLinks[u] || resolveClubeInterno(aname);
      }
      if (p.clube === '?') p._unknownSubclub = true;
    }

    result.push(p);
  }

  // Popular pm_agentsBySubclub para agentes já resolvidos
  result.forEach(p => {
    if (!p._ignored && !p._missingAgency && !p._unknownSubclub && p.clube !== '?' && p.aid && p.aname) {
      DataLayer.saveAgentToSubclub(p.clube, p.aid, p.aname);
    }
  });

  console.log(`[adapter] Resume: ${result.length} jogadores`);
  return result;
}

function _parseStatsBreakdown(statsRows){
  if(!statsRows||statsRows.length<2) return {};
  const hIdx=_findHeaderRow(statsRows);
  if(hIdx===-1) return {};
  const col=_mapCols(statsRows[hIdx]);
  const C={
    playerId:col['Player ID'],
    ringGame:col['Ring Game Total(Local)'],
    mtt:col['MTT Total(Local)'],
    sng:col['SNG Total(Local)'],
    spin:col['SPIN Total(Local)'],
    tlt:col['TLT Total(Local)'],
  };
  if(C.playerId===undefined) return {};
  const map={};
  for(let i=hIdx+1;i<statsRows.length;i++){
    const r=statsRows[i];
    if(!r||r.length===0) continue;
    const pid=String(r[C.playerId]||'').trim();
    if(!pid||pid.toLowerCase()==='none') continue;
    const bd={
      ringGame:C.ringGame!==undefined?_parseNum(r[C.ringGame]):0,
      mtt:C.mtt!==undefined?_parseNum(r[C.mtt]):0,
      sng:C.sng!==undefined?_parseNum(r[C.sng]):0,
      spin:C.spin!==undefined?_parseNum(r[C.spin]):0,
      tlt:C.tlt!==undefined?_parseNum(r[C.tlt]):0,
    };
    bd.total=bd.ringGame+bd.mtt+bd.sng+bd.spin+bd.tlt;
    map[pid]=bd;
  }
  console.log(`[adapter] Statistics: ${Object.keys(map).length} breakdowns`);
  return map;
}

function adapterImport(wb){
  const resumeSheet=wb.Sheets['Grand Union Member Resume'];
  if(!resumeSheet){console.error('[adapter] Aba Resume não encontrada!');return null;}
  const resumeRows=XLSX.utils.sheet_to_json(resumeSheet,{header:1,defval:''});
  const players=_adapterImportResume(resumeRows);

  const statsSheet=wb.Sheets['Grand Union Member Statistics'];
  let breakdown={};
  if(statsSheet){
    const statsRows=XLSX.utils.sheet_to_json(statsSheet,{header:1,defval:''});
    breakdown=_parseStatsBreakdown(statsRows);
  }

  let diffCount=0;
  for(const p of players){
    p.rakeBreakdown=breakdown[p.id]||{ringGame:0,mtt:0,sng:0,spin:0,tlt:0,total:0};
    if(!p._ignored){
      const diff=Math.abs(p.rake-p.rakeBreakdown.total);
      if(diff>0.1&&p.rakeBreakdown.total>0){diffCount++;if(diffCount<=5)console.warn(`[validação] ${p.id} ${p.nick}: Resume=${p.rake.toFixed(2)}, Stats=${p.rakeBreakdown.total.toFixed(2)}`);}
    }
  }
  if(diffCount>0) console.warn(`[validação] ${diffCount} com diferença`);
  else if(Object.keys(breakdown).length>0) console.log('[validação] ✅ Rake Resume × Statistics OK!');

  // Separar grupos para o modal de resolução
  const result = {
    all     : players.filter(p => !p._ignored),
    ignored : players.filter(p => p._ignored),
    missing : players.filter(p => p._missingAgency),
    unknown : players.filter(p => p._unknownSubclub),
    autoRes : players.filter(p => p._autoResolved),
    ok      : players.filter(p => !p._ignored && !p._missingAgency && !p._unknownSubclub),
  };
  console.log(`[adapter] ✅ ${result.all.length} jogadores (${result.ignored.length} ignorados, ${result.missing.length} sem agência, ${result.unknown.length} subclube desconhecido, ${result.autoRes.length} auto-resolvidos)`);
  return result;
}

// ══════════════════ FILE HANDLER ══════════════════
function handleFile(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellDates:true});

      // ── Detecta Grand Union (Suprema) ──
      const hasResume = !!wb.Sheets['Grand Union Member Resume'];

      if(hasResume){
        // AUTO-IMPORT: Grand Union Suprema
        const result=adapterImport(wb);
        if(!result||!result.all.length){showToast('Nenhum jogador encontrado na aba Resume!','e');return;}

        // Show Import Report before accepting
        showImportReport(result, file.name, (validatedPlayers, fname) => {
          allPlayers = validatedPlayers;
          filteredAll = [...allPlayers];
          DataLayer.saveImport(getWeekKey(), validatedPlayers, fname);

          dz.classList.add('loaded');
          document.getElementById('dropIcon').textContent='✅';
          document.getElementById('dropTitle').textContent=`${fname} — ${validatedPlayers.length} jogadores importados (Grand Union)`;
          document.getElementById('dropSub').textContent='Importação automática via Grand Union Member Resume + Statistics';
          document.getElementById('mapperCard').classList.remove('show');
          document.getElementById('imp-status-file').textContent=fname+' · '+validatedPlayers.length+' jogadores';
          document.getElementById('import-status-badge').style.display='block';

          updateSidebar();
          showDiagnostic(validatedPlayers);
          showToast(`✅ ${validatedPlayers.length} jogadores importados!`);
        });

      } else {
        // FALLBACK: modo antigo com mapper manual
        const ws=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'dd/mm/yyyy'});
        if(json.length<2){showToast('Planilha vazia!','e');return;}
        rawHeaders=json[0].map(h=>String(h||'').trim());
        rawRows=json.slice(1).filter(r=>r.some(c=>c!==undefined&&c!==''));
        dz.classList.add('loaded');
        document.getElementById('dropIcon').textContent='✅';
        document.getElementById('dropTitle').textContent=`${file.name} — ${rawRows.length} linhas detectadas`;
        document.getElementById('dropSub').textContent='Configure as colunas abaixo e clique em "Processar"';
        buildMapper();
      }
      document.getElementById('fileMain').value='';
    }catch(err){showToast('Erro ao ler arquivo: '+err.message,'e');}
  };
  r.readAsArrayBuffer(file);
}

function buildMapper(){
  const grid=document.getElementById('cmGrid');grid.innerHTML='';
  COL_DEFS.forEach(def=>{
    const det=rawHeaders.findIndex(h=>def.hints.some(hint=>h.toLowerCase().includes(hint)));
    const div=document.createElement('div');div.className='cm-field';
    div.innerHTML=`<label>${def.lbl}</label>
      <select id="${def.id}">
        <option value="">— não usar —</option>
        ${rawHeaders.map((h,i)=>`<option value="${i}"${i===det?' selected':''}>${h||'Col '+(i+1)}</option>`).join('')}
      </select>`;
    grid.appendChild(div);
  });
  document.getElementById('mapperCard').classList.add('show');
}

function cv(rowIdx,sid){
  const s=document.getElementById(sid);
  if(!s||s.value==='')return'';
  return rawRows[rowIdx]?.[parseInt(s.value)]??'';
}
function pNum(v){
  if(v===null||v===undefined||v==='') return 0;
  let s = String(v).trim().replace(/[R$\s]/g,'');
  if(!s || s==='None' || s.startsWith('=')) return 0;

  const hasDot   = s.includes('.');
  const hasComma = s.includes(',');

  if(hasDot && hasComma){
    const lastDot   = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if(lastComma > lastDot){
      // Formato BR: 1.234,56
      s = s.replace(/\./g,'').replace(',','.');
    } else {
      // Formato US: 1,234.56
      s = s.replace(/,/g,'');
    }
  } else if(hasComma && !hasDot){
    // Só vírgula: 1234,56
    s = s.replace(',','.');
  }
  // Só ponto ou número inteiro: já está ok (ex: 21758.10 ou -41.15)

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function processImport(){
  const players=rawRows.map((row,i)=>{
    const aname=String(cv(i,'c-aname')||'').trim();
    return{
      id:String(cv(i,'c-id')||'').trim(),
      nick:String(cv(i,'c-nick')||'').trim(),
      func:String(cv(i,'c-func')||'Jogador').trim(),
      aid:String(cv(i,'c-aid')||'').trim(),
      aname,
      said:String(cv(i,'c-said')||'').trim(),
      saname:String(cv(i,'c-saname')||'').trim(),
      ganhos:pNum(cv(i,'c-ganhos')),
      rake:pNum(cv(i,'c-rake')),
      ggr:pNum(cv(i,'c-ggr')),
      result:pNum(cv(i,'c-result')),
      clube:classify(aname),
      rakeback:0,
    };
  }).filter(p=>p.id||p.nick);

  const fname=document.getElementById('dropTitle').textContent.split('—')[0].trim();

  showImportReport(players, fname, (validatedPlayers, fn) => {
    allPlayers = validatedPlayers;
    filteredAll = [...allPlayers];
    DataLayer.saveImport(getWeekKey(), validatedPlayers, fn);

    document.getElementById('imp-status-file').textContent=fn+' · '+validatedPlayers.length+' jogadores';
    document.getElementById('import-status-badge').style.display='block';

    updateSidebar();
    showDiagnostic(validatedPlayers);
    showToast(`✅ ${validatedPlayers.length} jogadores processados!`);
  });
}

// ── IMPORT VALIDATION ──
let _pendingImportPlayers = null;
let _pendingImportFileName = '';
// Estado do modal de resolução de pendências
let _missingAgencyRows  = [];   // [{player}] — 🔴 NONE sem pm_playerLink
let _unknownSubclubRows = [];   // [{agentId, agentName, count, players[]}] — 🟠 subclube ?
let _autoResolvedCount  = 0;    // jogadores auto-resolvidos via pm_playerLink nesta sessão
let _resolvedNone       = {};   // playerId → {subclube, agentId, agentName}
let _resolvedAgent      = {};   // agentId  → subclube
let _ignoredInSession   = new Set(); // agentIds ignorados nesta sessão

function validateImport(players, fileName){
  const errors = [];
  const warnings = [];
  const idSet = new Set();
  const nickSet = {};

  players.forEach((p, i) => {
    const row = i + 2; // header is row 1

    // ERRORS (block import)
    if(!p.id && !p.nick){
      errors.push({ row, msg: 'Jogador sem ID e sem Nick — impossível identificar', field: 'id/nick' });
    }
    if(!p.id){
      errors.push({ row, msg: 'Player ID vazio: "' + (p.nick||'?') + '"', field: 'id' });
    }
    if(p.id && idSet.has(p.id)){
      errors.push({ row, msg: 'Player ID duplicado: "' + p.id + '" (nick: ' + (p.nick||'?') + ')', field: 'id' });
    }
    if(p.id) idSet.add(p.id);

    // WARNINGS (allow import)
    if(p.nick){
      if(!nickSet[p.nick]) nickSet[p.nick] = [];
      nickSet[p.nick].push(p.id);
    }
    if(Number(p.rake) < 0){
      warnings.push({ row, msg: 'Rake negativo: R$ ' + fV(p.rake, false) + ' para "' + (p.nick||p.id) + '"', field: 'rake' });
    }
    if(p.rake == 0 && (Number(p.ganhos) !== 0)){
      warnings.push({ row, msg: 'Rake = 0 com P/L ≠ 0 para "' + (p.nick||p.id) + '"', field: 'rake' });
    }
    // Warnings de agência/clube só para jogadores não tratados pelo fluxo de resolução
    // (_missingAgency e _unknownSubclub são exibidos como seções bloqueantes no modal)
    if(!p._missingAgency && !p._unknownSubclub && !p._autoResolved && (!p.aname || /^(none|null|undefined)$/i.test(p.aname))){
      warnings.push({ row, msg: '"' + (p.nick||p.id) + '" sem agência definida', field: 'aname' });
    }
    if(!p._unknownSubclub && !p._missingAgency && p.clube === '?'){
      warnings.push({ row, msg: '"' + (p.nick||p.id) + '" — agência "' + (p.aname||'') + '" não classificada', field: 'clube' });
    }
  });

  // Nicks duplicados com IDs diferentes
  Object.entries(nickSet).forEach(([nick, ids]) => {
    if(ids.length > 1){
      warnings.push({ row: 0, msg: 'Nick "' + nick + '" repetido para ' + ids.length + ' IDs diferentes: ' + ids.join(', '), field: 'nick' });
    }
  });

  return { errors, warnings };
}

// ── Helpers do modal de importação ────────────────────────────────────

const _CLR = {'IMPÉRIO':'#f0b429','CONFRARIA':'#10b981','3BET':'#c084fc','TGP':'#fb923c','CH':'#60a5fa'};

// Retorna {agentId: agentName} para um subclube — import atual primeiro, depois histórico
function _getAgentsForSubclub(subclube) {
  const agents = {};
  if (_pendingImportPlayers) {
    _pendingImportPlayers.forEach(p => {
      if (p.clube === subclube && p.aid && p.aname && !p._missingAgency && !p._ignored) {
        agents[String(p.aid)] = p.aname;
      }
    });
  }
  const registry = DataLayer.getAgentsBySubclub()[subclube] || {};
  Object.entries(registry).forEach(([aid, aname]) => { if (!agents[aid]) agents[aid] = aname; });
  return agents;
}

// Atualiza o estado e texto do botão Confirmar
function _updateImportConfirmBtn(hasErrors) {
  const btn = document.getElementById('import-report-confirm');
  if (!btn) return;
  const pendingMissing = _missingAgencyRows.filter(p => !_resolvedNone[p.id]).length;
  const pendingUnknown = _unknownSubclubRows.filter(a =>
    !_resolvedAgent[String(a.agentId)] && !_ignoredInSession.has(String(a.agentId))
  ).length;
  const totalPending = pendingMissing + pendingUnknown;
  if (hasErrors) {
    btn.disabled = true;
    btn.textContent = '🚫 Corrija os erros na planilha';
    btn.style.opacity = '0.4';
  } else if (totalPending > 0) {
    btn.disabled = true;
    btn.textContent = '⏳ Resolva ' + totalPending + ' pendência' + (totalPending > 1 ? 's' : '') + ' para continuar';
    btn.style.opacity = '0.5';
  } else {
    btn.disabled = false;
    btn.textContent = '✅ Confirmar Importação';
    btn.style.opacity = '1';
  }
}

// Handler: usuário escolhe subclube para um jogador NONE
function onNoneSubclubeSelect(playerId, subclube) {
  const agSelect = document.getElementById('ag-sel-' + playerId);
  if (!agSelect) return;
  agSelect.innerHTML = '<option value="">— selecione a agência —</option>';
  const agents = _getAgentsForSubclub(subclube);
  Object.entries(agents).forEach(([aid, aname]) => {
    const opt = document.createElement('option');
    opt.value = aid + '||' + aname;
    opt.textContent = aname;
    agSelect.appendChild(opt);
  });
  agSelect.disabled = false;
  agSelect.dataset.subclube = subclube;
  // Limpar resolução anterior se mudou de subclube
  delete _resolvedNone[playerId];
  _updateImportConfirmBtn(false);
}

// Handler: usuário escolhe agência para um jogador NONE
function onNoneAgenciaSelect(playerId, selectEl) {
  const val = selectEl.value;
  if (!val) { delete _resolvedNone[playerId]; _updateImportConfirmBtn(false); return; }
  const subclube = selectEl.dataset.subclube || '';
  const parts = val.split('||');
  const agentId   = parts[0] || '';
  const agentName = parts[1] || '';
  _resolvedNone[playerId] = { subclube, agentId, agentName };
  // Marcar linha como resolvida visualmente
  const row = document.getElementById('none-row-' + playerId);
  if (row) row.style.opacity = '0.55';
  _updateImportConfirmBtn(false);
}

// Handler: usuário escolhe subclube para um agente desconhecido (🟠)
function onAgentSubclubeSelect(agentId, subclube) {
  if (!subclube) return;
  // Apenas salva em staging — efetivado no "Vincular"
  const vinBtn = document.getElementById('vin-btn-' + agentId);
  if (vinBtn) { vinBtn.disabled = false; vinBtn.dataset.subclube = subclube; }
}

// Handler: Vincular agente desconhecido
function onAgentVincular(agentId, agentName) {
  const sel = document.getElementById('sub-sel-' + agentId);
  const subclube = sel ? sel.value : '';
  if (!subclube) { showToast('Selecione um subclube primeiro', 'e'); return; }
  _resolvedAgent[String(agentId)] = subclube;
  // Feedback visual
  const row = document.getElementById('unk-row-' + agentId);
  if (row) {
    const color = _CLR[subclube] || '#10b981';
    row.style.background = color + '11';
    row.style.borderColor = color + '44';
    const badge = row.querySelector('.unk-status');
    if (badge) { badge.textContent = '✓ ' + subclube; badge.style.color = color; }
    row.querySelectorAll('select,button').forEach(el => el.disabled = true);
  }
  _updateImportConfirmBtn(false);
}

// Handler: Ignorar agente — pede confirmação nativa
function onAgentIgnorar(agentId, agentName) {
  if (!confirm('Ignorar "' + agentName + '"?\n\nJogadores deste agente NÃO entrarão nos fechamentos financeiros. Esta decisão fica salva permanentemente (pode ser revertida na seção "Não Vinculados").')) return;
  _ignoredInSession.add(String(agentId));
  const row = document.getElementById('unk-row-' + agentId);
  if (row) { row.style.opacity = '0.35'; row.style.pointerEvents = 'none'; }
  _updateImportConfirmBtn(false);
}

// ── Bulk para jogadores NONE ───────────────────────────────────────────
let _bulkNoneSelected = new Set();

function toggleNoneSelect(playerId, cb) {
  if (cb.checked) _bulkNoneSelected.add(playerId);
  else _bulkNoneSelected.delete(playerId);
  const bar = document.getElementById('none-bulk-bar');
  if (bar) bar.style.display = _bulkNoneSelected.size >= 2 ? 'flex' : 'none';
  const cnt = document.getElementById('none-bulk-count');
  if (cnt) cnt.textContent = _bulkNoneSelected.size;
}

function applyBulkNone() {
  const subSel = document.getElementById('bulk-none-sub');
  const agSel  = document.getElementById('bulk-none-ag');
  const subclube = subSel ? subSel.value : '';
  const agVal    = agSel  ? agSel.value  : '';
  if (!subclube || !agVal) { showToast('Selecione subclube e agência para o lote', 'e'); return; }
  const parts = agVal.split('||');
  const agentId   = parts[0] || '';
  const agentName = parts[1] || '';
  _bulkNoneSelected.forEach(pid => {
    _resolvedNone[pid] = { subclube, agentId, agentName };
    const row = document.getElementById('none-row-' + pid);
    if (row) row.style.opacity = '0.55';
  });
  _bulkNoneSelected.clear();
  const bar = document.getElementById('none-bulk-bar');
  if (bar) bar.style.display = 'none';
  _updateImportConfirmBtn(false);
}

function onBulkSubclubeChange(subclube) {
  const agSel = document.getElementById('bulk-none-ag');
  if (!agSel) return;
  agSel.innerHTML = '<option value="">— agência —</option>';
  const agents = _getAgentsForSubclub(subclube);
  Object.entries(agents).forEach(([aid, aname]) => {
    const opt = document.createElement('option');
    opt.value = aid + '||' + aname;
    opt.textContent = aname;
    agSel.appendChild(opt);
  });
  agSel.disabled = Object.keys(agents).length === 0;
}

// ── showImportReport ───────────────────────────────────────────────────
function showImportReport(result, fileName, onConfirm) {
  const players = result.all;   // jogadores não-ignorados pelo adapter
  _pendingImportPlayers = players;
  _pendingImportFileName = fileName;
  window._importReportCallback = onConfirm;

  // Popula grupos de estado
  _missingAgencyRows  = result.missing  || [];
  _autoResolvedCount  = (result.autoRes || []).length;
  _resolvedNone       = {};
  _resolvedAgent      = {};
  _ignoredInSession   = new Set();
  _bulkNoneSelected   = new Set();

  // Monta grupos de agentes desconhecidos por agentId
  const unkMap = {};
  (result.unknown || []).forEach(p => {
    const aid = String(p.aid || '');
    if (!unkMap[aid]) unkMap[aid] = { agentId: aid, agentName: p.aname, count: 0 };
    unkMap[aid].count++;
  });
  _unknownSubclubRows = Object.values(unkMap);

  const report    = validateImport(players, fileName);
  const hasErrors = report.errors.length > 0;
  const hasWarnings = report.warnings.length > 0;

  // KPIs
  const clubs = {};
  players.filter(p => !p._missingAgency && !p._unknownSubclub).forEach(p => {
    clubs[p.clube] = (clubs[p.clube] || 0) + 1;
  });
  const totalRake = players.reduce((s,p) => s + (Number(p.rake)||0), 0);
  const totalPL   = players.reduce((s,p) => s + (Number(p.ganhos)||0), 0);

  let html = '';

  // ── KPI bar ──────────────────────────────────────────────────────────
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:7px;padding:8px 10px;text-align:center;">';
  html += '<div style="font-size:.48rem;font-weight:700;text-transform:uppercase;color:var(--t3);">Jogadores</div>';
  html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:1rem;font-weight:800;color:var(--t1);">'+players.length+'</div></div>';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:7px;padding:8px 10px;text-align:center;">';
  html += '<div style="font-size:.48rem;font-weight:700;text-transform:uppercase;color:var(--t3);">Clubes</div>';
  html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:1rem;font-weight:800;color:var(--t1);">'+Object.keys(clubs).length+'</div></div>';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:7px;padding:8px 10px;text-align:center;">';
  html += '<div style="font-size:.48rem;font-weight:700;text-transform:uppercase;color:var(--t3);">Rake Total</div>';
  html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;font-weight:800;color:#10b981;">'+fV(totalRake,false)+'</div></div>';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:7px;padding:8px 10px;text-align:center;">';
  html += '<div style="font-size:.48rem;font-weight:700;text-transform:uppercase;color:var(--t3);">P/L Total</div>';
  html += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;font-weight:800;color:'+clr(totalPL)+';">'+fV(totalPL,false)+'</div></div>';
  html += '</div>';

  // Club badges
  html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">';
  Object.entries(clubs).sort((a,b)=>b[1]-a[1]).forEach(([c,cnt]) => {
    const m = CMETA[c] || {};
    html += '<span style="background:rgba(240,180,41,.08);border:1px solid rgba(240,180,41,.15);color:var(--gold);padding:3px 8px;border-radius:5px;font-size:.6rem;font-weight:600;">'+(m.icon||'')+''+c+' ('+cnt+')</span>';
  });
  html += '</div>';

  // ── 🟢 Auto-resolvidos ───────────────────────────────────────────────
  if (_autoResolvedCount > 0) {
    html += '<div style="background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;">';
    html += '<div style="font-size:.7rem;font-weight:700;color:#10b981;">🟢 '+_autoResolvedCount+' jogador'+((_autoResolvedCount>1)?'es':'')+' auto-resolvido'+((_autoResolvedCount>1)?'s':'')+' via vínculo salvo</div>';
    html += '<div style="font-size:.58rem;color:var(--t3);margin-top:2px;">Estes jogadores já foram vinculados anteriormente e foram classificados automaticamente.</div>';
    html += '</div>';
  }

  // ── 🔴 Sem agência (bloqueante) ──────────────────────────────────────
  if (_missingAgencyRows.length > 0) {
    html += '<div id="missing-section" style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 14px;margin-bottom:10px;">';
    html += '<div style="font-size:.72rem;font-weight:700;color:#ef4444;margin-bottom:8px;">🔴 '+_missingAgencyRows.length+' jogador'+((_missingAgencyRows.length>1)?'es':'')+' sem agência — resolução obrigatória</div>';

    // Barra de bulk (aparece via JS quando ≥2 selecionados)
    html += '<div id="none-bulk-bar" style="display:none;align-items:center;gap:6px;padding:7px 10px;background:rgba(239,68,68,.08);border-radius:6px;margin-bottom:8px;flex-wrap:wrap;">';
    html += '<span style="font-size:.6rem;font-weight:700;color:#ef4444;"><span id="none-bulk-count">0</span> selecionados</span>';
    html += '<select id="bulk-none-sub" onchange="onBulkSubclubeChange(this.value)" style="font-size:.6rem;padding:3px 6px;border-radius:5px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);">';
    html += '<option value="">Subclube...</option>';
    CLUBS.forEach(c => { html += '<option value="'+c+'">'+(CMETA[c]||{}).icon+' '+c+'</option>'; });
    html += '</select>';
    html += '<select id="bulk-none-ag" disabled style="font-size:.6rem;padding:3px 6px;border-radius:5px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);"><option value="">Agência...</option></select>';
    html += '<button onclick="applyBulkNone()" style="font-size:.6rem;padding:3px 10px;border-radius:5px;background:#ef4444;border:none;color:#fff;cursor:pointer;font-weight:700;">Aplicar</button>';
    html += '</div>';

    // Lista de jogadores NONE — layout 2 linhas, sem scroll horizontal
    html += '<div style="max-height:240px;overflow-y:auto;overflow-x:hidden;">';
    _missingAgencyRows.forEach(p => {
      const pid = p.id;
      html += '<div id="none-row-'+pid+'" style="padding:6px 4px;border-bottom:1px solid var(--b1);">';
      // Linha 1: checkbox + ID + nome
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" onchange="toggleNoneSelect(\''+pid+'\',this)" style="flex-shrink:0;">';
      html += '<span style="font-family:\'JetBrains Mono\',monospace;font-size:.55rem;color:var(--t3);flex-shrink:0;">'+pid+'</span>';
      html += '<span style="font-size:.67rem;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+p.nick+'</span>';
      html += '</div>';
      // Linha 2: dropdowns subclube + agência lado a lado
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding-left:22px;">';
      html += '<select onchange="onNoneSubclubeSelect(\''+pid+'\',this.value)" style="font-size:.6rem;padding:3px 5px;border-radius:4px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);">';
      html += '<option value="">Subclube...</option>';
      CLUBS.forEach(c => { html += '<option value="'+c+'">'+(CMETA[c]||{}).icon+' '+c+'</option>'; });
      html += '</select>';
      html += '<select id="ag-sel-'+pid+'" disabled onchange="onNoneAgenciaSelect(\''+pid+'\',this)" data-subclube="" style="font-size:.6rem;padding:3px 5px;border-radius:4px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);">';
      html += '<option value="">Agência...</option></select>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // ── 🟠 Agentes sem subclube (bloqueante) ─────────────────────────────
  if (_unknownSubclubRows.length > 0) {
    html += '<div id="unknown-section" style="background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.25);border-radius:8px;padding:12px 14px;margin-bottom:10px;">';
    html += '<div style="font-size:.72rem;font-weight:700;color:#f59e0b;margin-bottom:8px;">🟠 '+_unknownSubclubRows.length+' agente'+((_unknownSubclubRows.length>1)?'s':'')+' sem subclube — resolução obrigatória</div>';
    _unknownSubclubRows.forEach(ag => {
      const aid     = String(ag.agentId);
      const safeName= ag.agentName.replace(/'/g,'\\\'');
      html += '<div id="unk-row-'+aid+'" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(245,158,11,.1);flex-wrap:wrap;">';
      html += '<div style="min-width:160px;flex:1;">';
      html += '<div style="font-size:.68rem;font-weight:600;color:var(--t1);">'+ag.agentName+'</div>';
      html += '<div style="font-size:.55rem;color:var(--t3);">ID '+aid+' · '+ag.count+' jogador'+(ag.count>1?'es':'')+'</div>';
      html += '</div>';
      html += '<select id="sub-sel-'+aid+'" onchange="onAgentSubclubeSelect(\''+aid+'\',this.value)" style="font-size:.6rem;padding:3px 6px;border-radius:5px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);">';
      html += '<option value="">— subclube —</option>';
      CLUBS.forEach(c => { html += '<option value="'+c+'">'+(CMETA[c]||{}).icon+' '+c+'</option>'; });
      html += '</select>';
      html += '<button id="vin-btn-'+aid+'" onclick="onAgentVincular(\''+aid+'\',\''+safeName+'\')" style="font-size:.6rem;padding:3px 10px;border-radius:5px;background:#f59e0b;border:none;color:#000;cursor:pointer;font-weight:700;">Vincular</button>';
      html += '<button onclick="onAgentIgnorar(\''+aid+'\',\''+safeName+'\')" style="font-size:.6rem;padding:3px 10px;border-radius:5px;background:var(--s2);border:1px solid var(--b1);color:var(--t3);cursor:pointer;">Ignorar</button>';
      html += '<span class="unk-status" style="font-size:.58rem;font-weight:700;min-width:60px;"></span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── Erros ────────────────────────────────────────────────────────────
  if (hasErrors) {
    html += '<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:12px 14px;margin-bottom:10px;">';
    html += '<div style="font-size:.72rem;font-weight:700;color:#ef4444;margin-bottom:8px;">🚫 Erros ('+report.errors.length+') — importação bloqueada</div>';
    report.errors.slice(0, 20).forEach(e => {
      html += '<div style="font-size:.68rem;color:#ef4444;padding:3px 0;border-bottom:1px solid rgba(239,68,68,.08);">';
      html += (e.row ? '<span style="font-family:\'JetBrains Mono\',monospace;color:var(--t3);margin-right:6px;">L'+e.row+'</span>' : '');
      html += e.msg + '</div>';
    });
    if (report.errors.length > 20) html += '<div style="font-size:.6rem;color:var(--t3);padding:4px 0;">... e mais '+(report.errors.length-20)+' erros</div>';
    html += '</div>';
  }

  // ── Avisos ───────────────────────────────────────────────────────────
  if (hasWarnings) {
    html += '<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:12px 14px;margin-bottom:10px;">';
    html += '<div style="font-size:.72rem;font-weight:700;color:#f59e0b;margin-bottom:8px;">⚠️ Avisos ('+report.warnings.length+') — importação permitida</div>';
    report.warnings.slice(0, 20).forEach(w => {
      html += '<div style="font-size:.68rem;color:#f59e0b;padding:3px 0;border-bottom:1px solid rgba(245,158,11,.08);">';
      html += (w.row ? '<span style="font-family:\'JetBrains Mono\',monospace;color:var(--t3);margin-right:6px;">L'+w.row+'</span>' : '');
      html += w.msg + '</div>';
    });
    if (report.warnings.length > 20) html += '<div style="font-size:.6rem;color:var(--t3);padding:4px 0;">... e mais '+(report.warnings.length-20)+' avisos</div>';
    html += '</div>';
  }

  // ── Limpo ────────────────────────────────────────────────────────────
  if (!hasErrors && !hasWarnings && _missingAgencyRows.length === 0 && _unknownSubclubRows.length === 0) {
    html += '<div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.12);border-radius:8px;padding:14px;text-align:center;">';
    html += '<span style="font-size:1.2rem;">✅</span>';
    html += '<div style="font-size:.78rem;font-weight:700;color:#10b981;margin-top:6px;">Nenhum erro, aviso ou pendência. Importação limpa!</div>';
    html += '</div>';
  }

  document.getElementById('import-report-content').innerHTML = html;
  _updateImportConfirmBtn(hasErrors);
  openM('mImportReport');
}

// ── confirmImportFromReport ────────────────────────────────────────────
function confirmImportFromReport() {
  if (!_pendingImportPlayers) return;

  // 1. Persistir vínculos de jogadores NONE (pm_playerLink)
  Object.entries(_resolvedNone).forEach(([pid, link]) => {
    DataLayer.savePlayerLink(pid, link);
    if (link.agentId && link.agentName) {
      DataLayer.saveAgentToSubclub(link.subclube, link.agentId, link.agentName);
    }
  });

  // 2. Persistir overrides de agentes desconhecidos (pm_agentSubclubOvr)
  Object.entries(_resolvedAgent).forEach(([agentId, subclube]) => {
    const ag = _unknownSubclubRows.find(a => String(a.agentId) === String(agentId));
    const agentName = ag ? ag.agentName : '';
    DataLayer.saveAgentSubclubOvr(agentId, { subclube, agentName });
    DataLayer.saveAgentToSubclub(subclube, agentId, agentName);
  });

  // 3. Persistir agentes ignorados (pm_ignoredAgents)
  _ignoredInSession.forEach(agentId => {
    const ag = _unknownSubclubRows.find(a => String(a.agentId) === String(agentId));
    DataLayer.ignoreAgent(agentId, ag ? ag.agentName : '');
  });

  // 4. Aplicar resoluções nos players desta sessão
  _pendingImportPlayers.forEach(p => {
    if (p._missingAgency && _resolvedNone[p.id]) {
      const link = _resolvedNone[p.id];
      p.aid   = link.agentId;
      p.aname = link.agentName;
      p.clube = link.subclube;
      p._missingAgency = false;
    } else if (p._unknownSubclub && _resolvedAgent[String(p.aid)]) {
      p.clube = _resolvedAgent[String(p.aid)];
      p._unknownSubclub = false;
    }
  });

  // 5. Filtrar players de agentes ignorados nesta sessão
  const toImport = _pendingImportPlayers.filter(p =>
    !p._ignored && !_ignoredInSession.has(String(p.aid))
  );

  // 6. Atualizar badge de não vinculados
  checkIgnoredAgents();

  closeM('mImportReport');
  if (window._importReportCallback) window._importReportCallback(toImport, _pendingImportFileName);
  _pendingImportPlayers = null;
}

function showDiagnostic(players){
  // Agrupa agentes únicos e suas classificações
  const agentMap = {};
  players.forEach(p => {
    const key = String(p.aname||'').trim();
    if(!agentMap[key]) agentMap[key] = {clube: p.clube, count: 0};
    agentMap[key].count++;
  });

  const entries = Object.entries(agentMap).sort((a,b)=>{
    // Não classificados primeiro
    if(a[1].clube==='?' && b[1].clube!=='?') return -1;
    if(a[1].clube!=='?' && b[1].clube==='?') return 1;
    return a[0].localeCompare(b[0]);
  });

  const unkAgents = entries.filter(([,v])=>v.clube==='?');
  const okAgents  = entries.filter(([,v])=>v.clube!=='?');

  const panel = document.getElementById('diagPanel');
  const totalUnk = players.filter(p=>p.clube==='?').length;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div>
        <div style="font-size:1rem;font-weight:700;">📋 Diagnóstico de Classificação</div>
        <div style="font-size:.8rem;color:var(--t2);margin-top:3px;">${players.length} jogadores · ${okAgents.length} agentes classificados · <span style="color:${unkAgents.length?'var(--red)':'var(--green)'};">${unkAgents.length} agentes não identificados (${totalUnk} jogadores)</span></div>
      </div>
      <button class="btn-primary" style="font-size:.8rem;padding:9px 18px;" onclick="goPage('overview');renderOverview();">
        ✔ Confirmar e Ver Dashboard →
      </button>
    </div>

    ${unkAgents.length > 0 ? `
    <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:.8rem;font-weight:700;color:var(--red);margin-bottom:12px;">⚠️ Agentes Não Identificados — Vincule abaixo (todos os jogadores do agente serão classificados juntos)</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${unkAgents.map(([name, info])=>{
          const safeId = 'diag_'+btoa(encodeURIComponent(name)).replace(/[^a-zA-Z0-9]/g,'').slice(0,20);
          return `<div style="background:var(--s2);border:1px solid var(--b2);border-radius:9px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <span style="font-family:'JetBrains Mono',monospace;color:var(--t1);font-size:.82rem;font-weight:600;">${name||'(sem nome)'}</span>
              <span style="color:var(--t3);font-size:.74rem;margin-left:8px;">${info.count} jogador${info.count!==1?'es':''}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:.72rem;color:var(--t3);">Vincular a:</span>
              ${CLUBS.map(c=>{const m=CMETA[c];return`<button 
                onclick="diagLink('${name.replace(/'/g,"\\'")}','${c}','${safeId}')"
                id="dlb_${safeId}_${c}"
                style="background:var(--s3);border:1px solid var(--b2);color:var(--t2);padding:4px 11px;border-radius:12px;cursor:pointer;font-size:.74rem;font-family:'Outfit',sans-serif;transition:all .15s"
                onmouseover="this.style.color='var(--gold)';this.style.borderColor='var(--gold)'"
                onmouseout="if(!this.classList.contains('dlb-active')){this.style.color='var(--t2)';this.style.borderColor='var(--b2)'}"
              >${m.icon} ${c}</button>`;}).join('')}
              <span id="dlb_status_${safeId}" style="font-size:.74rem;color:var(--t3);">Pendente</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : `<div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:.82rem;color:var(--green);">✅ Todos os agentes foram identificados automaticamente!</div>`}

    <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:14px 16px;">
      <div style="font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t3);margin-bottom:10px;">✅ Agentes Classificados (${okAgents.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:7px;">
        ${okAgents.map(([name,info])=>{
          const m=CMETA[info.clube]||CMETA['?'];
          return`<div style="background:var(--s3);border-radius:7px;padding:5px 11px;display:flex;align-items:center;gap:6px;font-size:.75rem;">
            <span>${m.icon}</span>
            <span style="color:${m.color};font-weight:600;">${info.clube}</span>
            <span style="color:var(--t2);">${name||'?'}</span>
            <span style="color:var(--t3);">(${info.count})</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
  panel.style.display='block';
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}

function diagLink(agentName, clube, safeId){
  saveManualLink(agentName.toUpperCase().trim(), clube);
  // Visual feedback
  CLUBS.forEach(c=>{
    const btn=document.getElementById(`dlb_${safeId}_${c}`);
    if(!btn)return;
    btn.classList.remove('dlb-active');
    btn.style.background='var(--s3)';btn.style.color='var(--t2)';btn.style.borderColor='var(--b2)';
  });
  const m=CMETA[clube]||{};
  const activeBtn=document.getElementById(`dlb_${safeId}_${clube}`);
  if(activeBtn){activeBtn.classList.add('dlb-active');activeBtn.style.background=`rgba(240,180,41,.15)`;activeBtn.style.color='var(--gold)';activeBtn.style.borderColor='var(--gold)';}
  const st=document.getElementById(`dlb_status_${safeId}`);
  if(st){st.textContent=`✓ ${m.icon} ${clube}`;st.style.color='var(--green)';}
  updateSidebar();
  showToast(`✅ ${agentName} → ${clube}`);
}

function resetImport(){
  rawHeaders=[];rawRows=[];
  dz.classList.remove('loaded');
  document.getElementById('dropIcon').textContent='📊';
  document.getElementById('dropTitle').textContent='Arraste a planilha aqui ou clique para selecionar';
  document.getElementById('dropSub').textContent='Planilha geral com todos os jogadores de todos os clubes';
  document.getElementById('mapperCard').classList.remove('show');
}

