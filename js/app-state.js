// ══════════════════════════════════════════════════════════════════════
//  app-state.js — Estado global, constantes, backup/restore (Poker Manager)
//  Depende de: dataLayer.js, utils.js
// ══════════════════════════════════════════════════════════════════════

// ── Diagnóstico ──
window.DEBUG_FINANCE = false;

// ── Estado Global ──
window.allPlayers = [];
window.filteredAll = [];
window.filteredClub = [];
window.selWeekIdx = 0;
window.weeks = [];
window.activeClube = null;
window.pendingLinkIdx = null;
window.selOpt = null;
window.pgAll = 1;
window.pgClub = 1;
const PS = 30;

// ── Liga Config ──
const LIGA_DEFAULTS = { taxaApp: 8, taxaLiga: 10, taxaRodeoGGR: 12, taxaRodeoApp: 18 };
window.ligaConfig = { ...LIGA_DEFAULTS, ...DataLayer.getLigaConfig() };
function saveLigaConfig(){ DataLayer.saveLigaConfig(ligaConfig); }
function getLigaRate(key){ return (Number(ligaConfig[key]) || 0) / 100; }

// ── Schema & Migration ──
const SCHEMA_VERSION = 1;
const PM_KEYS_STATIC = [
  'pm_agentDirect','pm_agentRB','pm_bankAccounts','pm_clubManual','pm_club_logos',
  'pm_cp_map','pm_fin','pm_finSnapshot','pm_imports','pm_ligaConfig','pm_movements',
  'pm_ofx_map','pm_overlay','pm_overlayClubes','pm_payMethods','pm_pay_methods',
  'pm_playerDirect','pm_playerRB','pm_rbSnapAgents','pm_rbSnapPlayers',
  'pm_saldo_prev','pm_staged','pm_weekLocked','pm_carry'
];

function migrateState(state){
  const v = state._meta?.schemaVersion || 0;
  if(v > SCHEMA_VERSION){
    throw new Error('Backup de versão mais recente (v'+v+'). Atualize o sistema primeiro.');
  }
  return state;
}

// ── Backup / Restore ──
function getAllPMKeys(){ return DataLayer.getAllPMKeys(); }

function collectState(){
  const state = { _meta: { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), keys: 0 } };
  const keys = getAllPMKeys();
  keys.forEach(k => { state[k] = localStorage.getItem(k); });
  state._meta.keys = keys.length;
  return state;
}

function getStateSize(){
  let total = 0;
  getAllPMKeys().forEach(k => { total += (localStorage.getItem(k)||'').length; });
  return total;
}

function backupState(){
  const state = collectState();
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  a.href = url;
  a.download = 'poker-backup-'+ts+'.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Backup exportado — '+state._meta.keys+' chaves · '+formatBytes(json.length));
}

