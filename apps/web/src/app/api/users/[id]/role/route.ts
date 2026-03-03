// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/users/[id]/role — Alterar role de um membro
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { role } = body;

        const validRoles = ['ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];
        if (!role || !validRoles.includes(role)) {
          return NextResponse.json(
            { success: false, error: `Role invalido. Use: ${validRoles.join(', ')}` },
            { status: 400 },
          );
        }

        // Buscar o user_tenant para verificar se e o proprio usuario
        const { data: target, error: findError } = await supabaseAdmin
          .from('user_tenants')
          .select('id, user_id')
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (findError || !target) {
          return NextResponse.json(
            { success: false, error: 'Membro nao encontrado' },
            { status: 404 },
          );
        }

        // Impedir alterar o proprio role
        if (target.user_id === ctx.userId) {
          return NextResponse.json(
            { success: false, error: 'Voce nao pode alterar sua propria funcao' },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('user_tenants')
          .update({ role })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;

        logAudit(req, ctx, 'UPDATE', 'user_tenant', id, undefined, { role });
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
