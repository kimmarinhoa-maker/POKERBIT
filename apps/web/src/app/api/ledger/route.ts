// ══════════════════════════════════════════════════════════════════════
//  GET  /api/ledger — List ledger entries
//  POST /api/ledger — Create ledger entry
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { ledgerService } from '@/lib/services/ledger.service';

const createEntrySchema = z.object({
  entity_id: z.string().min(1),
  entity_name: z.string().optional(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dir: z.enum(['IN', 'OUT']),
  amount: z.number().positive(),
  method: z.string().optional(),
  description: z.string().optional(),
});

// ─── GET ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const sp = req.nextUrl.searchParams;
      const weekStart = sp.get('week_start');
      const entityId = sp.get('entity_id') || undefined;
      const page = Math.max(1, Number(sp.get('page')) || 1);
      const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 100));

      if (!weekStart) {
        return NextResponse.json(
          { success: false, error: 'Query param week_start obrigatorio' },
          { status: 400 },
        );
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const { data: paged, total } = await ledgerService.listEntries(
        ctx.tenantId,
        weekStart,
        entityId,
        page,
        limit,
      );

      return NextResponse.json({
        success: true,
        data: paged,
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

// ─── POST ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = createEntrySchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const data = await ledgerService.createEntry(ctx.tenantId, parsed.data, ctx.userId);

        return NextResponse.json({ success: true, data }, { status: 201 });
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
