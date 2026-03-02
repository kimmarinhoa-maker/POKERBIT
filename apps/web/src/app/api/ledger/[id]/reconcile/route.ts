// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/ledger/:id/reconcile — Toggle reconciliation
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ledgerService } from '@/lib/services/ledger.service';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { is_reconciled } = body;

        if (typeof is_reconciled !== 'boolean') {
          return NextResponse.json(
            { success: false, error: 'is_reconciled deve ser boolean' },
            { status: 400 },
          );
        }

        const data = await ledgerService.toggleReconciled(ctx.tenantId, id, is_reconciled);

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:extrato'] },
  );
}
