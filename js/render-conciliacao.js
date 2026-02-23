// ══════════════════════════════════════════════════════════════════════
//  render-conciliacao.js — OFX + ChipPix (Poker Manager)
//  Depende de: dataLayer.js, utils.js, app-state.js, render-rakeback.js, render-financeiro.js
// ══════════════════════════════════════════════════════════════════════

function getOFXMap(){ return DataLayer.getOFXMap(); }
function saveOFXMap(m){ DataLayer.saveOFXMap(m); }

// Sessão OFX: persiste por clube+semana, sobrevive a fechar o modal
function ofxSessaoKey(){ return 'pm_ofx||'+(activeClube||'')+'||'+(weeks[selWeekIdx]||'0'); }
function getOFXSessao(){ return DataLayer.getOFXSessao(ofxSessaoKey()); }
function saveOFXSessao(arr){ DataLayer.saveOFXSessao(ofxSessaoKey(), arr); }

// ── Categorias personalizadas ─────────────────────────────
function getTransactionCategories(){
  try{
    const saved = DataLayer.getTransactionCategories() || [];
    const defIds=DEFAULT_CATS.map(c=>c.id);
    const extras=(Array.isArray(saved) ? saved : []).filter(c=>!defIds.includes(c.id));
    return [...DEFAULT_CATS,...extras];
  }catch(e){ return [...DEFAULT_CATS]; }
}
function saveTransactionCategories(cats){
  DataLayer.saveTransactionCategories(cats.filter(c=>c.deletable));
}

// ── Opções de entidade por categoria ──────────────────────
function getOFXEntityOptions(categoria){
  const entities=calcFinEntities();
  const cp=allPlayers.filter(p=>p.clube===activeClube);

  // Mapa: nome agente → p.aid (ID numérico da plataforma)
  const agPlatId={};
  cp.forEach(p=>{
    const an=(p.aname||'').trim();
    const aid=(p.aid||'').trim();
    if(an && aid && aid!=='0') agPlatId[an]=aid;
  });

  function enrich(e){
    if(e.tipo==='agente'){
      return {...e, platformId: agPlatId[e.nome]||''};
    }
    if(e.tipo==='jogador'){
      // encontra o jogador pelo entityId gerado
      const rawPl=cp.find(p=>makeEntityId('pl',p.id||p.nick)===e.id);
      return {...e, platformId: rawPl ? (rawPl.id||'') : ''};
    }
    return {...e, platformId:''};
  }

  switch(categoria){
    case 'agentes':   return entities.filter(e=>e.tipo==='agente').map(enrich);
    case 'jogadores': return entities.filter(e=>e.tipo==='jogador').map(enrich);
    case 'clubes':    return CLUBS.filter(c=>c!==activeClube).map(c=>({id:'_clube_'+c,nome:c,tipo:'clube',platformId:''}));
    case 'outros':    return entities.map(enrich);
    default:          return [];
  }
}

// ── Auto-categorização por memo ───────────────────────────
function autoCategorizarOFX(tx){
  const m=normalizeMemo(tx.memo);
  const blank={categoria:null,entityId:null,entityLabel:null,subcategoria:null,fornecedor:null,platformId:null};
  if(!m) return blank;

  // 1. Memo map salvo
  const map=getOFXMap();
  if(map[m]){
    const saved=map[m];
    if(typeof saved==='string') return {...blank,categoria:'agentes',entityId:saved,entityLabel:null};
    return {...blank,...saved};
  }

  const cp=allPlayers.filter(p=>p.clube===activeClube);

  // 2. Match por ID numérico da plataforma: agente (p.aid)
  const seen=new Set();
  for(const p of cp){
    const aid=(p.aid||'').trim();
    const an=(p.aname||'').trim();
    if(!aid||aid==='0'||!an||seen.has(aid)) continue;
    seen.add(aid);
    if(m.includes(aid)){
      return {...blank,categoria:'agentes',entityId:makeEntityId('ag',an),entityLabel:an,platformId:aid};
    }
  }

  // 3. Match por ID numérico da plataforma: jogador (p.id)
  for(const p of cp){
    const pid=(p.id||'').trim();
    if(!pid) continue;
    if(m.includes(pid)){
      const eid=makeEntityId('pl',p.id||p.nick);
      return {...blank,categoria:'jogadores',entityId:eid,entityLabel:p.nick||p.id,platformId:pid};
    }
  }

  // 4. Match fuzzy por nome
  const entities=calcFinEntities();
  for(const e of entities){
    const norm=(e.nome||'').toLowerCase().replace(/[^a-z0-9]/g,'').substr(0,30);
    if(norm&&m.includes(norm)) return {...blank,categoria:e.tipo==='agente'?'agentes':'jogadores',entityId:e.id,entityLabel:e.nome};
  }

  // 5. Match por nome de clube
  for(const c of CLUBS){
    const norm=c.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(norm&&m.includes(norm)) return {...blank,categoria:'clubes',entityId:'_clube_'+c,entityLabel:c};
  }

  return blank;
}

// ── Normalização backward-compat de transação ─────────────
function normTx(t){
  if(!t.status){
    if(t.aplicado)       t.status='aplicado';
    else if(t.ignorado)  t.status='ignorado';
    else if(t.entityId)  t.status='vinculado';
    else                 t.status='pendente';
  }
  if(!t.dir) t.dir = (t.valor||0) >= 0 ? 'in' : 'out';
  if(!t.categoria && t.entityId){
    // legado: tinha entityId mas sem categoria → assume agentes
    t.categoria='agentes';
  }
  return t;
}

let _ofxFilterAtual = 'todos'; // legado (modal antigo)
let _ofxFilter    = 'todos';  // novo: 'todos'|'pendente'|'vinculado'|'aplicado'|'ignorado'|catId
let _ofxSearch    = '';
let _ofxCatFilter = null;     // categoria para filtro adicional

function abrirImportOFX(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  _ofxFilterAtual = 'todos';
  document.querySelectorAll('.ofx-filter').forEach(b=>b.classList.toggle('active',b.dataset.f==='todos'));
  document.getElementById('mOFX').classList.add('open');
  renderOFXModal();
}

// Abre modal e re-renderiza ao trocar de semana/clube
function renderOFXModal(){
  const txns  = getOFXSessao();
  const empty = document.getElementById('ofx-empty');
  const main  = document.getElementById('ofx-main');
  if(!txns.length){
    empty.style.display='block'; main.style.display='none';
    document.getElementById('ofx-bank-tabs').innerHTML='';
    return;
  }
  empty.style.display='none'; main.style.display='flex';

  // Abas dos bancos
  const bancos = [...new Set(txns.map(t=>t.banco))];
  document.getElementById('ofx-bank-tabs').innerHTML = bancos.map(b=>`
    <div class="ofx-bank-tab">
      🏦 ${b}
      <span style="background:rgba(59,130,246,.15);color:#60a5fa;padding:1px 6px;border-radius:10px;font-size:.62rem;">${txns.filter(t=>t.banco===b).length}</span>
      <button class="ofx-tab-x" onclick="removerBancoOFX('${b.replace(/'/g,"\\'")}')">✕</button>
    </div>`).join('');

  renderOFXTable();
}

