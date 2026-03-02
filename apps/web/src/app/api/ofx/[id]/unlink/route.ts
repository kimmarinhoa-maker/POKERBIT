// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/ofx/:id/unlink — Unlink OFX transaction from entity
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ofxService } from '@/lib/services/ofx.service';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const data = await ofxService.unlinkTransaction(ctx.tenantId, id);
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:conciliacao'] },
  );
}
