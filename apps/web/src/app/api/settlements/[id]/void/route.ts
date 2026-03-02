// ══════════════════════════════════════════════════════════════════════
//  POST /api/settlements/:id/void — FINAL -> VOID
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage, AppError } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';
import { logAudit } from '@/lib/server/audit';
import { cacheInvalidate } from '@/lib/server/cache';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { reason } = body;

        if (!reason || typeof reason !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "reason" obrigatorio' },
            { status: 400 },
          );
        }

        const data = await settlementService.voidSettlement(
          ctx.tenantId,
          id,
          ctx.userId,
          reason,
        );

        logAudit(req, ctx, 'VOID', 'settlement', id, undefined, { reason });
        // Invalidate cache since status changed
        cacheInvalidate(`settlement:${id}`);

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        const status = err instanceof AppError ? err.statusCode : 500;
        const msg = safeErrorMessage(err);
        return NextResponse.json({ success: false, error: msg }, { status });
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}
