// ══════════════════════════════════════════════════════════════════════
//  render-staging.js — Staging, Movements, Conciliation UI (Poker Manager)
//  Depende de: dataLayer.js, utils.js, app-state.js, render-rakeback.js, render-financeiro.js
// ══════════════════════════════════════════════════════════════════════

let _finActiveSub  = 'liquidacao';
let _concActiveSub = 'chippix';



function switchConcSub(tab, btn){
  _concActiveSub = tab;
  document.querySelectorAll('#dn-conciliacao .conc-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['chippix','ofx','ledger'].forEach(t=>{
    const el = document.getElementById('conc-'+t);
    if(el) el.style.display = t===tab ? '' : 'none';
  });
  renderConciliacao();
}

function renderConciliacao(){
  if(!activeClube) return;
  if(_concActiveSub === 'chippix') renderConcChipPix();
  else if(_concActiveSub === 'ofx') renderConcOFX();
  else if(_concActiveSub === 'banks') { _concActiveSub='chippix'; renderConcChipPix(); }
  else if(_concActiveSub === 'ledger') renderConcLedger();
}

function switchAjustesSub(tab, btn){
  document.querySelectorAll('#dn-ajustes .conc-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ajustes-panel-contas').style.display      = tab==='contas'      ? '' : 'none';
  document.getElementById('ajustes-panel-formas').style.display      = tab==='formas'      ? '' : 'none';
  document.getElementById('ajustes-panel-categorias').style.display  = tab==='categorias'  ? '' : 'none';
  if(tab==='contas')      renderConcBanks();
  if(tab==='formas')      renderAjustesFormas();
  if(tab==='categorias')  renderCategorias();
}

function renderAjustes(){
  if(!activeClube) return;
  renderConcBanks();
  renderAjustesFormas();
}

