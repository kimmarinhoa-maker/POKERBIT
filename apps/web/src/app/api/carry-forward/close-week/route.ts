// ══════════════════════════════════════════════════════════════════════
//  POST /api/carry-forward/close-week — Compute and persist carry-forward
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';
import { carryForwardService } from '@/lib/services/carry-forward.service';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { settlement_id } = body;

        if (!settlement_id) {
          return NextResponse.json(
            { success: false, error: 'settlement_id obrigatorio' },
            { status: 400 },
          );
        }

        const result = await carryForwardService.computeAndPersist(ctx.tenantId, settlement_id);

        logAudit(req, ctx, 'FINALIZE', 'carry_forward', settlement_id, undefined, {
          week_closed: result.week_closed,
          next_week: result.next_week,
          count: result.count,
        });

        return NextResponse.json({ success: true, data: result });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:import'] },
  );
}
