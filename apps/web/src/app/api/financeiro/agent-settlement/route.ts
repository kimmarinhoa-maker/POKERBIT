// ══════════════════════════════════════════════════════════════════════
//  GET /api/financeiro/agent-settlement?groupId=X&weekStart=Y
//  Returns consolidated agent data across platforms for a given week
// ══════════════════════════════════════════════════════════════════════

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
      function findClubAncestor(orgId: string): any | null {
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
      }

      // Helper: get platform from CLUB ancestor
      function getPlatform(orgId: string): string {
        const club = findClubAncestor(orgId);
        return (club?.metadata?.platform || 'outro').toLowerCase();
      }

      // Helper: get club name
      function getClubName(orgId: string): string {
        const club = findClubAncestor(orgId);
        return club?.name || '';
      }

      // 3. For each member, resolve club_id
      const orgToClubId = new Map<string, string>();
      for (const m of members as any[]) {
        const club = findClubAncestor(m.organization_id);
        if (club) orgToClubId.set(m.organization_id, club.id);
      }

      // 4. Find settlements for this week for these clubs
      const clubIds = [...new Set(orgToClubId.values())];
      let settlements: any[] = [];
      if (clubIds.length > 0) {
        const { data: sData } = await supabaseAdmin
          .from('settlements')
          .select('id, club_id, week_start, week_end, status')
          .in('club_id', clubIds)
          .eq('week_start', weekStart)
          .neq('status', 'VOID');

        settlements = sData || [];
      }

      const clubToSettlement = new Map<string, any>();
      for (const s of settlements) clubToSettlement.set(s.club_id, s);

      // 5. For each member, get agent_week_metrics (by agent_id OR agent_name)
      const platforms: any[] = [];

      for (const m of members as any[]) {
        const org = m.organizations;
        if (!org) continue;

        const clubId = orgToClubId.get(m.organization_id);
        if (!clubId) continue;

        const settlement = clubToSettlement.get(clubId);
        if (!settlement) continue;

        // Try by agent_id (org UUID) first
        let { data: metrics } = await supabaseAdmin
          .from('agent_week_metrics')
          .select('*')
          .eq('settlement_id', settlement.id)
          .eq('agent_id', m.organization_id)
          .maybeSingle();

        // Fallback: try by agent_name (org name)
        if (!metrics) {
          const result = await supabaseAdmin
            .from('agent_week_metrics')
            .select('*')
            .eq('settlement_id', settlement.id)
            .eq('agent_name', org.name)
            .maybeSingle();
          metrics = result.data;
        }

        if (!metrics) continue;

        const platform = getPlatform(m.organization_id);
        const clubName = getClubName(m.organization_id);

        platforms.push({
          platform,
          club_name: clubName,
          settlement_id: settlement.id,
          agent_name: org.name,
          winnings: metrics.ganhos_total_brl || 0,
          rake: metrics.rake_total_brl || 0,
          rb_rate: metrics.rb_rate || 0,
          rb_value: metrics.commission_brl || 0,
          resultado: metrics.resultado_brl || 0,
        });
      }

      // 6. Compute totals
      const total = {
        winnings: platforms.reduce((s, p) => s + p.winnings, 0),
        rake: platforms.reduce((s, p) => s + p.rake, 0),
        rb_value: platforms.reduce((s, p) => s + p.rb_value, 0),
        resultado: platforms.reduce((s, p) => s + p.resultado, 0),
      };

      // 7. Build member list for response
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
