'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/lib/usePageTitle';
import dynamic from 'next/dynamic';
import { getSettlementFull, getOrgTree } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { getVisibleTabKeys } from '@/components/settlement/SubNavTabs';
import CardSkeleton from '@/components/ui/CardSkeleton';
import TabSkeleton from '@/components/ui/TabSkeleton';
import TabErrorBoundary from '@/components/ui/TabErrorBoundary';

import SubNavTabs from '@/components/settlement/SubNavTabs';
import LockWeekModal from '@/components/settlement/LockWeekModal';
import WeekSelector from '@/components/WeekSelector';

// ─── Tabs leves (import estático) ────────────────────────────────────
import ResumoClube from '@/components/settlement/ResumoClube';
import Detalhamento from '@/components/settlement/Detalhamento';
import Jogadores from '@/components/settlement/Jogadores';
import Ajustes from '@/components/settlement/Ajustes';
import DRE from '@/components/settlement/DRE';
import Liga from '@/components/settlement/Liga';
import Extrato from '@/components/settlement/Extrato';
import Liquidacao from '@/components/settlement/Liquidacao';
import DashboardClube from '@/components/settlement/DashboardClube';

// ─── Tabs pesadas (code-split com dynamic import) ────────────────────
const Rakeback = dynamic(() => import('@/components/settlement/Rakeback'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const Comprovantes = dynamic(() => import('@/components/settlement/Comprovantes'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const Conciliacao = dynamic(() => import('@/components/settlement/Conciliacao'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

export default function SubclubPanelPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccess, role } = useAuth();

  const settlementId = params.settlementId as string;
  const subclubId = decodeURIComponent(params.subclubId as string);
  const requestedTab = searchParams.get('tab') || 'resumo';
  // Fallback: if requested tab is not visible for this role, redirect to 'resumo'
  const visibleTabs = getVisibleTabKeys(role);
  const activeTab = visibleTabs.has(requestedTab) ? requestedTab : 'resumo';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [weekNotFound, setWeekNotFound] = useState(false);
  const [logoMap, setLogoMap] = useState<Record<string, string | null>>({});
  const fetchedTabs = useRef(new Set([activeTab]));
  usePageTitle(subclubId || 'Subclube');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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

  async function handleFinalize() {
    setShowLockModal(true);
  }

  function handleTabChange(tab: string) {
    if (!fetchedTabs.current.has(tab)) {
      fetchedTabs.current.add(tab);
    }
    router.push(`/s/${settlementId}/club/${encodeURIComponent(subclubId)}?tab=${tab}`);
  }

  // ─── Loading (skeleton em vez de spinner) ────────────────────────
  if (loading) {
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
        <div className="card text-center py-16">
          <p className="text-red-400 mb-4">{error || 'Settlement nao encontrado'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-secondary text-sm">
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { settlement, fees, subclubs } = data;

  // Find current subclub
  const currentSubclub = subclubs.find((sc: any) => sc.name === subclubId || sc.id === subclubId);

  if (!currentSubclub) {
    return (
      <div className="p-8">
        <div className="card text-center py-16">
          <p className="text-red-400 mb-4">Subclube &quot;{subclubId}&quot; nao encontrado</p>
          <button onClick={() => router.push(`/s/${settlementId}`)} className="btn-secondary text-sm">
            Voltar para Semana
          </button>
        </div>
      </div>
    );
  }

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
              subclub={currentSubclub}
              fees={fees}
              weekStart={settlement.week_start}
              weekEnd={weekEnd}
              logoUrl={logoMap[subclubId.toLowerCase()] || null}
            />
          </TabErrorBoundary>
        );
      case 'detalhamento':
        return <TabErrorBoundary tabName="Detalhamento"><Detalhamento subclub={currentSubclub} /></TabErrorBoundary>;
      case 'dashboard':
        return <TabErrorBoundary tabName="Dashboard"><DashboardClube subclub={currentSubclub} fees={fees} /></TabErrorBoundary>;
      case 'jogadores':
        return <TabErrorBoundary tabName="Jogadores"><Jogadores subclub={currentSubclub} weekStart={settlement.week_start} clubId={settlement.club_id} /></TabErrorBoundary>;

      // Tabs funcionais
      case 'ajustes':
        return (
          <TabErrorBoundary tabName="Ajustes">
            <Ajustes
              subclub={currentSubclub}
              weekStart={settlement.week_start}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );
      case 'dre':
        return <TabErrorBoundary tabName="DRE"><DRE subclub={currentSubclub} fees={fees} /></TabErrorBoundary>;
      case 'liga':
        return <TabErrorBoundary tabName="Liga"><Liga subclubs={subclubs} currentSubclubName={currentSubclub.name} logoMap={logoMap} /></TabErrorBoundary>;
      case 'extrato':
        return (
          <TabErrorBoundary tabName="Extrato">
            <Extrato weekStart={settlement.week_start} settlementStatus={settlement.status} onDataChange={loadData} />
          </TabErrorBoundary>
        );
      case 'liquidacao':
        return (
          <TabErrorBoundary tabName="Liquidacao">
            <Liquidacao
              subclub={currentSubclub}
              weekStart={settlement.week_start}
              clubId={settlement.club_id}
              settlementId={settlementId}
              settlementStatus={settlement.status}
              onDataChange={loadData}
            />
          </TabErrorBoundary>
        );

      case 'rakeback':
        return (
          <TabErrorBoundary tabName="Rakeback">
            <Rakeback
              subclub={currentSubclub}
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
              subclub={currentSubclub}
              weekStart={settlement.week_start}
              clubId={settlement.club_id}
              fees={fees}
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
              agents={(currentSubclub.agents || []).map((a: any) => ({ agent_id: a.agent_id, agent_name: a.agent_name }))}
              players={(currentSubclub.players || []).map((p: any) => ({
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
      <div className="flex items-center justify-between px-6 py-3 bg-dark-900/80 border-b border-dark-700 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/s/${settlementId}`)}
            className="text-dark-400 hover:text-dark-200 text-sm flex items-center gap-1 transition-colors"
            aria-label="Voltar para visao geral"
          >
            ← Voltar
          </button>
          <div className="h-4 w-px bg-dark-700" />
          <WeekSelector
            currentSettlementId={settlementId}
            weekStart={settlement.week_start}
            weekEnd={weekEnd || ''}
            status={settlement.status}
            onNotFound={() => setWeekNotFound(true)}
          />
          <span className="text-dark-500 text-xs">v{settlement.version}</span>
          <div className="h-4 w-px bg-dark-700" />
          <select
            value={currentSubclub.name}
            onChange={(e) => {
              router.push(`/s/${settlementId}/club/${encodeURIComponent(e.target.value)}?tab=${activeTab}`);
            }}
            className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-white font-medium focus:border-poker-500 focus:outline-none cursor-pointer"
            aria-label="Selecionar subclube"
          >
            {subclubs.map((sc: any) => (
              <option key={sc.id || sc.name} value={sc.name}>
                {sc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {settlement.status === 'DRAFT' && canAccess('OWNER', 'ADMIN') && (
            <button onClick={handleFinalize} className="btn-primary text-sm flex items-center gap-2">
              Finalizar Semana
            </button>
          )}
        </div>
      </div>

      {/* 2-column layout */}
      {weekNotFound ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center bg-dark-950/30">
          <h2 className="text-xl font-bold text-white mb-2">Nenhum fechamento encontrado</h2>
          <p className="text-dark-400">Nao existe fechamento importado para o periodo selecionado.</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Col 1: Sub-nav tabs */}
          <SubNavTabs activeTab={activeTab} onTabChange={handleTabChange} />

          {/* Col 2: Content area */}
          <div className="flex-1 overflow-y-auto p-6 bg-dark-950/30">{renderContent()}</div>
        </div>
      )}
    </div>
  );
}
