// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/organizations/:id/metadata — Update contact metadata
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: orgId } = await params;
        const body = await req.json();
        const { full_name, phone, email } = body;

        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type, metadata')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!org) {
          return NextResponse.json(
            { success: false, error: 'Organizacao nao encontrada' },
            { status: 404 },
          );
        }

        const meta = { ...(org.metadata || {}) } as Record<string, any>;
        if (full_name !== undefined) meta.full_name = full_name || null;
        if (phone !== undefined) meta.phone = phone || null;
        if (email !== undefined) meta.email = email || null;

        const { data, error } = await supabaseAdmin
          .from('organizations')
          .update({ metadata: meta })
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
  );
}
