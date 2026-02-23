# SPEC v2: Extração JS do fechamento-poker.html (Proposta Híbrida)

## OBJETIVO
Extrair todo o JavaScript inline (linhas 1699-11066) do `fechamento-poker.html` para arquivos `.js` separados, centralizando lógica financeira e acesso a dados.

## REGRAS OBRIGATÓRIAS
1. **NÃO refatorar lógica** — mover código sem alterar comportamento
2. **NÃO usar ES Modules** — protocolo `file://` proíbe `import/export`
3. **Manter `let/const`** — NÃO converter para `var` (muda scoping em loops)
4. **Variáveis globais compartilhadas** → declarar com `window.X = valor`
5. **Funções declaradas com `function nome()` já são globais** — não precisam de `window.`
6. **Ordem de carregamento** importa — respeitar dependências
7. **Mover cálculos puros para `financeEngine.js`** — isso é classificação, não refatoração
8. **Mover localStorage wrappers para `dataLayer.js`** — centralização de acesso a dados

---

## ESTRUTURA FINAL (14 arquivos em vez de 19)

```
fechamento-poker.html  (~1.700 linhas — HTML + CSS + script tags + init)

├── financeEngine.js   (já existe — EXPANDIR com 12 funções de cálculo puro)
├── dataLayer.js       (já existe — EXPANDIR com 20+ localStorage wrappers)
├── adapterImport.js   (já existe ✅ — NÃO mexer)

js/
├── utils.js               ← formatação + helpers puros (~200 linhas)
├── app-state.js           ← estado global + backup/restore + constantes (~400 linhas)
├── app-navigation.js      ← semanas, sidebar, routing (~300 linhas)
├── import-processor.js    ← importação planilhas + validação NONE (~600 linhas)
├── render-tables.js       ← Visão Geral + Detalhamento (tabelas jogadores) (~600 linhas)
├── render-rakeback.js     ← config Rakeback (~600 linhas)
├── render-financeiro.js   ← Financeiro + Pagamentos + Liquidação (~1.200 linhas)
├── render-conciliacao.js  ← OFX + ChipPix (import + vinculação) (~800 linhas)
├── render-staging.js      ← Staging layer + Movements + Conc UI (~600 linhas)
├── render-reports.js      ← DRE + Liga + Resumo Clube + Lançamentos (~1.200 linhas)
├── render-agents.js       ← Comprovantes + PDF + Linking + Export (~500 linhas)
└── render-config.js       ← Logos, taxas, ajustes (~300 linhas)
```

---

## ORDEM DOS SCRIPT TAGS NO HTML

```html
<!-- CDN (já existem, sem mudança) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

<!-- Módulos core (já existem — serão EXPANDIDOS) -->
<script src="dataLayer.js"></script>
<script src="financeEngine.js"></script>

<!-- Novos — extraídos do inline (ORDEM IMPORTA!) -->
<script src="js/utils.js"></script>
<script src="js/app-state.js"></script>
<script src="js/app-navigation.js"></script>
<script src="js/import-processor.js"></script>
<script src="js/render-tables.js"></script>
<script src="js/render-rakeback.js"></script>
<script src="js/render-financeiro.js"></script>
<script src="js/render-conciliacao.js"></script>
<script src="js/render-staging.js"></script>
<script src="js/render-reports.js"></script>
<script src="js/render-agents.js"></script>
<script src="js/render-config.js"></script>

<!-- INIT (mantém inline no HTML) -->
<script>
  window.addEventListener('DOMContentLoaded', function() { applyLogosEverywhere(); });
  initWeeks();
</script>
```

---

## EXECUÇÃO EM 4 PASSOS SEQUENCIAIS

Cada passo é verificável isoladamente. Se quebrar, sabemos exatamente onde.

---

### PASSO 1: Expandir `financeEngine.js`

Adicionar 12 funções de cálculo puro que hoje estão no HTML.
Estas funções NÃO acessam DOM. Algumas leem globais — para essas, receber os dados por parâmetro.

**REGRA**: Cada função movida deve ser removida do HTML. No lugar, criar um wrapper fino que chama `FinanceEngine.nomeFunc(...)`.

#### Funções a ADICIONAR na IIFE do financeEngine.js:

