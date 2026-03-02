// ══════════════════════════════════════════════════════════════════════
//  GET/POST /api/config/payment-methods — Payment Methods CRUD
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('payment_methods')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('sort_order')
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

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { name, is_default, sort_order } = body;

        if (!name || typeof name !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "name" obrigatório' },
            { status: 400 },
          );
        }

        // If setting as default, remove default from others
        if (is_default) {
          await supabaseAdmin
            .from('payment_methods')
            .update({ is_default: false })
            .eq('tenant_id', ctx.tenantId);
        }

        const { data, error } = await supabaseAdmin
          .from('payment_methods')
          .insert({
            tenant_id: ctx.tenantId,
            name: name.trim(),
            is_default: !!is_default,
            sort_order: sort_order ?? 0,
          })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data }, { status: 201 });
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
