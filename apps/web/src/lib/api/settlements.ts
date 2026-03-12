// ══════════════════════════════════════════════════════════════════════
//  Settlements, Imports, Ledger, OFX, ChipPix, Carry-Forward, Dashboard
// ══════════════════════════════════════════════════════════════════════

import { apiFetch, type ApiResponse } from './core';

// ─── Imports ───────────────────────────────────────────────────────

export async function uploadXLSX(file: File, clubId: string, weekStart: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('club_id', clubId);
  form.append('week_start', weekStart);

  return apiFetch('/imports', {
    method: 'POST',
    body: form,
  });
}

// Import Wizard — Preview (não toca no banco)
export async function importPreview(file: File, clubId?: string, weekStartOverride?: string, platform?: string, pppokerSubclube?: string) {
  const form = new FormData();
  form.append('file', file);
  if (clubId) form.append('club_id', clubId);
  if (weekStartOverride) form.append('week_start', weekStartOverride);
  if (platform) form.append('platform', platform);
  if (pppokerSubclube) form.append('pppoker_subclube', pppokerSubclube);

  return apiFetch('/imports/preview', {
    method: 'POST',
    body: form,
  });
}

// Import Wizard — Confirm (persiste settlement + metrics)
export async function importConfirm(file: File, clubId: string, weekStart: string, platform?: string, pppokerSubclube?: string, noSubclubs?: boolean) {
  const form = new FormData();
  form.append('file', file);
  form.append('club_id', clubId);
  form.append('week_start', weekStart);
  if (platform) form.append('platform', platform);
  if (pppokerSubclube) form.append('pppoker_subclube', pppokerSubclube);
  if (noSubclubs) form.append('no_subclubs', 'true');

  return apiFetch('/imports/confirm', {
    method: 'POST',
    body: form,
  });
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

export async function deleteSettlement(id: string) {
  return apiFetch(`/settlements/${id}`, { method: 'DELETE' });
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
  bank_account_id?: string;
}) {
  return apiFetch('/ledger', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLedgerEntry(id: string) {
  return apiFetch(`/ledger/${id}`, { method: 'DELETE' });
}

export interface CategorizedTotal {
  category_id: string;
  name: string;
  dre_type: 'revenue' | 'expense' | null;
  dre_group: string | null;
  color: string;
  total: number;
}

export async function getCategorizedTotals(weekStart: string): Promise<ApiResponse<CategorizedTotal[]>> {
  return apiFetch<CategorizedTotal[]>(`/ledger/categorized-totals?week_start=${weekStart}`);
}

// ─── Conciliacao ──────────────────────────────────────────────────

export async function toggleReconciled(entryId: string, value: boolean) {
  return apiFetch(`/ledger/${entryId}/reconcile`, {
    method: 'PATCH',
    body: JSON.stringify({ is_reconciled: value }),
  });
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
  return apiFetch('/ofx/upload', { method: 'POST', body: form });
}

export async function listOFXTransactions(weekStart?: string, status?: string) {
  const params = new URLSearchParams();
  if (weekStart) params.set('week_start', weekStart);
  if (status) params.set('status', status);
  return apiFetch(`/ofx?${params}`);
}

export async function linkOFXTransaction(txId: string, entityId: string, entityName: string, category?: string, categoryId?: string) {
  return apiFetch(`/ofx/${txId}/link`, {
    method: 'PATCH',
    body: JSON.stringify({ entity_id: entityId, entity_name: entityName, category, category_id: categoryId }),
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
  dir: 'in' | 'out';
}

export async function ofxAutoMatch(weekStart: string): Promise<ApiResponse<AutoMatchSuggestion[]>> {
  return apiFetch<AutoMatchSuggestion[]>('/ofx/auto-match', {
    method: 'POST',
    body: JSON.stringify({ week_start: weekStart }),
  });
}

// ─── ChipPix / Bank Transactions ─────────────────────────────────

export async function uploadChipPix(file: File, weekStart?: string, clubId?: string, settlementId?: string) {
  const form = new FormData();
  form.append('file', file);
  if (weekStart) form.append('week_start', weekStart);
  if (clubId) form.append('club_id', clubId);
  if (settlementId) form.append('settlement_id', settlementId);
  return apiFetch('/chippix/upload', { method: 'POST', body: form });
}

export async function listChipPixTransactions(weekStart?: string, status?: string, settlementId?: string) {
  const params = new URLSearchParams();
  if (weekStart) params.set('week_start', weekStart);
  if (status) params.set('status', status);
  if (settlementId) params.set('settlement_id', settlementId);
  return apiFetch(`/chippix?${params}`);
}

export async function linkChipPixTransaction(txId: string, entityId: string | null, entityName: string | null, categoryId?: string) {
  const payload: Record<string, any> = {};
  if (entityId) { payload.entity_id = entityId; payload.entity_name = entityName; }
  if (categoryId) payload.category_id = categoryId;
  return apiFetch(`/chippix/${txId}/link`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
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

export async function clearChipPixWeek(weekStart: string) {
  return apiFetch(`/chippix/clear/${weekStart}`, { method: 'DELETE' });
}

export async function getChipPixLedgerSummary(weekStart: string) {
  return apiFetch(`/chippix/summary?week_start=${weekStart}`);
}

export async function getChipPixImportSummary(weekStart: string, settlementId?: string) {
  const params = new URLSearchParams({ week_start: weekStart });
  if (settlementId) params.set('settlement_id', settlementId);
  return apiFetch(`/chippix/import-summary?${params}`);
}

// ─── Dashboard Modalities ─────────────────────────────────────────

export interface ModalityData {
  rakeByModality: Record<string, number>;
  winningsByModality: Record<string, number>;
  handsByModality: Record<string, number>;
  topPlayersByRake: Array<{
    name: string;
    rake: number;
    mainModality: string;
    hands: number;
  }>;
  topAgentsByRake: Array<{
    name: string;
    rake: number;
    players: number;
  }>;
  cashVsTournament: {
    cash: { rake: number; players: number; hands: number; pct: number };
    tournament: { rake: number; players: number; hands: number; pct: number };
  };
  activePlayers: {
    thisWeek: number;
    lastWeek: number | null;
    new: number | null;
  };
  topGainersLosers: Array<{
    name: string;
    winnings: number;
    rake: number;
    agent: string;
  }>;
  rakeWeeklyComparison: Array<{
    label: string;
    cash: number;
    tournament: number;
  }>;
  inactivePlayers: Array<{
    name: string;
    lastRake: number;
    agent: string;
    weeksAway: number;
  }>;
}

export async function getDashboardModalities(settlementId: string, subclubId?: string) {
  const params = new URLSearchParams({ settlement_id: settlementId });
  if (subclubId) params.set('subclub_id', subclubId);
  return apiFetch<ModalityData>(`/dashboard/modalities?${params}`);
}

// ─── Comprovante (receipt URL generation) ─────────────────────────

export async function generateReceiptLink(settlementId: string, agentMetricId: string) {
  return apiFetch<{ url: string }>('/comprovante/generate', {
    method: 'POST',
    body: JSON.stringify({ settlementId, agentMetricId }),
  });
}
