// ══════════════════════════════════════════════════════════════════════
//  GET /api/organizations/tree — Hierarchical tree (CLUB → SUBCLUB → AGENT)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      // Enrich AGENT orgs with external_agent_id from player_week_metrics
      const agentOrgs = (orgs || []).filter((o: any) => o.type === 'AGENT' && !o.external_id);
      if (agentOrgs.length > 0) {
        const agentNames = agentOrgs.map((a: any) => a.name);
        const { data: pwmIds } = await supabaseAdmin
          .from('player_week_metrics')
          .select('agent_name, external_agent_id')
          .eq('tenant_id', ctx.tenantId)
          .in('agent_name', agentNames)
          .not('external_agent_id', 'eq', '')
          .limit(1000);

        const nameToExtId = new Map<string, string>();
        for (const row of pwmIds || []) {
          if (row.external_agent_id && !nameToExtId.has(row.agent_name)) {
            nameToExtId.set(row.agent_name, row.external_agent_id);
          }
        }

        for (const org of orgs || []) {
          if ((org as any).type === 'AGENT' && !(org as any).external_id) {
            const extId = nameToExtId.get((org as any).name);
            if (extId) (org as any).external_id = extId;
          }
        }
      }

      // Build tree: CLUB → SUBCLUB → AGENT
      const tree = (orgs || [])
        .filter((o: any) => o.type === 'CLUB')
        .map((club: any) => ({
          ...club,
          subclubes: (orgs || [])
            .filter((o: any) => o.type === 'SUBCLUB' && o.parent_id === club.id)
            .map((sub: any) => ({
              ...sub,
              agents: (orgs || []).filter(
                (o: any) => o.type === 'AGENT' && o.parent_id === sub.id,
              ),
            })),
        }));

      return NextResponse.json({ success: true, data: tree });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
