import { useState, useEffect, useCallback, useRef } from 'react';
import { listSettlements } from '@/lib/api';

export interface SidebarClub {
  clubId: string;
  clubName: string;
  platform: string;
  settlementId: string;
  weekStart: string;
  status: string;
}

export interface PlatformGroup {
  platform: string;
  clubs: SidebarClub[];
}

/** Map settlementId -> clubId for active state matching */
export type SettlementClubMap = Map<string, string>;

const PLATFORM_ORDER = ['suprema', 'pppoker', 'clubgg', 'outro'];

export function useSidebarClubs(authReady: boolean) {
  const [groups, setGroups] = useState<PlatformGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlementClubMap, setSettlementClubMap] = useState<SettlementClubMap>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!authReady) return;
    try {
      const res = await listSettlements();
      if (!mountedRef.current) return;
      if (!res.success || !res.data) {
        setGroups([]);
        setSettlementClubMap(new Map());
        return;
      }

      // Build settlement -> club_id map (ALL settlements, for active state)
      const scMap = new Map<string, string>();
      for (const s of res.data) {
        if (s.status !== 'VOID') {
          scMap.set(s.id, s.club_id);
        }
      }
      setSettlementClubMap(scMap);

      // Group by club_id, keep only the most recent settlement per club
      const clubMap = new Map<string, SidebarClub>();
      for (const s of res.data) {
        if (s.status === 'VOID') continue;
        if (!clubMap.has(s.club_id)) {
          // API flattens organizations join: club_name, club_external_id, platform are top-level
          const platform = (s.platform || 'outro').toLowerCase();
          clubMap.set(s.club_id, {
            clubId: s.club_id,
            clubName: s.club_name || 'Clube',
            platform,
            settlementId: s.id,
            weekStart: s.week_start,
            status: s.status,
          });
        }
      }

      // Group by platform
      const platMap = new Map<string, SidebarClub[]>();
      for (const club of clubMap.values()) {
        const list = platMap.get(club.platform) || [];
        list.push(club);
        platMap.set(club.platform, list);
      }

      // Sort platforms
      const sorted = [...platMap.entries()]
        .sort(([a], [b]) => {
          const ia = PLATFORM_ORDER.indexOf(a);
          const ib = PLATFORM_ORDER.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })
        .map(([platform, clubs]) => ({
          platform,
          clubs: clubs.sort((a, b) => a.clubName.localeCompare(b.clubName)),
        }));

      if (mountedRef.current) setGroups(sorted);
    } catch (err) {
      if (mountedRef.current) {
        console.error('[useSidebarClubs] Erro ao carregar clubes:', err);
        setGroups([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authReady]);

  useEffect(() => { load(); }, [load]);

  return { groups, loading, reload: load, settlementClubMap };
}
