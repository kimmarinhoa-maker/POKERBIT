'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { listSettlements, getOrgTree } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/ui/EmptyState';
import ClubLogo from '@/components/ClubLogo';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Building2, ArrowRight } from 'lucide-react';

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

interface ClubCard {
  clubId: string;
  clubName: string;
  platform: string;
  externalId: string | null;
  latestSettlementId: string;
  weekStart: string;
  status: string;
  logoUrl: string | null;
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

      // Build logo map from org tree: club org id -> logo_url
      const logoMap = new Map<string, string | null>();
      if (treeRes.success && treeRes.data) {
        for (const club of treeRes.data) {
          logoMap.set(club.id, club.logo_url || club.metadata?.logo_url || null);
        }
      }

      if (!settRes.success || !settRes.data) {
        setClubs([]);
        return;
      }

      // Group by club_id, keep only the most recent settlement per club
      const clubMap = new Map<string, ClubCard>();
      for (const s of settRes.data) {
        if (s.status === 'VOID') continue;
        if (!clubMap.has(s.club_id)) {
          clubMap.set(s.club_id, {
            clubId: s.club_id,
            clubName: s.club_name || 'Clube',
            platform: (s.platform || 'outro').toLowerCase(),
            externalId: s.club_external_id || null,
            latestSettlementId: s.id,
            weekStart: s.week_start,
            status: s.status,
            logoUrl: logoMap.get(s.club_id) || null,
          });
        }
      }

      setClubs([...clubMap.values()].sort((a, b) => a.clubName.localeCompare(b.clubName)));
    } catch {
      toast('Erro ao carregar clubes', 'error');
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  // Group by platform
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

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-6xl animate-tab-fade">
        <div className="mb-6">
          <div className="h-7 skeleton-shimmer w-48 mb-2" />
          <div className="h-4 skeleton-shimmer w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 skeleton-shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl animate-tab-fade">
      {/* Header + inline stats */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="text-xl lg:text-2xl font-bold text-white">Meus Clubes</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-poker-500/10 text-poker-400 border border-poker-500/30">
              {clubs.length} clube{clubs.length !== 1 ? 's' : ''}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {grouped.length} plataforma{grouped.length !== 1 ? 's' : ''}
            </span>
            {clubs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {clubs.reduce((latest, c) => c.weekStart > latest ? c.weekStart : latest, clubs[0].weekStart)}
              </span>
            )}
          </div>
        </div>
        <p className="text-dark-400 text-sm">Selecione um clube para gerenciar</p>
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
                  <Link
                    key={club.clubId}
                    href={`/clubs/${club.clubId}`}
                    className="group bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-poker-600/50 hover:shadow-glow-green transition-all duration-200"
                  >
                    {/* Color bar */}
                    <div className="h-1 bg-poker-500" />

                    <div className="p-5">
                      {/* Logo + Club name + arrow */}
                      <div className="flex items-start gap-3 mb-3">
                        <ClubLogo logoUrl={club.logoUrl} name={club.clubName} size="lg" className="group-hover:ring-2 ring-poker-500/30 transition-all" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-bold text-white truncate group-hover:text-poker-400 transition-colors">
                            {club.clubName}
                          </h3>
                          {club.externalId && (
                            <p className="text-[10px] text-dark-500 font-mono mt-0.5">ID: {club.externalId}</p>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-dark-600 group-hover:text-poker-400 transition-colors mt-1 flex-shrink-0" />
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          club.status === 'FINAL'
                            ? 'bg-green-500/10 text-green-400 border-green-500/30'
                            : club.status === 'DRAFT'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-dark-700/30 text-dark-400 border-dark-600/30'
                        }`}>
                          {club.status}
                        </span>
                        <span className="text-dark-500 text-[10px]">
                          Semana {club.weekStart}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
