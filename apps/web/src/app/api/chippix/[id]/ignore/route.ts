import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { chipPixService } from '@/lib/services/chippix.service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const ignore = body?.ignore ?? true;
        const data = await chipPixService.ignoreTransaction(ctx.tenantId, id, ignore);
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