function processOFX(input){
  const files = Array.from(input.files);
  if(!files.length) return;
  const existentes = getOFXSessao();
  const fitidsExist = new Set(existentes.map(t=>t.fitid));
  let totalNovos = 0;

  const lerArquivo = file => new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = e=>{
      try{
        const nomeArq = file.name.replace(/\.ofx$/i,'').replace(/_/g,' ');
        const novos   = parseOFX(e.target.result, nomeArq, fitidsExist);
        novos.forEach(t=>fitidsExist.add(t.fitid));
        totalNovos += novos.length;
        existentes.push(...novos);
      }catch(err){ showToast('❌ Erro em '+file.name+': '+err.message,'e'); }
      resolve();
    };
    reader.readAsText(file,'latin1');
  });

  Promise.all(files.map(lerArquivo)).then(()=>{
    saveOFXSessao(existentes);
    input.value=''; // permite re-upload do mesmo arquivo
    showToast(`✅ ${totalNovos} transaç${totalNovos===1?'ão':'ões'} importada${totalNovos===1?'':'s'}`);
    renderOFXModal();
    // Atualiza aba OFX da Conciliação (se ativa)
    const concOfxEl=document.getElementById('conc-ofx-content');
    if(concOfxEl) renderConcOFX();
  });
}

function removerBancoOFX(banco){
  saveOFXSessao(getOFXSessao().filter(t=>t.banco!==banco));
  renderOFXModal();
  showToast(`🗑 Extrato "${banco}" removido`);
}

function limparOFXAplicados(){
  saveOFXSessao(getOFXSessao().filter(t=>!t.aplicado));
  renderOFXModal();
  showToast('🗑 Transações aplicadas removidas');
}

function clearAllOFXBindings(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada — não é possível limpar','e'); return; }
  const sess = getOFXSessao();
  const total = sess.filter(t => t.entityId || t.aplicado).length;
  if(!total){ showToast('⚠️ Nenhum vínculo OFX para limpar','e'); return; }
  const aplicados = sess.filter(t => t.aplicado).length;
  let msg = 'Limpar todos os ' + total + ' vínculos OFX?';
  if(aplicados) msg += '\n⚠️ ' + aplicados + ' aplicado(s) serão revertidos do Financeiro.';
  if(!confirm(msg)) return;

  const wk = weeks[selWeekIdx] || '0';

  // 1) Remove staged OFX items
  let stg = getStaged();
  stg = stg.filter(s => !(s.method === 'ofx' && s.weekKey === wk && s.clube === activeClube));
  saveStaged(stg);

  // 2) Remove applied movements via deleteMovement (handles pm_movements + pm_fin)
  sess.forEach(t => {
    if(t.movementId) deleteMovement(t.movementId);
  });

  // 3) Fallback: clean orphaned OFX entries from pm_fin + pm_movements
  if(aplicados){
    const allData = getFinData();
    const key = finKey();
    if(allData[key]){
      Object.keys(allData[key]).forEach(eid => {
        allData[key][eid].historico = (allData[key][eid].historico || []).filter(h => h.origem !== 'OFX');
      });
      saveFinData(allData);
    }
    let mvs = getMovements();
    mvs = mvs.filter(m => !(m.method === 'ofx' && m.weekKey === wk && m.clube === activeClube));
    saveMovements(mvs);
  }

  // 4) Reset session state (keep transactions, clear bindings)
  let cnt = 0;
  sess.forEach(t => {
    if(t.entityId || t.aplicado){
      t.entityId = null;
      t.entityLabel = null;
      t.categoria = null;
      t.subcategoria = null;
      t.fornecedor = null;
      t.status = 'pendente';
      t.aplicado = false;
      t.movementId = null;
      t.stagedId = null;
      t.ignorado = false;
      cnt++;
    }
  });
  saveOFXSessao(sess);
  renderConcOFX();
  if(aplicados){ renderFinanceiro(); renderFechamentos(); }
  showToast('🗑 ' + cnt + ' vínculo' + (cnt !== 1 ? 's' : '') + ' OFX removido' + (cnt !== 1 ? 's' : ''));
}

function parseOFX(raw, nomeArq, fitidsExist){
  const txns  = [];
  const blocos= raw.match(/<STMTTRN[\s\S]*?<\/STMTTRN>|<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>)/gi)||[];
  const bankM = raw.match(/<(?:FI>[\s\S]*?<ORG>|ORG>)([^<\r\n]+)/i);
  const banco = bankM ? bankM[1].trim() : nomeArq;

  blocos.forEach(bloco=>{
    const get = tag=>{ const m=bloco.match(new RegExp('<'+tag+'>([^<\\r\\n]+)','i')); return m?m[1].trim():''; };
    const fitid = get('FITID');
    const valor = parseFloat(get('TRNAMT').replace(',','.'));
    const memo  = get('MEMO')||get('NAME')||'';
    const payee = get('PAYEE')||get('PAYEE2')||'';
    const refnum = get('REFNUM')||get('CHECKNUM')||'';
    const dtRaw = get('DTPOSTED');
    if(isNaN(valor)||valor===0) return;
    if(fitidsExist?.has(fitid)) return; // dedup cross-arquivo
    const y=dtRaw.substr(0,4),mo=dtRaw.substr(4,2),d=dtRaw.substr(6,2);
    const dt = new Date(`${y}-${mo}-${d}`).getTime();
    // Memo enriquecido: inclui PAYEE se existir e não for redundante com MEMO
    const memoFull = payee && !memo.toLowerCase().includes(payee.toLowerCase().substr(0,8))
      ? memo + ' · ' + payee : memo;
    const rawTx = { fitid, dt, memo: memoFull, valor, banco };
    const dir   = valor >= 0 ? 'in' : 'out';
    const ac    = autoCategorizarOFX(rawTx);
    const status = ac.entityId ? 'vinculado' : 'pendente';
    txns.push({ fitid, dt, memo: memoFull, valor, banco, dir,
      payee: payee || null, refnum: refnum || null, nota: null,
      categoria:    ac.categoria    || null,
      entityId:     ac.entityId     || null,
      entityLabel:  ac.entityLabel  || null,
      platformId:   ac.platformId   || null,
      subcategoria: ac.subcategoria || null,
      fornecedor:   ac.fornecedor   || null,
      status, movementId: null,
      ignorado: false, aplicado: false });
  });
  return txns.sort((a,b)=>b.dt-a.dt);
}

function normalizeMemo(memo){
  return (memo||'').toLowerCase().replace(/[^a-z0-9]/g,'').substr(0,30);
}

