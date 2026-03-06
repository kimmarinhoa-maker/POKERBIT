// ══════════════════════════════════════════════════════════════════════
//  POST /api/imports/preview — Analyze XLSX without persisting
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { supabaseAdmin } from '@/lib/server/supabase';
import { importPreviewService } from '@/lib/services/importPreview.service';

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

        const clubId = fields.club_id || undefined;
        const weekStartOverride = fields.week_start || undefined;
        const platform = fields.platform || 'suprema';
        const pppokerSubclube = fields.pppoker_subclube || undefined;

        const preview = await importPreviewService.preview({
          tenantId: ctx.tenantId,
          clubId,
          fileBuffer: file.buffer,
          fileName: file.originalname,
          weekStartOverride,
          platform,
          pppokerSubclube,
        });

        // Return subclubs filtered by club (parent_id) for binding dropdowns
        let subclubQuery = supabaseAdmin
          .from('organizations')
          .select('id, name')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'SUBCLUB')
          .eq('is_active', true);
        if (clubId) {
          subclubQuery = subclubQuery.eq('parent_id', clubId);
        }
        const { data: subclubs } = await subclubQuery.order('name');

        return NextResponse.json({
          success: true,
          data: {
            ...preview,
            available_subclubs: subclubs || [],
          },
        });
      } catch (err: unknown) {
        console.error('[preview] Import preview error:', err instanceof Error ? err.stack : err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { permissions: ['page:import'] },
  );
}
