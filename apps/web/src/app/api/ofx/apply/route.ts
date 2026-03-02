// ══════════════════════════════════════════════════════════════════════
//  POST /api/ofx/apply — Apply linked OFX transactions -> create ledger
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ofxService } from '@/lib/services/ofx.service';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { week_start } = body;

        if (!week_start) {
          return NextResponse.json(
            { success: false, error: 'week_start obrigatorio' },
            { status: 400 },
          );
        }

        const data = await ofxService.applyLinked(ctx.tenantId, week_start, ctx.userId);
        logAudit(req, ctx, 'CREATE', 'ledger', ctx.tenantId, undefined, {
          source: 'ofx',
          week_start,
        });
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
