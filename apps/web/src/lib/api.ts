// ══════════════════════════════════════════════════════════════════════
//  API Client — Comunicação com o backend
// ══════════════════════════════════════════════════════════════════════

// In production, call API directly (skip Next.js rewrite proxy = ~200ms faster per request).
// In development (localhost), use /api proxy for convenience (avoids CORS setup).
const _backendUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL || '';
const _isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';

const API_BASE = _isLocal ? '/api' : _backendUrl ? `${_backendUrl}/api` : '/api';

// Direct backend URL — same as API_BASE now (kept for backwards compat with uploads)
const API_DIRECT = _isLocal
  ? (_backendUrl || 'http://localhost:3001') + '/api'
  : API_BASE;

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
  return auth?.tenants?.[0]?.id || null;
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

async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
  useDirectUrl = false,
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Cache: only GET requests, only proxied (not direct uploads)
  if (isGet && !useDirectUrl) {
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
    const result = await _apiFetchOnce<T>(path, options, useDirectUrl);

    // On 401 — attempt to refresh and retry ONCE
    if (result === _UNAUTHORIZED_SENTINEL) {
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        const retry = await _apiFetchOnce<T>(path, options, useDirectUrl);
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
  if (isGet && !useDirectUrl) {
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
    const basePath = '/' + path.split('/').slice(1, 3).join('/');
    fetchPromise.then(() => invalidateCache(basePath));
  }

  return fetchPromise;
}

/** Sentinel value returned by _apiFetchOnce when the response is 401 */
const _UNAUTHORIZED_SENTINEL = Symbol('unauthorized');

async function _apiFetchOnce<T = any>(
  path: string,
  options: RequestInit = {},
  useDirectUrl = false,
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

  // Use direct backend URL for file uploads to avoid Next.js proxy issues
  const base = useDirectUrl ? API_DIRECT : API_BASE;

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    res = await fetch(`${base}${path}`, {
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

export async function getMe() {
  return apiFetch('/auth/me');
}

// ─── RBAC helpers ────────────────────────────────────────────────

export function getStoredUserRole(): string | null {
  const auth = getStoredAuth();
  return auth?.tenants?.[0]?.role ?? null;
}

export function getStoredAllowedSubclubs(): { id: string; name: string }[] | null {
  const auth = getStoredAuth();
  return auth?.tenants?.[0]?.allowed_subclubs ?? null;
}

export function isAdmin(): boolean {
  const role = getStoredUserRole();
  return role === 'OWNER' || role === 'ADMIN';
}

// ─── Imports ───────────────────────────────────────────────────────

export async function uploadXLSX(file: File, clubId: string, weekStart: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('club_id', clubId);
  form.append('week_start', weekStart);

  return apiFetch(
    '/imports',
    {
      method: 'POST',
      body: form,
    },
    true,
  );
}

// Import Wizard — Preview (não toca no banco)
export async function importPreview(file: File, weekStartOverride?: string, platform?: string) {
  const form = new FormData();
  form.append('file', file);
  if (weekStartOverride) form.append('week_start', weekStartOverride);
  if (platform) form.append('platform', platform);

  return apiFetch(
    '/imports/preview',
    {
      method: 'POST',
      body: form,
    },
    true,
  );
}

// Import Wizard — Confirm (persiste settlement + metrics)
export async function importConfirm(file: File, clubId: string, weekStart: string, platform?: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('club_id', clubId);
  form.append('week_start', weekStart);
  if (platform) form.append('platform', platform);

  return apiFetch(
    '/imports/confirm',
    {
      method: 'POST',
      body: form,
    },
    true,
  );
}

export async function listImports() {
  return apiFetch('/imports');
}

export async function deleteImport(importId: string) {
  return apiFetch(`/imports/${importId}`, { method: 'DELETE' });
}

// ─── Settlements ───────────────────────────────────────────────────

export async function listSettlements(clubId?: string, startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (clubId) params.set('club_id', clubId);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const qs = params.toString();
  return apiFetch(`/settlements${qs ? `?${qs}` : ''}`);
}

export async function getSettlement(id: string) {
  return apiFetch(`/settlements/${id}`);
}

// Settlement FULL — com breakdown por subclube, fees, adjustments, acertoLiga
export async function getSettlementFull(id: string) {
  return apiFetch(`/settlements/${id}/full`);
}

export async function finalizeSettlement(id: string) {
  return apiFetch(`/settlements/${id}/finalize`, { method: 'POST' });
}

export async function voidSettlement(id: string, reason: string) {
  return apiFetch(`/settlements/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function updateSettlementNotes(id: string, notes: string | null) {
  return apiFetch(`/settlements/${id}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
}

export async function updateAgentPaymentType(settlementId: string, agentId: string, paymentType: 'fiado' | 'avista') {
  return apiFetch(`/settlements/${settlementId}/agents/${agentId}/payment-type`, {
    method: 'PATCH',
    body: JSON.stringify({ payment_type: paymentType }),
  });
}

export async function updateAgentRbRate(settlementId: string, agentMetricId: string, rbRate: number) {
  return apiFetch(`/settlements/${settlementId}/agents/${agentMetricId}/rb-rate`, {
    method: 'PATCH',
    body: JSON.stringify({ rb_rate: rbRate }),
  });
}

export async function syncSettlementAgents(settlementId: string) {
  return apiFetch(`/settlements/${settlementId}/sync-agents`, {
    method: 'POST',
  });
}

export async function syncSettlementRates(settlementId: string) {
  return apiFetch(`/settlements/${settlementId}/sync-rates`, {
    method: 'POST',
  });
}

// ─── Players ───────────────────────────────────────────────────────

export async function listPlayers(search?: string, page?: number, subclubId?: string, isDirect?: boolean) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  if (subclubId) params.set('subclub_id', subclubId);
  if (isDirect !== undefined) params.set('is_direct', String(isDirect));
  return apiFetch(`/players?${params}`);
}

// ─── Organizations ─────────────────────────────────────────────────

export async function listOrganizations(type?: string) {
  const params = type ? `?type=${type}` : '';
  return apiFetch(`/organizations${params}`);
}

export async function getOrgTree() {
  return apiFetch('/organizations/tree');
}

export async function updateOrgMetadata(orgId: string, data: { full_name?: string; phone?: string; email?: string }) {
  return apiFetch(`/organizations/${orgId}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function createOrganization(data: {
  name: string;
  parent_id: string;
  type: 'SUBCLUB';
  external_id?: string;
}) {
  return apiFetch('/organizations', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    external_id?: string;
    is_active?: boolean;
  },
) {
  return apiFetch(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function uploadClubLogo(orgId: string, file: File) {
  const formData = new FormData();
  formData.append('logo', file);
  return apiFetch(
    `/organizations/${orgId}/logo`,
    {
      method: 'POST',
      body: formData,
    },
    true,
  );
}

export async function deleteClubLogo(orgId: string) {
  return apiFetch(`/organizations/${orgId}/logo`, { method: 'DELETE' });
}

export async function getPrefixRules() {
  return apiFetch('/organizations/prefix-rules');
}

export async function createPrefixRule(data: { prefix: string; subclub_id: string; priority?: number }) {
  return apiFetch('/organizations/prefix-rules', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePrefixRule(
  id: string,
  data: {
    prefix?: string;
    subclub_id?: string;
    priority?: number;
  },
) {
  return apiFetch(`/organizations/prefix-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePrefixRule(id: string) {
  return apiFetch(`/organizations/prefix-rules/${id}`, { method: 'DELETE' });
}

// ─── Ledger ────────────────────────────────────────────────────────

export async function listLedger(weekStart: string, entityId?: string) {
  const params = new URLSearchParams({ week_start: weekStart });
  if (entityId) params.set('entity_id', entityId);
  return apiFetch(`/ledger?${params}`);
}

export async function createLedgerEntry(data: {
  entity_id: string;
  entity_name?: string;
  week_start: string;
  dir: 'IN' | 'OUT';
  amount: number;
  method?: string;
  description?: string;
}) {
  return apiFetch('/ledger', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLedgerEntry(id: string) {
  return apiFetch(`/ledger/${id}`, { method: 'DELETE' });
}

// ─── Config (fees + adjustments) ──────────────────────────────────

export async function getFeeConfig() {
  return apiFetch('/config/fees');
}

export async function updateFeeConfig(fees: Array<{ name: string; rate: number; base: string }>) {
  return apiFetch('/config/fees', {
    method: 'PUT',
    body: JSON.stringify({ fees }),
  });
}

export async function getClubAdjustments(weekStart: string, subclubId?: string) {
  const params = new URLSearchParams({ week_start: weekStart });
  if (subclubId) params.set('subclub_id', subclubId);
  return apiFetch(`/config/adjustments?${params}`);
}

export async function saveClubAdjustments(data: {
  subclub_id: string;
  week_start: string;
  overlay?: number;
  compras?: number;
  security?: number;
  outros?: number;
  obs?: string;
}) {
  return apiFetch('/config/adjustments', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Tenant Config ──────────────────────────────────────────────

export async function updateTenantConfig(data: { has_subclubs?: boolean }) {
  return apiFetch('/config/tenant', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Rakeback Defaults ──────────────────────────────────────────

// ─── Links (vinculação de jogadores/agentes) ─────────────────────

export async function getUnlinkedPlayers(settlementId?: string) {
  const params = settlementId ? `?settlement_id=${settlementId}` : '';
  return apiFetch(`/links/unlinked${params}`);
}

export async function linkAgent(agentName: string, subclubId: string) {
  return apiFetch('/links/agent', {
    method: 'POST',
    body: JSON.stringify({ agent_name: agentName, subclub_id: subclubId }),
  });
}

export async function linkPlayer(
  externalPlayerId: string,
  subclubId: string,
  agentExternalId?: string,
  agentName?: string,
) {
  return apiFetch('/links/player', {
    method: 'POST',
    body: JSON.stringify({
      external_player_id: externalPlayerId,
      subclub_id: subclubId,
      agent_external_id: agentExternalId,
      agent_name: agentName,
    }),
  });
}

export async function bulkLinkPlayers(
  players: Array<{
    external_player_id: string;
    subclub_id: string;
    agent_external_id?: string;
    agent_name?: string;
  }>,
) {
  return apiFetch('/links/bulk-players', {
    method: 'POST',
    body: JSON.stringify({ players }),
  });
}

export async function getAgentLinks() {
  return apiFetch('/links/agents');
}

export async function deleteAgentLink(id: string) {
  return apiFetch(`/links/agent/${id}`, { method: 'DELETE' });
}

export async function deletePlayerLink(id: string) {
  return apiFetch(`/links/player/${id}`, { method: 'DELETE' });
}

// ─── Rakeback / Rates ─────────────────────────────────────────────

export async function getAgentRates() {
  return apiFetch('/organizations/agent-rates');
}

export async function updateAgentRate(agentId: string, rate: number, effectiveFrom?: string) {
  return apiFetch(`/organizations/${agentId}/rate`, {
    method: 'PUT',
    body: JSON.stringify({ rate, effective_from: effectiveFrom }),
  });
}

export async function getPlayerRates() {
  return apiFetch('/players/rates/current');
}

export async function updatePlayerRate(playerId: string, rate: number, effectiveFrom?: string) {
  return apiFetch(`/players/${playerId}/rate`, {
    method: 'PUT',
    body: JSON.stringify({ rate, effective_from: effectiveFrom }),
  });
}

export async function updatePlayer(playerId: string, data: { full_name?: string; phone?: string; email?: string }) {
  return apiFetch(`/players/${playerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function toggleAgentDirect(agentId: string, isDirect: boolean) {
  return apiFetch(`/organizations/${agentId}/direct`, {
    method: 'PATCH',
    body: JSON.stringify({ is_direct: isDirect }),
  });
}

// ─── Payment Methods ─────────────────────────────────────────────

export async function listPaymentMethods() {
  return apiFetch('/config/payment-methods');
}

export async function createPaymentMethod(data: { name: string; is_default?: boolean; sort_order?: number }) {
  return apiFetch('/config/payment-methods', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePaymentMethod(
  id: string,
  data: { name?: string; is_default?: boolean; is_active?: boolean; sort_order?: number },
) {
  return apiFetch(`/config/payment-methods/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePaymentMethod(id: string) {
  return apiFetch(`/config/payment-methods/${id}`, { method: 'DELETE' });
}

// ─── Bank Accounts ───────────────────────────────────────────────

export async function listBankAccounts() {
  return apiFetch('/config/bank-accounts');
}

export async function createBankAccount(data: {
  name: string;
  bank_code?: string;
  agency?: string;
  account_nr?: string;
  is_default?: boolean;
}) {
  return apiFetch('/config/bank-accounts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateBankAccount(
  id: string,
  data: {
    name?: string;
    bank_code?: string;
    agency?: string;
    account_nr?: string;
    is_default?: boolean;
    is_active?: boolean;
  },
) {
  return apiFetch(`/config/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteBankAccount(id: string) {
  return apiFetch(`/config/bank-accounts/${id}`, { method: 'DELETE' });
}

// ─── WhatsApp (Evolution API) ────────────────────────────────────

export async function getWhatsAppConfig() {
  return apiFetch('/config/whatsapp');
}

export async function updateWhatsAppConfig(data: {
  api_url: string;
  api_key: string;
  instance_name: string;
  is_active: boolean;
}) {
  return apiFetch('/config/whatsapp', { method: 'PUT', body: JSON.stringify(data) });
}

export async function testWhatsAppConnection() {
  return apiFetch('/whatsapp/test', { method: 'POST' });
}

export async function sendWhatsApp(data: {
  phone: string;
  imageBase64: string;
  caption?: string;
  fileName?: string;
}) {
  return apiFetch('/whatsapp/send', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Carry-Forward ───────────────────────────────────────────────

export async function getCarryForward(weekStart: string, clubId: string) {
  const params = new URLSearchParams({ week_start: weekStart, club_id: clubId });
  return apiFetch<Record<string, number>>(`/carry-forward?${params}`);
}

export async function closeWeek(settlementId: string) {
  return apiFetch('/carry-forward/close-week', {
    method: 'POST',
    body: JSON.stringify({ settlement_id: settlementId }),
  });
}

// ─── OFX / Bank Transactions ─────────────────────────────────────

export async function uploadOFX(file: File, weekStart?: string) {
  const form = new FormData();
  form.append('file', file);
  if (weekStart) form.append('week_start', weekStart);
  return apiFetch('/ofx/upload', { method: 'POST', body: form }, true);
}

export async function listOFXTransactions(weekStart?: string, status?: string) {
  const params = new URLSearchParams();
  if (weekStart) params.set('week_start', weekStart);
  if (status) params.set('status', status);
  return apiFetch(`/ofx?${params}`);
}

export async function linkOFXTransaction(txId: string, entityId: string, entityName: string, category?: string) {
  return apiFetch(`/ofx/${txId}/link`, {
    method: 'PATCH',
    body: JSON.stringify({ entity_id: entityId, entity_name: entityName, category }),
  });
}

export async function unlinkOFXTransaction(txId: string) {
  return apiFetch(`/ofx/${txId}/unlink`, { method: 'PATCH' });
}

export async function ignoreOFXTransaction(txId: string, ignore: boolean) {
  return apiFetch(`/ofx/${txId}/ignore`, {
    method: 'PATCH',
    body: JSON.stringify({ ignore }),
  });
}

export async function applyOFXTransactions(weekStart: string) {
  return apiFetch('/ofx/apply', {
    method: 'POST',
    body: JSON.stringify({ week_start: weekStart }),
  });
}

export async function deleteOFXTransaction(txId: string) {
  return apiFetch(`/ofx/${txId}`, { method: 'DELETE' });
}

// OFX Auto-Match (5-tier classification)
export interface AutoMatchSuggestion {
  transaction_id: string;
  suggested_entity_id: string | null;
  suggested_entity_name: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  match_tier: 1 | 2 | 3 | 4 | 5;
  match_reason: string;
  memo: string | null;
  amount: number;
  tx_date: string;
  dir: string;
}

export async function ofxAutoMatch(weekStart: string): Promise<ApiResponse<AutoMatchSuggestion[]>> {
  return apiFetch<AutoMatchSuggestion[]>('/ofx/auto-match', {
    method: 'POST',
    body: JSON.stringify({ week_start: weekStart }),
  });
}

// ─── ChipPix / Bank Transactions ─────────────────────────────────

export async function uploadChipPix(file: File, weekStart?: string, clubId?: string) {
  const form = new FormData();
  form.append('file', file);
  if (weekStart) form.append('week_start', weekStart);
  if (clubId) form.append('club_id', clubId);
  return apiFetch('/chippix/upload', { method: 'POST', body: form }, true);
}

export async function listChipPixTransactions(weekStart?: string, status?: string) {
  const params = new URLSearchParams();
  if (weekStart) params.set('week_start', weekStart);
  if (status) params.set('status', status);
  return apiFetch(`/chippix?${params}`);
}

export async function linkChipPixTransaction(txId: string, entityId: string, entityName: string, category?: string) {
  return apiFetch(`/chippix/${txId}/link`, {
    method: 'PATCH',
    body: JSON.stringify({ entity_id: entityId, entity_name: entityName, category }),
  });
}

export async function unlinkChipPixTransaction(txId: string) {
  return apiFetch(`/chippix/${txId}/unlink`, { method: 'PATCH' });
}

export async function ignoreChipPixTransaction(txId: string, ignore: boolean) {
  return apiFetch(`/chippix/${txId}/ignore`, {
    method: 'PATCH',
    body: JSON.stringify({ ignore }),
  });
}

export async function applyChipPixTransactions(weekStart: string) {
  return apiFetch('/chippix/apply', {
    method: 'POST',
    body: JSON.stringify({ week_start: weekStart }),
  });
}

export async function deleteChipPixTransaction(txId: string) {
  return apiFetch(`/chippix/${txId}`, { method: 'DELETE' });
}

export async function getChipPixLedgerSummary(weekStart: string) {
  return apiFetch(`/chippix/summary?week_start=${weekStart}`);
}

// ─── Conciliacao ──────────────────────────────────────────────────

export async function toggleReconciled(entryId: string, value: boolean) {
  return apiFetch(`/ledger/${entryId}/reconcile`, {
    method: 'PATCH',
    body: JSON.stringify({ is_reconciled: value }),
  });
}

// ─── Users (Gestao de Equipe) ────────────────────────────────────

export interface TenantUser {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export async function getUsers(): Promise<ApiResponse<TenantUser[]>> {
  return apiFetch<TenantUser[]>('/users');
}

export async function updateUserRole(userTenantId: string, role: string): Promise<ApiResponse> {
  return apiFetch(`/users/${userTenantId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeUser(userTenantId: string): Promise<ApiResponse> {
  return apiFetch(`/users/${userTenantId}`, { method: 'DELETE' });
}

export async function inviteUser(
  email: string,
  role: string,
): Promise<ApiResponse & { pending?: boolean; message?: string }> {
  return apiFetch('/users/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function getUserOrgAccess(
  userTenantId: string,
): Promise<ApiResponse<{ full_access: boolean; org_ids: string[] }>> {
  return apiFetch(`/users/${userTenantId}/org-access`);
}

export async function setUserOrgAccess(userTenantId: string, orgIds: string[]): Promise<ApiResponse> {
  return apiFetch(`/users/${userTenantId}/org-access`, {
    method: 'PUT',
    body: JSON.stringify({ org_ids: orgIds }),
  });
}

// ─── Permissions ──────────────────────────────────────────────────

export async function getMyPermissions(): Promise<ApiResponse<Record<string, boolean>>> {
  return apiFetch<Record<string, boolean>>('/permissions/my');
}

export async function getAllPermissions(): Promise<ApiResponse<Record<string, Record<string, boolean>>>> {
  return apiFetch<Record<string, Record<string, boolean>>>('/permissions');
}

export async function updateRolePermissions(
  role: string,
  permissions: Record<string, boolean>,
): Promise<ApiResponse> {
  return apiFetch('/permissions', {
    method: 'PUT',
    body: JSON.stringify({ role, permissions }),
  });
}

// ─── Helpers ───────────────────────────────────────────────────────

export { formatBRL } from './formatters';

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}
