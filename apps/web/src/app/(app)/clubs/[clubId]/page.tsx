'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/lib/usePageTitle';
import { getOrgTree, listSettlements } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/Toast';
import ClubLogo from '@/components/ClubLogo';
import KpiCard from '@/components/ui/KpiCard';
import KpiSkeleton from '@/components/ui/KpiSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import { ArrowLeft, Settings, AlertCircle, ArrowRight, Layers } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

interface SubclubCard {
  id: string;
  name: string;
  sigla: string;
  logoUrl: string | null;
  playerCount: number;
  agentCount: number;
}

interface ClubInfo {
  id: string;
  name: string;
  platform: string;
  externalId: string | null;
  logoUrl: string | null;
  ligaId: string | null;
}

export default function ClubEntryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  useAuth();

  const clubId = params.clubId as string;

  const [club, setClub] = useState<ClubInfo | null>(null);
  const [subclubes, setSubclubes] = useState<SubclubCard[]>([]);
  const [latestSettlementId, setLatestSettlementId] = useState<string | null>(null);
  const [latestWeekStart, setLatestWeekStart] = useState<string>('');
  const [loading, setLoading] = useState(true);

  usePageTitle(club?.name || 'Clube');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, settRes] = await Promise.all([getOrgTree(), listSettlements(clubId)]);

      // Find club in org tree
      let clubInfo: ClubInfo | null = null;
      const subs: SubclubCard[] = [];
      if (treeRes.success && treeRes.data) {
        const found = treeRes.data.find((c: any) => c.id === clubId);
        if (found) {
          clubInfo = {
            id: found.id,
            name: found.name,
            platform: (found.metadata?.platform || '').toLowerCase(),
            externalId: found.external_id || null,
            logoUrl: found.logo_url || found.metadata?.logo_url || null,
            ligaId: found.metadata?.liga_id || null,
          };
          for (const s of found.subclubes || []) {
            subs.push({
              id: s.id,
              name: s.name,
              sigla: s.external_id || s.name,
              logoUrl: s.logo_url || s.metadata?.logo_url || null,
              playerCount: s.player_count || 0,
              agentCount: s.agents?.length || 0,
            });
          }
        }
      }
      setClub(clubInfo);
      setSubclubes(subs);

      // Find latest settlement
      let latestId: string | null = null;
      let latestWS = '';
      if (settRes.success && settRes.data) {
        const valid = (settRes.data as any[]).filter((s: any) => s.status !== 'VOID');
        if (valid.length > 0) {
          latestId = valid[0].id;
          latestWS = valid[0].week_start;
        }
      }
      setLatestSettlementId(latestId);
      setLatestWeekStart(latestWS);

      // AUTO-REDIRECT: No subclubes → go straight to fechamento
      if (subs.length <= 1 && latestId) {
        router.replace(`/s/${latestId}`);
        return;
      }
    } catch {
      toast('Erro ao carregar clube', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubId, router, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPIs
  const totalPlayers = useMemo(() => subclubes.reduce((sum, s) => sum + s.playerCount, 0), [subclubes]);
  const totalAgents = useMemo(() => subclubes.reduce((sum, s) => sum + s.agentCount, 0), [subclubes]);

  // Loading
  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl animate-tab-fade">
        <div className="mb-4">
          <div className="h-5 skeleton-shimmer w-32 mb-3" />
          <div className="h-7 skeleton-shimmer w-64 mb-2" />
          <div className="h-4 skeleton-shimmer w-48" />
        </div>
        <KpiSkeleton count={4} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 skeleton-shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // No club found
  if (!club) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl">
        <Link href="/clubs" className="text-dark-400 hover:text-white text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="card">
          <EmptyState icon={AlertCircle} title="Clube nao encontrado" description="Verifique o ID do clube." />
        </div>
      </div>
    );
  }

  // No settlement found
  if (!latestSettlementId) {
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

  // Has subclubes → show cards
  return (
    <div className="p-4 lg:p-8 max-w-5xl animate-tab-fade">
      {/* Back link */}
      <Link href="/clubs" className="text-dark-400 hover:text-white text-sm flex items-center gap-1.5 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Voltar para Meus Clubes
      </Link>

      {/* Club header */}
      <div className="flex items-center gap-4 mb-6">
        <ClubLogo logoUrl={club.logoUrl} name={club.name} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{club.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-dark-400">
            {club.platform && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-dark-700/30 text-dark-400 border-dark-600/30">
                {PLATFORM_LABELS[club.platform] || club.platform}
              </span>
            )}
            {club.externalId && <span className="font-mono">ID: {club.externalId}</span>}
            {club.ligaId && <span>Liga: {club.ligaId}</span>}
            {latestWeekStart && <span>Semana: {latestWeekStart}</span>}
          </div>
        </div>
        <Link
          href={`/clubs/${clubId}/config`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-500 hover:text-white transition-all shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          Configurar
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Jogadores" value={String(totalPlayers)} />
        <KpiCard label="Agentes" value={String(totalAgents)} />
        <KpiCard label="Subclubes" value={String(subclubes.length)} />
        <KpiCard label="Semana" value={latestWeekStart} />
      </div>

      {/* Subclubes section */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white mb-1">Subclubes</h2>
        <p className="text-xs text-dark-400">Selecione um subclube para ver o fechamento</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {subclubes.map((sub) => (
          <Link
            key={sub.id}
            href={`/s/${latestSettlementId}/club/${encodeURIComponent(sub.name)}`}
            className="group bg-dark-900 border border-dark-700 rounded-xl p-4 hover:border-poker-600/50 hover:shadow-glow-green transition-all duration-200"
          >
            <div className="flex items-center gap-3 mb-2">
              <ClubLogo logoUrl={sub.logoUrl} name={sub.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate group-hover:text-poker-400 transition-colors">
                  {sub.name}
                </div>
                {sub.sigla !== sub.name && (
                  <div className="text-[10px] text-dark-500">Sigla: {sub.sigla}</div>
                )}
              </div>
            </div>
            <div className="text-xs text-dark-400 mb-2">
              {sub.playerCount} jogadores · {sub.agentCount} agentes
            </div>
            <div className="text-xs text-poker-400 font-medium group-hover:text-poker-300 transition-colors">
              Entrar <ArrowRight className="w-3 h-3 inline" />
            </div>
          </Link>
        ))}
      </div>

      {/* Consolidated link */}
      <Link
        href={`/s/${latestSettlementId}`}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/15 transition-all"
      >
        <Layers className="w-4 h-4" />
        Ver fechamento consolidado (todos subclubes)
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
