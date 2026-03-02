// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/ofx/:id/link — Link OFX transaction to entity
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
        const body = await req.json();
        const { entity_id, entity_name, category } = body;

        if (!entity_id || !entity_name) {
          return NextResponse.json(
            { success: false, error: 'entity_id e entity_name obrigatorios' },
            { status: 400 },
          );
        }

        const data = await ofxService.linkTransaction(
          ctx.tenantId,
          id,
          entity_id,
          entity_name,
          category,
        );

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
