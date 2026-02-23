// ══════════════════════════════════════════════════════════════════════
//  render-reports.js — DRE + Liga + Resumo + Lançamentos (Poker Manager)
//  Depende de: financeEngine.js, dataLayer.js, utils.js, app-state.js,
//              render-rakeback.js, render-financeiro.js
// ══════════════════════════════════════════════════════════════════════

let _dreExpanded  = { receita:false, custos:false, taxas:false, despesas:false, lancamentos:false };


// Lançamentos page
function renderLancamentos(){
  const el = document.getElementById('lancamentos-content');
  if(!el) return;
  if(!CLUBS.length || !allPlayers.length){
    el.innerHTML='<div class="cs"><div class="ci">📝</div><h3>Lançamentos</h3><p>Importe a planilha primeiro.</p></div>';
    return;
  }
  const wkLock = isWeekLocked();
  const sel = getOverlayClubesList();
  const perClub = sel.length > 0 && overlayGlobal !== 0 ? overlayGlobal / sel.length : 0;

  // Overlay club checkboxes
  const clubChecks = CLUBS.map(c=>{
    const m = CMETA[c]||{};
    const checked = sel.includes(c) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:${sel.includes(c)?'rgba(59,130,246,.06)':'var(--s2)'};border:1px solid ${sel.includes(c)?'rgba(59,130,246,.2)':'var(--b1)'};border-radius:7px;cursor:pointer;flex:1;min-width:110px;">
      <input type="checkbox" ${checked} ${wkLock?'disabled':''} onchange="_toggleOverlayClub('${c.replace(/'/g,"\\'")}',this.checked)" style="accent-color:#60a5fa;">
      <span style="font-size:.75rem;font-weight:600;color:var(--t1);">${m.icon||''} ${c}</span>
      ${sel.includes(c) && overlayGlobal !== 0 ? '<span style="margin-left:auto;font-family:\'JetBrains Mono\',monospace;font-size:.7rem;font-weight:700;color:#60a5fa;">'+fmtV(perClub)+'</span>' : ''}
    </label>`;
  }).join('');

  // Per-club table rows
  const tblRows = CLUBS.map(c=>{
    const m = CMETA[c]||{};
    const e = getLigaClubEntry(c);
    const cid = c.replace(/'/g,"\\'");
    const locked = e._locked || wkLock;
    const rowTotal = (sel.includes(c)?perClub:0)+(e.compras||0)+(e.security||0)+(e.outros||0);

    if(locked){
      // LOCKED ROW — read-only values + Alterar button
      const valStyle = 'font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:600;';
      const valClr = v => v!==0 ? (v<0?'#ef4444':'#10b981') : 'var(--t3)';
      return `<tr style="border-bottom:1px solid var(--b1);background:rgba(16,185,129,.02);">
        <td style="padding:10px 14px;font-weight:600;font-size:.8rem;white-space:nowrap;"><span style="margin-right:5px;">${m.icon||'♠'}</span>${c}</td>
        <td style="padding:8px 10px;text-align:center;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:${sel.includes(c)?'#60a5fa':'var(--t3)'};">${sel.includes(c)?fmtV(perClub):'—'}</td>
        <td style="padding:8px 10px;text-align:center;${valStyle}color:${valClr(e.compras)};">${e.compras?fmtV(e.compras):'—'}</td>
        <td style="padding:8px 10px;text-align:center;${valStyle}color:${valClr(e.security)};">${e.security?fmtV(e.security):'—'}</td>
        <td style="padding:8px 10px;text-align:center;${valStyle}color:${valClr(e.outros)};">${e.outros?fmtV(e.outros):'—'}</td>
        <td style="padding:8px 10px;font-size:.72rem;color:var(--t2);">${e.obs||'—'}</td>
        <td style="padding:10px 14px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;color:${clr(rowTotal)};" id="lanc-total-${c.replace(/\s/g,'_')}">${fmtV(rowTotal)}</td>
        <td style="padding:8px 10px;text-align:center;">
          ${wkLock ? '<span style="font-size:.6rem;color:var(--t3);">🔒</span>' :
          '<button onclick="_unlockLancRow(\''+cid+'\')" style="background:var(--s3);border:1px solid var(--b2);color:var(--t2);padding:4px 10px;border-radius:6px;font-size:.62rem;font-weight:600;cursor:pointer;white-space:nowrap;">✎ Alterar</button>'}
        </td>
      </tr>`;
    } else {
      // EDITABLE ROW — inputs + OK button
      const inpStyle = 'width:100%;text-align:right;font-size:.78rem;padding:7px 10px;';
      return `<tr style="border-bottom:1px solid var(--b1);">
        <td style="padding:10px 14px;font-weight:600;font-size:.8rem;white-space:nowrap;"><span style="margin-right:5px;">${m.icon||'♠'}</span>${c}</td>
        <td style="padding:8px 10px;text-align:center;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:${sel.includes(c)?'#60a5fa':'var(--t3)'};">${sel.includes(c)?fmtV(perClub):'—'}</td>
        <td style="padding:6px 10px;"><input class="rs-inp" type="number" step="0.01" value="${e.compras||''}"
          oninput="saveLigaClubEntry('${cid}','compras',parseFloat(this.value)||0);_refreshLancTotals()" style="${inpStyle}" placeholder="0"></td>
        <td style="padding:6px 10px;"><input class="rs-inp" type="number" step="0.01" value="${e.security||''}"
          oninput="saveLigaClubEntry('${cid}','security',parseFloat(this.value)||0);_refreshLancTotals()" style="${inpStyle}" placeholder="0"></td>
        <td style="padding:6px 10px;"><input class="rs-inp" type="number" step="0.01" value="${e.outros||''}"
          oninput="saveLigaClubEntry('${cid}','outros',parseFloat(this.value)||0);_refreshLancTotals()" style="${inpStyle}" placeholder="0"></td>
        <td style="padding:6px 10px;"><input class="rs-inp" type="text" value="${(e.obs||'').replace(/"/g,'&quot;')}"
          oninput="saveLigaClubEntry('${cid}','obs',this.value)" style="width:100%;font-size:.74rem;padding:7px 10px;" placeholder="—"></td>
        <td style="padding:10px 14px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.8rem;font-weight:700;" id="lanc-total-${c.replace(/\s/g,'_')}">${fmtV(rowTotal)}</td>
        <td style="padding:8px 10px;text-align:center;">
          <button onclick="_lockLancRow('${cid}')" style="background:var(--green-d);border:1px solid rgba(16,185,129,.3);color:var(--green);padding:5px 12px;border-radius:6px;font-size:.65rem;font-weight:700;cursor:pointer;white-space:nowrap;">✓ OK</button>
        </td>
      </tr>`;
    }
  }).join('');

  // Grand totals
  let gOverlay=0, gCompras=0, gSecurity=0, gOutros=0;
  CLUBS.forEach(c=>{
    const e = getLigaClubEntry(c);
    if(sel.includes(c)) gOverlay += perClub;
    gCompras += (e.compras||0);
    gSecurity += (e.security||0);
    gOutros += (e.outros||0);
  });
  const gTotal = gOverlay + gCompras + gSecurity + gOutros;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:1rem;font-weight:800;color:var(--t1);">📝 Lançamentos</div>
        <div style="font-size:.72rem;color:var(--t3);margin-top:2px;">Overlay global + ajustes manuais por clube · Semana selecionada</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="font-size:.68rem;color:var(--t3);background:var(--s2);border:1px solid var(--b1);padding:5px 12px;border-radius:6px;">
          📅 ${weeks[selWeekIdx] ? fWL(weeks[selWeekIdx]) : '—'}
        </div>
        ${wkLock ? '<span style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:.65rem;font-weight:700;">🔒 Semana Consolidada</span>' : ''}
      </div>
    </div>

    <!-- OVERLAY GLOBAL -->
    <div style="background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.15);border-radius:10px;padding:18px 20px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <div style="font-size:.82rem;font-weight:700;color:#60a5fa;">🎲 Overlay Global</div>
          <div style="font-size:.62rem;color:var(--t3);margin-top:2px;">Valor total dividido entre os clubes selecionados abaixo</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:.72rem;color:var(--t3);">R$</span>
          <input class="rs-inp" type="number" step="0.01" id="lanc-overlay-global" value="${overlayGlobal||''}" ${wkLock?'disabled style="opacity:.6;"':''}
            oninput="_updateLancOverlay()" style="width:130px;text-align:right;font-size:.9rem;font-weight:700;" placeholder="0">
        </div>
      </div>
      <div style="font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--t3);margin-bottom:8px;">Aplicar a:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${clubChecks}
      </div>
      ${sel.length > 0 && overlayGlobal !== 0 ? '<div style="margin-top:10px;text-align:center;font-size:.68rem;color:var(--t3);">'+fmtV(overlayGlobal)+' ÷ '+sel.length+' clubes = <strong style="color:#60a5fa;">'+fmtV(perClub)+' por clube</strong></div>' : ''}
    </div>

    <!-- TABELA POR CLUBE -->
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📋 Lançamentos por Clube</div>
    <div style="border:1px solid var(--b1);border-radius:10px;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <colgroup>
          <col style="width:12%;">
          <col style="width:11%;">
          <col style="width:14%;">
          <col style="width:14%;">
          <col style="width:14%;">
          <col style="width:14%;">
          <col style="width:11%;">
          <col style="width:10%;">
        </colgroup>
        <thead>
          <tr style="background:var(--s2);border-bottom:2px solid var(--b1);">
            <th style="padding:11px 14px;text-align:left;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Clube</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:#60a5fa;font-weight:700;">Overlay</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Compras</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Security</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Outros</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Obs.</th>
            <th style="padding:11px 14px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--gold);font-weight:700;">Total</th>
            <th style="padding:11px 10px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Ação</th>
          </tr>
        </thead>
        <tbody>
          ${tblRows}
          <tr style="background:var(--s2);border-top:2px solid var(--gold);font-weight:800;">
            <td style="padding:12px 14px;color:var(--gold);font-size:.8rem;">TOTAIS</td>
            <td style="text-align:center;padding:12px 10px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:#60a5fa;">${fmtV(gOverlay)}</td>
            <td style="text-align:center;padding:12px 10px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:${clr(gCompras)};" id="lanc-tot-compras">${fmtV(gCompras)}</td>
            <td style="text-align:center;padding:12px 10px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:${clr(gSecurity)};" id="lanc-tot-security">${fmtV(gSecurity)}</td>
            <td style="text-align:center;padding:12px 10px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:${clr(gOutros)};" id="lanc-tot-outros">${fmtV(gOutros)}</td>
            <td></td>
            <td style="text-align:right;padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:800;color:${clr(gTotal)};" id="lanc-grand-total">${fmtV(gTotal)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:.62rem;color:var(--t3);text-align:center;">
      💡 Valores salvos automaticamente. Usados no Liga de cada clube e no Liga — Consolidado.
    </div>
  `;
}