```javascript
// ─── WRAPPERS DE CÁLCULO (delegam para funções existentes) ───

// Já existem como wrappers no HTML. Mover os wrappers para cá:
// calcResult(p) → usa calcPlayerResult internamente
// calcAgentRBLocal(agKey, players) → usa calcAgentRB internamente

// ─── NOVAS FUNÇÕES PURAS ───

// 1. getSettlementStatus(settlement)          ← linha ~4797
//    Recebe: { pendente, totalPago, totalDevido, resultado }
//    Retorna: { label, cls, badgeCls, pctPago }
//    PURO ✓ — nenhuma dependência externa

// 2. calcSettlements(params)                  ← linha ~4723
//    Recebe: { activeClube, allPlayers, agentDirect, playerDirect,
//              getPlayerPctRB, getAgentPctAgente, getSaldoAnterior,
//              getEntityLedgerNet, isPlayerDirectSettlement }
//    Retorna: Array de settlements
//    NOTA: Transformar de "lê globais" para "recebe por parâmetro"

// 3. computeFinanceKPIs(params)               ← linha ~7094
//    Recebe: { entities, getEntityLedgerNet, getSaldoAnterior,
//              calcSaldoAtual }
//    Retorna: { totalAPagar, totalAReceber, saldoLiquido,
//              movimentado, progresso, badge }

// 4. calcFinEntities(params)                  ← linha ~6861
//    Recebe: { activeClube, allPlayers, agentDirect, playerDirect,
//              getPlayerPctRB, getAgentPctAgente, isPlayerDirectSettlement }
//    Retorna: Array de entidades financeiras

// 5. getEntityStatusCalc(params)              ← linha ~7055
//    Recebe: { saldoAnterior, resultado, historico }
//    Retorna: status string usando determineStatus()

// 6. calcClubNumbers(params)                  ← linha ~5857
//    Recebe: { players, ligaConfig, getAgentRBFn }
//    Retorna: KPIs do clube (delega para calcClubKPIs)

// 7. calcDREData(params)                      ← linha ~5869
//    Recebe: { clubNumbers, ligaNumbers, ofxDespesas, agentRBData }
//    Retorna: Estrutura DRE completa

// 8. calcLigaNumbers(params)                  ← linha ~6129
//    Recebe: { players, ligaConfig, ligaClubEntry, overlayPerClub }
//    Retorna: Cálculos da liga por clube

// 9. calcLigaGlobal(params)                   ← linha ~6527
//    Recebe: { clubs, calcLigaNumbersFn }
//    Retorna: Totais globais da liga

// 10. calcResultadoClube(params)              ← linha ~5866
//     Wrapper: calcClubNumbers(params)?.resultado || 0

// 11. rbValor(rakeGerado, pct)                ← linha ~6843
//     Retorna: rakeGerado * pct / 100

// 12. resPlayer(ganhos, rakeGerado, pctPlayer, ajustes)  ← linha ~6844
//     Retorna: ganhos + rbValor(rakeGerado, pctPlayer) + ajustes
```

**API pública atualizada** (adicionar ao `return { ... }`):
```javascript
return {
  // Existentes (não mexer)
  calcPlayerResult, calcAgentRB, calcAgentResult,
  calcLedgerNet, calcSaldoAtual, determineStatus, calcClubKPIs,
  // Novos
  getSettlementStatus, calcSettlements, computeFinanceKPIs,
  calcFinEntities, getEntityStatusCalc, calcClubNumbers,
  calcDREData, calcLigaNumbers, calcLigaGlobal,
  calcResultadoClube, rbValor, resPlayer,
};
```

**VERIFICAÇÃO PASSO 1**: Abrir HTML → Console → `FinanceEngine.getSettlementStatus` deve existir. Testar: `FinanceEngine.rbValor(100, 30)` deve retornar `30`.

---

### PASSO 2: Expandir `dataLayer.js`

Centralizar os ~49 acessos diretos a localStorage que estão espalhados pelo HTML.

#### Novas chaves a adicionar em `KEYS`:
```javascript
const KEYS = {
  // ... existentes ...
  ligaConfig    : 'pm_ligaConfig',
  playerDirect  : 'pm_playerDirect',
  clubLogos     : 'pm_club_logos',
  overlay       : 'pm_overlay',
  overlayClubes : 'pm_overlayClubes',
  clubManual    : 'pm_clubManual',
  payMethods    : 'pm_pay_methods',    // ATENÇÃO: key é 'pm_pay_methods'
  payMethodsAlt : 'pm_payMethods',     // key alternativa usada em ajustes
  ofxMap        : 'pm_ofx_map',
  cpMap         : 'pm_cp_map',
  transCategories: 'pm_transactionCategories',
  bankAccounts  : 'pm_bankAccounts',
  movements     : 'pm_movements',
  staged        : 'pm_staged',
  snapshots     : 'pm_snapshots',
};
```