function renderAjustesFormas(){
  const el = document.getElementById('ajustes-formas-content');
  if(!el) return;
  const methods = DataLayer.getPayMethodsAlt();
  let html = '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:16px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">';
  html += '<div style="font-size:.8rem;font-weight:700;color:var(--t1);">💳 Formas de Pagamento</div>';
  html += '<button onclick="addPaymentMethod()" style="background:var(--gold-d);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:5px 12px;border-radius:6px;font-size:.68rem;font-weight:600;cursor:pointer;">+ Adicionar</button>';
  html += '</div>';
  methods.forEach((m,i) => {
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;margin-bottom:6px;">';
    html += '<span style="font-size:.78rem;color:var(--t1);font-weight:500;">'+m+'</span>';
    html += '<button onclick="removePaymentMethod('+i+')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.7rem;">✕</button>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

function removePaymentMethod(idx){
  const methods = DataLayer.getPayMethodsAlt();
  const removed = methods.splice(idx,1);
  DataLayer.savePayMethodsAlt(methods);
  showToast('✕ Removido: '+removed[0]);
  renderAjustesFormas();
}

// ── Categorias OFX (CRUD) ────────────────────────────────────
function renderCategorias(){
  const el=document.getElementById('ajustes-categorias-content');
  if(!el) return;
  const cats=getTransactionCategories();

  let html='<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;padding:16px;">';
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">';
  html+='<div style="font-size:.8rem;font-weight:700;color:var(--t1);">🏷️ Categorias de Transação OFX</div></div>';
  html+='<div style="font-size:.65rem;color:var(--t3);margin-bottom:12px;">Categorias padrão do sistema não podem ser excluídas. Adicione categorias personalizadas abaixo.</div>';

  cats.forEach((c,i)=>{
    html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--s2);border:1px solid var(--b1);border-radius:7px;margin-bottom:6px;">
      <span style="font-size:1rem;">${c.icon}</span>
      <div style="flex:1;">
        <div style="font-size:.76rem;color:var(--t1);font-weight:600;">${c.label}</div>
        <div style="font-size:.6rem;color:${c.color};margin-top:1px;">ID: ${c.id}</div>
      </div>
      ${!c.deletable
        ?'<span style="background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.15);color:#94a3b8;padding:2px 8px;border-radius:4px;font-size:.58rem;font-weight:600;">Sistema</span>'
        :`<button onclick="removerCategoria('${c.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.72rem;" title="Excluir">✕</button>`
      }
    </div>`;
  });

  html+=`<div style="border-top:1px solid var(--b1);margin-top:14px;padding-top:14px;">
    <div style="font-size:.7rem;font-weight:600;color:var(--t2);margin-bottom:10px;">➕ Nova Categoria</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div style="flex:1;min-width:120px;">
        <div style="font-size:.6rem;color:var(--t3);margin-bottom:3px;">Nome</div>
        <input type="text" id="ajcat-nome" placeholder="Ex: Saque..." maxlength="30"
          style="width:100%;background:var(--s2);border:1px solid var(--b2);color:var(--t1);border-radius:6px;padding:7px 10px;font-size:.74rem;box-sizing:border-box;">
      </div>
      <div>
        <div style="font-size:.6rem;color:var(--t3);margin-bottom:3px;">Ícone</div>
        <input type="text" id="ajcat-icon" value="📋" maxlength="2"
          style="width:52px;background:var(--s2);border:1px solid var(--b2);color:var(--t1);border-radius:6px;padding:7px;font-size:.9rem;text-align:center;">
      </div>
      <div>
        <div style="font-size:.6rem;color:var(--t3);margin-bottom:3px;">Cor</div>
        <input type="color" id="ajcat-cor" value="#94a3b8"
          style="width:42px;height:34px;border:1px solid var(--b2);border-radius:6px;cursor:pointer;background:var(--s2);">
      </div>
      <button onclick="adicionarCategoria()" style="background:var(--gold-d);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:7px 16px;border-radius:6px;font-size:.7rem;font-weight:600;cursor:pointer;white-space:nowrap;">Adicionar</button>
    </div>
  </div>`;
  html+='</div>';
  el.innerHTML=html;
}

function adicionarCategoria(){
  const nome=(document.getElementById('ajcat-nome')?.value||'').trim();
  const icon=(document.getElementById('ajcat-icon')?.value||'📋').trim();
  const cor =(document.getElementById('ajcat-cor')?.value||'#94a3b8');
  if(!nome){ showToast('⚠️ Informe o nome da categoria','e'); return; }
  const cats=getTransactionCategories();
  const id='cat_'+nome.toLowerCase().replace(/[^a-z0-9]/g,'_').substr(0,20)+'_'+Date.now().toString(36).substr(-3);
  if(cats.find(c=>c.id===id||c.label.toLowerCase()===nome.toLowerCase())){
    showToast('⚠️ Categoria já existe','e'); return;
  }
  cats.push({ id, label:nome, color:cor, icon:icon||'📋', deletable:true });
  saveTransactionCategories(cats);
  showToast('✅ Categoria "'+nome+'" adicionada');
  renderCategorias();
}

function removerCategoria(id){
  const cats=getTransactionCategories();
  const cat=cats.find(c=>c.id===id);
  if(!cat||!cat.deletable){ showToast('⚠️ Categoria do sistema não pode ser removida','e'); return; }
  if(!confirm('Remover categoria "'+cat.label+'"?')) return;
  saveTransactionCategories(cats.filter(c=>c.id!==id));
  showToast('🗑 Categoria removida');
  renderCategorias();
}

// ── 1. Bank Accounts (CRUD) ──────────────────────────────────
function getBankAccounts(){ return DataLayer.getBankAccounts(); }
function saveBankAccounts(arr){ DataLayer.saveBankAccounts(arr); }

function addBankAccount(){
  const nome = prompt('Nome da conta (ex: Itaú - Clube):');
  if(!nome || !nome.trim()) return;
  const banco = prompt('Banco (ex: Itaú, Sicoob, Inter):') || nome;
  const accs = getBankAccounts();
  const id = nome.trim().toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now().toString(36);
  const isDefault = accs.length === 0;
  accs.push({ id, nome: nome.trim(), banco: banco.trim(), apelido: nome.trim(), ativo: true, isDefault });
  saveBankAccounts(accs);
  renderConcBanks();
  showToast(`✅ Conta "${nome.trim()}" adicionada`);
}

function removeBankAccount(id){
  if(!confirm('Remover esta conta bancária?')) return;
  let accs = getBankAccounts().filter(a=>a.id !== id);
  if(accs.length && !accs.some(a=>a.isDefault)) accs[0].isDefault = true;
  saveBankAccounts(accs);
  renderConcBanks();
  showToast('🗑 Conta removida');
}

function setDefaultBank(id){
  const accs = getBankAccounts();
  accs.forEach(a => a.isDefault = (a.id === id));
  saveBankAccounts(accs);
  renderConcBanks();
}

function renderConcBanks(){
  const accs = getBankAccounts();
  const el = document.getElementById('conc-banks-content');
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:.82rem;font-weight:700;color:var(--t1);">⚙️ Contas Bancárias</div>
      <button class="conc-btn conc-btn-link" onclick="addBankAccount()">➕ Nova Conta</button>
    </div>
    ${accs.length ? accs.map(a=>`
      <div class="bank-card">
        <div>
          <div class="bank-name">🏦 ${a.nome}${a.isDefault ? '<span class="bank-default">PADRÃO</span>' : ''}</div>
          <div class="bank-info">Banco: ${a.banco} · ID: ${a.id}</div>
        </div>
        <div class="bank-actions">
          ${!a.isDefault ? `<button onclick="setDefaultBank('${a.id}')">⭐ Padrão</button>` : ''}
          <button onclick="removeBankAccount('${a.id}')" style="color:#ef4444;">✕</button>
        </div>
      </div>
    `).join('') : `
      <div class="cs" style="padding:30px;">
        <div class="ci">🏦</div>
        <h3>Nenhuma conta cadastrada</h3>
        <p style="color:var(--t3);font-size:.78rem;">Cadastre ao menos uma conta para importar OFX.</p>
      </div>
    `}
  `;
}

// ── 2. Movements Ledger ──────────────────────────────────────
function getMovements(){ return DataLayer.getMovements(); }
function saveMovements(arr){ DataLayer.saveMovements(arr); }

function getWeekMovements(weekKey, clube){
  const wk = weekKey || (weeks[selWeekIdx]||'0');
  const cl = clube || activeClube;
  return getMovements().filter(m => m.weekKey === wk && m.clube === cl);
}

function getEntityMovTotal(entityId, weekKey, clube){
  const mvs = getWeekMovements(weekKey, clube);
  return mvs.filter(m=>m.entityId===entityId).reduce((s,m)=> s + (m.dir==='in' ? m.amount : -m.amount), 0);
}

// Anti-duplicate: check method+externalId
function isDuplicateMovement(method, externalId, weekKey, clube){
  if(!externalId) return false; // no externalId = can't check
  const mvs = getWeekMovements(weekKey, clube);
  return mvs.some(m => m.method === method && m.externalId === externalId);
}

// Heuristic warn: same amount + close date + same entity
function findPossibleDuplicate(amount, entityId, dateTs, weekKey, clube){
  const mvs = getWeekMovements(weekKey, clube);
  const TWO_MIN = 2 * 60 * 1000;
  return mvs.find(m =>
    m.entityId === entityId &&
    Math.abs(m.amount - amount) < 0.01 &&
    Math.abs((m.date||0) - dateTs) < TWO_MIN
  );
}

function createMovement(data){
  const {weekKey, entityId, dir, amount, method, bankId, externalId, date, description, clube} = data;
  const wk = weekKey || (weeks[selWeekIdx]||'0');
  const cl = clube || activeClube;

  // Anti-dup by externalId
  if(externalId && isDuplicateMovement(method, externalId, wk, cl)){
    return { ok:false, reason:'duplicate', msg:`Movimento duplicado (${method}:${externalId})` };
  }

  // Heuristic warn (no externalId)
  if(!externalId){
    const dup = findPossibleDuplicate(amount, entityId, date||Date.now(), wk, cl);
    if(dup) return { ok:false, reason:'possible_dup', existing:dup, msg:'Possível duplicata detectada' };
  }

  const mvs = getMovements();
  const mv = {
    id: 'mv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,4),
    weekKey: wk,
    clube: cl,
    entityId,
    dir,
    amount: Math.abs(amount),
    method: method || 'manual',
    bankId: bankId || null,
    externalId: externalId || null,
    date: date || Date.now(),
    description: description || '',
    createdAt: Date.now()
  };
  mvs.push(mv);
  saveMovements(mvs);

  // Also write to pm_fin ledger for backward compat with Liquidação
  syncMovementToLedger(mv);

  return { ok:true, movement:mv };
}

function syncMovementToLedger(mv){
  const allData = getFinData();
  const key = mv.clube + '||' + mv.weekKey;
  if(!allData[key]) allData[key] = {};
  if(!allData[key][mv.entityId]) allData[key][mv.entityId] = { historico:[], saldoAberto:0 };

  // Dedup in ledger
  const extKey = mv.method + '_' + (mv.externalId || mv.id);
  if(allData[key][mv.entityId].historico.some(h=>h.fitid === extKey)) return;

  allData[key][mv.entityId].historico.push({
    valor: mv.amount,
    metodo: mv.method === 'chippix' ? 'ChipPix' : mv.method === 'ofx' ? 'PIX' : mv.description || 'Manual',
    dir: mv.dir,
    comp: mv.description,
    ts: mv.date || Date.now(),
    source: 'staging', conciliado: true,
    fitid: extKey,
    origem: mv.method === 'chippix' ? 'ChipPix' : mv.method === 'ofx' ? 'OFX' : 'Manual',
    banco: mv.bankId || '',
    mvId: mv.id
  });

  // Recalc saldoAberto
  const entities = calcFinEntities();
  const e = entities.find(x=>x.id === mv.entityId);
  const sp = getSaldoAnterior(mv.entityId);
  const ledger = FinanceEngine.calcLedgerNet(allData[key][mv.entityId].historico || []);
  allData[key][mv.entityId].saldoAberto = sp + (e ? -(e.valor) : 0) - ledger.net;

  saveFinData(allData);
}

function deleteMovement(mvId){
  let mvs = getMovements();
  const mv = mvs.find(m=>m.id === mvId);
  if(!mv) return;
  mvs = mvs.filter(m=>m.id !== mvId);
  saveMovements(mvs);

  // Also remove from pm_fin ledger
  const allData = getFinData();
  const key = mv.clube + '||' + mv.weekKey;
  if(allData[key]?.[mv.entityId]){
    allData[key][mv.entityId].historico = (allData[key][mv.entityId].historico||[]).filter(h=>h.mvId !== mvId);

    // Recalc saldoAberto com fórmula canônica (mesmo padrão de syncMovementToLedger/remExtratoPag)
    const entities = calcFinEntities();
    const e = entities.find(x => x.id === mv.entityId);
    const sp = getSaldoAnterior(mv.entityId);
    const ledger = FinanceEngine.calcLedgerNet(allData[key][mv.entityId].historico || []);
    const saldo = FinanceEngine.calcSaldoAtual(sp, (e ? -(e.valor) : 0), ledger.net);
    allData[key][mv.entityId].saldoAberto = Math.abs(saldo) < 0.01 ? 0 : saldo;

    saveFinData(allData);
  }
}

// ════════════════════════════════════════════════════════════
// ═══  STAGING LAYER (pré-lançamento)  ═════════════════════
// ════════════════════════════════════════════════════════════
// stagedMovements = items pending confirmation in Financeiro.
// Only after "Aplicar" do they become real movements.
// ════════════════════════════════════════════════════════════

function getStaged(){ return DataLayer.getStaged(); }
function saveStaged(arr){ DataLayer.saveStaged(arr); }

function getWeekStaged(weekKey, clube){
  const wk = weekKey || (weeks[selWeekIdx]||'0');
  const cl = clube || activeClube;
  return getStaged().filter(s => s.weekKey === wk && s.clube === cl);
}

// Anti-dup: check BOTH staged + movements
function isDuplicateStagedOrMov(method, externalId, weekKey, clube){
  if(!externalId) return false;
  const wk = weekKey || (weeks[selWeekIdx]||'0');
  const cl = clube || activeClube;
  // Check movements
  if(isDuplicateMovement(method, externalId, wk, cl)) return 'movement';
  // Check staged (non-rejected)
  const staged = getWeekStaged(wk, cl);
  if(staged.some(s => s.method === method && s.externalId === externalId && s.status !== 'rejected'))
    return 'staged';
  return false;
}

function createStagedMovement(data){
  const {weekKey, entityId, dir, amount, method, bankId, externalId, date, description, clube, cpId} = data;
  const wk = weekKey || (weeks[selWeekIdx]||'0');
  const cl = clube || activeClube;

  // Anti-dup: check both staged + movements
  const dupCheck = isDuplicateStagedOrMov(method, externalId, wk, cl);
  if(dupCheck){
    return { ok:false, reason:'duplicate', where:dupCheck, msg:'Duplicado detectado ('+dupCheck+'): '+method+':'+externalId };
  }

  const all = getStaged();
  const sm = {
    id: 'stg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,4),
    weekKey: wk,
    clube: cl,
    entityId,
    dir,
    amount: Math.abs(amount),
    method: method || 'manual',
    bankId: bankId || null,
    externalId: externalId || null,
    date: date || Date.now(),
    description: description || '',
    cpId: cpId || null,
    status: 'staged',
    appliedMovementId: null,
    createdAt: Date.now()
  };
  all.push(sm);
  saveStaged(all);
  return { ok:true, staged:sm };
}

function applyStagedMovement(stagedId){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return false; }
  const all = getStaged();
  const sm = all.find(s=>s.id===stagedId);
  if(!sm || sm.status !== 'staged'){ showToast('⚠️ Item não encontrado ou já processado','e'); return false; }

  // Create real movement via createMovement pipeline
  const result = createMovement({
    weekKey: sm.weekKey,
    clube: sm.clube,
    entityId: sm.entityId,
    dir: sm.dir,
    amount: sm.amount,
    method: sm.method,
    bankId: sm.bankId,
    externalId: sm.externalId,
    date: sm.date,
    description: sm.description
  });

  if(result.ok){
    sm.status = 'applied';
    sm.appliedMovementId = result.movement.id;
    saveStaged(all);

    // Sync CP session flag if ChipPix
    if(sm.method === 'chippix' && sm.cpId){
      const rows = getCPSessao();
      const cpRow = rows.find(r=>r.idJog === sm.cpId);
      if(cpRow){
        cpRow.aplicado = true;
        cpRow.linkedMovementId = result.movement.id;
        saveCPSessao(rows);
      }
    }
    return true;
  } else {
    // Duplicate in movements — mark as applied anyway (data integrity)
    if(result.reason === 'duplicate'){
      sm.status = 'applied';
      saveStaged(all);
    }
    showToast('⚠️ '+result.msg,'e');
    return false;
  }
}

function rejectStagedMovement(stagedId){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const all = getStaged();
  const sm = all.find(s=>s.id===stagedId);
  if(!sm || sm.status !== 'staged') return;
  sm.status = 'rejected';
  saveStaged(all);

  // Unlink from CP session if ChipPix
  if(sm.method === 'chippix' && sm.cpId){
    const rows = getCPSessao();
    const cpRow = rows.find(r=>r.idJog === sm.cpId);
    if(cpRow){
      cpRow.aplicado = false;
      cpRow.locked = false;
      cpRow.linkedMovementId = null;
      cpRow.stagedId = null;
      saveCPSessao(rows);
    }
  }
}

function editStagedMovement(stagedId, changes){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const all = getStaged();
  const sm = all.find(s=>s.id===stagedId);
  if(!sm || sm.status !== 'staged') return;
  if(changes.entityId !== undefined) sm.entityId = changes.entityId;
  if(changes.dir !== undefined) sm.dir = changes.dir;
  if(changes.amount !== undefined) sm.amount = Math.abs(changes.amount);
  if(changes.description !== undefined) sm.description = changes.description;
  saveStaged(all);
}

function applyAllStaged(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const staged = getWeekStaged();
  const pending = staged.filter(s=>s.status==='staged');
  if(!pending.length){ showToast('⚠️ Nenhum item pendente','e'); return; }
  if(!confirm('Aplicar todos os '+pending.length+' lançamentos pendentes?\n\nIsso criará movimentos reais no ledger.')) return;

  let ok=0, fail=0;
  pending.forEach(s=>{
    if(applyStagedMovement(s.id)) ok++;
    else fail++;
  });
  renderFinanceiro();
  renderAgentClosing();
  if(typeof renderConcChipPix==='function') renderConcChipPix();
  showToast('✅ '+ok+' aplicado'+(ok!==1?'s':'')+(fail ? ' · '+fail+' falha'+(fail!==1?'s':'') : ''));
}

// ── 3. Inline ChipPix Rendering ──────────────────────────────
let _concCPFilter = 'todos';
let _concCPSearch = '';

function renderConcChipPix(){
  const el = document.getElementById('conc-cp-content');
  if(!activeClube){ el.innerHTML='<div class="cs"><div class="ci">📂</div><h3>Abra um clube</h3></div>'; return; }

  const rows = getCPSessao();
  const cpPlayers = allPlayers.filter(p=>p.clube===activeClube);

  if(!rows.length){
    el.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:.82rem;font-weight:700;color:var(--t1);">🎰 Conciliação ChipPix</div>
        <label class="conc-btn conc-btn-link" style="cursor:pointer;">
          📂 Importar ChipPix
          <input type="file" accept=".xlsx,.xls,.csv" onchange="processChipPix(this);setTimeout(renderConcChipPix,500);" style="display:none;">
        </label>
      </div>
      <div class="cs" style="padding:30px;">
        <div class="ci">🎰</div>
        <h3>Nenhum extrato ChipPix carregado</h3>
        <p style="color:var(--t3);font-size:.78rem;">Importe a planilha ChipPix para vincular jogadores automaticamente.</p>
      </div>`;
    return;
  }

  // ── Counts ──
  const vinc   = rows.filter(r=>r.entityId&&!r.ignorado&&!r.aplicado&&!r.locked).length;
  const aplic  = rows.filter(r=>r.aplicado).length;
  const pend   = rows.filter(r=>!r.entityId&&!r.ignorado&&!r.aplicado).length;
  const ign    = rows.filter(r=>r.ignorado).length;
  const locked = rows.filter(r=>r.locked&&!r.aplicado).length;
  const active = rows.filter(r=>!r.ignorado);

  // ── Financial KPIs ──
  const entTot     = active.reduce((s,r)=>s+r.entrada,0);
  const saiTot     = active.reduce((s,r)=>s+r.saida,0);
  const impactoLiq = entTot - saiTot;
  const conciliado = active.filter(r=>r.aplicado).reduce((s,r)=>s+(r.entrada-r.saida),0);
  const pendVal    = active.filter(r=>!r.aplicado).reduce((s,r)=>s+(r.entrada-r.saida),0);

  // Count staging status for applied items
  const weekStaged = getWeekStaged();
  const stagedPending = active.filter(r=>r.aplicado && r.stagedId && weekStaged.some(s=>s.id===r.stagedId&&s.status==='staged')).length;
  const stagedApplied = aplic - stagedPending;

  // ── Lock enforcement ──
  const weekLock   = isWeekLocked();  // FULL lock: week locked = no changes at all
  const hasLocked  = locked > 0 || aplic > 0;
  const disableAll = weekLock;  // week lock overrides everything
  const disImport  = (disableAll || hasLocked) ? 'disabled style="opacity:.4;pointer-events:none;"' : '';
  const disAutoV   = (disableAll || hasLocked) ? 'disabled style="opacity:.4;pointer-events:none;"' : '';
  const disAll     = disableAll ? 'disabled style="opacity:.4;pointer-events:none;"' : '';

  // ── Player dropdown options grouped by agent ──
  const agentGroups = {};
  cpPlayers.forEach(p=>{
    const raw = (p.aname||'').trim();
    const ag = (!raw || /^(none|null|undefined)$/i.test(raw)) ? '(sem agente)' : raw;
    if(!agentGroups[ag]) agentGroups[ag]=[];
    agentGroups[ag].push(p);
  });
  const playerOpts = Object.entries(agentGroups).map(([agKey,players])=>
    '<optgroup label="🤝 '+agKey+'">'
      + players.map(p=>'<option value="pl_'+p.id+'|'+makeEntityId('ag',agKey)+'">'+(p.nick||p.id)+' (ID: '+p.id+')</option>').join('')
    + '</optgroup>'
  ).join('');

  // ── Filter ──
  const q = _concCPSearch.toLowerCase().trim();
  const vis = rows.map((r,i)=>({...r,_idx:i})).filter(r=>{
    if(_concCPFilter==='vinculado') { if(!(r.entityId&&!r.ignorado&&!r.aplicado&&!r.locked)) return false; }
    else if(_concCPFilter==='locked') { if(!(r.locked&&!r.aplicado)) return false; }
    else if(_concCPFilter==='aplicado') { if(!r.aplicado) return false; }
    else if(_concCPFilter==='pendente') { if(!(!r.entityId&&!r.ignorado&&!r.aplicado)) return false; }
    else if(_concCPFilter==='ignorado') { if(!r.ignorado) return false; }
    if(q){
      return String(r.idJog).toLowerCase().includes(q) || (r.nome||'').toLowerCase().includes(q);
    }
    return true;
  });

  const fBtn = (f,lbl,cnt) => '<button class="fin-filter-btn '+(_concCPFilter===f?'active':'')+'" onclick="_concCPFilter=\''+f+'\';renderConcChipPix();">'+lbl+' <span style="opacity:.5;font-size:.6rem;">'+cnt+'</span></button>';

  // ── Dedup check via fitid in ledger ──
  const allData = getFinData();
  const fKey = finKey();

  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:.82rem;font-weight:700;color:var(--t1);">🎰 Conciliação ChipPix</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <label class="conc-btn conc-btn-link" style="cursor:pointer;" ${disImport}>
          📂 Importar
          <input type="file" accept=".xlsx,.xls,.csv" onchange="processChipPix(this);setTimeout(renderConcChipPix,500);" style="display:none;" ${hasLocked?'disabled':''}>
        </label>
        <button class="conc-btn conc-btn-link" onclick="reautolinkCP();setTimeout(renderConcChipPix,200);" ${disAutoV}>🔗 Auto-vincular</button>
        ${!disableAll && vinc > 0 ? '<button class="conc-btn" style="background:rgba(240,180,41,.1);border-color:rgba(240,180,41,.25);color:var(--gold);" onclick="lockAllConcCP()">🔒 Lockar ('+vinc+')</button>' : ''}
        ${!disableAll && locked > 0 ? '<button class="conc-btn" style="background:rgba(129,140,248,.1);border-color:rgba(129,140,248,.25);color:#818cf8;" onclick="aplicarChipPixConc()">📌 Enviar Pendentes ('+locked+')</button>' : ''}
        <button class="conc-btn conc-btn-ign" onclick="clearAllConcCPBindings()" title="Limpar todas vinculações" ${disAll}>🗑 Limpar</button>
      </div>
    </div>

    <!-- Financial Impact KPIs -->
    <div class="conc-summary">
      <div class="cs-box"><div class="cs-lbl">Jogadores</div><div class="cs-val">${rows.length}</div></div>
      <div class="cs-box"><div class="cs-lbl">📥 Entradas</div><div class="cs-val" style="color:#10b981;">R$ ${fV(entTot,false)}</div></div>
      <div class="cs-box"><div class="cs-lbl">📤 Saídas</div><div class="cs-val" style="color:#ef4444;">R$ ${fV(saiTot,false)}</div></div>
      <div class="cs-box" style="border-color:${impactoLiq>0?'rgba(16,185,129,.25)':impactoLiq<0?'rgba(239,68,68,.25)':'rgba(74,85,104,.25)'};"><div class="cs-lbl">⚡ Impacto Líquido</div><div class="cs-val" style="color:${clr(impactoLiq)};">R$ ${fV(impactoLiq,false)}</div></div>
      <div class="cs-box"><div class="cs-lbl">📌 Staged</div><div class="cs-val" style="color:#fbbf24;">${stagedPending} <span style="font-size:.55rem;opacity:.6;">pendente${stagedPending!==1?'s':''}</span></div></div>
      <div class="cs-box"><div class="cs-lbl">✔ Aplicado</div><div class="cs-val" style="color:#10b981;">${stagedApplied} <span style="font-size:.55rem;opacity:.6;">(R$ ${fV(conciliado,false)})</span></div></div>
      <div class="cs-box"><div class="cs-lbl">⏳ Não Vinculado</div><div class="cs-val" style="color:#fb923c;">${pend} <span style="font-size:.55rem;opacity:.6;">(R$ ${fV(pendVal,false)})</span></div></div>
    </div>

    ${weekLock ? '<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:.72rem;color:#ef4444;font-weight:600;">🔒 Semana lockada — todas as alterações estão bloqueadas. Desbloqueie a semana para editar.</div>'
      : hasLocked ? '<div style="background:rgba(240,180,41,.06);border:1px solid rgba(240,180,41,.15);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:.68rem;color:#fbbf24;">🔒 Sessão parcialmente lockada — importação e auto-vincular desabilitados para proteger integridade dos dados.</div>'
      : ''}

    <!-- Search + Filters -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" placeholder="🔍 Buscar por ID ou nome..." value="${_concCPSearch.replace(/"/g,'&quot;')}"
        oninput="_concCPSearch=this.value;clearTimeout(window._ccpSt);window._ccpSt=setTimeout(renderConcChipPix,200);"
        style="background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:7px 12px;border-radius:8px;font-size:.74rem;width:220px;">
      <div style="display:flex;gap:4px;">
        ${fBtn('todos','Todos',rows.length)}
        ${fBtn('vinculado','✅ Vinculados',vinc)}
        ${fBtn('locked','🔒 Lockados',locked)}
        ${fBtn('aplicado','💳 Aplicados',aplic)}
        ${fBtn('pendente','⏳ Pendentes',pend)}
        ${fBtn('ignorado','🚫 Ignorados',ign)}
      </div>
      <div style="flex:1;"></div>
      <span style="font-size:.66rem;color:var(--t3);">${vis.length} de ${rows.length}</span>
    </div>

    ${vis.length ? `
    <div style="max-height:500px;overflow-y:auto;">
    <table class="tbl">
      <thead><tr>
        <th>ID / Nome</th>
        <th style="text-align:right;">Entrada</th>
        <th style="text-align:right;">Saída</th>
        <th style="text-align:right;">Impacto</th>
        <th>Status</th>
        <th style="text-align:center;">Financeiro</th>
        <th style="min-width:180px;">Vincular a</th>
        <th>Ação</th>
      </tr></thead>
      <tbody>
        ${vis.map(r=>_renderConcCPRow(r, r._idx, cpPlayers, playerOpts, allData, fKey, weekLock)).join('')}
      </tbody>
    </table>
    </div>
    ` : `
    <div class="cs" style="padding:24px;">
      <div class="ci">🔍</div>
      <h3>Nenhum resultado</h3>
      <p style="color:var(--t3);font-size:.78rem;">Ajuste os filtros ou busca</p>
    </div>`}
  `;
}

function _renderConcCPRow(r, idx, cpPlayers, playerOpts, allData, fKey, weekLock){
  const impacto = r.entrada - r.saida;
  const impCor  = impacto>0.01?'#10b981':impacto<-0.01?'#ef4444':'var(--t3)';

  // ── Badge (Status) ──
  let badge = '';
  // Check staging status for badge
  let isStgPending = false;
  if(r.aplicado && r.stagedId){
    const sm = getStaged().find(s=>s.id===r.stagedId);
    if(sm && sm.status==='staged') isStgPending = true;
  }

  if(r.aplicado && isStgPending) badge='<span style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);color:#fbbf24;padding:2px 8px;border-radius:5px;font-size:.6rem;font-weight:700;">📌 Staged</span>';
  else if(r.aplicado) badge='<span class="badge-applied">✔ Aplicado</span>';
  else if(r.locked){
    const pl = _cpFindPlayer(r, cpPlayers);
    badge = '<span style="background:rgba(240,180,41,.1);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:2px 8px;border-radius:5px;font-size:.6rem;font-weight:700;">🔒 '+(pl||r.entityId)+'</span>';
  }
  else if(r.ignorado) badge='<span style="color:var(--t3);font-size:.68rem;">🚫 Ignorado</span>';
  else if(r.entityId){
    const pl = _cpFindPlayer(r, cpPlayers);
    badge = '<span class="badge-linked">✅ '+(pl||r.entityId)+'</span>';
  }
  else badge='<span class="badge-unlinked">⏳ Pendente</span>';

  // ── Financeiro — check staged → movements → pm_fin (3-layer) ──
  let finCell = '<span style="color:var(--t3);font-size:.68rem;">—</span>';
  if(r.aplicado){
    const cpExtId = 'cp_'+r.idJog;

    // Check staged status
    let inStaged = false, stagedStatus = null;
    if(r.stagedId){
      const sm = getStaged().find(s=>s.id===r.stagedId);
      if(sm){ inStaged = true; stagedStatus = sm.status; }
    }
    if(!inStaged){
      const sm = getStaged().find(s=>s.method==='chippix' && s.externalId===cpExtId && s.status!=='rejected');
      if(sm){ inStaged = true; stagedStatus = sm.status; }
    }

    // Check movements
    let inMvs = false;
    if(r.linkedMovementId){
      inMvs = getMovements().some(m=>m.id===r.linkedMovementId);
    }
    if(!inMvs){
      inMvs = getMovements().some(m=>m.method==='chippix' && m.externalId===cpExtId);
    }

    // Check pm_fin
    let inFin = false;
    const fitKey = 'chippix_'+cpExtId;
    if(allData && allData[fKey]){
      inFin = Object.values(allData[fKey]).some(ent =>
        (ent.historico||[]).some(h => h.fitid === fitKey || h.fitid === cpExtId || h.cpId === r.idJog)
      );
    }

    // Display priority: applied > staged > error
    if(inMvs && inFin)                finCell = '<span style="color:#10b981;font-size:.68rem;font-weight:700;">✔ Aplicado</span>';
    else if(inMvs)                    finCell = '<span style="color:#10b981;font-size:.68rem;font-weight:700;">✔ Mov</span>';
    else if(inStaged && stagedStatus==='staged')
                                      finCell = '<span style="color:#fbbf24;font-size:.68rem;font-weight:700;">📌 Pendente</span>';
    else if(inStaged && stagedStatus==='applied')
                                      finCell = '<span style="color:#10b981;font-size:.68rem;font-weight:700;">✔ Aplicado</span>';
    else if(inStaged && stagedStatus==='rejected')
                                      finCell = '<span style="color:#ef4444;font-size:.68rem;font-weight:700;">🚫 Rejeitado</span>';
    else if(inFin)                    finCell = '<span style="color:#f59e0b;font-size:.68rem;font-weight:700;">⚠ Legado</span>';
    else                              finCell = '<span style="color:#ef4444;font-size:.68rem;font-weight:700;">✕ Erro</span>';
  } else if(r.entityId && !r.ignorado){
    finCell = '<span style="color:var(--t3);font-size:.62rem;">Aguardando</span>';
  }

  // ── Linking dropdown — disabled when week locked ──
  let linkCell = '<span style="color:var(--t3);font-size:.68rem;">—</span>';
  if(!r.aplicado && !r.ignorado && !r.locked && !weekLock){
    const curVal = r.entityId || '';
    let selOpts = playerOpts;
    if(curVal) selOpts = selOpts.replace('value="'+curVal+'"', 'value="'+curVal+'" selected');
    const placeholder = curVal ? '✕ Desvincular' : '— Selecionar jogador —';
    linkCell = '<select class="conc-entity-sel" style="max-width:180px;font-size:.7rem;" onchange="vincConcCP('+idx+',this.value)">'
      + '<option value="">'+placeholder+'</option>'
      + selOpts
      + '</select>';
  } else if(r.locked && !r.aplicado){
    const pl = _cpFindPlayer(r, cpPlayers);
    linkCell = '<span style="font-size:.72rem;font-weight:600;color:var(--gold);">🔒 '+(pl||r.entityId)+'</span>';
  } else if(weekLock && r.entityId && !r.aplicado){
    const pl = _cpFindPlayer(r, cpPlayers);
    linkCell = '<span style="font-size:.72rem;font-weight:600;color:var(--t3);">🔒 '+(pl||r.entityId)+'</span>';
  }

  // ── Action buttons — disabled when week locked ──
  let actBtns = '';
  if(weekLock || r.aplicado){
    actBtns = '<span style="color:var(--t3);font-size:.68rem;">✓</span>';
  } else if(r.ignorado){
    actBtns = '<button class="conc-btn-ign" onclick="ignorarCP('+idx+',false);setTimeout(renderConcChipPix,100);" title="Restaurar">↩</button>';
  } else {
    actBtns = '<button class="conc-btn-ign" onclick="ignorarCP('+idx+',true);setTimeout(renderConcChipPix,100);" title="Ignorar">🚫</button>';
  }

  const rowStyle = r.aplicado?'opacity:.5;':r.ignorado?'opacity:.4;':r.locked?'background:rgba(240,180,41,.02);':'';

  return '<tr style="'+rowStyle+'">'
    + '<td><div style="font-weight:700;color:#60a5fa;font-size:.78rem;">'+r.idJog+'</div><div style="font-size:.66rem;color:var(--t3);">'+r.nome+' · '+r.txns+' ops</div></td>'
    + '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:600;color:#10b981;font-size:.78rem;">+'+fV(r.entrada,false)+'</td>'
    + '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:600;color:'+(r.saida>0?'#ef4444':'var(--t3)')+';font-size:.78rem;">'+(r.saida>0?'-'+fV(r.saida,false):'—')+'</td>'
    + '<td style="text-align:right;font-family:\'JetBrains Mono\',monospace;font-weight:800;color:'+impCor+';font-size:.8rem;">'+(impacto>=0?'+':'')+fV(impacto,false)+'</td>'
    + '<td style="text-align:left;font-family:inherit;">'+badge+'</td>'
    + '<td style="text-align:center;font-family:inherit;">'+finCell+'</td>'
    + '<td style="text-align:left;font-family:inherit;">'+linkCell+'</td>'
    + '<td style="text-align:center;font-family:inherit;"><div style="display:flex;gap:3px;justify-content:center;">'+actBtns+'</div></td>'
    + '</tr>';
}

// Helper: find player display name from entityId
function _cpFindPlayer(r, cpPlayers){
  if(!r.entityId) return null;
  const pp = r.entityId.split('|')[0];
  const pid = pp.replace('pl_','');
  const pl = cpPlayers.find(p=>p.id===pid);
  return pl ? (pl.nick||pl.id) : null;
}

// Vincular jogador ChipPix via dropdown na aba inline
function vincConcCP(idx, entityId){
  if(isWeekLocked()){ showToast('🔒 Semana lockada — alterações bloqueadas','e'); return; }
  const rows = getCPSessao();
  rows[idx].entityId = entityId || null;
  rows[idx].locked = false;
  if(entityId){
    const map = getCPMap();
    map[rows[idx].idJog] = entityId;
    saveCPMap(map);
  }
  saveCPSessao(rows);
  renderConcChipPix();
}

// Lock individual row
function lockConcCP(idx){
  const rows = getCPSessao();
  if(!rows[idx].entityId){ showToast('⚠️ Vincule um jogador primeiro','e'); return; }
  rows[idx].locked = true;
  saveCPSessao(rows);
  renderConcChipPix();
}

// Unlock individual row
function unlockConcCP(idx){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows = getCPSessao();
  rows[idx].locked = false;
  saveCPSessao(rows);
  renderConcChipPix();
}

// Clear individual binding — also removes movement from BOTH ledgers
function clearConcCPBinding(idx){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows = getCPSessao();
  // Remove staged item if exists
  if(rows[idx].stagedId){
    const all = getStaged();
    const sm = all.find(s=>s.id===rows[idx].stagedId);
    if(sm && sm.status==='staged'){ sm.status='rejected'; saveStaged(all); }
  }
  // Remove applied movement if exists
  if(rows[idx].linkedMovementId){
    deleteMovement(rows[idx].linkedMovementId);
  }
  rows[idx].entityId = null;
  rows[idx].locked = false;
  rows[idx].aplicado = false;
  rows[idx].linkedMovementId = null;
  rows[idx].stagedId = null;
  saveCPSessao(rows);
  renderConcChipPix();
  renderFinanceiro();
}

// Resolve CP row entityId → financial entity ID
function _cpResolveEntityId(r){
  if(!r.entityId) return null;
  const plPart = r.entityId.split('|')[0];
  const plId   = plPart.replace(/^pl_/,'');
  const pl     = allPlayers.find(p=> String(p.id).trim()===String(plId).trim() && p.clube===activeClube);
  if(!pl) return r.entityId.includes('|') ? r.entityId.split('|')[1] : r.entityId;
  const agKey = (pl.aname||'').trim();
  // Jogador direto → entityId do jogador (pl_xxx)
  if(isPlayerDirectSettlement(pl.id, agKey)) return makeEntityId('pl', pl.id);
  // Jogador via agente → entityId do agente (ag_xxx)
  if(agKey) return makeEntityId('ag', agKey);
  return r.entityId;
}

// Lock ALL currently linked (not yet locked/applied)
function lockAllConcCP(){
  const rows = getCPSessao();
  let cnt = 0;
  rows.forEach(r=>{
    if(r.entityId && !r.ignorado && !r.aplicado && !r.locked){
      r.locked = true;
      cnt++;
    }
  });
  saveCPSessao(rows);
  renderConcChipPix();
  showToast('🔒 '+cnt+' vínculo'+(cnt!==1?'s':'')+' lockado'+(cnt!==1?'s':''));
}

// Clear ALL bindings — removes movements from BOTH pm_movements + pm_fin
function clearAllConcCPBindings(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada — não é possível limpar','e'); return; }
  const rows = getCPSessao();
  const total = rows.filter(r=>r.entityId || r.aplicado).length;
  if(!total){ showToast('⚠️ Nenhum vínculo para limpar','e'); return; }
  const aplicados = rows.filter(r=>r.aplicado).length;
  let msg = 'Limpar todos os '+total+' vínculos?';
  if(aplicados) msg += '\n⚠️ '+aplicados+' com staging/ledger serão removidos.';
  if(!confirm(msg)) return;

  const wk = weeks[selWeekIdx]||'0';

  // 1) Clean staged ChipPix items
  let stg = getStaged();
  stg = stg.filter(s=>!(s.method==='chippix' && s.weekKey===wk && s.clube===activeClube));
  saveStaged(stg);

  // 2) Remove applied movements via deleteMovement (handles BOTH pm_movements + pm_fin)
  rows.forEach(r=>{
    if(r.linkedMovementId) deleteMovement(r.linkedMovementId);
  });

  // 3) Fallback: clean orphaned ChipPix entries from pm_fin + pm_movements
  if(aplicados){
    const allData = getFinData();
    const key = finKey();
    if(allData[key]){
      Object.keys(allData[key]).forEach(eid=>{
        allData[key][eid].historico = (allData[key][eid].historico||[]).filter(h=>h.origem !== 'ChipPix');
      });
      saveFinData(allData);
    }
    let mvs = getMovements();
    mvs = mvs.filter(m=>!(m.method==='chippix' && m.weekKey===wk && m.clube===activeClube));
    saveMovements(mvs);
  }

  let cnt = 0;
  rows.forEach(r=>{
    if(r.entityId || r.aplicado){
      r.entityId = null;
      r.locked = false;
      r.aplicado = false;
      r.linkedMovementId = null;
      r.stagedId = null;
      cnt++;
    }
  });
  saveCPSessao(rows);
  renderConcChipPix();
  if(aplicados){ renderFinanceiro(); renderAgentClosing(); }
  showToast('🗑 '+cnt+' vínculo'+(cnt!==1?'s':'')+' removido'+(cnt!==1?'s':''));
}

// ═══════════════════════════════════════════════════════════════
// aplicarChipPixConc — STAGING PIPELINE
//   Creates stagedMovements (NOT direct movements)
//   User must confirm in Financeiro → Pendentes to apply
// ═══════════════════════════════════════════════════════════════
function aplicarChipPixConc(){
  if(isWeekLocked()){ showToast('🔒 Semana lockada','e'); return; }
  const rows = getCPSessao();
  const lockeds = rows.filter(r=>r.locked && !r.aplicado && r.entityId);
  if(!lockeds.length){ showToast('⚠️ Nenhum vínculo lockado para enviar','e'); return; }
  if(!confirm('Aplicar '+lockeds.length+' pagamento'+(lockeds.length!==1?'s':'')+' na Liquidação?\n\nOs valores serão registrados imediatamente.')) return;

  let staged = 0, dups = 0;

  rows.forEach((r,idx)=>{
    if(!r.locked || !r.entityId || r.ignorado || r.aplicado) return;
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
  renderConcChipPix();
  renderFinanceiro();
  renderFechamentos();

  if(staged > 0)
    showToast('✅ '+staged+' pagamento'+(staged!==1?'s':'')+' aplicado'+(staged!==1?'s':'')+' na Liquidação'+(dups ? ' ('+dups+' dup ignorado'+(dups!==1?'s':'')+')' : ''));
  else if(dups > 0)
    showToast('ℹ️ Todos já existiam (anti-dup)');
  else
    showToast('⚠️ Nenhum lançamento criado','e');
}

// ── 4. Inline OFX Rendering ──────────────────────────────────
let _concOFXBankId = null;

function renderConcOFX(){
  const el = document.getElementById('conc-ofx-content');
  if(!activeClube){ el.innerHTML='<div class="cs"><div class="ci">📂</div><h3>Abra um clube</h3></div>'; return; }
  ensureOFXPicker();

  const allTxns  = getOFXSessao().map(normTx);
  const cats     = getTransactionCategories();
  const locked   = isWeekLocked();

  // ── KPIs ──
  const cntTotal    = allTxns.length;
  const cntConc     = allTxns.filter(t=>t.status==='aplicado').length;
  const cntVinc     = allTxns.filter(t=>t.status==='vinculado').length;
  const cntIgn      = allTxns.filter(t=>t.status==='ignorado').length;
  const cntPend     = allTxns.filter(t=>t.status==='pendente').length;
  const cntNaoClass = allTxns.filter(t=>t.status==='pendente'&&!t.categoria).length;
  const visKPI      = allTxns.filter(t=>t.status!=='ignorado');
  const totIn       = visKPI.filter(t=>t.dir==='in').reduce((s,t)=>s+Math.abs(t.valor),0);
  const totOut      = visKPI.filter(t=>t.dir==='out').reduce((s,t)=>s+Math.abs(t.valor),0);

  // ── Filtro ──
  const srch = (_ofxSearch||'').toLowerCase();
  let vis = allTxns.filter(t=>{
    if(_ofxFilter==='pendente')  return t.status==='pendente';
    if(_ofxFilter==='vinculado') return t.status==='vinculado';
    if(_ofxFilter==='aplicado')  return t.status==='aplicado';
    if(_ofxFilter==='ignorado')  return t.status==='ignorado';
    if(_ofxFilter==='nao-class') return t.status==='pendente'&&!t.categoria;
    if(_ofxFilter&&_ofxFilter!=='todos') return t.categoria===_ofxFilter;
    return true;
  });
  if(srch) vis=vis.filter(t=>
    (t.memo||'').toLowerCase().includes(srch)||
    (t.banco||'').toLowerCase().includes(srch)||
    (t.entityLabel||'').toLowerCase().includes(srch)||
    (t.payee||'').toLowerCase().includes(srch)||
    (t.nota||'').toLowerCase().includes(srch)
  );

  // ── Helpers ──
  const catOpts = cats.map(c=>`<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');

  function buildEntityCell(t){
    const fid=t.fitid.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const cat=t.categoria;
    if(!cat) return '<span style="font-size:.65rem;color:var(--t3);">— selecione categoria —</span>';
    if(cat==='liga') return '<span style="font-size:.65rem;color:#f59e0b;font-weight:600;">🏆 Valor total à Liga</span>';
    if(cat==='despesas'){
      const subOpts=[{v:'software',l:'Software'},{v:'bancario',l:'Bancário'},{v:'pessoal',l:'Pessoal'},
        {v:'infraestrutura',l:'Infra'},{v:'marketing',l:'Marketing'},{v:'outros',l:'Outros'}]
        .map(s=>`<option value="${s.v}" ${t.subcategoria===s.v?'selected':''}>${s.l}</option>`).join('');
      const forn=(t.fornecedor||'').replace(/"/g,'&quot;');
      return `<div style="display:flex;flex-direction:column;gap:3px;">
        <select class="conc-entity-sel" onchange="ofxSetSub('${fid}',this.value)" style="font-size:.63rem;">
          <option value="">Subcategoria...</option>${subOpts}
        </select>
        <input type="text" placeholder="Fornecedor..." value="${forn}"
          style="background:var(--s2);border:1px solid var(--b1);color:var(--t1);border-radius:4px;padding:3px 7px;font-size:.63rem;width:100%;box-sizing:border-box;"
          onblur="ofxSetFornecedor('${fid}',this.value)">
      </div>`;
    }
    // Agentes / Jogadores / Outros / Clubes — usa picker pesquisável
    const opts=getOFXEntityOptions(cat);
    if(!opts.length) return '<span style="font-size:.65rem;color:var(--t3);">—</span>';
    const curEnt=opts.find(e=>e.id===t.entityId);
    const hasEnt=!!curEnt;
    const dispName=curEnt ? curEnt.nome : (t.entityLabel||'— Selecionar —');
    const dispPlatId=curEnt ? (curEnt.platformId||'—') : (t.platformId||'—');
    return `<button onclick="event.stopPropagation();ofxOpenEntityPicker('${fid}','${cat}',this)"
      style="background:${hasEnt?'rgba(129,140,248,.07)':'var(--s2)'};border:1px solid ${hasEnt?'rgba(129,140,248,.2)':'var(--b1)'};color:var(--t2);padding:5px 10px;border-radius:6px;font-size:.68rem;cursor:pointer;width:100%;text-align:left;box-sizing:border-box;line-height:1.4;">
      ${hasEnt
        ?`<div style="font-size:.72rem;font-weight:700;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dispName}</div>
           <div style="font-size:.62rem;color:var(--t3);font-family:'JetBrains Mono',monospace;">${dispPlatId}</div>`
        :`<div style="color:var(--t3);">— Selecionar —</div>`
      }
    </button>`;
  }

  const stBadge={
    pendente: '<span style="background:rgba(251,146,60,.1);border:1px solid rgba(251,146,60,.2);color:#fb923c;padding:1px 6px;border-radius:4px;font-size:.58rem;font-weight:600;">⏳ Pendente</span>',
    vinculado:'<span style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;padding:1px 6px;border-radius:4px;font-size:.58rem;font-weight:600;">🔗 Vinculado</span>',
    aplicado: '<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);color:#10b981;padding:1px 6px;border-radius:4px;font-size:.58rem;font-weight:600;">✅ Aplicado</span>',
    ignorado: '<span style="background:rgba(100,116,139,.08);border:1px solid rgba(100,116,139,.15);color:#64748b;padding:1px 6px;border-radius:4px;font-size:.58rem;font-weight:600;">🚫 Ignorado</span>',
  };

  function chip(key,label,cnt,rgb){
    const act=_ofxFilter===key;
    return `<button onclick="_ofxFilter='${key}';renderConcOFX()" style="background:${act?`rgba(${rgb},.15)`:'var(--s2)'};border:1px solid ${act?`rgba(${rgb},.35)`:'var(--b1)'};color:${act?`rgb(${rgb})`:'var(--t2)'};padding:4px 10px;border-radius:6px;font-size:.63rem;font-weight:${act?700:500};cursor:pointer;">${label} <span style="opacity:.7;">(${cnt})</span></button>`;
  }

  // ── Linhas da tabela ──
  const trows = vis.length ? vis.map(t=>{
    const fid=t.fitid.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const corV=t.dir==='in'?'#10b981':'#ef4444';
    const sinal=t.dir==='in'?'+':'−';
    const dtF=new Date(t.dt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const catObj=cats.find(c=>c.id===t.categoria);
    const catBadge=catObj?`<span style="color:${catObj.color};font-size:.6rem;font-weight:600;">${catObj.icon} ${catObj.label}</span>`:'';
    const isLocked=t.status==='aplicado'||t.status==='ignorado';

    // Categoria select (desabilitado se aplicado)
    const catCell=isLocked
      ?catBadge||'<span style="color:var(--t3);font-size:.65rem;">—</span>'
      :`<select class="conc-entity-sel" onchange="ofxSetCategoria('${fid}',this.value)" style="font-size:.63rem;">
          <option value="">— Categoria —</option>${catOpts.replace(`value="${t.categoria||''}"`,`value="${t.categoria||''}" selected`)}
        </select>`;

    // Entidade (desabilitado se aplicado/ignorado)
    const entCell=isLocked
      ?`<span style="font-size:.65rem;color:var(--t3);">${t.entityLabel||'—'}</span>`
      :buildEntityCell(t);

    // Botões de ação
    let acao='';
    if(t.status==='aplicado'){
      acao=locked
        ?`<span title="Semana lockada" style="font-size:.65rem;color:var(--t3);">🔒</span>`
        :`<button onclick="reverterOFX('${fid}')" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:3px 8px;border-radius:5px;font-size:.62rem;cursor:pointer;">↩ Reverter</button>`;
    } else if(t.status==='ignorado'){
      acao=`<button onclick="ofxRestaurar('${fid}')" style="background:var(--s2);border:1px solid var(--b1);color:var(--t2);padding:3px 8px;border-radius:5px;font-size:.62rem;cursor:pointer;">↩ Restaurar</button>`;
    } else if(t.status==='vinculado'){
      acao=`<div style="display:flex;gap:4px;align-items:center;">
        <button onclick="aplicarOFX('${fid}')" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#10b981;padding:3px 9px;border-radius:5px;font-size:.62rem;cursor:pointer;font-weight:700;">✓ Aplicar</button>
        <button onclick="ofxIgnorar('${fid}')" title="Ignorar" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:.7rem;">🚫</button>
      </div>`;
    } else {
      acao=`<button onclick="ofxIgnorar('${fid}')" title="Ignorar" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:.7rem;">🚫</button>`;
    }

    const rowStyle=t.status==='ignorado'?'opacity:.42;':t.status==='aplicado'?'opacity:.6;':'';
    const payeeInfo=t.payee?`<span style="background:rgba(168,139,250,.08);border:1px solid rgba(168,139,250,.15);color:#a78bfa;padding:1px 5px;border-radius:3px;font-size:.55rem;font-weight:600;" title="PAYEE">${t.payee}</span>`:'';
    const refInfo=t.refnum?`<span style="font-size:.55rem;color:var(--t3);font-family:'JetBrains Mono',monospace;" title="REF">#${t.refnum}</span>`:'';
    const notaVal=(t.nota||'').replace(/"/g,'&quot;');
    return `<tr style="${rowStyle}">
      <td style="white-space:nowrap;font-size:.68rem;color:var(--t3);">${dtF}</td>
      <td style="text-align:left;font-family:inherit;">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px;">
          <span style="background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.15);color:#60a5fa;padding:1px 5px;border-radius:3px;font-size:.58rem;font-weight:600;">${t.banco||'—'}</span>
          <span style="font-size:.7rem;color:var(--t1);font-weight:500;">${(t.memo||'').substr(0,50)}</span>
          ${payeeInfo}${refInfo}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">${stBadge[t.status]||''} ${catBadge}</div>
        ${t.notaLocked
          ?`<div style="margin-top:3px;display:flex;align-items:center;gap:4px;">
              <span style="background:rgba(168,139,250,.08);border:1px solid rgba(168,139,250,.25);color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:.6rem;font-weight:600;">📝 ${t.nota}</span>
              <button onclick="ofxUnlockNota('${fid}')" title="Editar anotação" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:.6rem;">✏️</button>
            </div>`
          :_ofxNotaOpenFitid===t.fitid
          ?`<div style="margin-top:3px;display:flex;align-items:center;gap:3px;">
              <input type="text" placeholder="Ex: Pago para Fulano" value="${notaVal}"
                id="ofx-nota-${fid}" autofocus
                onkeydown="if(event.key==='Enter'){ofxConfirmNota('${fid}')}"
                style="background:var(--s2);border:1px solid rgba(168,139,250,.3);color:var(--t1);border-radius:4px;padding:3px 8px;font-size:.62rem;flex:1;box-sizing:border-box;">
              <button onclick="ofxConfirmNota('${fid}')" title="Confirmar"
                style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#10b981;border-radius:4px;padding:2px 6px;font-size:.65rem;cursor:pointer;font-weight:700;">✓</button>
              <button onclick="ofxCloseNota('${fid}')" title="Cancelar"
                style="background:none;border:1px solid var(--b1);color:var(--t3);border-radius:4px;padding:2px 6px;font-size:.65rem;cursor:pointer;">✕</button>
            </div>`
          :`<button onclick="ofxOpenNota('${fid}')" style="margin-top:3px;background:none;border:1px dashed var(--b1);color:var(--t3);border-radius:4px;padding:2px 8px;font-size:.58rem;cursor:pointer;">📝 Anotar</button>`
        }
      </td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${corV};font-size:.76rem;white-space:nowrap;">R$ ${fV(t.valor,false)}</td>
      <td style="min-width:115px;text-align:left;font-family:inherit;">${catCell}</td>
      <td style="min-width:140px;text-align:left;font-family:inherit;">${entCell}</td>
      <td style="text-align:center;white-space:nowrap;">${acao}</td>
    </tr>`;
  }).join('') :
    `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--t3);font-size:.78rem;">Nenhuma transação neste filtro</td></tr>`;

  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:.82rem;font-weight:700;color:var(--t1);">🏦 Conciliação OFX</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <label class="conc-btn conc-btn-link" style="cursor:pointer;">
          📂 Importar OFX
          <input type="file" accept=".ofx,.OFX" multiple onchange="processOFX(this);setTimeout(renderConcOFX,400);" style="display:none;">
        </label>
        <button class="conc-btn" style="background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.25);color:#10b981;${locked?'opacity:.5;cursor:not-allowed;':''}"
          onclick="ofxAplicarTodos()" ${locked?'disabled':''}>
          ✓ Aplicar Vinculados (${cntVinc})
        </button>
        <button class="conc-btn" style="background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:#ef4444;${locked?'opacity:.5;cursor:not-allowed;':''}"
          onclick="clearAllOFXBindings()" ${locked?'disabled':''}>
          🗑 Limpar Vínculos
        </button>
      </div>
    </div>

    ${allTxns.length?`
    <div class="conc-summary">
      <div class="cs-box"><div class="cs-lbl">📄 Transações</div><div class="cs-val">${cntTotal}</div></div>
      <div class="cs-box"><div class="cs-lbl">📥 Entradas</div><div class="cs-val" style="color:#10b981;">R$ ${fV(totIn,false)}</div></div>
      <div class="cs-box"><div class="cs-lbl">📤 Saídas</div><div class="cs-val" style="color:#ef4444;">R$ ${fV(totOut,false)}</div></div>
      <div class="cs-box"><div class="cs-lbl">✅ Conciliados</div><div class="cs-val" style="color:#10b981;">${cntConc}</div></div>
      <div class="cs-box"><div class="cs-lbl">⚠️ Não classif.</div><div class="cs-val" style="color:#fb923c;">${cntNaoClass}</div></div>
    </div>

    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
      ${chip('todos','Todos',cntTotal,'148,163,184')}
      ${chip('pendente','⏳ Pendentes',cntPend,'251,146,60')}
      ${chip('vinculado','🔗 Vinculados',cntVinc,'96,165,250')}
      ${chip('aplicado','✅ Conciliados',cntConc,'16,185,129')}
      ${chip('ignorado','🚫 Ignorados',cntIgn,'100,116,139')}
      ${chip('nao-class','⚠️ Não classif.',cntNaoClass,'251,146,60')}
      <input type="text" placeholder="🔍 Buscar..." value="${_ofxSearch||''}"
        oninput="_ofxSearch=this.value;renderConcOFX()"
        style="background:var(--s2);border:1px solid var(--b1);color:var(--t1);border-radius:6px;padding:4px 10px;font-size:.65rem;width:150px;margin-left:4px;">
    </div>

    <div style="overflow-x:auto;max-height:500px;overflow-y:auto;">
    <table class="tbl" style="min-width:720px;">
      <thead><tr>
        <th>Data</th>
        <th>Banco · Descrição</th>
        <th style="text-align:right;">Valor</th>
        <th>Categoria</th>
        <th>Vincular A</th>
        <th style="text-align:center;">Ações</th>
      </tr></thead>
      <tbody>${trows}</tbody>
    </table>
    </div>
    `:`
    <div class="cs" style="padding:40px;">
      <div class="ci">🏦</div>
      <h3>Nenhum extrato OFX carregado</h3>
      <p style="color:var(--t3);font-size:.78rem;">Importe um arquivo .OFX do seu banco para começar.</p>
    </div>`}
  `;
}

function aplicarOFXConc(){
  // mantido por retrocompatibilidade — redireciona para novo fluxo
  ofxAplicarTodos();
  setTimeout(renderConcOFX, 200);
}

// ── 5. Ledger View ───────────────────────────────────────────
function renderConcLedger(){
  const el = document.getElementById('conc-ledger-content');
  if(!activeClube){ el.innerHTML='<div class="cs"><div class="ci">📂</div><h3>Abra um clube</h3></div>'; return; }

  const wk = weeks[selWeekIdx]||'0';
  const mvs = getWeekMovements(wk, activeClube);
  const entities = calcFinEntities();

  const totalIn  = mvs.filter(m=>m.dir==='in').reduce((s,m)=>s+m.amount,0);
  const totalOut = mvs.filter(m=>m.dir==='out').reduce((s,m)=>s+m.amount,0);

  // Cross-check: get all historico entries with source info
  const allData = getFinData();
  const key = finKey();
  const weekData = allData[key] || {};
  let cntFechamento = 0, cntStaging = 0, cntManual = 0, cntConciliado = 0, cntNaoConciliado = 0;
  let allHist = [];
  Object.entries(weekData).forEach(([entityId, data]) => {
    (data.historico||[]).forEach(h => {
      const src = h.source || (h.fitid ? 'staging' : 'manual');
      const conc = h.conciliado || !!h.fitid;
      if(src === 'fechamento') cntFechamento++;
      else if(src === 'staging') cntStaging++;
      else cntManual++;
      if(conc) cntConciliado++;
      else cntNaoConciliado++;
      const en = entities.find(e=>e.id===entityId);
      allHist.push({ ...h, entityId, entityName: en ? en.nome : entityId, _source: src, _conciliado: conc });
    });
  });
  allHist.sort((a,b) => (b.ts||0) - (a.ts||0));

  // Source badge helper
  const srcBadge = (src) => {
    const map = {
      'fechamento': { bg:'rgba(96,165,250,.1)', border:'rgba(96,165,250,.2)', color:'#60a5fa', label:'Liquidação' },
      'staging':    { bg:'rgba(16,185,129,.08)', border:'rgba(16,185,129,.2)', color:'#10b981', label:'Import' },
      'manual':     { bg:'rgba(240,180,41,.08)', border:'rgba(240,180,41,.2)', color:'var(--gold)', label:'Manual' }
    };
    const s = map[src] || map.manual;
    return '<span style="background:'+s.bg+';border:1px solid '+s.border+';color:'+s.color+';padding:1px 6px;border-radius:3px;font-size:.52rem;font-weight:700;">'+s.label+'</span>';
  };

  const concBadge = (conc) => conc
    ? '<span style="color:#10b981;font-size:.7rem;">✅</span>'
    : '<span style="color:#f59e0b;font-size:.7rem;">⚠️</span>';

  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="font-size:.82rem;font-weight:700;color:var(--t1);">📒 Ledger de Movimentações</div>
      <div style="font-size:.7rem;color:var(--t3);">${allHist.length} movimentações · Semana ${fWL(wk)}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;">
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:8px 10px;border-top:2px solid #60a5fa;">
        <div style="font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--t3);">💼 Liquidação</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:800;color:#60a5fa;">${cntFechamento}</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:8px 10px;border-top:2px solid #10b981;">
        <div style="font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--t3);">📥 Import</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:800;color:#10b981;">${cntStaging}</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:8px 10px;border-top:2px solid ${cntConciliado>0?'#10b981':'#94a3b8'};">
        <div style="font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--t3);">✅ Conciliados</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:800;color:${cntConciliado>0?'#10b981':'var(--t3)'};">${cntConciliado}</div>
      </div>
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:8px 10px;border-top:2px solid ${cntNaoConciliado>0?'#f59e0b':'#10b981'};">
        <div style="font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--t3);">⚠️ Pendentes</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:800;color:${cntNaoConciliado>0?'#f59e0b':'#10b981'};">${cntNaoConciliado > 0 ? cntNaoConciliado : '✓'}</div>
      </div>
    </div>

    ${allHist.length ? `
    <div style="max-height:400px;overflow-y:auto;">
    <table class="tbl">
      <thead><tr>
        <th>Data</th>
        <th>Entidade</th>
        <th>Método</th>
        <th>Origem</th>
        <th>Dir</th>
        <th style="text-align:right;">Valor</th>
        <th style="text-align:center;">Conc.</th>
      </tr></thead>
      <tbody>
        ${allHist.map(h=>{
          const dtF = new Date(h.ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
          const isIn = h.dir==='in';
          return `<tr>
            <td style="font-size:.7rem;color:var(--t3);white-space:nowrap;">${dtF}</td>
            <td style="font-size:.74rem;font-weight:600;text-align:left;font-family:inherit;">${h.entityName}</td>
            <td style="font-size:.68rem;text-align:left;font-family:inherit;">${h.metodo||'—'}</td>
            <td style="text-align:left;font-family:inherit;">${srcBadge(h._source)}</td>
            <td style="color:${isIn?'#10b981':'#60a5fa'};font-weight:700;font-size:.74rem;">${isIn?'↓ IN':'↑ OUT'}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;color:${isIn?'#10b981':'#ef4444'};font-size:.8rem;">${isIn?'+':'−'}R$ ${fV(h.valor||0,false)}</td>
            <td style="text-align:center;font-family:inherit;">${concBadge(h._conciliado)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    ` : `
    <div class="cs" style="padding:30px;">
      <div class="ci">📒</div>
      <h3>Nenhuma movimentação registrada</h3>
      <p style="color:var(--t3);font-size:.78rem;">Registre pagamentos na aba Liquidação ou importe via ChipPix/OFX.</p>
    </div>`}
  `;
}

// ══════════════════ FIM MÓDULO CONCILIAÇÃO ═══════════════════

