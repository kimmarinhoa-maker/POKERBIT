// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/config/adjustments — Lançamentos manuais
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const weekStart = url.searchParams.get('week_start');
      const subclubId = url.searchParams.get('subclub_id');

      if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      let query = supabaseAdmin
        .from('club_adjustments')
        .select('*, organizations!inner(name)')
        .eq('tenant_id', ctx.tenantId);

      if (weekStart) query = query.eq('week_start', weekStart);
      if (subclubId) query = query.eq('subclub_id', subclubId);

      const { data, error } = await query.order('created_at');
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
        const { subclub_id, week_start, overlay, compras, security, outros, obs } = body;

        if (!subclub_id || !week_start) {
          return NextResponse.json(
            { success: false, error: 'Campos "subclub_id" e "week_start" obrigatórios' },
            { status: 400 },
          );
        }

        // Validate subclub_id belongs to tenant
        const { data: org, error: orgErr } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('id', subclub_id)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (orgErr || !org) {
          return NextResponse.json(
            { success: false, error: 'subclub_id nao pertence ao tenant' },
            { status: 403 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('club_adjustments')
          .upsert(
            {
              tenant_id: ctx.tenantId,
              subclub_id,
              week_start,
              overlay: Number(overlay || 0),
              compras: Number(compras || 0),
              security: Number(security || 0),
              outros: Number(outros || 0),
              obs: obs || null,
            },
            { onConflict: 'tenant_id,subclub_id,week_start' },
          )
          .select()
          .single();

        if (error) throw error;

        logAudit(req, ctx, 'UPDATE', 'club_adjustments', subclub_id, undefined, {
          week_start,
          overlay,
          compras,
          security,
          outros,
        });
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['tab:ajustes'] },
  );
}