function _updateLancOverlay(){
  const val = parseFloat(document.getElementById('lanc-overlay-global')?.value) || 0;
  overlayGlobal = val;
  saveOverlay();
  renderLancamentos();
}

function _toggleOverlayClub(clube, checked){
  let sel = getOverlayClubesList();
  if(checked && !sel.includes(clube)) sel.push(clube);
  if(!checked) sel = sel.filter(c=>c!==clube);
  overlayClubes = sel;
  saveOverlayClubes();
  renderLancamentos();
}

function _refreshLancTotals(){
  // Quick inline update without full re-render
  const sel = getOverlayClubesList();
  const perClub = sel.length > 0 && overlayGlobal !== 0 ? overlayGlobal / sel.length : 0;
  let gCompras=0, gSecurity=0, gOutros=0, gOverlay=0;
  CLUBS.forEach(c=>{
    const e = getLigaClubEntry(c);
    const ov = sel.includes(c) ? perClub : 0;
    if(sel.includes(c)) gOverlay += perClub;
    gCompras += (e.compras||0); gSecurity += (e.security||0); gOutros += (e.outros||0);
    const tot = ov + (e.compras||0) + (e.security||0) + (e.outros||0);
    const td = document.getElementById('lanc-total-'+c.replace(/\s/g,'_'));
    if(td){ td.textContent = fmtV(tot); td.style.color = clr(tot); }
  });
  const gTotal = gOverlay + gCompras + gSecurity + gOutros;
  const tc = document.getElementById('lanc-tot-compras'); if(tc) tc.textContent = fmtV(gCompras);
  const ts = document.getElementById('lanc-tot-security'); if(ts) ts.textContent = fmtV(gSecurity);
  const to = document.getElementById('lanc-tot-outros'); if(to) to.textContent = fmtV(gOutros);
  const gt = document.getElementById('lanc-grand-total'); if(gt){ gt.textContent = fmtV(gTotal); gt.style.color = clr(gTotal); }
}

// Legacy stubs
function calcOverlay(){}
function lockCompras(){}
function unlockCompras(){}
function _lockResumoField(){}
function _unlockResumoField(){}
function getManual(){ return {}; }
function getLigaLanc(wk){ 
  const clubes = {};
  CLUBS.forEach(c=>{ clubes[c] = getLigaClubEntry(c); });
  return { overlayGlobal, clubes };
}
function saveManualInputs(){}
function loadManualInputs(){ renderResumo(); }

function updateClubKPIs(){
  if(!activeClube) return;
  renderResumo();
}

function calcFinal(){
  if(!activeClube) return;
  _renderResumoResult();
}

function _renderResumoResult(){
  const box = document.getElementById('rs-result-box');
  if(!box) return;
  const n = calcLigaNumbers();
  if(!n) return;
  const dirColor = clr(n.totalLiga);
  const dirIcon  = n.totalLiga >= 0 ? '🟢' : '🔴';
  box.innerHTML = `
    <div class="rs-final-box">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:rgba(240,180,41,.7);margin-bottom:6px;">ACERTO TOTAL LIGA</div>
          <div style="font-size:.74rem;color:rgba(240,180,41,.55);font-family:'JetBrains Mono',monospace;">Resultado Clube + Taxas + Lançamentos</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.85rem;font-weight:800;letter-spacing:-1px;color:${dirColor};">${fmtV(n.totalLiga)}</div>
          <div style="font-size:.72rem;color:${dirColor};margin-top:2px;">${dirIcon} ${n.direcao}</div>
        </div>
      </div>
    </div>`;
}

// ═══ RENDER RESUMO (club operational result — no Liga adjustments) ═══
function renderResumo(){
  const el = document.getElementById('resumo-content');
  if(!el) return;
  if(!activeClube || !allPlayers.filter(p=>p.clube===activeClube).length){
    el.innerHTML='<div class="cs"><div class="ci">📋</div><h3>Importe a planilha primeiro</h3></div>';
    return;
  }

  const n = calcLigaNumbers();
  if(!n){ el.innerHTML='<div class="cs"><div class="ci">⚠️</div><h3>Sem dados</h3></div>'; return; }

  const taxRow = (label, sub, val) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 14px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.1);border-radius:7px;margin-bottom:4px;">'
    + '<div style="font-size:.72rem;color:var(--t2);">'+label+(sub?' <span style="font-size:.58rem;color:var(--t3);">'+sub+'</span>':'')+'</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:600;color:#ef4444;">'+fmtV(val)+'</div></div>';

  const readOnlyRow = (label, sub, val) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;margin-bottom:5px;">'
    + '<div style="font-size:.76rem;font-weight:600;color:var(--t1);">'+label+(sub?'<div style="font-size:.55rem;color:var(--t3);font-weight:400;">'+sub+'</div>':'')+'</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;font-weight:700;color:'+(val!==0?clr(val):'var(--t3)')+';">'+(val!==0?fmtV(val):'—')+'</div></div>';

  const sel = getOverlayClubesList();
  const ativosR = n.cp.filter(p => Math.abs(Number(p.ganhos)||0) > 0.01).length;

  el.innerHTML = `
    <!-- KPI Strip -->
    <div class="kpi-row" style="margin-bottom:18px;grid-template-columns:repeat(5,1fr);">
      <div class="km g"><div class="km-lbl">Jogadores Ativos</div><div class="km-val g">${ativosR}</div></div>
      <div class="km" style="border-top:2px solid var(--blue);">
        <div class="km-lbl">Profit/Loss<div style="font-size:.55rem;color:var(--t3);font-weight:400;">ganhos e perdas</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.profitLoss)};">${fV(n.profitLoss,false)}</div>
      </div>
      <div class="km gr"><div class="km-lbl">Rake Gerado</div><div class="km-val gr">${fV(n.rakeGerado,false)}</div></div>
      <div class="km" style="border-top:2px solid #a78bfa;">
        <div class="km-lbl">GGR Rodeo P/L</div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.ggrRodeo)};">${fV(n.ggrRodeo,false)}</div>
      </div>
      <div class="km" style="border-top:2px solid var(--gold);">
        <div class="km-lbl">Resultado do Clube<div style="font-size:.55rem;color:var(--t3);font-weight:400;">P/L + Rake + GGR</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:${clr(n.resultadoClube)};">${fV(n.resultadoClube,false)}</div>
      </div>
    </div>

    <!-- Two columns -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
      <!-- LEFT: Taxas automáticas -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📊 Taxas Automáticas</div>
        ${taxRow('Taxa Aplicativo', ligaConfig.taxaApp+'% do Rake', n.taxaApp)}
        ${taxRow('Taxa Liga', ligaConfig.taxaLiga+'% do Rake', n.taxaLiga)}
        ${n.ggrRodeo > 0 ? taxRow('Taxa Rodeo GGR', ligaConfig.taxaRodeoGGR+'% do GGR', n.taxaRodeoGGR) : '<div style="padding:7px 14px;font-size:.72rem;color:var(--t3);margin-bottom:4px;">Taxa Rodeo GGR — <em>GGR ≤ 0, não incide</em></div>'}
        ${n.ggrRodeo > 0 ? taxRow('Taxa Rodeo App', ligaConfig.taxaRodeoApp+'% do GGR', n.taxaRodeoApp) : '<div style="padding:7px 14px;font-size:.72rem;color:var(--t3);margin-bottom:4px;">Taxa Rodeo App — <em>GGR ≤ 0, não incide</em></div>'}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;margin-top:6px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;">
          <div style="font-size:.72rem;font-weight:700;color:#ef4444;">Total Taxas</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:#ef4444;">${fmtV(n.totalTaxas)}</div>
        </div>
      </div>

      <!-- RIGHT: Lançamentos (read-only, from Lançamentos page) -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📝 Lançamentos <span style="font-weight:400;">(editáveis em Lançamentos)</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.12);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:#60a5fa;">Overlay (parte do clube)<div style="font-size:.55rem;color:var(--t3);font-weight:400;">${fmtV(overlayGlobal)} ÷ ${sel.length} clubes</div></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.overlay)};">${n.overlay !== 0 ? fmtV(n.overlay) : '—'}</div>
        </div>
        ${readOnlyRow('Compras','',n.compras)}
        ${readOnlyRow('Security','',n.security)}
        ${readOnlyRow('Outros','',n.outros)}
      </div>
    </div>

    <!-- RESULTADO FINAL -->
    <div id="rs-result-box"></div>
  `;

  _renderResumoResult();
}
// ── Estado Detalhamento ──

// ── DRE + Liga + FechDash + Caixa ──

