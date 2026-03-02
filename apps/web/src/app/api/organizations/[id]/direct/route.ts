// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/organizations/:id/direct — Toggle direct agency flag
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
        const { is_direct } = body;

        if (typeof is_direct !== 'boolean') {
          return NextResponse.json(
            { success: false, error: 'is_direct deve ser boolean' },
            { status: 400 },
          );
        }

        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type, metadata')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!org) {
          return NextResponse.json(
            { success: false, error: 'Agente nao encontrado' },
            { status: 404 },
          );
        }
        if (org.type !== 'AGENT') {
          return NextResponse.json(
            { success: false, error: 'Apenas agentes podem ser diretos' },
            { status: 400 },
          );
        }

        const newMetadata = { ...(org.metadata || {}), is_direct };

        const { data, error } = await supabaseAdmin
          .from('organizations')
          .update({ metadata: newMetadata })
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
    { roles: ['OWNER', 'ADMIN'] },
  );
}
