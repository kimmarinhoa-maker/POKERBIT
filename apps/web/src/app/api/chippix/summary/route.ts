// ══════════════════════════════════════════════════════════════════════
//  GET /api/chippix/summary — Ledger summary for verification
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { chipPixService } from '@/lib/services/chippix.service';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const weekStart = url.searchParams.get('week_start');

      if (!weekStart) {
        return NextResponse.json(
          { success: false, error: 'week_start obrigatorio' },
          { status: 400 },
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const data = await chipPixService.getLedgerSummary(ctx.tenantId, weekStart);
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