function renderOFXTable(){
  const txns    = getOFXSessao();
  const entities= calcFinEntities();
  const f       = _ofxFilterAtual;

  const total  = txns.length;
  const vinc   = txns.filter(t=>t.entityId&&!t.ignorado&&!t.aplicado).length;
  const aplic  = txns.filter(t=>t.aplicado).length;
  const pend   = txns.filter(t=>!t.entityId&&!t.ignorado&&!t.aplicado).length;
  const entrou = txns.filter(t=>t.valor>0&&!t.ignorado).reduce((s,t)=>s+t.valor,0);

  document.getElementById('ofx-summary').innerHTML=`
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">Transações</div><div style="font-weight:800;color:var(--t1);font-size:.82rem;">${total}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">Entradas</div><div style="font-weight:800;color:#10b981;font-size:.82rem;">R$ ${fV(entrou,false)}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">✅ Vinculados</div><div style="font-weight:800;color:#10b981;font-size:.82rem;">${vinc}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">💳 Aplicados</div><div style="font-weight:800;color:#818cf8;font-size:.82rem;">${aplic}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">⏳ Pendentes</div><div style="font-weight:800;color:#fb923c;font-size:.82rem;">${pend}</div></div>`;

  const opts=`<option value="">— Selecionar —</option>
    <optgroup label="🤝 Agentes">${entities.filter(e=>e.tipo==='agente').map(e=>`<option value="${e.id}">${e.nome}</option>`).join('')}</optgroup>
    <optgroup label="👤 Jogadores Diretos">${entities.filter(e=>e.tipo==='jogador').map(e=>`<option value="${e.id}">${e.nome}</option>`).join('')}</optgroup>`;

  const vis = txns.filter(t=>{
    if(f==='vinculado') return t.entityId&&!t.ignorado&&!t.aplicado;
    if(f==='aplicado')  return t.aplicado;
    if(f==='pendente')  return !t.entityId&&!t.ignorado&&!t.aplicado;
    if(f==='ignorado')  return t.ignorado;
    return true;
  });

  const tbody=document.getElementById('ofx-tbody');
  if(!vis.length){
    tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--t3);font-size:.8rem;">Nenhuma transação nesta categoria</td></tr>`;
  } else {
    tbody.innerHTML=vis.map(t=>{
      const idx   = txns.indexOf(t);
      const corVal= t.valor>0?'#10b981':'#ef4444';
      const sinal = t.valor>0?'+':'−';
      const dtFmt = new Date(t.dt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      const clsRow= t.aplicado?'aplicado':t.ignorado?'ignorado':'';
      let badge;
      if(t.aplicado)      badge='<span class="ofx-badge-aplic">💳 Aplicado</span>';
      else if(t.ignorado) badge='<span class="ofx-badge-ign">🚫 Ignorado</span>';
      else if(t.entityId) badge=`<span class="ofx-badge-vinc">✅ ${entities.find(e=>e.id===t.entityId)?.nome||t.entityId}</span>`;
      else                badge='<span class="ofx-badge-pend">⏳ Pendente</span>';
      const bancoTag=`<span style="background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.15);color:#60a5fa;padding:1px 6px;border-radius:4px;font-size:.62rem;font-weight:600;margin-right:5px;">${t.banco}</span>`;
      const optsSel=opts.replace(`value="${t.entityId||''}"`,`value="${t.entityId||''}" selected`);
      return `<tr class="ofx-row ${clsRow}">
        <td style="color:var(--t3);white-space:nowrap;font-size:.73rem;">${dtFmt}</td>
        <td>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-bottom:3px;">${bancoTag}<span style="font-weight:600;color:var(--t1);font-size:.76rem;">${t.memo||'(sem descrição)'}</span></div>
          <div>${badge}</div>
        </td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${corVal};white-space:nowrap;font-size:.8rem;">R$ ${fV(t.valor,false)}</td>
        <td>${t.ignorado||t.aplicado
          ?`<span style="color:var(--t3);font-size:.7rem;">—</span>`
          :`<select class="ofx-entity-select" onchange="vincularOFX(${idx},this.value)">${optsSel}</select>`}
        </td>
        <td style="text-align:center;">${t.aplicado
          ?`<span style="font-size:.68rem;color:var(--t3);">✓</span>`
          :t.ignorado
            ?`<button class="ofx-btn-ign" onclick="ignorarOFX(${idx},false)" title="Desfazer">↩</button>`
            :`<button class="ofx-btn-ign" onclick="ignorarOFX(${idx},true)" title="Ignorar">🚫</button>`}
        </td>
      </tr>`;
    }).join('');
  }

  const prontos=txns.filter(t=>t.entityId&&!t.ignorado&&!t.aplicado&&t.valor>0);
  document.getElementById('ofx-match-count').textContent=`${vinc} vinculados · ${aplic} aplicados · ${pend} pendentes`;
  document.getElementById('ofx-footer-info').textContent=prontos.length
    ?`${prontos.length} pronto${prontos.length!==1?'s':''} · R$ ${fV(prontos.reduce((s,t)=>s+t.valor,0),false)}`
    :'Vincule transações para aplicar';
  const btn=document.getElementById('ofx-btn-confirmar');
  btn.disabled=prontos.length===0;
  btn.style.opacity=prontos.length?'1':'.5';
  btn.style.cursor=prontos.length?'pointer':'not-allowed';
}

function vincularOFX(idx, entityId){
  const txns=getOFXSessao();
  txns[idx].entityId=entityId||null;
  if(entityId){
    const map=getOFXMap();
    const key=normalizeMemo(txns[idx].memo);
    if(key){map[key]=entityId;saveOFXMap(map);}
  }
  saveOFXSessao(txns); // persiste imediatamente
  renderOFXTable();
}

function ignorarOFX(idx, ignorar){
  const txns=getOFXSessao();
  txns[idx].ignorado=ignorar;
  if(ignorar) txns[idx].entityId=null;
  saveOFXSessao(txns);
  renderOFXTable();
}

function filtrarOFX(btn, filtro){
  _ofxFilterAtual=filtro;
  document.querySelectorAll('.ofx-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderOFXTable();
}

function confirmarConciliacao(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const txns=getOFXSessao();
  let staged=0, dups=0;

  txns.forEach((t,idx)=>{
    if(!t.entityId||t.ignorado||t.aplicado||t.valor<=0) return;

    const result = createStagedMovement({
      weekKey:     weeks[selWeekIdx] || '0',
      clube:       activeClube,
      entityId:    t.entityId,
      dir:         'in',
      amount:      t.valor,
      method:      'ofx',
      bankId:      t.banco || null,
      externalId:  t.fitid || null,
      date:        t.dt || Date.now(),
      description: 'OFX · '+(t.memo||'PIX')+' · '+fV(t.valor,false)
    });

    if(result.ok){
      txns[idx].aplicado = true;
      txns[idx].stagedId = result.staged.id;
      staged++;
    } else if(result.reason === 'duplicate'){
      txns[idx].aplicado = true;
      dups++;
    }
  });

  saveOFXSessao(txns);
  renderOFXTable();
  renderFinanceiro();
  if(staged>0)
    showToast('📌 '+staged+' lançamento'+(staged!==1?'s':'')+' OFX enviado'+(staged!==1?'s':'')+' para Pendentes'+(dups?' ('+dups+' dup)':''));
  else if(dups>0)
    showToast('ℹ️ Todos já existiam (anti-dup)');
  else
    showToast('⚠️ Nenhum registro enviado','e');
}


// ══════════════════ OFX — NOVO FLUXO ══════════════════════

// ── Aplicar transação individual diretamente ao ledger ────
function aplicarOFX(fitid){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  const t=normTx(sess[idx]);
  if(t.status==='aplicado'){ showToast('ℹ️ Já aplicado'); return; }

  // Determinar entityId efetivo
  let eid=t.entityId;
  if(!eid){
    if(t.categoria==='liga')          eid='_liga';
    else if(t.categoria==='despesas') eid='_despesa_'+(t.subcategoria||'outros');
    else{ showToast('⚠️ Vincule a transação antes de aplicar','e'); return; }
  }

  const result=createMovement({
    weekKey:     weeks[selWeekIdx]||'0',
    clube:       activeClube,
    entityId:    eid,
    dir:         t.dir||'in',
    amount:      Math.abs(t.valor),
    method:      'ofx',
    externalId:  'ofx_'+t.fitid,
    date:        t.dt||Date.now(),
    description: t.memo+(t.fornecedor?' · '+t.fornecedor:'')
  });

  if(result.ok){
    sess[idx].status    = 'aplicado';
    sess[idx].aplicado  = true;
    sess[idx].movementId= result.movement?.id||null;
    // Memorizar no memo-map
    if(t.categoria){
      const map=getOFXMap();
      map[normalizeMemo(t.memo)]={
        categoria:t.categoria, entityId:t.entityId,
        entityLabel:t.entityLabel, platformId:t.platformId||null,
        subcategoria:t.subcategoria, fornecedor:t.fornecedor
      };
      saveOFXMap(map);
    }
    saveOFXSessao(sess);
    renderConcOFX();
    renderFechamentos();
    showToast('✅ Transação aplicada ao Ledger');
  } else {
    showToast('⚠️ '+result.msg,'e');
  }
}

// ── Reverter transação já aplicada ────────────────────────
function reverterOFX(fitid){
  if(isWeekLocked()){ showToast('🔒 Semana lockada — não é possível reverter','e'); return; }
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  const t=normTx(sess[idx]);
  if(t.status!=='aplicado'){ showToast('ℹ️ Transação não está aplicada'); return; }

  // Remover via movementId ou busca por externalId
  const mvId=t.movementId;
  if(mvId){
    deleteMovement(mvId);
  } else {
    // fallback: busca por externalId
    const mvs=getMovements();
    const mv=mvs.find(m=>m.externalId==='ofx_'+fitid);
    if(mv) deleteMovement(mv.id);
  }

  sess[idx].status    = 'vinculado';
  sess[idx].aplicado  = false;
  sess[idx].movementId= null;
  saveOFXSessao(sess);
  renderConcOFX();
  renderFechamentos();
  showToast('↩ Transação revertida');
}

// ── Helpers inline para a tabela OFX ─────────────────────
function ofxSetCategoria(fitid, catId){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].categoria   = catId||null;
  // Limpar entidade se categoria mudou (contexto diferente)
  sess[idx].entityId    = null;
  sess[idx].entityLabel = null;
  sess[idx].subcategoria= null;
  sess[idx].fornecedor  = null;
  if(sess[idx].status==='vinculado') sess[idx].status='pendente';
  saveOFXSessao(sess);
  renderConcOFX();
}

