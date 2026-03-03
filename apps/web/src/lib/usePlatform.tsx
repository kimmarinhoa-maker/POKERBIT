'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { listClubPlatforms } from '@/lib/api';
import type { ClubPlatform, PlatformOption } from '@/types/platform';
import { PLATFORM_LABELS } from '@/types/platform';

// ─── Types ──────────────────────────────────────────────────────────

interface PlatformContextValue {
  selectedPlatformId: string | null; // null = Suprema (default)
  selectedPlatform: PlatformOption | null;
  platforms: PlatformOption[];
  allClubPlatforms: ClubPlatform[];
  setPlatformId: (id: string | null) => void;
  loading: boolean;
  reload: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue>({
  selectedPlatformId: null,
  selectedPlatform: null,
  platforms: [],
  allClubPlatforms: [],
  setPlatformId: () => {},
  loading: true,
  reload: async () => {},
});

export function usePlatform() {
  return useContext(PlatformContext);
}

// ─── Provider ───────────────────────────────────────────────────────

const STORAGE_KEY = 'poker_selected_platform';

function getStoredPlatformId(): string | null {
  if (typeof window === 'undefined') return null;
  const val = localStorage.getItem(STORAGE_KEY);
  return val && val !== 'null' ? val : null;
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(getStoredPlatformId);
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [allClubPlatforms, setAllClubPlatforms] = useState<ClubPlatform[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlatforms = useCallback(async () => {
    try {
      const res = await listClubPlatforms();
      if (res.success && res.data) {
        const clubPlatforms: ClubPlatform[] = res.data;
        setAllClubPlatforms(clubPlatforms);

        // Build PlatformOption list: Suprema sentinel + external clubs
        const options: PlatformOption[] = [
          {
            id: null,
            label: 'Suprema (Principal)',
            platform: 'suprema',
            subclub_id: null,
            club_external_id: null,
          },
          ...clubPlatforms.map((cp) => ({
            id: cp.id,
            label: cp.club_name || `${PLATFORM_LABELS[cp.platform] || cp.platform} - ${cp.subclub_name || 'Sem subclube'}`,
            platform: cp.platform,
            subclub_id: cp.subclub_id,
            club_external_id: cp.club_external_id,
          })),
        ];
        setPlatforms(options);

        // Validate stored selection still exists
        const stored = getStoredPlatformId();
        if (stored && !clubPlatforms.find((cp) => cp.id === stored)) {
          setSelectedPlatformId(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Silently fail — platform list is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  const setPlatformId = useCallback((id: string | null) => {
    setSelectedPlatformId(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const selectedPlatform = platforms.find((p) => p.id === selectedPlatformId) || platforms[0] || null;

  return (
    <PlatformContext.Provider
      value={{
        selectedPlatformId,
        selectedPlatform,
        platforms,
        allClubPlatforms,
        setPlatformId,
        loading,
        reload: loadPlatforms,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}
