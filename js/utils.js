// ══════════════════════════════════════════════════════════════════════
//  utils.js — Helpers puros (Poker Manager)
//  Sem estado. Sem acesso a localStorage. Apenas formatação e UI helpers.
// ══════════════════════════════════════════════════════════════════════

function formatBytes(b){
  if(b < 1024) return b + ' B';
  if(b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/(1024*1024)).toFixed(2) + ' MB';
}

function escRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function fV(v, dash=true){
  const n = Number(v);
  if(dash && (isNaN(n) || n===0)) return '—';
  if(isNaN(n)) return '0,00';
  return (n<0?'-':'') + Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function clr(v){const n=Number(v);return Math.abs(n)<0.005?'var(--t3)':n>0?'#10b981':'#ef4444';}

function fmtV(v){return 'R$ '+fV(v,false);}

function sumF(arr, key){ return arr.reduce((s,p)=>{ const n=Number(p[key]); return s+(isNaN(n)?0:n); },0); }

function n(v){ return Number(v)||0; }

function slugify(str){
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function makeEntityId(prefix, key){
  return prefix + '_' + slugify(key);
}

function csvDl(data,fname){
  const cols=['ID Jogador','Nick','Função','ID Agente','Nome Agente','ID Sub-Agente','Sub-Agente','Ganhos','Rake','Rodeio GGR','Rakeback %','Resultado Semana','Clube'];
  const rows=data.map(p=>[p.id,p.nick,p.func,p.aid,p.aname,p.said,p.saname,p.ganhos,p.rake,p.ggr,p.rakeback,calcResult(p),p.clube]);
  const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download=fname;a.click();
  showToast('✅ CSV exportado!');
}

function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');}

function showConfirmModal(title, message, onConfirm){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.4);">
    <div style="font-size:.95rem;font-weight:700;color:var(--t1);margin-bottom:14px;">${title}</div>
    <div style="font-size:.82rem;color:var(--t2);line-height:1.5;margin-bottom:22px;">${message}</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="cm-cancel" style="background:var(--s3);border:1px solid var(--b2);color:var(--t2);padding:8px 18px;border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer;">Cancelar</button>
      <button id="cm-confirm" style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);color:#60a5fa;padding:8px 18px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;">Confirmar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cm-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#cm-confirm').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
}

function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className=type==='e'?'err show':'show';
  setTimeout(()=>el.className='',3000);
}