function exportResumoJPG(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  const n = calcLigaNumbers();
  if(!n){ showToast('⚠️ Nenhum jogador neste clube','e'); return; }

  const m       = CMETA[activeClube]||{};
  const week    = weeks[selWeekIdx] ? fWL(weeks[selWeekIdx]) : '—';
  const { cp, profitLoss:totGanhos, rakeGerado:totRake, ggrRodeo:totGGR, resultadoClube:totResult, taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas, overlay, compras, security, outros, totalLiga:resultado } = n;

  const logoHtml = clubLogos[activeClube]
    ? `<img src="${clubLogos[activeClube]}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;">`
    : `<div style="width:52px;height:52px;border-radius:12px;background:#1e2538;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${m.icon}</div>`;

  const fmtV = v => (v<0?'-':'')+'R$ '+fV(Math.abs(v),false);
  const clrPos = '#10b981', clrNeg = '#ef4444', clrNeu = '#6b7280';
  const clr = v => v>0?clrPos:v<0?clrNeg:clrNeu;

  // KPI card helper
  const kpi = (lbl, val, valColor, borderColor) =>
    `<div style="flex:1;background:#f8fafc;border-radius:10px;padding:14px 16px;border-top:3px solid ${borderColor};">
      <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px;">${lbl}</div>
      <div style="font-family:'Courier New',monospace;font-size:1rem;font-weight:800;color:${valColor};">${val}</div>
    </div>`;

  // Row helper para coluna esquerda
  const calcRow = (lbl, sub, val, valColor) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e5e7eb;border-radius:9px;padding:11px 14px;margin-bottom:8px;">
      <div>
        <div style="font-size:.82rem;font-weight:600;color:#111;">${lbl}</div>
        ${sub?`<div style="font-size:.67rem;color:#9ca3af;margin-top:2px;">${sub}</div>`:''}
      </div>
      <div style="font-family:'Courier New',monospace;font-size:.88rem;font-weight:700;color:${valColor};">${val}</div>
    </div>`;

  // Row helper para coluna direita (manual)
  const manualRow = (lbl, val, valColor) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e5e7eb;border-radius:9px;padding:11px 14px;margin-bottom:8px;">
      <div style="font-size:.82rem;font-weight:600;color:#111;">${lbl}</div>
      <div style="font-family:'Courier New',monospace;font-size:.88rem;font-weight:700;color:${valColor};">${val}</div>
    </div>`;

  // Breakdown badges
  const breakdownItems = [
    {lbl:'Resultado do Clube (P/L+Rake+GGR)', val:totResult},
    {lbl:'Taxa App (8%)',                val:-taxaApp},
    {lbl:'Taxa Liga (10%)',              val:-taxaLiga},
    ...(taxaRodeoGGR!==0?[{lbl:'Taxa Rodeo GGR (12%)', val:-taxaRodeoGGR}]:[]),
    ...(taxaRodeoApp!==0?[{lbl:'Taxa Rodeo App (18%)', val:-taxaRodeoApp}]:[]),
    ...(overlay!==0   ?[{lbl:'Overlay (÷'+getOverlayClubesList().length+')',  val:overlay}]:[]),
    ...(compras!==0   ?[{lbl:'Compras',            val:compras}]:[]),
    ...(security!==0  ?[{lbl:'Security',           val:security}]:[]),
    ...(outros!==0    ?[{lbl:'Outros',             val:outros}]:[]),
  ];
  const badges = breakdownItems.map(i=>
    `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 11px;display:inline-flex;align-items:center;gap:6px;font-size:.7rem;">
      <span style="color:#9ca3af;font-weight:600;">${i.lbl}</span>
      <span style="font-family:'Courier New',monospace;font-weight:700;color:${clr(i.val)};">${fmtV(i.val)}</span>
    </div>`
  ).join('');

  const html = `<div id="resumo-capture" style="background:#fff;font-family:'Outfit','Segoe UI',sans-serif;padding:32px 32px 28px;width:820px;color:#111;box-sizing:border-box;">

  <!-- HEADER -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:18px;border-bottom:2px solid #f0b429;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logoHtml}
      <div>
        <div style="font-size:1.3rem;font-weight:800;letter-spacing:-.5px;color:#111;">${activeClube}</div>
        <div style="font-size:.75rem;color:#9ca3af;margin-top:3px;font-family:'Courier New',monospace;">📅 ${week}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f0b429;">PokerManager</div>
      <div style="font-size:.72rem;color:#9ca3af;margin-top:3px;">Fechamento Semanal</div>
    </div>
  </div>

  <!-- KPI ROW -->
  <div style="display:flex;gap:10px;margin-bottom:22px;">
    ${kpi('Jogadores', cp.length, '#111', '#10b981')}
    ${kpi('Rake Total', fmtV(totRake), clrPos, '#10b981')}
    ${kpi('GGR Rodeo', fmtV(totGGR), clr(totGGR), '#a78bfa')}
    ${kpi('Profit/Loss', fmtV(totGanhos), clr(totGanhos), '#3b82f6')}
    ${kpi('Resultado do Clube', fmtV(totResult), clr(totResult), '#f0b429')}
  </div>

  <!-- DOIS COLUNAS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">

    <!-- ESQUERDA: calculados -->
    <div>
      <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#9ca3af;margin-bottom:10px;">📊 Valores Calculados Automaticamente</div>
      ${calcRow('Rake Gerado', '', fmtV(totRake), clrPos)}
      ${calcRow('Taxa de Aplicativo', ligaConfig.taxaApp+'% do Rake Gerado', fmtV(-taxaApp), clrNeg)}
      ${calcRow('Taxa da Liga', ligaConfig.taxaLiga+'% do Rake Gerado', fmtV(-taxaLiga), clrNeg)}
      ${calcRow('Taxa Rodeo GGR', ligaConfig.taxaRodeoGGR+'% do GGR (só se positivo)', taxaRodeoGGR>0?fmtV(-taxaRodeoGGR):'R$ 0,00 (GGR negativo)', taxaRodeoGGR>0?clrNeg:clrNeu)}
      ${calcRow('Taxa Rodeo App', ligaConfig.taxaRodeoApp+'% do GGR (só se positivo)', taxaRodeoApp>0?fmtV(-taxaRodeoApp):'R$ 0,00 (GGR negativo)', taxaRodeoApp>0?clrNeg:clrNeu)}
    </div>

    <!-- DIREITA: manuais -->
    <div>
      <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#9ca3af;margin-bottom:10px;">✏️ Lançamentos Manuais</div>
      <div style="display:flex;align-items:center;justify-content:space-between;background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:11px 14px;margin-bottom:8px;">
        <div>
          <div style="font-size:.82rem;font-weight:600;color:#3b82f6;">Overlay (parte do clube)</div>
          <div style="font-size:.67rem;color:#93c5fd;margin-top:2px;">Valor global ÷ ${getOverlayClubesList().length} clubes</div>
        </div>
        <div style="font-family:'Courier New',monospace;font-size:.88rem;font-weight:700;color:#3b82f6;">${overlay!==0?fmtV(overlay):'—'}</div>
      </div>
      ${manualRow('Compras', compras!==0?fmtV(compras):'R$ 0,00', clr(compras))}
      ${manualRow('Security', security!==0?fmtV(security):'R$ 0,00', clr(security))}
      ${manualRow('Outros',  outros!==0 ?fmtV(outros) :'R$ 0,00', clr(outros))}
    </div>
  </div>

  <!-- RESULTADO FINAL -->
  <div style="background:${resultado>=0?'#f0fdf8':'#fff5f5'};border:2px solid ${resultado>=0?'rgba(16,185,129,.3)':'rgba(239,68,68,.3)'};border-radius:14px;padding:20px 22px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
      <div>
        <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${resultado>=0?'#059669':'#dc2626'};">Acerto Total Liga</div>
        <div style="font-size:.72rem;color:#9ca3af;font-family:'Courier New',monospace;margin-top:4px;">Resultado Clube + Taxas + Lançamentos</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'Courier New',monospace;font-size:1.7rem;font-weight:900;color:${resultado>=0?clrPos:clrNeg};">${fmtV(resultado)}</div>
        <div style="font-size:.7rem;color:${resultado>=0?clrPos:clrNeg};margin-top:3px;">${resultado>=0?'🟢 Liga deve pagar ao Império':'🔴 Império deve pagar à Liga'}</div>
      </div>
    </div>
    <!-- Breakdown badges -->
    <div style="display:flex;flex-wrap:wrap;gap:7px;padding-top:14px;border-top:1px solid ${resultado>=0?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)'};">
      ${badges}
      <div style="background:#fff8e6;border:1px solid #f0b429;border-radius:8px;padding:6px 11px;display:inline-flex;align-items:center;gap:6px;font-size:.7rem;margin-left:auto;">
        <span style="color:#d97706;font-weight:700;">= ACERTO LIGA</span>
        <span style="font-family:'Courier New',monospace;font-weight:800;color:${clr(resultado)};font-size:.8rem;">${fmtV(resultado)}</span>
      </div>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div style="margin-top:18px;text-align:center;font-size:.63rem;color:#d1d5db;">
    Gerado por PokerManager · ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
  </div>
</div>`;

  // Insere no modal e abre
  document.getElementById('resumo-doc-render').innerHTML = html;
  document.getElementById('resumo-modal').classList.add('open');
}

