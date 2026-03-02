// ══════════════════════════════════════════════════════════════════════
//  POST /api/ofx/auto-match — Auto-classify OFX transactions
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ofxService } from '@/lib/services/ofx.service';

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

        const suggestions = await ofxService.autoMatch(ctx.tenantId, week_start);
        return NextResponse.json({ success: true, data: suggestions });
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
