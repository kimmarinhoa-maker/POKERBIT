// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/users/[id] — Remover membro do tenant
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

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

        // Impedir remover a si mesmo
        if (target.user_id === ctx.userId) {
          return NextResponse.json(
            { success: false, error: 'Voce nao pode se remover do tenant' },
            { status: 400 },
          );
        }

        const { error } = await supabaseAdmin
          .from('user_tenants')
          .delete()
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;

        logAudit(req, ctx, 'DELETE', 'user_tenant', id);
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
