// ══════════════════════════════════════════════════════════════════════
//  Players, Organizations, Links, Rates
// ══════════════════════════════════════════════════════════════════════

import { apiFetch } from './core';

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

export async function listOrganizations(type?: string, parentId?: string) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (parentId) params.set('parent_id', parentId);
  const qs = params.toString();
  return apiFetch(`/organizations${qs ? `?${qs}` : ''}`);
}

export async function getOrgTree() {
  return apiFetch('/organizations/tree');
}

export async function updateOrgMetadata(orgId: string, data: { full_name?: string; phone?: string; email?: string; platform?: string }) {
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

export async function findOrCreateClub(data: {
  platform: string;
  external_id: string;
  league_id?: string;
  name?: string;
}) {
  return apiFetch('/organizations/find-or-create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    external_id?: string;
    is_active?: boolean;
    whatsapp_group_link?: string | null;
    chippix_manager_id?: string | null;
  },
) {
  return apiFetch(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function uploadClubLogo(orgId: string, file: File) {
  const formData = new FormData();
  formData.append('logo', file);
  return apiFetch(`/organizations/${orgId}/logo`, {
    method: 'POST',
    body: formData,
  });
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
