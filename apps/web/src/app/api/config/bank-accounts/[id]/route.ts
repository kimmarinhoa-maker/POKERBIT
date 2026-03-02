// ══════════════════════════════════════════════════════════════════════
//  PUT/DELETE /api/config/bank-accounts/[id]
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
        const { name, bank_code, agency, account_nr, is_default, is_active } = body;

        if (is_default) {
          await supabaseAdmin
            .from('bank_accounts')
            .update({ is_default: false })
            .eq('tenant_id', ctx.tenantId);
        }

        const update: Record<string, any> = {};
        if (name !== undefined) update.name = name.trim();
        if (bank_code !== undefined) update.bank_code = bank_code || null;
        if (agency !== undefined) update.agency = agency || null;
        if (account_nr !== undefined) update.account_nr = account_nr || null;
        if (is_default !== undefined) update.is_default = is_default;
        if (is_active !== undefined) update.is_active = is_active;

        const { data, error } = await supabaseAdmin
          .from('bank_accounts')
          .update(update)
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Conta não encontrada' },
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
          .from('bank_accounts')
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
