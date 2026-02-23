// ══════════════════════════════════════════════════════════════════════
//  render-config.js — Configurações, logos, taxas (Poker Manager)
//  Depende de: dataLayer.js, utils.js, app-state.js, render-rakeback.js
// ══════════════════════════════════════════════════════════════════════

const clubLogos = DataLayer.getClubLogos();

function saveLogos(){ DataLayer.saveClubLogos(clubLogos); }

function getLogoEl(clube, size=28, radius=7){
  const logo = clubLogos[clube];
  const m    = CMETA[clube]||{};
  if(logo) return `<img src="${logo}" style="width:${size}px;height:${size}px;border-radius:${radius}px;object-fit:cover;vertical-align:middle;">`;
  return `<span style="font-size:${Math.round(size*.55)}px;line-height:1">${m.icon||'♠'}</span>`;
}

function renderConfigPage(){
  // ── Liga Config Grid ──
  const grid = document.getElementById('liga-config-grid');
  if(grid){
    const taxes = [
      { key: 'taxaApp', label: 'Taxa Aplicativo', desc: 'Sobre o Rake Gerado', icon: '📱' },
      { key: 'taxaLiga', label: 'Taxa Liga', desc: 'Sobre o Rake Gerado', icon: '🏆' },
      { key: 'taxaRodeoGGR', label: 'Taxa Rodeio GGR', desc: 'Sobre o GGR (se > 0)', icon: '🤠' },
      { key: 'taxaRodeoApp', label: 'Taxa Rodeio App', desc: 'Sobre o GGR (se > 0)', icon: '📲' }
    ];
    grid.innerHTML = taxes.map(t => {
      const val = ligaConfig[t.key] || 0;
      const isDefault = val === LIGA_DEFAULTS[t.key];
      return `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="font-size:.85rem;">${t.icon}</span>
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--t1);">${t.label}</div>
            <div style="font-size:.52rem;color:var(--t3);">${t.desc}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" step="0.5" min="0" max="100" value="${val}"
            onchange="setLigaRate('${t.key}',this.value)"
            style="width:65px;background:var(--s1);border:1px solid var(--b1);color:var(--t1);padding:6px 8px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:.82rem;text-align:center;">
          <span style="font-size:.78rem;color:var(--t2);font-weight:600;">%</span>
          ${!isDefault ? '<span style="font-size:.48rem;color:var(--gold);margin-left:auto;">editado</span>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ── Club Logos ──
  const list = document.getElementById('config-clubs-list');
  if(!list) return;
  list.innerHTML = CLUBS.map(c => {
    const m    = CMETA[c]||{};
    const logo = clubLogos[c];
    const hasLogo = !!logo;
    return `<div class="cfg-card">
      <div class="cfg-logo-preview" id="cfg-preview-${c}">
        ${hasLogo
          ? `<img src="${logo}" alt="${c}">`
          : `<span>${m.icon||'♠'}</span>`}
      </div>
      <div class="cfg-info">
        <div class="cfg-name">${m.icon} ${c}</div>
        <div class="cfg-sub">${hasLogo ? '✅ Logo personalizada carregada' : 'Usando emoji padrão — clique em "Carregar Logo" para personalizar'}</div>
      </div>
      <div class="cfg-actions">
        <input type="file" accept="image/*" class="cfg-input" id="cfg-inp-${c}" onchange="handleLogoUpload('${c}', this)">
        <button class="cfg-upload-btn" onclick="document.getElementById('cfg-inp-${c}').click()">
          ${hasLogo ? '🔄 Trocar Logo' : '📁 Carregar Logo'}
        </button>
        ${hasLogo ? `<button class="cfg-remove-btn" onclick="removeLogo('${c}')">✕ Remover</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Backup info
  renderBackupInfo();
}

function setLigaRate(key, val){
  ligaConfig[key] = parseFloat(val) || 0;
  saveLigaConfig();
  showToast('✅ '+key+' → '+ligaConfig[key]+'%');
}

function resetLigaConfig(){
  if(!confirm('Resetar todas as taxas para os valores padrão?')) return;
  ligaConfig = { ...LIGA_DEFAULTS };
  saveLigaConfig();
  renderConfigPage();
  showToast('↻ Taxas resetadas para o padrão');
}

function handleLogoUpload(clube, input){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){ showToast('⚠️ Imagem muito grande (máx 2MB)'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    clubLogos[clube] = e.target.result;
    saveLogos();
    applyLogosEverywhere();
    renderConfigPage();
    showToast(`✅ Logo do ${clube} atualizada!`);
  };
  reader.readAsDataURL(file);
}

function removeLogo(clube){
  delete clubLogos[clube];
  saveLogos();
  applyLogosEverywhere();
  renderConfigPage();
  showToast(`Logo do ${clube} removida`);
}

// ══════════════════ CLUB CONFIG MODAL ══════════════════

function openClubConfig(){
  if(!activeClube){ showToast('⚠️ Abra um clube primeiro','e'); return; }
  const cp = allPlayers.filter(p=>p.clube===activeClube);
  document.getElementById('club-config-subtitle').textContent = activeClube + ' · ' + cp.length + ' jogadores';

  const agents = [...new Set(cp.map(p=>(p.aname||'').trim()).filter(Boolean).filter(a=>!/^(none|null|undefined)$/i.test(a)))];

  let html = '';

  // ── Agents section ──
  html += '<div style="margin-bottom:18px;">';
  html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:8px;">🤝 Agentes ('+agents.length+')</div>';

  if(!agents.length){
    html += '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:8px;padding:14px;font-size:.74rem;color:var(--t3);">Nenhum agente encontrado nos dados importados.</div>';
  } else {
    html += '<div style="background:var(--s1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;">';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr>';
    const ths = 'padding:8px 10px;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--t3);background:var(--s2);';
    html += '<th style="'+ths+'text-align:left;">Agente</th>';
    html += '<th style="'+ths+'text-align:center;">Jogadores</th>';
    html += '<th style="'+ths+'text-align:center;">Liquidação</th>';
    html += '<th style="'+ths+'text-align:center;">RB %</th>';
    html += '</tr></thead><tbody>';

    agents.forEach(ag => {
      const players = cp.filter(p=>(p.aname||'').trim()===ag);
      const cfg = agentRB[ag] || {};
      const pct = Number(cfg.pctAgente ?? cfg.pct ?? 0) || 0;
      const isDirect = !!agentDirect[ag];
      const agE = ag.replace(/'/g,"\\'");

      html += '<tr style="border-bottom:1px solid var(--b1);">';
      html += '<td style="padding:8px 10px;font-weight:600;font-size:.76rem;color:var(--t1);">'+ag+'</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-size:.74rem;color:var(--t2);">'+players.length+'</td>';

      // Liquidation type toggle
      html += '<td style="padding:6px 10px;text-align:center;">';
      html += '<div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid var(--b1);">';
      html += '<button onclick="setCfgLiqType(\''+agE+'\',false)" style="padding:3px 8px;font-size:.52rem;font-weight:700;cursor:pointer;border:none;';
      html += isDirect ? 'background:var(--s2);color:var(--t3);' : 'background:rgba(240,180,41,.1);color:var(--gold);';
      html += '">🤝 Agente</button>';
      html += '<button onclick="setCfgLiqType(\''+agE+'\',true)" style="padding:3px 8px;font-size:.52rem;font-weight:700;cursor:pointer;border:none;border-left:1px solid var(--b1);';
      html += isDirect ? 'background:rgba(96,165,250,.1);color:#60a5fa;' : 'background:var(--s2);color:var(--t3);';
      html += '">👤 Direto</button>';
      html += '</div></td>';

      // RB% input
      html += '<td style="padding:6px 10px;text-align:center;">';
      html += '<input type="number" step="0.5" min="0" max="100" value="'+pct+'" onchange="setCfgAgentRB(\''+agE+'\',this.value)" style="width:55px;background:var(--s2);border:1px solid var(--b1);color:var(--t1);padding:4px 6px;border-radius:5px;font-family:\'JetBrains Mono\',monospace;font-size:.72rem;text-align:center;">';
      html += '<span style="font-size:.6rem;color:var(--t3);margin-left:2px;">%</span>';
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
  }
  html += '</div>';

  // ── Direct Players section ──
  const directPlayers = cp.filter(p => playerDirect[p.id]);
  html += '<div style="margin-bottom:18px;">';
  html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:8px;">👤 Jogadores Diretos ('+directPlayers.length+')</div>';
  if(directPlayers.length){
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    directPlayers.forEach(p => {
      html += '<span style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15);color:#60a5fa;padding:3px 8px;border-radius:5px;font-size:.6rem;font-weight:600;">'+p.nick+'</span>';
    });
    html += '</div>';
  } else {
    html += '<div style="font-size:.72rem;color:var(--t3);">Nenhum — marque jogadores como "Direto" na aba Jogadores.</div>';
  }
  html += '</div>';

  // ── Payment Methods section ──
  const methods = DataLayer.getPayMethodsAlt();
  html += '<div style="margin-bottom:18px;">';
  html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-bottom:8px;">💳 Formas de Pagamento ('+methods.length+')</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">';
  methods.forEach(m => {
    html += '<span style="background:var(--s2);border:1px solid var(--b1);padding:4px 10px;border-radius:5px;font-size:.68rem;color:var(--t1);">'+m+'</span>';
  });
  html += '</div>';
  html += '<div style="font-size:.6rem;color:var(--t3);">Gerencie em Financeiro → Ajustes → Formas de Pagamento</div>';
  html += '</div>';

  // ── Summary ──
  html += '<div style="background:rgba(240,180,41,.05);border:1px solid rgba(240,180,41,.12);border-radius:8px;padding:10px 14px;font-size:.7rem;color:rgba(240,180,41,.7);">';
  html += '💡 Alterações são salvas automaticamente.';
  html += '</div>';

  document.getElementById('club-config-content').innerHTML = html;
  openM('mClubConfig');
}

function setCfgLiqType(agKey, isDirect){
  if(isDirect) agentDirect[agKey] = true;
  else delete agentDirect[agKey];
  saveAgentDirect();
  openClubConfig(); // re-render
  showToast(isDirect ? '👤 '+agKey+' → liquidação direta' : '🤝 '+agKey+' → liquidação por agente');
}

function setCfgAgentRB(agKey, val){
  const v = parseFloat(val) || 0;
  const prev = agentRB[agKey] || {};
  agentRB[agKey] = { ...prev, pctAgente: v, pct: v };
  saveAgentRB();
  showToast('💸 '+agKey+' → RB '+v+'%');
}

function applyLogosEverywhere(){
  // 1. Sidebar — nav items dos clubes
  const sbMap = {'IMPÉRIO':'imp','CONFRARIA':'con','3BET':'3bt','TGP':'tgp','CH':'ch'};
  CLUBS.forEach(c => {
    const key  = sbMap[c];
    const nav  = document.getElementById('nav-'+key);
    if(!nav) return;
    const logo = clubLogos[c];
    const m    = CMETA[c]||{};
    const ni   = nav.querySelector('.ni');
    if(ni){
      if(logo) ni.innerHTML = `<img src="${logo}" class="ni-logo">`;
      else     ni.textContent = m.icon||'♠';
    }
  });

  // 2. Club header (dc-icon) — se clube ativo estiver aberto
  if(activeClube){
    const icon = document.getElementById('dc-icon');
    if(icon){
      const logo = clubLogos[activeClube];
      const m    = CMETA[activeClube]||{};
      if(logo) icon.innerHTML = `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;">`;
      else     icon.textContent = m.icon||'♠';
    }
  }

  // 3. Overview cards — re-render
  if(document.getElementById('clubsGrid').children.length > 0) renderOverview();
}

