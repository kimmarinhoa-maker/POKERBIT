// ══════════════════════════════════════════════════════════════════════
//  GET /api/carry-forward — Read carry-forward balances
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { carryForwardService } from '@/lib/services/carry-forward.service';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const sp = req.nextUrl.searchParams;
      const weekStart = sp.get('week_start');
      const clubId = sp.get('club_id');
      const entityId = sp.get('entity_id') || undefined;

      if (!weekStart || !clubId) {
        return NextResponse.json(
          { success: false, error: 'Query params week_start e club_id obrigatorios' },
          { status: 400 },
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      if (entityId) {
        const amount = await carryForwardService.getCarryForEntity(
          ctx.tenantId,
          clubId,
          weekStart,
          entityId,
        );
        return NextResponse.json({ success: true, data: { entity_id: entityId, amount } });
      } else {
        const map = await carryForwardService.getCarryMap(ctx.tenantId, clubId, weekStart);
        return NextResponse.json({ success: true, data: map });
      }
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
