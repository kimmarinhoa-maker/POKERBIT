// ══════════════════════════════════════════════════════════════════════
//  GET /api/players/rates/current — Current player rakeback rates
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabaseAdmin
        .from('player_rb_rates')
        .select(
          `
          id, rate, effective_from, effective_to,
          players!inner(id, external_id, nickname)
        `,
        )
        .eq('tenant_id', ctx.tenantId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false });

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
