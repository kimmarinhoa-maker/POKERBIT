// ══════════════════════════════════════════════════════════════════════
//  PUT/DELETE /api/config/payment-methods/[id]
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { name, is_default, is_active, sort_order } = body;

        // If setting as default, remove default from others
        if (is_default) {
          await supabaseAdmin
            .from('payment_methods')
            .update({ is_default: false })
            .eq('tenant_id', ctx.tenantId);
        }

        const update: Record<string, any> = {};
        if (name !== undefined) update.name = name.trim();
        if (is_default !== undefined) update.is_default = is_default;
        if (is_active !== undefined) update.is_active = is_active;
        if (sort_order !== undefined) update.sort_order = sort_order;

        const { data, error } = await supabaseAdmin
          .from('payment_methods')
          .update(update)
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Método não encontrado' },
            { status: 404 },
          );
        }
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        const { error } = await supabaseAdmin
          .from('payment_methods')
          .delete()
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        return NextResponse.json({ success: true, data: { deleted: true } });
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