#### Funções a ADICIONAR:
```javascript
// ── Liga Config ──
getLigaConfig()           // → JSON.parse(localStorage.getItem('pm_ligaConfig')||'{}')
saveLigaConfig(config)    // → localStorage.setItem('pm_ligaConfig', JSON.stringify(config))

// ── Player/Agent Config ──
getPlayerDirect()         // → _get('pm_playerDirect')
savePlayerDirect(data)    // → _set('pm_playerDirect', data)
getAgentDirect()          // → _get('pm_agentDirect') (já em KEYS mas sem wrapper)
saveAgentDirect(data)     // → _set('pm_agentDirect', data)
getPlayerRB()             // → _get('pm_playerRB')
savePlayerRB(data)        // → _set('pm_playerRB', data)
getAgentRBConfig()        // → _get('pm_agentRB')
saveAgentRBConfig(data)   // → _set('pm_agentRB', data)

// ── Week Lock ──
getWeekLocked()           // → _get('pm_weekLocked')
saveWeekLocked(data)      // → _set('pm_weekLocked', data)

// ── RB Snapshots ──
getRbSnapPlayers()        // → _get('pm_rbSnapPlayers')
saveRbSnapPlayers(data)   // → _set('pm_rbSnapPlayers', data)
getRbSnapAgents()         // → _get('pm_rbSnapAgents')
saveRbSnapAgents(data)    // → _set('pm_rbSnapAgents', data)

// ── Finance Snapshot ──
getFinSnapshot()          // → _get('pm_finSnapshot')
saveFinSnapshot(data)     // → _set('pm_finSnapshot', data)

// ── Finance Data ──
getFinData()              // → _get('pm_fin')
saveFinData(data)         // → _set('pm_fin', data)

// ── Club Config ──
getClubLogos()            // → _get('pm_club_logos')
saveClubLogos(data)       // → _set('pm_club_logos', data)

// ── Overlay/Manual ──
getOverlay()              // → Number(localStorage.getItem('pm_overlay')) || 0
saveOverlay(val)          // → localStorage.setItem('pm_overlay', String(val))
getOverlayClubes()        // → JSON.parse(localStorage.getItem('pm_overlayClubes')||'null')
saveOverlayClubes(data)   // → _set('pm_overlayClubes', data)
getClubManual()           // → _get('pm_clubManual')
saveClubManual(data)      // → _set('pm_clubManual', data)

// ── Payment Methods ──
getPayMethods()           // → JSON.parse(localStorage.getItem('pm_pay_methods')||'[]')
savePayMethods(arr)       // → localStorage.setItem('pm_pay_methods', JSON.stringify(arr))
getPayMethodsAlt()        // → JSON.parse(localStorage.getItem('pm_payMethods')||'[]')
savePayMethodsAlt(arr)    // → localStorage.setItem('pm_payMethods', JSON.stringify(arr))

// ── OFX/ChipPix ──
getOFXMap()               // → _get('pm_ofx_map')
saveOFXMap(data)          // → _set('pm_ofx_map', data)
getCPMap()                // → _get('pm_cp_map')
saveCPMap(data)           // → _set('pm_cp_map', data)
getOFXSessao(key)         // → JSON.parse(localStorage.getItem(key)||'[]')
saveOFXSessao(key, arr)   // → localStorage.setItem(key, JSON.stringify(arr))
getCPSessao(key)          // → JSON.parse(localStorage.getItem(key)||'[]')
saveCPSessao(key, arr)    // → localStorage.setItem(key, JSON.stringify(arr))

// ── Transaction Categories ──
getTransactionCategories()      // → JSON.parse(localStorage.getItem('pm_transactionCategories')||'null')
saveTransactionCategories(cats) // → localStorage.setItem('pm_transactionCategories', JSON.stringify(cats))

// ── Bank Accounts ──
getBankAccounts()         // → JSON.parse(localStorage.getItem('pm_bankAccounts')||'[]')
saveBankAccounts(arr)     // → localStorage.setItem('pm_bankAccounts', JSON.stringify(arr))

// ── Movements ──
getMovements()            // → JSON.parse(localStorage.getItem('pm_movements')||'[]')
saveMovements(arr)        // → localStorage.setItem('pm_movements', JSON.stringify(arr))

// ── Staged ──
getStaged()               // → JSON.parse(localStorage.getItem('pm_staged')||'[]')
saveStaged(arr)           // → localStorage.setItem('pm_staged', JSON.stringify(arr))

// ── Snapshots ──
getSnapshots()            // → JSON.parse(localStorage.getItem('pm_snapshots')||'[]')
saveSnapshots(arr)        // → localStorage.setItem('pm_snapshots', JSON.stringify(arr))

// ── Bulk State (backup/restore) ──
getAllPMKeys()             // → loop localStorage, filter startsWith('pm_')
collectState()            // → all pm_* keys as object
restoreState(state)       // → clear + write all pm_* keys
```

**VERIFICAÇÃO PASSO 2**: Console → `DataLayer.getPlayerDirect()` deve retornar objeto. `DataLayer.getFinData()` deve retornar dados financeiros.

---