function ofxSetEntity(fitid, entityId, entityLabel, platformId){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].entityId    = entityId||null;
  sess[idx].entityLabel = entityLabel||null;
  sess[idx].platformId  = platformId||null;
  sess[idx].status      = entityId ? 'vinculado' : 'pendente';
  saveOFXSessao(sess);
  renderConcOFX();
}

function ofxSetSub(fitid, subcategoria){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].subcategoria=subcategoria||null;
  // despesas: status = vinculado mesmo sem entityId
  if(sess[idx].categoria==='despesas'||sess[idx].categoria==='liga')
    sess[idx].status='vinculado';
  saveOFXSessao(sess);
  renderConcOFX();
}

function ofxSetFornecedor(fitid, v){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].fornecedor=v||null;
  saveOFXSessao(sess);
  // Não re-renderiza a tabela inteira (campo texto — perde foco)
}

let _ofxNotaOpenFitid = null;

function ofxOpenNota(fitid){
  _ofxNotaOpenFitid = fitid;
  renderConcOFX();
  setTimeout(()=>{ const el=document.getElementById('ofx-nota-'+fitid.replace(/\\/g,'\\\\').replace(/'/g,"\\'")); if(el) el.focus(); }, 50);
}

function ofxCloseNota(fitid){
  _ofxNotaOpenFitid = null;
  renderConcOFX();
}

function ofxConfirmNota(fitid){
  const el=document.getElementById('ofx-nota-'+fitid.replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
  const v=(el?el.value:'').trim();
  if(!v){ showToast('⚠️ Digite a anotação antes de confirmar','e'); return; }
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  sess[idx].nota=v;
  sess[idx].notaLocked=true;
  saveOFXSessao(sess);
  _ofxNotaOpenFitid = null;
  renderConcOFX();
}

function ofxUnlockNota(fitid){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  sess[idx].notaLocked=false;
  saveOFXSessao(sess);
  _ofxNotaOpenFitid = fitid;
  renderConcOFX();
}

function ofxIgnorar(fitid){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].status  = 'ignorado';
  sess[idx].ignorado= true;
  saveOFXSessao(sess);
  renderConcOFX();
}

function ofxRestaurar(fitid){
  const sess=getOFXSessao();
  const idx=sess.findIndex(t=>t.fitid===fitid);
  if(idx===-1) return;
  normTx(sess[idx]);
  sess[idx].status  = sess[idx].entityId ? 'vinculado' : 'pendente';
  sess[idx].ignorado= false;
  saveOFXSessao(sess);
  renderConcOFX();
}

function ofxAplicarTodos(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const sess=getOFXSessao().map(normTx);
  const prontos=sess.filter(t=>t.status==='vinculado');
  if(!prontos.length){ showToast('⚠️ Nenhuma transação vinculada para aplicar','e'); return; }
  let ok=0, dups=0, erros=0;
  prontos.forEach(t=>{
    let eid=t.entityId;
    if(!eid){
      if(t.categoria==='liga')          eid='_liga';
      else if(t.categoria==='despesas') eid='_despesa_'+(t.subcategoria||'outros');
      else{ erros++; return; }
    }
    const result=createMovement({
      weekKey:weeks[selWeekIdx]||'0', clube:activeClube,
      entityId:eid, dir:t.dir||'in', amount:Math.abs(t.valor),
      method:'ofx', externalId:'ofx_'+t.fitid, date:t.dt||Date.now(),
      description:t.memo+(t.fornecedor?' · '+t.fornecedor:'')
    });
    if(result.ok){
      t.status='aplicado'; t.aplicado=true; t.movementId=result.movement?.id||null;
      if(t.categoria){
        const map=getOFXMap();
        map[normalizeMemo(t.memo)]={categoria:t.categoria,entityId:t.entityId,entityLabel:t.entityLabel,platformId:t.platformId||null,subcategoria:t.subcategoria,fornecedor:t.fornecedor};
        saveOFXMap(map);
      }
      ok++;
    } else if(result.reason==='duplicate'){ t.status='aplicado'; t.aplicado=true; dups++; }
    else erros++;
  });
  saveOFXSessao(sess);
  renderConcOFX();
  renderFechamentos();
  if(ok>0) showToast('✅ '+ok+' transaç'+(ok===1?'ão':'ões')+' aplicada'+(ok===1?'':'s')+(dups?' ('+dups+' dup)':''));
  else if(dups>0) showToast('ℹ️ Todas já existiam (anti-dup)');
  else showToast('⚠️ Nenhuma aplicada — verifique vínculos','e');
}

// ── OFX Entity Picker (dropdown pesquisável) ─────────────
let _ofxPickerFitid   = null;
let _ofxPickerOptions = [];

function ensureOFXPicker(){
  if(document.getElementById('ofx-entity-picker')) return;
  const d=document.createElement('div');
  d.id='ofx-entity-picker';
  d.style.cssText='position:fixed;display:none;background:var(--s2);border:1px solid var(--b2);border-radius:9px;z-index:99999;min-width:290px;max-width:380px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  d.innerHTML=`
    <div style="padding:8px 8px 4px;">
      <input id="ofx-ep-search" placeholder="🔍 Buscar ID ou nome..." autocomplete="off"
        style="width:100%;background:var(--s1);border:1px solid var(--b1);color:var(--t1);border-radius:6px;padding:6px 10px;font-size:.72rem;box-sizing:border-box;outline:none;"
        oninput="ofxPickerFilter(this.value)">
    </div>
    <div id="ofx-ep-list" style="max-height:240px;overflow-y:auto;padding:4px;"></div>`;
  document.body.appendChild(d);
  // Fechar ao clicar fora
  document.addEventListener('click', function(e){
    const p=document.getElementById('ofx-entity-picker');
    if(p&&p.style.display!=='none'&&!p.contains(e.target)) ofxClosePicker();
  }, true);
}

function ofxOpenEntityPicker(fitid, catId, btnEl){
  ensureOFXPicker();
  _ofxPickerFitid   = fitid;
  _ofxPickerOptions = getOFXEntityOptions(catId);
  const searchEl=document.getElementById('ofx-ep-search');
  if(searchEl) searchEl.value='';
  ofxPickerFilter('');
  const picker=document.getElementById('ofx-entity-picker');
  picker.style.display='block';
  // Posicionar próximo ao botão
  const rect=btnEl.getBoundingClientRect();
  const pw=340;
  let left=rect.left, top=rect.bottom+4;
  if(left+pw>window.innerWidth) left=window.innerWidth-pw-8;
  if(top+280>window.innerHeight) top=rect.top-284;
  picker.style.left=Math.max(4,left)+'px';
  picker.style.top=Math.max(4,top)+'px';
  setTimeout(()=>{ document.getElementById('ofx-ep-search')?.focus(); }, 40);
}

function ofxPickerFilter(q){
  const lq=(q||'').toLowerCase();
  const opts=_ofxPickerOptions.filter(e=>
    !lq ||
    (e.nome||'').toLowerCase().includes(lq) ||
    (e.platformId||'').includes(lq)
  );
  const list=document.getElementById('ofx-ep-list');
  if(!list) return;
  if(!opts.length){
    list.innerHTML='<div style="padding:14px;text-align:center;font-size:.72rem;color:var(--t3);">Nenhum resultado</div>';
    return;
  }
  list.innerHTML=opts.map(e=>{
    const fid=(_ofxPickerFitid||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const eid=(e.id||'').replace(/'/g,"\\'");
    const eln=(e.nome||'').replace(/'/g,"\\'");
    const pid=(e.platformId||'').replace(/'/g,"\\'");
    const icon=e.tipo==='agente'?'🤝':e.tipo==='clube'?'🔄':'🎮';
    const platDisplay=e.platformId||'—';
    return `<div onclick="ofxPickerSelect('${fid}','${eid}','${eln}','${pid}')"
      style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent;"
      onmouseenter="this.style.background='rgba(255,255,255,.06)';this.style.borderColor='rgba(255,255,255,.06)'"
      onmouseleave="this.style.background='transparent';this.style.borderColor='transparent'">
      <span style="font-size:.82rem;flex-shrink:0;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.76rem;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.nome}</div>
        <div style="font-size:.64rem;color:var(--t3);font-family:'JetBrains Mono',monospace;margin-top:2px;">${platDisplay}</div>
      </div>
    </div>`;
  }).join('');
}

function ofxPickerSelect(fitid, entityId, entityLabel, platformId){
  ofxSetEntity(fitid, entityId, entityLabel, platformId);
  ofxClosePicker();
}

function ofxClosePicker(){
  const p=document.getElementById('ofx-entity-picker');
  if(p) p.style.display='none';
  _ofxPickerFitid=null;
}

// ══════════════════ CONCILIAÇÃO CHIPPIX ══════════════════

// Mapeamento persistido: chipPixId → entityId
function getCPMap(){ return DataLayer.getCPMap(); }
function saveCPMap(m){ DataLayer.saveCPMap(m); }

// Sessão ChipPix: persiste por clube+semana
function cpSessaoKey(){ return 'pm_cp||'+(activeClube||'')+'||'+(weeks[selWeekIdx]||'0'); }
function getCPSessao(){ return DataLayer.getCPSessao(cpSessaoKey()); }
function saveCPSessao(arr){ DataLayer.saveCPSessao(cpSessaoKey(), arr); }

let _cpFilterAtual = 'todos';

function abrirChipPix(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  _cpFilterAtual = 'todos';
  document.querySelectorAll('.cp-filter').forEach(b=>b.classList.toggle('active',b.dataset.f==='todos'));
  document.getElementById('mChipPix').classList.add('open');
  setTimeout(()=>{ const s=document.getElementById('cp-search'); if(s) s.value=''; },50);
  renderCPModal();
}

function renderCPModal(){
  const rows  = getCPSessao();
  const empty = document.getElementById('cp-empty');
  const main  = document.getElementById('cp-main');
  if(!rows.length){
    empty.style.display='block'; main.style.display='none';
    return;
  }
  empty.style.display='none'; main.style.display='flex';
  renderCPTable();
}

function processChipPix(input){
  if(isWeekLocked()){ showToast('🔒 Semana lockada — não é possível importar','e'); input.value=''; return; }
  const file = input.files[0];
  if(!file) return;

  // Usa SheetJS (XLSX) disponível via CDN no artifact
  if(typeof XLSX === 'undefined'){
    // Carrega SheetJS dinamicamente se não disponível
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => lerExcelCP(file);
    s.onerror = () => showToast('❌ Não foi possível carregar leitor de Excel. Verifique sua conexão.','e');
    document.head.appendChild(s);
  } else {
    lerExcelCP(file);
  }
  input.value='';
}

// ── Smart ID matching for ChipPix ──
// Handles cases like ChipPix "1610051AG" vs GU spreadsheet "1610051"
// Strategy: exact → numeric prefix → contains
function _cpFindPlayerMatch(idJog, clubePlayers){
  const cpId = String(idJog||'').trim();
  if(!cpId) return null;

  // 1) Exact match on p.id or p.aid
  let pl = clubePlayers.find(p=>{
    const idStr  = String(p.id ||'').trim();
    const aidStr = String(p.aid||'').trim();
    return (idStr && idStr === cpId) || (aidStr && aidStr === cpId);
  });
  if(pl) return pl;

  // 2) Numeric prefix match: extract leading digits from ChipPix ID
  //    e.g. "1610051AG" → "1610051", then match against p.id "1610051"
  const cpNumPrefix = cpId.match(/^(\d+)/);
  if(cpNumPrefix && cpNumPrefix[1].length >= 4){
    const numPart = cpNumPrefix[1];
    pl = clubePlayers.find(p=>{
      const idStr  = String(p.id ||'').trim();
      const aidStr = String(p.aid||'').trim();
      return (idStr && idStr === numPart) || (aidStr && aidStr === numPart);
    });
    if(pl) return pl;
  }

  // 3) Reverse: player ID contains ChipPix ID or vice-versa (min 5 chars)
  if(cpId.length >= 5){
    pl = clubePlayers.find(p=>{
      const idStr  = String(p.id ||'').trim();
      const aidStr = String(p.aid||'').trim();
      return (idStr.length >= 5 && (idStr.includes(cpId) || cpId.includes(idStr)))
          || (aidStr.length >= 5 && (aidStr.includes(cpId) || cpId.includes(aidStr)));
    });
    if(pl) return pl;
  }

  return null;
}

function lerExcelCP(file){
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type:'array' });
      // Busca aba Operações (ou pega a primeira)
      const sheetName = wb.SheetNames.find(n=>n.toLowerCase().includes('opera')) || wb.SheetNames[0];
      const ws   = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

      if(data.length < 2){ showToast('⚠️ Planilha vazia ou formato inválido','e'); return; }

      // Cabeçalho esperado: Data, Tipo, Finalidade, Entrada bruta, Saida bruta, Entrada liquida, Saida liquida, Integrante, Taxa, Id Jogador, ...
      const header = data[0].map(h=>String(h).toLowerCase().trim());
      const iData  = 0;  // col Data
      const iTipo  = header.findIndex(h=>h==='tipo');
      const iEnt   = header.findIndex(h=>h.includes('entrada bruta'));
      const iSai   = header.findIndex(h=>h.includes('saida bruta') || h.includes('saída bruta'));
      const iTaxa  = header.findIndex(h=>h.includes('taxa'));
      const iNome  = header.findIndex(h=>h==='integrante');
      const iId    = header.findIndex(h=>h.includes('id jogador'));

      if(iId===-1){ showToast('❌ Coluna "Id Jogador" não encontrada. Verifique o arquivo.','e'); return; }

      // Agrupa por Id Jogador
      const grupos = {};
      for(let i=1;i<data.length;i++){
        const row  = data[i];
        const idJog= String(row[iId]).trim();
        if(!idJog || idJog==='' || idJog==='0') continue;

        const ent  = parseFloat(String(row[iEnt]).replace(',','.')) || 0;
        const sai  = parseFloat(String(row[iSai]).replace(',','.')) || 0;
        const taxa = parseFloat(String(row[iTaxa]).replace(',','.')) || 0;
        const nome = String(row[iNome]).trim();
        const data_= String(row[iData]).substring(0,10);

        if(!grupos[idJog]) grupos[idJog] = { idJog, nome, entrada:0, saida:0, taxa:0, txns:0, datas:[] };
        grupos[idJog].nome     = nome || grupos[idJog].nome;
        grupos[idJog].entrada += ent;
        grupos[idJog].saida   += sai;
        grupos[idJog].taxa    += taxa;
        grupos[idJog].txns++;
        if(data_ && !grupos[idJog].datas.includes(data_)) grupos[idJog].datas.push(data_);
      }

      // Auto-vinculação: cruza idJog com p.id dos jogadores do clube
      // Matching inteligente: exato → prefixo numérico → contém
      const clubePlayers = allPlayers.filter(p=>p.clube===activeClube);
      const map = getCPMap();

      const sessao = Object.values(grupos).map(g=>{
        // 1º: mapeamento manual salvo (mais confiável)
        let entityId = map[g.idJog] || null;

        // 2º: cruza com p.id OU p.aid (ID do aplicativo) dos jogadores do clube
        if(!entityId){
          const pl = _cpFindPlayerMatch(g.idJog, clubePlayers);
          if(pl){
            const agKey = (pl.aname||'(sem agente)').trim();
            const agId  = makeEntityId('ag', agKey);
            entityId = `pl_${pl.id}|${agId}`;
            map[g.idJog] = entityId; // salva pro próximo import
          }
        }

        return { ...g, saldo: g.entrada-g.saida, entityId, ignorado:false, aplicado:false };
      }).sort((a,b)=>b.entrada-a.entrada);

      saveCPMap(map);

      if(!sessao.length){ showToast('⚠️ Nenhum jogador encontrado no arquivo','e'); return; }

      saveCPSessao(sessao);
      const autoVinc = sessao.filter(r=>r.entityId).length;
      const pendentes = sessao.length - autoVinc;
      showToast(`✅ ${sessao.length} jogadores · ${autoVinc} auto-vinculados${pendentes>0?' · ⏳ '+pendentes+' pendentes':' · Tudo vinculado!'}`);
      // Abre direto no filtro de pendentes se tiver, senão todos
      if(pendentes>0 && autoVinc>0){
        _cpFilterAtual='pendente';
        document.querySelectorAll('.cp-filter').forEach(b=>b.classList.toggle('active',b.dataset.f==='pendente'));
      }
      renderCPModal();
    } catch(err){
      console.error(err);
      showToast('❌ Erro ao ler planilha: '+err.message,'e');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderCPTable(){
  const rows    = getCPSessao();
  const entities= calcFinEntities();
  const f       = _cpFilterAtual;

  const total  = rows.length;
  const vinc   = rows.filter(r=>r.entityId&&!r.ignorado&&!r.aplicado).length;
  const aplic  = rows.filter(r=>r.aplicado).length;
  const pend   = rows.filter(r=>!r.entityId&&!r.ignorado&&!r.aplicado).length;
  const entTot = rows.filter(r=>!r.ignorado).reduce((s,r)=>s+r.entrada,0);
  const saiTot = rows.filter(r=>!r.ignorado).reduce((s,r)=>s+r.saida,0);

  document.getElementById('cp-summary').innerHTML=`
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">Jogadores</div><div style="font-weight:800;color:var(--t1);font-size:.82rem;">${total}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">📥 Total Entrada</div><div style="font-weight:800;color:#10b981;font-size:.82rem;">R$ ${fV(entTot,false)}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">📤 Total Saída</div><div style="font-weight:800;color:#f87171;font-size:.82rem;">R$ ${fV(saiTot,false)}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">💰 Saldo Líquido</div><div style="font-weight:800;color:${clr(entTot-saiTot)};font-size:.82rem;">R$ ${fV(entTot-saiTot,false)}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">✅ Vinculados</div><div style="font-weight:800;color:#10b981;font-size:.82rem;">${vinc}</div></div>
    <div><div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);margin-bottom:2px;">⏳ Pendentes</div><div style="font-weight:800;color:#fb923c;font-size:.82rem;">${pend}</div></div>`;

  // Monta dropdown com TODOS os jogadores do clube, agrupados por agente
  const cpPlayers = allPlayers.filter(p=>p.clube===activeClube);
  const agentGroups = {};
  cpPlayers.forEach(p=>{
    const ag = p.aname||'(sem agente)';
    if(!agentGroups[ag]) agentGroups[ag]=[];
    agentGroups[ag].push(p);
  });
  // Adiciona também jogadores diretos como grupo próprio
  const opts=`<option value="">— Selecionar jogador —</option>
    ${Object.entries(agentGroups).map(([agKey,players])=>
      `<optgroup label="🤝 ${agKey}">
        ${players.map(p=>`<option value="pl_${p.id}|${makeEntityId('ag',agKey)}">${p.nick||p.id} (ID: ${p.id})</option>`).join('')}
      </optgroup>`
    ).join('')}`;

  const busca = (document.getElementById('cp-search')?.value||'').toLowerCase().trim();

  const vis = rows.filter(r=>{
    if(f==='vinculado') return r.entityId&&!r.ignorado&&!r.aplicado;
    if(f==='aplicado')  return r.aplicado;
    if(f==='pendente')  return !r.entityId&&!r.ignorado&&!r.aplicado;
    if(f==='ignorado')  return r.ignorado;
    return true;
  }).filter(r=>{
    if(!busca) return true;
    return String(r.idJog).includes(busca) || r.nome.toLowerCase().includes(busca);
  });

  const tbody=document.getElementById('cp-tbody');
  if(!vis.length){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--t3);font-size:.8rem;">Nenhum jogador nesta categoria</td></tr>`;
  } else {
    tbody.innerHTML=vis.map(r=>{
      const idx   = rows.indexOf(r);
      const saldo = r.entrada - r.saida;
      const corSaldo= clr(saldo);
      const clsRow= r.aplicado?'aplicado':r.ignorado?'ignorado':'';

      let badge;
      if(r.aplicado)      badge='<span class="cp-badge-aplic">💳 Aplicado</span>';
      else if(r.ignorado) badge='<span class="cp-badge-ign">🚫 Ignorado</span>';
      else if(r.entityId) {
        // entityId formato: "pl_PLAYERID|ag_AGENTID" ou legado sem pipe
        const [plPart] = r.entityId.split('|');
        const plId = plPart.replace('pl_','');
        const pl = cpPlayers.find(p=>p.id===plId);
        badge=`<span class="cp-badge-vinc">✅ ${pl?pl.nick||pl.id:r.entityId}</span>`;
      }
      else                badge='<span class="cp-badge-pend">⏳ Pendente</span>';

      const txnsLabel=`${r.txns} op${r.txns!==1?'s':''}`;
      const dSorted = r.datas.slice().sort();
      const periodoLabel = dSorted.length ? dSorted[0].substring(5)+' → '+dSorted[dSorted.length-1].substring(5) : '';

      // Label do vinculado atual
      let vinculadoLabel = '— Selecionar jogador —';
      if(r.entityId){
        const [plPart] = r.entityId.split('|');
        const plId = plPart.replace('pl_','');
        const pl = cpPlayers.find(p=>p.id===plId);
        vinculadoLabel = pl ? `${pl.nick||pl.id} (ID: ${pl.id})` : r.entityId;
      }

      return `<tr class="cp-row ${clsRow}">
        <td>
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#60a5fa;font-size:.8rem;">${r.idJog}</div>
          <div style="font-size:.65rem;color:var(--t3);">${txnsLabel}${periodoLabel?' · '+periodoLabel:''}</div>
        </td>
        <td>
          <div style="font-weight:600;color:var(--t2);font-size:.76rem;">${r.nome}</div>
          <div style="margin-top:2px;">${badge}</div>
        </td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:#10b981;font-size:.8rem;">+R$ ${fV(r.entrada,false)}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:${r.saida>0?'#f87171':'var(--t3)'};font-size:.8rem;">${r.saida>0?'-R$ '+fV(r.saida,false):'—'}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:800;color:${corSaldo};font-size:.82rem;">R$ ${fV(saldo,false)}</td>
        <td style="min-width:200px;">
          ${r.ignorado||r.aplicado
            ? `<span style="color:var(--t3);font-size:.7rem;">—</span>`
            : `<div class="cp-dd" id="cpdd-${idx}">
                <div class="cp-dd-trigger ${r.entityId?'':'empty'}" onclick="toggleCPDD(${idx})" style="${r.entityId?'color:#10b981;border-color:rgba(16,185,129,.3);':''}">
                  <span>${vinculadoLabel}</span>
                  <span style="color:var(--t3);font-size:.65rem;flex-shrink:0;">▾</span>
                </div>
                <div class="cp-dd-panel" id="cpdd-panel-${idx}">
                  <input class="cp-dd-input" type="text" placeholder="🔍  Buscar por ID ou nome..." 
                    oninput="filterCPDD(${idx},this.value)" onkeydown="navCPDD(event,${idx})">
                  <div class="cp-dd-list" id="cpdd-list-${idx}"></div>
                </div>
              </div>`
          }
        </td>
        <td style="text-align:center;">${r.aplicado
          ?`<span style="font-size:.68rem;color:#818cf8;">✓</span>`
          :r.ignorado
            ?`<button class="cp-btn-ign" onclick="ignorarCP(${idx},false)">↩</button>`
            :`<button class="cp-btn-ign" onclick="ignorarCP(${idx},true)" title="Ignorar">🚫</button>`}
        </td>
      </tr>`;
    }).join('');
  }

  const prontos=rows.filter(r=>r.entityId&&!r.ignorado&&!r.aplicado);
  document.getElementById('cp-match-count').textContent=`${vinc} vinculados · ${aplic} aplicados · ${pend} pendentes`;
  document.getElementById('cp-footer-info').textContent=prontos.length
    ?`${prontos.length} pronto${prontos.length!==1?'s':''} · Saldo: R$ ${fV(prontos.reduce((s,r)=>s+(r.entrada-r.saida),0),false)}`
    :'Vincule ao menos um jogador para aplicar';
  const btn=document.getElementById('cp-btn-aplicar');
  btn.disabled=prontos.length===0;
  btn.style.opacity=prontos.length?'1':'.5';
  btn.style.cursor=prontos.length?'pointer':'not-allowed';
}

// ── Dropdown customizado ChipPix ──
let _cpDDOpen = null; // índice do dropdown aberto atualmente

function toggleCPDD(idx){
  const panel = document.getElementById(`cpdd-panel-${idx}`);
  if(!panel) return;
  const isOpen = panel.classList.contains('open');
  // Fecha todos os outros
  closeCPDDs();
  if(!isOpen){
    panel.classList.add('open');
    document.getElementById(`cpdd-${idx}`)?.querySelector('.cp-dd-trigger')?.classList.add('active');
    _cpDDOpen = idx;
    filterCPDD(idx,''); // popula a lista completa
    setTimeout(()=> panel.querySelector('.cp-dd-input')?.focus(), 50);
  }
}

function closeCPDDs(){
  document.querySelectorAll('.cp-dd-panel.open').forEach(p=>p.classList.remove('open'));
  document.querySelectorAll('.cp-dd-trigger.active').forEach(t=>t.classList.remove('active'));
  _cpDDOpen = null;
}

// Fecha ao clicar fora
document.addEventListener('click', e=>{
  if(_cpDDOpen !== null && !e.target.closest('.cp-dd')) closeCPDDs();
});

function filterCPDD(idx, query){
  const list = document.getElementById(`cpdd-list-${idx}`);
  if(!list) return;
  const q = query.toLowerCase().trim();
  const clubePlayers = allPlayers.filter(p=>p.clube===activeClube);
  const agentGroups = {};
  clubePlayers.forEach(p=>{
    const ag = p.aname||'(sem agente)';
    if(!agentGroups[ag]) agentGroups[ag]=[];
    agentGroups[ag].push(p);
  });

  let html = '';
  let total = 0;
  Object.entries(agentGroups).forEach(([agKey, players])=>{
    const filtered = players.filter(p=>{
      if(!q) return true;
      return String(p.id).includes(q) || (p.nick||'').toLowerCase().includes(q);
    });
    if(!filtered.length) return;
    const agId = makeEntityId('ag', agKey);
    html += `<div class="cp-dd-group">🤝 ${agKey}</div>`;
    filtered.forEach(p=>{
      const val = `pl_${p.id}|${agId}`;
      const idStr = String(p.id);
      const nick  = p.nick||p.id;
      // Highlight match
      const hiId   = q && idStr.includes(q)   ? idStr.replace(q,`<mark>${q}</mark>`)   : idStr;
      const hiNick = q && nick.toLowerCase().includes(q) ? nick.replace(new RegExp(q,'gi'),m=>`<mark>${m}</mark>`) : nick;
      html += `<div class="cp-dd-item" onclick="selecionarCPItem(${idx},'${val}','${nick.replace(/'/g,"\\'")} (ID: ${p.id})')" 
        title="${nick} — ID: ${p.id}">${hiNick} <span style="color:var(--t3);font-size:.65rem;">(${hiId})</span></div>`;
      total++;
    });
  });

  if(!total) html = '<div class="cp-dd-empty">Nenhum jogador encontrado</div>';
  list.innerHTML = html;
}

function selecionarCPItem(idx, entityId, label){
  // Atualiza o trigger visualmente
  const trigger = document.querySelector(`#cpdd-${idx} .cp-dd-trigger span`);
  if(trigger){ trigger.textContent = label; }
  const dd = document.getElementById(`cpdd-${idx}`);
  if(dd){
    dd.querySelector('.cp-dd-trigger').style.color = '#10b981';
    dd.querySelector('.cp-dd-trigger').style.borderColor = 'rgba(16,185,129,.3)';
  }
  closeCPDDs();
  vincularCP(idx, entityId);
}

function navCPDD(e, idx){
  const list  = document.getElementById(`cpdd-list-${idx}`);
  if(!list) return;
  const items = list.querySelectorAll('.cp-dd-item');
  const cur   = list.querySelector('.cp-dd-item.focused');
  if(e.key==='Escape'){ closeCPDDs(); return; }
  if(e.key==='Enter' && cur){ cur.click(); return; }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    const arr = Array.from(items);
    let ni = e.key==='ArrowDown' ? 0 : arr.length-1;
    if(cur){ cur.classList.remove('focused'); ni = arr.indexOf(cur)+(e.key==='ArrowDown'?1:-1); }
    ni = Math.max(0, Math.min(arr.length-1, ni));
    arr[ni]?.classList.add('focused');
    arr[ni]?.scrollIntoView({block:'nearest'});
  }
}

function reautolinkCP(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows = getCPSessao();
  if(!rows.length){ showToast('⚠️ Importe um arquivo ChipPix primeiro','e'); return; }
  const clubePlayers = allPlayers.filter(p=>p.clube===activeClube);
  const map = getCPMap();
  let linked=0, alreadyLinked=0, notFound=0;

  rows.forEach((r,i)=>{
    if(r.aplicado) return;
    if(r.entityId){ alreadyLinked++; return; }
    const pl = _cpFindPlayerMatch(r.idJog, clubePlayers);
    if(pl){
      const agKey = (pl.aname||'(sem agente)').trim();
      const agId  = makeEntityId('ag', agKey);
      const entityId = `pl_${pl.id}|${agId}`;
      rows[i].entityId = entityId;
      map[r.idJog]     = entityId;
      linked++;
    } else {
      notFound++;
    }
  });

  saveCPMap(map);
  saveCPSessao(rows);
  renderCPTable();

  const parts = [];
  if(linked)       parts.push(`✅ ${linked} vinculados agora`);
  if(alreadyLinked)parts.push(`${alreadyLinked} já estavam vinculados`);
  if(notFound)     parts.push(`⏳ ${notFound} não encontrados — vincule manualmente`);
  showToast(parts.join(' · '));

  // Se ainda tem pendentes, abre filtro de pendentes
  if(notFound>0) filtrarCP(document.querySelector('.cp-filter[data-f="pendente"]'),'pendente');
}


function vincularCP(idx, entityId){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows=getCPSessao();
  rows[idx].entityId=entityId||null;
  if(entityId){
    const map=getCPMap();
    map[rows[idx].idJog]=entityId;
    saveCPMap(map);
  }
  saveCPSessao(rows);
  renderCPTable();
}

function ignorarCP(idx, ignorar){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows=getCPSessao();
  // If unignoring and it had a linkedMovementId, remove the movement
  if(!ignorar && rows[idx].linkedMovementId){
    deleteMovement(rows[idx].linkedMovementId);
    rows[idx].linkedMovementId = null;
  }
  rows[idx].ignorado=ignorar;
  if(ignorar){ rows[idx].entityId=null; rows[idx].locked=false; rows[idx].aplicado=false; }
  saveCPSessao(rows);
  renderCPTable();
}

function filtrarCP(btn, filtro){
  _cpFilterAtual=filtro;
  document.querySelectorAll('.cp-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderCPTable();
}

function aplicarChipPix(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows = getCPSessao();
  let staged = 0, dups = 0;

  rows.forEach((r,idx)=>{
    if(!r.entityId||r.ignorado||r.aplicado) return;
    if(r.entrada < 0.01 && r.saida < 0.01) return;

    const eid = _cpResolveEntityId(r);
    if(!eid) return;

    const saldoLiq = r.entrada - r.saida;
    const dir      = saldoLiq >= 0 ? 'in' : 'out';
    const valorLiq = Math.abs(saldoLiq);
    if(valorLiq < 0.01) return;

    const plPart = r.entityId.split('|')[0];
    const plId   = plPart.replace(/^pl_/,'');
    const pl     = allPlayers.find(p=> String(p.id).trim()===String(plId).trim() && p.clube===activeClube);
    const plNome = pl ? (pl.nick||pl.id) : r.nome;

    const result = createMovement({
      weekKey:     weeks[selWeekIdx] || '0',
      clube:       activeClube,
      entityId:    eid,
      dir,
      amount:      valorLiq,
      method:      'chippix',
      externalId:  'cp_'+r.idJog,
      date:        Date.now(),
      description: 'ChipPix · '+plNome+' · ent '+fV(r.entrada,false)+' − saí '+fV(r.saida,false)
    });

    if(result.ok){
      rows[idx].aplicado = true;
      staged++;
    } else if(result.reason === 'duplicate'){
      rows[idx].aplicado = true;
      dups++;
    }
  });

  saveCPSessao(rows);
  closeM('mChipPix');
  renderCPTable();
  renderFinanceiro();
  renderFechamentos();
  if(typeof renderConcChipPix === 'function') renderConcChipPix();
  if(staged>0)
    showToast('✅ '+staged+' pagamento'+(staged!==1?'s':'')+' aplicado'+(staged!==1?'s':'')+' na Liquidação');
  else if(dups>0)
    showToast('ℹ️ Todos já existiam (anti-dup)');
  else
    showToast('⚠️ Nenhum registro enviado — verifique se os jogadores estão vinculados','e');
}


function resetarChipPixSemana(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  if(!confirm('Apagar todos os lançamentos ChipPix desta semana?\nIsso remove de pm_staged + pm_movements + pm_fin.\nOs vínculos serão mantidos.')) return;

  const wk = weeks[selWeekIdx]||'0';

  // 1) Remove ChipPix staged
  let stg = getStaged();
  stg = stg.filter(s=>!(s.method==='chippix' && s.weekKey===wk && s.clube===activeClube));
  saveStaged(stg);

  // 2) Remove ChipPix movements from pm_movements
  let mvs = getMovements();
  mvs = mvs.filter(m=>!(m.method==='chippix' && m.weekKey===wk && m.clube===activeClube));
  saveMovements(mvs);

  // 3) Remove ChipPix entries from pm_fin
  const allData = getFinData();
  const key     = finKey();
  if(allData[key]){
    Object.keys(allData[key]).forEach(eid=>{
      allData[key][eid].historico = (allData[key][eid].historico||[]).filter(h=>h.origem !== 'ChipPix');
    });
    saveFinData(allData);
  }

  // 4) Reset session flags (keep entityId for re-apply)
  const rows = getCPSessao().map(r=>({...r, aplicado:false, linkedMovementId:null, stagedId:null}));
  saveCPSessao(rows);
  renderCPTable();
  renderFinanceiro();
  renderAgentClosing();
  if(typeof renderConcChipPix === 'function') renderConcChipPix();
  showToast('🗑 Lançamentos ChipPix apagados de todos os ledgers');
}


// ══════════════════════════════════════════════════════════════
// ═══  MÓDULO CONCILIAÇÃO  ════════════════════════════════════
// ══════════════════════════════════════════════════════════════

// ── Sub-tab switching ─────────────────────────────────────────
