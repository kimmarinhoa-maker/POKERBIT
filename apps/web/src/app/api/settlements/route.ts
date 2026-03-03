// ══════════════════════════════════════════════════════════════════════
//  GET /api/settlements — Listar semanas
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { settlementService } from '@/lib/services/settlement.service';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const clubId = url.searchParams.get('club_id') || undefined;
      const startDate = url.searchParams.get('start_date') || undefined;
      const endDate = url.searchParams.get('end_date') || undefined;
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));

      // Platform filter: explicit param > header > undefined (all)
      const platformParam = url.searchParams.get('platform_id') || undefined;
      const headerPlatformId = req.headers.get('x-platform-id') || undefined;
      const platformId = platformParam ?? headerPlatformId;

      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if ((startDate && !dateRe.test(startDate)) || (endDate && !dateRe.test(endDate))) {
        return NextResponse.json(
          { success: false, error: 'Formato de data invalido (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      const { data, total } = await settlementService.listWeeks(
        ctx.tenantId,
        clubId,
        startDate,
        endDate,
        page,
        limit,
        platformId,
      );

      // Flatten nested `organizations` join into top-level `club_name`
      // to prevent React #310 (object rendered as child) on the frontend
      const flat = (data || []).map((row: any) => {
        const org = row.organizations;
        return {
          ...row,
          club_name: org?.name || null,
          organizations: undefined,
        };
      });

      return NextResponse.json({
        success: true,
        data: flat,
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
