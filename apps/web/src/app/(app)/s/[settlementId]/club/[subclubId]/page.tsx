'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import dynamic from 'next/dynamic';
import { getSettlementFull, getOrgTree, syncSettlementAgents, syncSettlementRates } from '@/lib/api';
import { normalizeKey, buildLogoMap } from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';
import { getVisibleTabKeys, getVisibleTabList } from '@/components/settlement/SubNavTabs';
import type { SettlementFullResponse, SubclubData } from '@/types/settlement';
import { buildSubclubEntityIds } from '@/lib/subclubEntityIds';
import CardSkeleton from '@/components/ui/CardSkeleton';
import TabSkeleton from '@/components/ui/TabSkeleton';
import TabErrorBoundary from '@/components/ui/TabErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import { AlertCircle } from 'lucide-react';

import SubNavTabs from '@/components/settlement/SubNavTabs';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import WeekSelector from '@/components/WeekSelector';

// ─── Tab leve (sempre visível, import estático) ─────────────────────
import ResumoClube from '@/components/settlement/ResumoClube';

// ─── Tabs com code-split (carregadas sob demanda) ───────────────────
const DashboardClube = dynamic(() => import('@/components/settlement/DashboardClube'), { loading: () => <TabSkeleton />, ssr: false });
const Detalhamento = dynamic(() => import('@/components/settlement/Detalhamento'), { loading: () => <TabSkeleton />, ssr: false });
const Jogadores = dynamic(() => import('@/components/settlement/Jogadores'), { loading: () => <TabSkeleton />, ssr: false });
const Ajustes = dynamic(() => import('@/components/settlement/Ajustes'), { loading: () => <TabSkeleton />, ssr: false });
const Lancamentos = dynamic(() => import('@/components/settlement/Lancamentos'), { loading: () => <TabSkeleton />, ssr: false });
const DRE = dynamic(() => import('@/components/settlement/DRE'), { loading: () => <TabSkeleton />, ssr: false });
const Liga = dynamic(() => import('@/components/settlement/Liga'), { loading: () => <TabSkeleton />, ssr: false });
const Caixa = dynamic(() => import('@/components/settlement/Caixa'), { loading: () => <TabSkeleton />, ssr: false });
const Rakeback = dynamic(() => import('@/components/settlement/Rakeback'), { loading: () => <TabSkeleton />, ssr: false });
const Conciliacao = dynamic(() => import('@/components/settlement/Conciliacao'), { loading: () => <TabSkeleton />, ssr: false });
const Comprovantes = dynamic(() => import('@/components/settlement/Comprovantes'), { loading: () => <TabSkeleton />, ssr: false });
const ConfigTab = dynamic(() => import('@/components/settlement/ConfigTab'), { loading: () => <TabSkeleton />, ssr: false });

const IS_ALL = '_all';

/** Merge all subclubes into a single consolidated virtual subclub */
function mergeAllSubclubs(subclubs: SubclubData[], clubName: string): SubclubData {
  const allPlayers = subclubs.flatMap((sc) => sc.players);
  const allAgents = subclubs.flatMap((sc) => sc.agents);
  const sum = (fn: (sc: SubclubData) => number) => subclubs.reduce((acc, sc) => acc + fn(sc), 0);

  return {
    id: IS_ALL,
    name: clubName,
    players: allPlayers,
    agents: allAgents,
    totals: {
      players: sum((sc) => sc.totals.players),
      agents: sum((sc) => sc.totals.agents),
      ganhos: sum((sc) => sc.totals.ganhos),
      rake: sum((sc) => sc.totals.rake),
      netProfit: sum((sc) => sc.totals.netProfit),
      ggr: sum((sc) => sc.totals.ggr),
      rbTotal: sum((sc) => sc.totals.rbTotal),
      resultado: sum((sc) => sc.totals.resultado),
    },
    feesComputed: {
      taxaApp: sum((sc) => sc.feesComputed.taxaApp),
      taxaLiga: sum((sc) => sc.feesComputed.taxaLiga),
      taxaRodeoGGR: sum((sc) => sc.feesComputed.taxaRodeoGGR),
      taxaRodeoApp: sum((sc) => sc.feesComputed.taxaRodeoApp),
      totalTaxasSigned: sum((sc) => sc.feesComputed.totalTaxasSigned),
    },
    adjustments: {
      overlay: sum((sc) => sc.adjustments.overlay),
      compras: sum((sc) => sc.adjustments.compras),
      security: sum((sc) => sc.adjustments.security),
      outros: sum((sc) => sc.adjustments.outros),
      obs: null,
    },
    totalLancamentos: sum((sc) => sc.totalLancamentos),
    acertoLiga: sum((sc) => sc.acertoLiga),
    acertoDirecao: sum((sc) => sc.acertoLiga) >= 0 ? 'receber' : 'pagar',
  };
}

