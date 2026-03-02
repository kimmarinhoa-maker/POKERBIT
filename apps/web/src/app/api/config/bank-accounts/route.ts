// ══════════════════════════════════════════════════════════════════════
//  GET/POST /api/config/bank-accounts — Bank Accounts CRUD
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('bank_accounts')
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

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { name, bank_code, agency, account_nr, is_default } = body;

        if (!name || typeof name !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "name" obrigatório' },
            { status: 400 },
          );
        }

        if (is_default) {
          await supabaseAdmin
            .from('bank_accounts')
            .update({ is_default: false })
            .eq('tenant_id', ctx.tenantId);
        }

        const { data, error } = await supabaseAdmin
          .from('bank_accounts')
          .insert({
            tenant_id: ctx.tenantId,
            name: name.trim(),
            bank_code: bank_code || null,
            agency: agency || null,
            account_nr: account_nr || null,
            is_default: !!is_default,
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
