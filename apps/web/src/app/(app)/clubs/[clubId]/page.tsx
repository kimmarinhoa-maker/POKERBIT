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
import type { SettlementFullResponse } from '@/types/settlement';
import { buildSubclubEntityIds } from '@/lib/subclubEntityIds';

import ClubNavTabs from '@/components/club/ClubNavTabs';
import ClubDashboard from '@/components/club/ClubDashboard';
import ClubFechamentos from '@/components/club/ClubFechamentos';
import ClubSubclubes from '@/components/club/ClubSubclubes';
import ClubDadosClube from '@/components/club/ClubDadosClube';
import ClubTaxas from '@/components/club/ClubTaxas';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import WeekSelector from '@/components/WeekSelector';
import ClubLogo from '@/components/ClubLogo';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import TabSkeleton from '@/components/ui/TabSkeleton';
import TabErrorBoundary from '@/components/ui/TabErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import { ArrowLeft, AlertCircle, ChevronRight } from 'lucide-react';

// ─── Settlement tab components (lazy) ────────────────────────────────
import ResumoClube from '@/components/settlement/ResumoClube';
const Detalhamento = dynamic(() => import('@/components/settlement/Detalhamento'), { loading: () => <TabSkeleton />, ssr: false });
const Jogadores = dynamic(() => import('@/components/settlement/Jogadores'), { loading: () => <TabSkeleton />, ssr: false });
const Ajustes = dynamic(() => import('@/components/settlement/Ajustes'), { loading: () => <TabSkeleton />, ssr: false });
const DRE = dynamic(() => import('@/components/settlement/DRE'), { loading: () => <TabSkeleton />, ssr: false });
const Liga = dynamic(() => import('@/components/settlement/Liga'), { loading: () => <TabSkeleton />, ssr: false });
const Caixa = dynamic(() => import('@/components/settlement/Caixa'), { loading: () => <TabSkeleton />, ssr: false });
const Rakeback = dynamic(() => import('@/components/settlement/Rakeback'), { loading: () => <TabSkeleton />, ssr: false });
const Conciliacao = dynamic(() => import('@/components/settlement/Conciliacao'), { loading: () => <TabSkeleton />, ssr: false });
const Comprovantes = dynamic(() => import('@/components/settlement/Comprovantes'), { loading: () => <TabSkeleton />, ssr: false });

// ─── Config components (lazy) ────────────────────────────────────────
const ConfigPagamentos = dynamic(() => import('@/components/config/ConfigPagamentos'), { loading: () => <TabSkeleton />, ssr: false });
const ConfigCategorias = dynamic(() => import('@/components/config/ConfigCategorias'), { loading: () => <TabSkeleton />, ssr: false });

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

// Settlement horizontal tabs for the fechamento view
const SETTLEMENT_TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'detalhamento', label: 'Detalhamento' },
  { key: 'rakeback', label: 'Rakeback' },
  { key: 'comprovantes', label: 'Comprovantes' },
  { key: 'caixa-s', label: 'Caixa' },
  { key: 'conciliacao-s', label: 'Conciliacao' },
  { key: 'dre-s', label: 'DRE' },
  { key: 'ajustes', label: 'Ajustes' },
  { key: 'jogadores-s', label: 'Jogadores' },
  { key: 'liga-s', label: 'Liga' },
];

