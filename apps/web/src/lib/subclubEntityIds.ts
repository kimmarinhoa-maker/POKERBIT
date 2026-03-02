// ══════════════════════════════════════════════════════════════════════
//  Build the set of entity_ids belonging to a subclub.
//  Used to filter ledger_entries and bank_transactions by subclub.
//
//  entity_id in the DB can be:
//  - agent org UUID   (organizations.id where type=AGENT)
//  - agent metric UUID (agent_week_metrics.id)
//  - player UUID      (players.id)
//  - player metric UUID (player_week_metrics.id)
//  - external_player_id (string from spreadsheet)
//  - cp_{external_player_id} (ChipPix prefix)
// ══════════════════════════════════════════════════════════════════════

interface AgentLike {
  id: string;
  agent_id: string | null;
}

interface PlayerLike {
  id?: string;
  player_id?: string;
  agent_id?: string | null;
  external_player_id: string | null;
}

export function buildSubclubEntityIds(
  agents: AgentLike[],
  players: PlayerLike[],
): Set<string> {
  const ids = new Set<string>();

  for (const a of agents) {
    ids.add(a.id);
    if (a.agent_id) ids.add(a.agent_id);
  }

  for (const p of players) {
    if (p.id) ids.add(p.id);
    if (p.player_id) ids.add(p.player_id);
    if (p.agent_id) ids.add(p.agent_id);
    if (p.external_player_id) {
      const eid = String(p.external_player_id);
      ids.add(eid);
      ids.add(`cp_${eid}`);
    }
  }

  return ids;
}
