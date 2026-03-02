// ══════════════════════════════════════════════════════════════════════
//  GET /api/settlements/:id/full — Breakdown por subclube (com cache)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';
import { cacheGet, cacheSet } from '@/lib/server/cache';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: settlementId } = await params;

        // Include RBAC scope in cache key so different roles get correct data
        const scopeHash = (ctx.allowedSubclubIds || []).sort().join(',');
        const cacheKey = `settlement:${settlementId}:${scopeHash}`;

        // Try cache first
        const cached = cacheGet<any>(cacheKey);
        if (cached) {
          return NextResponse.json({ success: true, data: cached });
        }

        const data = await settlementService.getSettlementWithSubclubs(
          ctx.tenantId,
          settlementId,
          ctx.allowedSubclubIds,
        );

        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Settlement nao encontrado' },
            { status: 404 },
          );
        }

        // Cache only finalized settlements (5 min)
        if (data.settlement?.status === 'FINAL') {
          cacheSet(cacheKey, data, 300_000);
        }

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        console.error('[settlement/full]', err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { permissions: ['page:overview'] },
  );
}
