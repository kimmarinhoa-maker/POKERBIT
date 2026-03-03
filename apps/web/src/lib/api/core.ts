// ══════════════════════════════════════════════════════════════════════
//  API Core — Infrastructure, auth storage, fetch wrapper
// ══════════════════════════════════════════════════════════════════════

// All API calls go to local Next.js API Routes at /api/*
const API_BASE = '/api';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, number | string>;
}

// ─── Auth storage ──────────────────────────────────────────────────

export function getStoredAuth() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('poker_auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: Record<string, unknown>) {
  localStorage.setItem('poker_auth', JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem('poker_auth');
}

function getToken(): string | null {
  const auth = getStoredAuth();
  return auth?.session?.access_token || null;
}

function getTenantId(): string | null {
  const auth = getStoredAuth();
  const tenants = auth?.tenants || [];
  const selectedId =
    typeof window !== 'undefined' ? localStorage.getItem('poker_selected_tenant') : null;
  const match = tenants.find((t: any) => t.id === selectedId);
  return match?.id || tenants[0]?.id || null;
}

// ─── Token refresh ─────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Attempts to refresh the access token using the stored refresh_token.
 * Returns true if the refresh succeeded, false otherwise.
 * Deduplicates concurrent refresh calls (only one in-flight at a time).
 */
export async function refreshAuthToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const auth = getStoredAuth();
      const refreshToken = auth?.session?.refresh_token;
      if (!refreshToken) return false;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return false;

      const json = await res.json();
      if (!json.success || !json.data) return false;

      // Update only the session tokens in stored auth (preserve user + tenants)
      const updated = {
        ...auth,
        session: {
          ...auth.session,
          access_token: json.data.access_token,
          refresh_token: json.data.refresh_token,
          expires_at: json.data.expires_at,
        },
      };
      setStoredAuth(updated);

      // Notify other tabs and the AuthProvider about the refreshed token
      window.dispatchEvent(new CustomEvent('poker_token_refreshed'));

      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── Request cache + dedup ───────────────────────────────────────

const _cache = new Map<string, { data: any; ts: number }>();
const _inflight = new Map<string, Promise<any>>();
const CACHE_TTL = 60_000; // 60 seconds

/** Bust cache for a specific path prefix (e.g. after mutations) */
export function invalidateCache(pathPrefix?: string) {
  if (!pathPrefix) {
    _cache.clear();
    return;
  }
  for (const key of _cache.keys()) {
    if (key.startsWith(pathPrefix)) _cache.delete(key);
  }
}

// ─── Fetch wrapper ─────────────────────────────────────────────────

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Cache: only GET requests
  if (isGet) {
    // Return cached if fresh
    const cached = _cache.get(path);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data as ApiResponse<T>;
    }

    // Dedup: if same GET is already in-flight, wait for it
    const inflight = _inflight.get(path);
    if (inflight) return inflight as Promise<ApiResponse<T>>;
  }

  // Create the actual fetch promise
  const fetchPromise = (async (): Promise<ApiResponse<T>> => {
    const result = await _apiFetchOnce<T>(path, options);

    // On 401 — attempt to refresh and retry ONCE
    if (result === _UNAUTHORIZED_SENTINEL) {
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        const retry = await _apiFetchOnce<T>(path, options);
        if (retry !== _UNAUTHORIZED_SENTINEL) return retry;
      }
      // Refresh failed or retry still 401 — logout
      clearAuth();
      window.location.href = '/login';
      return { success: false, error: 'Sessao expirada' };
    }

    return result;
  })();

  // Track in-flight for GET dedup
  if (isGet) {
    _inflight.set(path, fetchPromise);
    fetchPromise.finally(() => _inflight.delete(path));

    // Cache successful GET responses
    const result = await fetchPromise;
    if (result.success) {
      _cache.set(path, { data: result, ts: Date.now() });
    }
    return result;
  }

  // Mutations: invalidate related cache after completion
  if (!isGet) {
    const basePath = '/' + path.split('/')[1];
    fetchPromise.then(() => invalidateCache(basePath));
  }

  return fetchPromise;
}

/** Sentinel value returned by _apiFetchOnce when the response is 401 */
const _UNAUTHORIZED_SENTINEL = Symbol('unauthorized');

async function _apiFetchOnce<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T> | typeof _UNAUTHORIZED_SENTINEL> {
  const token = getToken();
  const tenantId = getTenantId();

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, error: 'Timeout: o servidor demorou mais de 30s para responder.' };
    }
    return { success: false, error: 'Servidor indisponivel. Tente novamente em alguns segundos.' };
  }

  // Return sentinel so caller can attempt refresh + retry
  if (!res.ok && res.status === 401) {
    return _UNAUTHORIZED_SENTINEL;
  }

  // Read body as text first, then try to parse as JSON
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      success: false,
      error: `Erro ${res.status}: ${text.substring(0, 200) || 'Resposta invalida do servidor'}`,
    };
  }

  return data;
}

// ─── Auth ──────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.success && res.data) {
    setStoredAuth(res.data);
  }
  return res;
}

export async function signup(
  name: string,
  email: string,
  password: string,
  clubName: string,
) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, club_name: clubName }),
  });
  if (res.success && res.data) {
    setStoredAuth(res.data);
  }
  return res;
}

export async function getMe() {
  return apiFetch('/auth/me');
}

// ─── Tenant management ──────────────────────────────────────────

export async function createTenant(clubName: string, hasSubclubs: boolean = true) {
  return apiFetch('/tenants', {
    method: 'POST',
    body: JSON.stringify({ club_name: clubName, has_subclubs: hasSubclubs }),
  });
}

export async function createTenantSubclubes(
  tenantId: string,
  namesOrObjects: string[] | Array<{ name: string; external_id?: string }>,
) {
  // Detect format: array of strings (legacy) vs array of objects (new)
  const isLegacy = namesOrObjects.length === 0 || typeof namesOrObjects[0] === 'string';
  const payload = isLegacy
    ? { names: namesOrObjects as string[] }
    : { subclubes: namesOrObjects };

  return apiFetch(`/tenants/${tenantId}/subclubes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteTenant(tenantId: string) {
  return apiFetch(`/tenants/${tenantId}`, { method: 'DELETE' });
}

export async function refreshTenantList() {
  const res = await apiFetch('/auth/me');
  if (res.success && res.data) {
    const auth = getStoredAuth();
    if (auth) {
      setStoredAuth({ ...auth, tenants: (res.data as any).tenants });
    }
  }
  return res;
}

// ─── RBAC helpers ────────────────────────────────────────────────

export function getStoredUserRole(): string | null {
  const auth = getStoredAuth();
  const tenants = auth?.tenants || [];
  const selectedId =
    typeof window !== 'undefined' ? localStorage.getItem('poker_selected_tenant') : null;
  const match = tenants.find((t: any) => t.id === selectedId);
  return match?.role ?? tenants[0]?.role ?? null;
}

export function getStoredAllowedSubclubs(): { id: string; name: string }[] | null {
  const auth = getStoredAuth();
  const tenants = auth?.tenants || [];
  const selectedId =
    typeof window !== 'undefined' ? localStorage.getItem('poker_selected_tenant') : null;
  const match = tenants.find((t: any) => t.id === selectedId);
  return match?.allowed_subclubs ?? tenants[0]?.allowed_subclubs ?? null;
}

export function isAdmin(): boolean {
  const role = getStoredUserRole();
  return role === 'OWNER' || role === 'ADMIN';
}

// ─── Helpers ───────────────────────────────────────────────────────

export { formatBRL } from '../formatters';

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}
