'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredAuth, clearAuth, refreshAuthToken } from '@/lib/api';
import { useToast } from '@/components/Toast';

// ─── Types ──────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  isAdmin: boolean;
  canWrite: boolean;
  isScoped: boolean;
  allowedSubclubs: string[] | null; // null = all access
  loading: boolean;
  canAccess: (...roles: string[]) => boolean;
  canEditSubclub: (subclubId: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: 'FINANCEIRO',
  tenantId: null,
  tenantName: null,
  isAdmin: false,
  canWrite: false,
  isScoped: false,
  allowedSubclubs: null,
  loading: true,
  canAccess: () => false,
  canEditSubclub: () => false,
  logout: () => {},
});

// ─── Constants ──────────────────────────────────────────────────────

/** Refresh the token 2 minutes before it expires */
const REFRESH_BUFFER_SEC = 2 * 60;
/** Show a toast warning 5 minutes before expiry */
const EXPIRY_WARNING_SEC = 5 * 60;

// ─── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<string>('FINANCEIRO');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [allowedSubclubs, setAllowedSubclubs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningShownRef = useRef(false);
  const scheduleRefreshRef = useRef<() => void>(() => {});

  // ─── Schedule proactive token refresh & expiry warning ────────
  const scheduleRefresh = useCallback(() => {
    // Clear any existing timers
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    refreshTimerRef.current = null;
    warningTimerRef.current = null;

    const auth = getStoredAuth();
    const expiresAt = auth?.session?.expires_at;
    if (!expiresAt) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresSec = typeof expiresAt === 'number' ? expiresAt : Math.floor(new Date(expiresAt).getTime() / 1000);
    const secsUntilExpiry = expiresSec - nowSec;

    if (secsUntilExpiry <= 0) {
      // Already expired — try a refresh immediately
      refreshAuthToken().then((ok) => {
        if (ok) {
          scheduleRefreshRef.current();
        } else {
          clearAuth();
          router.push('/login');
        }
      });
      return;
    }

    // Schedule the "about to expire" warning toast (5 min before)
    if (secsUntilExpiry > EXPIRY_WARNING_SEC && !warningShownRef.current) {
      const warningDelay = (secsUntilExpiry - EXPIRY_WARNING_SEC) * 1000;
      warningTimerRef.current = setTimeout(() => {
        warningShownRef.current = true;
        toast('Sua sessao expira em 5 minutos. Salvando dados automaticamente...', 'info');
      }, warningDelay);
    }

    // Schedule the actual refresh (2 min before expiry)
    const refreshDelay = Math.max((secsUntilExpiry - REFRESH_BUFFER_SEC) * 1000, 0);
    refreshTimerRef.current = setTimeout(async () => {
      const ok = await refreshAuthToken();
      if (ok) {
        warningShownRef.current = false;
        scheduleRefreshRef.current(); // schedule next cycle
      } else {
        clearAuth();
        router.push('/login');
      }
    }, refreshDelay);
  }, [router, toast]);

  // Keep ref in sync so recursive calls use the latest callback
  useEffect(() => {
    scheduleRefreshRef.current = scheduleRefresh;
  }, [scheduleRefresh]);

  // ─── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    const auth = getStoredAuth();
    if (!auth?.session?.access_token) {
      router.push('/login');
      return;
    }
    setUser({
      id: auth.user?.id || '',
      email: auth.user?.email || '',
    });
    const tenant = auth.tenants?.[0];
    setRole(tenant?.role || 'FINANCEIRO');
    setTenantId(tenant?.id || null);
    setTenantName(tenant?.name || null);
    // allowed_subclubs: array of subclub IDs or null/undefined for full access
    const subclubs = tenant?.allowed_subclubs;
    setAllowedSubclubs(Array.isArray(subclubs) && subclubs.length > 0 ? subclubs.map((s: any) => typeof s === 'string' ? s : s?.id) : null);
    setLoading(false);

    // Start proactive refresh cycle
    scheduleRefresh();
  }, [router, scheduleRefresh]);

  // ─── Listen for token refresh events (from apiFetch 401 retry or other tabs) ──
  useEffect(() => {
    const handleTokenRefreshed = () => {
      // Re-read stored auth to pick up the new token — the token is already
      // persisted in localStorage by refreshAuthToken(), so we just re-schedule.
      warningShownRef.current = false;
      scheduleRefresh();
    };

    // Custom event dispatched by refreshAuthToken() in api.ts
    window.addEventListener('poker_token_refreshed', handleTokenRefreshed);

    // Listen for localStorage changes from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'poker_auth') {
        if (!e.newValue) {
          // Auth was cleared in another tab — redirect to login
          setUser(null);
          router.push('/login');
        } else {
          // Auth was updated in another tab (e.g. token refresh) — re-schedule
          scheduleRefresh();
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('poker_token_refreshed', handleTokenRefreshed);
      window.removeEventListener('storage', handleStorage);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [router, scheduleRefresh]);

  const isAdmin = role === 'OWNER' || role === 'ADMIN';
  const canWrite = role === 'OWNER' || role === 'ADMIN' || role === 'FINANCEIRO';
  const isScoped = allowedSubclubs !== null && allowedSubclubs.length > 0;

  const canAccess = useCallback(
    (...roles: string[]) => {
      return roles.includes(role);
    },
    [role],
  );

  const canEditSubclub = useCallback(
    (subclubId: string) => {
      if (isAdmin) return true;
      if (!allowedSubclubs) return true; // null = all access
      return allowedSubclubs.includes(subclubId);
    },
    [isAdmin, allowedSubclubs],
  );

  const logout = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    clearAuth();
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        tenantId,
        tenantName,
        isAdmin,
        canWrite,
        isScoped,
        allowedSubclubs,
        loading,
        canAccess,
        canEditSubclub,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
