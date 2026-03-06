'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  getSettlementFull,
  getOrgTree,
  syncSettlementAgents,
  syncSettlementRates,
  listSettlements,
} from '@/lib/api';
import { normalizeKey } from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import { getVisibleTabKeys, getVisibleTabList } from '@/components/settlement/SubNavTabs';
import type { SettlementFullResponse, SubclubData } from '@/types/settlement';
import { buildSubclubEntityIds } from '@/lib/subclubEntityIds';

import SubNavTabs from '@/components/settlement/SubNavTabs';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import WeekSelector from '@/components/WeekSelector';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TabSkeleton from '@/components/ui/TabSkeleton';
import TabErrorBoundary from '@/components/ui/TabErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import { ArrowLeft, AlertCircle } from 'lucide-react';

// ─── Static tab ─────────────────────────────────────────────────────
import ResumoClube from '@/components/settlement/ResumoClube';

// ─── Lazy tabs ──────────────────────────────────────────────────────
const DashboardClube = dynamic(() => import('@/components/settlement/DashboardClube'), { loading: () => <TabSkeleton />, ssr: false });
const Detalhamento = dynamic(() => import('@/components/settlement/Detalhamento'), { loading: () => <TabSkeleton />, ssr: false });
const Jogadores = dynamic(() => import('@/components/settlement/Jogadores'), { loading: () => <TabSkeleton />, ssr: false });
const Ajustes = dynamic(() => import('@/components/settlement/Ajustes'), { loading: () => <TabSkeleton />, ssr: false });
const DRE = dynamic(() => import('@/components/settlement/DRE'), { loading: () => <TabSkeleton />, ssr: false });
const Liga = dynamic(() => import('@/components/settlement/Liga'), { loading: () => <TabSkeleton />, ssr: false });
const Caixa = dynamic(() => import('@/components/settlement/Caixa'), { loading: () => <TabSkeleton />, ssr: false });
const Rakeback = dynamic(() => import('@/components/settlement/Rakeback'), { loading: () => <TabSkeleton />, ssr: false });
const Conciliacao = dynamic(() => import('@/components/settlement/Conciliacao'), { loading: () => <TabSkeleton />, ssr: false });
const Comprovantes = dynamic(() => import('@/components/settlement/Comprovantes'), { loading: () => <TabSkeleton />, ssr: false });

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

