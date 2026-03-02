// ══════════════════════════════════════════════════════════════════════
//  GET /api/players — List players (with search, subclub, pagination)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const sp = req.nextUrl.searchParams;
      const search = sp.get('search') || undefined;
      const subclubId = sp.get('subclub_id') || undefined;
      const isDirect = sp.get('is_direct') || undefined;
      const page = Math.max(1, Number(sp.get('page')) || 1);
      const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50));
      const offset = (page - 1) * limit;

      let playerIdFilter: string[] | null = null;

      if (subclubId) {
        const { data: agents } = await supabaseAdmin
          .from('organizations')
          .select('id, name, metadata')
          .eq('tenant_id', ctx.tenantId)
          .eq('parent_id', subclubId)
          .eq('type', 'AGENT')
          .eq('is_active', true);

        let filteredAgents = agents || [];
        const semAgentePattern = /^(sem agente|\(sem agente\)|none)$/i;

        if (isDirect === 'true') {
          filteredAgents = filteredAgents.filter(
            (a: any) => (a.metadata as any)?.is_direct === true || semAgentePattern.test(a.name),
          );
        } else if (isDirect === 'false') {
          filteredAgents = filteredAgents.filter(
            (a: any) => !(a.metadata as any)?.is_direct && !semAgentePattern.test(a.name),
          );
        }

        const agentNames = filteredAgents.map((a: any) => a.name).filter(Boolean);

        if (isDirect === 'true') {
          const semVariants = ['SEM AGENTE', '(sem agente)', 'None', ''];
          for (const v of semVariants) {
            if (!agentNames.includes(v)) agentNames.push(v);
          }
        }

        if (agentNames.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            meta: { total: 0, page, limit, pages: 0 },
          });
        }

        let metricsQuery = supabaseAdmin
          .from('player_week_metrics')
          .select('player_id')
          .eq('tenant_id', ctx.tenantId)
          .in('agent_name', agentNames);

        if (subclubId) {
          metricsQuery = metricsQuery.eq('subclub_id', subclubId);
        }

        const { data: metrics } = await metricsQuery;
        playerIdFilter = [...new Set((metrics || []).map((m: any) => m.player_id).filter(Boolean))];

        if (playerIdFilter.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            meta: { total: 0, page, limit, pages: 0 },
          });
        }
      }

      let query = supabaseAdmin
        .from('players')
        .select('*', { count: 'exact' })
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('nickname', { ascending: true })
        .range(offset, offset + limit - 1);

      if (playerIdFilter) {
        query = query.in('id', playerIdFilter);
      }

      if (search) {
        const escaped = search.replace(/[%_\\]/g, '\\$&').replace(/[,.()[\]]/g, '');
        query = query.or(`nickname.ilike.%${escaped}%,external_id.ilike.%${escaped}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: data || [],
        meta: {
          total: count || 0,
          page,
          limit,
          pages: Math.ceil((count || 0) / limit),
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