export default function ClubHubPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { toast } = useToast();

  const clubId = params.clubId as string;
  const requestedTab = searchParams.get('tab') || 'dashboard';
  const requestedSubclub = searchParams.get('subclub') || '';
  const requestedSettlementTab = searchParams.get('stab') || 'resumo';

  // Active club tab (15 tabs)
  const activeTab = requestedTab;

  // Settlement mode: when inside a specific fechamento
  const [settlementMode, setSettlementMode] = useState(false);
  const [activeSettlementTab, setActiveSettlementTab] = useState(requestedSettlementTab);

  const [data, setData] = useState<SettlementFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);

  // Settlements for this club
  const [settlements, setSettlements] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [weekNotFound, setWeekNotFound] = useState(false);

  // Subclub selector
  const [activeSubclub, setActiveSubclub] = useState<string>(requestedSubclub);

  // Maps from org tree
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  const [whatsappLinkMap, setWhatsappLinkMap] = useState<Record<string, string | null>>({});
  const [chippixManagerMap, setChippixManagerMap] = useState<Record<string, string>>({});
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);

  // Persist subclub selection
  useEffect(() => {
    if (activeSubclub) {
      localStorage.setItem(`club-${clubId}-subclub`, activeSubclub);
    } else {
      localStorage.removeItem(`club-${clubId}-subclub`);
    }
  }, [activeSubclub, clubId]);

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
    setSettlementId(null);
    setData(null);
    setSettlements([]);
    setSelectedWeek('');
    setError(null);
    setSettlementMode(false);

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
          if (club.id === clubId) {
            setClubLogoUrl(club.logo_url || club.metadata?.logo_url || null);
          }
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
  }, [settlementId, clubId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived ───────────────────────────────────────────────────────
  const subclubs = data?.subclubs || [];
  const subclub = subclubs.find((s) => s.name === activeSubclub) || subclubs[0] || null;
  const subclubName = subclub?.name || '';
  const hasSubclubes = subclubs.length > 1;

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

  // ─── Handlers ──────────────────────────────────────────────────────
  function handleClubTabChange(tab: string) {
    setSettlementMode(false);
    const p = new URLSearchParams();
    p.set('tab', tab);
    if (activeSubclub) p.set('subclub', activeSubclub);
    router.push(`/clubs/${clubId}?${p.toString()}`, { scroll: false });
  }

  function handleSubclubChange(name: string) {
    setActiveSubclub(name);
  }

  function handleWeekFound(newSettlementId: string, weekStart: string) {
    setWeekNotFound(false);
    setSettlementId(newSettlementId);
    setSelectedWeek(weekStart);
  }

  function handleWeekNotFound() {
    setWeekNotFound(true);
  }

  function handleOpenSettlement(id: string, weekStart: string) {
    setSettlementId(id);
    setSelectedWeek(weekStart);
    setSettlementMode(true);
    setActiveSettlementTab('resumo');
  }

  function handleSettlementTabChange(tab: string) {
    setActiveSettlementTab(tab);
  }

  function handleBackFromSettlement() {
    setSettlementMode(false);
    handleClubTabChange('fechamentos');
  }

  function formatWeekShort(ws: string) {
    const d = new Date(ws + 'T00:00:00');
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(d)} - ${fmt(end)}`;
  }

  // ─── Shared settlement tab renderer (used by both settlement mode and club tabs) ──
  function renderSettlementTab(tabKey: string) {
    if (!data || !subclub || !settlementId) return null;
    const { settlement, fees } = data;
    const logoUrl = subclubName ? logoMap[normalizeKey(subclubName)] || null : null;
    const waLink = subclubName ? whatsappLinkMap[normalizeKey(subclubName)] || null : null;
    const cpManagerId = chippixManagerMap[subclub.id] || (subclubName ? chippixManagerMap[normalizeKey(subclub.name)] : null) || null;

    switch (tabKey) {
      case 'resumo':
        return <TabErrorBoundary tabName="Resumo"><ResumoClube subclub={subclub} fees={fees} weekStart={settlement.week_start} weekEnd={weekEnd} logoUrl={logoUrl} whatsappGroupLink={waLink} /></TabErrorBoundary>;
      case 'detalhamento':
      case 'agentes':
        return <TabErrorBoundary tabName="Detalhamento"><Detalhamento subclub={subclub} /></TabErrorBoundary>;
      case 'rakeback':
        return <TabErrorBoundary tabName="Rakeback"><Rakeback subclub={subclub} weekStart={settlement.week_start} fees={fees} settlementId={settlementId} settlementStatus={settlement.status} onDataChange={loadData} /></TabErrorBoundary>;
      case 'comprovantes':
        return <TabErrorBoundary tabName="Comprovantes"><Comprovantes subclub={subclub} weekStart={settlement.week_start} clubId={settlement.club_id} clubExternalId={settlement.organizations?.external_id} fees={fees} logoUrl={logoUrl} settlementId={settlementId} settlementStatus={settlement.status} onDataChange={loadData} /></TabErrorBoundary>;
      case 'caixa':
      case 'caixa-s':
        return <TabErrorBoundary tabName="Caixa"><Caixa weekStart={settlement.week_start} clubId={subclub.id} subclub={subclub} fees={fees} settlementStatus={settlement.status} onDataChange={loadData} /></TabErrorBoundary>;
      case 'conciliacao':
      case 'conciliacao-s':
        return <TabErrorBoundary tabName="Conciliacao"><Conciliacao weekStart={settlement.week_start} clubId={subclub.id} clubName={subclub.name} chippixManagerId={cpManagerId} settlementStatus={settlement.status} onDataChange={loadData} agents={conciliacaoAgents} players={conciliacaoPlayers} subclubEntityIds={subclubEntityIds} /></TabErrorBoundary>;
      case 'dre':
      case 'dre-s':
        return <TabErrorBoundary tabName="DRE"><DRE subclub={subclub} fees={fees} weekStart={settlement.week_start} /></TabErrorBoundary>;
      case 'ajustes':
        return <TabErrorBoundary tabName="Ajustes"><Ajustes subclub={subclub} weekStart={settlement.week_start} settlementStatus={settlement.status} onDataChange={loadData} /></TabErrorBoundary>;
      case 'jogadores':
      case 'jogadores-s':
        return <TabErrorBoundary tabName="Jogadores"><Jogadores subclub={subclub} /></TabErrorBoundary>;
      case 'liga':
      case 'liga-s':
        return <TabErrorBoundary tabName="Liga"><Liga subclubs={subclubs} currentSubclubName={subclub.name} logoMap={logoMap} weekStart={settlement.week_start} weekEnd={weekEnd} /></TabErrorBoundary>;
      default:
        return null;
    }
  }

  // ─── Settlement tab content (settlement mode) ─────────────────────
  function renderSettlementContent() {
    return renderSettlementTab(activeSettlementTab);
  }

  // ─── Club tab content (non-settlement) ──────────────────────────────
  function renderClubContent() {
    switch (activeTab) {
      case 'dashboard':
        if (!data) return null;
        return <ClubDashboard data={data} subclubs={subclubs} activeSubclub={activeSubclub} onSubclubClick={handleSubclubChange} />;
      case 'fechamentos':
        return <ClubFechamentos settlements={settlements} currentSettlementId={settlementId} onSelectSettlement={handleOpenSettlement} />;
      case 'subclubes':
        return <ClubSubclubes clubId={clubId} />;
      case 'dados':
        return <ClubDadosClube clubId={clubId} />;
      case 'taxas':
        return <ClubTaxas clubId={clubId} />;
      case 'pagamentos':
        return <div className="p-4 lg:p-6 animate-tab-fade"><ConfigPagamentos /></div>;
      case 'categorias':
        return <div className="p-4 lg:p-6 animate-tab-fade"><ConfigCategorias /></div>;
      default:
        // Settlement-based tabs (agentes, jogadores, caixa, conciliacao, dre, comprovantes, liga, rakeback)
        return renderSettlementTab(activeTab);
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
          <EmptyState icon={AlertCircle} title="Erro ao carregar clube" description={error} action={{ label: 'Tentar novamente', onClick: loadData }} />
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
          <EmptyState icon={AlertCircle} title="Nenhum fechamento encontrado" description="Importe uma planilha para criar o primeiro fechamento deste clube." action={{ label: 'Importar Planilha', onClick: () => router.push('/import') }} />
        </div>
      </div>
    );
  }

  const status = data.settlement.status;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
      {/* ── Club Header ──────────────────────────────────────────────── */}
      <div className="bg-dark-900 border-b border-dark-700 px-4 lg:px-6 py-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/clubs" className="text-dark-400 hover:text-white transition-colors" title="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <ClubLogo logoUrl={clubLogoUrl} name={clubName} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white truncate">{clubName}</h1>
              {platform && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-dark-700/30 text-dark-400 border-dark-600/30 shrink-0">
                  {PLATFORM_LABELS[platform] || platform}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-dark-500 mt-0.5">
              {data.settlement.organizations?.external_id && (
                <span className="font-mono">ID: {data.settlement.organizations.external_id}</span>
              )}
              <span>Semana: {selectedWeek}</span>
            </div>
          </div>

          {/* Subclub chips */}
          {hasSubclubes && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => handleSubclubChange('')}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  !activeSubclub
                    ? 'bg-dark-600/30 text-white border border-dark-500'
                    : 'bg-dark-800 text-dark-400 border border-dark-700 hover:border-dark-500'
                }`}
              >
                Todos
              </button>
              {subclubs.map((sub) => (
                <button
                  key={sub.name}
                  onClick={() => handleSubclubChange(sub.name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    activeSubclub === sub.name
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-dark-800 text-dark-400 border border-dark-700 hover:border-dark-500'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settlement Mode: Breadcrumb + Horizontal tabs ──────────── */}
      {settlementMode && (
        <>
          {/* Breadcrumb */}
          <div className="px-4 lg:px-6 py-2 bg-dark-900/50 border-b border-dark-700/50 flex items-center gap-2 text-xs shrink-0">
            <button onClick={() => handleClubTabChange('dashboard')} className="text-dark-500 hover:text-dark-300">Meus Clubes</button>
            <ChevronRight className="w-3 h-3 text-dark-600" />
            <button onClick={handleBackFromSettlement} className="text-dark-500 hover:text-dark-300">{clubName}</button>
            <ChevronRight className="w-3 h-3 text-dark-600" />
            <span className="text-white font-medium">Fechamento {formatWeekShort(selectedWeek)}</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              status === 'FINAL' ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              {status === 'FINAL' ? 'FINAL' : 'RASCUNHO'}
            </span>
            {status === 'DRAFT' && (
              <button onClick={() => setShowLockModal(true)} className="ml-auto btn-primary text-xs px-3 py-1">
                Finalizar
              </button>
            )}
          </div>

          {/* Week Selector */}
          <div className="px-4 lg:px-6 py-2 bg-dark-900/30 border-b border-dark-700/50 shrink-0">
            <WeekSelector
              currentSettlementId={settlementId}
              weekStart={data.settlement.week_start}
              weekEnd={weekEnd || data.settlement.week_start}
              status={status}
              clubId={clubId}
              onWeekFound={handleWeekFound}
              onNotFound={handleWeekNotFound}
            />
          </div>

          {/* Horizontal settlement tabs */}
          <div className="border-b border-dark-700 bg-dark-900/50 shrink-0 overflow-x-auto">
            <div className="flex px-4 lg:px-6 gap-0">
              {SETTLEMENT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleSettlementTabChange(tab.key)}
                  className={`px-3 lg:px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                    activeSettlementTab === tab.key
                      ? 'text-poker-400 border-poker-500'
                      : 'text-dark-400 border-transparent hover:text-dark-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Settlement content */}
          {weekNotFound ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">Nenhum fechamento para as datas selecionadas.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto" role="tabpanel">
              <div className="animate-tab-fade">
                {renderSettlementContent()}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Normal Club Mode: Sidebar + Content ────────────────────── */}
      {!settlementMode && (
        <div className="flex flex-1 overflow-hidden">
          {/* Club nav sidebar (desktop) */}
          <div className="hidden lg:block">
            <ClubNavTabs activeTab={activeTab} onTabChange={handleClubTabChange} hasSubclubes={hasSubclubes} />
          </div>

          {/* Mobile tab bar */}
          <div className="lg:hidden overflow-x-auto border-b border-dark-700 bg-dark-900/50 shrink-0">
            <div className="flex px-2 py-1.5 gap-1">
              {['dashboard', 'fechamentos', 'jogadores', 'caixa', 'comprovantes', 'dre', 'taxas', 'dados'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleClubTabChange(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab ? 'bg-poker-600/15 text-poker-400' : 'text-dark-400 hover:text-dark-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" role="tabpanel">
            <div className="animate-tab-fade">
              {renderClubContent()}
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
