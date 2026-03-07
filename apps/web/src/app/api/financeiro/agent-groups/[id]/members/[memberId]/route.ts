// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/financeiro/agent-groups/[id]/members/[memberId]
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  return withAuth(req, async (ctx) => {
    try {
      const { id, memberId } = await params;

      const { error } = await supabaseAdmin
        .from('agent_consolidated_members')
        .delete()
        .eq('id', memberId)
        .eq('group_id', id)
        .eq('tenant_id', ctx.tenantId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
