import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { chipPixService } from '@/lib/services/chippix.service';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const weekStart = body?.week_start;

        if (!weekStart) {
          return NextResponse.json(
            { success: false, error: 'week_start obrigatorio' },
            { status: 400 },
          );
        }

        const data = await chipPixService.applyLinked(ctx.tenantId, weekStart, ctx.userId);
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
