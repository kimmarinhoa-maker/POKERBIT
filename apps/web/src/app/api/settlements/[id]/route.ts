// ══════════════════════════════════════════════════════════════════════
//  GET /api/settlements/:id — Detalhe basico (compatibilidade)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;
      const detail = await settlementService.getSettlementDetail(ctx.tenantId, id);

      if (!detail) {
        return NextResponse.json(
          { success: false, error: 'Settlement nao encontrado' },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: detail });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
