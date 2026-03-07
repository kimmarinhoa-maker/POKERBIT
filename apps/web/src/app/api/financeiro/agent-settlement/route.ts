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
        .select('id, organization_id, organizations(id, name, metadata, parent_id)')
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

      // 2. For each member org, find settlement + agent metrics
      const orgIds = members.map((m: any) => m.organization_id);

      // Find parent club IDs for these agent orgs
      const parentIds = [...new Set(members.map((m: any) => m.organizations?.parent_id).filter(Boolean))];

      // Get parent org names
      const parentMap = new Map<string, string>();
      if (parentIds.length > 0) {
        const { data: parents } = await supabaseAdmin
          .from('organizations')
          .select('id, name')
          .in('id', parentIds);
        for (const p of parents || []) parentMap.set(p.id, p.name);
      }

      // Find the club_id for each agent org (the CLUB ancestor)
      // agent org -> parent (SUBCLUB or CLUB) -> if SUBCLUB, go up one more
      const orgToClubId = new Map<string, string>();
      for (const m of members as any[]) {
        const org = m.organizations;
        if (!org) continue;
        // The agent's parent_id points to the SUBCLUB or CLUB
        // We need the CLUB (top-level) to find the settlement
        if (org.parent_id) {
          // Check if parent is CLUB or SUBCLUB
          const { data: parentOrg } = await supabaseAdmin
            .from('organizations')
            .select('id, type, parent_id')
            .eq('id', org.parent_id)
            .single();

          if (parentOrg) {
            if (parentOrg.type === 'CLUB') {
              orgToClubId.set(m.organization_id, parentOrg.id);
            } else if (parentOrg.parent_id) {
              // SUBCLUB -> parent is CLUB
              orgToClubId.set(m.organization_id, parentOrg.parent_id);
            }
          }
        }
      }

      // 3. Find settlements for this week for these clubs
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

      // 4. For each member, get agent_week_metrics
      const platforms: any[] = [];

      for (const m of members as any[]) {
        const org = m.organizations;
        if (!org) continue;

        const clubId = orgToClubId.get(m.organization_id);
        if (!clubId) continue;

        const settlement = clubToSettlement.get(clubId);
        if (!settlement) continue;

        // Get agent metrics for this agent in this settlement
        const { data: metrics } = await supabaseAdmin
          .from('agent_week_metrics')
          .select('*')
          .eq('settlement_id', settlement.id)
          .eq('agent_id', m.organization_id)
          .maybeSingle();

        if (!metrics) continue;

        const platform = (org.metadata?.platform || 'outro').toLowerCase();
        const clubName = parentMap.get(org.parent_id) || '';

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

      // 5. Compute totals
      const total = {
        winnings: platforms.reduce((s, p) => s + p.winnings, 0),
        rake: platforms.reduce((s, p) => s + p.rake, 0),
        rb_value: platforms.reduce((s, p) => s + p.rb_value, 0),
        resultado: platforms.reduce((s, p) => s + p.resultado, 0),
      };

      // 6. Build member list for response
      const groupMembers = (members as any[]).map((m) => {
        const org = m.organizations || {};
        return {
          id: m.id,
          organization_id: m.organization_id,
          org_name: org.name || '?',
          platform: (org.metadata?.platform || 'outro').toLowerCase(),
          club_name: parentMap.get(org.parent_id) || '',
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