// Wrapper with Suspense for useSearchParams (required in Next.js 15 production)
export default function SubclubPanelPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 space-y-6"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">{[...Array(5)].map((_, i) => <CardSkeleton key={i} />)}</div><TabSkeleton /></div>}>
      <SubclubPanelPage />
    </Suspense>
  );
}

function SubclubPanelPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, hasPermission } = useAuth();

  const settlementId = params.settlementId as string;
  const subclubId = decodeURIComponent(params.subclubId as string);
  const isAllMode = subclubId === IS_ALL;
  const requestedTab = searchParams.get('tab') || 'resumo';
  // Fallback: if requested tab is not visible for this role, redirect to 'resumo'
  const visibleTabs = getVisibleTabKeys(hasPermission);
  const activeTab = visibleTabs.has(requestedTab) ? requestedTab : 'resumo';

  const [data, setData] = useState<SettlementFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);

  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  const [whatsappLinkMap, setWhatsappLinkMap] = useState<Record<string, string | null>>({});
  const [chippixManagerMap, setChippixManagerMap] = useState<Record<string, string>>({});
  const [clubGroups, setClubGroups] = useState<Array<{ clubId: string; label: string; platform?: string; settlementId: string; subclubs: Array<{ name: string }> }>>([]);
  usePageTitle(isAllMode ? 'Fechamento Geral' : (subclubId || 'Subclube'));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sync agents & rates (DRAFT only, fire-and-forget — don't block initial load)
      void Promise.all([
        syncSettlementAgents(settlementId).catch(() => {}),
        syncSettlementRates(settlementId).catch(() => {}),
      ]);

      const [res, treeRes] = await Promise.all([getSettlementFull(settlementId), getOrgTree()]);
      if (treeRes.success && treeRes.data) {
        setLogoMap(buildLogoMap(treeRes.data));
        const waMap: Record<string, string | null> = {};
        const cpMap: Record<string, string> = {};
        for (const club of treeRes.data) {
          waMap[normalizeKey(club.name)] = club.whatsapp_group_link || null;
          for (const sub of club.subclubes || []) {
            waMap[normalizeKey(sub.name)] = sub.whatsapp_group_link || null;
            if (sub.chippix_manager_id) {
              cpMap[sub.id] = sub.chippix_manager_id;
              cpMap[normalizeKey(sub.name)] = sub.chippix_manager_id;
            }
          }
        }
        setWhatsappLinkMap(waMap);
        setChippixManagerMap(cpMap);
      }
      if (res.success && res.data) {
        setData(res.data);

        // Build club groups for dropdown (current club only — no N+1 sibling fetching)
        const currentOrg = res.data.settlement?.organizations;
        const currentClubName = currentOrg?.name || 'Clube';
        const currentPlatform = currentOrg?.metadata?.platform || undefined;
        setClubGroups([{
          clubId: res.data.settlement?.club_id,
          label: currentClubName,
          platform: currentPlatform,
          settlementId,
          subclubs: (res.data.subclubs || []).map((sc: any) => ({ name: sc.name })),
        }]);
      } else {
        setError(res.error || 'Erro ao carregar settlement');
      }
    } catch {
      setError('Erro de conexao com o servidor');
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcuts: 1-9 for tab navigation
  const tabList = getVisibleTabList(hasPermission);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip if modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= tabList.length) {
        e.preventDefault();
        const targetTab = tabList[num - 1];
        if (targetTab && targetTab !== activeTab) {
          router.push(`/s/${settlementId}/club/${encodeURIComponent(subclubId)}?tab=${targetTab}`);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tabList, activeTab, settlementId, subclubId, router]);

  async function handleFinalize() {
    setShowLockModal(true);
  }

  function handleTabChange(tab: string) {
    router.push(`/s/${settlementId}/club/${encodeURIComponent(subclubId)}?tab=${tab}`);
  }

  // ─── useMemo hooks MUST be before any conditional return (Rules of Hooks) ──
  const _weekStart = data?.settlement?.week_start;
  const _allSubclubs = data?.subclubs;
  const _agents = isAllMode
    ? _allSubclubs?.flatMap((sc: SubclubData) => sc.agents)
    : _allSubclubs?.find((sc: SubclubData) => sc.name === subclubId || sc.id === subclubId)?.agents;
  const _players = isAllMode
    ? _allSubclubs?.flatMap((sc: SubclubData) => sc.players)
    : _allSubclubs?.find((sc: SubclubData) => sc.name === subclubId || sc.id === subclubId)?.players;

  const weekEnd = useMemo(() => {
    if (!_weekStart) return undefined;
    const d = new Date(_weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  }, [_weekStart]);

  const conciliacaoAgents = useMemo(
    () => (_agents || []).map((a) => ({ agent_id: a.agent_id || a.id, agent_name: a.agent_name })),
    [_agents],
  );
  const conciliacaoPlayers = useMemo(
    () => (_players || []).map((p) => ({ external_player_id: p.external_player_id || null, nickname: p.nickname || null })),
    [_players],
  );
  const subclubEntityIds = useMemo(
    () => buildSubclubEntityIds(_agents || [], _players || []),
    [_agents, _players],
  );

  // ─── Loading (skeleton em vez de spinner) ────────────────────────
  // Only show skeleton on initial load (no data yet).
  // During refreshes (loading=true but data exists), keep content mounted
  // to avoid unmounting children which causes infinite remount loops.
  if (loading && !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <TabSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 lg:p-8">
        <div className="card">
          <EmptyState icon={AlertCircle} title={error || 'Settlement nao encontrado'} action={{ label: 'Voltar ao Dashboard', onClick: () => router.push('/dashboard') }} />
        </div>
      </div>
    );
  }

  const { settlement, fees, subclubs } = data;

  // Find current subclub (or merge all for consolidated view)
  const currentClubName = settlement.organizations?.name || 'Clube';
  const foundSubclub = isAllMode
    ? (subclubs.length > 0 ? mergeAllSubclubs(subclubs, currentClubName) : null)
    : subclubs.find((sc: SubclubData) => sc.id === subclubId || sc.name === subclubId);

  if (!foundSubclub) {
    return (
      <div className="p-4 lg:p-8">
        <div className="card">
          <EmptyState icon={AlertCircle} title={`Subclube "${subclubId}" nao encontrado`} action={{ label: 'Voltar para Semana', onClick: () => router.push(`/s/${settlementId}`) }} />
        </div>
      </div>
    );
  }

  // Narrow type after guard — TS can't narrow in nested closures
  const subclub: SubclubData = foundSubclub;

  // ─── Render content based on tab ──────────────────────────────────
  function renderContent() {
    switch (activeTab) {
      case 'resumo':
        return (
          <TabErrorBoundary tabName="Resumo do Clube">
            <ResumoClube
              subclub={subclub}
              fees={fees}
              weekStart={settlement.week_start}
              weekEnd={weekEnd}
              logoUrl={logoMap[normalizeKey(subclubId)] || null}
              whatsappGroupLink={whatsappLinkMap[normalizeKey(subclubId)] || null}
            />
          </TabErrorBoundary>
        );
      case 'detalhamento':
        return <TabErrorBoundary tabName="Detalhamento"><Detalhamento subclub={subclub} /></TabErrorBoundary>;
      case 'dashboard':
        return <TabErrorBoundary tabName="Dashboard"><DashboardClube subclub={subclub} fees={fees} settlementId={settlementId} subclubName={subclubId} /></TabErrorBoundary>;
      case 'jogadores':
        return <TabErrorBoundary tabName="Jogadores"><Jogadores subclub={subclub} /></TabErrorBoundary>;

      // Tabs funcionais
      case 'lancamentos':
        return (
          <TabErrorBoundary tabName="Lancamentos">
            {isAllMode || subclubs.length <= 1 ? (
              <Lancamentos
                subclubs={subclubs}
                weekStart={settlement.week_start}
                settlementStatus={settlement.status}
                onDataChange={loadData}
              />
            ) : (
              <Ajustes
                subclub={subclub}
                weekStart={settlement.week_start}
                settlementStatus={settlement.status}
                onDataChange={loadData}
              />
            )}
          </TabErrorBoundary>
        );
      case 'dre':
        return <TabErrorBoundary tabName="DRE"><DRE subclub={subclub} fees={fees} weekStart={settlement.week_start} /></TabErrorBoundary>;
      case 'liga':
        return (
          <TabErrorBoundary tabName="Liga">
            <Liga
              subclubs={isAllMode ? subclubs : [subclub]}
              currentSubclubName={subclub.name}
              logoMap={logoMap}
              weekStart={settlement.week_start}
              weekEnd={weekEnd}
              isConsolidated={isAllMode || subclubs.length > 1}
            />
          </TabErrorBoundary>
        );
      case 'caixa':
        return (
          <TabErrorBoundary tabName="Caixa">
            <Caixa
              weekStart={settlement.week_start}
              clubId={subclub.id}
              settlementId={settlement.id}
              subclub={subclub}
              fees={fees}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      case 'conciliacao':
        return (
          <TabErrorBoundary tabName="Conciliacao">
            <Conciliacao
              weekStart={settlement.week_start}
              clubId={subclub.id}
              clubName={subclub.name}
              platform={clubGroups[0]?.platform}
              settlementId={settlement.id}
              chippixManagerId={chippixManagerMap[subclub.id] || chippixManagerMap[normalizeKey(subclub.name)] || null}
              settlementStatus={settlement.status}
              onDataChange={loadData}
              agents={conciliacaoAgents}
              players={conciliacaoPlayers}
              subclubEntityIds={subclubEntityIds}
            />
          </TabErrorBoundary>
        );
      case 'rakeback':
        return (
          <TabErrorBoundary tabName="Rakeback">
            <Rakeback
              subclub={subclub}
              weekStart={settlement.week_start}
              fees={fees}
              settlementId={settlementId}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      case 'comprovantes':
        return (
          <TabErrorBoundary tabName="Comprovantes">
            <Comprovantes
              subclub={subclub}
              weekStart={settlement.week_start}
              clubId={settlement.club_id}
              clubExternalId={settlement.organizations?.external_id}
              fees={fees}
              logoUrl={logoMap[normalizeKey(subclubId)] || null}
              settlementId={settlementId}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      case 'config':
        {
          // Determine the org ID to use for the config panel:
          // - Consolidated (_all) view → main club config
          // - Individual subclub with real UUID → subclub config (with Agentes tab)
          // - Single subclub (no extras) → use its real UUID if available, else main club
          const isRealSubclubId = subclub.id && !subclub.id.startsWith('name:') && subclub.id !== IS_ALL;
          const showAsSubclub = !isAllMode && isRealSubclubId;
          return (
            <TabErrorBoundary tabName="Config">
              <ConfigTab
                clubId={settlement.club_id}
                subclubOrgId={showAsSubclub ? subclub.id : undefined}
                isSubclub={!!showAsSubclub}
              />
            </TabErrorBoundary>
          );
        }
      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-dark-400">Tab nao encontrada: {activeTab}</p>
          </div>
        );
    }
  }

  // ─── Main layout ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Lock Week Modal */}
      <LockWeekModal
        show={showLockModal}
        settlementId={settlementId}
        weekStart={settlement.week_start}
        notes={settlement.notes || ''}
        subclubs={subclubs}
        onClose={() => setShowLockModal(false)}
        onSuccess={() => {
          setShowLockModal(false);
          loadData();
        }}
      />
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6 py-3 bg-dark-900/80 border-b border-dark-700 shrink-0">
        <div className="flex flex-wrap items-center gap-2 lg:gap-4 min-w-0">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-dark-400" aria-label="Breadcrumb">
            <button
              onClick={() => router.push('/s')}
              className="hover:text-dark-200 transition-colors hidden sm:inline"
            >
              Fechamentos
            </button>
            <span className="mx-1.5 text-dark-600 hidden sm:inline">/</span>
            <button
              onClick={() => router.push(`/s/${settlementId}`)}
              className="hover:text-dark-200 transition-colors"
            >
              <span className="sm:hidden">&larr;</span>
              <span className="hidden sm:inline">Semana</span>
            </button>
            <span className="mx-1.5 text-dark-600">/</span>
            <span className="text-white font-medium truncate max-w-[120px] lg:max-w-none">{isAllMode ? `${currentClubName} (Geral)` : subclub.name}</span>
            {settlement.organizations?.external_id && (
              <span className="ml-1.5 text-[10px] font-mono text-dark-500">#{settlement.organizations.external_id}</span>
            )}
            <span className={`ml-2 badge-${settlement.status.toLowerCase()}`}>
              {settlement.status}
            </span>
          </nav>
          <div className="h-4 w-px bg-dark-700 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-4">
            <WeekSelector
              currentSettlementId={settlementId}
              weekStart={settlement.week_start}
              weekEnd={weekEnd || ''}
              status={settlement.status}
              clubId={settlement.club_id}
              onNotFound={() => {}}
            />
            {settlement.version > 1 && <span className="text-dark-500 text-xs">v{settlement.version}</span>}
          </div>
          <div className="h-4 w-px bg-dark-700 hidden md:block" />
          <div className="relative">
            <select
              value={isAllMode ? IS_ALL : subclub.name}
              onChange={(e) => {
                const target = e.target.value;
                if (target === IS_ALL) {
                  router.push(`/s/${settlementId}/club/${IS_ALL}?tab=${activeTab}`);
                  return;
                }
                // Find which club group contains this subclub
                for (const g of clubGroups) {
                  const found = g.subclubs.find(sc => sc.name === target);
                  if (found) {
                    router.push(`/s/${g.settlementId}/club/${encodeURIComponent(target)}?tab=${activeTab}`);
                    return;
                  }
                }
                // Fallback: same settlement
                router.push(`/s/${settlementId}/club/${encodeURIComponent(target)}?tab=${activeTab}`);
              }}
              className="appearance-none bg-dark-800 border border-dark-700 rounded-lg pl-3 pr-7 py-1.5 text-sm text-white font-medium hover:border-dark-600 focus:border-poker-500 focus:outline-none cursor-pointer max-w-[160px] lg:max-w-none transition-colors"
              aria-label="Trocar subclube"
            >
              {subclubs.length > 1 && (
                <option value={IS_ALL}>
                  {currentClubName} (Geral)
                </option>
              )}
              {clubGroups.length > 1 ? (
                clubGroups.map((g) => (
                  <optgroup key={g.clubId} label={`${g.label}${g.platform ? ` · ${g.platform}` : ''}`}>
                    {g.subclubs.map((sc) => (
                      <option key={`${g.clubId}-${sc.name}`} value={sc.name}>
                        {sc.name}
                      </option>
                    ))}
                  </optgroup>
                ))
              ) : (
                subclubs.map((sc: SubclubData) => (
                  <option key={sc.id || sc.name} value={sc.name}>
                    {sc.name}
                  </option>
                ))
              )}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 text-xs">&#9662;</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {settlement.status === 'DRAFT' && canAccess('OWNER', 'ADMIN') && (
            <button onClick={handleFinalize} className="btn-primary text-xs lg:text-sm flex items-center gap-2">
              <span className="hidden sm:inline">Finalizar Semana</span>
              <span className="sm:hidden">Finalizar</span>
            </button>
          )}
        </div>
      </div>

      {/* Status banner */}
      {settlement.status === 'DRAFT' && (
        <div className="flex items-center gap-2 px-4 lg:px-6 py-2 bg-yellow-900/20 border-b border-yellow-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs text-yellow-300 font-medium">RASCUNHO</span>
          <span className="text-xs text-yellow-300/60">— Dados podem ser editados. Finalize para travar.</span>
        </div>
      )}
      {settlement.status === 'FINAL' && (
        <div className="flex items-center gap-2 px-4 lg:px-6 py-2 bg-poker-900/20 border-b border-poker-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-poker-400" />
          <span className="text-xs text-poker-300 font-medium">FINALIZADO</span>
          <span className="text-xs text-poker-300/60">— Semana travada. Somente leitura.</span>
        </div>
      )}
      {settlement.status === 'VOID' && (
        <div className="flex items-center gap-2 px-4 lg:px-6 py-2 bg-red-900/20 border-b border-red-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-xs text-red-300 font-medium">ANULADO</span>
          <span className="text-xs text-red-300/60">— Esta semana foi anulada.</span>
        </div>
      )}

      {/* 2-column layout */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Mobile horizontal tab bar */}
        <div className="lg:hidden overflow-x-auto border-b border-dark-700/50 bg-dark-900/50 shrink-0">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {tabList.map((tabKey) => (
              <button
                key={tabKey}
                onClick={() => handleTabChange(tabKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tabKey
                    ? 'bg-poker-600/20 text-poker-400 border border-poker-700/30'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                }`}
              >
                {tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop sidebar tabs */}
        <div className="hidden lg:block">
          <SubNavTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Content area — fade on tab switch */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-dark-950/30 animate-tab-fade">{renderContent()}</div>
      </div>
    </div>
  );
}
