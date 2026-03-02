// ══════════════════════════════════════════════════════════════════════
//  GET /api/players/:id/history — Player weekly metrics history
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  return withAuth(req, async (ctx) => {
    try {
      const { id: playerId } = await params;

      const { data, error } = await supabaseAdmin
        .from('player_week_metrics')
        .select(
          `
          *,
          settlements!inner(week_start, status, club_id,
            organizations!inner(name)
          )
        `,
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(52);

      if (error) throw error;

      return NextResponse.json({ success: true, data: data || [] });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
