'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredAuth, clearAuth } from '@/lib/api';

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

// ─── Provider ───────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<string>('FINANCEIRO');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [allowedSubclubs, setAllowedSubclubs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

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
    setAllowedSubclubs(Array.isArray(subclubs) && subclubs.length > 0 ? subclubs.map((s: any) => s.id || s) : null);
    setLoading(false);
  }, [router]);

  const isAdmin = role === 'OWNER' || role === 'ADMIN';
  const canWrite = role === 'OWNER' || role === 'ADMIN' || role === 'FINANCEIRO';
  const isScoped = allowedSubclubs !== null && allowedSubclubs.length > 0;

  const canAccess = useCallback((...roles: string[]) => {
    return roles.includes(role);
  }, [role]);

  const canEditSubclub = useCallback((subclubId: string) => {
    if (isAdmin) return true;
    if (!allowedSubclubs) return true; // null = all access
    return allowedSubclubs.includes(subclubId);
  }, [isAdmin, allowedSubclubs]);

  const logout = useCallback(() => {
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