### PASSO 3: Extrair `js/utils.js` + `js/app-state.js` + `js/app-navigation.js`

Estes 3 arquivos são a base que todos os outros usam.

#### `js/utils.js` — Helpers puros (sem estado)
```
FUNÇÕES (mover do HTML):
  formatBytes(b)                    ← ~1756
  fV(v, dash)                       ← ~3540  (formatar valor R$)
  clr(v)                            ← ~3546  (cor por sinal)
  fmtV(v)                           ← ~3547  (formato curto)
  sumF(arr, key)                    ← ~3548  (soma campo de array)
  n(v)                               ← ~6842  (coerce to number)
  slugify(str)                       ← ~6849
  makeEntityId(prefix, key)          ← ~6857
  escRx(s)                           ← ~1992  (escape regex)
  showToast(msg, type)               ← ~11058 (usado por TODOS os módulos)
  openM(id)                          ← ~11039 (abrir modal)
  closeM(id)                         ← ~11040 (fechar modal)
  showConfirmModal(title, msg, onConfirm) ← ~11041
  csvDl(data, fname)                 ← ~11028 (download CSV)
```

#### `js/app-state.js` — Estado global + constantes + backup
```
VARIÁVEIS GLOBAIS (usar window.X = ...):
  window.DEBUG_FINANCE = false         ← ~1703
  window.allPlayers = []               ← ~1706
  window.filteredAll = []              ← ~1709
  window.filteredClub = []             ← ~1709
  window.selWeekIdx = 0               ← ~1710
  window.weeks = []                    ← ~1710
  window.activeClube = null            ← ~1711
  window.pendingLinkIdx = null         ← ~1712
  window.selOpt = null                 ← ~1712
  window.pgAll = 1                     ← ~1713
  window.pgClub = 1                    ← ~1713
  window.PS = 30                       ← ~1714

CONSTANTES (const é OK — não muda entre arquivos):
  const LIGA_CONFIG_KEY = 'pm_ligaConfig'   ← ~1717
  const LIGA_DEFAULTS = {...}               ← ~1718
  const SCHEMA_VERSION = 1                  ← ~1724
  const PM_KEYS_STATIC = [...]              ← ~1725
  const SNAPSHOT_KEY = 'pm_snapshots'       ← ~1822
  const RULES = [...]                       ← ~1928
  const CMETA = {...}                       ← ~1937
  const CLUBS = [...]                       ← ~1945
  const DEFAULT_CATS = [...]                ← ~1948
  const manualLinks = {...}                 ← ~1959

VARIÁVEL GLOBAL MUTÁVEL:
  window.ligaConfig = { ...LIGA_DEFAULTS, ...DataLayer.getLigaConfig() }  ← ~1719

FUNÇÕES:
  saveLigaConfig()                     ← ~1720 (usar DataLayer.saveLigaConfig)
  getLigaRate(key)                     ← ~1721
  migrateState(state)                  ← ~1762
  backupState()                        ← ~1773 (usar DataLayer.collectState)
  restoreState(input)                  ← ~1787 (usar DataLayer.restoreState)
  saveLocalSnapshot()                  ← ~1826
  restoreSnapshot(idx)                 ← ~1841
  deleteSnapshot(idx)                  ← ~1857
  renderBackupInfo()                   ← ~1865
  clearAllData()                       ← ~1890
  cleanDeadKeys()                      ← ~1901
  getCarryForCurrentWeek()             ← ~1915
  getAgencyCarry(agKey)                ← ~1920
  classify(agent)                      ← ~1963
  saveManualLink(agentName, clube)     ← ~1995
```

**NOTA SOBRE `const`**: Variáveis `const` com objetos (`RULES`, `CMETA`, `CLUBS`) funcionam entre scripts porque `const` no escopo de `<script>` cria uma variável global no mesmo escopo. NÃO precisam de `window.`. Apenas variáveis que são **reatribuídas** (`let x = ...; x = newValue;`) precisam de `window.`.

**REGRA PRÁTICA**:
- `const X = ...` → manter como `const` (funciona entre scripts)
- `let X = ...; X = newValue;` → trocar para `window.X = ...`
- `function foo() {}` → manter como está (já é global)

#### `js/app-navigation.js` — Navegação e semanas
```
FUNÇÕES:
  getMon(d)                            ← ~2004
  fW(d)                                ← ~2005
  fWL(d)                               ← ~2006
  initWeeks()                          ← ~2008
  renderChips()                        ← ~2014
  updWeek()                            ← ~2028
  changeWeek(d)                        ← ~2074
  toggleWeekDropdown(e)                ← ~2076
  selectWeekFromDropdown(idx)          ← ~2118
  toggleMobileSidebar()                ← ~3070
  closeMobileSidebar()                 ← ~3077
  goPage(name)                         ← ~3084
  goClube(nome)                        ← ~3105
  switchDN(item, tabId)                ← ~3129
```

