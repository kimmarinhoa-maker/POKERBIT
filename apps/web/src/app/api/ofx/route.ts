// ══════════════════════════════════════════════════════════════════════
//  GET /api/ofx — List OFX bank transactions (paginated)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ofxService } from '@/lib/services/ofx.service';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const weekStart = url.searchParams.get('week_start') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

      if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const { data, total } = await ofxService.listTransactions(
        ctx.tenantId,
        weekStart,
        status,
        page,
        limit,
      );

      return NextResponse.json({
        success: true,
        data,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