export default function ClubHubPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { toast } = useToast();

  const clubId = params.clubId as string;
  const requestedTab = searchParams.get('tab') || 'resumo';
  const requestedSubclub = searchParams.get('subclub') || '';

  const visibleTabs = getVisibleTabKeys(hasPermission);
  const activeTab = visibleTabs.has(requestedTab) ? requestedTab : 'resumo';

  const [data, setData] = useState<SettlementFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);

  // Settlements for this club (week selector)
  const [settlements, setSettlements] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [weekNotFound, setWeekNotFound] = useState(false);

  // Subclub selector
  const [activeSubclub, setActiveSubclub] = useState<string>(requestedSubclub);

  // Maps from org tree
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  const [whatsappLinkMap, setWhatsappLinkMap] = useState<Record<string, string | null>>({});
  const [chippixManagerMap, setChippixManagerMap] = useState<Record<string, string>>({});

  // Persist subclub selection
  useEffect(() => {
    if (activeSubclub) {
      localStorage.setItem(`club-${clubId}-subclub`, activeSubclub);
    }
  }, [activeSubclub, clubId]);

  // Restore subclub selection on mount
  useEffect(() => {
    if (!requestedSubclub) {
      const saved = localStorage.getItem(`club-${clubId}-subclub`);
      if (saved) setActiveSubclub(saved);
    }
  }, [clubId, requestedSubclub]);

  const clubName = data?.settlement?.organizations?.name || 'Clube';
  const platform = data?.settlement?.organizations?.metadata?.platform || '';
  usePageTitle(clubName);

  // ─── Load settlements for this club ─────────────────────────────────

  useEffect(() => {
    // Reset state when clubId changes (navigation between clubs)
    setSettlementId(null);
    setData(null);
    setSettlements([]);
    setSelectedWeek('');
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await listSettlements(clubId);
        if (cancelled) return;
        if (res.success && res.data) {
          const valid = (res.data as any[]).filter((s: any) => s.status !== 'VOID');
          setSettlements(valid);
          if (valid.length > 0) {
            setSettlementId(valid[0].id);
            setSelectedWeek(valid[0].week_start);
          }
        }
      } catch {
        if (!cancelled) toast('Erro ao carregar semanas do clube', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load settlement full data ──────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!settlementId) return;
    setLoading(true);
    setError(null);
    try {
      // Fire-and-forget sync
      Promise.all([
        syncSettlementAgents(settlementId).catch(() => {}),
        syncSettlementRates(settlementId).catch(() => {}),
      ]);

      const [res, treeRes] = await Promise.all([getSettlementFull(settlementId), getOrgTree()]);
      if (treeRes.success && treeRes.data) {
        const map: Record<string, string | null> = {};
        const waMap: Record<string, string | null> = {};
        const cpMap: Record<string, string> = {};
        for (const club of treeRes.data) {
          for (const sub of club.subclubes || []) {
            map[normalizeKey(sub.name)] = sub.logo_url || sub.metadata?.logo_url || null;
            waMap[normalizeKey(sub.name)] = sub.whatsapp_group_link || null;
            if (sub.chippix_manager_id) {
              cpMap[sub.id] = sub.chippix_manager_id;
              cpMap[normalizeKey(sub.name)] = sub.chippix_manager_id;
            }
          }
        }
        setLogoMap(map);
        setWhatsappLinkMap(waMap);
        setChippixManagerMap(cpMap);
      }
      if (res.success && res.data) {
        setData(res.data);
        // Auto-select first subclub if none selected
        setActiveSubclub((prev) => {
          if (prev) return prev;
          return res.data.subclubs?.length > 0 ? res.data.subclubs[0].name : '';
        });
      } else {
        setError(res.error || 'Erro ao carregar dados do clube');
      }
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }, [settlementId]); // activeSubclub removido — nao precisa re-fetch ao trocar subclube

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived ───────────────────────────────────────────────────────

  const subclubs = data?.subclubs || [];
  const subclub = subclubs.find((s) => s.name === activeSubclub) || subclubs[0] || null;
  const subclubName = subclub?.name || '';

  const weekEnd = useMemo(() => {
    const ws = data?.settlement?.week_start;
    if (!ws) return undefined;
    const d = new Date(ws + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  }, [data?.settlement?.week_start]);

  const conciliacaoAgents = useMemo(
    () => (subclub?.agents || []).map((a) => ({ agent_id: a.agent_id || a.id, agent_name: a.agent_name })),
    [subclub?.agents],
  );
  const conciliacaoPlayers = useMemo(
    () => (subclub?.players || []).map((p) => ({ external_player_id: p.external_player_id || null, nickname: p.nickname || null })),
    [subclub?.players],
  );
  const subclubEntityIds = useMemo(
    () => buildSubclubEntityIds(subclub?.agents || [], subclub?.players || []),
    [subclub?.agents, subclub?.players],
  );

  // Keyboard shortcuts 1-9
  const tabList = getVisibleTabList(hasPermission);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= tabList.length) {
        e.preventDefault();
        const targetTab = tabList[num - 1];
        if (targetTab && targetTab !== activeTab) {
          handleTabChange(targetTab);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tabList, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ──────────────────────────────────────────────────────

  function handleTabChange(tab: string) {
    const p = new URLSearchParams();
    p.set('tab', tab);
    if (activeSubclub) p.set('subclub', activeSubclub);
    router.push(`/clubs/${clubId}?${p.toString()}`, { scroll: false });
  }

  function handleSubclubChange(name: string) {
    setActiveSubclub(name);
    const p = new URLSearchParams();
    p.set('tab', activeTab);
    p.set('subclub', name);
    router.push(`/clubs/${clubId}?${p.toString()}`, { scroll: false });
  }

  function handleWeekFound(newSettlementId: string, weekStart: string) {
    setWeekNotFound(false);
    setSettlementId(newSettlementId);
    setSelectedWeek(weekStart);
  }

  function handleWeekNotFound() {
    setWeekNotFound(true);
  }

  // ─── Tab content ───────────────────────────────────────────────────

  function renderContent() {
    if (!data || !subclub || !settlementId) return null;
    const { settlement, fees } = data;

    switch (activeTab) {
      case 'resumo':
        return (
          <TabErrorBoundary tabName="Resumo do Clube">
            <ResumoClube
              subclub={subclub}
              fees={fees}
              weekStart={settlement.week_start}
              weekEnd={weekEnd}
              logoUrl={logoMap[normalizeKey(subclubName)] || null}
              whatsappGroupLink={whatsappLinkMap[normalizeKey(subclubName)] || null}
            />
          </TabErrorBoundary>
        );
      case 'detalhamento':
        return <TabErrorBoundary tabName="Detalhamento"><Detalhamento subclub={subclub} /></TabErrorBoundary>;
      case 'dashboard':
        return <TabErrorBoundary tabName="Dashboard"><DashboardClube subclub={subclub} fees={fees} settlementId={settlementId} subclubName={subclubName} /></TabErrorBoundary>;
      case 'jogadores':
        return <TabErrorBoundary tabName="Jogadores"><Jogadores subclub={subclub} /></TabErrorBoundary>;
      case 'ajustes':
        return (
          <TabErrorBoundary tabName="Ajustes">
            <Ajustes subclub={subclub} weekStart={settlement.week_start} settlementStatus={settlement.status} onDataChange={loadData} />
          </TabErrorBoundary>
        );
      case 'dre':
        return <TabErrorBoundary tabName="DRE"><DRE subclub={subclub} fees={fees} weekStart={settlement.week_start} /></TabErrorBoundary>;
      case 'liga':
        return <TabErrorBoundary tabName="Liga"><Liga subclubs={subclubs} currentSubclubName={subclub.name} logoMap={logoMap} weekStart={settlement.week_start} weekEnd={weekEnd} /></TabErrorBoundary>;
      case 'caixa':
        return (
          <TabErrorBoundary tabName="Caixa">
            <Caixa weekStart={settlement.week_start} clubId={subclub.id} subclub={subclub} fees={fees} settlementStatus={settlement.status} onDataChange={loadData} />
          </TabErrorBoundary>
        );
      case 'conciliacao':
        return (
          <TabErrorBoundary tabName="Conciliacao">
            <Conciliacao
              weekStart={settlement.week_start}
              clubId={subclub.id}
              clubName={subclub.name}
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
            <Rakeback subclub={subclub} weekStart={settlement.week_start} fees={fees} settlementId={settlementId} settlementStatus={settlement.status} onDataChange={loadData} />
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
              logoUrl={logoMap[normalizeKey(subclubName)] || null}
              settlementId={settlementId}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      default:
        return <div className="flex items-center justify-center py-20 text-dark-400">Tab nao encontrada: {activeTab}</div>;
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="p-4 lg:p-8 max-w-7xl animate-tab-fade">
        <div className="mb-4">
          <div className="h-5 skeleton-shimmer w-20 mb-3" />
          <div className="h-7 skeleton-shimmer w-64 mb-2" />
          <div className="h-4 skeleton-shimmer w-40" />
        </div>
        <KpiSkeleton count={4} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl">
        <Link href="/clubs" className="text-dark-400 hover:text-white text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="card">
          <EmptyState
            icon={AlertCircle}
            title="Erro ao carregar clube"
            description={error}
            action={{ label: 'Tentar novamente', onClick: loadData }}
          />
        </div>
      </div>
    );
  }

  if (!data || !settlementId) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl">
        <Link href="/clubs" className="text-dark-400 hover:text-white text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="card">
          <EmptyState
            icon={AlertCircle}
            title="Nenhum fechamento encontrado"
            description="Importe uma planilha para criar o primeiro fechamento deste clube."
            action={{ label: 'Importar Planilha', onClick: () => router.push('/import') }}
          />
        </div>
      </div>
    );
  }

  const status = data.settlement.status;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
      {/* ── Club Header ──────────────────────────────────────────────── */}
      <div className="bg-dark-900 border-b border-dark-700 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/clubs" className="text-dark-400 hover:text-white transition-colors" title="Voltar">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-lg font-bold text-white">{clubName}</h1>
            {platform && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-dark-700/30 text-dark-400 border-dark-600/30">
                {PLATFORM_LABELS[platform] || platform}
              </span>
            )}
          </div>

          {/* Week selector with date pickers */}
          <WeekSelector
            currentSettlementId={settlementId}
            weekStart={data.settlement.week_start}
            weekEnd={weekEnd || data.settlement.week_start}
            status={status}
            clubId={clubId}
            onWeekFound={handleWeekFound}
            onNotFound={handleWeekNotFound}
          />

          {/* Subclub chips */}
          {subclubs.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {subclubs.map((sub) => (
                <button
                  key={sub.name}
                  onClick={() => handleSubclubChange(sub.name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    activeSubclub === sub.name
                      ? 'bg-poker-600/20 text-poker-400 border border-poker-500/30'
                      : 'bg-dark-800 text-dark-400 border border-dark-700 hover:border-dark-500'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          )}

          {/* Finalize button */}
          {status === 'DRAFT' && (
            <button
              onClick={() => setShowLockModal(true)}
              className="btn-primary text-xs px-4 py-1.5"
            >
              Finalizar Semana
            </button>
          )}
        </div>
      </div>

      {/* ── Content: Sidebar + Tab Panel ─────────────────────────────── */}
      {weekNotFound ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-dark-600 mx-auto mb-3" />
            <p className="text-dark-400 text-sm">Nenhum fechamento para as datas selecionadas.</p>
            <p className="text-dark-500 text-xs mt-1">Use o seletor de datas acima para escolher outra semana.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Tab nav sidebar (desktop) */}
          <div className="hidden lg:block">
            <SubNavTabs activeTab={activeTab} onTabChange={handleTabChange} />
          </div>

          {/* Mobile tab bar */}
          <div className="lg:hidden overflow-x-auto border-b border-dark-700 bg-dark-900/50 shrink-0">
            <div className="flex px-2 py-1.5 gap-1">
              {tabList.map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? 'bg-poker-600/15 text-poker-400'
                      : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto" role="tabpanel">
            <div className="animate-tab-fade">
              {renderContent()}
            </div>
          </div>
        </div>
      )}

      {/* Lock modal */}
      {showLockModal && settlementId && (
        <LockWeekModal
          show={showLockModal}
          settlementId={settlementId}
          weekStart={data.settlement.week_start}
          notes={data.settlement.notes || ''}
          subclubs={subclubs}
          onClose={() => setShowLockModal(false)}
          onSuccess={() => { setShowLockModal(false); loadData(); }}
        />
      )}
    </div>
  );
}
