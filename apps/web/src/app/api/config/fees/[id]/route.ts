// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/config/fees/[id]
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

        const { error } = await supabaseAdmin
          .from('fee_config')
          .delete()
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        logAudit(req, ctx, 'DELETE', 'fee_config', id, undefined, {});
        return NextResponse.json({ success: true, data: { deleted: true } });
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
