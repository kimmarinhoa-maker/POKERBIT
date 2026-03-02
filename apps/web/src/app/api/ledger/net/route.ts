// ══════════════════════════════════════════════════════════════════════
//  GET /api/ledger/net — Calculate net for an entity in a week
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ledgerService } from '@/lib/services/ledger.service';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const sp = req.nextUrl.searchParams;
      const weekStart = sp.get('week_start');
      const entityId = sp.get('entity_id');

      if (!weekStart || !entityId) {
        return NextResponse.json(
          { success: false, error: 'Query params week_start e entity_id obrigatorios' },
          { status: 400 },
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const data = await ledgerService.calcEntityLedgerNet(ctx.tenantId, weekStart, entityId);

      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
