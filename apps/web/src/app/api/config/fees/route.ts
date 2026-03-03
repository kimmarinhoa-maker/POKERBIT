// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/config/fees — Taxas do tenant (platform-aware)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const clubId = req.nextUrl.searchParams.get('club_id') || undefined;
      const clubPlatformId = req.nextUrl.searchParams.get('club_platform_id') || undefined;

      let query = supabaseAdmin
        .from('fee_config')
        .select('*')
        .eq('tenant_id', ctx.tenantId);
      if (clubId) query = query.eq('club_id', clubId);

      // Platform scope: if provided, filter by club_platform_id; otherwise show default (null)
      if (clubPlatformId) {
        query = query.eq('club_platform_id', clubPlatformId);
      } else {
        query = query.is('club_platform_id', null);
      }

      const { data, error } = await query.order('name');

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
        const { fees, club_id, club_platform_id } = body;

        if (!fees || !Array.isArray(fees)) {
          return NextResponse.json(
            { success: false, error: 'Campo "fees" (array) obrigatório' },
            { status: 400 },
          );
        }

        if (!club_id) {
          return NextResponse.json(
            { success: false, error: 'Campo "club_id" obrigatório' },
            { status: 400 },
          );
        }

        // Build batch and upsert in a single query
        const upsertRows = fees
          .filter((fee: any) => fee.name && fee.rate !== undefined)
          .map((fee: any) => ({
            tenant_id: ctx.tenantId,
            name: fee.name,
            rate: Number(fee.rate),
            base: fee.base || 'rake',
            is_active: fee.is_active !== false,
            club_id,
            club_platform_id: club_platform_id || null,
          }));

        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabaseAdmin
            .from('fee_config')
            .upsert(upsertRows, { onConflict: 'tenant_id,club_id,name' });
          if (upsertErr) throw upsertErr;
        }

        // Return updated state (filtered by platform scope)
        let returnQuery = supabaseAdmin
          .from('fee_config')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .eq('club_id', club_id);

        if (club_platform_id) {
          returnQuery = returnQuery.eq('club_platform_id', club_platform_id);
        } else {
          returnQuery = returnQuery.is('club_platform_id', null);
        }

        const { data } = await returnQuery.order('name');

        logAudit(req, ctx, 'UPDATE', 'fee_config', ctx.tenantId, undefined, {
          fees: upsertRows,
        });
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:clubs'] },
  );
}