function restoreState(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let state = JSON.parse(e.target.result);
      if(!state._meta) throw new Error('Arquivo inválido — sem metadados.');

      state = migrateState(state);

      const keyCount = Object.keys(state).filter(k => k !== '_meta').length;
      if(!confirm('⚠️ RESTAURAR BACKUP?\n\nVersão: v'+state._meta.schemaVersion+'\nData: '+(state._meta.exportedAt||'?')+'\nChaves: '+keyCount+'\n\nTodos os dados atuais serão SUBSTITUÍDOS. Continuar?')) return;

      // Clear existing pm_ keys
      getAllPMKeys().forEach(k => localStorage.removeItem(k));

      // Restore
      let restored = 0;
      Object.entries(state).forEach(([k, v]) => {
        if(k === '_meta') return;
        localStorage.setItem(k, v);
        restored++;
      });

      showToast('✅ Backup restaurado! '+restored+' chaves. Recarregando...');
      setTimeout(() => location.reload(), 1200);
    } catch(err){
      showToast('❌ Erro: '+err.message, 'e');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── Snapshots ──
function getSnapshots(){ return DataLayer.getSnapshots(); }
function saveSnapshots(arr){ DataLayer.saveSnapshots(arr); }

function saveLocalSnapshot(){
  const state = collectState();
  const snapshots = getSnapshots();
  const ts = new Date().toISOString();
  const label = (activeClube||'global') + ' · ' + (weeks[selWeekIdx]?fWL(weeks[selWeekIdx]):'—');
  snapshots.unshift({ ts, label, state: JSON.stringify(state), size: JSON.stringify(state).length });

  // Keep max 5 snapshots
  while(snapshots.length > 5) snapshots.pop();
  saveSnapshots(snapshots);

  showToast('🧷 Snapshot salvo: '+label);
  renderBackupInfo();
}

function restoreSnapshot(idx){
  const snapshots = getSnapshots();
  const snap = snapshots[idx];
  if(!snap) return;
  if(!confirm('Restaurar snapshot de '+new Date(snap.ts).toLocaleString('pt-BR')+'?\n\nTodos os dados atuais serão substituídos.')) return;

  try {
    let state = JSON.parse(snap.state);
    state = migrateState(state);
    getAllPMKeys().forEach(k => localStorage.removeItem(k));
    Object.entries(state).forEach(([k,v]) => { if(k !== '_meta') localStorage.setItem(k, v); });
    showToast('✅ Snapshot restaurado! Recarregando...');
    setTimeout(() => location.reload(), 1200);
  } catch(err){ showToast('❌ Erro: '+err.message, 'e'); }
}

function deleteSnapshot(idx){
  const snapshots = getSnapshots();
  snapshots.splice(idx, 1);
  saveSnapshots(snapshots);
  renderBackupInfo();
  showToast('🗑️ Snapshot removido');
}

function renderBackupInfo(){
  const infoEl = document.getElementById('backup-info');
  const sizeEl = document.getElementById('backup-size');
  const listEl = document.getElementById('backup-snapshots-list');
  if(infoEl) infoEl.textContent = 'Schema v' + SCHEMA_VERSION;
  if(sizeEl) sizeEl.textContent = formatBytes(getStateSize()) + ' · ' + getAllPMKeys().length + ' chaves';

  if(!listEl) return;
  const snapshots = getSnapshots();
  if(!snapshots.length){
    listEl.innerHTML = '<div style="font-size:.62rem;color:var(--t3);padding:6px 0;">Nenhum snapshot local salvo</div>';
    return;
  }
  let html = '<div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);margin-bottom:6px;">📦 Snapshots Locais ('+snapshots.length+'/5)</div>';
  snapshots.forEach((s,i) => {
    const dt = new Date(s.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;margin-bottom:4px;">';
    html += '<span style="font-size:.65rem;color:var(--t2);flex:1;">🧷 '+dt+' — <strong>'+s.label+'</strong> <span style="color:var(--t3);">'+formatBytes(s.size||0)+'</span></span>';
    html += '<button onclick="restoreSnapshot('+i+')" style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15);color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:.52rem;font-weight:700;cursor:pointer;">↩ Restaurar</button>';
    html += '<button onclick="deleteSnapshot('+i+')" style="background:none;border:none;color:var(--t3);font-size:.65rem;cursor:pointer;" title="Excluir">✕</button>';
    html += '</div>';
  });
  listEl.innerHTML = html;
}

// ── Limpeza ──
function clearAllData(){
  if(!confirm('⚠️ ATENÇÃO: Isso vai apagar TODOS os dados do sistema.\n\nFaça backup antes!\n\nDigite "CONFIRMAR" para continuar:')) return;
  const confirmText = prompt('Digite CONFIRMAR para apagar todos os dados:');
  if(confirmText !== 'CONFIRMAR'){ showToast('Cancelado','e'); return; }

  getAllPMKeys().forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('pm_snapshots');
  showToast('🗑️ Todos os dados apagados. Recarregando...');
  setTimeout(() => location.reload(), 1200);
}

function cleanDeadKeys(){
  const all = getAllPMKeys();
  const alive = new Set(PM_KEYS_STATIC);
  // Also keep dynamic keys (pm_cp||..., pm_ofx||...)
  const dead = all.filter(k => !alive.has(k) && !k.startsWith('pm_cp||') && !k.startsWith('pm_ofx||'));
  if(!dead.length){ showToast('✅ Nenhuma chave órfã encontrada'); return; }
  if(!confirm('Encontradas '+dead.length+' chaves órfãs:\n\n'+dead.join('\n')+'\n\nRemover?')) return;
  dead.forEach(k => localStorage.removeItem(k));
  showToast('🧹 '+dead.length+' chaves removidas');
  renderBackupInfo();
}

// ── Carry Helpers ──
function getCarryForCurrentWeek(){
  if(!activeClube) return {};
  return DataLayer.computeCarryForWeek(activeClube, selWeekIdx, weeks, allPlayers);
}

function getAgencyCarry(agKey){
  const carry = getCarryForCurrentWeek();
  return Number(carry[agKey]) || 0;
}

// ── Classificação de Clubes ──
const RULES = [
  {tokens:['BB','AMS'], c:'IMPÉRIO'},
  {tokens:['AMS'],      c:'IMPÉRIO'},
  {tokens:['TW'],       c:'IMPÉRIO'},
  {tokens:['3BET'],     c:'3BET'},
  {tokens:['CONFRA'],   c:'CONFRARIA'},
  {tokens:['TGP'],      c:'TGP'},
  {tokens:['CH'],       c:'CH'},
];
const CMETA = {
  'IMPÉRIO':  {icon:'👑',cls:'ct-imp',color:'var(--gold)',  cc:'imperio'},
  'CONFRARIA':{icon:'🎯',cls:'ct-con',color:'var(--green)', cc:'confraria'},
  '3BET':     {icon:'🃏',cls:'ct-3bt',color:'#c084fc',      cc:'tbet'},
  'TGP':      {icon:'🏆',cls:'ct-tgp',color:'#fb923c',      cc:'tgp'},
  'CH':       {icon:'⚡',cls:'ct-ch', color:'#60a5fa',      cc:'ch'},
  '?':        {icon:'❓',cls:'ct-unk',color:'var(--red)',    cc:''},
};
const CLUBS = ['IMPÉRIO','CONFRARIA','3BET','TGP','CH'];

// ── Categorias de transação OFX ──
const DEFAULT_CATS = [
  { id:'agentes',   label:'Agentes',            color:'#60a5fa', icon:'👤', deletable:false },
  { id:'jogadores', label:'Jogadores',           color:'#34d399', icon:'🎮', deletable:false },
  { id:'liga',      label:'Liga',                color:'#f59e0b', icon:'🏆', deletable:false },
  { id:'clubes',    label:'Rep. Clubes',         color:'#a78bfa', icon:'🔄', deletable:false },
  { id:'despesas',  label:'Despesas',            color:'#f87171', icon:'💳', deletable:false },
  { id:'outros',    label:'Outros',              color:'#94a3b8', icon:'📦', deletable:false },
];

// Cache de vínculos manuais
const manualLinks = {
  'AG ANDRÉ': 'IMPÉRIO',
};

function classify(agent){
  if(!agent) return '?';
  const raw = String(agent).trim();
  const u   = raw.toUpperCase();

  // 1. Vínculo manual salvo anteriormente
  if(manualLinks[u]) return manualLinks[u];

  // Normaliza: remove prefixos "AG ", "AG. ", pontos, underlines, hífens → espaço
  const norm = u
    .replace(/\bAG\b\.?/g,' ')
    .replace(/[_\.\-\/\\]/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  // Divide em tokens (palavras)
  const tks = norm.split(' ').filter(Boolean);

  // Para cada regra, verifica se TODOS os seus tokens aparecem na lista de tokens do agente
  for(const r of RULES){
    const allMatch = r.tokens.every(rt =>
      tks.some(t => t === rt || t.startsWith(rt))
    );
    if(allMatch) return r.c;
  }

  return '?';
}

function saveManualLink(agentNameUpper, clube){
  manualLinks[agentNameUpper] = clube;
  allPlayers.forEach(p => {
    if(String(p.aname).toUpperCase().trim() === agentNameUpper) p.clube = clube;
  });
}
