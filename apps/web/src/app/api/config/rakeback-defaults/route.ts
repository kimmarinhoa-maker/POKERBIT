// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/config/rakeback-defaults — RB defaults per subclub
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('rb_defaults')
        .select('*, organizations!inner(name)')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at');

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

export async function PUT(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { defaults } = body;

        if (!defaults || !Array.isArray(defaults)) {
          return NextResponse.json(
            { success: false, error: 'Campo "defaults" (array) obrigatorio' },
            { status: 400 },
          );
        }

        // Build batch and upsert in a single query
        const upsertRows = defaults
          .filter((item: any) => item.subclub_id)
          .map((item: any) => ({
            tenant_id: ctx.tenantId,
            subclub_id: item.subclub_id,
            agent_rb_default: Number(item.agent_rb_default) || 0,
            player_rb_default: Number(item.player_rb_default) || 0,
          }));

        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabaseAdmin
            .from('rb_defaults')
            .upsert(upsertRows, { onConflict: 'tenant_id,subclub_id' });
          if (upsertErr) throw upsertErr;
        }

        // Retornar estado atualizado
        const { data } = await supabaseAdmin
          .from('rb_defaults')
          .select('*, organizations!inner(name)')
          .eq('tenant_id', ctx.tenantId)
          .order('created_at');

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}