function downloadResumoJPG(){
  const el = document.getElementById('resumo-capture');
  if(!el || typeof html2canvas==='undefined'){ showToast('⚠️ Biblioteca não disponível'); return; }
  showToast('📸 Gerando imagem...');
  html2canvas(el, {scale:2, backgroundColor:'#ffffff', useCORS:true, logging:false}).then(canvas=>{
    const link = document.createElement('a');
    link.download = `resumo_${activeClube}_${weeks[selWeekIdx]||'semana'}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    showToast('✅ Resumo salvo como JPG!');
  });
}

// ══════════════════ RESUMO FINANCEIRO ══════════════════

// ══ FONTE ÚNICA DA FÓRMULA DO CLUBE ══
// Delega para FinanceEngine.calcClubKPIs (puro)
function calcClubNumbers(clube){
  clube = clube || activeClube;
  if(!clube) return null;
  const cp = allPlayers.filter(p=>p.clube===clube);
  if(!cp.length) return null;
  const kpis = FinanceEngine.calcClubKPIs(cp, ligaConfig, calcAgentRB);
  return { cp, ...kpis };
}

function calcResultadoClube(){ return calcClubNumbers()?.resultado || 0; }

// ══════════════════ DRE — DEMONSTRAÇÃO DE RESULTADO ══════════════════
function calcDREData(){
  const n = calcClubNumbers();
  if(!n) return null;

  // 1. Receita Bruta
  const rakeGerado   = n.totRake || 0;
  const ggrRodeo     = n.totGGR  || 0;
  const totalReceita = rakeGerado + ggrRodeo;

  // 2. Custos Operacionais — RB separado por tipo
  const cp = n.cp;
  const agMap = {};
  cp.forEach(p=>{ const k=(p.aname||'').trim()||'(sem agente)'; if(!agMap[k]) agMap[k]=[]; agMap[k].push(p); });
  let rbAgentes = 0, rbDiretos = 0;
  Object.entries(agMap).forEach(([agKey,pls])=>{
    const rb = calcAgentRB(agKey, pls);
    if(agentDirect[agKey]) rbDiretos += rb; else rbAgentes += rb;
  });
  const totalCustos = rbAgentes + rbDiretos;

  // 3. Resultado Operacional
  const resultadoOperacional = totalReceita - totalCustos;

  // 4. Taxas da Liga (calcLigaNumbers retorna negativos — converter para absoluto)
  const ln = calcLigaNumbers();
  const taxaApp      = Math.abs(ln?.taxaApp      || 0);
  const taxaLiga     = Math.abs(ln?.taxaLiga     || 0);
  const taxaRodeoGGR = Math.abs(ln?.taxaRodeoGGR || 0);
  const taxaRodeoApp = Math.abs(ln?.taxaRodeoApp || 0);
  const totalTaxas   = taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp;

  // 5. Despesas OFX (categoria='despesas', status='aplicado')
  const sess = getOFXSessao();
  const despesasBySubcat = {};
  let totalDespesas = 0;
  sess.filter(t=>t.categoria==='despesas' && t.status==='aplicado').forEach(t=>{
    const sub = t.subcategoria || 'outros';
    despesasBySubcat[sub] = (despesasBySubcat[sub]||0) + Math.abs(t.valor);
    totalDespesas += Math.abs(t.valor);
  });

  // 6. Lançamentos manuais
  const m        = clubManual[activeClube] || {};
  const overlay  = parseLancVal(m,'overlay') || getOverlayPerClub(activeClube);
  const compras  = parseLancVal(m,'compras');
  const security = parseLancVal(m,'security');
  const outros   = parseLancVal(m,'outros');
  const lancItems = [
    { label:'Overlay',  val: overlay  ? -Math.abs(overlay)  : 0, skip: !overlay   },
    { label:'Compras',  val: compras  ? -Math.abs(compras)  : 0, skip: !compras   },
    { label:'Security', val: security,                            skip: !security  },
    { label:'Outros',   val: outros,                              skip: !outros    },
  ];
  const totalLancamentos = lancItems.reduce((s,x)=>s+x.val, 0);

  // 7. Resultado Líquido
  const resultadoLiquido = resultadoOperacional - totalTaxas - totalDespesas + totalLancamentos;

  // 8. Acerto Liga
  const acertoLiga    = ln?.totalLiga  || 0;
  const acertoDirecao = ln?.direcao    || '';

  return {
    rakeGerado, ggrRodeo, totalReceita,
    rbAgentes, rbDiretos, totalCustos,
    resultadoOperacional,
    taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas,
    despesasBySubcat, totalDespesas,
    lancItems, totalLancamentos,
    resultadoLiquido,
    acertoLiga, acertoDirecao,
    hasRodeo: ggrRodeo > 0,
  };
}

function toggleDRE(section){
  _dreExpanded[section] = !_dreExpanded[section];
  renderResultadoClube();
}

// ══════════════════ RESULTADO DO CLUBE (P&L) ══════════════════

function renderResultadoClube(){
  const el = document.getElementById('resultado-clube-content');
  if(!el) return;
  const d = calcDREData();
  if(!d){
    el.innerHTML = '<div class="cs"><div class="ci">📊</div><h3>Importe a planilha primeiro</h3><p style="color:var(--t3);font-size:.78rem;">O DRE é calculado com base nos dados da semana importada.</p></div>';
    return;
  }

  // ── Helper: bloco colapsável ─────────────────────────────────
  function _dreBlock(icon, title, valor, section, detalheRows){
    const exp = _dreExpanded[section];
    const corV = clr(valor);
    let h = `<div onclick="toggleDRE('${section}')" style="display:flex;align-items:center;justify-content:space-between;padding:13px 18px;cursor:pointer;border-bottom:1px solid var(--b1);user-select:none;" onmouseenter="this.style.background='rgba(255,255,255,.022)'" onmouseleave="this.style.background=''">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:.88rem;">${icon}</span>
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t2);">${title}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:.88rem;font-weight:800;color:${corV};">R$ ${fV(valor,false)}</span>
        <span style="font-size:.56rem;color:var(--t3);min-width:10px;">${exp?'▼':'▶'}</span>
      </div>
    </div>`;
    if(exp){
      h += '<div style="background:rgba(255,255,255,.01);">';
      detalheRows.forEach(r=>{
        if(r.skip) return;
        const rc = clr(r.val);
        h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 18px 7px 44px;border-bottom:1px solid rgba(255,255,255,.03);">
          <span style="font-size:.7rem;color:var(--t3);">${r.label}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:.7rem;color:${rc};">R$ ${fV(r.val,false)}</span>
        </div>`;
      });
      if(detalheRows.every(r=>r.skip)){
        h += `<div style="padding:8px 18px 8px 44px;font-size:.68rem;color:var(--t3);">Nenhum item registrado</div>`;
      }
      h += '</div>';
    }
    return h;
  }

  // ── Helper: linha de resultado fixa (sem colapso) ────────────
  function _dreResultRow(icon, title, valor, accent){
    const cor   = accent || clr(valor);
    const bg    = accent ? 'rgba(255,255,255,.03)' : valor>0?'rgba(16,185,129,.06)':valor<0?'rgba(239,68,68,.06)':'rgba(255,255,255,.02)';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;background:${bg};border-bottom:1px solid var(--b1);">
      <span style="font-size:.74rem;font-weight:700;color:var(--t1);">${icon} ${title}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:.92rem;font-weight:800;color:${cor};">R$ ${fV(valor,false)}</span>
    </div>`;
  }

  // ── KPI strip ─────────────────────────────────────────────────
  function _kpi(label, valor, color, sub){
    return `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:12px 14px;border-top:2px solid ${color};">
      <div style="font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:4px;">${label}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:.88rem;font-weight:800;color:${color};">R$ ${fV(valor,false)}</div>
      ${sub?`<div style="font-size:.48rem;color:var(--t3);margin-top:2px;">${sub}</div>`:''}
    </div>`;
  }

  const acertoColor = clr(d.acertoLiga);

  let html = '';

  // KPI strip
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">';
  html += _kpi('📈 Receita Bruta',      d.totalReceita,       '#60a5fa',  d.rakeGerado>0?`Rake R$ ${fV(d.rakeGerado,false)}`:'');
  html += _kpi('📉 Custos (RB)',        -d.totalCustos,       '#f87171',  d.totalCustos>0?`${((d.totalCustos/d.totalReceita)*100||0).toFixed(1)}% da receita`:'');
  html += _kpi('💰 Res. Operacional',   d.resultadoOperacional, clr(d.resultadoOperacional), '');
  html += _kpi('✅ Res. Líquido',       d.resultadoLiquido,   clr(d.resultadoLiquido), '');
  html += _kpi('🏆 Acerto Liga',        d.acertoLiga,         acertoColor, d.acertoDirecao?d.acertoDirecao.replace('Império',activeClube):'');
  html += '</div>';

  // DRE Card colapsável
  html += `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:12px;overflow:hidden;margin-bottom:14px;">`;

  // Cabeçalho
  const wkLabel = typeof fWL === 'function' ? fWL(weeks[selWeekIdx]||'0') : (weeks[selWeekIdx]||'—');
  html += `<div style="padding:13px 18px;border-bottom:1px solid var(--b1);background:var(--s2);display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:.78rem;font-weight:700;color:var(--t1);">📊 DRE — ${activeClube}</div>
      <div style="font-size:.6rem;color:var(--t3);margin-top:1px;">Semana ${wkLabel}</div>
    </div>
    <div style="font-size:.62rem;color:var(--t3);">${d.hasRodeo?'🎲 Com Rodeo GGR':''}</div>
  </div>`;

  // 1. Receita Bruta
  html += _dreBlock('📈','Receita Bruta', d.totalReceita, 'receita', [
    { label:'Rake Gerado',  val: d.rakeGerado, skip: false },
    { label:'Rodeo GGR',   val: d.ggrRodeo,   skip: !d.hasRodeo },
  ]);

  // 2. Custos Operacionais
  html += _dreBlock('📉','Custos Operacionais', -d.totalCustos, 'custos', [
    { label:'Rakeback Agentes',           val: -d.rbAgentes, skip: d.rbAgentes < 0.01 },
    { label:'Rakeback Jogadores Diretos', val: -d.rbDiretos,  skip: d.rbDiretos  < 0.01 },
    { label:'Total Rakeback',             val: -d.totalCustos, skip: d.rbAgentes >= 0.01 && d.rbDiretos >= 0.01 },
  ]);

  // Resultado Operacional — fixo
  html += _dreResultRow('💰','Resultado Operacional', d.resultadoOperacional);

  // 3. Taxas da Liga
  html += _dreBlock('📉','Taxas da Liga', -d.totalTaxas, 'taxas', [
    { label:`Taxa Aplicativo (${ligaConfig.taxaApp}%)`,     val: -d.taxaApp,       skip: d.taxaApp < 0.01 },
    { label:`Taxa Liga (${ligaConfig.taxaLiga}%)`,           val: -d.taxaLiga,      skip: d.taxaLiga < 0.01 },
    { label:`Taxa Rodeo GGR (${ligaConfig.taxaRodeoGGR}%)`, val: -d.taxaRodeoGGR,  skip: !d.hasRodeo },
    { label:`Taxa Rodeo App (${ligaConfig.taxaRodeoApp}%)`, val: -d.taxaRodeoApp,  skip: !d.hasRodeo },
  ]);

  // 4. Despesas OFX
  const detalheDesp = Object.entries(d.despesasBySubcat).map(([sub,val])=>({
    label: sub.charAt(0).toUpperCase()+sub.slice(1), val: -val, skip: false
  }));
  if(!detalheDesp.length) detalheDesp.push({ label:'Nenhuma despesa OFX aplicada — importe e aplique transações OFX na categoria Despesas', val:0, skip:false });
  html += _dreBlock('📉','Despesas', -d.totalDespesas, 'despesas', detalheDesp);

  // 5. Lançamentos
  const lancRows = d.lancItems.map(x=>({...x, skip: x.skip || Math.abs(x.val)<0.01}));
  html += _dreBlock('📊','Lançamentos', d.totalLancamentos, 'lancamentos', lancRows.length?lancRows:[{label:'Nenhum lançamento registrado',val:0,skip:false}]);

  // Resultado Líquido — fixo
  html += _dreResultRow('✅','Resultado Líquido', d.resultadoLiquido);

  // Acerto Liga — fixo, bloco especial
  html += `<div style="padding:14px 18px;background:${d.acertoLiga>=0?'rgba(16,185,129,.04)':'rgba(239,68,68,.04)'};">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--t2);">🏆 Acerto Liga</div>
        <div style="font-size:.6rem;color:var(--t3);margin-top:2px;">${d.acertoDirecao.replace('Império',activeClube)||'—'}</div>
      </div>
      <span style="font-family:'JetBrains Mono',monospace;font-size:.92rem;font-weight:800;color:${acertoColor};">R$ ${fV(d.acertoLiga,false)}</span>
    </div>
  </div>`;

  html += '</div>'; // fecha DRE card

  // Rodapé resumo
  const n = calcClubNumbers();
  html += `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:10px 14px;font-size:.66rem;color:var(--t3);">
    ${n.cp.length} jogadores · Rake R$ ${fV(n.totRake,false)} · RB R$ ${fV(n.totRB,false)} (${((n.totRB/n.totRake*100)||0).toFixed(1)}% médio) · Despesas OFX: ${Object.keys(d.despesasBySubcat).length} categoria(s)
  </div>`;

  el.innerHTML = html;
}

function parseLancVal(m, key){ return Number(m[key]) || 0; }

// ════════════════════════════════════════════════════════════
// ═══  CAMADA 3: CONSOLIDAÇÃO LIGA  ════════════════════════
// ════════════════════════════════════════════════════════════

function getLigaClubEntry(clube){
  const m = clubManual[clube] || {};
  return { compras: m.compras||0, security: m.security||0, outros: m.outros||0, obs: m.obs||'', _locked: !!m._locked };
}

function saveLigaClubEntry(clube, field, val){
  if(!clubManual[clube]) clubManual[clube] = {};
  clubManual[clube][field] = val;
  saveClubManual();
}

function _lockLancRow(clube){
  if(!clubManual[clube]) clubManual[clube] = {};
  clubManual[clube]._locked = true;
  saveClubManual();
  renderLancamentos();
}

