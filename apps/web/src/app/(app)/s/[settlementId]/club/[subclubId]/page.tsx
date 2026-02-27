'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import dynamic from 'next/dynamic';
import { getSettlementFull, getOrgTree, syncSettlementAgents, syncSettlementRates } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { getVisibleTabKeys, getVisibleTabList } from '@/components/settlement/SubNavTabs';
import type { SettlementFullResponse, SubclubData } from '@/types/settlement';
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
const DRE = dynamic(() => import('@/components/settlement/DRE'), { loading: () => <TabSkeleton />, ssr: false });
const Liga = dynamic(() => import('@/components/settlement/Liga'), { loading: () => <TabSkeleton />, ssr: false });
const Extrato = dynamic(() => import('@/components/settlement/Extrato'), { loading: () => <TabSkeleton />, ssr: false });
const Rakeback = dynamic(() => import('@/components/settlement/Rakeback'), { loading: () => <TabSkeleton />, ssr: false });
const Comprovantes = dynamic(() => import('@/components/settlement/Comprovantes'), { loading: () => <TabSkeleton />, ssr: false });
const Conciliacao = dynamic(() => import('@/components/settlement/Conciliacao'), { loading: () => <TabSkeleton />, ssr: false });

export default function SubclubPanelPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, hasPermission } = useAuth();

  const settlementId = params.settlementId as string;
  const subclubId = decodeURIComponent(params.subclubId as string);
  const requestedTab = searchParams.get('tab') || 'resumo';
  // Fallback: if requested tab is not visible for this role, redirect to 'resumo'
  const visibleTabs = getVisibleTabKeys(hasPermission);
  const activeTab = visibleTabs.has(requestedTab) ? requestedTab : 'resumo';

  const [data, setData] = useState<SettlementFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [weekNotFound, setWeekNotFound] = useState(false);
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  usePageTitle(subclubId || 'Subclube');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sync agents & rates (DRAFT only, fire-and-forget — don't block initial load)
      Promise.all([
        syncSettlementAgents(settlementId).catch(() => {}),
        syncSettlementRates(settlementId).catch(() => {}),
      ]);

      const [res, treeRes] = await Promise.all([getSettlementFull(settlementId), getOrgTree()]);
      if (treeRes.success && treeRes.data) {
        const map: Record<string, string | null> = {};
        for (const club of treeRes.data) {
          for (const sub of club.subclubes || []) {
            map[sub.name.toLowerCase()] = sub.metadata?.logo_url || null;
          }
        }
        setLogoMap(map);
      }
      if (res.success && res.data) {
        setData(res.data);
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

  // ─── Loading (skeleton em vez de spinner) ────────────────────────
  // Only show skeleton on initial load (no data yet).
  // During refreshes (loading=true but data exists), keep content mounted
  // to avoid unmounting children which causes infinite remount loops.
  if (loading && !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
      <div className="p-8">
        <div className="card">
          <EmptyState icon={AlertCircle} title={error || 'Settlement nao encontrado'} action={{ label: 'Voltar ao Dashboard', onClick: () => router.push('/dashboard') }} />
        </div>
      </div>
    );
  }

  const { settlement, fees, subclubs } = data;

  // Find current subclub
  const foundSubclub = subclubs.find((sc: SubclubData) => sc.name === subclubId || sc.id === subclubId);

  if (!foundSubclub) {
    return (
      <div className="p-8">
        <div className="card">
          <EmptyState icon={AlertCircle} title={`Subclube "${subclubId}" nao encontrado`} action={{ label: 'Voltar para Semana', onClick: () => router.push(`/s/${settlementId}`) }} />
        </div>
      </div>
    );
  }

  // Narrow type after guard — TS can't narrow in nested closures
  const subclub: SubclubData = foundSubclub;

  // Calculate week_end
  const weekEnd = (() => {
    if (!settlement.week_start) return undefined;
    const d = new Date(settlement.week_start + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  })();

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
              logoUrl={logoMap[subclubId.toLowerCase()] || null}
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
      case 'ajustes':
        return (
          <TabErrorBoundary tabName="Ajustes">
            <Ajustes
              subclub={subclub}
              weekStart={settlement.week_start}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      case 'dre':
        return <TabErrorBoundary tabName="DRE"><DRE subclub={subclub} fees={fees} /></TabErrorBoundary>;
      case 'liga':
        return <TabErrorBoundary tabName="Liga"><Liga subclubs={subclubs} currentSubclubName={subclub.name} logoMap={logoMap} /></TabErrorBoundary>;
      case 'extrato':
        return (
          <TabErrorBoundary tabName="Extrato">
            <Extrato weekStart={settlement.week_start} settlementStatus={settlement.status} onDataChange={loadData} />
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
              fees={fees}
              logoUrl={logoMap[subclubId.toLowerCase()] || null}
              settlementId={settlementId}
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
              clubId={settlement.club_id}
              settlementStatus={settlement.status}
              onDataChange={loadData}
              agents={(subclub.agents || []).map((a: any) => ({ agent_id: a.agent_id, agent_name: a.agent_name }))}
              players={(subclub.players || []).map((p: any) => ({
                external_player_id: p.external_player_id,
                nickname: p.nickname,
              }))}
            />
          </TabErrorBoundary>
        );

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
            <span className="text-white font-medium truncate max-w-[120px] lg:max-w-none">{subclub.name}</span>
            <span className={`ml-2 badge-${settlement.status.toLowerCase()}`}>
              {settlement.status}
            </span>
          </nav>
          <div className="h-4 w-px bg-dark-700 hidden lg:block" />
          <div className="hidden lg:flex items-center gap-4">
            <WeekSelector
              currentSettlementId={settlementId}
              weekStart={settlement.week_start}
              weekEnd={weekEnd || ''}
              status={settlement.status}
              onNotFound={() => setWeekNotFound(true)}
            />
            <span className="text-dark-500 text-xs">v{settlement.version}</span>
          </div>
          <div className="h-4 w-px bg-dark-700 hidden md:block" />
          <div className="relative">
            <select
              value={subclub.name}
              onChange={(e) => {
                router.push(`/s/${settlementId}/club/${encodeURIComponent(e.target.value)}?tab=${activeTab}`);
              }}
              className="appearance-none bg-dark-800 border border-dark-700 rounded-lg pl-3 pr-7 py-1.5 text-sm text-white font-medium hover:border-dark-600 focus:border-poker-500 focus:outline-none cursor-pointer max-w-[160px] lg:max-w-none transition-colors"
              aria-label="Trocar subclube"
            >
              {subclubs.map((sc: SubclubData) => (
                <option key={sc.id || sc.name} value={sc.name}>
                  {sc.name}
                </option>
              ))}
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
        <div className="flex items-center gap-2 px-6 py-2 bg-yellow-900/20 border-b border-yellow-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs text-yellow-300 font-medium">RASCUNHO</span>
          <span className="text-xs text-yellow-300/60">— Dados podem ser editados. Finalize para travar.</span>
        </div>
      )}
      {settlement.status === 'FINAL' && (
        <div className="flex items-center gap-2 px-6 py-2 bg-poker-900/20 border-b border-poker-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-poker-400" />
          <span className="text-xs text-poker-300 font-medium">FINALIZADO</span>
          <span className="text-xs text-poker-300/60">— Semana travada. Somente leitura.</span>
        </div>
      )}
      {settlement.status === 'VOID' && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-900/20 border-b border-red-700/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-xs text-red-300 font-medium">ANULADO</span>
          <span className="text-xs text-red-300/60">— Esta semana foi anulada.</span>
        </div>
      )}

      {/* 2-column layout */}
      {weekNotFound ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center bg-dark-950/30">
          <h2 className="text-xl font-bold text-white mb-2">Nenhum fechamento encontrado</h2>
          <p className="text-dark-400">Nao existe fechamento importado para o periodo selecionado.</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
