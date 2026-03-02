// ══════════════════════════════════════════════════════════════════════
//  POST /api/settlements/:id/finalize — DRAFT -> FINAL
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage, AppError } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';
import { logAudit } from '@/lib/server/audit';
import { cacheInvalidate } from '@/lib/server/cache';

const uuidParam = z.string().uuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        const idParsed = uuidParam.safeParse(id);
        if (!idParsed.success) {
          return NextResponse.json(
            { success: false, error: 'ID invalido' },
            { status: 400 },
          );
        }

        const data = await settlementService.finalizeSettlement(
          ctx.tenantId,
          id,
          ctx.userId,
        );

        logAudit(req, ctx, 'FINALIZE', 'settlement', id);
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
