// ══════════════════════════════════════════════════════════════════════
//  GET  /api/imports — List imports (paginated)
//  POST /api/imports — [LEGACY] Upload + direct processing
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { supabaseAdmin } from '@/lib/server/supabase';
import { importService } from '@/lib/services/import.service';

// ─── GET /api/imports — Listar importacoes ──────────────────────────
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabaseAdmin
        .from('imports')
        .select('*', { count: 'exact' })
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: data || [],
        meta: { total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

// ─── POST /api/imports — [LEGACY] Upload + processamento direto ─────
export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { file, fields } = await parseFileUpload(req, 'file', {
          maxSize: 10 * 1024 * 1024,
          allowedExtensions: ['xlsx', 'xls'],
        });

        if (!file) {
          return NextResponse.json(
            { success: false, error: 'Arquivo XLSX obrigatorio' },
            { status: 400 },
          );
        }

        const club_id = fields.club_id;
        const week_start = fields.week_start;

        // Validate required fields
        if (
          !club_id ||
          !week_start ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(club_id) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(week_start)
        ) {
          return NextResponse.json(
            {
              success: false,
              error: 'Dados invalidos',
              details: {
                club_id: !club_id ? ['Required'] : [],
                week_start: !week_start ? ['Required'] : [],
              },
            },
            { status: 400 },
          );
        }

        // Validate club belongs to this tenant
        const { data: club } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('id', club_id)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (!club) {
          return NextResponse.json(
            { success: false, error: 'Clube nao encontrado neste tenant' },
            { status: 400 },
          );
        }

        const result = await importService.processImport({
          tenantId: ctx.tenantId,
          clubId: club_id,
          weekStart: week_start,
          fileName: file.originalname,
          fileBuffer: file.buffer,
          uploadedBy: ctx.userId,
        });

        const statusCode = result.status === 'error' ? 422 : 200;

        return NextResponse.json(
          { success: result.status !== 'error', data: result },
          { status: statusCode },
        );
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
