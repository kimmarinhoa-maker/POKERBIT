// ══════════════════════════════════════════════════════════════════════
//  Config, Payment Methods, Bank Accounts, Categories, Users, Permissions
// ══════════════════════════════════════════════════════════════════════

import { apiFetch, type ApiResponse } from './core';

// ─── Config (fees + adjustments) ──────────────────────────────────

export async function getFeeConfig(clubId?: string) {
  const params = clubId ? `?club_id=${clubId}` : '';
  return apiFetch(`/config/fees${params}`);
}

export async function updateFeeConfig(fees: Array<{ name: string; rate: number; base: string }>, clubId: string) {
  return apiFetch('/config/fees', {
    method: 'PUT',
    body: JSON.stringify({ fees, club_id: clubId }),
  });
}

export async function deleteFee(feeId: string) {
  return apiFetch(`/config/fees/${feeId}`, { method: 'DELETE' });
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

export async function getTenantConfig() {
  return apiFetch('/config/tenant');
}

export async function updateTenantConfig(data: { has_subclubs?: boolean; pix_key?: string | null; pix_key_type?: string | null }) {
  return apiFetch('/config/tenant', {
    method: 'PATCH',
    body: JSON.stringify(data),
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

// ─── Transaction Categories ─────────────────────────────────────

export interface TransactionCategory {
  id: string;
  tenant_id: string;
  name: string;
  direction: 'in' | 'out';
  dre_type: 'revenue' | 'expense' | null;
  dre_group: string | null;
  color: string;
  icon: string | null;
  is_system: boolean;
  auto_match: string | null;
  sort_order: number;
  created_at: string;
}

export async function listTransactionCategories(): Promise<ApiResponse<TransactionCategory[]>> {
  return apiFetch<TransactionCategory[]>('/config/transaction-categories');
}

export async function createTransactionCategory(data: {
  name: string;
  direction: 'in' | 'out';
  dre_type?: string | null;
  dre_group?: string | null;
  color?: string;
  auto_match?: string | null;
}): Promise<ApiResponse<TransactionCategory>> {
  return apiFetch<TransactionCategory>('/config/transaction-categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTransactionCategory(
  id: string,
  data: Partial<Omit<TransactionCategory, 'id' | 'tenant_id' | 'created_at'>>,
): Promise<ApiResponse<TransactionCategory>> {
  return apiFetch<TransactionCategory>(`/config/transaction-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTransactionCategory(id: string): Promise<ApiResponse> {
  return apiFetch(`/config/transaction-categories/${id}`, { method: 'DELETE' });
}

// ─── Club Platforms ─────────────────────────────────────────────

export async function listClubPlatforms() {
  return apiFetch('/config/club-platforms');
}

export async function createClubPlatform(data: {
  platform: string;
  club_name?: string;
  club_external_id?: string;
  is_primary?: boolean;
  organization_id?: string;
}) {
  return apiFetch('/config/club-platforms', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteClubPlatform(id: string) {
  return apiFetch(`/config/club-platforms/${id}`, { method: 'DELETE' });
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