**VERIFICAÇÃO PASSO 3**: Abrir HTML → navegar entre abas e semanas → deve funcionar normalmente. Console sem erros.

---

### PASSO 4: Extrair os render-*.js

Agora extrai os 9 arquivos de renderização. TESTAR após cada arquivo.

#### `js/import-processor.js` — Importação de planilhas
```
VARIÁVEIS GLOBAIS:
  const COL_DEFS = [...]                    ← ~2126
  const GU_TO_BRL = 5                       ← ~2147
  window.rawHeaders = []                    ← ~2139
  window.rawRows = []                       ← ~2139
  window._pendingImportPlayers = null       ← ~2513
  window._pendingImportFileName = ''        ← ~2514
  window._missingAgencyRows = []            ← ~2516
  window._unknownSubclubRows = []           ← ~2517
  window._autoResolvedCount = 0             ← ~2518
  window._resolvedNone = {}                 ← ~2519
  window._resolvedAgent = {}                ← ~2520
  window._ignoredInSession = new Set()      ← ~2521
  const _CLR = {...}                        ← ~2577
  window._bulkNoneSelected = new Set()      ← ~2689

FUNÇÕES (linhas ~2149-3059):
  Todas as 30 funções de importação listadas anteriormente.
  Ver mapeamento completo na v1 do spec, seção 4.
```

#### `js/render-tables.js` — Visão Geral + Detalhamento
Merge do antigo `render-overview.js` + `render-detalhamento.js`.
```
VARIÁVEIS:
  const expandedAgents = { all: new Set(), club: new Set() }  ← ~3260
  window._detSearch = ''                    ← ~5489
  window._detSearchTimer = null             ← ~5490
  window._detExpanded = {}                  ← ~5491

FUNÇÕES (Overview — linhas ~3147-3538):
  renderOverview()                     ← ~3147
  updateSidebar()                      ← ~3196
  filterAll(q)                         ← ~3224
  renderAllTable()                     ← ~3234
  filterClub(q)                        ← ~3239
  filterClubFunc(v)                    ← ~3248
  renderClubTable()                    ← ~3253
  calcResult(p)                        ← ~3264  (wrapper → FinanceEngine.calcPlayerResult)
  calcAgentRB(agKey, players)          ← ~3271  (wrapper → FinanceEngine.calcAgentRB)
  calcAgentResult(agKey, players)      ← ~3282  (wrapper → FinanceEngine.calcAgentResult)
  renderTableRows(...)                 ← ~3292
  toggleAgent(...)                     ← ~3514
  updateV2KPIs(...)                    ← ~3523
  updateOverviewKPIs()                 ← ~5674

FUNÇÕES (Detalhamento — linhas ~5489-5670):
  filterDet(q)                         ← ~5493
  toggleDetAgent(agKey)                ← ~5505
  exportDet()                          ← ~5510
  renderDetalhamento()                 ← ~5530
```

#### `js/render-rakeback.js` — Config Rakeback
```
VARIÁVEIS:
  window.playerDirect = JSON.parse(...)     ← ~3552
  window.agentDirect = JSON.parse(...)      ← ~3556
  window.playerRB = JSON.parse(...)         ← ~3567
  window.weekLocked = JSON.parse(...)       ← ~3571
  window.rbSnapPlayers = JSON.parse(...)    ← ~3572
  window.rbSnapAgents = JSON.parse(...)     ← ~3573
  window.finSnapshot = JSON.parse(...)      ← ~3574
  const rbExpandedAgents = new Set()        ← ~3892
  window._rbSearch = ''                     ← ~3893
  window._rbSearchTimer = null              ← ~3894
  window._activeRbTab = 'agencias'          ← ~3895

FUNÇÕES (linhas ~3552-4435):
  Todas as 35 funções de rakeback listadas anteriormente.
  Ver mapeamento completo na v1 do spec, seção 7.

  NOTA: getWeekKey() (~3580) é usada por muitos módulos.
  Manter como função global — funciona entre scripts.
```

