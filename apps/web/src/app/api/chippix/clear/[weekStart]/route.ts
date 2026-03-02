import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { chipPixService } from '@/lib/services/chippix.service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ weekStart: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { weekStart } = await params;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
          return NextResponse.json(
            { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
            { status: 400 },
          );
        }

        const data = await chipPixService.clearWeek(ctx.tenantId, weekStart);
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['tab:conciliacao'] },
  );
}
