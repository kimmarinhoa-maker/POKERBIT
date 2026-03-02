// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/config/fees — Taxas do tenant
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('fee_config')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('name');

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
        const { fees } = body;

        if (!fees || !Array.isArray(fees)) {
          return NextResponse.json(
            { success: false, error: 'Campo "fees" (array) obrigatório' },
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
          }));

        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabaseAdmin
            .from('fee_config')
            .upsert(upsertRows, { onConflict: 'tenant_id,name' });
          if (upsertErr) throw upsertErr;
        }

        // Retornar estado atualizado
        const { data } = await supabaseAdmin
          .from('fee_config')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .order('name');

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