function _unlockLancRow(clube){
  if(!clubManual[clube]) clubManual[clube] = {};
  clubManual[clube]._locked = false;
  saveClubManual();
  renderLancamentos();
}

// Per-club calc (used by Resumo)
function calcLigaNumbers(clube){
  clube = clube || activeClube;
  if(!clube) return null;
  const cp = allPlayers.filter(p=>p.clube===clube);
  if(!cp.length) return null;
  const e = getLigaClubEntry(clube);
  const profitLoss = sumF(cp,'ganhos');
  const rakeGerado = sumF(cp,'rake');
  const ggrRodeo   = sumF(cp,'ggr');
  const resultadoClube = profitLoss + rakeGerado + ggrRodeo;
  const taxaApp      = -(rakeGerado * getLigaRate('taxaApp'));
  const taxaLiga     = -(rakeGerado * getLigaRate('taxaLiga'));
  const taxaRodeoGGR = ggrRodeo > 0 ? -(ggrRodeo * getLigaRate('taxaRodeoGGR')) : 0;
  const taxaRodeoApp = ggrRodeo > 0 ? -(ggrRodeo * getLigaRate('taxaRodeoApp')) : 0;
  const totalTaxas   = taxaApp + taxaLiga + taxaRodeoGGR + taxaRodeoApp;
  const compras  = e.compras;
  const overlay  = getOverlayPerClub(clube);
  const security = e.security;
  const outros   = e.outros;
  const totalManual = compras + overlay + security + outros;
  const totalLiga = resultadoClube + totalTaxas + totalManual;
  const direcao = totalLiga >= 0 ? 'Liga deve pagar ao Império' : 'Império deve pagar à Liga';
  return { profitLoss, rakeGerado, ggrRodeo, resultadoClube, taxaApp, taxaLiga, taxaRodeoGGR, taxaRodeoApp, totalTaxas, compras, overlay, security, outros, totalManual, totalLiga, direcao, cp };
}