#### `js/render-financeiro.js` — Financeiro + Pagamentos + Liquidação
Merge do antigo `render-liquidacao.js` + `render-financeiro.js`.
```
VARIÁVEIS:
  window._fechTab = 'agentes'               ← ~4697
  window._fechSubTab = 'pagar'              ← ~4698
  window._fechFilter = 'todos'              ← ~4699
  window._fechSearch = ''                   ← ~4700
  window._fechSort = 'pendente_desc'        ← ~4701
  window._fechSearchTimer = null            ← ~4702
  window._activeCompTab = 'agencias'        ← ~4720
  window.overlayGlobal = Number(localStorage.getItem('pm_overlay')) || 0   ← ~5147
  window.overlayClubes = JSON.parse(localStorage.getItem('pm_overlayClubes')||'null') ← ~5148
  window.clubManual = JSON.parse(...)       ← ~5149
  window._finModalEntity = null             ← ~7040
  window._finFilter = 'todos'              ← ~7042
  window._finSearch = ''                   ← ~7043
  window._finSort = 'devedores'            ← ~7044
  window._activeFinTab = 'agencias'        ← ~7045
  window._finSearchTimer = null            ← ~7070

FUNÇÕES (Liquidação — linhas ~4697-5156):
  setFechFilter(f), setFechSort(s), setFechSearch(q)
  switchFechTab(tab), switchFechSubTab(t), switchCompTab(tab)
  calcSettlements()            ← AGORA chama FinanceEngine.calcSettlements(params)
  getSettlementStatus(s)       ← AGORA chama FinanceEngine.getSettlementStatus(s)
  renderFechamentos()
  abrirPagFechamento(entityId)
  toggleFechAccordion(idx)
  toggleAgentDirect(agKey), addDirectFromSelect(), markAgentDirect(agKey), unmarkAgentDirect(agKey)
  saveOverlay(), saveOverlayClubes(), saveClubManual()
  getOverlayClubesList(), getOverlayPerClub(clube)

FUNÇÕES (Financeiro — linhas ~6822-7792):
  getFinData(), saveFinData(d)        ← AGORA delegam para DataLayer
  getPayMethods(), savePayMethods(arr) ← AGORA delegam para DataLayer
  finKey()
  calcFinEntities()           ← AGORA chama FinanceEngine.calcFinEntities(params)
  getSaldoAnterior(entityId)  ← delega para DataLayer.getSaldoAnterior()
  fecharSemanaFinanceiro()
  addMov(entityId, valor, metodo, dir, extra)
  getMovTotal(entityId), getEntityLedgerNet(entityId), getTotalPago(entityId)
  setSaldoAberto(entityId, saldo)
  switchFinTab(tab), setFinFilter(filter), setFinSearch(q)
  getEntityStatus(e)          ← AGORA chama FinanceEngine.getEntityStatusCalc(params)
  computeFinanceKPIs()        ← AGORA chama FinanceEngine.computeFinanceKPIs(params)
  _renderStagedPanel()
  applyStagedAndRefresh(stagedId), rejectStagedAndRefresh(stagedId)
  openEditStaged(stagedId), saveEditStaged()
  renderFinanceiro()
  _renderFinRow(r)
  openHistoryDrawer(entityId), closeHistoryDrawer()
  abrirModalPagamento(entityId, dirOverride)
  selectPayMetodo(btn, metodo), setPayFull(), previewComp(input)
  confirmarPagamento()
  verExtratoPag(entityId, idx), confirmarExcluirPag(...), excluirPagamento(...)
  addPaymentMethod(), addNewPayMethod(), removePayMethod(idx)
```

#### `js/render-conciliacao.js` — OFX + ChipPix (import + vinculação)
```
VARIÁVEIS:
  window._ofxFilterAtual = 'todos'          ← ~7917
  window._ofxFilter = 'todos'               ← ~7918
  window._ofxSearch = ''                    ← ~7919
  window._ofxCatFilter = null               ← ~7920
  window._ofxPickerFitid = null             ← ~8383
  window._ofxPickerOptions = []             ← ~8384
  window._cpFilterAtual = 'todos'           ← ~8481
  window._cpDDOpen = null                   ← ~8790

FUNÇÕES (OFX — linhas ~7792-8464):
  getOFXMap(), saveOFXMap(m)         ← AGORA delegam para DataLayer
  ofxSessaoKey(), getOFXSessao(), saveOFXSessao(arr) ← delegam para DataLayer
  getTransactionCategories(), saveTransactionCategories(cats) ← delegam
  getOFXEntityOptions(categoria)
  autoCategorizarOFX(tx), normTx(t)
  abrirImportOFX(), renderOFXModal()
  processOFX(input), parseOFX(raw, nomeArq, fitidsExist)
  removerBancoOFX(banco), limparOFXAplicados()
  normalizeMemo(memo)
  renderOFXTable()
  vincularOFX(idx, entityId), ignorarOFX(idx, ignorar)
  filtrarOFX(btn, filtro)
  confirmarConciliacao()
  aplicarOFX(fitid), reverterOFX(fitid)
  ofxSetCategoria(fitid, catId), ofxSetEntity(...), ofxSetSub(fitid, sub)
  ofxSetFornecedor(fitid, v), ofxIgnorar(fitid), ofxRestaurar(fitid)
  ofxAplicarTodos()
  ensureOFXPicker(), ofxOpenEntityPicker(...), ofxPickerFilter(q)
  ofxPickerSelect(...), ofxClosePicker()

FUNÇÕES (ChipPix — linhas ~8473-9019):
  getCPMap(), saveCPMap(m)           ← AGORA delegam para DataLayer
  cpSessaoKey(), getCPSessao(), saveCPSessao(arr) ← delegam
  abrirChipPix(), renderCPModal()
  processChipPix(input), _cpFindPlayerMatch(idJog, clubePlayers)
  lerExcelCP(file)
  renderCPTable()
  toggleCPDD(idx), closeCPDDs(), filterCPDD(idx, query)
  selecionarCPItem(idx, entityId, label), navCPDD(e, idx)
  reautolinkCP()
  vincularCP(idx, entityId), ignorarCP(idx, ignorar)
  filtrarCP(btn, filtro)
  aplicarChipPix(), resetarChipPixSemana()
```

