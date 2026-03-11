// ══════════════════════════════════════════════════════════════════════
//  GET /api/financeiro/agent-settlement?groupId=X&weekStart=Y
//  Returns consolidated agent data across platforms for a given week
//  v2 — batch query + substring match
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const groupId = url.searchParams.get('groupId');
      const weekStart = url.searchParams.get('weekStart');

      if (!groupId || !weekStart) {
        return NextResponse.json(
          { success: false, error: 'groupId e weekStart obrigatorios' },
          { status: 400 },
        );
      }

      // 1. Get group + members
      const { data: group } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .select('id, name, phone')
        .eq('id', groupId)
        .eq('tenant_id', ctx.tenantId)
        .single();

      if (!group) {
        return NextResponse.json({ success: false, error: 'Grupo nao encontrado' }, { status: 404 });
      }

      const { data: members } = await supabaseAdmin
        .from('agent_consolidated_members')
        .select('id, organization_id, organizations(id, name, metadata, parent_id, type)')
        .eq('group_id', groupId)
        .eq('tenant_id', ctx.tenantId);

      if (!members || members.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            group: { ...group, members: [] },
            weekStart,
            weekEnd: computeWeekEnd(weekStart),
            platforms: [],
            total: { winnings: 0, rake: 0, rb_value: 0, resultado: 0 },
          },
        });
      }

      // 2. Load ALL orgs for this tenant to resolve hierarchy
      const { data: allOrgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name, type, parent_id, metadata')
        .eq('tenant_id', ctx.tenantId);

      const orgById = new Map<string, any>();
      for (const o of allOrgs || []) orgById.set(o.id, o);

      // Helper: walk up org tree to find CLUB ancestor
      const findClubAncestor = (orgId: string): any | null => {
        const visited = new Set<string>();
        let current = orgById.get(orgId);
        while (current) {
          if (visited.has(current.id)) break;
          visited.add(current.id);
          if (current.type === 'CLUB') return current;
          if (!current.parent_id) break;
          current = orgById.get(current.parent_id);
        }
        return null;
      };

      const getPlatform = (orgId: string): string => {
        const club = findClubAncestor(orgId);
        return (club?.metadata?.platform || 'outro').toLowerCase();
      };

      const getClubName = (orgId: string): string => {
        const club = findClubAncestor(orgId);
        return club?.name || '';
      };

      // 3. For each member, resolve club_id
      const orgToClubId = new Map<string, string>();
      for (const m of members as any[]) {
        const club = findClubAncestor(m.organization_id);
        if (club) orgToClubId.set(m.organization_id, club.id);
      }

      // 4. Find ALL settlements for this week for this tenant
      const { data: allSettlements } = await supabaseAdmin
        .from('settlements')
        .select('id, club_id, week_start, status')
        .eq('tenant_id', ctx.tenantId)
        .eq('week_start', weekStart)
        .neq('status', 'VOID');

      const clubToSettlement = new Map<string, any>();
      for (const s of allSettlements || []) {
        if (!clubToSettlement.has(s.club_id)) clubToSettlement.set(s.club_id, s);
      }

      // 5. Collect all settlement IDs we need
      const relevantSettlementIds: string[] = [];
      for (const m of members as any[]) {
        const clubId = orgToClubId.get(m.organization_id);
        if (clubId) {
          const s = clubToSettlement.get(clubId);
          if (s && !relevantSettlementIds.includes(s.id)) relevantSettlementIds.push(s.id);
        }
      }

      // 6. Fetch ALL agent_week_metrics + player_week_metrics for these settlements
      let allAgentMetrics: any[] = [];
      let allPlayerMetrics: any[] = [];
      if (relevantSettlementIds.length > 0) {
        const [agentRes, playerRes] = await Promise.all([
          supabaseAdmin
            .from('agent_week_metrics')
            .select('*')
            .in('settlement_id', relevantSettlementIds),
          supabaseAdmin
            .from('player_week_metrics')
            .select('nickname, external_player_id, winnings_brl, agent_name, agent_id, settlement_id')
            .in('settlement_id', relevantSettlementIds)
            .order('nickname', { ascending: true }),
        ]);
        allAgentMetrics = agentRes.data || [];
        allPlayerMetrics = playerRes.data || [];
      }

      // 7. For each member, match metrics by agent_id (UUID) OR agent_name (org name)
      const platforms: any[] = [];

      for (const m of members as any[]) {
        const org = m.organizations;
        if (!org) continue;

        const clubId = orgToClubId.get(m.organization_id);
        if (!clubId) continue;

        const settlement = clubToSettlement.get(clubId);
        if (!settlement) continue;

        // Filter metrics for this settlement
        const settlementMetrics = allAgentMetrics.filter((am) => am.settlement_id === settlement.id);

        // Match: by agent_id (org UUID) first, then by agent_name
        let metrics = settlementMetrics.find((am) => am.agent_id === m.organization_id);
        if (!metrics) {
          metrics = settlementMetrics.find((am) => am.agent_name === org.name);
        }

        // If still no match, also try: agent orgs often have names like "AG AMS - Andre Tak"
        // but agent_week_metrics.agent_name might be just "Andre Tak" or vice versa
        // Try substring match as last resort
        if (!metrics) {
          metrics = settlementMetrics.find(
            (am) =>
              am.agent_name && org.name &&
              (am.agent_name.includes(org.name) || org.name.includes(am.agent_name)),
          );
        }

        if (!metrics) continue;

        const platform = getPlatform(m.organization_id);
        const clubName = getClubName(m.organization_id);

        // Find players for this agent in this settlement
        const agentPlayers = allPlayerMetrics.filter(
          (p) => p.settlement_id === settlement.id &&
            (p.agent_id === m.organization_id || p.agent_name === metrics.agent_name),
        );

        const winnings = Number(metrics.ganhos_total_brl) || 0;
        const rake = Number(metrics.rake_total_brl) || 0;
        const rbRate = Number(metrics.rb_rate) || 0;
        const rbValue = Number(metrics.commission_brl) || 0;
        // Resultado = P/L + RB (what agent nets after commission)
        const resultado = Math.round(((winnings + rbValue) + Number.EPSILON) * 100) / 100;

        platforms.push({
          platform,
          club_name: clubName,
          settlement_id: settlement.id,
          agent_name: metrics.agent_name || org.name,
          winnings,
          rake,
          rb_rate: rbRate,
          rb_value: rbValue,
          resultado,
          players: agentPlayers.map((p: any) => ({
            nickname: p.nickname || '—',
            external_player_id: p.external_player_id || '',
            winnings_brl: Number(p.winnings_brl) || 0,
          })),
        });
      }

      // 8. Compute totals
      const total = {
        winnings: platforms.reduce((s, p) => s + p.winnings, 0),
        rake: platforms.reduce((s, p) => s + p.rake, 0),
        rb_value: platforms.reduce((s, p) => s + p.rb_value, 0),
        resultado: platforms.reduce((s, p) => s + p.resultado, 0),
      };

      // 9. Build member list for response
      const groupMembers = (members as any[]).map((m) => {
        const org = m.organizations || {};
        return {
          id: m.id,
          organization_id: m.organization_id,
          org_name: org.name || '?',
          platform: getPlatform(m.organization_id),
          club_name: getClubName(m.organization_id),
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          group: { ...group, members: groupMembers },
          weekStart,
          weekEnd: computeWeekEnd(weekStart),
          platforms,
          total,
        },
      });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}

function computeWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
