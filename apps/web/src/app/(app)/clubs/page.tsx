'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { listSettlements, getOrgTree } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/ui/EmptyState';
import ClubLogo from '@/components/ClubLogo';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Building2, ArrowRight, Users, UserCheck, Network } from 'lucide-react';

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

const PLATFORM_COLORS: Record<string, string> = {
  suprema: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  pppoker: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  clubgg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const PLATFORM_ACCENT: Record<string, string> = {
  suprema: 'bg-amber-500',
  pppoker: 'bg-blue-500',
  clubgg: 'bg-purple-500',
};

interface SubclubInfo {
  name: string;
  playerCount?: number;
}

interface ClubCard {
  clubId: string;
  clubName: string;
  platform: string;
  externalId: string | null;
  latestSettlementId: string;
  weekStart: string;
  status: string;
  logoUrl: string | null;
  subclubes: SubclubInfo[];
  totalPlayers: number;
  totalAgents: number;
}

export default function MeusClubesPage() {
  usePageTitle('Meus Clubes');
  useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadClubs = useCallback(async () => {
    try {
      const [settRes, treeRes] = await Promise.all([listSettlements(), getOrgTree()]);

      const logoMap = new Map<string, string | null>();
      const subclubMap = new Map<string, SubclubInfo[]>();
      const agentCountMap = new Map<string, number>();
      const playerCountMap = new Map<string, number>();
      if (treeRes.success && treeRes.data) {
        for (const club of treeRes.data) {
          logoMap.set(club.id, club.logo_url || club.metadata?.logo_url || null);
          let totalAgents = 0;
          let totalPlayers = 0;
          const subs: SubclubInfo[] = (club.subclubes || []).map((s: any) => {
            totalAgents += s.agents?.length || 0;
            totalPlayers += s.player_count || 0;
            return {
              name: s.name,
              playerCount: s.player_count || undefined,
            };
          });
          if (subs.length > 0) subclubMap.set(club.id, subs);
          agentCountMap.set(club.id, totalAgents);
          playerCountMap.set(club.id, totalPlayers);
        }
      }

      if (!settRes.success || !settRes.data) {
        setClubs([]);
        return;
      }

      const clubMapResult = new Map<string, ClubCard>();
      for (const s of settRes.data) {
        if (s.status === 'VOID') continue;
        if (!clubMapResult.has(s.club_id)) {
          clubMapResult.set(s.club_id, {
            clubId: s.club_id,
            clubName: s.club_name || 'Clube',
            platform: (s.platform || 'outro').toLowerCase(),
            externalId: s.club_external_id || null,
            latestSettlementId: s.id,
            weekStart: s.week_start,
            status: s.status,
            logoUrl: logoMap.get(s.club_id) || null,
            subclubes: subclubMap.get(s.club_id) || [],
            totalPlayers: playerCountMap.get(s.club_id) || 0,
            totalAgents: agentCountMap.get(s.club_id) || 0,
          });
        }
      }

      setClubs([...clubMapResult.values()].sort((a, b) => a.clubName.localeCompare(b.clubName)));
    } catch {
      toast('Erro ao carregar clubes', 'error');
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  const grouped = useMemo(() => {
    const map = new Map<string, ClubCard[]>();
    for (const c of clubs) {
      const list = map.get(c.platform) || [];
      list.push(c);
      map.set(c.platform, list);
    }
    const order = ['suprema', 'pppoker', 'clubgg', 'outro'];
    return [...map.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [clubs]);

  const fmtWeek = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  function getClubHref(club: ClubCard) {
    return club.subclubes.length > 0
      ? `/s/${club.latestSettlementId}/club/_all`
      : `/s/${club.latestSettlementId}/club/${encodeURIComponent(club.clubName)}`;
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-6xl animate-tab-fade">
        <div className="mb-6">
          <div className="h-7 skeleton-shimmer w-48 mb-2" />
          <div className="h-4 skeleton-shimmer w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 skeleton-shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl animate-tab-fade">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Meus Clubes</h1>
        <p className="text-dark-400 text-sm mt-1">Gestao de clubes de poker online</p>
      </div>

      {clubs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Building2}
            title="Nenhum clube encontrado"
            description="Importe uma planilha para criar seu primeiro clube automaticamente."
            action={{ label: 'Importar Planilha', onClick: () => router.push('/import') }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([platform, platformClubs]) => (
            <div key={platform}>
              {/* Platform header */}
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${PLATFORM_COLORS[platform] || 'bg-dark-700/30 text-dark-400 border-dark-600/30'}`}>
                  {PLATFORM_LABELS[platform] || platform.toUpperCase()}
                </span>
                <span className="text-dark-500 text-xs">{platformClubs.length} clube{platformClubs.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Club cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {platformClubs.map((club) => (
                  <button
                    key={club.clubId}
                    onClick={() => router.push(getClubHref(club))}
                    className="group text-left bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-poker-600/50 hover:shadow-glow-green transition-all duration-200"
                  >
                    {/* Color bar — platform color */}
                    <div className={`h-0.5 ${PLATFORM_ACCENT[club.platform] || 'bg-poker-500'}`} />

                    <div className="p-4">
                      {/* Row 1: Logo + Name + Arrow */}
                      <div className="flex items-center gap-3 mb-3">
                        <ClubLogo logoUrl={club.logoUrl} name={club.clubName} size="md" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-white truncate group-hover:text-poker-400 transition-colors">
                            {club.clubName}
                          </h3>
                          {club.externalId && (
                            <span className="text-[10px] text-dark-500 font-mono">ID {club.externalId}</span>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-dark-600 group-hover:text-poker-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>

                      {/* Row 2: Stats mini-pills */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {club.totalAgents > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-dark-400 bg-dark-800 rounded-md px-2 py-0.5">
                            <UserCheck className="w-3 h-3 text-dark-500" />
                            {club.totalAgents} agentes
                          </span>
                        )}
                        {club.subclubes.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-dark-400 bg-dark-800 rounded-md px-2 py-0.5">
                            <Network className="w-3 h-3 text-dark-500" />
                            {club.subclubes.length} subclube{club.subclubes.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {club.totalPlayers > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-dark-400 bg-dark-800 rounded-md px-2 py-0.5">
                            <Users className="w-3 h-3 text-dark-500" />
                            {club.totalPlayers}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Status + Week — compact footer */}
                      <div className="flex items-center gap-2 pt-2.5 border-t border-dark-800/80">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          club.status === 'FINAL' ? 'bg-green-400' : club.status === 'DRAFT' ? 'bg-amber-400' : 'bg-dark-500'
                        }`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                          club.status === 'FINAL' ? 'text-green-400' : club.status === 'DRAFT' ? 'text-amber-400' : 'text-dark-500'
                        }`}>
                          {club.status}
                        </span>
                        <span className="text-dark-600 text-[10px]">·</span>
                        <span className="text-dark-500 text-[10px]">{fmtWeek(club.weekStart)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