// Per-club Liga view (inside club detail)
function renderLiga(){
  const el = document.getElementById('liga-content');
  if(!el) return;
  if(!activeClube || !allPlayers.filter(p=>p.clube===activeClube).length){
    el.innerHTML='<div class="cs"><div class="ci">🏆</div><h3>Importe a planilha primeiro</h3><p>A Consolidação Liga calcula o acerto com base nos dados operacionais.</p></div>';
    return;
  }

  const n = calcLigaNumbers();
  if(!n){ el.innerHTML='<div class="cs"><div class="ci">⚠️</div><h3>Sem dados</h3></div>'; return; }

  const taxRow = (label, sub, val) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 14px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.1);border-radius:7px;margin-bottom:4px;">'
    + '<div style="font-size:.72rem;color:var(--t2);">'+label+(sub?' <span style="font-size:.58rem;color:var(--t3);">'+sub+'</span>':'')+'</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:600;color:#ef4444;">'+fmtV(val)+'</div></div>';

  const readOnlyRow = (label, sub, val, color) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;margin-bottom:5px;">'
    + '<div style="font-size:.76rem;font-weight:600;color:var(--t1);">'+label+(sub?'<div style="font-size:.55rem;color:var(--t3);font-weight:400;">'+sub+'</div>':'')+'</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.85rem;font-weight:700;color:'+(color||clr(val))+';">'+(val!==0?fmtV(val):'R$ 0,00')+'</div></div>';

  const sel = getOverlayClubesList();

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div>
        <div style="font-size:.9rem;font-weight:700;color:var(--t1);">🏆 Consolidação Liga</div>
        <div style="font-size:.72rem;color:var(--t3);margin-top:2px;">Acerto semanal com a liga — sem rakeback</div>
      </div>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-row" style="margin-bottom:18px;grid-template-columns:repeat(4,1fr);">
      <div class="km" style="border-top:2px solid var(--blue);">
        <div class="km-lbl">Profit/Loss<div style="font-size:.55rem;color:var(--t3);font-weight:400;">ganhos e perdas</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.profitLoss)};">${fV(n.profitLoss,false)}</div>
      </div>
      <div class="km gr"><div class="km-lbl">Rake Gerado</div><div class="km-val gr">${fV(n.rakeGerado,false)}</div></div>
      <div class="km" style="border-top:2px solid #a78bfa;">
        <div class="km-lbl">GGR Rodeo P/L</div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.ggrRodeo)};">${fV(n.ggrRodeo,false)}</div>
      </div>
      <div class="km" style="border-top:2px solid var(--gold);">
        <div class="km-lbl">Resultado do Clube<div style="font-size:.55rem;color:var(--t3);font-weight:400;">P/L + Rake + GGR</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:${clr(n.resultadoClube)};">${fV(n.resultadoClube,false)}</div>
      </div>
    </div>

    <!-- Two columns -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
      <!-- LEFT: Taxas automáticas -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📊 Taxas Automáticas</div>
        ${taxRow('Taxa Aplicativo', ligaConfig.taxaApp+'% do Rake', n.taxaApp)}
        ${taxRow('Taxa Liga', ligaConfig.taxaLiga+'% do Rake', n.taxaLiga)}
        ${n.ggrRodeo > 0 ? taxRow('Taxa Rodeo GGR', ligaConfig.taxaRodeoGGR+'% do GGR', n.taxaRodeoGGR) : '<div style="padding:7px 14px;font-size:.72rem;color:var(--t3);margin-bottom:4px;">Taxa Rodeo GGR — <em>GGR ≤ 0, não incide</em></div>'}
        ${n.ggrRodeo > 0 ? taxRow('Taxa Rodeo App', ligaConfig.taxaRodeoApp+'% do GGR', n.taxaRodeoApp) : '<div style="padding:7px 14px;font-size:.72rem;color:var(--t3);margin-bottom:4px;">Taxa Rodeo App — <em>GGR ≤ 0, não incide</em></div>'}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;margin-top:6px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;">
          <div style="font-size:.72rem;font-weight:700;color:#ef4444;">Total Taxas</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:#ef4444;">${fmtV(n.totalTaxas)}</div>
        </div>
      </div>

      <!-- RIGHT: Lançamentos (read-only, from Lançamentos page) -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📝 Lançamentos <span style="font-weight:400;">(editáveis em Lançamentos)</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.12);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:#60a5fa;">Overlay (parte do clube)<div style="font-size:.55rem;color:var(--t3);font-weight:400;">${fmtV(overlayGlobal)} ÷ ${sel.length} clubes</div></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.overlay)};">${n.overlay !== 0 ? fmtV(n.overlay) : '—'}</div>
        </div>
        ${readOnlyRow('Compras','Vem do Lançamento',n.compras)}
        ${readOnlyRow('Security','',n.security)}
        ${readOnlyRow('Outros','',n.outros)}
      </div>
    </div>

    <!-- RESULTADO FINAL LIGA -->
    <div id="liga-result-box"></div>
  `;

  _renderLigaResult();
}


function _renderLigaResult(){
  const box = document.getElementById('liga-result-box');
  if(!box) return;
  const n = calcLigaNumbers();
  if(!n) return;
  const dirColor = clr(n.totalLiga);
  const dirIcon  = n.totalLiga >= 0 ? '🟢' : '🔴';

  box.innerHTML = `
    <div class="rs-final-box">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:rgba(240,180,41,.7);margin-bottom:6px;">ACERTO TOTAL LIGA</div>
          <div style="font-size:.74rem;color:rgba(240,180,41,.55);font-family:'JetBrains Mono',monospace;">Resultado Clube + Taxas + Overlay + Compras + Security + Outros</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.85rem;font-weight:800;letter-spacing:-1px;color:${dirColor};">${fmtV(n.totalLiga)}</div>
          <div style="font-size:.72rem;color:${dirColor};margin-top:2px;">${dirIcon} ${n.direcao}</div>
        </div>
      </div>
    </div>
  `;
}

// ══════════════════ FECHAMENTO POR CLUBE (DASHBOARD) ══════════════════

function renderFechDash(){
  const el = document.getElementById('fech-dash-content');
  if(!el) return;
  if(!allPlayers.length){
    el.innerHTML='<div class="cs"><div class="ci">💼</div><h3>Fechamento por Clube</h3><p>Importe a planilha primeiro.</p></div>';
    return;
  }

  const savedClub = activeClube;
  const clubData = [];

  CLUBS.forEach(c => {
    activeClube = c;
    const setts = calcSettlements();
    const aPagar   = setts.reduce((s,e) => s + (e.pendente < -0.01 ? Math.abs(e.pendente) : 0), 0);
    const aReceber = setts.reduce((s,e) => s + (e.pendente > 0.01 ? e.pendente : 0), 0);
    const pago     = setts.reduce((s,e) => s + Math.abs(e.pago), 0);
    const totalEnt = setts.length;
    const comMov   = setts.filter(e => Math.abs(e.totalDevido) > 0.01 || Math.abs(e.pago) > 0.01).length;
    const quitados  = setts.filter(e => getSettlementStatus(e).cls === 'quitado').length;
    const emAberto  = setts.filter(e => getSettlementStatus(e).cls === 'em-aberto').length;

    let status, stColor, stBg, stBorder;
    if(comMov === 0){
      status = 'Sem Mov.'; stColor = '#94a3b8'; stBg = 'rgba(148,163,184,.08)'; stBorder = 'rgba(148,163,184,.15)';
    } else if(quitados === comMov){
      status = '✅ Quitado'; stColor = '#10b981'; stBg = 'rgba(16,185,129,.08)'; stBorder = 'rgba(16,185,129,.15)';
    } else {
      status = '⏳ Em Aberto'; stColor = '#ef4444'; stBg = 'rgba(239,68,68,.08)'; stBorder = 'rgba(239,68,68,.15)';
    }

    clubData.push({ clube: c, setts, aPagar, aReceber, pago, totalEnt, comMov, quitados, emAberto, status, stColor, stBg, stBorder });
  });

  activeClube = savedClub;

  // Globals
  const gPagar   = clubData.reduce((s,d) => s + d.aPagar, 0);
  const gReceber = clubData.reduce((s,d) => s + d.aReceber, 0);
  const gNet     = gReceber - gPagar;
  const gPago    = clubData.reduce((s,d) => s + d.pago, 0);
  const gEnt     = clubData.reduce((s,d) => s + d.totalEnt, 0);
  const gQuit    = clubData.reduce((s,d) => s + d.quitados, 0);
  const gPend    = clubData.reduce((s,d) => s + d.pendentes, 0);
  const gParc    = clubData.reduce((s,d) => s + d.parciais, 0);

  const meta = CMETA;

  let html = '';

  // Header
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
  html += '<div>';
  html += '<div style="font-size:1rem;font-weight:700;color:var(--t1);">💼 Fechamento por Clube</div>';
  html += '<div style="font-size:.75rem;color:var(--t3);margin-top:3px;">Visão geral da liquidação de todos os clubes</div>';
  html += '</div>';
  html += '<div style="display:flex;align-items:center;gap:10px;">';
  html += '<div style="background:var(--s2);border:1px solid var(--b1);padding:6px 12px;border-radius:8px;font-size:.72rem;color:var(--t2);">📊 '+gEnt+' entidades · '+gQuit+' quitadas · '+gPend+' pendentes</div>';
  html += '</div>';
  html += '</div>';

  // KPI strip
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px;">';
  function kC(icon,lbl,val,color,sub){
    return '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:11px 12px;border-top:2px solid '+color+';min-width:0;">'
      +'<div style="font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);margin-bottom:3px;">'+icon+' '+lbl+'</div>'
      +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:.95rem;font-weight:800;color:'+color+';">'+val+'</div>'
      +(sub?'<div style="font-size:.48rem;color:var(--t3);margin-top:2px;">'+sub+'</div>':'')
      +'</div>';
  }
  html += kC('📤','A Pagar', gPagar > 0.01 ? fmtV(gPagar) : '—', '#ef4444', gPend+' pendentes');
  html += kC('📥','A Receber', gReceber > 0.01 ? fmtV(gReceber) : '—', '#10b981', '');
  html += kC('📊','Net', fmtV(gNet), clr(gNet), gNet > 0 ? 'saldo positivo' : gNet < 0 ? 'saldo negativo' : 'zerado');
  html += kC('💰','Movimentado', gPago > 0.01 ? fmtV(gPago) : '—', '#60a5fa', gParc+' parciais');
  html += kC('✅','Quitados', gQuit+'/'+gEnt, '#10b981', (gEnt>0?((gQuit/gEnt*100).toFixed(0)+'%'):''));
  html += '</div>';

  // Club cards (one card per club)
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:16px;">';

  clubData.forEach(d => {
    const m = meta[d.clube] || {};
    const logo = clubLogos[d.clube];
    const net = d.aReceber - d.aPagar;
    const pctQuit = d.comMov > 0 ? (d.quitados/d.comMov*100).toFixed(0) : 0;
    const barW = d.comMov > 0 ? (d.quitados/d.comMov*100) : 0;

    html += '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;cursor:pointer;transition:border-color .15s;" onmouseenter="this.style.borderColor=\'rgba(240,180,41,.4)\'" onmouseleave="this.style.borderColor=\'var(--b1)\'" onclick="goClube(\''+d.clube+'\')">';

    // Club header
    html += '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--b1);background:var(--s2);">';
    if(logo) html += '<div style="width:32px;height:32px;border-radius:7px;overflow:hidden;flex-shrink:0;"><img src="'+logo+'" style="width:100%;height:100%;object-fit:cover;"></div>';
    else html += '<div style="width:32px;height:32px;border-radius:7px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">'+(m.icon||'♠')+'</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-weight:700;font-size:.82rem;color:var(--t1);">'+d.clube+'</div>';
    html += '<div style="font-size:.6rem;color:var(--t3);">'+d.totalEnt+' entidades · '+d.comMov+' com movimento</div>';
    html += '</div>';
    html += '<span style="display:inline-block;background:'+d.stBg+';border:1px solid '+d.stBorder+';color:'+d.stColor+';padding:3px 8px;border-radius:5px;font-size:.55rem;font-weight:700;">'+d.status+'</span>';
    html += '</div>';

    // Financial summary
    html += '<div style="padding:12px 16px;">';

    // Row: A Pagar | A Receber | Net
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">';
    html += '<div><div style="font-size:.48rem;text-transform:uppercase;color:var(--t3);font-weight:600;letter-spacing:.4px;">A Pagar</div><div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:700;color:#ef4444;">'+(d.aPagar>0.01?fmtV(d.aPagar):'—')+'</div></div>';
    html += '<div><div style="font-size:.48rem;text-transform:uppercase;color:var(--t3);font-weight:600;letter-spacing:.4px;">A Receber</div><div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:700;color:#10b981;">'+(d.aReceber>0.01?fmtV(d.aReceber):'—')+'</div></div>';
    html += '<div><div style="font-size:.48rem;text-transform:uppercase;color:var(--t3);font-weight:600;letter-spacing:.4px;">Pago</div><div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:700;color:#60a5fa;">'+(d.pago>0.01?fmtV(d.pago):'—')+'</div></div>';
    html += '</div>';

    // Progress bar
    html += '<div style="margin-top:4px;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:.52rem;color:var(--t3);">Progresso</span><span style="font-size:.52rem;color:var(--t2);font-weight:600;">'+d.quitados+'/'+d.comMov+' quitados ('+pctQuit+'%)</span></div>';
    html += '<div style="background:var(--s3);border-radius:4px;height:6px;overflow:hidden;">';
    html += '<div style="background:linear-gradient(90deg,#10b981,#34d399);height:100%;width:'+barW+'%;border-radius:4px;transition:width .3s;"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // padding
    html += '</div>'; // card
  });

  html += '</div>'; // grid

  // Summary table
  html += '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  const ths = 'padding:10px 12px;font-size:.52rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);background:var(--s2);white-space:nowrap;';
  html += '<thead><tr>';
  html += '<th style="'+ths+'text-align:left;">Clube</th>';
  html += '<th style="'+ths+'text-align:center;">Entidades</th>';
  html += '<th style="'+ths+'text-align:right;">A Pagar</th>';
  html += '<th style="'+ths+'text-align:right;">A Receber</th>';
  html += '<th style="'+ths+'text-align:right;">Pago</th>';
  html += '<th style="'+ths+'text-align:center;">Quitados</th>';
  html += '<th style="'+ths+'text-align:center;">Status</th>';
  html += '<th style="'+ths+'text-align:center;">Ação</th>';
  html += '</tr></thead><tbody>';

  clubData.forEach(d => {
    const rs = 'padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.75rem;border-bottom:1px solid var(--b1);';
    html += '<tr style="cursor:pointer;border-bottom:1px solid var(--b1);" onclick="goClube(\''+d.clube+'\')">';
    html += '<td style="padding:10px 12px;font-weight:600;font-size:.8rem;color:var(--t1);border-bottom:1px solid var(--b1);">'+d.clube+'</td>';
    html += '<td style="'+rs+'text-align:center;color:var(--t2);">'+d.totalEnt+'</td>';
    html += '<td style="'+rs+'text-align:right;color:#ef4444;">'+(d.aPagar>0.01?fmtV(d.aPagar):'—')+'</td>';
    html += '<td style="'+rs+'text-align:right;color:#10b981;">'+(d.aReceber>0.01?fmtV(d.aReceber):'—')+'</td>';
    html += '<td style="'+rs+'text-align:right;color:#60a5fa;">'+(d.pago>0.01?fmtV(d.pago):'—')+'</td>';
    html += '<td style="'+rs+'text-align:center;color:var(--t2);">'+d.quitados+'/'+d.comMov+'</td>';
    html += '<td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--b1);"><span style="display:inline-block;background:'+d.stBg+';border:1px solid '+d.stBorder+';color:'+d.stColor+';padding:2px 7px;border-radius:5px;font-size:.52rem;font-weight:700;">'+d.status+'</span></td>';
    html += '<td style="padding:10px 8px;text-align:center;border-bottom:1px solid var(--b1);"><button onclick="event.stopPropagation();goClube(\''+d.clube+'\')" style="background:var(--gold-d);border:1px solid rgba(240,180,41,.25);color:var(--gold);padding:4px 10px;border-radius:5px;font-size:.56rem;font-weight:700;cursor:pointer;">Abrir →</button></td>';
    html += '</tr>';
  });

  // Total
  const trs = 'padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.75rem;font-weight:800;';
  html += '<tr style="background:var(--s2);">';
  html += '<td style="padding:10px 12px;font-weight:800;font-size:.8rem;color:var(--t1);">TOTAL</td>';
  html += '<td style="'+trs+'text-align:center;color:var(--t2);">'+gEnt+'</td>';
  html += '<td style="'+trs+'text-align:right;color:#ef4444;">'+(gPagar>0.01?fmtV(gPagar):'—')+'</td>';
  html += '<td style="'+trs+'text-align:right;color:#10b981;">'+(gReceber>0.01?fmtV(gReceber):'—')+'</td>';
  html += '<td style="'+trs+'text-align:right;color:#60a5fa;">'+(gPago>0.01?fmtV(gPago):'—')+'</td>';
  html += '<td style="'+trs+'text-align:center;color:var(--t2);">'+gQuit+'/'+gEnt+'</td>';
  html += '<td colspan="2" style="padding:10px 12px;text-align:center;font-size:.52rem;color:var(--t3);">'+CLUBS.length+' clubes</td>';
  html += '</tr>';

  html += '</tbody></table></div>';

  el.innerHTML = html;

  // Update sidebar badge
  const badge = document.getElementById('sb-fech-status');
  if(badge){
    if(gPend > 0){ badge.textContent = gPend; badge.style.background = 'rgba(239,68,68,.15)'; badge.style.color = '#ef4444'; }
    else if(gParc > 0){ badge.textContent = gParc; badge.style.background = 'rgba(251,191,36,.12)'; badge.style.color = '#f59e0b'; }
    else { badge.textContent = '✓'; badge.style.background = 'rgba(16,185,129,.1)'; badge.style.color = '#10b981'; }
  }
}

// ══════════════════ CAIXA GERAL (GLOBAL) ══════════════════

function renderCaixaGlobal(){
  const el = document.getElementById('caixa-global-content');
  if(!el) return;
  if(!allPlayers.length){
    el.innerHTML='<div class="cs"><div class="ci">🏦</div><h3>Caixa Geral</h3><p>Importe a planilha primeiro.</p></div>';
    return;
  }

  const allData = getFinData();
  let totalEntradas = 0, totalSaidas = 0;
  const perClub = {};

  // Aggregate ledger across all clubs and weeks
  CLUBS.forEach(c => {
    perClub[c] = { entradas: 0, saidas: 0 };
    // For each week with data
    Object.keys(allData).forEach(key => {
      if(!key.startsWith(c+'||')) return;
      const weekData = allData[key];
      Object.values(weekData).forEach(entity => {
        (entity.historico||[]).forEach(h => {
          const val = Math.abs(h.valor||0);
          if(h.dir === 'in'){ perClub[c].entradas += val; totalEntradas += val; }
          else { perClub[c].saidas += val; totalSaidas += val; }
        });
      });
    });
  });

  const net = totalEntradas - totalSaidas;

  let html = '<div style="margin-bottom:16px;">';
  html += '<div style="font-size:1rem;font-weight:700;color:var(--t1);margin-bottom:4px;">🏦 Caixa Geral</div>';
  html += '<div style="font-size:.75rem;color:var(--t3);">Posição de caixa consolidada da operação</div>';
  html += '</div>';

  // KPI cards
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">';
  html += '<div class="km" style="border-top:2px solid #10b981;"><div class="km-lbl">📥 Total Entradas</div><div class="km-val" style="font-family:\'JetBrains Mono\',monospace;color:#10b981;">'+fmtV(totalEntradas)+'</div></div>';
  html += '<div class="km" style="border-top:2px solid #ef4444;"><div class="km-lbl">📤 Total Saídas</div><div class="km-val" style="font-family:\'JetBrains Mono\',monospace;color:#ef4444;">'+fmtV(totalSaidas)+'</div></div>';
  html += '<div class="km" style="border-top:2px solid '+clr(net)+';"><div class="km-lbl">💰 Saldo Net</div><div class="km-val" style="font-family:\'JetBrains Mono\',monospace;color:'+clr(net)+';">'+fmtV(net)+'</div></div>';
  html += '</div>';

  // Per-club breakdown
  html += '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr>';
  const ths = 'padding:10px 12px;font-size:.55rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);background:var(--s2);';
  html += '<th style="'+ths+'text-align:left;">Clube</th>';
  html += '<th style="'+ths+'text-align:right;">Entradas</th>';
  html += '<th style="'+ths+'text-align:right;">Saídas</th>';
  html += '<th style="'+ths+'text-align:right;">Net</th>';
  html += '</tr></thead><tbody>';

  CLUBS.forEach(c => {
    const d = perClub[c];
    const n = d.entradas - d.saidas;
    const rs = 'padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.78rem;border-bottom:1px solid var(--b1);';
    html += '<tr>';
    html += '<td style="padding:10px 12px;font-weight:600;font-size:.8rem;color:var(--t1);border-bottom:1px solid var(--b1);">'+c+'</td>';
    html += '<td style="'+rs+'text-align:right;color:#10b981;">'+fmtV(d.entradas)+'</td>';
    html += '<td style="'+rs+'text-align:right;color:#ef4444;">'+fmtV(d.saidas)+'</td>';
    html += '<td style="'+rs+'text-align:right;font-weight:700;color:'+clr(n)+';">'+fmtV(n)+'</td>';
    html += '</tr>';
  });

  // Total
  html += '<tr style="background:var(--s2);">';
  html += '<td style="padding:10px 12px;font-weight:800;font-size:.8rem;color:var(--t1);">TOTAL</td>';
  html += '<td style="padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:800;text-align:right;color:#10b981;">'+fmtV(totalEntradas)+'</td>';
  html += '<td style="padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:800;text-align:right;color:#ef4444;">'+fmtV(totalSaidas)+'</td>';
  html += '<td style="padding:10px 12px;font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:800;text-align:right;color:'+clr(net)+';">'+fmtV(net)+'</td>';
  html += '</tr>';
  html += '</tbody></table></div>';

  el.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// ═══  LIGA CONSOLIDADO (GLOBAL — ALL CLUBS)  ═════════════
// ════════════════════════════════════════════════════════════

function calcLigaGlobal(){
  if(!CLUBS.length || !allPlayers.length) return null;

  let totPL=0, totRake=0, totGGR=0, totResultado=0;
  let totTaxaApp=0, totTaxaLiga=0, totRodeoGGR=0, totRodeoApp=0, totTaxas=0;
  const clubRows = [];

  CLUBS.forEach(c=>{
    const cp = allPlayers.filter(p=>p.clube===c);
    if(!cp.length) return;
    const pl   = sumF(cp,'ganhos');
    const rake = sumF(cp,'rake');
    const ggr  = sumF(cp,'ggr');
    const resultado = pl + rake + ggr;

    // Taxas — App/Liga sobre rake, Rodeo só se GGR do clube > 0
    const tApp  = rake * getLigaRate('taxaApp');
    const tLiga = rake * getLigaRate('taxaLiga');
    const tRGGR = ggr > 0 ? ggr * getLigaRate('taxaRodeoGGR') : 0;
    const tRApp = ggr > 0 ? ggr * getLigaRate('taxaRodeoApp') : 0;
    const taxas = tApp + tLiga + tRGGR + tRApp;

    // Per-club manual adjustments (from Lançamentos)
    const e = getLigaClubEntry(c);
    const overlayClub = getOverlayPerClub(c);
    const ajustes = (e.compras||0) + (e.security||0) + (e.outros||0) + overlayClub;
    const acerto = resultado - taxas + ajustes;

    totPL += pl; totRake += rake; totGGR += ggr; totResultado += resultado;
    totTaxaApp += tApp; totTaxaLiga += tLiga; totRodeoGGR += tRGGR; totRodeoApp += tRApp;
    totTaxas += taxas;

    clubRows.push({ clube:c, pl, rake, ggr, resultado, taxas, ajustes, acerto, cp:cp.length,
      tApp, tLiga, tRGGR, tRApp, overlayClub, compras:e.compras||0, security:e.security||0, outros:e.outros||0 });
  });

  // Totals come entirely from per-club rows (Lançamentos is the single source of truth)
  const totalAjustes = clubRows.reduce((s,r)=>s+r.ajustes,0);
  const totalLiga = totResultado - totTaxas + totalAjustes;
  const direcao = totalLiga >= 0 ? 'Liga deve pagar ao Império' : 'Império deve pagar à Liga';

  return {
    totPL, totRake, totGGR, totResultado,
    totTaxaApp, totTaxaLiga, totRodeoGGR, totRodeoApp, totTaxas,
    totalAjustes, totalLiga, direcao, clubRows
  };
}

function renderLigaGlobal(){
  const el = document.getElementById('liga-global-content');
  if(!el) return;
  if(!CLUBS.length || !allPlayers.length){
    el.innerHTML='<div class="cs"><div class="ci">🏆</div><h3>Liga — Consolidado</h3><p>Importe a planilha primeiro.</p></div>';
    return;
  }
  const n = calcLigaGlobal();
  if(!n){ el.innerHTML='<div class="cs"><div class="ci">⚠️</div><h3>Sem dados</h3></div>'; return; }

  const wkLock = isWeekLocked();

  const taxRow = (label, sub, val) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 14px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.1);border-radius:7px;margin-bottom:4px;">'
    + '<div style="font-size:.72rem;color:var(--t2);">'+label+(sub?' <span style="font-size:.58rem;color:var(--t3);">'+sub+'</span>':'')+'</div>'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:.78rem;font-weight:600;color:#ef4444;">'+fmtV(-val)+'</div></div>';

  // Club table rows
  const tblRows = n.clubRows.map(r=>{
    const m = CMETA[r.clube]||{};
    return `<tr style="border-bottom:1px solid var(--b1);">
      <td style="padding:10px 12px;font-weight:600;font-size:.78rem;white-space:nowrap;"><span style="margin-right:4px;">${m.icon||'♠'}</span>${r.clube}</td>
      <td style="text-align:center;color:var(--t3);font-size:.72rem;padding:10px 6px;">${r.cp}</td>
      <td style="text-align:right;color:${clr(r.pl)};font-family:'JetBrains Mono',monospace;font-size:.76rem;padding:10px 12px;">${fmtV(r.pl)}</td>
      <td style="text-align:right;color:#10b981;font-family:'JetBrains Mono',monospace;font-size:.76rem;padding:10px 12px;">${fmtV(r.rake)}</td>
      <td style="text-align:right;color:${clr(r.ggr)};font-family:'JetBrains Mono',monospace;font-size:.76rem;padding:10px 12px;">${fmtV(r.ggr)}</td>
      <td style="text-align:right;color:${clr(r.resultado)};font-family:'JetBrains Mono',monospace;font-size:.76rem;font-weight:700;padding:10px 12px;">${fmtV(r.resultado)}</td>
      <td style="text-align:right;color:#ef4444;font-family:'JetBrains Mono',monospace;font-size:.76rem;padding:10px 12px;">${fmtV(-r.taxas)}</td>
      <td style="text-align:right;color:${clr(r.ajustes)};font-family:'JetBrains Mono',monospace;font-size:.76rem;padding:10px 12px;">${fmtV(r.ajustes)}</td>
      <td style="text-align:right;color:${clr(r.acerto)};font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:800;padding:10px 12px;">${fmtV(r.acerto)}</td>
    </tr>`;
  }).join('');

  const sumAcerto = n.clubRows.reduce((s,r)=>s+r.acerto,0);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:1rem;font-weight:800;color:var(--t1);">🏆 Liga — Consolidado</div>
        <div style="font-size:.72rem;color:var(--t3);margin-top:2px;">Acerto global da liga · Todos os clubes · Sem rakeback</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="font-size:.68rem;color:var(--t3);background:var(--s2);border:1px solid var(--b1);padding:5px 12px;border-radius:6px;">
          📅 ${weeks[selWeekIdx] ? fWL(weeks[selWeekIdx]) : '—'} ${wkLock ? '🔒' : ''}
        </div>
        <button class="btn-sm" onclick="exportLigaGlobalCSV()" style="font-size:.68rem;">⬇ CSV</button>
      </div>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-row" style="margin-bottom:18px;grid-template-columns:repeat(5,1fr);">
      <div class="km" style="border-top:2px solid var(--blue);">
        <div class="km-lbl">Profit/Loss<div style="font-size:.55rem;color:var(--t3);font-weight:400;">todos os clubes</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.totPL)};">${fV(n.totPL,false)}</div>
      </div>
      <div class="km gr"><div class="km-lbl">Rake Total</div><div class="km-val gr">${fV(n.totRake,false)}</div></div>
      <div class="km" style="border-top:2px solid #a78bfa;">
        <div class="km-lbl">GGR Rodeo</div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;color:${clr(n.totGGR)};">${fV(n.totGGR,false)}</div>
      </div>
      <div class="km" style="border-top:2px solid var(--gold);">
        <div class="km-lbl">Resultado Clubes<div style="font-size:.55rem;color:var(--t3);font-weight:400;">Σ (P/L + Rake + GGR)</div></div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:${clr(n.totResultado)};">${fV(n.totResultado,false)}</div>
      </div>
      <div class="km" style="border-top:2px solid #ef4444;">
        <div class="km-lbl">Total Taxas</div>
        <div class="km-val" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:#ef4444;">${fmtV(-n.totTaxas)}</div>
      </div>
    </div>

    <!-- Two columns: Taxas + Lançamentos Manuais -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;">
      <!-- LEFT: Taxas automáticas -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📊 Taxas Automáticas</div>
        ${taxRow('Taxa Aplicativo', ligaConfig.taxaApp+'% do Rake', n.totTaxaApp)}
        ${taxRow('Taxa Liga', ligaConfig.taxaLiga+'% do Rake', n.totTaxaLiga)}
        ${taxRow('Taxa Rodeo GGR', ligaConfig.taxaRodeoGGR+'% do GGR (por clube se GGR>0)', n.totRodeoGGR)}
        ${taxRow('Taxa Rodeo App', ligaConfig.taxaRodeoApp+'% do GGR (por clube se GGR>0)', n.totRodeoApp)}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;margin-top:6px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;">
          <div style="font-size:.72rem;font-weight:700;color:#ef4444;">Total Taxas</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:#ef4444;">${fmtV(-n.totTaxas)}</div>
        </div>
      </div>

      <!-- RIGHT: Resumo dos Lançamentos (read-only, vem da pág. Lançamentos) -->
      <div>
        <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin-bottom:10px;">📝 Lançamentos <span style="font-weight:400;">(editáveis em Lançamentos)</span></div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(59,130,246,.04);border:1px solid rgba(59,130,246,.12);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:#60a5fa;">Overlay Global<div style="font-size:.55rem;color:var(--t3);font-weight:400;">${fmtV(overlayGlobal)} ÷ ${getOverlayClubesList().length} clubes</div></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.clubRows.reduce((s,r)=>s+r.overlayClub,0))};">${fmtV(n.clubRows.reduce((s,r)=>s+r.overlayClub,0))}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:var(--t1);">Compras <span style="font-size:.55rem;color:var(--t3);font-weight:400;">Σ clubes</span></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.clubRows.reduce((s,r)=>s+r.compras,0))};">${fmtV(n.clubRows.reduce((s,r)=>s+r.compras,0))}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:var(--t1);">Security <span style="font-size:.55rem;color:var(--t3);font-weight:400;">Σ clubes</span></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.clubRows.reduce((s,r)=>s+r.security,0))};">${fmtV(n.clubRows.reduce((s,r)=>s+r.security,0))}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;margin-bottom:5px;">
          <div style="font-size:.76rem;font-weight:600;color:var(--t1);">Outros <span style="font-size:.55rem;color:var(--t3);font-weight:400;">Σ clubes</span></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.clubRows.reduce((s,r)=>s+r.outros,0))};">${fmtV(n.clubRows.reduce((s,r)=>s+r.outros,0))}</div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;margin-top:6px;background:rgba(240,180,41,.06);border:1px solid rgba(240,180,41,.15);border-radius:8px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--gold);">Total Ajustes</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${clr(n.totalAjustes)};">${fmtV(n.totalAjustes)}</div>
        </div>
      </div>
    </div>

    <!-- ACERTO TOTAL LIGA (GLOBAL) -->
    <div id="lg-result-box"></div>

    <!-- TABELA POR CLUBE -->
    <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);margin:20px 0 10px;">📋 Detalhamento por Clube</div>
    <div style="overflow-x:auto;border:1px solid var(--b1);border-radius:10px;">
      <table style="width:100%;border-collapse:collapse;font-size:.76rem;">
        <thead>
          <tr style="background:var(--s2);border-bottom:2px solid var(--b1);">
            <th style="padding:10px 12px;text-align:left;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Clube</th>
            <th style="padding:10px 6px;text-align:center;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Jog.</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">P/L</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Rake</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">GGR</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Resultado</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Taxas</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Ajustes</th>
            <th style="padding:10px 12px;text-align:right;font-size:.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);font-weight:700;">Acerto Liga</th>
          </tr>
        </thead>
        <tbody>
          ${tblRows}
          <tr style="background:var(--s2);border-top:2px solid var(--gold);font-weight:800;">
            <td style="padding:10px 12px;color:var(--gold);">TOTAL</td>
            <td style="text-align:center;padding:10px 6px;color:var(--t2);">${allPlayers.length}</td>
            <td style="text-align:right;padding:10px 12px;color:${clr(n.totPL)};font-family:'JetBrains Mono',monospace;">${fmtV(n.totPL)}</td>
            <td style="text-align:right;padding:10px 12px;color:#10b981;font-family:'JetBrains Mono',monospace;">${fmtV(n.totRake)}</td>
            <td style="text-align:right;padding:10px 12px;color:${clr(n.totGGR)};font-family:'JetBrains Mono',monospace;">${fmtV(n.totGGR)}</td>
            <td style="text-align:right;padding:10px 12px;color:${clr(n.totResultado)};font-family:'JetBrains Mono',monospace;">${fmtV(n.totResultado)}</td>
            <td style="text-align:right;padding:10px 12px;color:#ef4444;font-family:'JetBrains Mono',monospace;">${fmtV(-n.totTaxas)}</td>
            <td style="text-align:right;padding:10px 12px;color:${clr(n.totalAjustes)};font-family:'JetBrains Mono',monospace;">${fmtV(n.totalAjustes)}</td>
            <td style="text-align:right;padding:10px 12px;color:${clr(sumAcerto)};font-family:'JetBrains Mono',monospace;font-size:.85rem;">${fmtV(sumAcerto)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detalhamento de taxas por clube (collapsible) -->
    <details style="margin-top:12px;">
      <summary style="font-size:.7rem;font-weight:600;color:var(--t3);cursor:pointer;padding:6px 0;">📊 Detalhamento de taxas por clube</summary>
      <div style="margin-top:8px;overflow-x:auto;border:1px solid var(--b1);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:.72rem;">
          <thead>
            <tr style="background:var(--s2);border-bottom:1px solid var(--b1);">
              <th style="padding:8px 12px;text-align:left;font-size:.6rem;text-transform:uppercase;color:var(--t3);">Clube</th>
              <th style="padding:8px 10px;text-align:right;font-size:.6rem;text-transform:uppercase;color:var(--t3);">App 8%</th>
              <th style="padding:8px 10px;text-align:right;font-size:.6rem;text-transform:uppercase;color:var(--t3);">Liga 10%</th>
              <th style="padding:8px 10px;text-align:right;font-size:.6rem;text-transform:uppercase;color:var(--t3);">Rodeo GGR 12%</th>
              <th style="padding:8px 10px;text-align:right;font-size:.6rem;text-transform:uppercase;color:var(--t3);">Rodeo App 18%</th>
              <th style="padding:8px 10px;text-align:right;font-size:.6rem;text-transform:uppercase;color:var(--t3);font-weight:700;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${n.clubRows.map(r=>{
              const m=CMETA[r.clube]||{};
              return '<tr style="border-bottom:1px solid var(--b1);">'
                +'<td style="padding:6px 12px;font-weight:600;">'+(m.icon||'')+' '+r.clube+'</td>'
                +'<td style="text-align:right;padding:6px 10px;color:#ef4444;font-family:\'JetBrains Mono\',monospace;">'+fmtV(-r.tApp)+'</td>'
                +'<td style="text-align:right;padding:6px 10px;color:#ef4444;font-family:\'JetBrains Mono\',monospace;">'+fmtV(-r.tLiga)+'</td>'
                +'<td style="text-align:right;padding:6px 10px;color:'+(r.tRGGR>0?'#ef4444':'var(--t3)')+';font-family:\'JetBrains Mono\',monospace;">'+(r.tRGGR>0?fmtV(-r.tRGGR):'—')+'</td>'
                +'<td style="text-align:right;padding:6px 10px;color:'+(r.tRApp>0?'#ef4444':'var(--t3)')+';font-family:\'JetBrains Mono\',monospace;">'+(r.tRApp>0?fmtV(-r.tRApp):'—')+'</td>'
                +'<td style="text-align:right;padding:6px 10px;color:#ef4444;font-family:\'JetBrains Mono\',monospace;font-weight:700;">'+fmtV(-r.taxas)+'</td>'
                +'</tr>';
            }).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;

  _renderLGResult();
}

function _renderLGResult(){
  const box = document.getElementById('lg-result-box');
  if(!box) return;
  const n = calcLigaGlobal();
  if(!n) return;
  const dirColor = clr(n.totalLiga);
  const dirIcon = n.totalLiga >= 0 ? '🟢' : '🔴';

  box.innerHTML = `
    <div class="rs-final-box">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:rgba(240,180,41,.7);margin-bottom:6px;">ACERTO TOTAL LIGA (GLOBAL)</div>
          <div style="font-size:.74rem;color:rgba(240,180,41,.55);font-family:'JetBrains Mono',monospace;">Σ Resultados − Σ Taxas + Lançamentos</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.85rem;font-weight:800;letter-spacing:-1px;color:${dirColor};">${fmtV(n.totalLiga)}</div>
          <div style="font-size:.72rem;color:${dirColor};margin-top:2px;">${dirIcon} ${n.direcao}</div>
        </div>
      </div>
    </div>
  `;
}

function exportLigaGlobalCSV(){
  const n = calcLigaGlobal();
  if(!n){ showToast('Sem dados para exportar','e'); return; }
  const fN = v => (v||0).toFixed(2).replace('.',',');
  const week = weeks[selWeekIdx] ? fWL(weeks[selWeekIdx]) : 'sem-semana';
  let csv = 'Clube;Jogadores;P/L;Rake;GGR;Resultado;Taxa App;Taxa Liga;Rodeo GGR;Rodeo App;Total Taxas;Ajustes;Acerto Liga\n';
  n.clubRows.forEach(r=>{
    csv += [r.clube, r.cp, fN(r.pl), fN(r.rake), fN(r.ggr), fN(r.resultado),
      fN(-r.tApp), fN(-r.tLiga), fN(-r.tRGGR), fN(-r.tRApp), fN(-r.taxas),
      fN(r.ajustes), fN(r.acerto)].join(';') + '\n';
  });
  const sumAc = n.clubRows.reduce((s,r)=>s+r.acerto,0);
  csv += ['TOTAL', allPlayers.length, fN(n.totPL), fN(n.totRake), fN(n.totGGR), fN(n.totResultado),
    fN(-n.totTaxaApp), fN(-n.totTaxaLiga), fN(-n.totRodeoGGR), fN(-n.totRodeoApp), fN(-n.totTaxas),
    fN(n.totalAjustes), fN(sumAc)].join(';') + '\n';
  csv += '\n';
  const totOverlay = n.clubRows.reduce((s,r)=>s+r.overlayClub,0);
  const totCompras = n.clubRows.reduce((s,r)=>s+r.compras,0);
  const totSecurity = n.clubRows.reduce((s,r)=>s+r.security,0);
  const totOutros = n.clubRows.reduce((s,r)=>s+r.outros,0);
  csv += 'Lançamentos;Overlay;'+fN(totOverlay)+';Compras;'+fN(totCompras)+';Security;'+fN(totSecurity)+';Outros;'+fN(totOutros)+'\n';
  csv += 'ACERTO TOTAL LIGA (GLOBAL);'+fN(n.totalLiga)+';'+n.direcao+'\n';

  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'liga-consolidado-'+week.replace(/[^a-zA-Z0-9]/g,'-')+'.csv';
  a.click();
  showToast('📥 CSV exportado');
}

// ════════════════════════════════════════════════════════════
// ══════════════════ FINANCEIRO ══════════════════

