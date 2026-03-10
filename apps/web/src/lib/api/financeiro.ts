// ══════════════════════════════════════════════════════════════════════
//  API Client — Financeiro (Agent Consolidated Groups)
// ══════════════════════════════════════════════════════════════════════

import { apiFetch, type ApiResponse } from './core';
import type { AgentGroup, AgentConsolidatedSettlement } from '@/types/financeiro';

export async function listAgentGroups(): Promise<ApiResponse<AgentGroup[]>> {
  return apiFetch('/financeiro/agent-groups');
}

export async function createAgentGroup(
  name: string,
  phone?: string,
): Promise<ApiResponse<AgentGroup>> {
  return apiFetch('/financeiro/agent-groups', {
    method: 'POST',
    body: JSON.stringify({ name, phone }),
  });
}

export async function updateAgentGroup(
  id: string,
  data: { name?: string; phone?: string },
): Promise<ApiResponse<AgentGroup>> {
  return apiFetch(`/financeiro/agent-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAgentGroup(id: string): Promise<ApiResponse<void>> {
  return apiFetch(`/financeiro/agent-groups/${id}`, { method: 'DELETE' });
}

export async function addGroupMember(
  groupId: string,
  organizationId: string,
): Promise<ApiResponse<any>> {
  return apiFetch(`/financeiro/agent-groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId }),
  });
}

export async function removeGroupMember(
  groupId: string,
  memberId: string,
): Promise<ApiResponse<void>> {
  return apiFetch(`/financeiro/agent-groups/${groupId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export async function getAgentConsolidatedSettlement(
  groupId: string,
  weekStart: string,
): Promise<ApiResponse<AgentConsolidatedSettlement>> {
  return apiFetch(`/financeiro/agent-settlement?groupId=${groupId}&weekStart=${weekStart}`);
}

// ─── Caixa (Fluxo de Caixa) ─────────────────────────────────────────

import type {
  CaixaLancamento,
  CaixaResumo,
  CaixaCanal,
  CaixaCreatePayload,
  CaixaUpdatePayload,
} from '@/types/caixa';

export async function listCaixaLancamentos(
  filters?: { settlement_id?: string; club_id?: string; tipo?: string; via?: string; status?: string },
): Promise<ApiResponse<CaixaLancamento[]>> {
  const params = new URLSearchParams();
  if (filters?.settlement_id) params.set('settlement_id', filters.settlement_id);
  if (filters?.club_id) params.set('club_id', filters.club_id);
  if (filters?.tipo) params.set('tipo', filters.tipo);
  if (filters?.via) params.set('via', filters.via);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiFetch(`/financeiro/caixa${qs ? `?${qs}` : ''}`);
}

export async function createCaixaLancamento(
  payload: CaixaCreatePayload,
): Promise<ApiResponse<CaixaLancamento>> {
  return apiFetch('/financeiro/caixa', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCaixaLancamento(
  id: string,
  payload: CaixaUpdatePayload,
): Promise<ApiResponse<CaixaLancamento>> {
  return apiFetch(`/financeiro/caixa/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteCaixaLancamento(id: string): Promise<ApiResponse<void>> {
  return apiFetch(`/financeiro/caixa/${id}`, { method: 'DELETE' });
}

export interface CaixaResumoResponse {
  resumo: CaixaResumo;
  canais: CaixaCanal[];
  cobrancas_pendentes: Array<{ nome: string; valor: number }>;
  pagamentos_pendentes: Array<{ nome: string; valor: number }>;
}

export async function getCaixaResumo(
  settlementId: string,
): Promise<ApiResponse<CaixaResumoResponse>> {
  return apiFetch(`/financeiro/caixa/resumo?settlement_id=${settlementId}`);
}