#### `js/render-staging.js` — Staging + Movements + Conciliation UI
```
VARIÁVEIS:
  window._finActiveSub = 'liquidacao'       ← ~9061
  window._concActiveSub = 'chippix'         ← ~9062
  window._concCPFilter = 'todos'            ← ~9566
  window._concCPSearch = ''                 ← ~9567
  window._concOFXBankId = null              ← ~10060

FUNÇÕES (Conciliation page — linhas ~9066-9267):
  switchConcSub(tab, btn)
  renderConciliacao()
  switchAjustesSub(tab, btn)
  renderAjustes(), renderAjustesFormas()
  removePaymentMethod(idx)
  renderCategorias(), adicionarCategoria(), removerCategoria(id)
  getBankAccounts(), saveBankAccounts(arr)    ← delegam para DataLayer
  addBankAccount(), removeBankAccount(id), setDefaultBank(id)
  renderConcBanks()

FUNÇÕES (Movements — linhas ~9268-9565):
  getMovements(), saveMovements(arr)         ← delegam para DataLayer
  getWeekMovements(weekKey, clube)
  getEntityMovTotal(entityId, weekKey, clube)
  isDuplicateMovement(...), findPossibleDuplicate(...)
  createMovement(data), syncMovementToLedger(mv), deleteMovement(mvId)
  getStaged(), saveStaged(arr)               ← delegam para DataLayer
  getWeekStaged(weekKey, clube)
  isDuplicateStagedOrMov(...)
  createStagedMovement(data), applyStagedMovement(stagedId)
  rejectStagedMovement(stagedId), editStagedMovement(stagedId, changes)
  applyAllStaged()

FUNÇÕES (Conciliation UI — linhas ~9569-10384):
  renderConcChipPix()
  _renderConcCPRow(r, idx, cpPlayers, playerOpts, allData, fKey, weekLock)
  _cpFindPlayer(r, cpPlayers)
  vincConcCP(idx, entityId), lockConcCP(idx), unlockConcCP(idx)
  clearConcCPBinding(idx), _cpResolveEntityId(r)
  lockAllConcCP(), clearAllConcCPBindings()
  aplicarChipPixConc()
  renderConcOFX(), aplicarOFXConc()
  renderConcLedger()
```

#### `js/render-reports.js` — DRE + Liga + Resumo + Lançamentos
Merge do antigo `render-dre.js` + `render-liga.js` + `render-lancamentos.js`.
```
VARIÁVEIS:
  window._dreExpanded = {...}               ← ~7921

FUNÇÕES (Lançamentos — linhas ~5165-5411):
  renderLancamentos()
  _updateLancOverlay(), _toggleOverlayClub(clube, checked)
  _refreshLancTotals()
  calcOverlay(), lockCompras(), unlockCompras()
  _lockResumoField(), _unlockResumoField()
  getManual(), getLigaLanc(wk)
  saveManualInputs(), loadManualInputs()
  updateClubKPIs(), calcFinal()
  _renderResumoResult()
  renderResumo()
  calcClubNumbers(clube)       ← AGORA chama FinanceEngine.calcClubNumbers(params)
  calcResultadoClube()         ← AGORA chama FinanceEngine.calcResultadoClube(params)
  exportResumoJPG(), downloadResumoJPG()

FUNÇÕES (DRE — linhas ~5869-6097):
  calcDREData()                ← AGORA chama FinanceEngine.calcDREData(params)
  toggleDRE(section)
  renderResultadoClube()
  parseLancVal(m, key)

FUNÇÕES (Liga — linhas ~6103-6788):
  getLigaClubEntry(clube), saveLigaClubEntry(clube, field, val)
  _lockLancRow(clube), _unlockLancRow(clube)
  calcLigaNumbers(clube)       ← AGORA chama FinanceEngine.calcLigaNumbers(params)
  renderLiga(), _renderLigaResult()
  renderFechDash()
  renderCaixaGlobal()
  calcLigaGlobal()             ← AGORA chama FinanceEngine.calcLigaGlobal(params)
  renderLigaGlobal(), _renderLGResult()
  exportLigaGlobalCSV()
```

