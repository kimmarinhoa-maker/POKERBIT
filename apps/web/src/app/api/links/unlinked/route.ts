// ══════════════════════════════════════════════════════════════════════
//  GET /api/links/unlinked — Unlinked players from latest settlement
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const settlementId = req.nextUrl.searchParams.get('settlement_id');

      let settId = settlementId;
      if (!settId) {
        const { data: latestSett } = await supabaseAdmin
          .from('settlements')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestSett) {
          return NextResponse.json({ success: true, data: { unlinked: [], total: 0 } });
        }
        settId = latestSett.id;
      }

      // Players with subclub_name = '?' or NULL
      const { data: unlinkedPlayers, error } = await supabaseAdmin
        .from('player_week_metrics')
        .select('id, player_id, external_player_id, nickname, agent_name, agent_id, subclub_name')
        .eq('tenant_id', ctx.tenantId)
        .eq('settlement_id', settId)
        .or('subclub_name.eq.?,subclub_name.is.null');

      if (error) throw error;

      // Group by agent_name
      const byAgent: Record<string, any[]> = {};
      (unlinkedPlayers || []).forEach((p: any) => {
        const agentKey = p.agent_name || 'SEM AGENTE';
        if (!byAgent[agentKey]) byAgent[agentKey] = [];
        byAgent[agentKey].push({
          id: p.id,
          playerId: p.player_id,
          externalId: p.external_player_id,
          nickname: p.nickname,
          agentName: p.agent_name,
          agentId: p.agent_id,
        });
      });

      // Available subclubs
      const { data: subclubs } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .eq('tenant_id', ctx.tenantId)
        .eq('type', 'SUBCLUB')
        .order('name');

      // Existing links
      const { data: existingAgentLinks } = await supabaseAdmin
        .from('agent_manual_links')
        .select('id, agent_name, subclub_id, organizations!inner(name)')
        .eq('tenant_id', ctx.tenantId);

      const { data: existingPlayerLinks } = await supabaseAdmin
        .from('player_links')
        .select('id, external_player_id, agent_name, subclub_id, organizations!inner(name)')
        .eq('tenant_id', ctx.tenantId);

      return NextResponse.json({
        success: true,
        data: {
          settlementId: settId,
          total: (unlinkedPlayers || []).length,
          byAgent,
          subclubs: subclubs || [],
          existingAgentLinks: existingAgentLinks || [],
          existingPlayerLinks: existingPlayerLinks || [],
        },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
