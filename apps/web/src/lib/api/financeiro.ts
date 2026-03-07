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