#### `js/render-agents.js` — Comprovantes + PDF + Linking + Export
Merge do antigo `render-agent-closing.js` + `render-linking.js`.
```
VARIÁVEIS:
  window.agentRB = JSON.parse(...)          ← ~10384
  const agentExpanded = {}                  ← ~10386

FUNÇÕES (Agent Closing — linhas ~10384-10893):
  saveAgentRB()                ← AGORA delega para DataLayer.saveAgentRBConfig
  renderAgentClosing()
  setAgentType(agKey, avista), confirmAgentType(agKey), unlockAgentType(agKey)
  lockAgentRB(agKey), setAgentRBDual(agKey, tipo, val), unlockAgentRB(agKey)
  filterAgentList(q), setAgentRB(agKey, val)
  toggleAgentCard(agKey)
  openAgentPDF(agKey), downloadAgentImage(), exportAllAgentsPDF()

FUNÇÕES (Linking — linhas ~10894-11037):
  checkUnlinkedOv(), checkUnlinkedClub()
  checkIgnoredAgents(), openIgnoredPanel(), reativarAgent(agentId)
  openLink(idx), pickOpt(el), confirmLink()
  openBulk(), openBulkClub(), buildBulkList(unk), bulkLink(idx, clube)
  exportAll(), exportClub()
```

#### `js/render-config.js` — Logos, taxas, ajustes
```
VARIÁVEIS:
  window.clubLogos = JSON.parse(...)        ← ~4439

FUNÇÕES (linhas ~4439-4664):
  saveLogos()                  ← AGORA delega para DataLayer.saveClubLogos
  getLogoEl(clube, size, radius)
  renderConfigPage()
  setLigaRate(key, val), resetLigaConfig()
  handleLogoUpload(clube, input), removeLogo(clube)
  openClubConfig()
  setCfgLiqType(agKey, isDirect), setCfgAgentRB(agKey, val)
  applyLogosEverywhere()
```

**VERIFICAÇÃO PASSO 4**: Após cada arquivo, abrir HTML e testar a aba correspondente. Verificar Console sem erros.

---

## SOBRE `const` vs `let` vs `window.`

### ✅ Funciona entre `<script>` tags separadas:
```javascript
// Script 1:
const CLUBS = ['A', 'B'];        // const no top-level → global
function calcResult(p) { ... }   // function declaration → global

// Script 2:
console.log(CLUBS);              // ✅ funciona
calcResult(player);              // ✅ funciona
```

### ❌ NÃO funciona entre `<script>` tags:
```javascript
// Script 1:
let activeClube = null;          // let no top-level → NÃO é window property

// Script 2:
console.log(activeClube);        // ❌ ReferenceError
```

### ✅ Solução para let:
```javascript
// Script 1:
window.activeClube = null;       // explicitamente no window

// Script 2:
console.log(activeClube);        // ✅ funciona (lê de window)
activeClube = 'IMPÉRIO';         // ✅ funciona (escreve em window)
```

### Resumo:
| Declaração | Escopo entre scripts | Precisa de window.? |
|------------|---------------------|---------------------|
| `function foo() {}` | ✅ Global | Não |
| `const X = valor` | ✅ Global* | Não |
| `let x = valor` | ❌ Escopo do script | **SIM → window.x** |
| `var x = valor` | ✅ Global | Não (mas evitar var) |

*`const` no top-level de um `<script>` cria uma binding no escopo global que é acessível por scripts subsequentes em browsers modernos.

**IMPORTANTE**: Se uma variável `const` é reatribuída em qualquer lugar (`const x = 1; ... x = 2;`), ela já teria dado erro antes. Se não dava erro, é porque só o conteúdo muda (ex: `const obj = {}; obj.prop = 1;`). Nesses casos, `const` funciona.

---

## CHECKLIST PÓS-EXTRAÇÃO

- [ ] HTML tem ~1.700 linhas (sem JS inline exceto init)
- [ ] Console sem erros ao abrir
- [ ] Navegação entre todas as abas funciona
- [ ] Import de planilha funciona
- [ ] KPIs do Resumo carregam
- [ ] Liquidação mostra A Pagar / A Receber
- [ ] Pagamento manual funciona
- [ ] ChipPix import funciona
- [ ] OFX import funciona
- [ ] Lock de semana funciona
- [ ] Rakeback percentuais editáveis
- [ ] DRE renderiza corretamente
- [ ] Liga renderiza corretamente
- [ ] Export JPG/PDF funciona
- [ ] Backup/Restore funciona
